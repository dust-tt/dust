use crate::rpc::{ErrorCode, ErrorDetails};
use prost::Message;
use tonic::{Code, Status};

/// @cc [owner:spolu,label:api;error-handling] dfs-status-details
/// Application failures MUST encode their `ErrorCode` as protobuf `ErrorDetails` in gRPC status
/// details. Public messages MUST describe the error class without including object data or bearer
/// credentials.
pub fn status(error: ErrorCode) -> Status {
    let (code, message) = match error {
        ErrorCode::Internal => (Code::Internal, "Internal error."),
        ErrorCode::InvalidInput => (Code::InvalidArgument, "Invalid input."),
        ErrorCode::NotFound => (Code::NotFound, "Not found."),
        ErrorCode::Forbidden => (Code::PermissionDenied, "Forbidden."),
        ErrorCode::Unauthenticated => (Code::Unauthenticated, "Unauthenticated."),
        ErrorCode::AlreadyExists => (Code::AlreadyExists, "Already exists."),
        ErrorCode::NotDirectory => (Code::FailedPrecondition, "Not a directory."),
        ErrorCode::IsDirectory => (Code::FailedPrecondition, "Is a directory."),
        ErrorCode::NotEmpty => (Code::FailedPrecondition, "Directory not empty."),
        ErrorCode::Capacity => (Code::ResourceExhausted, "Capacity exhausted."),
        ErrorCode::Unavailable => (Code::Unavailable, "Unavailable."),
        ErrorCode::Unsupported => (Code::Unimplemented, "Unsupported."),
        ErrorCode::NameTooLong => (Code::InvalidArgument, "Name too long."),
    };
    Status::with_details(
        code,
        message,
        ErrorDetails { code: error.into() }.encode_to_vec().into(),
    )
}
