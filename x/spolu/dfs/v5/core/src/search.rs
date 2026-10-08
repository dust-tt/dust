use serde::{Deserialize, Serialize};
use tonic::Status;

/// @cc [owner:spolu,label:backend;concurrency] search-job-identity
/// Workers MUST clear or reschedule a job only while its token still matches in the committing
/// transaction. A new filesystem mutation MUST get a new token and reset retry state.
#[derive(Clone, Serialize, Deserialize)]
pub struct Pending {
    pub token: [u8; 16],
    pub enqueued_seconds: i64,
    pub attempts: u32,
    pub retry_after_seconds: i64,
}
impl Pending {
    pub fn new() -> Result<Self, Status> {
        Ok(Self {
            token: uuid::Uuid::new_v4().into_bytes(),
            enqueued_seconds: crate::model::now()?.seconds,
            attempts: 0,
            retry_after_seconds: 0,
        })
    }
}
