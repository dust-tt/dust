use std::path::Path;

use anyhow::{anyhow, Result};

use super::{db_file_path, emit_error, spawn_runner};

/// Reconcile the sandbox database `name` with the drizzle schema file at
/// `schema_file`: the runner plans via drizzle-kit, applies ADDITIVE statements
/// only (CREATE TABLE / ADD COLUMN / CREATE [UNIQUE] INDEX / DROP INDEX) in one
/// transaction, and rejects anything destructive with a typed error. The
/// database file is created on first claim. stdout carries the runner's
/// one-line JSON envelope; exit code passes through.
pub async fn cmd_db_reconcile(name: &str, schema_file: &str) -> Result<()> {
    let db_path = db_file_path(name)?;
    let schema_path = Path::new(schema_file);
    if !schema_path.is_file() {
        return Err(emit_error(anyhow!("schema file not found: {schema_file}")));
    }

    let code = spawn_runner(
        "db-reconcile",
        &[db_path.as_os_str(), schema_path.as_os_str()],
        false,
    )
    .await?;
    std::process::exit(code);
}
