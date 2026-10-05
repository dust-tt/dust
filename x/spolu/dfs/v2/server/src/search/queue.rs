use crate::{
    model,
    mutation::Edit,
    read::View,
    storage::{decode, encode},
};
use serde::{Deserialize, Serialize};
use tonic::Status;

#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct Pending {
    pub token: String,
    pub version: Option<u64>,
    pub enqueued_seconds: i64,
    pub attempts: u32,
    pub retry_after_seconds: i64,
}
impl Pending {
    pub fn new(version: Option<u64>) -> Result<Self, Status> {
        Ok(Self {
            token: uuid::Uuid::new_v4().simple().to_string(),
            version,
            enqueued_seconds: model::now()?.seconds,
            attempts: 0,
            retry_after_seconds: 0,
        })
    }
}

#[derive(Clone, Default, Serialize, Deserialize)]
pub(crate) struct Indexed {
    pub version: u64,
    pub skipped: bool,
    pub failed: bool,
}

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
    id: &str,
    token: &str,
    indexed: Option<&Indexed>,
) -> Result<bool, Status> {
    let key = view.keys.pending_file(id)?;
    let Some(value) = view.get(&key).await? else {
        return Ok(false);
    };
    let current: Pending = decode(&value)?;
    if current.token != token {
        return Ok(false);
    }
    edit.delete(key)?;
    match indexed {
        Some(indexed) => edit.put(view.keys.search_status(id)?, encode(indexed)?)?,
        None => edit.delete(view.keys.search_status(id)?)?,
    }
    Ok(true)
}
