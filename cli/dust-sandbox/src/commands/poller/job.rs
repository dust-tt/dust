use std::collections::BTreeMap;
use std::process::Stdio;
use std::time::Duration;

use anyhow::Context;
use serde::Deserialize;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tracing::warn;

use crate::commands::function::envelope::ResultEnvelope;

/// The runner, invoked by absolute path. The poller runs as its own user and must not resolve
/// anything through PATH.
const DSBX_BIN_PATH: &str = "/opt/bin/dsbx";
const SUDO_BIN_PATH: &str = "/usr/bin/sudo";

/// The user a Pod function runs as. The poller is more privileged than this and only ever drops
/// down to it: function code never runs in the poller's own process.
const WORKLOAD_USER: &str = "agent-proxied";

const WORKING_DIRECTORY: &str = "/home/agent";

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
/// Drops to the workload user through sudo rather than running the function as the poller. The
/// environment is passed through sudo's preserve list rather than on the command line: it carries
/// the invocation's credential, and argv is world-readable through /proc.
pub fn build_run_command(job: &PollerJob) -> Command {
    let preserved: Vec<&str> = job.env_vars.keys().map(String::as_str).collect();

    let mut command = Command::new(SUDO_BIN_PATH);
    command
        .arg(format!("--preserve-env={}", preserved.join(",")))
        .arg("-u")
        .arg(WORKLOAD_USER)
        .arg("--")
        .arg(DSBX_BIN_PATH)
        .arg("function")
        .arg("run")
        .arg("--result-delivery")
        .arg("stdout")
        // Everything after this is an operand: a slug is validated upstream, but the separator
        // keeps a value that starts with a dash from being read as a flag.
        .arg("--")
        .arg(&job.slug)
        .current_dir(WORKING_DIRECTORY)
        .env_clear()
        .envs(&job.env_vars)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    command
}

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

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(job.input_envelope.as_bytes())
            .await
            .context("failed to write the Pod function input")?;
        stdin.shutdown().await.ok();
    }

    let output = match tokio::time::timeout(
        Duration::from_millis(job.timeout_ms),
        child.wait_with_output(),
    )
    .await
    {
        Ok(result) => result.context("failed to run the Pod function")?,
        Err(_) => {
            anyhow::bail!(
                "Pod function did not finish within {}ms.",
                job.timeout_ms
            );
        }
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_result_envelope(&stdout)
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
        .filter(|line| !line.is_empty())
        .next_back()
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
                ("DUST_API_URL".to_string(), "https://dust.example".to_string()),
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
    fn drops_to_the_workload_user_through_absolute_paths() {
        let argv = command_argv(&build_run_command(&job()));

        assert_eq!(argv[0], SUDO_BIN_PATH);
        assert!(argv.contains(&"-u".to_string()));
        assert!(argv.contains(&WORKLOAD_USER.to_string()));
        assert!(argv.contains(&DSBX_BIN_PATH.to_string()));
    }

    #[test]
    fn keeps_the_invocation_credential_out_of_argv() {
        let argv = command_argv(&build_run_command(&job())).join(" ");

        // argv is world-readable through /proc, so the token travels in the environment and only
        // its name may appear here.
        assert!(!argv.contains("sbt-job"));
        assert!(argv.contains("DUST_SANDBOX_TOKEN"));
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
