use anyhow::Result;

use super::{db_file_path, spawn_db_runner};

/// Execute read-only SQL (from stdin) against the pod database `name`. The
/// runner opens the database read-only with `PRAGMA query_only=ON` and returns
/// capped rows in the stdout JSON envelope. Runs as `agent-proxied` like
/// `function run`.
pub async fn cmd_db_query(name: &str) -> Result<()> {
    let db_path = db_file_path(name)?;

    let code = spawn_db_runner("db-query", &[db_path.as_os_str()], true).await?;
    std::process::exit(code);
}
