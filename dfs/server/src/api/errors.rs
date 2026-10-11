use dfs_protocol::{error::status, rpc::ErrorCode};
use tonic::Status;

use crate::storage::{self, resources::tenant};

impl From<tenant::Error> for Status {
    fn from(error: tenant::Error) -> Self {
        match error {
            tenant::Error::InvalidId => status(ErrorCode::InvalidInput),
            tenant::Error::KeyGeneration => {
                tracing::error!("tenant key generation failed");
                status(ErrorCode::Internal)
            }
            tenant::Error::KeyCollision => {
                tracing::error!("tenant key hash already exists");
                status(ErrorCode::Internal)
            }
            tenant::Error::AlreadyExists => status(ErrorCode::AlreadyExists),
            tenant::Error::InvalidKey => status(ErrorCode::Unauthenticated),
        }
    }
}

/**
 * @cc [owner:spolu,label:api;error-handling] storage-status-conversion
 * Database and stored-data decoding failures MUST return INTERNAL with protocol ErrorDetails and a
 * generic public message. Resource failures MUST retain their resource-specific status mapping.
 * Database, decoding, and transaction error details MUST NOT be included in the response.
 */
impl<E: Into<Status>> From<storage::Error<E>> for Status {
    fn from(error: storage::Error<E>) -> Self {
        match error {
            storage::Error::Open(error) => {
                tracing::error!(error = format!("{error:#}"), "fdb database unavailable");
            }
            storage::Error::Transaction(error) => {
                tracing::error!(%error, "fdb transaction failed");
            }
            storage::Error::InvalidKeyHash(error) => {
                tracing::error!(%error, "stored key hash decoding failed");
            }
            storage::Error::InvalidObjectId(error) => {
                tracing::error!(%error, "stored object ID decoding failed");
            }
            storage::Error::Resource(error) => return error.into(),
        }
        status(ErrorCode::Internal)
    }
}

#[cfg(test)]
mod tests {
    use dfs_protocol::{InvalidId, rpc::ErrorDetails};
    use prost::Message;

    use super::*;
    use crate::auth::InvalidKeyHash;

    #[test]
    fn decoding_errors_return_generic_internal_details() -> Result<(), prost::DecodeError> {
        for error in [
            storage::Error::<tenant::Error>::InvalidKeyHash(InvalidKeyHash),
            storage::Error::InvalidObjectId(InvalidId),
        ] {
            let status: Status = error.into();
            assert_eq!(status.code(), tonic::Code::Internal);
            assert_eq!(status.message(), "Internal error.");
            assert_eq!(
                ErrorDetails::decode(status.details())?.code,
                i32::from(ErrorCode::Internal)
            );
        }
        Ok(())
    }
}
