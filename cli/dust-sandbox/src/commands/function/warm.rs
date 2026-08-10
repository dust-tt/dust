//! Warm-path client for `dsbx function run`.
//!
//! A cold function run pays process spawn, bundle resolution against the
//! gcsfuse-backed functions dir, and the import of the bundle and its
//! dependencies on every invocation. The warm path keeps a pod-scoped pool
//! of generic bun workers (the embedded runner's `serve` subcommand)
//! resident behind unix sockets and forwards invocations to them, so a
//! repeat invocation costs one local socket round trip.
//!
//! Workers are generic — the request names the function, the worker resolves
//! and imports its bundle on first use — so memory scales with the pool size
//! (POOL_SLOTS x one bun process), not with the number of functions on the
//! pod. Each function has one home worker, picked by hashing the app prefix
//! of its slug (`myapp__list-notes` publishes are grouped by app folder), so
//! all of one app's functions share a worker: opening an app pays one
//! process spawn, ever, and its working set accumulates in one module cache.
//!
//! Workers run invocations concurrently (protocol v2) and queue briefly when
//! saturated, so overlapping calls no longer fan out into cold runs. When a
//! worker refuses under saturation it answers with a structured `overloaded`
//! outcome, which is delivered to the caller as the invocation's result —
//! deliberately not a cold fallback, because unbounded cold runs under load
//! are what would exhaust the sandbox.
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

use super::envelope::ImportKind;
use super::RUNNER_JS;

pub const WARM_PROTOCOL_VERSION: u32 = 2;

/// Pool geometry. Four generic workers bound the pod's warm memory (a worker
/// is one bun process capped at ~300MB RSS with its imported working set,
/// see serve.ts) regardless of how many functions the pod publishes. Each
/// worker serves invocations concurrently, so capacity comes from the event
/// loop, not from the worker count.
const POOL_SLOTS: u32 = 4;

/// Bound on the wait for the server's first frame (ack or refusal). It must
/// comfortably exceed the server's admission-queue deadline (~2s, see
/// serve.ts): a queued request receives nothing until it is started or
/// refused. On breach the stream is dropped, which closes the socket and
/// makes the server's eventual ack write fail — so abandoning a wedged or
/// queued server pre-ack can never race into a duplicate execution.
///
/// Accepted residual: an ack the server buffers within a hair of this
/// deadline can go unread while the client walks away cold. The 2s server
/// queue deadline keeps every normal ack far from this boundary; only a
/// multi-second server-side stall (e.g. a gcsfuse stat hang) could put an
/// ack near it, which is judged rare enough to accept.
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
    #[serde(default, rename = "importKind")]
    import_kind: Option<ImportKind>,
    #[serde(default)]
    stale: bool,
    #[serde(default)]
    error: Option<String>,
}

/// The outcome of asking the warm pool to run an invocation.
pub enum WarmRun {
    /// The worker produced this runner `Output` JSON (plus whether it paid
    /// the bundle import on this request): a served invocation, a
    /// pre-execution classification (`bad_input`, `overloaded` — delivered as
    /// the result, never retried cold), or the synthesized failure outcome
    /// when the worker acked (the function started executing) but the outcome
    /// was lost: past the ack the cold path is off the table, because
    /// re-running a function that may already have fired its side effects is
    /// worse than failing the invocation.
    Outcome(serde_json::Value, Option<ImportKind>),
    /// No usable warm worker (home slot not running, stale bundle, protocol
    /// mismatch, ownership refusal, first frame overdue...). Nothing
    /// executed; run cold.
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

/// Socket path for a pool slot. Keyed on the functions dir (the same slot
/// under a different DUST_FUNCTIONS_DIR is a different pod's pool), the
/// runner hash (a dsbx upgrade gets fresh workers), and the protocol
/// version. Unix socket paths must stay short (~104 bytes); this stays well
/// under.
fn slot_socket_path(dir: &Path, slot: u32) -> PathBuf {
    let functions_dir = std::env::var("DUST_FUNCTIONS_DIR").unwrap_or_default();
    dir.join(format!(
        "w{:08x}-{}-v{WARM_PROTOCOL_VERSION}.{slot}.sock",
        fnv1a(functions_dir.as_bytes()) as u32,
        runner_hash8(),
    ))
}

/// The affinity key of a slug: its app prefix when it has one, the whole
/// slug otherwise. Functions published from an app folder get the folder as
/// a `__`-separated prefix (`myapp__list-notes`), and routing every function
/// of an app to the same worker means the app pays one worker spawn and
/// shares one module cache (including its common `lib/` imports). Purely a
/// routing hint: a wrong key costs a duplicate import, never correctness.
fn affinity_key(name: &str) -> &str {
    match name.split_once("__") {
        Some((app, _)) if !app.is_empty() => app,
        _ => name,
    }
}

/// The home slot a function's requests go to. Affinity, not assignment: the
/// worker itself is generic, but the same key keeps landing on the same
/// worker, which already imported the app's bundles.
fn preferred_slot(name: &str) -> u32 {
    (fnv1a(affinity_key(name).as_bytes()) % u64::from(POOL_SLOTS)) as u32
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

/// Tries to run `input` (the raw stdin envelope) against the warm worker on
/// `name`'s home slot. Never errors: every failure is a `Miss`.
pub async fn try_warm_run(name: &str, input: &str) -> WarmRun {
    // The name travels in the warm request and feeds the worker's directory
    // scan, so it is validated here as the cold path's resolve_existing
    // would.
    if !super::is_valid_name(name) {
        return WarmRun::Miss;
    }
    // Warm serving is for unprivileged runs only: the production fast path
    // execs dsbx as agent-proxied. A root dsbx stays cold — a root client
    // must not hand invocation env to a workload-owned worker it would then
    // have to trust for lifecycle management.
    if rustix::process::geteuid().is_root() {
        return WarmRun::Miss;
    }
    let Some(dir) = ensure_trusted_warm_dir() else {
        return WarmRun::Miss;
    };
    // Home slot only, no scanning: with concurrent workers a live home is
    // essentially always usable, and always spawning at home (below, via the
    // cold path) is what keeps an app's functions converging on one worker
    // instead of piling onto whichever worker happens to be alive.
    let socket = slot_socket_path(&dir, preferred_slot(name));

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
    roundtrip(stream, name, input)
        .await
        .unwrap_or(WarmRun::Miss)
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

async fn roundtrip(mut stream: UnixStream, name: &str, input: &str) -> Result<WarmRun> {
    // The request carries the client's full environment: per-invocation
    // values (sandbox token, user identity, pod databases dir) travel in env
    // vars, and the resident worker's own env is stale by definition. This
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
        "name": name,
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
        return Ok(WarmRun::Outcome(outcome, frame.import_kind));
    }
    if !frame.ack {
        return Ok(WarmRun::Miss);
    }

    // Past the ack: never Miss again. A lost, overdue or unparsable outcome
    // frame is a failed invocation, not a cold retry.
    let mut second = String::new();
    match tokio::time::timeout(WARM_RESPONSE_TIMEOUT, reader.read_line(&mut second)).await {
        Ok(Ok(0)) | Ok(Err(_)) | Err(_) => {
            return Ok(WarmRun::Outcome(lost_outcome_after_ack(), None))
        }
        Ok(Ok(_)) => {}
    }
    match serde_json::from_str::<WarmFrame>(second.trim()) {
        Ok(WarmFrame {
            v: WARM_PROTOCOL_VERSION,
            outcome: Some(outcome),
            import_kind,
            ..
        }) => Ok(WarmRun::Outcome(outcome, import_kind)),
        _ => Ok(WarmRun::Outcome(lost_outcome_after_ack(), None)),
    }
}

/// Spawns a detached generic worker on `name`'s home slot so the *next*
/// invocation of this function (and of its app) is warm. Fire-and-forget:
/// failures are ignored (the next run is simply cold again), and the worker
/// is its own process group so it survives dsbx exiting and is not
/// collateral of anything that signals dsbx's group.
pub fn spawn_worker(name: &str) {
    if !super::is_valid_name(name) {
        return;
    }
    if rustix::process::geteuid().is_root() {
        return;
    }
    // The worker resolves bundles against the functions dir itself; without
    // one there is nothing to serve.
    let Ok(functions_dir) = std::env::var("DUST_FUNCTIONS_DIR") else {
        return;
    };
    if functions_dir.is_empty() {
        return;
    }
    let Some(dir) = ensure_trusted_warm_dir() else {
        return;
    };
    let Ok(runner) = stage_runner(&dir) else {
        return;
    };
    let socket = slot_socket_path(&dir, preferred_slot(name));
    // If a worker is already listening, leave it alone: it will serve the
    // next request or drain on its own. Binding a second one would steal the
    // socket mid-request.
    if is_listening(&socket) {
        return;
    }

    // The worker's stderr goes to a log file in the warm dir rather than
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
        .arg(&functions_dir)
        .arg(&socket)
        .env("NODE_PATH", super::harness_node_path())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(log.map(Stdio::from).unwrap_or_else(Stdio::null))
        .process_group(0);
    // Spawn and forget: tokio children are not killed on drop by default,
    // and the worker terminates itself on idle/lifetime/staleness.
    drop(cmd.spawn());
}

/// Cheap "is anything listening" probe used to avoid double-spawning.
fn is_listening(socket: &Path) -> bool {
    std::os::unix::net::UnixStream::connect(socket).is_ok()
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
    /// spawn_worker leaves a resident bun process behind, try_warm_run gets an
    /// outcome from it without any runner spawn, and a rewritten bundle turns
    /// the next attempt into a miss (the worker drains itself).
    #[tokio::test]
    // The env lock intentionally spans the awaits: the spawned worker and the
    // client both read process-global env (HOME, DUST_FUNCTIONS_DIR). Each
    // #[tokio::test] runs its own runtime, so contending tests just block on
    // the mutex.
    #[allow(clippy::await_holding_lock)]
    async fn warm_cycle_end_to_end() {
        let _guard = ENV_LOCK.lock().expect("ENV_LOCK poisoned");
        if !bun_available() {
            eprintln!("skipping: bun not on PATH");
            return;
        }
        let original_home = std::env::var_os("HOME");
        let original_functions_dir = std::env::var_os("DUST_FUNCTIONS_DIR");

        let home = tempfile::tempdir().expect("home tempdir");
        std::env::set_var("HOME", home.path());
        let bundle_dir = tempfile::tempdir().expect("bundle tempdir");
        let handler = bundle_dir.path().join("greet.ts");
        std::fs::write(&handler, HELLO_FIXTURE).expect("fixture");
        std::env::set_var("DUST_FUNCTIONS_DIR", bundle_dir.path());

        let input = serde_json::json!({ "url": "http://localhost/?name=warm" }).to_string();

        // Nothing is listening yet: a warm attempt must miss, not error.
        assert!(matches!(try_warm_run("greet", &input).await, WarmRun::Miss));

        spawn_worker("greet");

        // The worker needs a moment to bind its socket; the first served
        // request pays the bundle import and reports it.
        let deadline = std::time::Instant::now() + Duration::from_secs(15);
        let (outcome, import_kind) = loop {
            match try_warm_run("greet", &input).await {
                WarmRun::Outcome(outcome, import_kind) => break (outcome, import_kind),
                WarmRun::Miss if std::time::Instant::now() < deadline => {
                    tokio::time::sleep(Duration::from_millis(50)).await;
                }
                WarmRun::Miss => panic!("warm worker never came up"),
            }
        };
        assert_eq!(
            outcome,
            serde_json::json!({ "ok": true, "output": { "hello": "warm" } })
        );
        assert_eq!(import_kind, Some(ImportKind::Fresh));

        // A repeat invocation is served from the cached import.
        match try_warm_run("greet", &input).await {
            WarmRun::Outcome(_, import_kind) => {
                assert_eq!(import_kind, Some(ImportKind::Cached));
            }
            WarmRun::Miss => panic!("second warm attempt missed"),
        }

        // A second function in the same directory is served by the same
        // worker: its home slot is the same pool, and the worker is generic.
        let sibling = bundle_dir.path().join("greet__aux.ts");
        std::fs::write(&sibling, HELLO_FIXTURE).expect("sibling fixture");
        match try_warm_run("greet__aux", &input).await {
            WarmRun::Outcome(outcome, import_kind) => {
                assert_eq!(
                    outcome,
                    serde_json::json!({ "ok": true, "output": { "hello": "warm" } })
                );
                assert_eq!(import_kind, Some(ImportKind::Fresh));
            }
            // Different affinity key, so a different (unspawned) home slot:
            // also correct. Only assert when the slots coincide.
            WarmRun::Miss => {
                assert_ne!(preferred_slot("greet__aux"), preferred_slot("greet"));
            }
        }

        // A republished bundle (same path, new mtime/size) must not be served
        // from the stale import: the worker refuses (and drains itself) and
        // the client misses.
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
                WarmRun::Outcome(..) if std::time::Instant::now() < deadline => {
                    tokio::time::sleep(Duration::from_millis(50)).await;
                }
                WarmRun::Outcome(..) => panic!("stale bundle kept being served"),
            }
        }

        restore_env("HOME", original_home);
        restore_env("DUST_FUNCTIONS_DIR", original_functions_dir);
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
    fn slot_socket_paths_are_short_stable_and_distinct() {
        let _guard = ENV_LOCK.lock().expect("ENV_LOCK poisoned");
        let dir = PathBuf::from("/home/agent-proxied/.dust-fn");
        let a = slot_socket_path(&dir, 0);
        let b = slot_socket_path(&dir, 0);
        assert_eq!(a, b);
        assert!(a.as_os_str().len() < 100, "socket path too long: {a:?}");
        assert_ne!(
            slot_socket_path(&dir, 0),
            slot_socket_path(&dir, POOL_SLOTS - 1)
        );
    }

    #[test]
    fn slot_socket_path_distinguishes_functions_dirs() {
        let _guard = ENV_LOCK.lock().expect("ENV_LOCK poisoned");
        let original = std::env::var_os("DUST_FUNCTIONS_DIR");
        let dir = PathBuf::from("/tmp");

        std::env::set_var("DUST_FUNCTIONS_DIR", "/mnt/functions/space-a");
        let a = slot_socket_path(&dir, 0);
        std::env::set_var("DUST_FUNCTIONS_DIR", "/mnt/functions/space-b");
        let b = slot_socket_path(&dir, 0);
        assert_ne!(a, b);

        restore_env("DUST_FUNCTIONS_DIR", original);
    }

    #[test]
    fn affinity_groups_an_app_and_leaves_root_functions_alone() {
        // App-prefixed slugs share their app's key; root slugs are their own.
        assert_eq!(affinity_key("myapp__list-notes"), "myapp");
        assert_eq!(affinity_key("myapp__post-note"), "myapp");
        assert_eq!(affinity_key("standalone"), "standalone");
        // Degenerate prefixes fall back to the whole slug rather than
        // grouping unrelated functions under an empty key.
        assert_eq!(affinity_key("__odd"), "__odd");

        assert_eq!(
            preferred_slot("myapp__list-notes"),
            preferred_slot("myapp__post-note")
        );
    }

    #[test]
    fn preferred_slot_is_stable_and_in_range() {
        let a = preferred_slot("chatpro-sync");
        assert_eq!(a, preferred_slot("chatpro-sync"));
        assert!(a < POOL_SLOTS);
        // Not a strong property, but the affinity point of the hash: distinct
        // hot apps should not all pile onto slot 0.
        let slots: std::collections::HashSet<u32> = ["chatpro-sync", "chess-move", "probe", "list"]
            .iter()
            .map(|name| preferred_slot(name))
            .collect();
        assert!(slots.len() > 1);
    }
}
