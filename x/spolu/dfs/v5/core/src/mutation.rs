use crate::{
    keys::Keys,
    model::{self, DirectoryState, Parent, Record},
    read::View,
    storage::{WriteBatch, encode, measured},
};
use dfs_protocol::ObjectRef;
use dfs_protocol::{BLOCK_SIZE, MAX_GRANTS, MAX_IO, error::status, rpc::*, validate};
use futures::{StreamExt, TryStreamExt, stream};
use std::collections::{BTreeMap, BTreeSet};
use tonic::Status;

type Result<T> = std::result::Result<T, Status>;
const MAX_BATCH_BYTES: usize = 1024 * 1024;
const MAX_BATCH_KEYS: usize = 65_536;

#[derive(Default)]
pub struct Edit {
    pub batch: WriteBatch,
    pub tree: BTreeSet<ObjectRef>,
    bytes: usize,
    keys: usize,
}
impl Edit {
    pub fn new() -> Self {
        Self {
            batch: WriteBatch::new(),
            tree: BTreeSet::new(),
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
    pub fn delete(&mut self, key: Vec<u8>) -> Result<()> {
        self.reserve(key.len() + 64)?;
        self.batch.delete(key);
        Ok(())
    }
    pub fn clear(&mut self, start: Vec<u8>, end: Vec<u8>) -> Result<()> {
        self.reserve(start.len() + end.len() + 64)?;
        self.batch.clear(start, end);
        Ok(())
    }
    /// @cc [owner:spolu,label:backend;concurrency] complete-record-publication
    /// Input MUST contain complete metadata. Directories MUST atomically write a normalized core
    /// and separate mutable state; files retain their single-record encoding. Existing directory
    /// metadata edits MUST first read the mutable state with conflicts to preserve untouched fields.
    pub fn record(&mut self, keys: &Keys, record: &Record) -> Result<()> {
        self.search_pending(keys, &record.object.id)?;
        if let Some(parent) = &record.parent {
            self.batch.increment(keys.listing_version(&parent.id)?);
        }
        let mut record = record.clone();
        record.revision = uuid::Uuid::new_v4().into_bytes();
        record.object.read_version = 0;
        if record.object.directory {
            let state = DirectoryState {
                revision: record.revision,
                mtime: record
                    .object
                    .mtime
                    .take()
                    .ok_or_else(|| status(ErrorCode::Internal))?,
                ctime: record
                    .object
                    .ctime
                    .take()
                    .ok_or_else(|| status(ErrorCode::Internal))?,
            };
            self.put(keys.directory_state(&record.object.id)?, encode(&state)?)?;
            self.delete(keys.directory_time(&record.object.id)?)?;
            self.delete(keys.membership_version(&record.object.id)?)?;
            record.revision = [0; 16];
            record.object.revision.clear();
        }
        self.put(keys.object(&record.object.id)?, encode(&record)?)?;
        Ok(())
    }
    /// @cc [owner:spolu,label:backend;concurrency] blind-membership-publication
    /// The caller MUST have freshly authorized the directory core. Membership MUST atomically
    /// maximize its time and increment its version without reading or replacing its authority
    /// record or mutable state. Counter bumps MUST be deduplicated within the transaction.
    fn membership(&mut self, keys: &Keys, parent: &Record) -> Result<()> {
        let id = &parent.object.id;
        self.search_pending(keys, id)?;
        self.batch.increment(keys.membership_version(id)?);
        self.batch.increment(keys.listing_version(id)?);
        self.batch.increment(keys.authorization_version());
        if let Some(link) = &parent.parent {
            self.batch.increment(keys.listing_version(&link.id)?);
        }
        self.batch.byte_max(
            keys.directory_time(id)?,
            model::ordered_time(model::now()?)?,
        );
        Ok(())
    }
    /// @cc [owner:spolu,label:backend;concurrency] atomic-search-obligation
    /// Every searchable metadata/content change and deletion MUST replace the object's pending
    /// token in its filesystem transaction. Blind replacement MUST preserve independent siblings.
    pub fn search_pending(&mut self, keys: &Keys, id: &ObjectRef) -> Result<()> {
        self.put(
            keys.pending_object(id)?,
            encode(&crate::search::Pending::new()?)?,
        )
    }
    pub fn grant(
        &mut self,
        keys: &Keys,
        id: &ObjectRef,
        grant: crate::tree::GrantId,
        name: &str,
        attached: bool,
    ) -> Result<()> {
        self.batch.increment(keys.authorization_version());
        self.tree.insert(*id);
        let forward = keys.grant(id, grant)?;
        let reverse = keys.granted_object(grant, id)?;
        let lexical = keys.object_grant_name(id, name)?;
        if attached {
            self.put(forward, vec![1])?;
            self.put(reverse, vec![1])?;
            self.put(lexical, grant.0.to_be_bytes().to_vec())?;
        } else {
            self.delete(forward)?;
            self.delete(reverse)?;
            self.delete(lexical)?;
        }
        Ok(())
    }
}

#[derive(Clone)]
pub enum Change {
    Create(CreateRequest),
    Update(UpdateRequest),
    Rename(RenameRequest),
    Remove(RemoveRequest),
    Write(WriteRequest),
}
impl Change {
    pub fn primary_id(&self) -> &ObjectRef {
        match self {
            Self::Create(r) => &r.parent_id,
            Self::Update(r) => &r.object_id,
            Self::Rename(r) => &r.object_id,
            Self::Remove(r) => &r.object_id,
            Self::Write(r) => &r.object_id,
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
    /// Concurrent reads MUST share one coherent view and retain publication conflict dependencies.
    /// Consume errors in the existing order: parent authority, existing child, attributes,
    /// then UUID collision. Speculative child/collision reads MUST NOT expose unauthorized state.
    pub async fn create(&self, request: CreateRequest) -> Result<(Edit, Mutation)> {
        validate::name(&request.name)?;
        let parent_id = validate::id(&request.parent_id)?;
        let object = (|| {
            let mut object = model::new_object(request.directory, request.mode)?;
            if !request.object_id.is_empty() {
                object.id = validate::id(&request.object_id)?;
            }
            Ok::<_, Status>(object)
        })();
        let (parent, child, collision) = tokio::join!(
            self.directory_core(&parent_id),
            measured("child", self.child(&parent_id, &request.name)),
            measured("collision", async {
                let object = object.as_ref().map_err(Clone::clone)?;
                self.get(&self.keys.object(&object.id)?).await
            }),
        );
        let parent = parent?;
        if child?.is_some() {
            return Err(status(ErrorCode::AlreadyExists));
        }
        let object = object?;
        let mut metadata = model::Extended::new(object.directory);
        if let Some(mime) = request.mime_type {
            metadata.mime_type = mime;
        }
        metadata.xattrs = request.xattrs;
        validate::attributes(&metadata.mime_type, &metadata.xattrs, object.mode)?;
        // UUID collisions never replace an existing object, even in the astronomically unlikely case.
        if collision?.is_some() {
            return Err(status(ErrorCode::AlreadyExists));
        }
        let child = Record {
            object,
            revision: uuid::Uuid::new_v4().into_bytes(),
            parent: Some(Parent {
                id: parent.object.id,
                name: request.name.clone(),
            }),
        };
        let mut edit = Edit::new();
        edit.membership(&self.keys, &parent)?;
        edit.record(&self.keys, &child)?;
        edit.tree.insert(child.object.id);
        edit.put(self.keys.metadata(&child.object.id)?, encode(&metadata)?)?;
        edit.put(
            self.keys.child(&parent.object.id, &request.name)?,
            raw_id(&child.object.id)?,
        )?;
        Ok((
            edit,
            Mutation {
                commit_version: 0,
                object: Some(child.object),
                related: vec![],
            },
        ))
    }
    pub async fn read(&self, request: ReadRequest) -> Result<ReadResponse> {
        if request.length as usize > MAX_IO {
            return Err(status(ErrorCode::InvalidInput));
        }
        let record = self.stat(&request.object_id).await?;
        if !request.revision.is_empty() && request.revision.as_slice() != record.revision {
            return Err(status(ErrorCode::StaleView));
        }
        let object = &record.object;
        if object.directory {
            return Err(status(ErrorCode::IsDirectory));
        }
        let length =
            u64::from(request.length).min(object.size.saturating_sub(request.offset)) as usize;
        let mut data = vec![0; length];
        if length > 0 {
            let end = request.offset + length as u64;
            let record = &record;
            let blocks: Vec<_> =
                stream::iter(request.offset / BLOCK_SIZE as u64..end.div_ceil(BLOCK_SIZE as u64))
                    .map(|index| async move {
                        Ok::<_, Status>((index, self.block(record, index).await?))
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
            object: object.clone(),
            view: self.read_view(),
        })
    }
    /// @cc [owner:spolu,label:concurrency;security] authorized-block-record
    /// The record MUST come from stat in this view, before any mutation of its size or revision.
    async fn block(&self, record: &Record, index: u64) -> Result<Vec<u8>> {
        let value = measured(
            "block_read",
            self.snapshot
                .get(self.keys.block(&record.object.id, index)?),
        )
        .await?;
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
                    commit_version: 0,
                    object: Some(record.object),
                    related: vec![],
                },
            ));
        }
        let patches: Vec<_> =
            stream::iter(offset / BLOCK_SIZE as u64..end.div_ceil(BLOCK_SIZE as u64))
                .map(|index| self.patch(&record, index, offset, &request.data))
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
                commit_version: 0,
                object: Some(record.object),
                related: vec![],
            },
        ))
    }
    /// @cc [owner:spolu,label:concurrency;backend] preserve-unwritten-block-bytes
    /// Omit an old-block read only when the coherent view's object size proves the block is
    /// beyond EOF, or the patch replaces all existing logical bytes in that block. Partial patches
    /// MUST preserve other bytes and zero-fill holes. The object read MUST remain conflict-tracked
    /// so concurrent writes/truncation cannot invalidate that proof before commit.
    async fn patch(
        &self,
        record: &Record,
        index: u64,
        offset: u64,
        data: &[u8],
    ) -> Result<(u64, Vec<u8>)> {
        let object = &record.object;
        let start = index * BLOCK_SIZE as u64;
        let from = offset.max(start);
        let to = (offset + data.len() as u64).min(start + BLOCK_SIZE as u64);
        let existing_end = object.size.min(start + BLOCK_SIZE as u64);
        let mut block = if start >= object.size || (from == start && to >= existing_end) {
            Vec::new()
        } else {
            self.block(record, index).await?
        };
        block.resize(block.len().max((to - start) as usize), 0);
        block[(from - start) as usize..(to - start) as usize]
            .copy_from_slice(&data[(from - offset) as usize..(to - offset) as usize]);
        Ok((index, block))
    }
    pub async fn update(&self, request: UpdateRequest) -> Result<(Edit, Mutation)> {
        let mut record = self.stat(&request.object_id).await?;
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
                    let mut block = self.block(&record, index).await?;
                    if block.len() > tail as usize {
                        block.truncate(tail as usize);
                        edit.put(self.keys.block(&record.object.id, index)?, block)?;
                    }
                }
            }
            record.object.size = size;
        }
        record.object = model::bumped(record.object, request.size.is_some())?;

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
        if request.mime_type.is_some() || !request.xattrs.is_empty() {
            let mut metadata = self.extended(&record).await?;
            if let Some(mime) = request.mime_type {
                metadata.mime_type = mime;
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
                        metadata.xattrs.insert(change.name, value);
                    }
                    None => {
                        metadata.xattrs.remove(&change.name);
                    }
                }
            }
            validate::attributes(&metadata.mime_type, &metadata.xattrs, record.object.mode)?;
            edit.put(self.keys.metadata(&record.object.id)?, encode(&metadata)?)?;
        }
        if record.object.mode & !0o7777 != 0 {
            return Err(status(ErrorCode::InvalidInput));
        }
        edit.record(&self.keys, &record)?;
        Ok((
            edit,
            Mutation {
                commit_version: 0,
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
        edit.search_pending(&self.keys, &record.object.id)?;
        edit.tree.insert(record.object.id);
        edit.delete(self.keys.metadata(&record.object.id)?)?;
        if record.object.directory {
            edit.delete(self.keys.directory_state(&record.object.id)?)?;
            edit.delete(self.keys.directory_time(&record.object.id)?)?;
            edit.delete(self.keys.membership_version(&record.object.id)?)?;
            edit.delete(self.keys.listing_version(&record.object.id)?)?;
        }
        let parent = record
            .parent
            .as_ref()
            .ok_or_else(|| status(ErrorCode::Forbidden))?;
        edit.delete(self.keys.child(&parent.id, &parent.name)?)?;
        let prefix = self.keys.grants(&record.object.id)?;
        let mut scan = self.scan(prefix.clone(), None).await?;
        while let Some(row) = scan.next().await? {
            let grant = crate::grants::decode_id(&row.key[prefix.len()..])?;
            let name = crate::grants::name(&self.snapshot, &self.keys, grant).await?;
            edit.grant(&self.keys, &record.object.id, grant, &name, false)?;
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
        let parent = self.directory_core(&link.id).await?;
        if request.directory != record.object.directory {
            return Err(status(if record.object.directory {
                ErrorCode::IsDirectory
            } else {
                ErrorCode::NotDirectory
            }));
        }
        let mut edit = self.erase(&record).await?;
        edit.membership(&self.keys, &parent)?;
        Ok((
            edit,
            Mutation {
                commit_version: 0,
                object: None,
                related: vec![],
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
        let source_parent = self.directory_core(&old.id).await?;
        let destination_parent = self.directory_core(&request.parent_id).await?;
        let replacement = self
            .child(&destination_parent.object.id, &request.name)
            .await?;
        if replacement
            .as_ref()
            .is_some_and(|r| r.object.id == record.object.id)
        {
            return Ok((
                Edit::new(),
                Mutation {
                    commit_version: 0,
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
            if !seen.insert(ancestor.object.id) || seen.len() > 4096 {
                return Err(status(ErrorCode::Unavailable));
            }
            match ancestor.parent {
                Some(parent) => ancestor = self.core(&parent.id).await?,
                None => break,
            }
        }
        let mut edit = match &replacement {
            Some(replacement) => self.erase(replacement).await?,
            None => Edit::new(),
        };
        if old.id != destination_parent.object.id {
            edit.tree.insert(record.object.id);
        }
        edit.delete(self.keys.child(&old.id, &old.name)?)?;
        edit.put(
            self.keys
                .child(&destination_parent.object.id, &request.name)?,
            raw_id(&record.object.id)?,
        )?;
        record.parent = Some(Parent {
            id: destination_parent.object.id,
            name: request.name,
        });
        record.object = model::bumped(record.object, false)?;
        edit.record(&self.keys, &record)?;
        let parents = BTreeMap::from([
            (source_parent.object.id, source_parent),
            (destination_parent.object.id, destination_parent),
        ]);
        for (_, parent) in parents {
            edit.membership(&self.keys, &parent)?;
        }
        Ok((
            edit,
            Mutation {
                commit_version: 0,
                object: Some(record.object),
                related: vec![],
            },
        ))
    }
    pub async fn update_grants(&self, request: UpdateGrantsRequest) -> Result<(Edit, Attr)> {
        if request.changes.len() > MAX_GRANTS {
            return Err(status(ErrorCode::InvalidInput));
        }
        let mut record = self.object(&request.object_id).await?;
        let mut changes = BTreeSet::new();
        let mut edit = Edit::new();
        for change in &request.changes {
            validate::grant(&change.grant)?;
            if !changes.insert(change.grant.clone()) {
                return Err(status(ErrorCode::InvalidInput));
            }
        }
        let grants = crate::grants::intern(&self.snapshot, &self.keys, &changes).await?;
        for change in request.changes {
            edit.grant(
                &self.keys,
                &record.object.id,
                grants[&change.grant],
                &change.grant,
                change.attached,
            )?;
        }
        record.object = model::bumped(record.object, false)?;
        edit.record(&self.keys, &record)?;
        Ok((edit, record.object))
    }
}
fn raw_id(id: &ObjectRef) -> Result<Vec<u8>> {
    Ok(id
        .real()
        .map_err(|_| status(ErrorCode::InvalidInput))?
        .as_bytes()
        .to_vec())
}

/// @cc [owner:spolu,label:backend;concurrency] canonical-group-metadata
/// Group edits MUST share this snapshot, and every returned object MUST have complete metadata
/// reflecting all edits. Membership-only parents MUST be omitted: reading their atomic fields
/// before commit would conflict with independent sibling edits. Clients MUST invalidate them.
/// The caller MUST commit this snapshot before exposing the returned mutation to an RPC client.
pub async fn prepare_group(view: &View, changes: &[Change]) -> Result<Mutation> {
    validate_group(changes)?;
    let mut result = Mutation::default();
    let mut tree = BTreeSet::new();
    let mut bytes = 0;
    for change in changes {
        let (edit, response) = change.clone().prepare(view).await?;
        bytes += edit.batch.bytes();
        if bytes > dfs_protocol::MAX_IO {
            return Err(status(ErrorCode::Capacity));
        }
        edit.batch.apply(&view.snapshot)?;
        if matches!(change, Change::Create(_))
            && let Some(object) = &response.object
        {
            view.created(object.id);
        }
        tree.extend(edit.tree);
        result.object = response.object;
    }
    if let Some(object) = &mut result.object {
        *object = view.object(&object.id).await?.object;
    }
    crate::tree_log::publish_with_limits(&view.snapshot, &view.keys, &tree, view.tree_log_limits)
        .await?;
    view.check_authority()?;
    Ok(result)
}

/// @cc [owner:spolu,label:concurrency;backend] single-target-edit-groups
/// A group MUST contain one namespace edit, one file's edits, or a create followed by edits of the
/// created object. Mixed target groups MUST fail before modifying their private transaction.
pub fn validate_group(edits: &[Change]) -> Result<()> {
    if edits.is_empty() || edits.len() > 128 {
        return Err(status(ErrorCode::InvalidInput));
    }
    validate::id(edits[0].primary_id())?;
    let target = match &edits[0] {
        Change::Create(r) => {
            validate::id(&r.object_id)?;
            r.object_id
        }
        Change::Update(r) => r.object_id,
        Change::Write(r) => r.object_id,
        _ if edits.len() == 1 => return Ok(()),
        _ => return Err(status(ErrorCode::InvalidInput)),
    };
    for edit in &edits[1..] {
        match edit {
            Change::Update(r) if r.object_id == target => (),
            Change::Write(r) if r.object_id == target => (),
            _ => return Err(status(ErrorCode::InvalidInput)),
        }
    }
    Ok(())
}
