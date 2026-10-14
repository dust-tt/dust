use dfs_protocol::{InvalidId, rpc::ErrorDetails};
use foundationdb::{FdbBindingError, FdbError};
use prost::Message;

use super::*;
use crate::auth::InvalidKeyHash;

fn assert_api_codes<E>(make_error: impl Fn() -> E, expected: ErrorCode)
where
    E: Into<ErrorCode> + Into<ErrorDetails> + Into<Status>,
{
    let code: ErrorCode = make_error().into();
    let details: ErrorDetails = make_error().into();
    let rpc_status: Status = make_error().into();
    let expected_status = status(expected);
    assert_eq!(code, expected);
    assert_eq!(details.code, i32::from(expected));
    assert_eq!(rpc_status.code(), expected_status.code());
    assert_eq!(rpc_status.message(), expected_status.message());
    assert_eq!(rpc_status.details(), expected_status.details());
}

#[test]
fn resource_errors_share_codes_across_api_conversions() {
    assert_api_codes(|| file::Error::Capacity, ErrorCode::Capacity);
    assert_api_codes(|| file::Error::InvalidBlock, ErrorCode::Internal);
    assert_api_codes(
        || file::Error::Object(object::Error::NotAuthorized),
        ErrorCode::NotFound,
    );

    assert_api_codes(|| object::Error::InvalidId, ErrorCode::InvalidInput);
    assert_api_codes(|| object::Error::VersionOverflow, ErrorCode::Internal);

    assert_api_codes(|| session::Error::InvalidSubject, ErrorCode::InvalidInput);
    assert_api_codes(|| session::Error::InvalidKey, ErrorCode::Unauthenticated);
    assert_api_codes(|| session::Error::NotFound, ErrorCode::NotFound);
    assert_api_codes(|| session::Error::AlreadyExists, ErrorCode::AlreadyExists);
    assert_api_codes(|| session::Error::ExpiryGeneration, ErrorCode::Internal);
    assert_api_codes(
        || session::Error::Tenant(tenant::Error::InvalidKey),
        ErrorCode::Unauthenticated,
    );

    assert_api_codes(|| tenant::Error::InvalidId, ErrorCode::InvalidInput);
    assert_api_codes(|| tenant::Error::AlreadyExists, ErrorCode::AlreadyExists);
    assert_api_codes(|| tenant::Error::InvalidKey, ErrorCode::Unauthenticated);
    assert_api_codes(|| tenant::Error::KeyGeneration, ErrorCode::Internal);
    assert_api_codes(|| tenant::Error::KeyCollision, ErrorCode::Internal);
}

#[test]
fn transaction_errors_preserve_retries_and_resource_statuses() -> Result<(), prost::DecodeError> {
    for error in [
        storage::Error::<Status>::from(storage::Error::<file::Error>::from(FdbBindingError::from(
            FdbError::from_code(1020),
        ))),
        storage::Error::<Status>::from(storage::Error::<object::Error>::from(
            FdbBindingError::from(FdbError::from_code(1020)),
        )),
        storage::Error::<Status>::from(storage::Error::<session::Error>::from(
            FdbBindingError::from(FdbError::from_code(1020)),
        )),
        storage::Error::<Status>::from(storage::Error::<tenant::Error>::from(
            FdbBindingError::from(FdbError::from_code(1020)),
        )),
    ] {
        let error = FdbBindingError::from(error);
        assert_eq!(error.get_fdb_error().map(|error| error.code()), Some(1020));
    }

    for (error, expected) in [
        (
            storage::Error::<Status>::from(storage::Error::Resource(file::Error::Capacity)),
            ErrorCode::Capacity,
        ),
        (
            storage::Error::<Status>::from(storage::Error::Resource(file::Error::Object(
                object::Error::NotAuthorized,
            ))),
            ErrorCode::NotFound,
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
            storage::Error::<Status>::from(storage::Error::Resource(session::Error::Tenant(
                tenant::Error::InvalidKey,
            ))),
            ErrorCode::Unauthenticated,
        ),
        (
            storage::Error::<Status>::from(storage::Error::Resource(tenant::Error::InvalidId)),
            ErrorCode::InvalidInput,
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
fn object_errors_preserve_retries_and_statuses_through_files() -> Result<(), prost::DecodeError> {
    let error: storage::Error<object::Error> =
        FdbBindingError::from(FdbError::from_code(1020)).into();
    let error = FdbBindingError::from(storage::Error::<file::Error>::from(error));
    assert_eq!(error.get_fdb_error().map(|error| error.code()), Some(1020));

    for (error, expected) in [
        (object::Error::InvalidId, ErrorCode::InvalidInput),
        (object::Error::NotFound, ErrorCode::NotFound),
        (object::Error::NotAuthorized, ErrorCode::NotFound),
        (object::Error::UnsupportedKind, ErrorCode::Unsupported),
    ] {
        let error = storage::Error::<file::Error>::from(storage::Error::Resource(error));
        let error = FdbBindingError::from(error);
        let error = storage::Error::<file::Error>::from(error);
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
