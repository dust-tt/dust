use anyhow::Result;

use super::run_bun;

/// Execute a function. The request envelope is read from stdin and the response
/// JSON is written to stdout (both inherited so they stream straight through the
/// runner); the runner's exit code becomes ours. The function runs unprivileged
/// (agent uid) when dsbx is invoked as root.
pub async fn cmd_function_run(name: &str) -> Result<()> {
    run_bun("run", name, true).await
}
