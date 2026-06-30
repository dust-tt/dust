use std::io::Write;
use std::os::unix::fs::PermissionsExt as _;
use std::path::{Path, PathBuf};
use std::process::Stdio;

use anyhow::{anyhow, Result};
use clap::Subcommand;
use tempfile::{TempDir, TempPath};
use tokio::io::AsyncReadExt as _;
use tokio::process::Command;

mod get;
mod run;

pub use get::cmd_function_get;
pub use run::cmd_function_run;

const FUNCTIONS_DIR_ENV: &str = "DUST_FUNCTIONS_DIR";

/// The function bundle runner, pre-bundled (Zod inlined) at dev time and
/// committed. Embedded so `dsbx` is a single binary; cross-compilation does
/// not need `bun`.
const RUNNER_JS: &str = include_str!("../../../functions-runner/runner.js");

/// The unprivileged, egress-proxied user the sandbox runs agent code as (the
/// `agent-proxied` user created in the sandbox image; its `skuid` is what
/// `dsbx healthcheck`'s nftables rules force through the egress proxy). Untrusted
/// function code must run as this user too.
const AGENT_USER: &str = "agent-proxied";

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

/// Whether `dsbx` is running privileged (effective uid 0).
///
/// When it is — i.e. invoked by the sandbox resource as root — the untrusted
/// function must be dropped to the `agent-proxied` user so its network is forced
/// through the egress proxy (domain allowlisting + DSEC secret substitution)
/// like agent code. When `dsbx` is already unprivileged (local dev), there is
/// nothing to contain and no privilege to drop, so the function runs as the
/// current user.
fn running_as_root() -> bool {
    rustix::process::geteuid().is_root()
}

/// Spawn the embedded runner under `bun` for `subcommand` (`run` or `get`)
/// against the resolved function. Returns `(exit_code, captured_stdout)`; when
/// `capture_stdout` is set the child's stdout is captured (piped) and returned
/// instead of inherited, so the caller can deliver it somewhere (e.g. the Dust
/// result API). Does not exit the process — the caller decides.
///
/// The `bun` child (runner harness + the untrusted function bundle) is
/// downgraded to the `agent-proxied` user whenever `dsbx` runs privileged: the
/// child is launched via `runuser`, which resolves that user's uid/gid/
/// supplementary groups and drops privileges before exec — so `dsbx` needs no
/// unsafe privilege-dropping syscalls. `dsbx` may stay root to read bundles: it
/// stages the bundle into a temp dir (named `<name>.ts` so `get`'s schema name
/// is preserved) and makes both it and the runner world-readable, so the dropped
/// child can read them even when the originals are root-only. The contents are
/// not secret (the runner is embedded in the binary; the bundle is the function
/// being executed) and the temp names are random.
pub(crate) async fn spawn_function(
    subcommand: &str,
    name: &str,
    inherit_stdin: bool,
    capture_stdout: bool,
) -> Result<(i32, Option<String>)> {
    let path = resolve_existing(name)?;
    // The function runs with $DUST_FUNCTIONS_DIR as its working directory (the
    // parent of the resolved <name>.ts), not wherever dsbx was invoked from.
    let functions_dir = path.parent().map(Path::to_path_buf);
    let runner = ensure_runner()?;
    let as_agent = running_as_root();

    // Hold the staged temp dir alive until after the child exits.
    let mut staged: Option<TempDir> = None;
    let handler: PathBuf = if as_agent {
        // The dropped child must read the runner and the bundle, which dsbx (as
        // root) created — make them world-readable rather than chowning, so no
        // uid lookup is needed.
        set_mode(&runner, 0o644)
            .map_err(|e| emit_error(anyhow!("failed to prepare runner: {e}")))?;
        let dir = stage_bundle(&path, name)?;
        let handler = dir.path().join(format!("{name}.ts"));
        staged = Some(dir);
        handler
    } else {
        path
    };

    // When privileged, run the function as `agent-proxied` via `runuser`
    // (util-linux), which drops to that user (uid + primary gid + supplementary
    // groups) and execs `bun` — no privileged code in dsbx. Otherwise run `bun`
    // directly as the current (already unprivileged) user.
    let mut cmd = if as_agent {
        let mut c = Command::new("runuser");
        c.arg("-u")
            .arg(AGENT_USER)
            .arg("--")
            .arg("bun")
            .arg(&*runner)
            .arg(subcommand)
            .arg(&handler);
        c
    } else {
        let mut c = Command::new("bun");
        c.arg(&*runner).arg(subcommand).arg(&handler);
        c
    };
    cmd.stdin(if inherit_stdin {
        Stdio::inherit()
    } else {
        Stdio::null()
    })
    .stdout(if capture_stdout {
        Stdio::piped()
    } else {
        Stdio::inherit()
    })
    .stderr(Stdio::inherit());
    if let Some(dir) = &functions_dir {
        cmd.current_dir(dir);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| emit_error(anyhow!("failed to run function: {e}")))?;

    // Capturing reads stdout to EOF (child closes it on exit) before waiting.
    // Only stdout is piped; stderr/stdin are inherited, so there is no deadlock.
    let captured = if capture_stdout {
        let mut buf = Vec::new();
        if let Some(mut out) = child.stdout.take() {
            out.read_to_end(&mut buf)
                .await
                .map_err(|e| emit_error(anyhow!("failed to read function output: {e}")))?;
        }
        Some(String::from_utf8_lossy(&buf).into_owned())
    } else {
        None
    };

    let status = child
        .wait()
        .await
        .map_err(|e| emit_error(anyhow!("failed to run function: {e}")))?;
    runner.close().ok();
    if let Some(dir) = staged {
        dir.close().ok();
    }
    Ok((status.code().unwrap_or(1), captured))
}

/// Copy a function bundle into a fresh temp dir as `<name>.ts`, world-readable,
/// so a privileged dsbx can hand a (possibly root-only) bundle to the
/// unprivileged `agent-proxied` child. Returns the temp dir (kept alive by the
/// caller). Making the copy world-readable avoids needing the agent uid/gid.
fn stage_bundle(path: &Path, name: &str) -> Result<TempDir> {
    let stage_err = |e: std::io::Error| emit_error(anyhow!("failed to stage function {name}: {e}"));
    let bytes = std::fs::read(path)
        .map_err(|e| emit_error(anyhow!("failed to read function {name}: {e}")))?;
    let dir = tempfile::Builder::new()
        .prefix("dsbx-fn-")
        .tempdir()
        .map_err(stage_err)?;
    // The dropped child must traverse the dir and read the bundle.
    set_mode(dir.path(), 0o755).map_err(stage_err)?;
    let staged = dir.path().join(format!("{name}.ts"));
    std::fs::write(&staged, &bytes).map_err(stage_err)?;
    set_mode(&staged, 0o644).map_err(stage_err)?;
    Ok(dir)
}

/// Set a path's permission bits (used to make temp runner/bundle files readable
/// by the dropped child without a uid lookup).
fn set_mode(path: impl AsRef<Path>, mode: u32) -> std::io::Result<()> {
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(mode))
}

/// Write the embedded runner to a fresh uniquely-named temp file (mode 0600)
/// and return its `TempPath`. The file is deleted when the `TempPath` is closed
/// or dropped.
pub(crate) fn ensure_runner() -> Result<TempPath> {
    let mut file = tempfile::Builder::new()
        .prefix("dsbx-functions-runner-")
        .suffix(".js")
        .tempfile()
        .map_err(|e| anyhow!("failed to create runner temp file: {e}"))?;
    file.write_all(RUNNER_JS.as_bytes())
        .map_err(|e| anyhow!("failed to write runner: {e}"))?;
    Ok(file.into_temp_path())
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
pub(crate) fn emit_error(error: anyhow::Error) -> anyhow::Error {
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
