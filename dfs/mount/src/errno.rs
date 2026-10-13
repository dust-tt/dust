use dfs_protocol::rpc::{ErrorCode, ErrorDetails};
use prost::Message;
use std::fmt;
use tonic::Status;

/// A POSIX error number, as the kernel expects it in a FUSE reply.
/**
 * @cc [owner:fontanierh,label:error-handling] no-enosys
 * The mount MUST NOT return `ENOSYS`. FUSE reads it as "never supported" and stops sending that
 * operation for the rest of the mount. Use `EOPNOTSUPP` for operations not supported yet.
 */
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Errno(pub i32);

impl Errno {
    pub const ENOENT: Self = Self(libc::ENOENT);
    pub const EIO: Self = Self(libc::EIO);
    pub const EACCES: Self = Self(libc::EACCES);
    pub const EINVAL: Self = Self(libc::EINVAL);
    pub const EOPNOTSUPP: Self = Self(libc::EOPNOTSUPP);
}

impl fmt::Display for Errno {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "errno {}", self.0)
    }
}

impl std::error::Error for Errno {}

/**
 * @cc [owner:fontanierh,label:error-handling] errno-mapping
 * Each dfs `ErrorCode` MUST map to the errno in this table. A failure without `ErrorDetails`
 * (transport or gRPC framework error) MUST map to `EIO`.
 */
impl From<ErrorCode> for Errno {
    fn from(code: ErrorCode) -> Self {
        Self(match code {
            ErrorCode::Internal => libc::EIO,
            ErrorCode::InvalidInput => libc::EINVAL,
            ErrorCode::NotFound => libc::ENOENT,
            ErrorCode::Forbidden => libc::EACCES,
            // An expired or revoked session: the process cannot reach the files anymore.
            ErrorCode::Unauthenticated => libc::EACCES,
            ErrorCode::AlreadyExists => libc::EEXIST,
            ErrorCode::NotDirectory => libc::ENOTDIR,
            ErrorCode::IsDirectory => libc::EISDIR,
            ErrorCode::NotEmpty => libc::ENOTEMPTY,
            // The mount sizes its requests to fit the server limits; hitting one is a mount bug.
            ErrorCode::Capacity => libc::EIO,
            ErrorCode::Unavailable => libc::EIO,
            ErrorCode::Unsupported => libc::EOPNOTSUPP,
            ErrorCode::NameTooLong => libc::ENAMETOOLONG,
        })
    }
}

impl From<&ErrorDetails> for Errno {
    fn from(details: &ErrorDetails) -> Self {
        details.code().into()
    }
}

impl From<Status> for Errno {
    fn from(status: Status) -> Self {
        if status.details().is_empty() {
            return Self::EIO;
        }
        match ErrorDetails::decode(status.details()) {
            Ok(details) => (&details).into(),
            Err(_) => Self::EIO,
        }
    }
}
