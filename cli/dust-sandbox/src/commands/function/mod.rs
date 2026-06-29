use std::io::Write;
use std::os::unix::fs::chown;
use std::path::{Path, PathBuf};
use std::process::Stdio;

use anyhow::{anyhow, Result};
use clap::Subcommand;
use tempfile::{TempDir, TempPath};
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

/// The unprivileged, egress-proxied uid the sandbox runs agent code as — the
/// `agent-proxied` user (`SANDBOX_AGENT_PROXIED_UID` in front), whose `skuid` is
/// what `dsbx healthcheck`'s nftables rules force through the egress proxy.
/// Untrusted function code must run here too, so when `dsbx` is invoked
/// privileged (as root, by the sandbox resource) the `bun` child is downgraded
/// to this uid (its gid + supplementary groups are looked up, not assumed — the
/// user's primary group is `agent`, not 1003).
// Only referenced by the Linux privilege-drop path.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
const AGENT_UID: u32 = 1003;

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

/// The identity to downgrade the `bun` child to: the agent uid plus its real
/// primary gid and supplementary groups (resolved from /etc/passwd + /etc/group).
// Only constructed on Linux (privilege dropping is a Linux-sandbox concept); the
// fields are still read by run_bun on every platform.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
struct DropTarget {
    uid: libc::uid_t,
    gid: libc::gid_t,
    groups: Vec<libc::gid_t>,
}

/// Resolve how to downgrade the `bun` child, or `None` to run it as the current
/// user.
///
/// The function (runner harness + bundle) is untrusted, so when `dsbx` runs
/// privileged — as root, e.g. invoked by the sandbox resource — it is dropped to
/// the agent-proxied user so its network is forced through the egress proxy
/// (domain allowlisting + DSEC secret substitution) like agent code. When `dsbx`
/// is already unprivileged (local dev), there is nothing to contain and no
/// privilege to `setuid`, so the child runs as-is.
///
/// The gid and supplementary groups are looked up here, in the parent, because
/// `getpwuid`/`getgrouplist` are not async-signal-safe and must not run between
/// fork and exec; `pre_exec` then applies only `setgroups`/`setgid`/`setuid`.
#[cfg(target_os = "linux")]
fn resolve_drop_target() -> Result<Option<DropTarget>> {
    // SAFETY: geteuid only reads the caller's effective uid.
    if unsafe { libc::geteuid() } != 0 {
        return Ok(None);
    }

    // SAFETY: getpwuid returns a pointer into static storage valid until the
    // next getpw* call; we read the fields we need immediately.
    let pw = unsafe { libc::getpwuid(AGENT_UID as libc::uid_t) };
    if pw.is_null() {
        return Err(emit_error(anyhow!(
            "agent uid {AGENT_UID} not found (getpwuid); cannot drop privileges safely"
        )));
    }
    let gid = unsafe { (*pw).pw_gid };
    let name = unsafe { (*pw).pw_name };

    // getgrouplist fills the groups `agent-proxied` belongs to (incl. `agent`).
    // It returns -1 when the buffer is too small, setting `n` to the size needed.
    let mut n: libc::c_int = 32;
    let mut groups: Vec<libc::gid_t> = vec![0; n as usize];
    // SAFETY: `name` is valid (from pw); the buffer matches `n`.
    while unsafe { libc::getgrouplist(name, gid, groups.as_mut_ptr(), &mut n) } < 0 {
        groups.resize(n as usize, 0);
    }
    groups.truncate(n.max(0) as usize);

    Ok(Some(DropTarget {
        uid: AGENT_UID as libc::uid_t,
        gid,
        groups,
    }))
}

/// Non-Linux (dev) builds never drop privileges — the agent uid and its egress
/// containment are a Linux-sandbox concept.
#[cfg(not(target_os = "linux"))]
fn resolve_drop_target() -> Result<Option<DropTarget>> {
    Ok(None)
}

/// Spawn the embedded runner under `bun` for `subcommand` (`run` or `get`)
/// against the resolved function, and exit with the child's status code.
///
/// The `bun` child (runner harness + the untrusted function bundle) is
/// downgraded to the agent uid/gid (clearing supplementary groups) whenever
/// `dsbx` runs privileged — see [`privilege_drop_target`]. `dsbx` itself may
/// stay root: it chowns the runner and stages the bundle into a uid-owned temp
/// dir (named `<name>.ts` so `get`'s schema name is preserved), so the dropped
/// child can read both even when the originals are root-only.
pub(crate) async fn run_bun(subcommand: &str, name: &str, inherit_stdin: bool) -> Result<()> {
    let path = resolve_existing(name)?;
    // The function runs with $DUST_FUNCTIONS_DIR as its working directory (the
    // parent of the resolved <name>.ts), not wherever dsbx was invoked from.
    let functions_dir = path.parent().map(Path::to_path_buf);
    let runner = ensure_runner()?;
    let drop = resolve_drop_target()?;

    // Hold the staged temp dir alive until after the child exits.
    let mut staged: Option<TempDir> = None;
    let handler: PathBuf = match &drop {
        None => path,
        Some(t) => {
            chown(&runner, Some(t.uid), Some(t.gid)).map_err(|e| {
                emit_error(anyhow!("failed to prepare runner for uid {}: {e}", t.uid))
            })?;
            staged = Some(stage_bundle(&path, name, t.uid, t.gid)?);
            staged
                .as_ref()
                .expect("just set")
                .path()
                .join(format!("{name}.ts"))
        }
    };

    let mut cmd = Command::new("bun");
    cmd.arg(&*runner)
        .arg(subcommand)
        .arg(&handler)
        .stdin(if inherit_stdin {
            Stdio::inherit()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());
    if let Some(dir) = &functions_dir {
        // chdir happens before the pre_exec privilege drop, i.e. while still
        // root, so it works even when the dir is root-only.
        cmd.current_dir(dir);
    }

    if let Some(t) = drop {
        // Drop privileges in the forked child before exec, in order, while still
        // privileged: set the supplementary groups, then gid, then uid. The
        // closure runs post-fork/pre-exec, so it uses only async-signal-safe
        // syscalls (the group lookup already happened in the parent).
        let DropTarget { uid, gid, groups } = t;
        unsafe {
            cmd.pre_exec(move || {
                if libc::setgroups(groups.len() as _, groups.as_ptr()) != 0 {
                    return Err(std::io::Error::last_os_error());
                }
                if libc::setgid(gid) != 0 {
                    return Err(std::io::Error::last_os_error());
                }
                if libc::setuid(uid) != 0 {
                    return Err(std::io::Error::last_os_error());
                }
                Ok(())
            });
        }
    }

    let status = cmd
        .status()
        .await
        .map_err(|e| emit_error(anyhow!("failed to run bun: {e}")))?;
    runner.close().ok();
    if let Some(dir) = staged {
        dir.close().ok();
    }
    std::process::exit(status.code().unwrap_or(1));
}

/// Copy a function bundle into a fresh temp dir owned by `uid`/`gid`, as
/// `<name>.ts`, so a privileged dsbx can hand a (possibly root-only) bundle to
/// an unprivileged child. Returns the temp dir (kept alive by the caller).
fn stage_bundle(path: &Path, name: &str, uid: u32, gid: u32) -> Result<TempDir> {
    let bytes = std::fs::read(path)
        .map_err(|e| emit_error(anyhow!("failed to read function {name}: {e}")))?;
    let dir = tempfile::Builder::new()
        .prefix("dsbx-fn-")
        .tempdir()
        .map_err(|e| emit_error(anyhow!("failed to stage function {name}: {e}")))?;
    let staged = dir.path().join(format!("{name}.ts"));
    std::fs::write(&staged, &bytes)
        .map_err(|e| emit_error(anyhow!("failed to stage function {name}: {e}")))?;
    // The child must own/traverse the dir and read the file.
    chown(dir.path(), Some(uid), Some(gid))
        .and_then(|()| chown(&staged, Some(uid), Some(gid)))
        .map_err(|e| emit_error(anyhow!("failed to stage function {name}: {e}")))?;
    Ok(dir)
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
