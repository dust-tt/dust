use dfs_protocol::{error::status, rpc::ErrorCode};
use tonic::Status;

use crate::storage::{self, resources::tenant};

impl From<tenant::Error> for Status {
    fn from(error: tenant::Error) -> Self {
        match error {
            tenant::Error::InvalidId => status(ErrorCode::InvalidInput),
            tenant::Error::KeyGeneration => status(ErrorCode::Internal),
        }
    }
}

/// @cc [owner:spolu,label:api;error-handling] storage-status-conversion
/// Storage failures MUST return INTERNAL with protocol ErrorDetails and a generic public message.
/// Database and transaction error details MUST NOT be included in the response.
impl From<storage::Error> for Status {
    fn from(error: storage::Error) -> Self {
        match error {
            storage::Error::Open(error) => {
                tracing::error!(error = format!("{error:#}"), "fdb database unavailable");
            }
            storage::Error::Transaction(error) => {
                tracing::error!(%error, "fdb transaction failed");
            }
        }
        status(ErrorCode::Internal)
    }
}
