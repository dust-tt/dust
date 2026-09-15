use std::ffi::OsStr;
use std::io::Read;

use anyhow::Result;
use serde::Serialize;

use crate::api::{DustApiClient, FrameDatabaseQueryResponse};

use super::super::frame::print_response;
use super::{
    db_file_path, emit_error, ensure_valid_db_name, execution_target, spawn_runner,
    DbExecutionTarget,
};

/// Env carrying the in-sandbox dir an oversized local query result spills into; set by Front per
/// exec. Absent, the runner falls back to a temp dir. The name must match the env var set in
/// front/lib/api/sandbox_functions/dsbx_db.ts.
const POD_QUERY_SPILL_DIR_ENV: &str = "DUST_POD_QUERY_SPILL_DIR";

/// Execute one SQL statement (from stdin) against the sandbox database `name`.
/// The runner allows SELECT and DML and refuses DDL (a statement that changes
/// the schema is rolled back), so the schema only evolves through reconcile.
/// Rows come back in the stdout JSON envelope; a result crossing the inline
/// bounds is written in full to a spill file — under the spill dir — the
/// envelope names. Runs as `agent-proxied` like `function run`.
pub async fn cmd_db_query(name: &str, frame_id: Option<&str>) -> Result<()> {
    match execution_target(frame_id)? {
        DbExecutionTarget::Local => run_local_query(name).await,
        DbExecutionTarget::RemoteFrame(frame_id) => run_remote_query(name, frame_id).await,
    }
}

async fn run_local_query(name: &str) -> Result<()> {
    let db_path = db_file_path(name)?;
    let spill_dir = std::env::var_os(POD_QUERY_SPILL_DIR_ENV).filter(|d| !d.is_empty());

    let mut args: Vec<&OsStr> = vec![db_path.as_os_str()];
    if let Some(dir) = &spill_dir {
        args.push(dir.as_os_str());
    }

    let code = spawn_runner("db-query", &args, true).await?;
    std::process::exit(code);
}

/// The stdout envelope for a remote query: `ok` plus the runner's snake_case fields, identical to
/// what a local `db query` prints.
#[derive(Serialize)]
struct QueryEnvelope {
    ok: bool,
    #[serde(flatten)]
    response: FrameDatabaseQueryResponse,
}

async fn run_remote_query(name: &str, frame_id: &str) -> Result<()> {
    let response = query_remote_database(name, frame_id)
        .await
        .map_err(emit_error)?;
    print_response(&QueryEnvelope { ok: true, response })
}

async fn query_remote_database(name: &str, frame_id: &str) -> Result<FrameDatabaseQueryResponse> {
    ensure_valid_db_name(name)?;
    let mut sql = String::new();
    std::io::stdin().read_to_string(&mut sql)?;
    DustApiClient::from_env()?
        .query_frame_database(frame_id, name, &sql)
        .await
}
