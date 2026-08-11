use std::fmt;

use serde::Deserialize;

/// Stable, machine-readable classification of a Dust API failure.
///
/// The string form (`as_str`) and the exit codes are a contract with sandbox
/// workloads that shell out to `dsbx tools --json` and parse stdout: both are
/// append-only. `retryable` states whether retrying the same command from the
/// same invocation can ever succeed — not whether the caller should retry.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApiErrorCode {
    /// The sandbox token was rejected. Terminal: the token is minted once per
    /// invocation with a ~2-minute TTL and cannot be refreshed from inside the
    /// sandbox, so retrying with the same environment is futile.
    InvalidSandboxToken,
    /// A function published as `fast` tried to call tools (403). Terminal for
    /// this invocation: the refusal is carried by the invocation token itself.
    /// The platform records the function as durable on refusal, so the *next*
    /// invocation works.
    FastFunctionCalledTools,
    /// Any other 4xx: the request as issued will keep failing.
    InvalidRequest,
    /// HTTP 429: the request was throttled and can be retried later.
    RateLimited,
    /// HTTP 5xx: transient server-side failure.
    ServerError,
}

impl ApiErrorCode {
    pub fn as_str(&self) -> &'static str {
        match self {
            ApiErrorCode::InvalidSandboxToken => "invalid_sandbox_token",
            ApiErrorCode::FastFunctionCalledTools => "fast_function_called_tools",
            ApiErrorCode::InvalidRequest => "invalid_request",
            ApiErrorCode::RateLimited => "rate_limited",
            ApiErrorCode::ServerError => "server_error",
        }
    }

    pub fn retryable(&self) -> bool {
        match self {
            ApiErrorCode::InvalidSandboxToken
            | ApiErrorCode::FastFunctionCalledTools
            | ApiErrorCode::InvalidRequest => false,
            ApiErrorCode::RateLimited | ApiErrorCode::ServerError => true,
        }
    }

    /// Distinct process exit codes so non-`--json` consumers can classify
    /// without parsing anything. 1 stays the generic failure (including a tool
    /// result with `isError: true`); 2 is reserved by clap for usage errors.
    /// 15 is allocated outside this enum, to offloaded tool output resolution
    /// failures (`OffloadResolutionError::EXIT_CODE`).
    pub fn exit_code(&self) -> i32 {
        match self {
            ApiErrorCode::InvalidRequest => 10,
            ApiErrorCode::InvalidSandboxToken => 11,
            ApiErrorCode::FastFunctionCalledTools => 12,
            ApiErrorCode::RateLimited => 13,
            ApiErrorCode::ServerError => 14,
        }
    }
}

/// A typed error for a front API failure (`{"error":{"type","message"}}` body
/// or an unparseable non-2xx response). Carried through `anyhow` so callers
/// can `downcast_ref::<DustApiError>()` — mirroring how transient
/// `reqwest::Error`s are recognized in the poll loop.
#[derive(Debug)]
pub struct DustApiError {
    pub code: ApiErrorCode,
    pub message: String,
    pub status: Option<u16>,
}

#[derive(Debug, Deserialize)]
struct ApiErrorEnvelope {
    error: ApiErrorBody,
}

#[derive(Debug, Deserialize)]
struct ApiErrorBody {
    #[serde(default, rename = "type")]
    error_type: Option<String>,
    #[serde(default)]
    message: Option<String>,
}

impl DustApiError {
    /// Build from a non-2xx HTTP response. Parses front's
    /// `{"error":{"type","message"}}` envelope when present; otherwise
    /// classifies on the status alone and keeps the raw body as the message.
    pub fn from_http_response(status: u16, body: &str) -> Self {
        Self::parse_envelope(Some(status), body)
            .unwrap_or_else(|| Self::from_api_error(Some(status), None, body))
    }

    /// Parse a body shaped like front's `{"error":{"type","message"}}`
    /// envelope. `None` when the body is not an error envelope.
    pub fn parse_envelope(status: Option<u16>, body: &str) -> Option<Self> {
        let envelope = serde_json::from_str::<ApiErrorEnvelope>(body).ok()?;
        Some(Self::from_api_error(
            status,
            envelope.error.error_type.as_deref(),
            envelope
                .error
                .message
                .as_deref()
                .unwrap_or("unknown API error"),
        ))
    }

    /// Build from a parsed front `api_error`. `error_type` is front's
    /// `error.type` when the body carried one.
    pub fn from_api_error(status: Option<u16>, error_type: Option<&str>, message: &str) -> Self {
        let code = classify(status, error_type, message);
        // Name the token budget so consumers stop retrying a refusal that can
        // never succeed (the JWT is minted once per invocation with a
        // ~2-minute TTL). Scoped to the expired/invalid-token type: the other
        // `invalid_sandbox_token` sources (missing or non-sandbox token) are
        // configuration errors, not expiries.
        let message = if error_type == Some("invalid_sandbox_token_error") {
            format!(
                "{message} (the sandbox token is minted once per invocation with a ~2-minute \
                 TTL; retrying within this invocation cannot succeed)"
            )
        } else {
            message.to_string()
        };
        Self {
            code,
            message,
            status,
        }
    }

    /// The stdout contract under `tools --json`:
    /// `{"error":{"code","message","retryable","status"?}}`.
    pub fn to_envelope_json(&self) -> serde_json::Value {
        let mut error = serde_json::json!({
            "code": self.code.as_str(),
            "message": self.message,
            "retryable": self.code.retryable(),
        });
        if let Some(status) = self.status {
            error["status"] = serde_json::Value::from(status);
        }
        serde_json::json!({ "error": error })
    }
}

fn classify(status: Option<u16>, error_type: Option<&str>, message: &str) -> ApiErrorCode {
    match error_type {
        Some("invalid_sandbox_token_error") | Some("not_authenticated") => {
            ApiErrorCode::InvalidSandboxToken
        }
        Some("fast_function_called_tools") => ApiErrorCode::FastFunctionCalledTools,
        _ => match status {
            Some(429) => ApiErrorCode::RateLimited,
            Some(s) if s >= 500 => ApiErrorCode::ServerError,
            // Message fallback for fronts that still return the fast-mode
            // tools refusal as a generic `invalid_request_error`; removable
            // once `fast_function_called_tools` is served everywhere.
            Some(403) if message.contains("published as fast") => {
                ApiErrorCode::FastFunctionCalledTools
            }
            _ => ApiErrorCode::InvalidRequest,
        },
    }
}

impl fmt::Display for DustApiError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self.status {
            Some(status) => write!(
                f,
                "API error {status} ({}): {}",
                self.code.as_str(),
                self.message
            ),
            None => write!(f, "API error ({}): {}", self.code.as_str(), self.message),
        }
    }
}

impl std::error::Error for DustApiError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_invalid_sandbox_token_as_terminal() {
        let err = DustApiError::from_http_response(
            401,
            r#"{"error":{"type":"invalid_sandbox_token_error","message":"The sandbox token is invalid or expired."}}"#,
        );
        assert_eq!(err.code, ApiErrorCode::InvalidSandboxToken);
        assert!(!err.code.retryable());
        assert_eq!(err.code.exit_code(), 11);
        assert!(err.message.contains("~2-minute TTL"));
    }

    #[test]
    fn classifies_not_authenticated_as_invalid_sandbox_token() {
        // On sandbox endpoints the only credential is the sandbox token, so a
        // missing/non-sandbox token is the same terminal class as an expired
        // one; the TTL hint stays scoped to the expiry type.
        let err = DustApiError::from_http_response(
            401,
            r#"{"error":{"type":"not_authenticated","message":"This endpoint requires a sandbox token."}}"#,
        );
        assert_eq!(err.code, ApiErrorCode::InvalidSandboxToken);
        assert!(!err.message.contains("~2-minute TTL"));
    }

    #[test]
    fn classifies_fast_function_called_tools_by_type() {
        let err = DustApiError::from_http_response(
            403,
            r#"{"error":{"type":"fast_function_called_tools","message":"This Pod function is published as fast and cannot call tools."}}"#,
        );
        assert_eq!(err.code, ApiErrorCode::FastFunctionCalledTools);
        assert!(!err.code.retryable());
        assert_eq!(err.code.exit_code(), 12);
    }

    #[test]
    fn classifies_fast_function_called_tools_by_message_fallback() {
        // Older fronts return the refusal as a generic invalid_request_error.
        let err = DustApiError::from_http_response(
            403,
            r#"{"error":{"type":"invalid_request_error","message":"This Pod function is published as fast and cannot call tools. Publish it with executionMode `durable` to let it call tools."}}"#,
        );
        assert_eq!(err.code, ApiErrorCode::FastFunctionCalledTools);
    }

    #[test]
    fn classifies_other_403_as_invalid_request() {
        let err = DustApiError::from_http_response(
            403,
            r#"{"error":{"type":"invalid_request_error","message":"Tool not available."}}"#,
        );
        assert_eq!(err.code, ApiErrorCode::InvalidRequest);
        assert!(!err.code.retryable());
        assert_eq!(err.code.exit_code(), 10);
    }

    #[test]
    fn classifies_429_as_retryable() {
        let err = DustApiError::from_http_response(
            429,
            r#"{"error":{"type":"rate_limit_error","message":"Too many requests."}}"#,
        );
        assert_eq!(err.code, ApiErrorCode::RateLimited);
        assert!(err.code.retryable());
        assert_eq!(err.code.exit_code(), 13);
    }

    #[test]
    fn classifies_5xx_as_retryable_server_error() {
        let err = DustApiError::from_http_response(502, "Bad Gateway");
        assert_eq!(err.code, ApiErrorCode::ServerError);
        assert!(err.code.retryable());
        assert_eq!(err.code.exit_code(), 14);
        assert_eq!(err.message, "Bad Gateway");
    }

    #[test]
    fn non_json_body_keeps_raw_message() {
        let err = DustApiError::from_http_response(400, "<html>nope</html>");
        assert_eq!(err.code, ApiErrorCode::InvalidRequest);
        assert_eq!(err.message, "<html>nope</html>");
        assert_eq!(err.status, Some(400));
    }

    #[test]
    fn envelope_json_shape() {
        let err = DustApiError::from_http_response(
            403,
            r#"{"error":{"type":"fast_function_called_tools","message":"nope"}}"#,
        );
        let value = err.to_envelope_json();
        assert_eq!(value["error"]["code"], "fast_function_called_tools");
        assert_eq!(value["error"]["message"], "nope");
        assert_eq!(value["error"]["retryable"], false);
        assert_eq!(value["error"]["status"], 403);
    }

    #[test]
    fn envelope_json_omits_status_when_unknown() {
        let err = DustApiError::from_api_error(None, None, "boom");
        let value = err.to_envelope_json();
        assert!(value["error"].get("status").is_none());
        assert_eq!(value["error"]["code"], "invalid_request");
    }

    #[test]
    fn display_names_status_and_code() {
        let err = DustApiError::from_http_response(429, "slow down");
        assert_eq!(err.to_string(), "API error 429 (rate_limited): slow down");
    }

    #[test]
    fn downcasts_through_anyhow_context() {
        let err = anyhow::Error::new(DustApiError::from_http_response(500, "boom"))
            .context("POST https://dust.tt/api/v1/w/x/sandbox/actions/call");
        let api = err
            .downcast_ref::<DustApiError>()
            .expect("should downcast through context");
        assert_eq!(api.code, ApiErrorCode::ServerError);
    }
}
