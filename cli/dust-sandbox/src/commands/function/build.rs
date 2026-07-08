use std::path::Path;

use anyhow::{anyhow, Result};

use super::{emit_error, spawn_build};

/// Build a function: bundle the source at `src` with its relative imports and
/// extract its JSON-Schema contract, writing the bundle to `out_bundle` and the
/// schema to `out_schema`. External packages are left as imports for the sandbox
/// harness to resolve at invocation time.
///
/// Bundling and the schema-extracting import (which runs the module top-level)
/// run unprivileged (agent uid) when dsbx is invoked as root, like run/get.
/// stdout carries the runner's small `{ok}` / `{ok:false,error}` envelope, and
/// the caller reads the bundle and schema back from the output files.
pub async fn cmd_function_build(src: &str, out_bundle: &str, out_schema: &str) -> Result<()> {
    let src_path = Path::new(src);
    if !src_path.is_file() {
        return Err(emit_error(anyhow!("source not found: {src}")));
    }

    let code = spawn_build(src_path, Path::new(out_bundle), Path::new(out_schema)).await?;
    std::process::exit(code);
}
