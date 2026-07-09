use anyhow::Result;

use super::{db_file_path, spawn_runner};

/// Execute one SQL statement (from stdin) against the pod database `name`.
/// The runner allows SELECT and DML but refuses DDL/PRAGMA/ATTACH, so the
/// schema only evolves through reconcile. Rows come back in the stdout JSON
/// envelope; a result crossing the inline bounds is written in full to a
/// spill file the envelope names. Runs as `agent-proxied` like `function run`.
pub async fn cmd_db_query(name: &str) -> Result<()> {
    let db_path = db_file_path(name)?;

    let code = spawn_runner("db-query", &[db_path.as_os_str()], true).await?;
    std::process::exit(code);
}
