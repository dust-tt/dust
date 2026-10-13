use dfs_protocol::{InvalidId, rpc::ErrorDetails};
use foundationdb::{FdbBindingError, FdbError};
use prost::Message;

use super::*;
use crate::auth::InvalidKeyHash;

#[test]
fn transaction_errors_preserve_retries_and_resource_statuses() -> Result<(), prost::DecodeError> {
    for error in [
        storage::Error::<Status>::from(storage::Error::<tenant::Error>::from(
            FdbBindingError::from(FdbError::from_code(1020)),
        )),
        storage::Error::<Status>::from(storage::Error::<object::Error>::from(
            FdbBindingError::from(FdbError::from_code(1020)),
        )),
        storage::Error::<Status>::from(storage::Error::<file::Error>::from(FdbBindingError::from(
            FdbError::from_code(1020),
        ))),
    ] {
        let error = FdbBindingError::from(error);
        assert_eq!(error.get_fdb_error().map(|error| error.code()), Some(1020));
    }

    for (error, expected) in [
        (
            storage::Error::<Status>::from(storage::Error::Resource(tenant::Error::InvalidId)),
            ErrorCode::InvalidInput,
        ),
        (
            storage::Error::<Status>::from(storage::Error::Resource(object::Error::AlreadyExists)),
            ErrorCode::AlreadyExists,
        ),
        (
            storage::Error::<Status>::from(storage::Error::Resource(
                object::Error::InvalidXattrName,
            )),
            ErrorCode::InvalidInput,
        ),
        (
            storage::Error::<Status>::from(storage::Error::Resource(object::Error::XattrsTooLarge)),
            ErrorCode::InvalidInput,
        ),
        (
            storage::Error::<Status>::from(storage::Error::Resource(file::Error::InvalidLength)),
            ErrorCode::InvalidInput,
        ),
        (
            storage::Error::<Status>::from(file::Error::IsDirectory),
            ErrorCode::IsDirectory,
        ),
        (
            storage::Error::<Status>::from(object::Error::NotAuthorized),
            ErrorCode::NotFound,
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
fn tenant_errors_preserve_retries_and_statuses_through_sessions() -> Result<(), prost::DecodeError>
{
    let error: storage::Error<tenant::Error> =
        FdbBindingError::from(FdbError::from_code(1020)).into();
    let error = FdbBindingError::from(storage::Error::<session::Error>::from(error));
    assert_eq!(error.get_fdb_error().map(|error| error.code()), Some(1020));

    for (error, expected) in [
        (tenant::Error::InvalidId, ErrorCode::InvalidInput),
        (tenant::Error::InvalidKey, ErrorCode::Unauthenticated),
    ] {
        let error = storage::Error::<session::Error>::from(storage::Error::Resource(error));
        let error = FdbBindingError::from(error);
        let error = storage::Error::<session::Error>::from(error);
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
    let status: Status = file::Error::InvalidBlock.into();
    assert_eq!(status.code(), tonic::Code::Internal);
    assert_eq!(status.message(), "Internal error.");
    assert_eq!(
        ErrorDetails::decode(status.details())?.code(),
        ErrorCode::Internal
    );
    Ok(())
}
