use std::process::Stdio;

use anyhow::{anyhow, Result};
use tokio::process::Command;

use super::{ensure_runner, resolve_existing};

/// Execute a function. stdin (request envelope) and stdout (response JSON) are
/// inherited so they stream straight through the runner; the runner's exit code
/// becomes ours.
pub async fn cmd_function_run(name: &str) -> Result<()> {
    let path = resolve_existing(name)?;
    let runner = ensure_runner()?;
    let status = Command::new("bun")
        .arg(&runner)
        .arg("run")
        .arg(&path)
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .await
        .map_err(|e| anyhow!("failed to run bun: {e}"))?;
    std::process::exit(status.code().unwrap_or(1));
}
