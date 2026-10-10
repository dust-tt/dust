use dfs_protocol::{error::status, rpc::ErrorCode};
use tonic::Status;

use crate::storage::{self, resources::tenant};

impl From<tenant::Error> for Status {
    fn from(error: tenant::Error) -> Self {
        match error {
            tenant::Error::InvalidId => status(ErrorCode::InvalidInput),
            tenant::Error::KeyGeneration => status(ErrorCode::Internal),
            tenant::Error::AlreadyExists => status(ErrorCode::AlreadyExists),
        }
    }
}

/// @cc [owner:spolu,label:api;error-handling] storage-status-conversion
/// Database failures MUST return INTERNAL with protocol ErrorDetails and a generic public message.
/// Resource failures MUST retain their resource-specific status mapping. Database and transaction
/// error details MUST NOT be included in the response.
impl<E: Into<Status>> From<storage::Error<E>> for Status {
    fn from(error: storage::Error<E>) -> Self {
        match error {
            storage::Error::Open(error) => {
                tracing::error!(error = format!("{error:#}"), "fdb database unavailable");
            }
            storage::Error::Transaction(error) => {
                tracing::error!(%error, "fdb transaction failed");
            }
            storage::Error::Resource(error) => return error.into(),
        }
        status(ErrorCode::Internal)
    }
}
