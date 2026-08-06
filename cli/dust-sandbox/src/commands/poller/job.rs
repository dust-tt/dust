use std::collections::BTreeMap;
use std::process::Stdio;
use std::time::Duration;

use anyhow::Context;
use serde::Deserialize;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tracing::warn;

use crate::commands::function::envelope::ResultEnvelope;

/// The runner, invoked by absolute path. The poller is privileged and must not resolve anything
/// through PATH.
const DSBX_BIN_PATH: &str = "/opt/bin/dsbx";

/// The account a Pod function runs as: `agent-proxied`, whose uid is fixed by the image and
/// mirrored in `SANDBOX_AGENT_PROXIED_UID` (front/lib/api/sandbox/image/types.ts).
///
/// Dropped to by uid rather than through a helper: sandbox images purge `sudo` and strip the setuid
/// bit from every local auth helper, on purpose, so there is nothing to shell out to. Setting the
/// child's credentials directly is also the narrower move, since it never puts the environment or
/// the function's slug through another program's parser.
const WORKLOAD_UID: u32 = 1003;
/// agent-proxied's own group, and the `agent` group it is a supplementary member of. The image
/// grants the shared pod databases to `agent`, so a function that loses that membership loses its
/// own state. Mirrors `SANDBOX_AGENT_PROXIED_UID` and `SANDBOX_AGENT_UID`.
const WORKLOAD_GID: u32 = 1003;
const AGENT_GID: u32 = 1002;

const WORKING_DIRECTORY: &str = "/home/agent";

/// The workload account's baseline environment. Mirrors `SANDBOX_AGENT_PROXIED_SAFE_PATH` in
/// front/lib/api/sandbox/hardening.ts, and the home `useradd --create-home` gives agent-proxied in
/// front/lib/api/sandbox/image/registry.ts. Equality is asserted in
/// front/lib/api/sandbox/hardening.test.ts, since neither side can import the other.
const WORKLOAD_PATH: &str =
    "/opt/venv/bin:/opt/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";
const WORKLOAD_HOME: &str = "/home/agent-proxied";

/// How much of a failed run's stderr reaches the log.
const LOG_TAIL_MAX_CHARS: usize = 2_048;

#[derive(Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PollerJob {
    pub invocation_id: String,
    pub function_id: String,
    pub slug: String,
    pub exec_token: String,
    pub input_envelope: String,
    /// Ordered so the command the poller builds is reproducible, which keeps the tests honest.
    pub env_vars: BTreeMap<String, String>,
    pub timeout_ms: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaimResponse {
    pub granted: bool,
    pub job: Option<PollerJob>,
}

/// Build the command that runs one job.
///
/// The function runs as the workload account, never as the poller. The environment carries the
/// invocation's credential and is set on the child directly, so it never reaches argv, which is
/// world-readable through /proc.
pub fn build_run_command(job: &PollerJob) -> Command {
    let mut command = Command::new(DSBX_BIN_PATH);
    command
        .arg("function")
        .arg("run")
        .arg("--result-delivery")
        .arg("stdout")
        // Everything after this is an operand: a slug is validated upstream, but the separator
        // keeps a value that starts with a dash from being read as a flag.
        .arg("--")
        .arg(&job.slug)
        .current_dir(WORKING_DIRECTORY)
        // Cleared so nothing of the poller's own environment reaches function code, then given the
        // workload account's baseline explicitly. The exec path inherits these from the sandbox
        // exec environment; here there is nothing to inherit, so they are stated. Mirrors
        // SANDBOX_AGENT_PROXIED_SAFE_PATH in front/lib/api/sandbox/hardening.ts.
        .env_clear()
        .env("PATH", WORKLOAD_PATH)
        .env("HOME", WORKLOAD_HOME)
        .envs(&job.env_vars)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        // A runner that outran its ceiling has to go with it. Without this the poller reports the
        // timeout while the function keeps running, past the deadline front sized the claim
        // against, still holding pod state and the invocation's credential.
        .kill_on_drop(true);

    drop_to_workload_account(&mut command);

    command
}

/// Drop the child to the workload account: supplementary groups, then group, then user.
///
/// Done in one `pre_exec` rather than through `Command::uid`/`gid` because the order is the whole
/// point and those run the callback after the uid is already dropped, which would leave `setgroups`
/// without the privilege it needs. `Command::groups` would express this directly but is still
/// nightly-only.
///
/// The supplementary list has to be stated. Inheriting it would both hand function code the
/// poller's groups and drop the `agent` membership that grants Pod functions read/write on the
/// shared pod databases.
#[cfg(unix)]
fn drop_to_workload_account(command: &mut Command) {
    use std::io::Error;

    // Safety: only async-signal-safe libc calls between fork and exec.
    unsafe {
        command.pre_exec(|| {
            // Its own process group, so the timeout can stop the whole run. The runner spawns bun
            // as a separate process, and killing only the direct child would leave function code
            // running past the deadline with the invocation's credential still in its environment.
            if libc::setpgid(0, 0) != 0 {
                return Err(Error::last_os_error());
            }
            let groups = [WORKLOAD_GID as libc::gid_t, AGENT_GID as libc::gid_t];
            if libc::setgroups(groups.len() as _, groups.as_ptr()) != 0 {
                return Err(Error::last_os_error());
            }
            if libc::setgid(WORKLOAD_GID as libc::gid_t) != 0 {
                return Err(Error::last_os_error());
            }
            if libc::setuid(WORKLOAD_UID as libc::uid_t) != 0 {
                return Err(Error::last_os_error());
            }
            Ok(())
        });
    }
}

#[cfg(not(unix))]
fn drop_to_workload_account(_command: &mut Command) {}

/// Run one job and return the result envelope to hand back to front.
///
/// Always produces an envelope: a job that could not be spawned, that outran its ceiling, or that
/// wrote nothing usable still has to settle, or the invocation hangs until the caller gives up.
pub async fn run_job(job: &PollerJob) -> serde_json::Value {
    match run_to_envelope(job).await {
        Ok(envelope) => envelope,
        Err(error) => {
            warn!(
                invocation_id = %job.invocation_id,
                error = %error,
                "Pod function job failed to produce a result"
            );
            serde_json::to_value(ResultEnvelope::stdout_invocation_failed(error.to_string()))
                .expect("ResultEnvelope serializes")
        }
    }
}

async fn run_to_envelope(job: &PollerJob) -> anyhow::Result<serde_json::Value> {
    let mut child = build_run_command(job)
        .spawn()
        .context("failed to start the Pod function runner")?;
    let child_pid = child.id();

    // The whole run is under one deadline, the write included. A runner that is alive but not
    // reading its stdin would otherwise block here forever on an input larger than the pipe
    // buffer, leaving a task and a child behind for the life of the pod.
    let run = async {
        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(job.input_envelope.as_bytes())
                .await
                .context("failed to write the Pod function input")?;
            stdin.shutdown().await.ok();
        }

        child
            .wait_with_output()
            .await
            .context("failed to run the Pod function")
    };

    let output = match tokio::time::timeout(Duration::from_millis(job.timeout_ms), run).await {
        Ok(result) => result?,
        Err(_) => {
            // The whole group, not just the child `kill_on_drop` would reach: the runner's own bun
            // process is what is actually executing the function.
            kill_run_group(child_pid);
            anyhow::bail!("Pod function did not finish within {}ms.", job.timeout_ms);
        }
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let envelope = parse_result_envelope(&stdout);
    if envelope.is_err() {
        // The exec path logs both streams when an envelope is rejected. Without stderr the only
        // thing left to go on is "produced no stdout result envelope", which says nothing about
        // why.
        warn!(
            invocation_id = %job.invocation_id,
            exit_code = output.status.code(),
            stderr = %truncate_for_log(&String::from_utf8_lossy(&output.stderr)),
            "Pod function did not produce a usable result envelope"
        );
    }

    envelope
}

/// Stop a timed-out run and everything it spawned.
///
/// The runner is its own process group leader, so one signal reaches the bun process actually
/// running the function. Best effort: a run that already exited is not an error.
#[cfg(unix)]
fn kill_run_group(child_pid: Option<u32>) {
    let Some(pid) = child_pid else {
        return;
    };
    // Safety: `killpg` on a pid we spawned into its own group.
    unsafe {
        libc::killpg(pid as libc::pid_t, libc::SIGKILL);
    }
}

#[cfg(not(unix))]
fn kill_run_group(_child_pid: Option<u32>) {}

fn truncate_for_log(value: &str) -> String {
    value.chars().take(LOG_TAIL_MAX_CHARS).collect()
}

/// Take the envelope the runner wrote, which is its last non-empty stdout line.
///
/// Forwarded to front as-is rather than interpreted: front already normalizes both the current and
/// the legacy envelope shapes, and a poller that re-encoded them would be a second place to keep
/// in step.
fn parse_result_envelope(stdout: &str) -> anyhow::Result<serde_json::Value> {
    let last_line = stdout
        .lines()
        .map(str::trim)
        .rfind(|line| !line.is_empty())
        .unwrap_or_default();

    if last_line.is_empty() {
        anyhow::bail!("Pod function produced no stdout result envelope.");
    }

    serde_json::from_str(last_line).context("Pod function stdout was not valid JSON")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn job() -> PollerJob {
        PollerJob {
            invocation_id: "sfi_1".to_string(),
            function_id: "sfn_1".to_string(),
            slug: "get-state".to_string(),
            exec_token: "sbt-job".to_string(),
            input_envelope: r#"{"method":"POST"}"#.to_string(),
            env_vars: BTreeMap::from([
                (
                    "DUST_API_URL".to_string(),
                    "https://dust.example".to_string(),
                ),
                ("DUST_SANDBOX_TOKEN".to_string(), "sbt-job".to_string()),
            ]),
            timeout_ms: 10_000,
        }
    }

    fn command_argv(command: &Command) -> Vec<String> {
        let std_command = command.as_std();
        std::iter::once(std_command.get_program())
            .chain(std_command.get_args())
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect()
    }

    #[test]
    fn runs_the_runner_by_absolute_path() {
        let argv = command_argv(&build_run_command(&job()));

        // The poller is privileged and must not resolve the runner through PATH.
        assert_eq!(argv[0], DSBX_BIN_PATH);
    }

    #[test]
    fn keeps_the_invocation_credential_out_of_argv() {
        let argv = command_argv(&build_run_command(&job())).join(" ");

        // argv is world-readable through /proc, so the token travels in the environment and never
        // appears here, under any name.
        assert!(!argv.contains("sbt-job"));
        assert!(!argv.contains("DUST_SANDBOX_TOKEN"));
    }

    #[test]
    fn separates_the_slug_from_the_runner_flags() {
        let argv = command_argv(&build_run_command(&job()));
        let separator = argv.iter().rposition(|arg| arg == "--").expect("separator");

        assert_eq!(argv[separator + 1], "get-state");
    }

    #[test]
    fn takes_the_last_line_as_the_envelope() {
        let envelope = parse_result_envelope(
            "some log line\n{\"protocolVersion\":3,\"delivery\":\"stdout\",\"outcome\":{\"ok\":true}}\n\n",
        )
        .expect("envelope");

        assert_eq!(envelope["outcome"]["ok"], serde_json::json!(true));
    }

    #[test]
    fn rejects_stdout_without_an_envelope() {
        assert!(parse_result_envelope("   \n\n").is_err());
        assert!(parse_result_envelope("not json").is_err());
    }

    #[tokio::test]
    async fn settles_a_job_whose_runner_cannot_start() {
        // The runner is absent in tests, which is the spawn-failure path: it still has to produce
        // an envelope, or the invocation hangs until the caller gives up.
        let envelope = run_job(&job()).await;

        assert_eq!(envelope["outcome"]["ok"], serde_json::json!(false));
        assert_eq!(
            envelope["outcome"]["error"]["code"],
            serde_json::json!("invocation_failed")
        );
    }
}
