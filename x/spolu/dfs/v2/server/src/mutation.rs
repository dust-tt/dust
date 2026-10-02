use crate::{
    keys::Keys,
    model::{self, Parent, Record},
    read::View,
    storage::{WriteBatch, encode, failed, measured},
};
use dfs_protocol::{BLOCK_SIZE, MAX_GRANTS, MAX_IO, error::status, rpc::*, validate};
use futures::{StreamExt, TryStreamExt, stream};
use std::collections::{BTreeMap, BTreeSet};
use tonic::Status;

type Result<T> = std::result::Result<T, Status>;
const MAX_BATCH_BYTES: usize = 8 * 1024 * 1024;
const MAX_BATCH_KEYS: usize = 65_536;

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
    pub fn file(&self) -> Result<Option<String>> {
        match self {
            Self::Update(r) => Ok(Some(validate::id(&r.object_id)?)),
            Self::Write(r) => Ok(Some(validate::id(&r.object_id)?)),
            _ => Ok(None),
        }
    }
    pub async fn prepare(self, view: &View) -> Result<(Edit, Mutation)> {
        match self {
            Self::Create(r) => view.create(r).await,
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
    pub async fn create(&self, request: CreateRequest) -> Result<(Edit, Mutation)> {
        validate::name(&request.name)?;
        let parent_id = validate::id(&request.parent_id)?;
        let object = model::new_object(request.directory, request.mode);
        let (parent, child, collision) = tokio::join!(
            self.directory(&parent_id),
            measured("child", self.child(&parent_id, &request.name)),
            measured("collision", async {
                let object = object.as_ref().map_err(Clone::clone)?;
                self.get(&self.keys.object(&object.id)?).await
            }),
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
        if collision?.is_some() {
            return Err(status(ErrorCode::AlreadyExists));
        }
        let child = Record {
            object,
            parent: Some(Parent {
                id: parent.object.id.clone(),
                name: request.name.clone(),
            }),
        };
        parent.object = model::bumped(parent.object, true)?;
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
    pub async fn read(&self, request: ReadRequest) -> Result<ReadResponse> {
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
            let blocks: Vec<_> = stream::iter(
                request.offset / BLOCK_SIZE as u64..end.div_ceil(BLOCK_SIZE as u64),
            )
            .map(|index| async move { Ok::<_, Status>((index, self.block(id, index).await?)) })
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
        let value = measured("block_read", self.get(&self.keys.block(id, index)?)).await?;
        if value.as_ref().is_some_and(|v| v.len() > BLOCK_SIZE) {
            return Err(status(ErrorCode::Unavailable));
        }
        Ok(value.map_or_else(Vec::new, |v| v.to_vec()))
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
        record.object.size = record.object.size.max(end);
        record.object = model::bumped(record.object, true)?;
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
        record.object = model::bumped(record.object, request.size.is_some())?;
        if let Some(mime) = request.mime_type {
            record.object.mime_type = mime;
        }
        if let Some(mode) = request.mode {
            record.object.mode = mode;
        }
        if let Some(atime) = request.atime {
            validate::timestamp(&atime)?;
            record.object.atime = Some(atime);
        }
        if let Some(mtime) = request.mtime {
            validate::timestamp(&mtime)?;
            record.object.mtime = Some(mtime);
        }
        let mut changed = BTreeSet::new();
        for change in request.xattrs {
            if change.name.is_empty()
                || change.name.len() > 255
                || change.name.contains('\0')
                || !changed.insert(change.name.clone())
            {
                return Err(status(ErrorCode::InvalidInput));
            }
            match change.value {
                Some(value) => {
                    record.object.xattrs.insert(change.name, value);
                }
                None => {
                    record.object.xattrs.remove(&change.name);
                }
            }
        }
        validate::attributes(
            &record.object.mime_type,
            &record.object.xattrs,
            record.object.mode,
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
        parent.object = model::bumped(parent.object, true)?;
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
        record.object = model::bumped(record.object, false)?;
        edit.record(&self.keys, &record)?;
        let parents = BTreeMap::from([
            (source_parent.object.id.clone(), source_parent),
            (destination_parent.object.id.clone(), destination_parent),
        ]);
        let mut related = Vec::new();
        for (_, mut parent) in parents {
            parent.object = model::bumped(parent.object, true)?;
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
        record.object = model::bumped(record.object, false)?;
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
