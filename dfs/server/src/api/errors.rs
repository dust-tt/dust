use dfs_protocol::{
    error::status,
    rpc::{ErrorCode, ErrorDetails},
};
use tonic::Status;

use crate::storage::{
    self,
    resources::{file, object, session, tenant},
};

#[cfg(test)]
#[path = "../../tests/api/errors.rs"]
mod tests;

// A transaction that calls several resources needs one error type. API closures use
// `storage::Error<Status>` so each resource call can use `?` despite returning a different error enum.
//
// Conversions into `storage::Error<Status>` preserve `Transaction` errors unchanged: `Database::run`
// must see the original FDB failure to decide whether to retry. Other errors become `Status` and are
// carried in `storage::Error::Resource`. The runner boxes them through `FdbBindingError::CustomError`,
// aborting without committing or retrying. The handler's outer `.await?` returns the recovered status.
//
// This replaces the original resource or decoding error variant with its API status inside the
// transaction closure. Resource modules still return typed errors and remain independent of tonic.

impl From<file::Error> for Status {
    fn from(error: file::Error) -> Self {
        match error {
            file::Error::IsDirectory => status(ErrorCode::IsDirectory),
            file::Error::UnsupportedKind => status(ErrorCode::Unsupported),
            file::Error::InvalidLength => status(ErrorCode::InvalidInput),
            file::Error::InvalidBlock => {
                tracing::error!(%error, "file read failed");
                status(ErrorCode::Internal)
            }
        }
    }
}

impl From<file::Error> for storage::Error<Status> {
    fn from(error: file::Error) -> Self {
        Self::Resource(error.into())
    }
}

impl From<storage::Error<file::Error>> for storage::Error<Status> {
    fn from(error: storage::Error<file::Error>) -> Self {
        match error {
            storage::Error::Transaction(error) => Self::Transaction(error),
            error => Self::Resource(error.into()),
        }
    }
}

// Share the mapping between RPC statuses and individual batch errors.
impl From<object::Error> for ErrorCode {
    fn from(error: object::Error) -> Self {
        match error {
            object::Error::InvalidXattrName
            | object::Error::XattrsTooLarge
            | object::Error::InvalidId
            | object::Error::InvalidGrant
            | object::Error::TooManyGrants
            | object::Error::DuplicateGrant
            | object::Error::InvalidGrantLimit
            | object::Error::InvalidGrantCursor => ErrorCode::InvalidInput,
            object::Error::AlreadyExists => ErrorCode::AlreadyExists,
            // Ordinary reads conceal inaccessible objects just like missing objects.
            object::Error::NotFound | object::Error::NotAuthorized => ErrorCode::NotFound,
            object::Error::UnsupportedKind => ErrorCode::Unsupported,
            object::Error::TimestampGeneration
            | object::Error::MissingMetadata
            | object::Error::InvalidStoredGrant
            | object::Error::InvalidAncestry
            | object::Error::VersionOverflow => {
                tracing::error!(%error, "object operation failed");
                ErrorCode::Internal
            }
        }
    }
}

impl From<object::Error> for ErrorDetails {
    fn from(error: object::Error) -> Self {
        Self {
            code: ErrorCode::from(error).into(),
        }
    }
}

impl From<object::Error> for Status {
    fn from(error: object::Error) -> Self {
        status(error.into())
    }
}

impl From<object::Error> for storage::Error<Status> {
    fn from(error: object::Error) -> Self {
        Self::Resource(error.into())
    }
}

impl From<storage::Error<object::Error>> for storage::Error<Status> {
    fn from(error: storage::Error<object::Error>) -> Self {
        match error {
            storage::Error::Transaction(error) => Self::Transaction(error),
            error => Self::Resource(error.into()),
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
            session::Error::Tenant(error) => error.into(),
            session::Error::KeyGeneration
            | session::Error::ExpiryGeneration
            | session::Error::KeyCollision => {
                tracing::error!(%error, "session creation failed");
                status(ErrorCode::Internal)
            }
        }
    }
}

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

impl From<storage::Error<tenant::Error>> for storage::Error<Status> {
    fn from(error: storage::Error<tenant::Error>) -> Self {
        match error {
            storage::Error::Transaction(error) => Self::Transaction(error),
            error => Self::Resource(error.into()),
        }
    }
}

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
