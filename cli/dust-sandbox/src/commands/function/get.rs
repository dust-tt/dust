use anyhow::Result;

use super::run_bun;

/// Print a function's JSON-Schema contract. No stdin; stdout/exit code pass
/// through from the runner. The bundle import (which executes the module's
/// top-level code) runs unprivileged (agent uid) when dsbx is invoked as root.
pub async fn cmd_function_get(name: &str) -> Result<()> {
    run_bun("get", name, false).await
}
