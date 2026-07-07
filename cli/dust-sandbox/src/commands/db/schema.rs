use std::path::Path;

use anyhow::Result;

use super::{db_file_path, spawn_db_runner};

/// Regenerate a drizzle `{db}.db.ts` schema file from the live pod database
/// `name`, writing it to `out_schema` (file-output pattern: the file is the
/// payload, stdout only carries the `{ok}` envelope). Column modes are not
/// recoverable from SQLite — front merges them from the stored manifests.
pub async fn cmd_db_schema(name: &str, out_schema: &str) -> Result<()> {
    let db_path = db_file_path(name)?;

    let code = spawn_db_runner(
        "db-schema",
        &[db_path.as_os_str(), Path::new(out_schema).as_os_str()],
        false,
    )
    .await?;
    std::process::exit(code);
}
