use std::time::Instant;

use anyhow::{anyhow, Result};
use tokio::io::AsyncReadExt as _;

use super::envelope::{ResultDelivery, ResultEnvelope, RunnerKind, TimingsMs};
use super::warm::{self, WarmRun};
use super::{emit_error, resolve_existing, spawn_function_at};
use crate::api::DustApiClient;

const SANDBOX_TOKEN_ENV: &str = "DUST_SANDBOX_TOKEN";
const NON_JSON_SNIPPET_MAX_CHARS: usize = 512;

/// Execute a function and deliver its response.
///
/// The request envelope is read from stdin and the function runs unprivileged
/// (agent uid) when dsbx is invoked as root.
///
/// The invocation is served warm when a resident server for this function is
/// listening (see `warm.rs`): one unix-socket round trip instead of a runner
/// spawn. A cold run additionally leaves a warm server behind for the next
/// invocation. Both paths produce the same runner `Output` JSON.
///
/// Delivery modes:
/// - `callback` (default): POST the runner response to the Dust result API when
///   `DUST_SANDBOX_TOKEN` is set. As a testing/local convenience, when there is
///   no sandbox token the API call is skipped and the bare runner response is
///   written to dsbx's stdout instead (previous behavior).
/// - `stdout`: print a protocol v3 envelope on stdout and exit 0, including for
///   runner `ok:false` and for failures that keep the function from being
///   spawned at all, so the worker keeps structured errors. Never POSTs the
///   callback.
pub async fn cmd_function_run(name: &str, result_delivery: ResultDelivery) -> Result<()> {
    let started = Instant::now();

    // The envelope is consumed here rather than inherited by the runner child:
    // the warm path forwards it over the socket, and the cold path pipes it.
    let mut input = String::new();
    if let Err(e) = tokio::io::stdin().read_to_string(&mut input).await {
        let err = emit_error(anyhow!("failed to read request envelope: {e}"));
        return match result_delivery {
            ResultDelivery::Callback => Err(err),
            ResultDelivery::Stdout => deliver_stdout_envelope(
                ResultEnvelope::stdout_invocation_failed(err.to_string()),
                0,
            ),
        };
    }

    if let WarmRun::Outcome(outcome) = warm::try_warm_run(name, &input).await {
        let runner_ms = started.elapsed().as_millis() as u64;
        return match result_delivery {
            ResultDelivery::Callback => deliver_callback_outcome(name, outcome).await,
            ResultDelivery::Stdout => deliver_stdout_envelope(
                ResultEnvelope::stdout_outcome(
                    outcome,
                    Some(TimingsMs {
                        total: started.elapsed().as_millis() as u64,
                        runner: runner_ms,
                        runner_kind: Some(RunnerKind::Warm),
                    }),
                ),
                0,
            ),
        };
    }

    // Cold path. Resolve once: the run below and the warm server spawn both
    // need the handler path, and resolution lists the (gcsfuse-backed)
    // functions directory.
    let (spawned, handler) = match resolve_existing(name) {
        Ok(handler) => {
            let spawned = spawn_function_at(&handler, "run", Some(&input), true).await;
            (spawned, Some(handler))
        }
        // resolve_existing already emitted the `{error}` line; the message
        // (bad name, unset dir, missing or ambiguous bundle) propagates.
        Err(e) => (Err(e), None),
    };
    let runner_ms = started.elapsed().as_millis() as u64;

    // Leave a warm server behind so the next invocation of this function
    // skips the spawn. Fire-and-forget; never affects this run's outcome.
    if let Some(handler) = &handler {
        warm::spawn_server(name, handler);
    }

    match result_delivery {
        // Spawn failures keep propagating: the bare `{error}` line emit_error
        // printed is the contract here, and the exit code stays non-zero.
        ResultDelivery::Callback => {
            let (code, captured) = spawned?;
            deliver_callback(name, code, &captured.unwrap_or_default()).await
        }
        ResultDelivery::Stdout => deliver_stdout(
            spawned,
            TimingsMs {
                total: started.elapsed().as_millis() as u64,
                runner: runner_ms,
                runner_kind: Some(RunnerKind::Cold),
            },
        ),
    }
}

/// Callback delivery for a warm outcome: the runner `Output` is already
/// parsed, so it goes straight to the result API (or to stdout in the
/// local/no-token case, mirroring the cold path's convenience behavior).
async fn deliver_callback_outcome(name: &str, outcome: serde_json::Value) -> Result<()> {
    let have_token = std::env::var(SANDBOX_TOKEN_ENV)
        .map(|t| !t.is_empty())
        .unwrap_or(false);

    if !have_token {
        // Exit-code parity with the cold runner: 0 for ok, 2 for bad_input,
        // 1 for every other failure.
        let ok = outcome
            .get("ok")
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(false);
        let bad_input = outcome
            .pointer("/error/code")
            .and_then(serde_json::Value::as_str)
            == Some("bad_input");
        println!("{outcome}");
        std::process::exit(if ok {
            0
        } else if bad_input {
            2
        } else {
            1
        });
    }

    let client = DustApiClient::from_env()?;
    client
        .post_function_result(name, &outcome)
        .await
        .map_err(emit_error)?;
    std::process::exit(0);
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

fn deliver_stdout(spawned: Result<(i32, Option<String>)>, timings_ms: TimingsMs) -> ! {
    let (envelope, code) = stdout_result(spawned, timings_ms);
    deliver_stdout_envelope(envelope, code)
}

fn deliver_stdout_envelope(envelope: ResultEnvelope, code: i32) -> ! {
    envelope.write_to_stdout();
    std::process::exit(code);
}

/// Build the stdout delivery envelope and process exit code.
///
/// Exit is always 0 when a well-formed envelope is produced so the worker can
/// classify from `outcome` instead of treating the process as a hard failure.
fn stdout_result(
    spawned: Result<(i32, Option<String>)>,
    timings_ms: TimingsMs,
) -> (ResultEnvelope, i32) {
    // The function never ran (bad name, unset functions dir, missing or
    // ambiguous bundle, spawn/read failure): stdout delivery owes the worker an
    // envelope all the same. The bare `{error}` line emit_error already printed
    // stays ahead of it on stdout; the envelope is the last non-empty line.
    let (runner_exit_code, captured) = match spawned {
        Ok(spawned) => spawned,
        Err(err) => return (ResultEnvelope::stdout_invocation_failed(err.to_string()), 0),
    };

    let response = captured.unwrap_or_default();
    let line = last_non_empty_line(&response);
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

    fn timings(total: u64, runner: u64) -> TimingsMs {
        TimingsMs {
            total,
            runner,
            runner_kind: Some(RunnerKind::Cold),
        }
    }

    #[test]
    fn stdout_result_wraps_valid_json_and_exits_0() {
        let (envelope, code) = stdout_result(
            Ok((0, Some("noise\n{\"ok\":true,\"output\":1}\n".to_string()))),
            timings(12, 8),
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
        let (empty, empty_code) = stdout_result(Ok((7, Some(String::new()))), timings(1, 1));
        assert_eq!(empty_code, 0);
        assert_eq!(
            empty.outcome["error"]["message"],
            "function produced no output (runner exit 7)"
        );

        let (bad, bad_code) = stdout_result(Ok((1, Some("not-json\n".to_string()))), timings(1, 1));
        assert_eq!(bad_code, 0);
        let message = bad.outcome["error"]["message"]
            .as_str()
            .expect("invocation_failed message is a string");
        assert!(message.contains("runner exit 1"));
        assert!(message.contains("not-json"));
    }

    #[test]
    fn stdout_result_envelopes_spawn_failures_and_exits_0() {
        let (envelope, code) =
            stdout_result(Err(anyhow!("function not found: greet")), timings(1, 1));
        assert_eq!(code, 0);
        assert_eq!(envelope.delivery, ResultDelivery::Stdout);
        assert_eq!(
            envelope.outcome,
            serde_json::json!({
                "ok": false,
                "error": {
                    "code": "invocation_failed",
                    "message": "function not found: greet",
                }
            })
        );
    }

    #[test]
    fn last_non_empty_line_skips_trailing_blank_lines() {
        assert_eq!(last_non_empty_line("a\n\n"), "a");
        assert_eq!(last_non_empty_line("   \n"), "");
    }
}
