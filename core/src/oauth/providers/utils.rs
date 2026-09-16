use crate::{
    oauth::connection::{provider_timeout_seconds, ConnectionProvider},
    utils,
};
use anyhow::Result;
use hyper::body::Buf;
use reqwest::{header::RETRY_AFTER, RequestBuilder, StatusCode};
use std::io::prelude::*;
use std::time::Duration;
use tokio::time::{sleep, timeout};
use tracing::{error, info};

pub fn network_error_kind(error: &reqwest::Error) -> &'static str {
    if error.is_timeout() {
        "timeout"
    } else if error.is_connect() {
        "connect"
    } else if error.is_request() {
        "request"
    } else if error.is_body() {
        "body"
    } else if error.is_decode() {
        "decode"
    } else if error.is_status() {
        "status"
    } else {
        "unknown"
    }
}

pub fn error_source_chain(error: &(dyn std::error::Error + '_)) -> String {
    let mut parts = vec![error.to_string()];
    let mut current = error.source();
    while let Some(source) = current {
        parts.push(source.to_string());
        current = source.source();
    }
    parts.join(" | ")
}

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

fn retry_after_delay(value: &str) -> Option<Duration> {
    if let Ok(seconds) = value.trim().parse::<u64>() {
        return Some(Duration::from_secs(seconds));
    }
    let date = chrono::DateTime::parse_from_rfc2822(value).ok()?;
    Some(
        (date.with_timezone(&chrono::Utc) - chrono::Utc::now())
            .to_std()
            .unwrap_or_default(),
    )
}

/// @cc [owner:aubin-tchoi,label:mcp;error-handling] mcp-token-rate-limit-retries
/// MCP token requests retry only HTTP 429, at most twice, within the provider timeout.
/// A valid Retry-After is a minimum delay; if it exceeds the remaining timeout,
/// return the 429 without retrying. Network failures and other statuses are not retried.
pub async fn execute_request(
    provider: ConnectionProvider,
    req: RequestBuilder,
) -> Result<serde_json::Value, ProviderHttpRequestError> {
    let start = std::time::Instant::now();
    let now = utils::now_secs();

    let timeout_secs = provider_timeout_seconds(provider);
    let timeout_duration = Duration::from_secs(timeout_secs);
    let retry_req = if matches!(
        provider,
        ConnectionProvider::Mcp | ConnectionProvider::McpStatic
    ) {
        req.try_clone()
    } else {
        None
    };
    let res = timeout(timeout_duration, async {
        let mut res = req.send().await?;
        for attempt in 0..2 {
            if res.status() != StatusCode::TOO_MANY_REQUESTS {
                break;
            }
            let Some(req) = retry_req.as_ref().and_then(RequestBuilder::try_clone) else {
                break;
            };
            let delay = res
                .headers()
                .get(RETRY_AFTER)
                .and_then(|value| value.to_str().ok())
                .and_then(retry_after_delay)
                .unwrap_or_else(|| Duration::from_secs(1 << attempt));
            if delay >= timeout_duration.saturating_sub(start.elapsed()) {
                break;
            }
            drop(res);
            sleep(delay).await;
            res = req.send().await?;
        }
        Ok::<_, reqwest::Error>(res)
    })
    .await
    .map_err(|_| ProviderHttpRequestError::Timeout)?
    .map_err(ProviderHttpRequestError::NetworkError)?;

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
        Duration::from_secs(timeout_secs.saturating_sub(utils::now_secs() - now)),
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

    info!(
        provider = ?provider,
        elapsed_ms = start.elapsed().as_millis(),
        "OAuth provider token request succeeded"
    );

    // Check content_type to determine parsing strategy
    // OAuth 2.0 spec allows token endpoints to return either JSON or form-encoded
    let is_form_encoded = content_type.contains("application/x-www-form-urlencoded");

    if is_form_encoded {
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

#[cfg(test)]
mod tests {
    use super::{execute_request, retry_after_delay, ProviderHttpRequestError};
    use crate::oauth::connection::ConnectionProvider;
    use axum::{
        http::{header::RETRY_AFTER, HeaderMap, HeaderValue, StatusCode},
        routing::post,
        Json, Router,
    };
    use axum_test::TestServer;
    use serde_json::json;
    use std::{
        sync::{
            atomic::{AtomicUsize, Ordering},
            Arc,
        },
        time::{Duration, Instant},
    };

    fn token_server(
        status: StatusCode,
        retry_after: Option<&'static str>,
        failures: usize,
    ) -> (TestServer, Arc<AtomicUsize>) {
        let attempts = Arc::new(AtomicUsize::new(0));
        let handler_attempts = attempts.clone();
        let app = Router::new().route(
            "/token",
            post(move |body: String| {
                let attempt = handler_attempts.fetch_add(1, Ordering::SeqCst);
                async move {
                    // Every retry must preserve the original token request.
                    assert_eq!(body, "grant_type=authorization_code&code=test-code");
                    let mut headers = HeaderMap::new();
                    if let Some(value) = retry_after {
                        headers.insert(RETRY_AFTER, HeaderValue::from_static(value));
                    }
                    (
                        if attempt < failures {
                            status
                        } else {
                            StatusCode::OK
                        },
                        headers,
                        Json(json!({ "access_token": "access-token" })),
                    )
                }
            }),
        );
        let server = TestServer::builder()
            .http_transport()
            .build(app)
            .expect("test token server should start");
        (server, attempts)
    }

    fn token_request(server: &TestServer) -> reqwest::RequestBuilder {
        reqwest::Client::new()
            .post(server.server_url("/token").expect("token URL should exist"))
            .form(&[("grant_type", "authorization_code"), ("code", "test-code")])
    }

    #[tokio::test]
    async fn token_request_honors_retry_after() {
        let (server, attempts) = token_server(StatusCode::TOO_MANY_REQUESTS, Some("1"), 1);
        let start = Instant::now();
        let result = execute_request(ConnectionProvider::Mcp, token_request(&server)).await;

        assert!(result.is_ok(), "token request failed: {result:?}");
        assert_eq!(attempts.load(Ordering::SeqCst), 2);
        assert!(start.elapsed() >= Duration::from_secs(1));
    }

    #[tokio::test]
    async fn token_request_retries_are_bounded_and_only_for_mcp_rate_limits() {
        for (provider, status, retry_after, failures, expected_attempts) in [
            (
                ConnectionProvider::Mcp,
                StatusCode::TOO_MANY_REQUESTS,
                Some("0"),
                3,
                3,
            ),
            (
                ConnectionProvider::McpStatic,
                StatusCode::TOO_MANY_REQUESTS,
                None,
                1,
                2,
            ),
            (
                ConnectionProvider::Mcp,
                StatusCode::TOO_MANY_REQUESTS,
                Some("invalid"),
                1,
                2,
            ),
            (
                ConnectionProvider::Mcp,
                StatusCode::TOO_MANY_REQUESTS,
                Some("60"),
                1,
                1,
            ),
            (
                ConnectionProvider::Mcp,
                StatusCode::UNAUTHORIZED,
                Some("0"),
                1,
                1,
            ),
            (
                ConnectionProvider::Github,
                StatusCode::TOO_MANY_REQUESTS,
                Some("0"),
                1,
                1,
            ),
        ] {
            let (server, attempts) = token_server(status, retry_after, failures);
            let result = execute_request(provider, token_request(&server)).await;

            assert_eq!(attempts.load(Ordering::SeqCst), expected_attempts);
            if expected_attempts > failures {
                assert!(result.is_ok(), "token request failed: {result:?}");
            } else {
                assert!(matches!(
                    result,
                    Err(ProviderHttpRequestError::RequestFailed { status: actual, .. })
                        if actual == status.as_u16()
                ));
            }
        }
    }

    #[test]
    fn retry_after_supports_seconds_and_http_dates() {
        assert_eq!(retry_after_delay("15"), Some(Duration::from_secs(15)));
        let future = chrono::Utc::now() + chrono::Duration::seconds(30);
        let delay = retry_after_delay(&future.format("%a, %d %b %Y %H:%M:%S GMT").to_string())
            .expect("HTTP date should parse");
        assert!(delay > Duration::from_secs(28) && delay <= Duration::from_secs(30));
        assert_eq!(
            retry_after_delay("Wed, 01 Jan 2020 00:00:00 GMT"),
            Some(Duration::ZERO)
        );
        assert_eq!(retry_after_delay("invalid"), None);
    }
}
