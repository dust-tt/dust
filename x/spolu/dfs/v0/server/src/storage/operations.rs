use anyhow::Result;
use serde::{Deserialize, Serialize};

use super::{ReadView, WorkspaceStorage, codec};
use crate::model::RequestId;

/// Persisted atomically with a content mutation; independent of ephemeral sessions and handles.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct OperationRecord {
    pub object_id: [u8; 16],
    pub fingerprint: [u8; 32],
    pub content_version: [u8; 16],
    pub size_bytes: u64,
    pub metadata_revision: u64,
}

impl ReadView {
    pub(crate) async fn operation(&self, id: RequestId) -> Result<Option<OperationRecord>> {
        self.get(self.keys.operation(id))
            .await?
            .map(|bytes| codec::decode(&bytes))
            .transpose()
    }
}

impl WorkspaceStorage<'_> {
    /// Acknowledge visibility in cached mode or the currently visible WAL prefix in synchronous
    /// mode.
    pub(crate) async fn acknowledge(&self) -> Result<()> {
        if !self.storage.cached() {
            self.storage.metadata.flush().await?;
        }
        Ok(())
    }
}
