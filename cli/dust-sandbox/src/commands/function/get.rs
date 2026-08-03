use anyhow::Result;

use super::spawn_function;

/// Print a function's JSON-Schema contract. No stdin; stdout/exit code pass
/// through from the runner. The bundle import (which executes the module's
/// top-level code) runs unprivileged (agent uid) when dsbx is invoked as root.
pub async fn cmd_function_get(name: &str) -> Result<()> {
    let (code, _) = spawn_function("get", name, false, false).await?;
    std::process::exit(code);
}
