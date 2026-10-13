use dfs_protocol::rpc::ErrorCode;
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

/**
 * @cc [owner:fontanierh,label:error-handling] errno-mapping
 * Each dfs `ErrorCode` MUST map to this errno:
 * - `NOT_FOUND`: `ENOENT`
 * - `FORBIDDEN`, `UNAUTHENTICATED`: `EACCES`
 * - `INVALID_INPUT`: `EINVAL`
 * - `ALREADY_EXISTS`: `EEXIST`
 * - `NOT_DIRECTORY`: `ENOTDIR`
 * - `IS_DIRECTORY`: `EISDIR`
 * - `NOT_EMPTY`: `ENOTEMPTY`
 * - `NAME_TOO_LONG`: `ENAMETOOLONG`
 * - `UNSUPPORTED`: `EOPNOTSUPP`
 * - `INTERNAL`, `CAPACITY`, `UNAVAILABLE`: `EIO`
 */
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
        })
    }
}

/**
 * @cc [owner:fontanierh,label:error-handling] status-without-details
 * A failed call without readable `ErrorDetails` (a transport or gRPC framework error) MUST map to
 * `EIO`.
 */
impl From<Status> for Errno {
    fn from(_status: Status) -> Self {
        todo!()
    }
}
