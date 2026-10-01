use crate::rpc::{ErrorCode, ErrorDetails, Expected};
use prost::Message;
use tonic::{Code, Status};

pub fn status(error: ErrorCode) -> Status {
    detailed(error, Vec::new())
}

pub fn detailed(error: ErrorCode, current: Vec<Expected>) -> Status {
    let (code, message) = match error {
        ErrorCode::Internal => (Code::Internal, "Internal error."),
        ErrorCode::InvalidInput => (Code::InvalidArgument, "Invalid input."),
        ErrorCode::NotFound => (Code::NotFound, "Not found."),
        ErrorCode::Forbidden => (Code::PermissionDenied, "Forbidden."),
        ErrorCode::Unauthenticated => (Code::Unauthenticated, "Unauthenticated."),
        ErrorCode::VersionConflict => (Code::Aborted, "Version conflict."),
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
        ErrorDetails {
            code: error.into(),
            current,
        }
        .encode_to_vec()
        .into(),
    )
}

pub fn code(error: &Status) -> ErrorCode {
    if !error.details().is_empty()
        && let Ok(details) = ErrorDetails::decode(error.details())
        && let Ok(code) = ErrorCode::try_from(details.code)
    {
        return code;
    }
    match error.code() {
        Code::Unauthenticated => ErrorCode::Unauthenticated,
        Code::PermissionDenied => ErrorCode::Forbidden,
        Code::Unavailable | Code::DeadlineExceeded | Code::Cancelled => ErrorCode::Unavailable,
        Code::ResourceExhausted => ErrorCode::Capacity,
        _ => ErrorCode::Internal,
    }
}
