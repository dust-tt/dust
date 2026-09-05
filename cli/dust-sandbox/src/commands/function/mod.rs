use std::io::Write;
use std::os::unix::fs::PermissionsExt as _;
use std::path::{Path, PathBuf};
use std::process::Stdio;

use anyhow::{anyhow, Result};
use clap::Subcommand;
use tempfile::TempPath;
use tokio::io::AsyncReadExt as _;
use tokio::process::Command;

mod build;
mod envelope;
mod get;
mod run;
mod warm;

pub use build::cmd_function_build;
pub use envelope::ResultDelivery;
pub use get::cmd_function_get;
pub use run::cmd_function_run;

const FUNCTIONS_DIR_ENV: &str = "DUST_FUNCTIONS_DIR";
const FUNCTION_WORKING_DIR_ENV: &str = "DUST_FUNCTION_WORKING_DIR";

/// The image's global npm modules (NPM_CONFIG_PREFIX=/opt/npm-global), holding the external
/// packages (zod and the curated `npm install -g` set) that function bundles leave as imports
/// rather than inlining. We point the runner's `bun` child at it via NODE_PATH so those imports
/// resolve wherever the bundle lives. This is the same global node_modules both the conversation
/// and pod sandboxes use for typescript/tsx, so functions share one toolchain.
/// TODO(SANDBOX FUNCTION) Consider adding a dedicated node_modules dedicated to sandbox functions.
const FUNCTIONS_GLOBAL_NODE_MODULES: &str = "/opt/npm-global/lib/node_modules";

/// The function bundle runner, a generated build artifact (Zod inlined), NOT
/// committed: `bun run build` in `functions-runner/` produces it before dsbx
/// compiles (see build.rs). Embedded so `dsbx` is a single binary;
/// cross-compilation does not need `bun`.
const RUNNER_JS: &str = include_str!("../../../functions-runner/runner.js");

/// The unprivileged, egress-proxied user the sandbox runs agent code as (the
/// `agent-proxied` user created in the sandbox image; its `skuid` is what
/// `dsbx healthcheck`'s nftables rules force through the egress proxy). Untrusted
/// function code must run as this user too.
const AGENT_USER: &str = "agent-proxied";
const DEFAULT_FUNCTION_WORKING_DIR: &str = "/home/agent";

#[derive(Subcommand)]
pub enum FunctionCommand {
    /// Execute a function. Request envelope JSON on stdin, protocol v3 result
    /// envelope on stdout.
    Run {
        /// Accepted and ignored: `stdout` is the only delivery mode. The flag
        /// stays because front still passes `--result-delivery stdout`, and
        /// dsbx is pinned by release, so a binary that rejected it would break
        /// every invocation the moment DSBX_CLI_VERSION moved. Remove it with
        /// front's argument, not before.
        #[arg(long, value_enum, default_value_t = ResultDelivery::Stdout)]
        result_delivery: ResultDelivery,
        /// Function name (resolved to a <name>.<ext> bundle in ${DUST_FUNCTIONS_DIR})
        name: String,
    },
    /// Print a function's JSON-Schema I/O contract
    Get {
        /// Function name (resolved to a <name>.<ext> bundle in ${DUST_FUNCTIONS_DIR})
        name: String,
    },
    /// Bundle a function source and extract its JSON-Schema contract to files
    Build {
        /// Path to the function source file (its relative imports are bundled)
        src: String,
        /// Output path for the bundle
        out_bundle: String,
        /// Output path for the extracted JSON-Schema contract
        out_schema: String,
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
/// unsafe privilege-dropping syscalls. The bundle is imported from its absolute
/// path in `$DUST_FUNCTIONS_DIR` (an agent-readable mount), but Bun is launched
/// from a local working directory instead of the gcsfuse-backed mount. The only
/// thing the dropped child can't otherwise read is the embedded-runner temp file
/// (created by root, 0600), which is made readable for it.
pub(crate) async fn spawn_function(
    subcommand: &str,
    name: &str,
    input: Option<&str>,
    capture_stdout: bool,
) -> Result<(i32, Option<String>)> {
    let handler = resolve_existing(name)?;
    spawn_function_at(&handler, subcommand, input, capture_stdout).await
}

/// Like [`spawn_function`], for an already-resolved handler path. `input` is
/// written to the child's stdin over a pipe when present (the caller has
/// already consumed its own stdin); `None` gives the child no stdin at all.
pub(crate) async fn spawn_function_at(
    handler: &Path,
    subcommand: &str,
    input: Option<&str>,
    capture_stdout: bool,
) -> Result<(i32, Option<String>)> {
    let runner = ensure_runner()?;
    let as_agent = running_as_root();
    let function_working_dir = function_working_dir();

    if as_agent {
        // The bundle is imported in place from the agent-readable mount; no staging.
        // Only the embedded-runner temp file (created by root, 0600) must be made
        // readable by the dropped agent-proxied child.
        set_mode(&runner, 0o644)
            .map_err(|e| emit_error(anyhow!("failed to prepare runner: {e}")))?;
    }

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
            .arg(handler);
        c
    } else {
        let mut c = Command::new("bun");
        c.arg(&*runner).arg(subcommand).arg(handler);
        c
    };
    // No env_clear: the child inherits dsbx's env verbatim, so per-exec vars
    // front sets (e.g. DUST_POD_DATABASES_DIR, read by `@dust/pod`) flow
    // through without dsbx naming each one — pinned by the inheritance tests.
    cmd.env("NODE_PATH", harness_node_path())
        .stdin(if input.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(if capture_stdout {
            Stdio::piped()
        } else {
            Stdio::inherit()
        })
        .stderr(Stdio::inherit());
    cmd.current_dir(function_working_dir);

    let mut child = cmd
        .spawn()
        .map_err(|e| emit_error(anyhow!("failed to run function: {e}")))?;

    // Feed stdin from a task so a child that never reads it cannot deadlock
    // against us while we wait on its stdout: the write and the read below
    // progress independently, and a broken pipe (child exited early) is fine.
    if let Some(input) = input {
        if let Some(mut stdin) = child.stdin.take() {
            let payload = input.as_bytes().to_vec();
            tokio::spawn(async move {
                use tokio::io::AsyncWriteExt as _;
                let _ = stdin.write_all(&payload).await;
                let _ = stdin.shutdown().await;
            });
        }
    }

    // Capturing reads stdout to EOF (child closes it on exit) before waiting.
    // Only stdout is piped for reading; stderr is inherited, so no deadlock.
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
    Ok((status.code().unwrap_or(1), captured))
}

/// Bundle the function source at `src` and extract its schema, writing the
/// bundle to `out_bundle` and the schema to `out_schema`. Returns the runner
/// exit code.
///
/// Like [`spawn_function`], the `bun` child (runner harness plus the untrusted
/// module it imports to read the schema) is dropped to `agent-proxied` via
/// `runuser` whenever `dsbx` runs privileged, so its egress is forced through
/// the proxy. The source is read in place (its relative imports must resolve
/// next to it, so it is not staged): the agent user reaches it through the same
/// group-based `/files` access agent code has, and writes the outputs into the
/// caller-owned scratch dir. stdout is inherited so the runner's `{ok}` envelope
/// reaches the caller.
pub(crate) async fn spawn_build(src: &Path, out_bundle: &Path, out_schema: &Path) -> Result<i32> {
    // The schema-extraction step imports the built bundle (running its
    // top-level code) and inherits dsbx's env like function runs do, so a
    // top-level `db()` call sees the same databases directory at build time.
    spawn_runner(
        "build",
        &[
            src.as_os_str(),
            out_bundle.as_os_str(),
            out_schema.as_os_str(),
        ],
        false,
    )
    .await
}

/// Spawn the embedded runner under `bun` for one runner subcommand (`build`, `db-*`).
/// Dropped to `agent-proxied` via `runuser` whenever dsbx runs privileged, NODE_PATH
/// prepended with the global npm modules (where drizzle-kit lives in the sandbox image),
/// stdout inherited so the runner's one-line JSON envelope reaches the caller. Returns the
/// exit code.
pub(crate) async fn spawn_runner(
    subcommand: &str,
    args: &[&std::ffi::OsStr],
    inherit_stdin: bool,
) -> Result<i32> {
    let runner = ensure_runner()?;
    let as_agent = running_as_root();
    if as_agent {
        // The dropped child must read the runner dsbx wrote as root (0600).
        set_mode(&runner, 0o644)
            .map_err(|e| emit_error(anyhow!("failed to prepare runner: {e}")))?;
    }

    let mut cmd = if as_agent {
        let mut c = Command::new("runuser");
        c.arg("-u")
            .arg(AGENT_USER)
            .arg("--")
            .arg("bun")
            .arg(&*runner);
        c
    } else {
        let mut c = Command::new("bun");
        c.arg(&*runner);
        c
    };
    cmd.arg(subcommand).args(args);
    cmd.env("NODE_PATH", harness_node_path())
        .stdin(if inherit_stdin {
            Stdio::inherit()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());

    let status = cmd
        .status()
        .await
        .map_err(|e| emit_error(anyhow!("failed to run bun: {e}")))?;

    runner.close().ok();

    Ok(status.code().unwrap_or(1))
}

/// NODE_PATH for the runner child: the global npm modules first, then any
/// inherited entries. NODE_PATH is additive, so a missing dir (local dev) falls
/// back to normal node_modules resolution.
fn harness_node_path() -> String {
    match std::env::var("NODE_PATH") {
        Ok(existing) if !existing.is_empty() => {
            format!("{FUNCTIONS_GLOBAL_NODE_MODULES}:{existing}")
        }
        _ => FUNCTIONS_GLOBAL_NODE_MODULES.to_string(),
    }
}

/// Cwd for `dsbx function run|get`.
///
/// The handler itself is still imported by absolute path from
/// `$DUST_FUNCTIONS_DIR`, but keeping the process cwd off the gcsfuse-backed
/// mount avoids slow Bun filesystem probing against the mount.
fn function_working_dir() -> PathBuf {
    std::env::var_os(FUNCTION_WORKING_DIR_ENV)
        .filter(|dir| !dir.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(DEFAULT_FUNCTION_WORKING_DIR))
}

/// Set a path's permission bits (used to make the runner temp file readable by
/// the dropped child without a uid lookup).
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

/// Resolve a function name to its bundle file in `$DUST_FUNCTIONS_DIR`,
/// extension-agnostically: the bundle is `<name>.<ext>` for whatever extension
/// `bun` can run (`.ts`, `.js`, `.mjs`, `.cjs`, ...), so the extension is not
/// assumed — the directory is scanned for a file whose stem is `<name>`.
///
/// Errors (as a JSON `{error}` on stdout + non-zero exit) for the user-facing
/// failure modes: bad name, unset dir, missing file, or an ambiguous match.
pub(crate) fn resolve_existing(name: &str) -> Result<PathBuf> {
    if !is_valid_name(name) {
        return Err(emit_error(anyhow!(
            "invalid function name {name:?}: must match [A-Za-z0-9_-]+"
        )));
    }
    let dir = functions_dir().map_err(emit_error)?;

    let entries = std::fs::read_dir(&dir)
        .map_err(|e| emit_error(anyhow!("cannot read {}: {e}", dir.display())))?;
    let mut matches: Vec<PathBuf> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.is_file() && path.file_stem().and_then(|s| s.to_str()) == Some(name))
        .collect();

    match matches.len() {
        0 => Err(emit_error(anyhow!("function not found: {name}"))),
        1 => Ok(matches.pop().expect("len == 1")),
        _ => {
            matches.sort();
            Err(emit_error(anyhow!(
                "multiple files match function {name}: {matches:?}"
            )))
        }
    }
}

/// The configured functions directory (`$DUST_FUNCTIONS_DIR`), required.
fn functions_dir() -> Result<PathBuf> {
    std::env::var(FUNCTIONS_DIR_ENV)
        .ok()
        .filter(|d| !d.is_empty())
        .map(PathBuf::from)
        .ok_or_else(|| anyhow!("{FUNCTIONS_DIR_ENV} is not set"))
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

#[cfg(test)]
pub(crate) use crate::commands::ENV_LOCK;

#[cfg(test)]
mod tests {
    use super::*;

    use super::ENV_LOCK;

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

    // Run `f` with DUST_FUNCTIONS_DIR pointing at a fresh temp dir (serialized,
    // since the env var is process-global).
    fn with_functions_dir<R>(f: impl FnOnce(&std::path::Path) -> R) -> R {
        let _guard = ENV_LOCK.lock().expect("ENV_LOCK poisoned");
        let dir = tempfile::tempdir().expect("tempdir");
        std::env::set_var(FUNCTIONS_DIR_ENV, dir.path());
        let result = f(dir.path());
        std::env::remove_var(FUNCTIONS_DIR_ENV);
        result
    }

    #[test]
    fn resolves_bundle_regardless_of_extension() {
        for ext in ["ts", "js", "mjs", "cjs"] {
            with_functions_dir(|dir| {
                let bundle = dir.join(format!("greet.{ext}"));
                std::fs::write(&bundle, b"export default {}").unwrap();
                assert_eq!(resolve_existing("greet").unwrap(), bundle);
            });
        }
    }

    #[test]
    fn errors_when_function_missing() {
        with_functions_dir(|_dir| {
            assert!(resolve_existing("greet").is_err());
        });
    }

    #[test]
    fn errors_when_multiple_extensions_match() {
        with_functions_dir(|dir| {
            std::fs::write(dir.join("greet.ts"), b"x").unwrap();
            std::fs::write(dir.join("greet.js"), b"x").unwrap();
            assert!(resolve_existing("greet").is_err());
        });
    }

    #[test]
    fn errors_when_env_missing() {
        let _guard = ENV_LOCK.lock().expect("ENV_LOCK poisoned");
        std::env::remove_var(FUNCTIONS_DIR_ENV);
        assert!(resolve_existing("greet").is_err());
    }

    #[test]
    fn errors_on_bad_name() {
        // A bad name is rejected before the directory is even read.
        let _guard = ENV_LOCK.lock().expect("ENV_LOCK poisoned");
        std::env::remove_var(FUNCTIONS_DIR_ENV);
        assert!(resolve_existing("../escape").is_err());
    }

    /// The pod-databases env contract: front sets it per exec, `@dust/pod`
    /// reads it in the bun child, and dsbx passes it along by plain env
    /// inheritance — the tests below pin that inheritance.
    const POD_DATABASES_DIR_ENV: &str = "DUST_POD_DATABASES_DIR";

    /// Restore an env var to its captured original value.
    fn restore_env(key: &str, original: Option<std::ffi::OsString>) {
        match original {
            Some(value) => std::env::set_var(key, value),
            None => std::env::remove_var(key),
        }
    }

    /// The e2e env tests spawn the real embedded runner under `bun`; skip
    /// gracefully where bun is unavailable (CI installs it before cargo test).
    fn bun_available() -> bool {
        std::process::Command::new("bun")
            .arg("--version")
            .output()
            .is_ok()
    }

    /// Function fixture that turns the bun child's environment into an
    /// observable output: its schema `description` is a template literal, so
    /// it is evaluated *inside whichever bun process imports the module*, and
    /// the schema text that comes back records what DUST_POD_DATABASES_DIR
    /// looked like in that child — `unset` when absent. Asserting on the
    /// schema output is therefore asserting on the child's env, from outside.
    /// `zod` resolves via NODE_PATH (set by the tests to the functions-runner
    /// package's node_modules).
    const ENV_PROBE_FIXTURE: &str = r#"import { z } from "zod";
export const schema = {
  description: `pod-databases-dir=${process.env.DUST_POD_DATABASES_DIR ?? "unset"}`,
  input: z.object({}),
  output: z.object({}),
};
export default {
  fetch() {
    return new Response("ok");
  },
};
"#;

    const RUNNER_NODE_MODULES: &str =
        concat!(env!("CARGO_MANIFEST_DIR"), "/functions-runner/node_modules");

    /// End-to-end pin of the env contract's dsbx hop, through the production
    /// `dsbx function get` path: a var present in dsbx's process env (front
    /// sets it per exec) must reach the untrusted bun child, where
    /// `@dust/pod`'s `db()` reads it. spawn_function has no forwarding code —
    /// the var travels by plain inheritance — so this test is what fails if
    /// anyone scrubs the child env later (env_clear, a runuser flag): cargo
    /// runs bun nowhere else.
    #[tokio::test]
    // The spawned bun child inherits process-global env, so the env lock must
    // span the spawn awaits; contending tests just block on the mutex (each
    // #[tokio::test] runs its own runtime, so no deadlock is possible).
    #[allow(clippy::await_holding_lock)]
    async fn function_get_bun_child_inherits_pod_databases_dir() {
        let _guard = ENV_LOCK.lock().expect("ENV_LOCK poisoned");
        if !bun_available() {
            eprintln!("skipping: bun not on PATH");
            return;
        }
        let original_functions_dir = std::env::var_os(FUNCTIONS_DIR_ENV);
        let original_working_dir = std::env::var_os(FUNCTION_WORKING_DIR_ENV);
        let original_node_path = std::env::var_os("NODE_PATH");
        let original_pod_dir = std::env::var_os(POD_DATABASES_DIR_ENV);

        // Stage the probe where resolve_existing() will find it, so
        // `spawn_function("get", "envprobe", ...)` runs the real runner
        // against it. `get` prints the probe's schema to stdout — which is
        // where the child's view of the env comes back out (see
        // ENV_PROBE_FIXTURE).
        let dir = tempfile::tempdir().expect("tempdir");
        std::fs::write(dir.path().join("envprobe.ts"), ENV_PROBE_FIXTURE).expect("fixture");
        std::env::set_var(FUNCTIONS_DIR_ENV, dir.path());
        std::env::set_var(FUNCTION_WORKING_DIR_ENV, dir.path());
        std::env::set_var("NODE_PATH", RUNNER_NODE_MODULES);

        // A var set on dsbx's own process reaches the child by inheritance.
        std::env::set_var(POD_DATABASES_DIR_ENV, "/custom/pod-databases");
        let (code, stdout) = spawn_function("get", "envprobe", None, true)
            .await
            .expect("spawn get");
        let stdout = stdout.unwrap_or_default();
        assert_eq!(code, 0, "runner failed: {stdout}");
        assert!(
            stdout.contains("pod-databases-dir=/custom/pod-databases"),
            "unexpected stdout: {stdout}"
        );

        // Absent env var: no dsbx-side default, the child sees it unset.
        // (Empty-string normalization is `@dust/pod`'s job, tested there.)
        std::env::remove_var(POD_DATABASES_DIR_ENV);
        let (code, stdout) = spawn_function("get", "envprobe", None, true)
            .await
            .expect("spawn get");
        let stdout = stdout.unwrap_or_default();
        assert_eq!(code, 0, "runner failed: {stdout}");
        assert!(
            stdout.contains("pod-databases-dir=unset"),
            "unexpected stdout: {stdout}"
        );

        restore_env(FUNCTIONS_DIR_ENV, original_functions_dir);
        restore_env(FUNCTION_WORKING_DIR_ENV, original_working_dir);
        restore_env("NODE_PATH", original_node_path);
        restore_env(POD_DATABASES_DIR_ENV, original_pod_dir);
    }

    /// Same pin for the `dsbx function build` path: schema extraction imports
    /// the just-built bundle in a bun child (running its top-level code), so
    /// a function calling `db()` at top level must see the same env at build
    /// time as at run time. Here the probe's env recording comes back through
    /// the extracted schema file rather than stdout.
    #[tokio::test]
    // See function_get_bun_child_inherits_pod_databases_dir: the env lock
    // intentionally spans the spawn await.
    #[allow(clippy::await_holding_lock)]
    async fn build_bun_child_inherits_pod_databases_dir() {
        let _guard = ENV_LOCK.lock().expect("ENV_LOCK poisoned");
        if !bun_available() {
            eprintln!("skipping: bun not on PATH");
            return;
        }
        let original_node_path = std::env::var_os("NODE_PATH");
        let original_pod_dir = std::env::var_os(POD_DATABASES_DIR_ENV);

        let src_dir = tempfile::tempdir().expect("src tempdir");
        let src = src_dir.path().join("envprobe.ts");
        std::fs::write(&src, ENV_PROBE_FIXTURE).expect("fixture");
        // Outputs go to a separate directory: bun's resolver caches the src
        // directory's entries during Bun.build, so importing a bundle written
        // into that same directory afterwards can fail resolution (observed on
        // macOS with bun 1.3.14).
        let out_dir = tempfile::tempdir().expect("out tempdir");
        let out_bundle = out_dir.path().join("out.bundle.js");
        let out_schema = out_dir.path().join("out.schema.json");
        std::env::set_var("NODE_PATH", RUNNER_NODE_MODULES);
        std::env::set_var(POD_DATABASES_DIR_ENV, "/custom/pod-databases");

        // Build's schema extraction imports the built bundle, so the fixture's
        // description records the env var the build-time bun child saw.
        let code = spawn_build(&src, &out_bundle, &out_schema)
            .await
            .expect("spawn build");
        assert_eq!(code, 0);
        let schema = std::fs::read_to_string(&out_schema).expect("schema file");
        assert!(
            schema.contains("pod-databases-dir=/custom/pod-databases"),
            "unexpected schema: {schema}"
        );

        restore_env("NODE_PATH", original_node_path);
        restore_env(POD_DATABASES_DIR_ENV, original_pod_dir);
    }

    #[test]
    fn uses_default_function_working_dir() {
        let _guard = ENV_LOCK.lock().expect("ENV_LOCK poisoned");
        let original_working_dir = std::env::var_os(FUNCTION_WORKING_DIR_ENV);

        std::env::remove_var(FUNCTION_WORKING_DIR_ENV);
        assert_eq!(
            function_working_dir(),
            PathBuf::from(DEFAULT_FUNCTION_WORKING_DIR)
        );

        if let Some(original_working_dir) = original_working_dir {
            std::env::set_var(FUNCTION_WORKING_DIR_ENV, original_working_dir);
        }
    }

    #[test]
    fn allows_function_working_dir_override() {
        let _guard = ENV_LOCK.lock().expect("ENV_LOCK poisoned");
        let original_working_dir = std::env::var_os(FUNCTION_WORKING_DIR_ENV);
        let working_dir = tempfile::tempdir().expect("working dir tempdir");

        std::env::set_var(FUNCTION_WORKING_DIR_ENV, working_dir.path());
        assert_eq!(function_working_dir(), working_dir.path());

        if let Some(original_working_dir) = original_working_dir {
            std::env::set_var(FUNCTION_WORKING_DIR_ENV, original_working_dir);
        } else {
            std::env::remove_var(FUNCTION_WORKING_DIR_ENV);
        }
    }
}
