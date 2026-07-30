use std::time::Instant;

use anyhow::{anyhow, Result};

use super::envelope::{ResultDelivery, ResultEnvelope, TimingsMs};
use super::{emit_error, spawn_function};
use crate::api::DustApiClient;

const SANDBOX_TOKEN_ENV: &str = "DUST_SANDBOX_TOKEN";
const NON_JSON_SNIPPET_MAX_CHARS: usize = 512;

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
    let runner_started = Instant::now();
    let (code, captured) = spawn_function("run", name, true, true).await?;
    let runner_ms = runner_started.elapsed().as_millis() as u64;
    let response = captured.unwrap_or_default();

    match result_delivery {
        ResultDelivery::Callback => deliver_callback(name, code, &response).await,
        ResultDelivery::Stdout => {
            deliver_stdout(
                &response,
                code,
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

    let line = last_non_empty_line(response);
    // Sandbox: deliver the response to the Dust result API instead of stdout.
    if line.is_empty() {
        return Err(emit_error(anyhow!(
            "function produced no output to deliver to the result API"
        )));
    }
    // The runner emits a JSON line; take the last non-empty line so incidental
    // console.log output on the same fd does not poison the callback body.
    let result: serde_json::Value =
        serde_json::from_str(line).unwrap_or_else(|_| serde_json::Value::String(line.to_string()));

    let client = DustApiClient::from_env()?;
    client
        .post_function_result(name, &result)
        .await
        .map_err(emit_error)?;
    std::process::exit(0);
}

fn deliver_stdout(response: &str, runner_exit_code: i32, timings_ms: TimingsMs) -> ! {
    let (envelope, code) = stdout_result(response, runner_exit_code, timings_ms);
    envelope.write_to_stdout();
    std::process::exit(code);
}

/// Build the stdout delivery envelope and process exit code.
///
/// Exit is always 0 when a well-formed envelope is produced so the worker can
/// classify from `outcome` instead of treating the process as a hard failure.
fn stdout_result(
    response: &str,
    runner_exit_code: i32,
    timings_ms: TimingsMs,
) -> (ResultEnvelope, i32) {
    let line = last_non_empty_line(response);
    if line.is_empty() {
        return (
            ResultEnvelope::stdout_invocation_failed(format!(
                "function produced no output (runner exit {runner_exit_code})"
            )),
            0,
        );
    }

    match serde_json::from_str::<serde_json::Value>(line) {
        Ok(outcome) => (ResultEnvelope::stdout_outcome(outcome, Some(timings_ms)), 0),
        Err(_) => {
            let snippet = truncate_chars(line, NON_JSON_SNIPPET_MAX_CHARS);
            (
                ResultEnvelope::stdout_invocation_failed(format!(
                    "function produced non-JSON output (runner exit {runner_exit_code}): {snippet}"
                )),
                0,
            )
        }
    }
}

fn last_non_empty_line(response: &str) -> &str {
    response
        .lines()
        .rev()
        .find(|line| !line.trim().is_empty())
        .map(str::trim)
        .unwrap_or("")
}

fn truncate_chars(value: &str, max_chars: usize) -> String {
    let mut out = String::new();
    for (i, ch) in value.chars().enumerate() {
        if i >= max_chars {
            out.push('…');
            break;
        }
        out.push(ch);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stdout_result_wraps_valid_json_and_exits_0() {
        let (envelope, code) = stdout_result(
            "noise\n{\"ok\":true,\"output\":1}\n",
            0,
            TimingsMs {
                total: 12,
                runner: 8,
            },
        );
        assert_eq!(code, 0);
        assert_eq!(envelope.delivery, ResultDelivery::Stdout);
        assert_eq!(
            envelope.outcome,
            serde_json::json!({ "ok": true, "output": 1 })
        );
    }

    #[test]
    fn stdout_result_exits_0_for_empty_and_non_json() {
        let (empty, empty_code) = stdout_result(
            "",
            7,
            TimingsMs {
                total: 1,
                runner: 1,
            },
        );
        assert_eq!(empty_code, 0);
        assert_eq!(
            empty.outcome["error"]["message"],
            "function produced no output (runner exit 7)"
        );

        let (bad, bad_code) = stdout_result(
            "not-json\n",
            1,
            TimingsMs {
                total: 1,
                runner: 1,
            },
        );
        assert_eq!(bad_code, 0);
        let message = bad.outcome["error"]["message"].as_str().unwrap();
        assert!(message.contains("runner exit 1"));
        assert!(message.contains("not-json"));
    }

    #[test]
    fn last_non_empty_line_skips_trailing_blank_lines() {
        assert_eq!(last_non_empty_line("a\n\n"), "a");
        assert_eq!(last_non_empty_line("   \n"), "");
    }
}
