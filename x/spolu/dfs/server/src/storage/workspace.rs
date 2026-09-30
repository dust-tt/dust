use std::collections::BTreeSet;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use slatedb::{
    WriteBatch,
    config::{DurabilityLevel, ReadOptions},
};

use super::{Storage, codec, keys::Keyspace};
use crate::model::{MetadataRevision, ObjectId, ObjectKind, ObjectMetadata, WorkspaceId, Xattrs};

#[derive(Serialize, Deserialize)]
pub(crate) struct WorkspaceRecord {
    pub root_id: [u8; 16],
    pub key_hash: [u8; 32],
}

impl Storage {
    /**
     * @cc [owner:spolu,label:backend] atomic-workspace-creation
     * Workspace creation MUST reject an existing namespace without replacing its key or root.
     * The key hash, root, explicit grant indexes, and initial event MUST be one durable batch.
     * Callers MUST authenticate server authority before provisioning; raw keys MUST NOT be stored.
     */
    pub(crate) async fn create_workspace(
        &self,
        workspace: &WorkspaceId,
        key_hash: [u8; 32],
        root_grants: &BTreeSet<String>,
    ) -> Result<Option<ObjectId>> {
        let keys = Keyspace::new(workspace.clone())?;
        let (root_id, handle) = {
            let _publish = self.publish.lock().await;
            if self
                .metadata
                .scan_prefix(keys.prefix(), ..)
                .await?
                .next()
                .await?
                .is_some()
            {
                return Ok(None);
            }
            let root_id = ObjectId::generate();
            let root = ObjectMetadata {
                workspace_id: workspace.clone(),
                id: root_id,
                parent: None,
                kind: ObjectKind::Directory,
                mime_type: "inode/directory".parse()?,
                xattrs: Xattrs::new(),
                metadata_revision: MetadataRevision::INITIAL,
            };
            let mut batch = WriteBatch::new();
            batch.put(
                keys.workspace_record(),
                codec::encode(&WorkspaceRecord {
                    root_id: *root_id.as_bytes(),
                    key_hash,
                })?,
            );
            batch.put(keys.object(root_id), codec::encode_object(&root)?);
            for grant in root_grants {
                batch.put(keys.grant(root_id, grant), codec::encode(&())?);
                batch.put(keys.granted_object(grant, root_id)?, codec::encode(&())?);
            }
            batch.put(keys.change_sequence(), codec::encode(&1_u64)?);
            batch.put(keys.change(1), codec::encode(&vec![*root_id.as_bytes()])?);
            (root_id, self.metadata.write(batch).await?)
        };
        handle.await_durable().await?;
        Ok(Some(root_id))
    }

    /// Session creation reads only durable workspace authority, including after a restart.
    pub(crate) async fn workspace_record(
        &self,
        workspace: &WorkspaceId,
    ) -> Result<Option<WorkspaceRecord>> {
        let keys = Keyspace::new(workspace.clone())?;
        let value = self
            .metadata
            .get_with_options(
                keys.workspace_record(),
                &ReadOptions::default().with_durability_filter(DurabilityLevel::Remote),
            )
            .await?;
        value.map(|bytes| codec::decode(&bytes)).transpose()
    }
}
