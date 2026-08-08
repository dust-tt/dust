//! Warm-path client for `dsbx function run`.
//!
//! A cold function run pays process spawn, bundle resolution against the
//! gcsfuse-backed functions dir, and the import of the bundle and its
//! dependencies on every invocation. The warm path keeps a per-bundle bun
//! server (the embedded runner's `serve` subcommand) resident behind a unix
//! socket and forwards invocations to it, so a repeat invocation costs one
//! local socket round trip.
//!
//! The server runs invocations concurrently (protocol v2) and queues briefly
//! when saturated, so overlapping calls of one function no longer fan out
//! into cold runs. When the server refuses under saturation it answers with
//! a structured `overloaded` outcome, which is delivered to the caller as
//! the invocation's result — deliberately not a cold fallback, because
//! unbounded cold runs under load are what would exhaust the sandbox.
//!
//! Everything else is best-effort: any irregularity — missing socket, wrong
//! directory ownership, protocol mismatch, stale bundle — falls back to the
//! cold path, which is exactly today's behavior. The warm path can only ever
//! be a fast alternative, never a new failure mode.
//!
//! Security: the warm directory lives under $HOME, which in the sandbox is
//! `/home/agent-proxied`, owned by the agent-proxied uid (created by
//! `useradd --create-home`). The other untrusted sandbox user (`agent`,
//! uid 1002) must be unable to plant a socket that receives the request
//! environment, which carries the per-invocation sandbox token — hence the
//! strict ownership and mode verification on the directory before any use,
//! and the refusal to follow a directory we did not create with 0700.

use std::io::ErrorKind;
use std::os::unix::fs::{DirBuilderExt as _, MetadataExt as _, PermissionsExt as _};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use anyhow::Result;
use serde::Deserialize;
use tokio::io::{AsyncBufReadExt as _, AsyncWriteExt as _, BufReader};
use tokio::net::UnixStream;
use tokio::process::Command;

use super::RUNNER_JS;

pub const WARM_PROTOCOL_VERSION: u32 = 2;

/// Bound on the wait for the server's first frame (ack or refusal). It must
/// comfortably exceed the server's admission-queue deadline (~2s, see
/// serve.ts): a queued request receives nothing until it is started or
/// refused. On breach the stream is dropped, which closes the socket and
/// makes the server's eventual ack write fail — so abandoning a wedged or
/// queued server pre-ack can never race into a duplicate execution.
const WARM_FIRST_FRAME_TIMEOUT: Duration = Duration::from_secs(4);

/// Ceiling on the wait for the outcome once the server acked. Generous on
/// purpose: the function itself runs inside this window, and the caller
/// (front) enforces the real invocation timeout by killing dsbx. This only
/// bounds a wedged server.
const WARM_RESPONSE_TIMEOUT: Duration = Duration::from_secs(120);

/// Connect timeout: the server is either listening or it is not.
const WARM_CONNECT_TIMEOUT: Duration = Duration::from_millis(250);

#[derive(Debug, Deserialize)]
struct WarmFrame {
    v: u32,
    #[serde(default)]
    ack: bool,
    #[serde(default)]
    outcome: Option<serde_json::Value>,
    #[serde(default)]
    stale: bool,
    #[serde(default)]
    error: Option<String>,
}

/// The outcome of asking the warm server to run an invocation.
pub enum WarmRun {
    /// The server produced this runner `Output` JSON: a served invocation, a
    /// pre-execution classification (`bad_input`, `overloaded` — delivered as
    /// the result, never retried cold), or the synthesized failure outcome
    /// when the server acked (the function started executing) but the outcome
    /// was lost: past the ack the cold path is off the table, because
    /// re-running a function that may already have fired its side effects is
    /// worse than failing the invocation.
    Outcome(serde_json::Value),
    /// No usable warm server (not running, stale bundle, protocol mismatch,
    /// ownership refusal, first frame overdue...). Nothing executed; run cold.
    Miss,
}

/// FNV-1a, inline rather than a hashing crate: these hashes only ever
/// disambiguate names between runs of the same binary (slug collisions,
/// runner versions) — nothing security-relevant depends on them, since the
/// warm directory itself is ownership-verified.
fn fnv1a(bytes: &[u8]) -> u64 {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

/// Hash of the embedded runner source: a dsbx upgrade changes the runner and
/// must never talk to a server built from the old one.
fn runner_hash8() -> String {
    format!("{:08x}", fnv1a(RUNNER_JS.as_bytes()) as u32)
}

/// Warm state directory: `$HOME/.dust-fn`. In the sandbox $HOME is the
/// invoking user's home (`/home/agent-proxied` for function runs), which the
/// other untrusted uid cannot write into. No fallback: without a HOME there
/// is no directory we can trust, and cold is always correct.
fn warm_dir() -> Option<PathBuf> {
    let home = std::env::var_os("HOME").filter(|h| !h.is_empty())?;
    Some(PathBuf::from(home).join(".dust-fn"))
}

/// Creates the warm dir if needed and verifies it is exactly ours: a real
/// directory (not a symlink), owned by our euid, mode 0700. Returns None —
/// meaning "stay cold" — on any deviation.
fn ensure_trusted_warm_dir() -> Option<PathBuf> {
    let dir = warm_dir()?;
    let mut builder = std::fs::DirBuilder::new();
    builder.mode(0o700);
    match builder.create(&dir) {
        Ok(()) => {}
        Err(e) if e.kind() == ErrorKind::AlreadyExists => {}
        Err(_) => return None,
    }
    let meta = std::fs::symlink_metadata(&dir).ok()?;
    if !meta.is_dir() {
        return None;
    }
    if meta.uid() != rustix::process::geteuid().as_raw() {
        return None;
    }
    if meta.permissions().mode() & 0o777 != 0o700 {
        return None;
    }
    Some(dir)
}

/// Socket path for a function slug. The slug is already validated to
/// `[A-Za-z0-9_-]+`; it is truncated and suffixed with its own hash so two
/// long slugs sharing a prefix cannot collide, and with the runner hash so a
/// dsbx upgrade gets fresh servers. Unix socket paths must stay short
/// (~104 bytes); with a 20-char slug prefix this stays well under.
fn socket_path(dir: &Path, name: &str) -> PathBuf {
    // The functions dir is part of the key: the same slug under a different
    // DUST_FUNCTIONS_DIR is a different bundle, and the mtime/size staleness
    // stamp would not catch the swap.
    let functions_dir = std::env::var("DUST_FUNCTIONS_DIR").unwrap_or_default();
    let key = format!("{functions_dir}\0{name}");
    let prefix: String = name.chars().take(20).collect();
    dir.join(format!(
        "{prefix}-{:08x}-{}-v{WARM_PROTOCOL_VERSION}.sock",
        fnv1a(key.as_bytes()) as u32,
        runner_hash8(),
    ))
}

/// Stages the embedded runner at a stable content-addressed path inside the
/// warm dir, so the detached server outlives the dsbx process that spawned
/// it (the tempfile used by cold runs is deleted when dsbx exits).
fn stage_runner(dir: &Path) -> Result<PathBuf> {
    let path = dir.join(format!("runner-{}.js", runner_hash8()));
    if std::fs::metadata(&path).is_ok() {
        return Ok(path);
    }
    // Write-then-rename so a concurrent dsbx never observes a half-written
    // runner file.
    let tmp = dir.join(format!(
        "runner-{}.js.tmp-{}",
        runner_hash8(),
        std::process::id()
    ));
    std::fs::write(&tmp, RUNNER_JS.as_bytes())?;
    std::fs::rename(&tmp, &path)?;
    Ok(path)
}

/// Tries to run `input` (the raw stdin envelope) against a warm server for
/// `name`/`handler_hint`. Never errors: every failure is a `Miss`.
pub async fn try_warm_run(name: &str, input: &str) -> WarmRun {
    // The name feeds the socket path before resolve_existing validates it on
    // the cold path, so it is validated here too.
    if !super::is_valid_name(name) {
        return WarmRun::Miss;
    }
    // Warm serving is for unprivileged runs only: the production fast path
    // execs dsbx as agent-proxied. A root dsbx stays cold — a root client
    // must not hand invocation env to a workload-owned server it would then
    // have to trust for lifecycle management.
    if rustix::process::geteuid().is_root() {
        return WarmRun::Miss;
    }
    let Some(dir) = ensure_trusted_warm_dir() else {
        return WarmRun::Miss;
    };
    let socket = socket_path(&dir, name);

    let connect = tokio::time::timeout(WARM_CONNECT_TIMEOUT, UnixStream::connect(&socket)).await;
    let stream = match connect {
        Ok(Ok(stream)) => stream,
        _ => return WarmRun::Miss,
    };

    // roundtrip owns its own timeouts: the first frame is bounded tightly
    // (WARM_FIRST_FRAME_TIMEOUT), the post-ack outcome generously
    // (WARM_RESPONSE_TIMEOUT). Any error is a pre-ack condition and a Miss
    // (nothing executed); roundtrip converts post-ack losses into a failure
    // Outcome itself.
    roundtrip(stream, input).await.unwrap_or(WarmRun::Miss)
}

/// The outcome delivered when the server acked (execution started) but the
/// outcome frame never arrived. Failing the invocation is the only safe call:
/// the function may already have fired its side effects, so neither the warm
/// nor the cold path may run it again.
fn lost_outcome_after_ack() -> serde_json::Value {
    serde_json::json!({
        "ok": false,
        "error": {
            "code": "invocation_failed",
            "message": "The warm function server stopped responding after execution started.",
        }
    })
}

async fn roundtrip(mut stream: UnixStream, input: &str) -> Result<WarmRun> {
    // The request carries the client's full environment: per-invocation
    // values (sandbox token, user identity, pod databases dir) travel in env
    // vars, and the resident server's own env is stale by definition. This
    // mirrors the env inheritance of the cold path's bun child.
    // vars_os + lossy filtering: std::env::vars() panics on non-unicode
    // values, and a hostile env var must never crash the client.
    let env: std::collections::HashMap<String, String> = std::env::vars_os()
        .filter_map(|(k, v)| Some((k.into_string().ok()?, v.into_string().ok()?)))
        .collect();
    let request = serde_json::json!({
        "v": WARM_PROTOCOL_VERSION,
        "env": env,
        "input": input,
    });
    let mut line = serde_json::to_string(&request)?;
    line.push('\n');

    // First frame: ack (execution starting), or a pre-execution refusal
    // (stale, overloaded, protocol error). The wait is bounded: the server
    // may queue the request behind its concurrency cap, and a first frame
    // that outlives the server's own queue deadline means a wedged server.
    // Timing out here drops the stream, which closes the socket and makes
    // the server's eventual ack write fail — nothing executes for us after
    // we walk away, so the cold fallback below stays safe.
    let first_frame = tokio::time::timeout(WARM_FIRST_FRAME_TIMEOUT, async {
        stream.write_all(line.as_bytes()).await?;
        let mut reader = BufReader::new(stream);
        let mut first = String::new();
        let read = reader.read_line(&mut first).await?;
        Ok::<_, std::io::Error>((reader, first, read))
    })
    .await;
    let (mut reader, first, read) = match first_frame {
        Ok(Ok(parts)) => parts,
        // Timeout or pre-ack IO error: nothing executed, run cold.
        _ => return Ok(WarmRun::Miss),
    };
    if read == 0 {
        return Ok(WarmRun::Miss);
    }
    let frame: WarmFrame = serde_json::from_str(first.trim())?;
    if frame.v != WARM_PROTOCOL_VERSION || frame.stale || frame.error.is_some() {
        return Ok(WarmRun::Miss);
    }
    if let Some(outcome) = frame.outcome {
        // Single-frame outcome: a pre-execution classification such as
        // bad_input or overloaded, delivered without an ack. Nothing
        // executed, and the outcome is the invocation's result.
        return Ok(WarmRun::Outcome(outcome));
    }
    if !frame.ack {
        return Ok(WarmRun::Miss);
    }

    // Past the ack: never Miss again. A lost, overdue or unparsable outcome
    // frame is a failed invocation, not a cold retry.
    let mut second = String::new();
    match tokio::time::timeout(WARM_RESPONSE_TIMEOUT, reader.read_line(&mut second)).await {
        Ok(Ok(0)) | Ok(Err(_)) | Err(_) => return Ok(WarmRun::Outcome(lost_outcome_after_ack())),
        Ok(Ok(_)) => {}
    }
    match serde_json::from_str::<WarmFrame>(second.trim()) {
        Ok(WarmFrame {
            v: WARM_PROTOCOL_VERSION,
            outcome: Some(outcome),
            ..
        }) => Ok(WarmRun::Outcome(outcome)),
        _ => Ok(WarmRun::Outcome(lost_outcome_after_ack())),
    }
}

/// Spawns a detached warm server for `handler` so the *next* invocation of
/// this function is warm. Fire-and-forget: failures are ignored (the next
/// run is simply cold again), and the server is its own process group so it
/// survives dsbx exiting and is not collateral of anything that signals
/// dsbx's group.
pub fn spawn_server(name: &str, handler: &Path) {
    if !super::is_valid_name(name) {
        return;
    }
    if rustix::process::geteuid().is_root() {
        return;
    }
    let Some(dir) = ensure_trusted_warm_dir() else {
        return;
    };
    let Ok(runner) = stage_runner(&dir) else {
        return;
    };
    let socket = socket_path(&dir, name);
    // If a server is already listening, leave it alone: it will serve the
    // next request or exit stale on its own. Binding a second one would
    // steal the socket mid-request.
    if UnixStreamStdCheck::is_listening(&socket) {
        return;
    }

    // The server's stderr goes to a log file in the warm dir rather than
    // /dev/null: a warm-served function's console.error output would
    // otherwise vanish, where a cold run's reaches the exec output that
    // front logs on failure.
    let log = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("server.log"))
        .ok();

    let mut cmd = Command::new("bun");
    cmd.arg(&runner)
        .arg("serve")
        .arg(handler)
        .arg(&socket)
        .env("NODE_PATH", super::harness_node_path())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(log.map(Stdio::from).unwrap_or_else(Stdio::null))
        .process_group(0);
    // Spawn and forget: tokio children are not killed on drop by default,
    // and the server terminates itself on idle/lifetime/staleness.
    drop(cmd.spawn());
}

/// Cheap "is anything listening" probe used to avoid double-spawning.
struct UnixStreamStdCheck;

impl UnixStreamStdCheck {
    fn is_listening(socket: &Path) -> bool {
        std::os::unix::net::UnixStream::connect(socket).is_ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use super::super::ENV_LOCK;

    /// The e2e tests spawn the real runner under `bun`; skip gracefully where
    /// bun is unavailable (CI installs it before cargo test).
    fn bun_available() -> bool {
        std::process::Command::new("bun")
            .arg("--version")
            .output()
            .is_ok()
    }

    const HELLO_FIXTURE: &str = r#"export default {
  async fetch(req) {
    const url = new URL(req.url);
    return Response.json({ hello: url.searchParams.get("name") ?? "world" });
  },
};
"#;

    fn restore_env(key: &str, original: Option<std::ffi::OsString>) {
        match original {
            Some(value) => std::env::set_var(key, value),
            None => std::env::remove_var(key),
        }
    }

    /// Cold-spawn then warm-hit then staleness, against the real runner:
    /// spawn_server leaves a resident bun process behind, try_warm_run gets an
    /// outcome from it without any runner spawn, and a rewritten bundle turns
    /// the next attempt into a miss.
    #[tokio::test]
    // The env lock intentionally spans the awaits: the spawned server and the
    // client both read process-global env (HOME). Each #[tokio::test] runs
    // its own runtime, so contending tests just block on the mutex.
    #[allow(clippy::await_holding_lock)]
    async fn warm_cycle_end_to_end() {
        let _guard = ENV_LOCK.lock().expect("ENV_LOCK poisoned");
        if !bun_available() {
            eprintln!("skipping: bun not on PATH");
            return;
        }
        let original_home = std::env::var_os("HOME");

        let home = tempfile::tempdir().expect("home tempdir");
        std::env::set_var("HOME", home.path());
        let bundle_dir = tempfile::tempdir().expect("bundle tempdir");
        let handler = bundle_dir.path().join("greet.ts");
        std::fs::write(&handler, HELLO_FIXTURE).expect("fixture");

        let input = serde_json::json!({ "url": "http://localhost/?name=warm" }).to_string();

        // Nothing is listening yet: a warm attempt must miss, not error.
        assert!(matches!(try_warm_run("greet", &input).await, WarmRun::Miss));

        spawn_server("greet", &handler);

        // The server needs a moment to import the bundle and bind the socket.
        let deadline = std::time::Instant::now() + Duration::from_secs(15);
        let outcome = loop {
            match try_warm_run("greet", &input).await {
                WarmRun::Outcome(outcome) => break outcome,
                WarmRun::Miss if std::time::Instant::now() < deadline => {
                    tokio::time::sleep(Duration::from_millis(50)).await;
                }
                WarmRun::Miss => panic!("warm server never came up"),
            }
        };
        assert_eq!(
            outcome,
            serde_json::json!({ "ok": true, "output": { "hello": "warm" } })
        );

        // A republished bundle (same path, new mtime/size) must not be served
        // from the stale import: the server refuses and the client misses.
        std::fs::write(
            &handler,
            format!(
                "{HELLO_FIXTURE}
// republished
"
            ),
        )
        .expect("rewrite fixture");
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        loop {
            match try_warm_run("greet", &input).await {
                WarmRun::Miss => break,
                WarmRun::Outcome(_) if std::time::Instant::now() < deadline => {
                    tokio::time::sleep(Duration::from_millis(50)).await;
                }
                WarmRun::Outcome(_) => panic!("stale bundle kept being served"),
            }
        }

        restore_env("HOME", original_home);
    }

    /// A squatted warm dir (wrong owner is hard to fake unprivileged, but a
    /// wrong mode is the same refusal path) must disable the warm path
    /// entirely rather than be used.
    #[test]
    fn refuses_a_squatted_warm_dir() {
        let _guard = ENV_LOCK.lock().expect("ENV_LOCK poisoned");
        let original_home = std::env::var_os("HOME");

        let home = tempfile::tempdir().expect("home tempdir");
        std::env::set_var("HOME", home.path());
        let dir = home.path().join(".dust-fn");
        std::fs::create_dir(&dir).expect("mkdir");
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o777)).expect("chmod");

        assert!(ensure_trusted_warm_dir().is_none());

        restore_env("HOME", original_home);
    }

    #[test]
    fn creates_and_accepts_its_own_warm_dir() {
        let _guard = ENV_LOCK.lock().expect("ENV_LOCK poisoned");
        let original_home = std::env::var_os("HOME");

        let home = tempfile::tempdir().expect("home tempdir");
        std::env::set_var("HOME", home.path());

        let dir = ensure_trusted_warm_dir().expect("fresh warm dir accepted");
        assert!(dir.ends_with(".dust-fn"));
        // Idempotent: the second call accepts the dir it just created.
        assert!(ensure_trusted_warm_dir().is_some());

        restore_env("HOME", original_home);
    }

    #[test]
    fn socket_path_is_short_and_stable() {
        let _guard = ENV_LOCK.lock().expect("ENV_LOCK poisoned");
        let dir = PathBuf::from("/home/agent-proxied/.dust-fn");
        let a = socket_path(&dir, "my-function");
        let b = socket_path(&dir, "my-function");
        assert_eq!(a, b);
        assert!(a.as_os_str().len() < 100, "socket path too long: {a:?}");
    }

    #[test]
    fn socket_path_distinguishes_long_slugs_sharing_a_prefix() {
        let _guard = ENV_LOCK.lock().expect("ENV_LOCK poisoned");
        let dir = PathBuf::from("/tmp");
        let a = socket_path(&dir, "a-very-long-function-name-one");
        let b = socket_path(&dir, "a-very-long-function-name-two");
        assert_ne!(a, b);
    }

    #[test]
    fn socket_path_distinguishes_functions_dirs() {
        let _guard = ENV_LOCK.lock().expect("ENV_LOCK poisoned");
        let original = std::env::var_os("DUST_FUNCTIONS_DIR");
        let dir = PathBuf::from("/tmp");

        std::env::set_var("DUST_FUNCTIONS_DIR", "/mnt/functions/space-a");
        let a = socket_path(&dir, "greet");
        std::env::set_var("DUST_FUNCTIONS_DIR", "/mnt/functions/space-b");
        let b = socket_path(&dir, "greet");
        assert_ne!(a, b);

        restore_env("DUST_FUNCTIONS_DIR", original);
    }
}
