use axum::{
    Json,
    http::{HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use serde::Serialize;
use thiserror::Error;

use crate::model::InvalidEntryName;

/**
 * @cc [owner:spolu,label:security] safe-api-errors
 * Error responses MUST contain only a stable code and a fixed public message, never object names,
 * IDs, grants, credentials, or storage error details. Missing and inaccessible objects MUST both
 * return NotFound; Forbidden is reserved for denied actions that disclose no hidden object.
 * Error responses MUST disable HTTP caching to prevent reuse across authorization changes.
 */
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ApiError {
    #[error("Invalid input.")]
    InvalidInput,
    #[error("Authentication required.")]
    Unauthenticated,
    #[error("Operation forbidden.")]
    Forbidden,
    #[error("Not found.")]
    NotFound,
    #[error("Not a directory.")]
    NotDirectory,
    #[error("HTTP method not allowed.")]
    MethodNotAllowed,
    #[error("Conflicting state.")]
    Conflict,
    #[error("Name too long.")]
    NameTooLong,
    #[error("Capacity exhausted.")]
    CapacityExhausted,
    #[error("Server unavailable.")]
    Unavailable,
    #[error("Operation unsupported.")]
    Unsupported,
    #[error("Internal server error.")]
    Internal,
}

impl ApiError {
    pub fn status(self) -> StatusCode {
        match self {
            Self::InvalidInput | Self::NameTooLong => StatusCode::BAD_REQUEST,
            Self::Unauthenticated => StatusCode::UNAUTHORIZED,
            Self::Forbidden => StatusCode::FORBIDDEN,
            Self::NotFound => StatusCode::NOT_FOUND,
            Self::NotDirectory => StatusCode::BAD_REQUEST,
            Self::MethodNotAllowed => StatusCode::METHOD_NOT_ALLOWED,
            Self::Conflict => StatusCode::CONFLICT,
            Self::CapacityExhausted => StatusCode::INSUFFICIENT_STORAGE,
            Self::Unavailable => StatusCode::SERVICE_UNAVAILABLE,
            Self::Unsupported => StatusCode::NOT_IMPLEMENTED,
            Self::Internal => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }
}

impl From<InvalidEntryName> for ApiError {
    fn from(error: InvalidEntryName) -> Self {
        match error {
            InvalidEntryName::InvalidComponent => Self::InvalidInput,
            InvalidEntryName::TooLong => Self::NameTooLong,
        }
    }
}

/// @swaggerschema ErrorResponse in server/openapi.yaml.
#[derive(Serialize)]
struct ErrorResponse {
    error: ErrorBody,
}

#[derive(Serialize)]
struct ErrorBody {
    code: ApiError,
    message: String,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let mut response = (
            self.status(),
            Json(ErrorResponse {
                error: ErrorBody {
                    code: self,
                    message: self.to_string(),
                },
            }),
        )
            .into_response();
        response
            .headers_mut()
            .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
        if self == Self::Unauthenticated {
            response
                .headers_mut()
                .insert(header::WWW_AUTHENTICATE, HeaderValue::from_static("Bearer"));
        }
        response
    }
}

#[cfg(test)]
mod tests {
    use axum::body::to_bytes;
    use serde_json::json;

    use super::*;

    #[tokio::test]
    async fn public_errors_have_stable_wire_codes_and_http_statuses() -> anyhow::Result<()> {
        for (error, status, code) in [
            (ApiError::InvalidInput, 400, "invalid_input"),
            (ApiError::Unauthenticated, 401, "unauthenticated"),
            (ApiError::Forbidden, 403, "forbidden"),
            (ApiError::NotFound, 404, "not_found"),
            (ApiError::NotDirectory, 400, "not_directory"),
            (ApiError::MethodNotAllowed, 405, "method_not_allowed"),
            (ApiError::Conflict, 409, "conflict"),
            (ApiError::NameTooLong, 400, "name_too_long"),
            (ApiError::CapacityExhausted, 507, "capacity_exhausted"),
            (ApiError::Unavailable, 503, "unavailable"),
            (ApiError::Unsupported, 501, "unsupported"),
            (ApiError::Internal, 500, "internal"),
        ] {
            let response = error.into_response();
            assert_eq!(response.status().as_u16(), status);
            assert_eq!(response.headers()[header::CONTENT_TYPE], "application/json");
            assert_eq!(response.headers()[header::CACHE_CONTROL], "no-store");
            if error == ApiError::Unauthenticated {
                assert_eq!(response.headers()[header::WWW_AUTHENTICATE], "Bearer");
            }
            let body = to_bytes(response.into_body(), 1024).await?;
            assert_eq!(
                serde_json::from_slice::<serde_json::Value>(&body)?,
                json!({"error": {"code": code, "message": error.to_string()}}),
            );
        }
        Ok(())
    }

    #[test]
    fn name_validation_does_not_echo_input_and_preserves_error_kind() -> anyhow::Result<()> {
        use crate::model::EntryName;

        for (name, expected) in [
            ("private/path".to_owned(), ApiError::InvalidInput),
            ("a".repeat(256), ApiError::NameTooLong),
        ] {
            let error = EntryName::new(&name)
                .err()
                .ok_or_else(|| anyhow::anyhow!("accepted invalid name"))?;
            assert_eq!(ApiError::from(error), expected);
            assert!(!expected.to_string().contains(&name));
        }
        Ok(())
    }
}
