use crate::{
    ancestry::{Ancestry, WINDOW},
    keys::{Keys, prefix_end},
    model::{Record, WorkspaceRecord},
    storage::{Scan, Snapshot, Storage, decode, failed, measured},
};
use bytes::Bytes;
use dfs_protocol::{
    MAX_IO,
    error::status,
    rpc::{Entry, ErrorCode, Object, Page},
    validate,
};
use futures::{StreamExt, TryStreamExt, stream};
use std::{
    cmp::Reverse,
    collections::{BTreeSet, BinaryHeap, HashSet},
    ops::Bound,
    sync::Arc,
};
use tonic::Status;

type Result<T> = std::result::Result<T, Status>;
pub(crate) struct View {
    pub snapshot: Arc<Snapshot>,
    pub keys: Keys,
    pub grants: BTreeSet<String>,
    pub root: String,
    ancestry: Option<Arc<Ancestry>>,
    prefetched: Option<(String, Result<Option<Bytes>>)>,
}
impl View {
    pub async fn new(storage: &Storage, workspace: &str, grants: BTreeSet<String>) -> Result<Self> {
        let snapshot = storage.snapshot().await?;
        Self::from_snapshot(snapshot, workspace, grants).await
    }
    pub async fn from_snapshot(
        snapshot: Arc<Snapshot>,
        workspace: &str,
        grants: BTreeSet<String>,
    ) -> Result<Self> {
        let keys = Keys::new(workspace)?;
        let data = snapshot
            .get(keys.workspace())
            .await
            .map_err(failed)?
            .ok_or_else(|| status(ErrorCode::NotFound))?;
        let workspace: WorkspaceRecord = decode(&data)?;
        Ok(Self {
            snapshot,
            keys,
            grants,
            root: workspace.root,
            ancestry: None,
            prefetched: None,
        })
    }
    /// @cc [owner:spolu,label:concurrency;security] transaction-local-prefetch
    /// Prefetch at most one primary object alongside the live workspace record. Both reads MUST
    /// use this same conflict-tracked transaction. Consume workspace errors first and defer object
    /// errors until the operation requests that object, preserving validation/authorization order.
    /// The prefetched result MUST NOT escape this view or be reused in another transaction.
    pub async fn prefetch(
        snapshot: Arc<Snapshot>,
        workspace: &str,
        grants: BTreeSet<String>,
        object_id: &str,
    ) -> Result<Self> {
        let (view, prefetched) = tokio::join!(
            Self::from_snapshot(snapshot.clone(), workspace, grants),
            async {
                let keys = Keys::new(workspace).ok()?;
                let id = validate::id(object_id).ok()?;
                let key = keys.object(&id).ok()?;
                Some((id, measured("prefetch_object", snapshot.get(key)).await))
            }
        );
        let mut view = view?;
        view.prefetched = prefetched;
        Ok(view)
    }
    pub fn with_ancestry(mut self, ancestry: Arc<Ancestry>) -> Self {
        self.ancestry = Some(ancestry);
        self
    }
    pub async fn get(&self, key: &[u8]) -> Result<Option<Bytes>> {
        self.snapshot.get(key).await.map_err(failed)
    }
    pub async fn object(&self, id: &str) -> Result<Record> {
        let id = validate::id(id)?;
        let bytes = match &self.prefetched {
            Some((prefetched_id, value)) if prefetched_id == &id => value.clone()?,
            _ => self.get(&self.keys.object(&id)?).await?,
        }
        .ok_or_else(|| status(ErrorCode::NotFound))?;
        let record: Record = decode(&bytes)?;
        if record.object.id != id {
            return Err(status(ErrorCode::Unavailable));
        }
        if record.object.directory
            && let (Some(hints), Some(parent)) = (&self.ancestry, &record.parent)
        {
            hints.remember(&self.keys, &id, &parent.id).await;
        }
        Ok(record)
    }
    pub async fn scan(&self, prefix: Vec<u8>, after: Option<&[u8]>) -> Result<Scan> {
        let end = prefix_end(&prefix);
        let start = match after {
            Some(after) => {
                let mut key = prefix;
                key.extend_from_slice(after);
                Bound::Excluded(key)
            }
            None => Bound::Included(prefix),
        };
        self.snapshot
            .scan((start, Bound::Excluded(end)))
            .await
            .map_err(failed)
    }
    pub async fn rows(
        &self,
        prefix: Vec<u8>,
        after: Option<&[u8]>,
        limit: usize,
    ) -> Result<Vec<(Bytes, Bytes)>> {
        let mut scan = self.scan(prefix, after).await?;
        let mut rows = Vec::new();
        while rows.len() < limit {
            match scan.next().await.map_err(failed)? {
                Some(row) => rows.push((row.key, row.value)),
                None => break,
            }
        }
        Ok(rows)
    }
    pub async fn child(&self, parent: &str, name: &str) -> Result<Option<Record>> {
        let Some(value) = self.get(&self.keys.child(parent, name)?).await? else {
            return Ok(None);
        };
        let id = uuid::Uuid::from_slice(&value)
            .map_err(failed)?
            .simple()
            .to_string();
        let child = self.object(&id).await?;
        if !child
            .parent
            .as_ref()
            .is_some_and(|p| p.id == parent && p.name == name)
        {
            return Err(status(ErrorCode::Unavailable));
        }
        Ok(Some(child))
    }
    pub(crate) async fn attached(&self, id: &str) -> Result<bool> {
        stream::iter(self.grants.clone())
            .map(|grant| async move {
                Ok::<_, Status>(self.get(&self.keys.grant(id, &grant)?).await?.is_some())
            })
            .buffer_unordered(16)
            .try_any(|present| async move { present })
            .await
    }
    /// @cc [owner:spolu,label:security;concurrency] validate-hinted-ancestry
    /// Hints MUST only schedule reads. Follow parent IDs from live records in this transaction and
    /// ignore speculative results outside that chain, including their errors. Only a live grant on
    /// the verified chain may authorize. Moves/revocations MUST remain conflict-tracked for writes.
    /// Missing/stale hints MUST fall back to the actual chain without changing authorization.
    pub async fn authorized(&self, object: &Record) -> Result<bool> {
        let mut current = object.clone();
        let mut visited = HashSet::new();
        loop {
            let mut expected = current.object.id.clone();
            let mut nodes = vec![(expected.clone(), Some(current.clone()))];
            if let (Some(hints), Some(parent)) = (&self.ancestry, &current.parent) {
                nodes.extend(
                    hints
                        .chain(&self.keys, &parent.id)
                        .await
                        .into_iter()
                        .map(|id| (id, None)),
                );
            }
            let mut reads = stream::iter(nodes)
                .map(|(id, known)| async move {
                    let (record, allowed) = tokio::join!(
                        async {
                            match known {
                                Some(record) => Ok(record),
                                None => self.object(&id).await,
                            }
                        },
                        self.attached(&id),
                    );
                    (id, record, allowed)
                })
                .buffered(WINDOW);
            while let Some((id, record, allowed)) = reads.next().await {
                if id != expected {
                    break;
                }
                let record = record?;
                if (!visited.is_empty() && !record.object.directory)
                    || !visited.insert(id)
                    || visited.len() > 4096
                {
                    return Err(status(ErrorCode::Unavailable));
                }
                if allowed? {
                    return Ok(true);
                }
                let Some(parent) = record.parent else {
                    return Ok(false);
                };
                expected = parent.id;
            }
            drop(reads);
            current = self.object(&expected).await?;
        }
    }
    pub async fn stat(&self, id: &str) -> Result<Record> {
        let object = measured("object", self.object(id)).await?;
        if !measured("authorize", self.authorized(&object)).await? {
            return Err(status(ErrorCode::NotFound));
        }
        Ok(object)
    }
    pub async fn directory(&self, id: &str) -> Result<Record> {
        let record = self.stat(id).await?;
        if !record.object.directory {
            return Err(status(ErrorCode::NotDirectory));
        }
        Ok(record)
    }
    pub async fn session_stat(&self, id: &str) -> Result<Object> {
        if matches!(id, "root" | "shared") {
            return Ok(synthetic(id));
        }
        Ok(self.stat(id).await?.object)
    }
    pub async fn lookup(&self, parent: &str, name: &str) -> Result<Object> {
        validate::name(name)?;
        if parent == "root" && name == "shared" {
            return Ok(synthetic("shared"));
        }
        if parent == "shared" {
            let (_, suffix) = name
                .rsplit_once("--")
                .ok_or_else(|| status(ErrorCode::NotFound))?;
            let id = validate::id(suffix).map_err(|_| status(ErrorCode::NotFound))?;
            let record = self.object(&id).await?;
            if !self.shared_root(&record).await? || shared_name(&record)? != name {
                return Err(status(ErrorCode::NotFound));
            }
            return Ok(record.object);
        }
        if parent == "root" {
            let child = self
                .child(&self.root, name)
                .await?
                .ok_or_else(|| status(ErrorCode::NotFound))?;
            if !self.authorized(&child).await? {
                return Err(status(ErrorCode::NotFound));
            }
            return Ok(child.object);
        }
        let parent = validate::id(parent)?;
        let (directory, child) = tokio::join!(self.directory(&parent), self.child(&parent, name));
        // Parent errors take precedence; speculative child results never establish access.
        directory?;
        let child = child?.ok_or_else(|| status(ErrorCode::NotFound))?;
        Ok(child.object)
    }
    pub async fn list(&self, directory: &str, after: Option<&str>, limit: u32) -> Result<Page> {
        if !(1..=1000).contains(&limit) {
            return Err(status(ErrorCode::InvalidInput));
        }
        if directory == "shared" {
            return self.shared_list(after, limit as usize).await;
        }
        if let Some(after) = after {
            validate::name(after)?;
        }
        let is_root = directory == "root";
        let parent = if is_root {
            self.object(&self.root).await?
        } else {
            self.directory(directory).await?
        };
        let inherited = !is_root || self.authorized(&parent).await?;
        let prefix = self.keys.children(&parent.object.id)?;
        let mut scan = self.scan(prefix.clone(), after.map(str::as_bytes)).await?;
        let mut entries = Vec::new();
        let mut bytes = 0;
        let mut synthetic_pending = is_root && after.is_none_or(|a| a < "shared");
        while let Some(row) = scan.next().await.map_err(failed)? {
            let name = String::from_utf8(row.key[prefix.len()..].to_vec()).map_err(failed)?;
            if synthetic_pending && name.as_str() >= "shared" {
                entries.push(Entry {
                    name: "shared".into(),
                    object: Some(synthetic("shared")),
                });
                bytes += 256;
                synthetic_pending = false;
            }
            if is_root && name == "shared" {
                continue;
            }
            let child = self
                .child(&parent.object.id, &name)
                .await?
                .ok_or_else(|| status(ErrorCode::Unavailable))?;
            if !inherited && !self.authorized(&child).await? {
                continue;
            }
            let entry = Entry {
                name,
                object: Some(child.object),
            };
            bytes += entry_size(&entry);
            entries.push(entry);
            if entries.len() > limit as usize || bytes > MAX_IO {
                entries.pop();
                return Ok(Page {
                    next_after: entries.last().map(|e| e.name.clone()),
                    entries,
                });
            }
        }
        if synthetic_pending {
            entries.push(Entry {
                name: "shared".into(),
                object: Some(synthetic("shared")),
            });
        }
        if entries.len() > limit as usize {
            entries.truncate(limit as usize);
            return Ok(Page {
                next_after: entries.last().map(|e| e.name.clone()),
                entries,
            });
        }
        Ok(Page {
            entries,
            next_after: None,
        })
    }
    /// @cc [owner:spolu,label:security;performance] shared-direct-grants
    /// Shared eligibility MUST retain directly granted objects even when their ancestors are visible.
    /// Only the reserved physical shared entry may use inherited access without a direct grant.
    async fn shared_root(&self, record: &Record) -> Result<bool> {
        if record.object.id == self.root {
            return Ok(false);
        }
        let parent = record
            .parent
            .as_ref()
            .ok_or_else(|| status(ErrorCode::Unavailable))?;
        if parent.id == self.root && parent.name == "shared" {
            return self.authorized(record).await;
        }
        self.attached(&record.object.id).await
    }
    /// @cc [owner:spolu,label:security;performance] bounded-grant-merge
    /// Shared discovery MUST merge ordered grant indexes with bounded iterator buffers, deduplicate
    /// before pagination, and return only authorized IDs as cursors. Empty filtered pages may continue.
    async fn shared_list(&self, after: Option<&str>, limit: usize) -> Result<Page> {
        let after = after.map(validate::id).transpose()?;
        let suffix = after
            .as_ref()
            .map(|id| uuid::Uuid::parse_str(id).map(|id| id.into_bytes()))
            .transpose()
            .map_err(failed)?;
        let mut iterators: Vec<_> = stream::iter(self.grants.clone())
            .map(|grant| async move {
                self.scan(
                    self.keys.granted(&grant)?,
                    suffix.as_ref().map(|v| v.as_slice()),
                )
                .await
            })
            .buffered(16)
            .try_collect()
            .await?;
        let mut heap = BinaryHeap::new();
        for (index, iterator) in iterators.iter_mut().enumerate() {
            if let Some(row) = iterator.next().await.map_err(failed)? {
                heap.push(Reverse((suffix_id(&row.key)?, index)));
            }
        }
        if let Some(special) = self.child(&self.root, "shared").await?
            && after.as_ref().is_none_or(|a| special.object.id > *a)
            && self.authorized(&special).await?
        {
            heap.push(Reverse((special.object.id, usize::MAX)));
        }
        let mut entries = Vec::new();
        let mut last: Option<String> = None;
        let mut examined = 0;
        let mut bytes = 0;
        while let Some(Reverse((id, index))) = heap.pop() {
            if index != usize::MAX
                && let Some(row) = iterators[index].next().await.map_err(failed)?
            {
                heap.push(Reverse((suffix_id(&row.key)?, index)));
            }
            if last.as_ref() == Some(&id) {
                continue;
            }
            let record = self.object(&id).await?;
            // Grant-index membership already proves direct access in this transaction.
            if record.object.id != self.root {
                let entry = Entry {
                    name: shared_name(&record)?,
                    object: Some(record.object),
                };
                let size = entry_size(&entry);
                if bytes + size > MAX_IO {
                    return Ok(Page {
                        entries,
                        next_after: last,
                    });
                }
                bytes += size;
                entries.push(entry);
            }
            last = Some(id);
            examined += 1;
            if entries.len() == limit || examined >= limit.max(64) {
                return Ok(Page {
                    entries,
                    next_after: last,
                });
            }
        }
        Ok(Page {
            entries,
            next_after: None,
        })
    }
}
fn suffix_id(key: &[u8]) -> Result<String> {
    let bytes = key
        .get(key.len().saturating_sub(16)..)
        .ok_or_else(|| status(ErrorCode::Unavailable))?;
    Ok(uuid::Uuid::from_slice(bytes)
        .map_err(failed)?
        .simple()
        .to_string())
}
fn shared_name(record: &Record) -> Result<String> {
    let name = &record
        .parent
        .as_ref()
        .ok_or_else(|| status(ErrorCode::Unavailable))?
        .name;
    let mut end = name.len().min(221);
    while !name.is_char_boundary(end) {
        end -= 1;
    }
    Ok(format!("{}--{}", &name[..end], record.object.id))
}
fn entry_size(entry: &Entry) -> usize {
    entry.name.len()
        + entry.object.as_ref().map_or(0, |o| {
            o.mime_type.len()
                + o.xattrs
                    .iter()
                    .map(|(k, v)| k.len() + v.len() + 16)
                    .sum::<usize>()
        })
        + 256
}
fn synthetic(id: &str) -> Object {
    Object {
        id: id.into(),
        directory: true,
        version: 1,
        mode: 0o555,
        mime_type: "inode/directory".into(),
        atime: Some(Default::default()),
        mtime: Some(Default::default()),
        ctime: Some(Default::default()),
        ..Default::default()
    }
}
