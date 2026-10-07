mod authority;
mod batch;
use crate::{
    keys::{Keys, prefix_end},
    model::{DirectoryState, Record, TenantRecord},
    storage::{Scan, Snapshot, decode, failed, measured},
};
pub use authority::Authority;
use bytes::Bytes;
use dfs_protocol::ObjectRef;
use dfs_protocol::{
    MAX_LIST, MAX_REPLY,
    error::status,
    rpc::{Attr, Entry, ErrorCode, Page},
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
pub struct View {
    pub snapshot: Arc<Snapshot>,
    pub keys: Keys,
    pub grants: Arc<[crate::tree::GrantId]>,
    pub root: ObjectRef,
    pub tree_log_limits: crate::tree_log::Limits,
    authorization_view: dfs_protocol::Revision,
    authority: Option<Arc<Authority>>,
    created: parking_lot::Mutex<HashSet<ObjectRef>>,
}
impl View {
    pub async fn from_snapshot(
        snapshot: Arc<Snapshot>,
        tenant: &str,
        grants: BTreeSet<String>,
    ) -> Result<Self> {
        let keys = Keys::new(tenant)?;
        let grants = crate::grants::resolve(&snapshot, &keys, &grants).await?;
        Self::for_grants(snapshot, tenant, grants.into()).await
    }
    pub async fn for_grants(
        snapshot: Arc<Snapshot>,
        tenant: &str,
        grants: Arc<[crate::tree::GrantId]>,
    ) -> Result<Self> {
        if grants.len() > dfs_protocol::MAX_GRANTS
            || grants.iter().any(|id| id.0 == 0)
            || grants.windows(2).any(|w| w[0] >= w[1])
        {
            return Err(status(ErrorCode::InvalidInput));
        }
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
            tree_log_limits: Default::default(),
            authorization_view: Default::default(),
            authority: None,
            created: Default::default(),
        })
    }
    pub async fn get(&self, key: &[u8]) -> Result<Option<Bytes>> {
        self.snapshot.get(key).await
    }
    pub async fn object(&self, id: &ObjectRef) -> Result<Record> {
        let mut record = self.core(id).await?;
        if record.object.directory {
            let (state, time, version) = tokio::join!(
                self.snapshot.get(self.keys.directory_state(id)?),
                self.snapshot.get(self.keys.directory_time(id)?),
                self.snapshot.get(self.keys.membership_version(id)?),
            );
            let bytes = state?.ok_or_else(|| status(ErrorCode::Unavailable))?;
            let state: DirectoryState = decode(&bytes)?;
            state.apply(&mut record, time?.as_deref(), version?.as_deref())?;
        }
        record.object.read_version = self.snapshot.read_version;
        Ok(record)
    }
    /// @cc [owner:spolu,label:security;concurrency] directory-authority-core
    /// Core reads MUST track existence/parent/attributes but MUST NOT read directory mutable state.
    /// Directory cores have no public revision/mtime/ctime and MUST NOT be returned as RPC metadata;
    /// object MUST assemble complete metadata from the same snapshot before publication to a client.
    pub async fn core(&self, id: &ObjectRef) -> Result<Record> {
        let id = validate::id(id)?;
        let bytes = self.get(&self.keys.object(&id)?).await?;
        self.object_record(&id, bytes)
    }
    fn object_record(&self, id: &ObjectRef, bytes: Option<Bytes>) -> Result<Record> {
        let bytes = bytes.ok_or_else(|| status(ErrorCode::NotFound))?;
        let record: Record = decode(&bytes)?;
        self.check_record(id, record)
    }
    fn check_record(&self, id: &ObjectRef, mut record: Record) -> Result<Record> {
        if record.object.id != *id {
            return Err(status(ErrorCode::Unavailable));
        }
        if record.object.directory {
            if record.revision != [0; 16]
                || !record.object.revision.is_empty()
                || record.object.mtime.is_some()
                || record.object.ctime.is_some()
                || record.object.size != 0
            {
                return Err(status(ErrorCode::Unavailable));
            }
        } else {
            record.object.revision = record.revision.into();
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
    /// @cc [owner:spolu,label:security;concurrency] coherent-child-index
    /// The child's ID, parent, and name
    /// MUST match the index in this coherent view; all consumed reads remain conflict-tracked.
    pub async fn child(&self, parent: &ObjectRef, name: &str) -> Result<Option<Record>> {
        let value = self.get(&self.keys.child(parent, name)?).await?;
        let Some(value) = value else {
            return Ok(None);
        };
        self.child_record(parent, name, &value).await.map(Some)
    }
    /// @cc [owner:spolu,label:concurrency;security] coherent-child-record
    /// The index value MUST come from a tracked point or range read in this view. The returned
    /// record MUST match its ID, parent, and name in the same view, or the operation MUST fail.
    async fn child_record(&self, parent: &ObjectRef, name: &str, value: &[u8]) -> Result<Record> {
        let id = ObjectRef::Object(dfs_protocol::ObjectId::try_from(value).map_err(failed)?);
        let child = self.object(&id).await?;
        if !child
            .parent
            .as_ref()
            .is_some_and(|p| p.id == *parent && p.name == name)
        {
            return Err(status(ErrorCode::Unavailable));
        }
        Ok(child)
    }
    pub async fn attached(&self, id: &ObjectRef) -> Result<bool> {
        stream::iter(self.grants.iter().cloned())
            .map(|grant| async move {
                let present = self
                    .snapshot
                    .get(self.keys.grant(id, grant)?)
                    .await?
                    .is_some();
                Ok::<_, Status>(present)
            })
            .buffer_unordered(16)
            .try_any(|present| async move { present })
            .await
    }
    /// @cc [owner:spolu,label:security;concurrency] fresh-fdb-authority
    /// FDB fallback MUST evaluate the entire parent/grant proof in one conflict-tracked snapshot.
    /// Missing ancestors, cycles and excessive depth MUST fail closed.
    pub async fn authorized(&self, object: &Record) -> Result<bool> {
        if let Some(authority) = &self.authority {
            if self.created.lock().contains(&object.object.id) {
                authority.check()?;
                return Ok(true);
            }
            return authority.decision(object, &self.grants);
        }
        self.authorized_in_fdb(object).await
    }
    async fn authorized_in_fdb(&self, object: &Record) -> Result<bool> {
        let mut current = object.clone();
        let mut visited = HashSet::new();
        loop {
            if (!visited.is_empty() && !current.object.directory)
                || !visited.insert(current.object.id)
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
    pub async fn stat(&self, id: &ObjectRef) -> Result<Record> {
        let object = measured("object", self.object(id)).await?;
        if !measured("authorize", self.authorized(&object)).await? {
            return Err(status(ErrorCode::NotFound));
        }
        Ok(object)
    }
    pub async fn directory(&self, id: &ObjectRef) -> Result<Record> {
        let record = self.stat(id).await?;
        if !record.object.directory {
            return Err(status(ErrorCode::NotDirectory));
        }
        Ok(record)
    }
    pub async fn directory_core(&self, id: &ObjectRef) -> Result<Record> {
        let record = measured("object", self.core(id)).await?;
        if !measured("authorize", self.authorized(&record)).await? {
            return Err(status(ErrorCode::NotFound));
        }
        if !record.object.directory {
            return Err(status(ErrorCode::NotDirectory));
        }
        Ok(record)
    }
    pub fn read_view(&self) -> dfs_protocol::rpc::ReadView {
        dfs_protocol::rpc::ReadView {
            read_version: self.snapshot.read_version,
            authorization_view: self.authorization_view,
        }
    }
    pub async fn extended(&self, record: &Record) -> Result<crate::model::Extended> {
        match self.get(&self.keys.metadata(&record.object.id)?).await? {
            Some(value) => decode(&value),
            None if record.parent.is_none() => Ok(crate::model::Extended::new(true)),
            None => Err(status(ErrorCode::Unavailable)),
        }
    }
    pub async fn metadata(&self, id: &ObjectRef) -> Result<dfs_protocol::rpc::Metadata> {
        let record = self.stat(id).await?;
        let metadata = self.extended(&record).await?;
        Ok(dfs_protocol::rpc::Metadata {
            object: record.object,
            mime_type: metadata.mime_type,
            xattrs: metadata.xattrs,
            view: self.read_view(),
        })
    }
    /// @cc [owner:spolu,label:security;concurrency] authoritative-fallback-listing-proof
    /// FDB fallback MUST bind listing reuse to an authorization epoch read in the same snapshot.
    /// Every namespace or grant mutation MUST increment that epoch atomically. An unidentified
    /// authorization view MUST return no reusable token. Server incarnations MUST fence restarts.
    pub async fn bind_fdb_authority(&mut self, incarnation: dfs_protocol::Revision) -> Result<()> {
        use sha2::{Digest, Sha256};
        let epoch = self.counter(self.keys.authorization_version()).await?;
        let mut digest = Sha256::new();
        digest.update(b"fdb-authority-v5");
        digest.update(incarnation.as_slice());
        digest.update(epoch);
        self.authorization_view = <[u8; 16]>::try_from(&digest.finalize()[..16])
            .map_err(failed)?
            .into();
        Ok(())
    }
    async fn counter(&self, key: Vec<u8>) -> Result<[u8; 8]> {
        self.get(&key)
            .await?
            .map_or(Ok([0; 8]), |v| v.as_ref().try_into().map_err(failed))
    }
    pub async fn listing_token(&self, id: &ObjectRef) -> Result<Vec<u8>> {
        if self.authorization_view.is_empty() {
            return Ok(Vec::new());
        }
        let counter = self.counter(self.keys.listing_version(id)?).await?;
        Ok([counter.as_slice(), self.authorization_view.as_slice()].concat())
    }
    pub async fn session_stat(&self, id: &ObjectRef) -> Result<Attr> {
        if id.is_virtual() {
            return Ok(synthetic(id));
        }
        Ok(self.stat(id).await?.object)
    }
    pub async fn lookup(&self, parent: &ObjectRef, name: &str) -> Result<Attr> {
        validate::name(name)?;
        if *parent == ObjectRef::Root && name == "shared" {
            return Ok(synthetic(&ObjectRef::Shared));
        }
        if *parent == ObjectRef::Shared {
            let (_, suffix) = name
                .rsplit_once("--")
                .ok_or_else(|| status(ErrorCode::NotFound))?;
            let id = suffix
                .parse::<ObjectRef>()
                .map_err(|_| status(ErrorCode::NotFound))?;
            let record = self.object(&id).await?;
            if !self.shared_root(&record).await? || shared_name(&record)? != name {
                return Err(status(ErrorCode::NotFound));
            }
            return Ok(record.object);
        }
        if *parent == ObjectRef::Root {
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
    /// Real-directory pages MUST include a token covering child attributes and current authority.
    /// Virtual root/shared projections MUST return no token, since they are not physical listings.
    pub async fn list(
        &self,
        directory: &ObjectRef,
        after: Option<&str>,
        limit: u32,
    ) -> Result<Page> {
        if !(1..=MAX_LIST).contains(&limit) {
            return Err(status(ErrorCode::InvalidInput));
        }
        if *directory == ObjectRef::Shared {
            return self.shared_list(after, limit as usize).await;
        }
        if let Some(after) = after {
            validate::name(after)?;
        }
        let is_root = *directory == ObjectRef::Root;
        let parent = if is_root {
            self.object(&self.root).await?
        } else {
            self.directory(directory).await?
        };
        let listing_token = if is_root {
            Vec::new()
        } else {
            self.listing_token(&parent.object.id).await?
        };
        let inherited = !is_root || self.authorized(&parent).await?;
        let prefix = self.keys.children(&parent.object.id)?;
        let scan = self.scan(prefix.clone(), after.map(str::as_bytes)).await?;
        let parent_id = &parent.object.id;
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
                    object: Some(synthetic(&ObjectRef::Shared)),
                });
                bytes += 256;
                synthetic_pending = false;
                if entries.len() > limit as usize || bytes > MAX_REPLY - 128 {
                    entries.pop();
                    return Ok(Page {
                        view: self.read_view(),
                        listing_token: listing_token.clone(),
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
            if entries.len() > limit as usize || bytes > MAX_REPLY - 128 {
                entries.pop();
                return Ok(Page {
                    view: self.read_view(),
                    listing_token: listing_token.clone(),
                    next_after: entries.last().map(|e| e.name.clone()),
                    entries,
                });
            }
        }
        if synthetic_pending {
            entries.push(Entry {
                name: "shared".into(),
                object: Some(synthetic(&ObjectRef::Shared)),
            });
        }
        if entries.len() > limit as usize {
            entries.truncate(limit as usize);
            return Ok(Page {
                view: self.read_view(),
                listing_token: listing_token.clone(),
                next_after: entries.last().map(|e| e.name.clone()),
                entries,
            });
        }
        Ok(Page {
            view: self.read_view(),
            listing_token: listing_token.clone(),
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
        let after = after
            .map(str::parse::<ObjectRef>)
            .transpose()
            .map_err(failed)?;
        let suffix = after
            .as_ref()
            .map(|id| id.real().map(|id| *id.as_bytes()))
            .transpose()
            .map_err(failed)?;
        let mut iterators: Vec<_> = stream::iter(self.grants.to_vec())
            .map(|grant| async move {
                self.scan(
                    self.keys.granted(grant),
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
        let mut last: Option<ObjectRef> = None;
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
                if bytes + size > MAX_REPLY - 128 {
                    return Ok(Page {
                        view: self.read_view(),
                        listing_token: Vec::new(),
                        entries,
                        next_after: last.map(|id| id.to_string()),
                    });
                }
                bytes += size;
                entries.push(entry);
            }
            last = Some(id);
            examined += 1;
            if entries.len() == limit || examined >= limit.max(64) {
                return Ok(Page {
                    view: self.read_view(),
                    listing_token: Vec::new(),
                    entries,
                    next_after: last.map(|id| id.to_string()),
                });
            }
        }
        Ok(Page {
            view: self.read_view(),
            listing_token: Vec::new(),
            entries,
            next_after: None,
        })
    }
}
fn suffix_id(key: &[u8]) -> Result<ObjectRef> {
    let bytes = key
        .get(key.len().saturating_sub(16)..)
        .ok_or_else(|| status(ErrorCode::Unavailable))?;
    Ok(dfs_protocol::ObjectId::try_from(bytes)
        .map_err(failed)?
        .into())
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
pub fn entry_size(entry: &Entry) -> usize {
    use prost::Message;
    entry.encoded_len() + 8
}
fn synthetic(id: &ObjectRef) -> Attr {
    Attr {
        id: id.into(),
        directory: true,
        mode: 0o555,
        atime: Some(Default::default()),
        mtime: Some(Default::default()),
        ctime: Some(Default::default()),
        ..Default::default()
    }
}
