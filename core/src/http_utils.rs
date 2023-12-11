use axum::Json;
use hyper::StatusCode;
use serde::Serialize;
use serde_json::Value;

use crate::utils;

#[derive(Serialize)]
pub struct APIError {
    pub code: String,
    pub message: String,
}

#[derive(Serialize)]
pub struct APIResponse {
    pub error: Option<APIError>,
    pub response: Option<Value>,
}

pub fn error_response(
    status: StatusCode,
    code: &str,
    message: &str,
    error: Option<anyhow::Error>,
) -> (StatusCode, Json<APIResponse>) {
    utils::error(&format!("{}: {}\nError: {:?}", code, message, error));
    (
        status,
        Json(APIResponse {
            error: Some(APIError {
                code: code.to_string(),
                message: match error {
                    Some(err) => format!("{} (error: {:?})", message, err),
                    None => message.to_string(),
                },
            }),
            response: None,
        }),
    )
}
