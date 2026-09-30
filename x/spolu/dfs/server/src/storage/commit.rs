use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};

use anyhow::{Context, Result, ensure};
use slatedb::{
    WriteBatch, WriteHandle,
    bytes::Bytes,
    object_store::{ObjectStoreExt, PutMode, path::Path},
};
use tokio::sync::MutexGuard;

use super::{ReadView, WorkspaceStorage, codec};
use crate::model::{
    ContentVersionId, DirectoryEntry, EntryName, ObjectId, ObjectKind, ObjectMetadata,
};

/// Internal storage mutations; namespace validation and authorization belong to their callers.
#[derive(Clone, Debug)]
pub enum MetadataMutation {
    PutObject(Box<ObjectMetadata>),
    DeleteObject(ObjectId),
    PutChild(DirectoryEntry),
    DeleteChild {
        parent_id: ObjectId,
        name: EntryName,
    },
    SetGrant {
        object_id: ObjectId,
        grant: String,
        attached: bool,
    },
}

#[derive(Clone, Debug)]
pub struct BlobUpload {
    pub object_id: ObjectId,
    pub version: ContentVersionId,
    pub bytes: Bytes,
}

/**
 * @cc [owner:spolu,label:backend] complete-metadata-batch
 * Callers MUST include all related namespace changes in one batch, including object parent links
 * and old/new child entries on moves, and index removals on deletion. Callers MUST authorize and
 * validate namespace invariants before committing. Storage MUST reject cross-workspace records
 * and duplicate keys, and update both explicit grant indexes for every SetGrant mutation.
 */
#[derive(Clone, Debug, Default)]
pub struct MetadataBatch {
    pub mutations: Vec<MetadataMutation>,
    pub uploads: Vec<BlobUpload>,
}

impl WorkspaceStorage<'_> {
    /**
     * @cc [owner:spolu,label:backend] synchronous-storage-commit
     * Every published content reference MUST already exist in the workspace/object/version blob
     * store with the declared size. Upload failure MUST leave all metadata unchanged. Publish
     * metadata, both grant indexes, and the change event in one SlateDB batch, then await WAL
     * durability before returning success. Failure after submission can have an ambiguous outcome;
     * retain uploaded blobs, and never claim that an error proves the batch did not commit.
     */
    pub async fn commit(&self, batch: MetadataBatch) -> Result<u64> {
        let PreparedBatch {
            rows,
            changed,
            references,
        } = self.prepare(batch.mutations)?;

        let mut uploaded = HashSet::new();
        for upload in &batch.uploads {
            let reference = references
                .get(&upload.object_id)
                .context("upload has no object record")?;
            ensure!(
                reference.version == upload.version
                    && reference.size_bytes == u64::try_from(upload.bytes.len())?,
                "upload does not match content reference"
            );
            ensure!(uploaded.insert(upload.object_id), "duplicate blob upload");
        }
        for upload in batch.uploads {
            self.storage
                .blobs
                .put_opts(
                    &self.blob_path(upload.object_id, upload.version),
                    upload.bytes.into(),
                    PutMode::Create.into(),
                )
                .await
                .context("upload immutable content")?;
        }
        for (id, content) in references {
            if !uploaded.contains(&id) {
                let blob = self
                    .storage
                    .blobs
                    .head(&self.blob_path(id, content.version))
                    .await
                    .context("verify referenced content")?;
                ensure!(
                    blob.size == content.size_bytes,
                    "content size does not match reference"
                );
            }
        }

        // Serialize sequence allocation and publication, never uploads or the durability wait.
        let (sequence, handle) = self
            .begin_metadata_write()
            .await
            .submit(PreparedBatch {
                rows,
                changed,
                references: HashMap::new(),
            })
            .await?;
        handle
            .await_durable()
            .await
            .context("persist metadata WAL")?;
        Ok(sequence)
    }

    fn prepare(&self, mutations: Vec<MetadataMutation>) -> Result<PreparedBatch> {
        ensure!(!mutations.is_empty(), "empty metadata batch");
        let mut rows = BTreeMap::new();
        let mut changed = BTreeSet::new();
        let mut references = HashMap::new();
        for mutation in mutations {
            match mutation {
                MetadataMutation::PutObject(object) => {
                    ensure!(
                        object.workspace_id == self.keys.workspace,
                        "cross-workspace metadata record"
                    );
                    changed.insert(*object.id.as_bytes());
                    if let ObjectKind::File(content) = &object.kind {
                        references.insert(object.id, content.clone());
                    }
                    insert(
                        &mut rows,
                        self.keys.object(object.id),
                        Some(codec::encode_object(&object)?),
                    )?;
                }
                MetadataMutation::DeleteObject(id) => {
                    changed.insert(*id.as_bytes());
                    insert(&mut rows, self.keys.object(id), None)?;
                }
                MetadataMutation::PutChild(entry) => {
                    ensure!(
                        entry.workspace_id == self.keys.workspace,
                        "cross-workspace directory entry"
                    );
                    changed.insert(*entry.parent_id.as_bytes());
                    changed.insert(*entry.object_id.as_bytes());
                    insert(
                        &mut rows,
                        self.keys.child(entry.parent_id, &entry.name),
                        Some(codec::encode(entry.object_id.as_bytes())?),
                    )?;
                }
                MetadataMutation::DeleteChild { parent_id, name } => {
                    changed.insert(*parent_id.as_bytes());
                    insert(&mut rows, self.keys.child(parent_id, &name), None)?;
                }
                MetadataMutation::SetGrant {
                    object_id,
                    grant,
                    attached,
                } => {
                    changed.insert(*object_id.as_bytes());
                    let value = if attached {
                        Some(codec::encode(&())?)
                    } else {
                        None
                    };
                    insert(&mut rows, self.keys.grant(object_id, &grant), value.clone())?;
                    insert(
                        &mut rows,
                        self.keys.granted_object(&grant, object_id)?,
                        value,
                    )?;
                }
            }
        }

        Ok(PreparedBatch {
            rows,
            changed,
            references,
        })
    }

    pub(crate) async fn begin_metadata_write(&self) -> MetadataWrite<'_> {
        MetadataWrite {
            workspace: WorkspaceStorage {
                storage: self.storage,
                keys: self.keys.clone(),
            },
            _publish: self.storage.publish.lock().await,
        }
    }

    /// Callers authorize the object and choose a current content version before fetching bytes.
    pub async fn read_blob(&self, object: ObjectId, version: ContentVersionId) -> Result<Bytes> {
        self.storage
            .blobs
            .get(&self.blob_path(object, version))
            .await
            .context("read content")?
            .bytes()
            .await
            .context("read content bytes")
    }

    fn blob_path(&self, object: ObjectId, version: ContentVersionId) -> Path {
        Path::from(format!(
            "v1/{}/{object}/{version}",
            hex::encode(self.keys.workspace.as_str().as_bytes())
        ))
    }
}

fn insert(
    rows: &mut BTreeMap<Vec<u8>, Option<Vec<u8>>>,
    key: Vec<u8>,
    value: Option<Vec<u8>>,
) -> Result<()> {
    ensure!(
        rows.insert(key, value).is_none(),
        "duplicate key in metadata batch"
    );
    Ok(())
}

struct PreparedBatch {
    rows: BTreeMap<Vec<u8>, Option<Vec<u8>>>,
    changed: BTreeSet<[u8; 16]>,
    references: HashMap<ObjectId, crate::model::FileContent>,
}

/**
 * @cc [owner:spolu,label:concurrency] metadata-write-guard
 * Workspace mutations MUST share this lock during publication. Namespace metadata edits MUST
 * acquire it before reading or authorizing, and retain it through publication. Drop the guard
 * before awaiting WAL durability; blob I/O MUST happen outside the guard. Failure before submission
 * MUST leave metadata and events unchanged.
 */
pub(crate) struct MetadataWrite<'a> {
    workspace: WorkspaceStorage<'a>,
    _publish: MutexGuard<'a, ()>,
}

impl MetadataWrite<'_> {
    pub async fn read_view(&self) -> Result<ReadView> {
        self.workspace.read_view().await
    }

    /**
     * @cc [owner:spolu,label:backend] metadata-only-content-preservation
     * Every published file reference MUST match an existing record in the guarded view. This
     * method MUST perform no blob I/O, and success MUST wait for the atomic batch's WAL durability.
     */
    pub async fn commit(self, mutations: Vec<MetadataMutation>) -> Result<u64> {
        let prepared = self.workspace.prepare(mutations)?;
        let view = self.read_view().await?;
        for (id, content) in &prepared.references {
            let object = view.object(*id).await?.context("missing existing file")?;
            ensure!(
                object.kind == ObjectKind::File(content.clone()),
                "changed content reference"
            );
        }
        let (sequence, handle) = self.submit(prepared).await?;
        handle
            .await_durable()
            .await
            .context("persist metadata WAL")?;
        Ok(sequence)
    }

    async fn submit(self, prepared: PreparedBatch) -> Result<(u64, WriteHandle)> {
        let PreparedBatch { rows, changed, .. } = prepared;
        let previous: u64 = self
            .workspace
            .storage
            .metadata
            .get(self.workspace.keys.change_sequence())
            .await?
            .map(|bytes| codec::decode(&bytes))
            .transpose()?
            .unwrap_or(0);
        let sequence = previous
            .checked_add(1)
            .context("change sequence exhausted")?;
        let mut writes = WriteBatch::new();
        for (key, value) in rows {
            match value {
                Some(value) => writes.put(key, value),
                None => writes.delete(key),
            }
        }
        writes.put(
            self.workspace.keys.change_sequence(),
            codec::encode(&sequence)?,
        );
        writes.put(
            self.workspace.keys.change(sequence),
            codec::encode(&changed.into_iter().collect::<Vec<_>>())?,
        );
        Ok((
            sequence,
            self.workspace
                .storage
                .metadata
                .write(writes)
                .await
                .context("publish metadata batch")?,
        ))
    }
}
