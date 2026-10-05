use crate::{
    keys::Keys,
    model::{self, Parent, Record},
    read::View,
    storage::{Snapshot, WriteBatch, encode, failed, measured},
};
use dfs_protocol::{BLOCK_SIZE, MAX_GRANTS, MAX_IO, error::status, rpc::*, validate};
use futures::{StreamExt, TryStreamExt, stream};
use std::collections::{BTreeMap, BTreeSet};
use tonic::Status;

type Result<T> = std::result::Result<T, Status>;
const MAX_BATCH_BYTES: usize = 8 * 1024 * 1024;
const MAX_BATCH_KEYS: usize = 65_536;

pub(crate) struct CreateCandidate {
    object: Result<Object>,
    collision: Result<bool>,
}

pub(crate) struct ReadAhead {
    index: u64,
    block: Result<Vec<u8>>,
}

/// @cc [owner:spolu,label:concurrency;security] speculative-content-read
/// Read at most one requested block in the caller's transaction. Its data/errors MUST only be
/// consumed after live authorization, type, version, and size checks establish that it is needed.
pub(crate) async fn prefetch_read(
    snapshot: &Snapshot,
    workspace: &str,
    request: &ReadRequest,
) -> Option<ReadAhead> {
    if request.length == 0 || request.length as usize > MAX_IO {
        return None;
    }
    let id = validate::id(&request.object_id).ok()?;
    let keys = Keys::new(workspace).ok()?;
    let index = request.offset / BLOCK_SIZE as u64;
    Some(ReadAhead {
        index,
        block: read_block(snapshot, &keys, &id, index).await,
    })
}

async fn read_block(snapshot: &Snapshot, keys: &Keys, id: &str, index: u64) -> Result<Vec<u8>> {
    let value = measured("block_read", snapshot.get(keys.block(id, index)?)).await?;
    if value.as_ref().is_some_and(|v| v.len() > BLOCK_SIZE) {
        return Err(status(ErrorCode::Unavailable));
    }
    Ok(value.map_or_else(Vec::new, |v| v.to_vec()))
}

pub(crate) struct Edit {
    pub batch: WriteBatch,
    bytes: usize,
    keys: usize,
}
impl Edit {
    pub fn new() -> Self {
        Self {
            batch: WriteBatch::new(),
            bytes: 0,
            keys: 0,
        }
    }
    fn reserve(&mut self, bytes: usize) -> Result<()> {
        self.bytes = self.bytes.saturating_add(bytes);
        self.keys += 1;
        if self.bytes > MAX_BATCH_BYTES || self.keys > MAX_BATCH_KEYS {
            return Err(status(ErrorCode::Capacity));
        }
        Ok(())
    }
    pub fn put(&mut self, key: Vec<u8>, value: Vec<u8>) -> Result<()> {
        self.reserve(key.len() + value.len() + 64)?;
        self.batch.put(key, value);
        Ok(())
    }
    pub(crate) fn delete(&mut self, key: Vec<u8>) -> Result<()> {
        self.reserve(key.len() + 64)?;
        self.batch.delete(key);
        Ok(())
    }
    pub(crate) fn clear(&mut self, start: Vec<u8>, end: Vec<u8>) -> Result<()> {
        self.reserve(start.len() + end.len() + 64)?;
        self.batch.clear(start, end);
        Ok(())
    }
    pub fn record(&mut self, keys: &Keys, record: &Record) -> Result<()> {
        self.put(keys.object(&record.object.id)?, encode(record)?)?;
        if !record.object.directory {
            self.search_pending(keys, &record.object.id, Some(record.object.version))?;
        }
        Ok(())
    }
    /// @cc [owner:spolu,label:backend] coalesced-file-work
    /// Each changed file MUST replace its pending token inside this same atomic edit. Deletion MUST
    /// enqueue a tombstone, including rename replacement. Directory edits MUST NOT fan out.
    pub fn search_pending(&mut self, keys: &Keys, id: &str, version: Option<u64>) -> Result<()> {
        let pending = crate::search::queue::Pending::new(version)?;
        self.put(keys.pending_file(id)?, encode(&pending)?)
    }
    pub fn grant(&mut self, keys: &Keys, id: &str, grant: &str, attached: bool) -> Result<()> {
        let forward = keys.grant(id, grant)?;
        let reverse = keys.granted_object(grant, id)?;
        if attached {
            self.put(forward, vec![1])?;
            self.put(reverse, vec![1])?;
        } else {
            self.delete(forward)?;
            self.delete(reverse)?;
        }
        Ok(())
    }
}

#[derive(Clone)]
pub(crate) enum Change {
    Create(CreateRequest),
    Update(UpdateRequest),
    Rename(RenameRequest),
    Remove(RemoveRequest),
    Write(WriteRequest),
}
impl Change {
    /// @cc [owner:spolu,label:concurrency;security] speculative-create-collision
    /// Generate and check one candidate in this attempt's committing transaction. Candidate and
    /// collision errors MUST remain deferred until the original create preconditions pass.
    pub async fn prefetch(&self, snapshot: &Snapshot, workspace: &str) -> Option<CreateCandidate> {
        let Self::Create(request) = self else {
            return None;
        };
        let object = model::new_object(request.directory, request.mode);
        let collision = measured("collision", async {
            let object = object.as_ref().map_err(Clone::clone)?;
            Ok(snapshot
                .get(Keys::new(workspace)?.object(&object.id)?)
                .await?
                .is_some())
        })
        .await;
        Some(CreateCandidate { object, collision })
    }
    pub fn child_name(&self) -> Option<&str> {
        match self {
            Self::Create(r) => Some(&r.name),
            _ => None,
        }
    }
    pub fn primary_id(&self) -> &str {
        match self {
            Self::Create(r) => &r.parent_id,
            Self::Update(r) => &r.object_id,
            Self::Rename(r) => &r.object_id,
            Self::Remove(r) => &r.object_id,
            Self::Write(r) => &r.object_id,
        }
    }
    pub fn name(&self) -> &'static str {
        match self {
            Self::Create(_) => "create",
            Self::Update(_) => "update",
            Self::Rename(_) => "rename",
            Self::Remove(_) => "remove",
            Self::Write(_) => "write",
        }
    }
    /// @cc [owner:spolu,label:concurrency] declared-mutation-participants
    /// Lock the primary object and declared namespace participants in ID order. The committing
    /// transaction MUST verify every actual participant is declared, including a replacement.
    /// A changed or incomplete set MUST fail, never mutate an unlocked pending file.
    pub fn lock_ids(&self) -> Result<BTreeSet<String>> {
        if matches!(self, Self::Update(_) | Self::Write(_)) {
            return Ok(BTreeSet::from([validate::id(self.primary_id())?]));
        }
        let expected = match self {
            Self::Rename(r) => r.expected.as_slice(),
            Self::Remove(r) => r.expected.as_slice(),
            _ => &[],
        };
        if expected.len() > 4 {
            return Err(status(ErrorCode::InvalidInput));
        }
        let mut ids = BTreeSet::new();
        if let Ok(id) = validate::id(self.primary_id()) {
            ids.insert(id);
        }
        ids.extend(expected.iter().filter_map(|e| validate::id(&e.id).ok()));
        Ok(ids)
    }
    /// @cc [owner:spolu,label:concurrency] create-candidate-scope
    /// Create MUST receive the candidate prefetched for this request and this view's transaction.
    /// Every retry MUST generate and check its own candidate; results MUST NOT cross transactions.
    pub async fn prepare(
        self,
        view: &View,
        candidate: Option<CreateCandidate>,
    ) -> Result<(Edit, Mutation)> {
        match self {
            Self::Create(r) => {
                view.create(r, candidate.ok_or_else(|| status(ErrorCode::Internal))?)
                    .await
            }
            Self::Update(r) => view.update(r).await,
            Self::Rename(r) => view.rename(r).await,
            Self::Remove(r) => view.remove(r).await,
            Self::Write(r) => view.write(r).await,
        }
    }
}
impl View {
    /// @cc [owner:spolu,label:concurrency;security] parallel-create-preconditions
    /// Concurrent reads MUST share the committing transaction and retain conflict tracking.
    /// Consume errors in the existing order: parent authority/version, existing child, attributes,
    /// then UUID collision. Speculative child/collision reads MUST NOT expose unauthorized state.
    pub async fn create(
        &self,
        request: CreateRequest,
        candidate: CreateCandidate,
    ) -> Result<(Edit, Mutation)> {
        validate::name(&request.name)?;
        let parent_id = validate::id(&request.parent_id)?;
        let CreateCandidate { object, collision } = candidate;
        let (parent, child) = tokio::join!(
            self.directory(&parent_id),
            measured("child", self.child(&parent_id, &request.name)),
        );
        let mut parent = parent?;
        model::check(&parent.object, request.expected_parent_version)?;
        if child?.is_some() {
            return Err(status(ErrorCode::AlreadyExists));
        }
        let mut object = object?;
        if let Some(mime) = request.mime_type {
            object.mime_type = mime;
        }
        object.xattrs = request.xattrs;
        validate::attributes(&object.mime_type, &object.xattrs, object.mode)?;
        // UUID collisions never replace an existing object, even in the astronomically unlikely case.
        if collision? {
            return Err(status(ErrorCode::AlreadyExists));
        }
        let child = Record {
            object,
            parent: Some(Parent {
                id: parent.object.id.clone(),
                name: request.name.clone(),
            }),
        };
        parent.object = model::bumped(parent.object, true, self.snapshot.version().await?)?;
        let mut edit = Edit::new();
        edit.record(&self.keys, &parent)?;
        edit.record(&self.keys, &child)?;
        edit.put(
            self.keys.child(&parent.object.id, &request.name)?,
            raw_id(&child.object.id)?,
        )?;
        Ok((
            edit,
            Mutation {
                object: Some(child.object),
                related: vec![parent.object],
            },
        ))
    }
    /// @cc [owner:spolu,label:concurrency;security] content-prefetch-scope
    /// Any read-ahead result MUST belong to this request's object/offset and this view's transaction.
    /// Consume its bytes/errors only when live authorization, version, and size checks require them.
    pub async fn read(
        &self,
        request: ReadRequest,
        read_ahead: Option<ReadAhead>,
    ) -> Result<ReadResponse> {
        if request.length as usize > MAX_IO {
            return Err(status(ErrorCode::InvalidInput));
        }
        let record = self.stat(&request.object_id).await?;
        let object = record.object;
        if object.directory {
            return Err(status(ErrorCode::IsDirectory));
        }
        if let Some(version) = request.version {
            model::check(&object, version)?;
        }
        let length =
            u64::from(request.length).min(object.size.saturating_sub(request.offset)) as usize;
        let mut data = vec![0; length];
        if length > 0 {
            let end = request.offset + length as u64;
            let id = &object.id;
            let blocks: Vec<_> =
                stream::iter(request.offset / BLOCK_SIZE as u64..end.div_ceil(BLOCK_SIZE as u64))
                    .map(|index| {
                        let read_ahead = &read_ahead;
                        async move {
                            let block = match read_ahead {
                                Some(ahead) if ahead.index == index => ahead.block.clone()?,
                                _ => self.block(id, index).await?,
                            };
                            Ok::<_, Status>((index, block))
                        }
                    })
                    .buffered(16)
                    .try_collect()
                    .await?;
            for (index, block) in blocks {
                let start = index * BLOCK_SIZE as u64;
                let from = request.offset.max(start);
                let to = end.min(start + block.len() as u64);
                if from < to {
                    data[(from - request.offset) as usize..(to - request.offset) as usize]
                        .copy_from_slice(&block[(from - start) as usize..(to - start) as usize]);
                }
            }
        }
        Ok(ReadResponse {
            data,
            version: object.version,
            size: object.size,
        })
    }
    async fn block(&self, id: &str, index: u64) -> Result<Vec<u8>> {
        read_block(&self.snapshot, &self.keys, id, index).await
    }
    pub async fn write(&self, request: WriteRequest) -> Result<(Edit, Mutation)> {
        if request.data.len() > MAX_IO {
            return Err(status(ErrorCode::InvalidInput));
        }
        let mut record = self.stat(&request.object_id).await?;
        if record.object.directory {
            return Err(status(ErrorCode::IsDirectory));
        }
        model::check(&record.object, request.expected_version)?;
        let offset = if request.append {
            record.object.size
        } else {
            request.offset
        };
        let end = offset
            .checked_add(request.data.len() as u64)
            .filter(|end| *end <= i64::MAX as u64)
            .ok_or_else(|| status(ErrorCode::InvalidInput))?;
        let mut edit = Edit::new();
        if request.data.is_empty() {
            return Ok((
                edit,
                Mutation {
                    object: Some(record.object),
                    related: vec![],
                },
            ));
        }
        let patches: Vec<_> =
            stream::iter(offset / BLOCK_SIZE as u64..end.div_ceil(BLOCK_SIZE as u64))
                .map(|index| self.patch(&record.object, index, offset, &request.data))
                .buffered(16)
                .try_collect()
                .await?;
        for (index, block) in patches {
            edit.put(self.keys.block(&record.object.id, index)?, block)?;
        }
        record.object = crate::patch::write(
            record.object,
            &request,
            model::now()?,
            self.snapshot.version().await?,
        )?;
        edit.record(&self.keys, &record)?;
        Ok((
            edit,
            Mutation {
                object: Some(record.object),
                related: vec![],
            },
        ))
    }
    /// @cc [owner:spolu,label:concurrency;backend] preserve-unwritten-block-bytes
    /// Omit an old-block read only when the transaction's live object size proves the block is
    /// beyond EOF, or the patch replaces all existing logical bytes in that block. Partial patches
    /// MUST preserve other bytes and zero-fill holes. The object read MUST remain conflict-tracked
    /// so concurrent writes/truncation cannot invalidate that proof before commit.
    async fn patch(
        &self,
        object: &Object,
        index: u64,
        offset: u64,
        data: &[u8],
    ) -> Result<(u64, Vec<u8>)> {
        let start = index * BLOCK_SIZE as u64;
        let from = offset.max(start);
        let to = (offset + data.len() as u64).min(start + BLOCK_SIZE as u64);
        let existing_end = object.size.min(start + BLOCK_SIZE as u64);
        let mut block = if start >= object.size || (from == start && to >= existing_end) {
            Vec::new()
        } else {
            self.block(&object.id, index).await?
        };
        block.resize(block.len().max((to - start) as usize), 0);
        block[(from - start) as usize..(to - start) as usize]
            .copy_from_slice(&data[(from - offset) as usize..(to - offset) as usize]);
        Ok((index, block))
    }
    pub async fn update(&self, request: UpdateRequest) -> Result<(Edit, Mutation)> {
        let mut record = self.stat(&request.object_id).await?;
        model::check(&record.object, request.expected_version)?;
        if request.xattrs.len() > 1024 {
            return Err(status(ErrorCode::InvalidInput));
        }
        let mut edit = Edit::new();
        if let Some(size) = request.size {
            if record.object.directory {
                return Err(status(ErrorCode::IsDirectory));
            }
            if size > i64::MAX as u64 {
                return Err(status(ErrorCode::InvalidInput));
            }
            if size < record.object.size {
                let first_removed = size.div_ceil(BLOCK_SIZE as u64);
                let prefix = self.keys.data(&record.object.id)?;
                edit.clear(
                    self.keys.block(&record.object.id, first_removed)?,
                    crate::keys::prefix_end(&prefix),
                )?;
                let tail = size % BLOCK_SIZE as u64;
                if tail > 0 {
                    let index = size / BLOCK_SIZE as u64;
                    let mut block = self.block(&record.object.id, index).await?;
                    if block.len() > tail as usize {
                        block.truncate(tail as usize);
                        edit.put(self.keys.block(&record.object.id, index)?, block)?;
                    }
                }
            }
            record.object.size = size;
        }
        record.object = crate::patch::update(
            record.object,
            &request,
            model::now()?,
            self.snapshot.version().await?,
        )?;
        edit.record(&self.keys, &record)?;
        Ok((
            edit,
            Mutation {
                object: Some(record.object),
                related: vec![],
            },
        ))
    }
    async fn empty_directory(&self, record: &Record) -> Result<()> {
        if record.object.directory
            && !self
                .rows(self.keys.children(&record.object.id)?, None, 1)
                .await?
                .is_empty()
        {
            return Err(status(ErrorCode::NotEmpty));
        }
        Ok(())
    }
    async fn erase(&self, record: &Record) -> Result<Edit> {
        self.empty_directory(record).await?;
        let mut edit = Edit::new();
        edit.delete(self.keys.object(&record.object.id)?)?;
        if !record.object.directory {
            edit.search_pending(&self.keys, &record.object.id, None)?;
        }
        let parent = record
            .parent
            .as_ref()
            .ok_or_else(|| status(ErrorCode::Forbidden))?;
        edit.delete(self.keys.child(&parent.id, &parent.name)?)?;
        let prefix = self.keys.grants(&record.object.id)?;
        let mut scan = self.scan(prefix.clone(), None).await?;
        while let Some(row) = scan.next().await.map_err(failed)? {
            let grant = std::str::from_utf8(&row.key[prefix.len()..]).map_err(failed)?;
            edit.grant(&self.keys, &record.object.id, grant, false)?;
        }
        let data = self.keys.data(&record.object.id)?;
        edit.clear(data.clone(), crate::keys::prefix_end(&data))?;
        Ok(edit)
    }
    pub async fn remove(&self, request: RemoveRequest) -> Result<(Edit, Mutation)> {
        let record = self.stat(&request.object_id).await?;
        let link = record
            .parent
            .as_ref()
            .ok_or_else(|| status(ErrorCode::Forbidden))?;
        let mut parent = self.directory(&link.id).await?;
        model::expected(&[&record.object, &parent.object], &request.expected)?;
        if request.directory != record.object.directory {
            return Err(status(if record.object.directory {
                ErrorCode::IsDirectory
            } else {
                ErrorCode::NotDirectory
            }));
        }
        let mut edit = self.erase(&record).await?;
        parent.object = model::bumped(parent.object, true, self.snapshot.version().await?)?;
        edit.record(&self.keys, &parent)?;
        Ok((
            edit,
            Mutation {
                object: None,
                related: vec![parent.object],
            },
        ))
    }
    pub async fn rename(&self, request: RenameRequest) -> Result<(Edit, Mutation)> {
        validate::name(&request.name)?;
        let mut record = self.stat(&request.object_id).await?;
        let old = record
            .parent
            .clone()
            .ok_or_else(|| status(ErrorCode::Forbidden))?;
        let source_parent = self.directory(&old.id).await?;
        let destination_parent = self.directory(&request.parent_id).await?;
        let replacement = self
            .child(&destination_parent.object.id, &request.name)
            .await?;
        let mut changed = vec![
            &record.object,
            &source_parent.object,
            &destination_parent.object,
        ];
        if let Some(replacement) = &replacement {
            changed.push(&replacement.object);
        }
        model::expected(&changed, &request.expected)?;
        if replacement
            .as_ref()
            .is_some_and(|r| r.object.id == record.object.id)
        {
            return Ok((
                Edit::new(),
                Mutation {
                    object: Some(record.object),
                    related: vec![],
                },
            ));
        }
        if let Some(replacement) = &replacement {
            if !request.replace {
                return Err(status(ErrorCode::AlreadyExists));
            }
            if record.object.directory != replacement.object.directory {
                return Err(status(if replacement.object.directory {
                    ErrorCode::IsDirectory
                } else {
                    ErrorCode::NotDirectory
                }));
            }
        }
        let mut ancestor = destination_parent.clone();
        let mut seen = BTreeSet::new();
        loop {
            if ancestor.object.id == record.object.id {
                return Err(status(ErrorCode::InvalidInput));
            }
            if !seen.insert(ancestor.object.id.clone()) || seen.len() > 4096 {
                return Err(status(ErrorCode::Unavailable));
            }
            match ancestor.parent {
                Some(parent) => ancestor = self.object(&parent.id).await?,
                None => break,
            }
        }
        let mut edit = match &replacement {
            Some(replacement) => self.erase(replacement).await?,
            None => Edit::new(),
        };
        edit.delete(self.keys.child(&old.id, &old.name)?)?;
        edit.put(
            self.keys
                .child(&destination_parent.object.id, &request.name)?,
            raw_id(&record.object.id)?,
        )?;
        record.parent = Some(Parent {
            id: destination_parent.object.id.clone(),
            name: request.name,
        });
        record.object = model::bumped(record.object, false, self.snapshot.version().await?)?;
        edit.record(&self.keys, &record)?;
        let parents = BTreeMap::from([
            (source_parent.object.id.clone(), source_parent),
            (destination_parent.object.id.clone(), destination_parent),
        ]);
        let mut related = Vec::new();
        for (_, mut parent) in parents {
            parent.object = model::bumped(parent.object, true, self.snapshot.version().await?)?;
            edit.record(&self.keys, &parent)?;
            related.push(parent.object);
        }
        Ok((
            edit,
            Mutation {
                object: Some(record.object),
                related,
            },
        ))
    }
    pub async fn update_grants(&self, request: UpdateGrantsRequest) -> Result<(Edit, Object)> {
        if request.changes.len() > MAX_GRANTS {
            return Err(status(ErrorCode::InvalidInput));
        }
        let mut record = self.object(&request.object_id).await?;
        model::check(&record.object, request.expected_version)?;
        let mut changes = BTreeSet::new();
        let mut edit = Edit::new();
        for change in request.changes {
            validate::grant(&change.grant)?;
            if !changes.insert(change.grant.clone()) {
                return Err(status(ErrorCode::InvalidInput));
            }
            edit.grant(
                &self.keys,
                &record.object.id,
                &change.grant,
                change.attached,
            )?;
        }
        record.object = model::bumped(record.object, false, self.snapshot.version().await?)?;
        edit.record(&self.keys, &record)?;
        Ok((edit, record.object))
    }
}
fn raw_id(id: &str) -> Result<Vec<u8>> {
    Ok(uuid::Uuid::parse_str(id)
        .map_err(failed)?
        .as_bytes()
        .to_vec())
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::{
        ancestry::Ancestry,
        model::WorkspaceRecord,
        storage::{Storage, StorageConfig},
    };
    use anyhow::Context;
    use dfs_protocol::error::code;
    use std::sync::Arc;

    pub(crate) async fn unused_block_errors_do_not_override_read_checks() -> anyhow::Result<()> {
        let storage = Storage::open(&StorageConfig {
            fdb_cluster_file: std::env::var("DFS_FDB_CLUSTER_FILE")?,
            fdb_prefix: format!("dfs-v2-read-ahead-{}", uuid::Uuid::new_v4().simple()),
        })
        .await?;
        let keys = Keys::new("test")?;
        let root = Record {
            object: model::new_object(true, 0o755)?,
            parent: None,
        };
        let mut file = Record {
            object: model::new_object(false, 0o600)?,
            parent: Some(Parent {
                id: root.object.id.clone(),
                name: "file".into(),
            }),
        };
        file.object.size = 1;
        storage
            .transact(|_| async {
                let mut edit = Edit::new();
                edit.put(
                    keys.workspace(),
                    encode(&WorkspaceRecord {
                        root: root.object.id.clone(),
                        key_hash: [0; 32],
                    })?,
                )?;
                edit.record(&keys, &root)?;
                edit.record(&keys, &file)?;
                edit.grant(&keys, &root.object.id, "owner", true)?;
                // Valid FDB values but invalid DFS blocks exercise deferred content errors.
                for id in [&root.object.id, &file.object.id] {
                    edit.put(keys.block(id, 0)?, vec![0; BLOCK_SIZE + 1])?;
                }
                Ok((edit.batch, ()))
            })
            .await?;
        for (authorized, object, offset, length, version, expected) in [
            (false, &file.object, 0, 1, 1, Some(ErrorCode::NotFound)),
            (true, &root.object, 0, 1, 1, Some(ErrorCode::IsDirectory)),
            (
                true,
                &file.object,
                0,
                1,
                2,
                Some(ErrorCode::VersionConflict),
            ),
            (true, &file.object, 0, 1, 1, Some(ErrorCode::Unavailable)),
            (true, &file.object, 0, 0, 1, None),
            (true, &file.object, 1, 1, 1, None),
            (true, &file.object, u64::MAX, 1, 1, None),
        ] {
            let request = ReadRequest {
                object_id: format!("dfs://name--{}", object.id),
                offset,
                length,
                version: Some(version),
            };
            let grants = if authorized {
                BTreeSet::from(["owner".into()])
            } else {
                BTreeSet::new()
            };
            let snapshot = storage.snapshot().await?;
            let (view, ahead) = tokio::join!(
                View::prefetch(
                    snapshot.clone(),
                    "test",
                    grants,
                    &request.object_id,
                    None,
                    Arc::new(Ancestry::default()),
                ),
                prefetch_read(&snapshot, "test", &request),
            );
            let result = view?.read(request, ahead).await;
            match expected {
                Some(expected) => {
                    assert_eq!(code(&result.err().context("read accepted")?), expected)
                }
                None => assert!(result?.data.is_empty()),
            }
        }
        storage
            .transact(|_| async {
                let mut batch = WriteBatch::new();
                batch.clear(Vec::new(), vec![255]);
                Ok((batch, ()))
            })
            .await?;
        Ok(())
    }
}
