use crate::{mutation::Edit, read::View, storage::decode};
use serde::{Deserialize, Serialize};
use tonic::Status;

pub(crate) use dfs_core::search::Pending;

#[derive(Clone, Default, Serialize, Deserialize)]
pub(crate) struct Meta {
    pub backfill_after: Option<Vec<u8>>,
    pub backfilled: bool,
    pub pending_after: Option<Vec<u8>>,
    pub last_commit_seconds: i64,
    pub index_generation: String,
}

/// @cc [owner:spolu,label:concurrency] matching-completion-only
/// Callers MUST use the committing FDB transaction and MUST already have published and refreshed
/// the corresponding conditional ES operation. A different current token MUST leave all work intact.
pub(crate) async fn complete(
    view: &View,
    edit: &mut Edit,
    id: &dfs_protocol::ObjectRef,
    token: &[u8; 16],
) -> Result<bool, Status> {
    let key = view.keys.pending_object(id)?;
    let Some(value) = view.get(&key).await? else {
        return Ok(false);
    };
    let current: Pending = decode(&value)?;
    if current.token != *token {
        return Ok(false);
    }
    edit.delete(key)?;
    Ok(true)
}
