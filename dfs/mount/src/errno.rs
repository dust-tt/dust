use dfs_protocol::rpc::{ErrorCode, ErrorDetails};
use prost::Message;
use std::fmt;
use tonic::{Code, Status};

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

impl From<ErrorCode> for Errno {
    fn from(code: ErrorCode) -> Self {
        Self(match code {
            ErrorCode::NotFound => libc::ENOENT,
            ErrorCode::Forbidden => libc::EACCES,
            // An expired or revoked session: the process cannot reach the files anymore.
            ErrorCode::Unauthenticated => libc::EACCES,
            ErrorCode::InvalidInput => libc::EINVAL,
            ErrorCode::AlreadyExists => libc::EEXIST,
            ErrorCode::NotDirectory => libc::ENOTDIR,
            ErrorCode::IsDirectory => libc::EISDIR,
            ErrorCode::NotEmpty => libc::ENOTEMPTY,
            ErrorCode::NameTooLong => libc::ENAMETOOLONG,
            ErrorCode::Unsupported => libc::EOPNOTSUPP,
            ErrorCode::Internal => libc::EIO,
            // The mount sizes its requests to fit the server limits; hitting one is a mount bug.
            ErrorCode::Capacity => libc::EIO,
            ErrorCode::Unavailable => libc::EIO,
            ErrorCode::WouldBlock => libc::EWOULDBLOCK,
            ErrorCode::LockLost => libc::EIO,
        })
    }
}

impl From<Status> for Errno {
    fn from(status: Status) -> Self {
        if !status.details().is_empty()
            && let Ok(details) = ErrorDetails::decode(status.details())
        {
            return details.code().into();
        }
        // No dfs error details: a transport failure, or a status from something other than the
        // dfs server. Classify it by its gRPC code.
        match status.code() {
            Code::NotFound => ErrorCode::NotFound,
            Code::PermissionDenied => ErrorCode::Forbidden,
            Code::Unauthenticated => ErrorCode::Unauthenticated,
            Code::InvalidArgument => ErrorCode::InvalidInput,
            Code::AlreadyExists => ErrorCode::AlreadyExists,
            Code::Unimplemented => ErrorCode::Unsupported,
            _ => ErrorCode::Internal,
        }
        .into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use dfs_protocol::error::status;

    #[test]
    fn status_details_take_precedence_over_the_grpc_code() {
        assert_eq!(
            Errno::from(status(ErrorCode::NotDirectory)),
            Errno(libc::ENOTDIR)
        );
        assert_eq!(
            Errno::from(status(ErrorCode::WouldBlock)),
            Errno(libc::EWOULDBLOCK)
        );
        assert_eq!(Errno::from(status(ErrorCode::LockLost)), Errno::EIO);
    }

    #[test]
    fn status_without_details_maps_from_the_grpc_code() {
        assert_eq!(Errno::from(Status::unauthenticated("")), Errno::EACCES);
        assert_eq!(Errno::from(Status::not_found("")), Errno::ENOENT);
        assert_eq!(Errno::from(Status::unimplemented("")), Errno::EOPNOTSUPP);
        assert_eq!(Errno::from(Status::unavailable("")), Errno::EIO);
    }
}
