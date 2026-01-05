use crate::{
    oauth::connection::{ConnectionProvider, PROVIDER_TIMEOUT_SECONDS},
    utils,
};
use anyhow::Result;
use hyper::body::Buf;
use reqwest::RequestBuilder;
use std::io::prelude::*;
use std::time::Duration;
use tokio::time::timeout;
use tracing::{error, warn};

#[derive(Debug, thiserror::Error)]
pub enum ProviderHttpRequestError {
    #[error("Network error: {0}")]
    NetworkError(reqwest::Error),
    #[error("Timeout error")]
    Timeout,
    #[error("Request failed for provider {provider}. Status: {status}. {message}")]
    RequestFailed {
        provider: ConnectionProvider,
        status: u16,
        message: String,
    },
    #[error("Invalid response: {0}")]
    InvalidResponse(anyhow::Error),
}

pub async fn execute_request(
    provider: ConnectionProvider,
    req: RequestBuilder,
) -> Result<serde_json::Value, ProviderHttpRequestError> {
    let now = utils::now_secs();

    let res = timeout(Duration::from_secs(PROVIDER_TIMEOUT_SECONDS), req.send())
        .await
        .map_err(|_| ProviderHttpRequestError::Timeout)?
        .map_err(|e| ProviderHttpRequestError::NetworkError(e))?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res
            .text()
            .await
            .unwrap_or_else(|_| String::from("Unable to read response body"));

        return Err(ProviderHttpRequestError::RequestFailed {
            provider,
            status: status.as_u16(),
            message: body,
        });
    }

    // Get Content-Type header before consuming the response body
    let content_type = res
        .headers()
        .get("content-type")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("")
        .to_lowercase();

    let body = timeout(
        Duration::from_secs(PROVIDER_TIMEOUT_SECONDS - (utils::now_secs() - now)),
        res.bytes(),
    )
    .await
    .map_err(|_| ProviderHttpRequestError::Timeout)?
    .map_err(|e| ProviderHttpRequestError::NetworkError(e))?;

    let mut b: Vec<u8> = vec![];
    body.reader()
        .read_to_end(&mut b)
        .map_err(|e| ProviderHttpRequestError::InvalidResponse(e.into()))?;

    // Log response body for debugging JSON parsing errors
    let body_str = String::from_utf8_lossy(&b);
    if body_str.is_empty() {
        error!(
            provider = ?provider,
            "Empty response body from OAuth provider token endpoint"
        );
        return Err(ProviderHttpRequestError::InvalidResponse(
            anyhow::anyhow!("Empty response body").into(),
        ));
    }

    // Check content_type to determine parsing strategy
    // OAuth 2.0 spec allows token endpoints to return either JSON or form-encoded
    let is_form_encoded = content_type.contains("application/x-www-form-urlencoded")
        || (!content_type.contains("application/json")
            && body_str.contains('=')
            && body_str.contains('&'));

    if is_form_encoded {
        warn!(
            provider = ?provider,
            content_type = %content_type,
            "Parsing form-encoded response from OAuth provider token endpoint"
        );

        let form_data: std::collections::HashMap<String, String> =
            url::form_urlencoded::parse(body_str.as_bytes())
                .into_owned()
                .collect();

        // Convert to JSON, handling numeric values for expires_in
        let mut json_obj = serde_json::Map::new();
        for (key, value) in form_data {
            // expires_in should be a number, not a string
            if key == "expires_in" {
                if let Ok(num) = value.parse::<u64>() {
                    json_obj.insert(key, serde_json::Value::Number(num.into()));
                } else {
                    json_obj.insert(key, serde_json::Value::String(value));
                }
            } else {
                json_obj.insert(key, serde_json::Value::String(value));
            }
        }

        Ok(serde_json::Value::Object(json_obj))
    } else {
        // Default to JSON parsing
        serde_json::from_slice::<serde_json::Value>(&b).map_err(|json_err| {
            error!(
                provider = ?provider,
                content_type = %content_type,
                body_length = b.len(),
                error = ?json_err,
                "Failed to parse response body as JSON"
            );
            ProviderHttpRequestError::InvalidResponse(json_err.into())
        })
    }
}
