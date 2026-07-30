use std::time::Instant;

use anyhow::{anyhow, Result};

use super::envelope::{ResultDelivery, ResultEnvelope, TimingsMs};
use super::{emit_error, spawn_function};
use crate::api::DustApiClient;

const SANDBOX_TOKEN_ENV: &str = "DUST_SANDBOX_TOKEN";

/// Execute a function and deliver its response.
///
/// The request envelope is read from stdin and the function runs unprivileged
/// (agent uid) when dsbx is invoked as root.
///
/// Delivery modes:
/// - `callback` (default): POST the runner response to the Dust result API when
///   `DUST_SANDBOX_TOKEN` is set. As a testing/local convenience, when there is
///   no sandbox token the API call is skipped and the bare runner response is
///   written to dsbx's stdout instead (previous behavior).
/// - `stdout`: print a protocol v3 envelope on stdout. Exit 0 whenever a
///   well-formed envelope was written, including for runner `ok:false`, so the
///   worker keeps structured errors. Never POSTs the callback.
pub async fn cmd_function_run(name: &str, result_delivery: ResultDelivery) -> Result<()> {
    let started = Instant::now();
    let (code, captured) = spawn_function("run", name, true, true).await?;
    let runner_ms = started.elapsed().as_millis() as u64;
    let response = captured.unwrap_or_default();

    match result_delivery {
        ResultDelivery::Callback => deliver_callback(name, code, &response).await,
        ResultDelivery::Stdout => {
            deliver_stdout(
                &response,
                TimingsMs {
                    total: started.elapsed().as_millis() as u64,
                    runner: runner_ms,
                },
            );
        }
    }
}

async fn deliver_callback(name: &str, code: i32, response: &str) -> Result<()> {
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
        .unwrap_or_else(|_| serde_json::Value::String(response.to_string()));

    let client = DustApiClient::from_env()?;
    client
        .post_function_result(name, &result)
        .await
        .map_err(emit_error)?;
    std::process::exit(0);
}

fn deliver_stdout(response: &str, timings_ms: TimingsMs) -> ! {
    let trimmed = response.trim();
    if trimmed.is_empty() {
        ResultEnvelope::stdout_invocation_failed("function produced no output").write_to_stdout();
        std::process::exit(1);
    }

    match serde_json::from_str::<serde_json::Value>(trimmed) {
        Ok(outcome) => {
            ResultEnvelope::stdout_outcome(outcome, Some(timings_ms)).write_to_stdout();
            // Exit 0 even when the runner reported ok:false, so the worker keeps
            // the structured error instead of a generic non-zero exit path.
            std::process::exit(0);
        }
        Err(_) => {
            ResultEnvelope::stdout_invocation_failed(
                "function produced non-JSON output that could not be wrapped as a result envelope",
            )
            .write_to_stdout();
            std::process::exit(1);
        }
    }
}
