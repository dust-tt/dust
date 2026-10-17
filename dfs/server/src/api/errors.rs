use dfs_protocol::{
    error::status,
    rpc::{ErrorCode, ErrorDetails},
};
use tonic::Status;

use crate::storage::{
    self, receipt,
    resources::{directory, file, object, session, tenant},
};

const TRANSACTION_TOO_LARGE_CODE: i32 = 2101;

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

// Each resource follows the same order: ErrorCode, ErrorDetails, Status, then the mixed-transaction
// wrapper. ErrorCode is the single mapping shared by all paths; wrapped resource errors delegate
// to their originating resource's mapping.
impl From<file::Error> for ErrorCode {
    fn from(error: file::Error) -> Self {
        match error {
            file::Error::IsDirectory => ErrorCode::IsDirectory,
            file::Error::UnsupportedKind | file::Error::UnsupportedOperation => {
                ErrorCode::Unsupported
            }
            file::Error::InvalidLength => ErrorCode::InvalidInput,
            file::Error::Capacity => ErrorCode::Capacity,
            file::Error::Object(error) => error.into(),
            file::Error::InvalidBlock => {
                tracing::error!(%error, "file operation failed");
                ErrorCode::Internal
            }
        }
    }
}

impl From<file::Error> for ErrorDetails {
    fn from(error: file::Error) -> Self {
        Self {
            code: ErrorCode::from(error).into(),
        }
    }
}

impl From<file::Error> for Status {
    fn from(error: file::Error) -> Self {
        status(error.into())
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

impl From<object::Error> for ErrorCode {
    fn from(error: object::Error) -> Self {
        match error {
            object::Error::InvalidXattrName
            | object::Error::InvalidMimeType
            | object::Error::XattrsTooLarge
            | object::Error::InvalidId
            | object::Error::InvalidGrant
            | object::Error::TooManyGrants
            | object::Error::DuplicateGrant
            | object::Error::InvalidGrantLimit
            | object::Error::InvalidGrantCursor => ErrorCode::InvalidInput,
            object::Error::AlreadyExists => ErrorCode::AlreadyExists,
            object::Error::Forbidden => ErrorCode::Forbidden,
            // Ordinary reads conceal inaccessible objects just like missing objects.
            object::Error::NotFound | object::Error::NotAuthorized => ErrorCode::NotFound,
            object::Error::UnsupportedKind => ErrorCode::Unsupported,
            object::Error::Directory(error) => (*error).into(),
            object::Error::File(error) => (*error).into(),
            object::Error::TimestampGeneration
            | object::Error::MissingMetadata
            | object::Error::InvalidStoredGrant
            | object::Error::InvalidAncestry => {
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

impl From<storage::Error<object::Error>> for storage::Error<Status> {
    fn from(error: storage::Error<object::Error>) -> Self {
        match error {
            storage::Error::Transaction(error) => Self::Transaction(error),
            error => Self::Resource(error.into()),
        }
    }
}

impl From<directory::Error> for ErrorCode {
    fn from(error: directory::Error) -> Self {
        match error {
            directory::Error::InvalidName
            | directory::Error::InvalidKind
            | directory::Error::InvalidMove
            | directory::Error::InvalidPageLimit
            | directory::Error::InvalidCursor => ErrorCode::InvalidInput,
            directory::Error::NameTooLong => ErrorCode::NameTooLong,
            directory::Error::NotDirectory => ErrorCode::NotDirectory,
            directory::Error::AlreadyExists => ErrorCode::AlreadyExists,
            directory::Error::NotEmpty => ErrorCode::NotEmpty,
            directory::Error::Forbidden => ErrorCode::Forbidden,
            directory::Error::UnsupportedKind
            | directory::Error::UnsupportedOperation
            | directory::Error::SharedUnsupported => ErrorCode::Unsupported,
            directory::Error::Object(error) => error.into(),
            directory::Error::TimestampGeneration => {
                tracing::error!(%error, "directory operation failed");
                ErrorCode::Internal
            }
        }
    }
}

impl From<directory::Error> for ErrorDetails {
    fn from(error: directory::Error) -> Self {
        Self {
            code: ErrorCode::from(error).into(),
        }
    }
}

impl From<directory::Error> for Status {
    fn from(error: directory::Error) -> Self {
        status(error.into())
    }
}

impl From<storage::Error<directory::Error>> for storage::Error<Status> {
    fn from(error: storage::Error<directory::Error>) -> Self {
        match error {
            storage::Error::Transaction(error) => Self::Transaction(error),
            error => Self::Resource(error.into()),
        }
    }
}

impl From<session::Error> for ErrorCode {
    fn from(error: session::Error) -> Self {
        match error {
            session::Error::InvalidId
            | session::Error::InvalidSubject
            | session::Error::TooManySubjects => ErrorCode::InvalidInput,
            session::Error::InvalidKey => ErrorCode::Unauthenticated,
            session::Error::NotFound => ErrorCode::NotFound,
            session::Error::AlreadyExists => ErrorCode::AlreadyExists,
            session::Error::Tenant(error) => error.into(),
            session::Error::KeyGeneration
            | session::Error::ExpiryGeneration
            | session::Error::KeyCollision => {
                tracing::error!(%error, "session operation failed");
                ErrorCode::Internal
            }
        }
    }
}

impl From<session::Error> for ErrorDetails {
    fn from(error: session::Error) -> Self {
        Self {
            code: ErrorCode::from(error).into(),
        }
    }
}

impl From<session::Error> for Status {
    fn from(error: session::Error) -> Self {
        status(error.into())
    }
}

impl From<storage::Error<session::Error>> for storage::Error<Status> {
    fn from(error: storage::Error<session::Error>) -> Self {
        match error {
            storage::Error::Transaction(error) => Self::Transaction(error),
            error => Self::Resource(error.into()),
        }
    }
}

impl From<tenant::Error> for ErrorCode {
    fn from(error: tenant::Error) -> Self {
        match error {
            tenant::Error::InvalidId => ErrorCode::InvalidInput,
            tenant::Error::AlreadyExists => ErrorCode::AlreadyExists,
            tenant::Error::InvalidKey => ErrorCode::Unauthenticated,
            tenant::Error::KeyGeneration | tenant::Error::KeyCollision => {
                tracing::error!(%error, "tenant operation failed");
                ErrorCode::Internal
            }
        }
    }
}

impl From<tenant::Error> for ErrorDetails {
    fn from(error: tenant::Error) -> Self {
        Self {
            code: ErrorCode::from(error).into(),
        }
    }
}

impl From<tenant::Error> for Status {
    fn from(error: tenant::Error) -> Self {
        status(error.into())
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

impl From<receipt::Error> for ErrorCode {
    fn from(error: receipt::Error) -> Self {
        match error {
            receipt::Error::Expired => ErrorCode::Unavailable,
            error => {
                tracing::error!(%error, "transaction receipt failed");
                ErrorCode::Internal
            }
        }
    }
}

impl From<receipt::Error> for ErrorDetails {
    fn from(error: receipt::Error) -> Self {
        Self {
            code: ErrorCode::from(error).into(),
        }
    }
}

impl From<receipt::Error> for Status {
    fn from(error: receipt::Error) -> Self {
        status(error.into())
    }
}

impl<E: Into<Status>> From<storage::Error<E>> for Status {
    fn from(error: storage::Error<E>) -> Self {
        match error {
            storage::Error::Open(error) => {
                tracing::error!(error = format!("{error:#}"), "fdb database unavailable");
            }
            storage::Error::Transaction(error) => {
                // Translate only after the retry runner has handled the original FDB error.
                if error
                    .get_fdb_error()
                    .is_some_and(|error| error.code() == TRANSACTION_TOO_LARGE_CODE)
                {
                    return status(ErrorCode::Capacity);
                }
                tracing::error!(%error, "fdb transaction failed");
            }
            storage::Error::InvalidKeyHash(error) => {
                tracing::error!(%error, "stored key hash decoding failed");
            }
            storage::Error::InvalidObjectId(error) => {
                tracing::error!(%error, "stored object ID decoding failed");
            }
            storage::Error::Resource(error) => return error.into(),
            storage::Error::Receipt(error) => return error.into(),
        }
        status(ErrorCode::Internal)
    }
}
