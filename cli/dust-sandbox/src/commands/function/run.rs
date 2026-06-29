use anyhow::{anyhow, Result};

use super::{emit_error, spawn_function};
use crate::api::DustApiClient;

const SANDBOX_TOKEN_ENV: &str = "DUST_SANDBOX_TOKEN";

/// Execute a function and deliver its response.
///
/// The request envelope is read from stdin and the function runs unprivileged
/// (agent uid) when dsbx is invoked as root. The response is then delivered to
/// the Dust result API. As a testing/local convenience, when there is no sandbox
/// token (`DUST_SANDBOX_TOKEN` unset/empty) the API call is skipped and the
/// response is written to dsbx's stdout instead (the previous behavior).
pub async fn cmd_function_run(name: &str) -> Result<()> {
    let (code, captured) = spawn_function("run", name, true, true).await?;
    let response = captured.unwrap_or_default();

    let have_token = std::env::var(SANDBOX_TOKEN_ENV)
        .map(|t| !t.is_empty())
        .unwrap_or(false);

    // No sandbox token: local/testing — emit the response on stdout, as before.
    if !have_token {
        print!("{response}");
        std::process::exit(code);
    }

    // Sandbox: deliver the response to the Dust result API instead of stdout.
    if response.trim().is_empty() {
        return Err(emit_error(anyhow!(
            "function produced no output to deliver to the result API"
        )));
    }
    // The runner always emits a single JSON line; forward it as structured JSON
    // (fall back to a string if it somehow isn't valid JSON).
    let result: serde_json::Value = serde_json::from_str(response.trim())
        .unwrap_or_else(|_| serde_json::Value::String(response.clone()));

    let client = DustApiClient::from_env()?;
    client
        .post_function_result(name, &result)
        .await
        .map_err(emit_error)?;
    std::process::exit(0);
}
