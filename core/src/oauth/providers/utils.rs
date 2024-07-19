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
            provider: provider,
            status: status.as_u16(),
            message: body,
        });
    }

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

    serde_json::from_slice(&b).map_err(|e| ProviderHttpRequestError::InvalidResponse(e.into()))
}
