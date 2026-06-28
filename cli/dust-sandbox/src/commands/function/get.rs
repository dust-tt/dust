use std::process::Stdio;

use anyhow::Result;
use tokio::process::Command;

use super::{emit_error, ensure_runner, resolve_existing};

/// Print a function's JSON-Schema contract. No stdin; stdout/exit code pass
/// through from the runner.
pub async fn cmd_function_get(name: &str) -> Result<()> {
    let path = resolve_existing(name)?;
    let runner = ensure_runner()?;
    let status = Command::new("bun")
        .arg(&*runner)
        .arg("get")
        .arg(&path)
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .await
        .map_err(|e| emit_error(anyhow::anyhow!("failed to run bun: {e}")))?;
    runner.close().ok();
    std::process::exit(status.code().unwrap_or(1));
}
