use crate::{
    ancestry::{Ancestry, WINDOW},
    keys::{Keys, prefix_end},
    model::{Record, TenantRecord},
    profile::{Guard, Phase},
    storage::{Scan, Snapshot, decode, failed, measured},
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
}
impl View {
    pub async fn from_snapshot(
        snapshot: Arc<Snapshot>,
        tenant: &str,
        grants: BTreeSet<String>,
    ) -> Result<Self> {
        let keys = Keys::new(tenant)?;
        let data = snapshot
            .get(keys.tenant())
            .await?
            .ok_or_else(|| status(ErrorCode::NotFound))?;
        let tenant: TenantRecord = decode(&data)?;
        Ok(Self {
            snapshot,
            keys,
            grants,
            root: tenant.root,
            ancestry: None,
        })
    }
    /// @cc [owner:spolu,label:concurrency;security] transaction-local-prefetch
    /// Hints MUST only warm the pinned snapshot. Off-chain results MUST NOT establish authority,
    /// contribute publication dependencies, or propagate errors. Semantic reads MUST consume and
    /// validate the actual chain within this same coherent view.
    /// A resident primary object MAY skip hint construction; this MUST NOT skip semantic reads.
    pub async fn prefetch(
        snapshot: Arc<Snapshot>,
        tenant: &str,
        grants: BTreeSet<String>,
        object_id: &str,
        child_name: Option<&str>,
        ancestry: Arc<Ancestry>,
    ) -> Result<Self> {
        let keys = Keys::new(tenant)?;
        let _profile = Guard::new(Phase::Prefetch);
        let primary = validate::id_ref(object_id).ok();
        if let Some(id) = primary
            && snapshot.hot(&keys.object(id)?)
        {
            let mut view = Self::from_snapshot(snapshot, tenant, grants).await?;
            view.ancestry = Some(ancestry);
            return Ok(view);
        }
        let warm = async {
            let mut keys_to_warm = Vec::new();
            if let Some(id) = &primary {
                for node in ancestry.chain(&keys, id) {
                    keys_to_warm.push(keys.object(&node)?);
                    for grant in &grants {
                        keys_to_warm.push(keys.grant(&node, grant)?);
                    }
                }
                if let Some(name) = child_name.filter(|name| validate::name(name).is_ok()) {
                    keys_to_warm.push(keys.child(id, name)?);
                    if let Some(child) = ancestry.child(&keys, id, name) {
                        keys_to_warm.push(keys.object(&child)?);
                    }
                }
            }
            stream::iter(keys_to_warm)
                .map(|key| {
                    let snapshot = &snapshot;
                    async move {
                        let _ = snapshot.peek(key).await;
                    }
                })
                .buffer_unordered(WINDOW)
                .collect::<Vec<_>>()
                .await;
            Ok::<_, Status>(())
        };
        let (view, _) = tokio::join!(
            Self::from_snapshot(snapshot.clone(), tenant, grants.clone()),
            warm
        );
        let mut view = view?;
        view.ancestry = Some(ancestry);
        Ok(view)
    }
    pub async fn get(&self, key: &[u8]) -> Result<Option<Bytes>> {
        self.snapshot.get(key).await
    }
    pub async fn object(&self, id: &str) -> Result<Record> {
        let id = validate::id(id)?;
        let bytes = self.get(&self.keys.object(&id)?).await?;
        self.object_record(&id, bytes)
    }
    fn object_record(&self, id: &str, bytes: Option<Bytes>) -> Result<Record> {
        let bytes = bytes.ok_or_else(|| status(ErrorCode::NotFound))?;
        let record: Record = decode(&bytes)?;
        self.check_record(id, record)
    }
    fn check_record(&self, id: &str, mut record: Record) -> Result<Record> {
        if record.object.id != id {
            return Err(status(ErrorCode::Unavailable));
        }
        record.object.revision = record.revision.to_vec();
        if let (Some(hints), Some(parent)) = (&self.ancestry, &record.parent) {
            hints.remember(&self.keys, id, &parent.id);
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
        self.snapshot.scan((start, Bound::Excluded(end))).await
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
            match scan.next().await? {
                Some(row) => rows.push((row.key, row.value)),
                None => break,
            }
        }
        Ok(rows)
    }
    /// @cc [owner:spolu,label:security;concurrency] validate-hinted-child
    /// A name hint MUST NOT establish existence or authority. The child's ID, parent, and name
    /// MUST match the index in this coherent view; all consumed reads remain conflict-tracked.
    pub async fn child(&self, parent: &str, name: &str) -> Result<Option<Record>> {
        let value = self.get(&self.keys.child(parent, name)?).await?;
        let Some(value) = value else {
            return Ok(None);
        };
        self.child_record(parent, name, &value).await.map(Some)
    }
    /// @cc [owner:spolu,label:concurrency;security] coherent-child-record
    /// The index value MUST come from a tracked point or range read in this view. The returned
    /// record MUST match its ID, parent, and name in the same view, or the operation MUST fail.
    async fn child_record(&self, parent: &str, name: &str, value: &[u8]) -> Result<Record> {
        let id = uuid::Uuid::from_slice(value)
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
        if let Some(hints) = &self.ancestry {
            hints.remember_child(&self.keys, parent, name, &id);
        }
        Ok(child)
    }
    pub(crate) async fn attached(&self, id: &str) -> Result<bool> {
        Self::read_attached(&self.snapshot, &self.keys, &self.grants, id).await
    }
    async fn read_attached(
        snapshot: &Snapshot,
        keys: &Keys,
        grants: &BTreeSet<String>,
        id: &str,
    ) -> Result<bool> {
        if let Some(grant) = grants.first().filter(|_| grants.len() == 1) {
            return Ok(snapshot.get(keys.grant(id, grant)?).await?.is_some());
        }
        stream::iter(grants.iter().cloned())
            .map(|grant| async move {
                Ok::<_, Status>(snapshot.get(keys.grant(id, &grant)?).await?.is_some())
            })
            .buffer_unordered(16)
            .try_any(|present| async move { present })
            .await
    }
    /// @cc [owner:spolu,label:security;concurrency] validate-hinted-ancestry
    /// Authorization MUST follow parent links and grants in one coherent view. Publication MUST
    /// validate the consumed links and memberships, including moves/revocations.
    pub async fn authorized(&self, object: &Record) -> Result<bool> {
        let mut current = object.clone();
        let mut visited = HashSet::new();
        loop {
            if (!visited.is_empty() && !current.object.directory)
                || !visited.insert(current.object.id.clone())
                || visited.len() > 4096
            {
                return Err(status(ErrorCode::Unavailable));
            }
            if self.attached(&current.object.id).await? {
                return Ok(true);
            }
            let Some(parent) = current.parent else {
                return Ok(false);
            };
            let record = self
                .snapshot
                .ancestry(self.keys.object(&parent.id)?)
                .await?
                .ok_or_else(|| status(ErrorCode::NotFound))?;
            current = self.check_record(&parent.id, record)?;
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
    /// @cc [owner:spolu,label:performance;concurrency;security] ordered-listing-reads
    /// Child reads MUST have bounded concurrency within this view. Child results and errors MUST be
    /// consumed in index order; pagination MUST return only authorized entries and cursors.
    pub async fn list(&self, directory: &str, after: Option<&str>, limit: u32) -> Result<Page> {
        if !(1..=64).contains(&limit) {
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
        let scan = self.scan(prefix.clone(), after.map(str::as_bytes)).await?;
        let parent_id = parent.object.id.as_str();
        let prefix_len = prefix.len();
        let children = stream::try_unfold(scan, |mut scan| async move {
            Ok::<_, Status>(scan.next().await?.map(|row| (row, scan)))
        })
        .map_ok(|row| async move {
            let name = String::from_utf8(row.key[prefix_len..].to_vec()).map_err(failed)?;
            let child = if is_root && name == "shared" {
                None
            } else {
                Some(self.child_record(parent_id, &name, &row.value).await?)
            };
            Ok::<_, Status>((name, child))
        })
        .try_buffered(16);
        futures::pin_mut!(children);
        let mut entries = Vec::new();
        let mut bytes = 0;
        let mut synthetic_pending = is_root && after.is_none_or(|a| a < "shared");
        while let Some((name, child)) = children.try_next().await? {
            if synthetic_pending && name.as_str() >= "shared" {
                entries.push(Entry {
                    name: "shared".into(),
                    object: Some(synthetic("shared")),
                });
                bytes += 256;
                synthetic_pending = false;
                if entries.len() > limit as usize || bytes > MAX_IO {
                    entries.pop();
                    return Ok(Page {
                        next_after: entries.last().map(|e| e.name.clone()),
                        entries,
                    });
                }
            }
            let Some(child) = child else {
                continue;
            };
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
            if let Some(row) = iterator.next().await? {
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
                && let Some(row) = iterators[index].next().await?
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
pub(crate) fn entry_size(entry: &Entry) -> usize {
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
        mode: 0o555,
        mime_type: "inode/directory".into(),
        atime: Some(Default::default()),
        mtime: Some(Default::default()),
        ctime: Some(Default::default()),
        ..Default::default()
    }
}
