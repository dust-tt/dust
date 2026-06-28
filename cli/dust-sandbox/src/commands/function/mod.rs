use std::path::PathBuf;

use anyhow::{anyhow, Result};

mod get;
mod run;

pub use get::cmd_function_get;
pub use run::cmd_function_run;

use std::fs;
use std::io::Write;

use clap::Subcommand;

const FUNCTIONS_DIR_ENV: &str = "DUST_FUNCTIONS_DIR";

/// The function bundle runner, pre-bundled (Zod inlined) at dev time and
/// committed. Embedded so `dsbx` is a single binary; cross-compilation does
/// not need `bun`.
const RUNNER_JS: &str = include_str!("../../../functions-runner/runner.js");

#[derive(Subcommand)]
pub enum FunctionCommand {
    /// Execute a function: request envelope JSON on stdin, response JSON on stdout
    Run {
        /// Function name (resolved to ${DUST_FUNCTIONS_DIR}/<name>.ts)
        name: String,
    },
    /// Print a function's JSON-Schema I/O contract
    Get {
        /// Function name (resolved to ${DUST_FUNCTIONS_DIR}/<name>.ts)
        name: String,
    },
}

/// Write the embedded runner to a stable temp path (once per version) and
/// return it. Idempotent across invocations.
pub(crate) fn ensure_runner() -> Result<PathBuf> {
    let path = std::env::temp_dir().join(format!(
        "dsbx-functions-runner-{}.js",
        env!("CARGO_PKG_VERSION")
    ));
    if !path.exists() {
        let mut file = fs::File::create(&path)
            .map_err(|e| anyhow!("failed to write runner to {}: {e}", path.display()))?;
        file.write_all(RUNNER_JS.as_bytes())
            .map_err(|e| anyhow!("failed to write runner: {e}"))?;
    }
    Ok(path)
}

/// Resolve a function, erroring with a JSON `{error}` on stdout (and a non-zero
/// exit) for the user-facing failure modes (bad env/name/missing file).
pub(crate) fn resolve_existing(name: &str) -> Result<PathBuf> {
    let path = resolve_function_path(name).map_err(emit_error)?;
    if !path.is_file() {
        return Err(emit_error(anyhow!("function not found: {name}")));
    }
    Ok(path)
}

/// Print `{ "error": msg }` to stdout and return an error that exits non-zero
/// without the tracing line (the JSON is the contract).
fn emit_error(error: anyhow::Error) -> anyhow::Error {
    println!("{}", serde_json::json!({ "error": error.to_string() }));
    error
}

/// A valid function name is a non-empty string of `[A-Za-z0-9_-]`. This both
/// matches the tool-name convention and prevents path traversal.
pub(crate) fn is_valid_name(name: &str) -> bool {
    !name.is_empty()
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

/// Resolve a function name to `${DUST_FUNCTIONS_DIR}/<name>.ts`.
pub(crate) fn resolve_function_path(name: &str) -> Result<PathBuf> {
    if !is_valid_name(name) {
        return Err(anyhow!(
            "invalid function name {name:?}: must match [A-Za-z0-9_-]+"
        ));
    }
    let dir = std::env::var(FUNCTIONS_DIR_ENV)
        .ok()
        .filter(|d| !d.is_empty())
        .ok_or_else(|| anyhow!("{FUNCTIONS_DIR_ENV} is not set"))?;
    Ok(PathBuf::from(dir).join(format!("{name}.ts")))
}

#[cfg(test)]
mod tests {
    use super::*;

    use std::sync::Mutex;
    static ENV_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn accepts_simple_names() {
        assert!(is_valid_name("greet"));
        assert!(is_valid_name("add_two"));
        assert!(is_valid_name("multiply-2"));
    }

    #[test]
    fn rejects_path_traversal_and_separators() {
        assert!(!is_valid_name(""));
        assert!(!is_valid_name(".."));
        assert!(!is_valid_name("../x"));
        assert!(!is_valid_name("a/b"));
        assert!(!is_valid_name("a\\b"));
        assert!(!is_valid_name("a.b"));
    }

    #[test]
    fn resolve_uses_env_dir_and_appends_ts() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var("DUST_FUNCTIONS_DIR", "/files/functions");
        let path = resolve_function_path("greet").expect("resolves");
        assert_eq!(path, std::path::PathBuf::from("/files/functions/greet.ts"));
        std::env::remove_var("DUST_FUNCTIONS_DIR");
    }

    #[test]
    fn resolve_errors_when_env_missing() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::remove_var("DUST_FUNCTIONS_DIR");
        assert!(resolve_function_path("greet").is_err());
    }

    #[test]
    fn resolve_errors_on_bad_name() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var("DUST_FUNCTIONS_DIR", "/files/functions");
        assert!(resolve_function_path("../escape").is_err());
        std::env::remove_var("DUST_FUNCTIONS_DIR");
    }
}
