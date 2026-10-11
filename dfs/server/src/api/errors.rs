use dfs_protocol::{error::status, rpc::ErrorCode};
use tonic::Status;

use crate::storage::{
    self,
    resources::{object, session, tenant},
};

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
 * @cc [owner:spolu,label:api;error-handling] transaction-error-conversion
 * Errors from different resources in one transaction MUST retain their API status mapping.
 * FDB transaction errors MUST pass through unchanged so the transaction runner can retry them.
 */
impl From<storage::Error<tenant::Error>> for storage::Error<Status> {
    fn from(error: storage::Error<tenant::Error>) -> Self {
        match error {
            storage::Error::Transaction(error) => Self::Transaction(error),
            error => Self::Resource(error.into()),
        }
    }
}

/**
 * @cc [owner:spolu,label:api;error-handling] transaction-error-conversion
 * Errors from different resources in one transaction MUST retain their API status mapping.
 * FDB transaction errors MUST pass through unchanged so the transaction runner can retry them.
 */
impl From<storage::Error<object::Error>> for storage::Error<Status> {
    fn from(error: storage::Error<object::Error>) -> Self {
        match error {
            storage::Error::Transaction(error) => Self::Transaction(error),
            error => Self::Resource(error.into()),
        }
    }
}

impl From<object::Error> for Status {
    fn from(error: object::Error) -> Self {
        match error {
            object::Error::AlreadyExists => status(ErrorCode::AlreadyExists),
            object::Error::TimestampGeneration | object::Error::MissingMetadata => {
                tracing::error!(%error, "object creation failed");
                status(ErrorCode::Internal)
            }
        }
    }
}

impl From<session::Error> for Status {
    fn from(error: session::Error) -> Self {
        match error {
            session::Error::InvalidId
            | session::Error::InvalidSubject
            | session::Error::TooManySubjects => status(ErrorCode::InvalidInput),
            session::Error::InvalidKey => status(ErrorCode::Unauthenticated),
            session::Error::NotFound => status(ErrorCode::NotFound),
            session::Error::AlreadyExists => status(ErrorCode::AlreadyExists),
            session::Error::KeyGeneration
            | session::Error::ExpiryGeneration
            | session::Error::KeyCollision => {
                tracing::error!(%error, "session creation failed");
                status(ErrorCode::Internal)
            }
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
    use foundationdb::{FdbBindingError, FdbError};
    use prost::Message;

    use super::*;
    use crate::auth::InvalidKeyHash;

    #[test]
    fn transaction_errors_preserve_retries_and_resource_statuses() -> Result<(), prost::DecodeError>
    {
        let error: storage::Error<tenant::Error> =
            FdbBindingError::from(FdbError::from_code(1020)).into();
        let error = FdbBindingError::from(storage::Error::<Status>::from(error));
        assert_eq!(error.get_fdb_error().map(|error| error.code()), Some(1020));

        for (error, expected) in [
            (
                storage::Error::<Status>::from(storage::Error::Resource(tenant::Error::InvalidId)),
                ErrorCode::InvalidInput,
            ),
            (
                storage::Error::<Status>::from(storage::Error::Resource(
                    object::Error::AlreadyExists,
                )),
                ErrorCode::AlreadyExists,
            ),
        ] {
            // Follow the runner's boxing and unboxing before translating the final API response.
            let error = FdbBindingError::from(error);
            let error = storage::Error::<Status>::from(error);
            let status: Status = error.into();
            assert_eq!(ErrorDetails::decode(status.details())?.code(), expected);
        }
        Ok(())
    }

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
