use std::time::Instant;

use anyhow::{anyhow, Result};
use tokio::io::AsyncReadExt as _;

use super::archive;
use super::envelope::{ResolveKind, ResultEnvelope, RunnerKind, TimingsMs};
use super::warm::{self, WarmRun};
use super::{emit_error, functions_dir, resolve_existing, spawn_function_at};

const NON_JSON_SNIPPET_MAX_CHARS: usize = 512;
/// Sidecar the Bun runner stamps on its stdout JSON; lifted into the outer
/// envelope and stripped so front's strict outcome schema never sees it.
const DUST_RUNNER_TIMINGS_MS_KEY: &str = "_dustTimingsMs";

/// Execute a function and deliver its response.
///
/// The request envelope is read from stdin and the function runs unprivileged
/// (agent uid) when dsbx is invoked as root.
///
/// Fast path (warm enabled): ensure this publication's worker is ready, then
/// one unix-socket round trip. Durable path (warm off): cold Bun spawn, with
/// an optional local archive / sha cache so resolve skips gcsfuse.
///
/// The result is always a protocol v3 envelope on stdout, exit 0, including for
/// runner `ok:false` and for failures that keep the function from being spawned
/// at all, so the worker keeps structured errors.
///
/// Never actually returns: every path ends in a `deliver_stdout*` call, which
/// writes the envelope and exits. The `Result` is what the dispatch expects.
pub async fn cmd_function_run(name: &str) -> Result<()> {
    let started = Instant::now();

    // The envelope is consumed here rather than inherited by the runner child:
    // the warm path forwards it over the socket, and the cold path pipes it.
    let mut input = String::new();
    if let Err(e) = tokio::io::stdin().read_to_string(&mut input).await {
        let err = emit_error(anyhow!("failed to read request envelope: {e}"));
        deliver_stdout_envelope(ResultEnvelope::stdout_invocation_failed(err.to_string()), 0);
    }

    // Durable cold path only: land this publication's functions.tar locally
    // and fill the per-sha bundle cache. Fast path does the same inside
    // ensure_publication_worker.
    if !warm::warm_execution_enabled() {
        if let Ok(dir) = functions_dir() {
            let _ = archive::ensure_functions_archive_extracted(&dir);
        }
    }

    let warm_started = Instant::now();
    if let WarmRun::Outcome(outcome, phase, ensure_ms) = warm::try_warm_run(name, &input).await {
        let runner_ms = started.elapsed().as_millis() as u64;
        deliver_stdout_envelope(
            ResultEnvelope::stdout_outcome(
                outcome,
                Some(TimingsMs {
                    total: started.elapsed().as_millis() as u64,
                    runner: runner_ms,
                    runner_kind: Some(RunnerKind::Warm),
                    ensure: Some(ensure_ms),
                    warm_attempt: None,
                    resolve: None,
                    resolve_kind: None,
                    child: None,
                    import: None,
                    handler: phase.as_ref().and_then(|p| p.handler),
                }),
            ),
            0,
        );
    }
    let warm_attempt_ms = warm_started.elapsed().as_millis() as u64;

    // Cold path: sha cache (filled by the archive/ensure step) or legacy
    // gcsfuse readdir of DUST_FUNCTIONS_DIR.
    let stamped_sha256 = stamped_bundle_sha256(&input);
    let resolve_started = Instant::now();
    let (resolved, resolve_kind) = match stamped_sha256
        .as_deref()
        .filter(|_| super::is_valid_name(name))
        .and_then(warm::cached_bundle_path)
    {
        Some(cached) => (Ok(cached), ResolveKind::Cache),
        None => (resolve_existing(name), ResolveKind::Gcsfuse),
    };
    let resolve_ms = resolve_started.elapsed().as_millis() as u64;

    let child_started = Instant::now();
    let (spawned, handler) = match resolved {
        Ok(handler) => {
            let spawned = spawn_function_at(&handler, "run", Some(&input), true).await;
            (spawned, Some(handler))
        }
        // resolve_existing already emitted the `{error}` line; the message
        // (bad name, unset dir, missing or ambiguous bundle) propagates.
        Err(e) => (Err(e), None),
    };
    let child_ms = child_started.elapsed().as_millis() as u64;
    let runner_ms = started.elapsed().as_millis() as u64;

    if let Some(handler) = &handler {
        // Cache the bundle this run just read so the next cold run of this
        // publish skips gcsfuse. No-op when the run already came from the
        // cache. Best-effort; never affects this run's outcome.
        if let Some(sha256) = stamped_sha256.as_deref() {
            warm::populate_bundle_cache(handler, sha256);
        }
    }

    deliver_stdout(
        spawned,
        TimingsMs {
            total: started.elapsed().as_millis() as u64,
            runner: runner_ms,
            runner_kind: Some(RunnerKind::Cold),
            ensure: None,
            warm_attempt: Some(warm_attempt_ms),
            resolve: Some(resolve_ms),
            resolve_kind: Some(resolve_kind),
            child: Some(child_ms),
            import: None,
            handler: None,
        },
    )
}

/// The publish-time bundle hash front stamps into the request envelope, when
/// present. Extraction only — `cached_bundle_path` and
/// `populate_bundle_cache` validate the value before it touches any path.
fn stamped_bundle_sha256(input: &str) -> Option<String> {
    let envelope: serde_json::Value = serde_json::from_str(input).ok()?;
    Some(envelope.get("bundleSha256")?.as_str()?.to_string())
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
        Ok(mut outcome) => {
            let timings_ms = merge_runner_phase_timings(&mut outcome, timings_ms);
            (ResultEnvelope::stdout_outcome(outcome, Some(timings_ms)), 0)
        }
        Err(_) => {
            let snippet = truncate_chars(line, NON_JSON_SNIPPET_MAX_CHARS);
            if line.starts_with('{') || line.starts_with('[') {
                // A JSON-prefixed line that does not parse is a runner envelope
                // cut in transit, not a function printing prose: the function
                // ran, its result was lost. Classify honestly, and keep the
                // payload prefix out of the error message — a snippet of valid
                // JSON inside an error string reads like a wrapping bug and
                // sends builders chasing the wrong problem. The raw prefix
                // goes to stderr for the logs instead.
                let bytes_read = response.len();
                eprintln!("dsbx: truncated function output (read {bytes_read} bytes): {snippet}");
                return (
                    ResultEnvelope::stdout_error(
                        "output_truncated",
                        format!(
                            "function output was truncated in transit (read {bytes_read} bytes, \
                             runner exit {runner_exit_code}); return a smaller payload or write \
                             large data to a pod file"
                        ),
                    ),
                    0,
                );
            }
            (
                ResultEnvelope::stdout_invocation_failed(format!(
                    "function produced non-JSON output (runner exit {runner_exit_code}): {snippet}"
                )),
                0,
            )
        }
    }
}

/// Lift `_dustTimingsMs` from the Bun child's stdout JSON into the outer
/// envelope timings and remove the sidecar so the outcome stays
/// `{ok,output|error}` for front.
fn merge_runner_phase_timings(
    outcome: &mut serde_json::Value,
    mut timings_ms: TimingsMs,
) -> TimingsMs {
    let Some(obj) = outcome.as_object_mut() else {
        return timings_ms;
    };
    let Some(sidecar) = obj.remove(DUST_RUNNER_TIMINGS_MS_KEY) else {
        return timings_ms;
    };
    if let Some(import) = sidecar.get("import").and_then(|v| v.as_u64()) {
        timings_ms.import = Some(import);
    }
    if let Some(handler) = sidecar.get("handler").and_then(|v| v.as_u64()) {
        timings_ms.handler = Some(handler);
    }
    timings_ms
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
    use super::super::envelope::ResultDelivery;
    use super::*;

    fn timings(total: u64, runner: u64) -> TimingsMs {
        TimingsMs {
            total,
            runner,
            runner_kind: Some(RunnerKind::Cold),
            ensure: None,
            warm_attempt: None,
            resolve: None,
            resolve_kind: None,
            child: None,
            import: None,
            handler: None,
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
    fn stdout_result_lifts_runner_phase_timings_sidecar() {
        let (envelope, code) = stdout_result(
            Ok((
                0,
                Some(
                    r#"{"ok":true,"output":1,"_dustTimingsMs":{"import":40,"handler":5}}"#
                        .to_string(),
                ),
            )),
            timings(12, 8),
        );
        assert_eq!(code, 0);
        assert_eq!(
            envelope.outcome,
            serde_json::json!({ "ok": true, "output": 1 })
        );
        let timings = envelope.timings_ms.expect("timings present");
        assert_eq!(timings.import, Some(40));
        assert_eq!(timings.handler, Some(5));
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
    fn stdout_result_classifies_a_cut_json_line_as_output_truncated() {
        // A JSON-prefixed line that fails to parse is a truncated envelope:
        // the code is output_truncated, the message carries the byte count and
        // never the payload prefix (which reads like a wrapping bug).
        let cut = "{\"ok\":true,\"output\":{\"hello\":\"wor".to_string();
        let bytes_read = cut.len();
        let (envelope, code) = stdout_result(Ok((0, Some(cut))), timings(1, 1));
        assert_eq!(code, 0);
        assert_eq!(envelope.outcome["error"]["code"], "output_truncated");
        let message = envelope.outcome["error"]["message"]
            .as_str()
            .expect("output_truncated message is a string");
        assert!(message.contains(&format!("read {bytes_read} bytes")));
        assert!(message.contains("runner exit 0"));
        assert!(!message.contains("{\"ok\""));

        // Same for an array-prefixed line.
        let (envelope, _) = stdout_result(Ok((0, Some("[1,2,".to_string()))), timings(1, 1));
        assert_eq!(envelope.outcome["error"]["code"], "output_truncated");
    }

    #[test]
    fn stdout_result_keeps_the_snippet_for_genuinely_non_json_output() {
        let (envelope, code) = stdout_result(
            Ok((0, Some("some stray log line\n".to_string()))),
            timings(1, 1),
        );
        assert_eq!(code, 0);
        assert_eq!(envelope.outcome["error"]["code"], "invocation_failed");
        let message = envelope.outcome["error"]["message"]
            .as_str()
            .expect("invocation_failed message is a string");
        assert!(message.contains("non-JSON output"));
        assert!(message.contains("some stray log line"));
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

    #[test]
    fn stamped_bundle_sha256_extracts_only_a_string_stamp() {
        assert_eq!(
            stamped_bundle_sha256(r#"{"url":"http://x/","bundleSha256":"abc123"}"#),
            Some("abc123".to_string())
        );
        assert_eq!(stamped_bundle_sha256(r#"{"url":"http://x/"}"#), None);
        assert_eq!(stamped_bundle_sha256(r#"{"bundleSha256":42}"#), None);
        assert_eq!(stamped_bundle_sha256("not json"), None);
    }
}
