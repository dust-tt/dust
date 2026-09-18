//! Warm-path client for `dsbx function run`.
//!
//! Fast invocations talk to one publication-scoped Bun worker (keyed by
//! publication id under `$HOME/.dust-fn/publications/`). Seed or the first
//! ensure materializes bundles locally and imports every slug; later invokes
//! are a unix-socket round trip. See [`super::publication`].
//!
//! Durable / tools invocations leave warm disabled and stay on the cold Bun
//! spawn path. Any warm irregularity falls back to cold so the warm path can
//! only ever be a fast alternative, never a new failure mode.
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
use std::time::{Duration, Instant};

use anyhow::Result;
use serde::Deserialize;
use tokio::io::{AsyncBufReadExt as _, AsyncWriteExt as _, BufReader};
use tokio::net::UnixStream;

use super::publication;

pub const WARM_PROTOCOL_VERSION: u32 = 2;

const WARM_ENABLED_ENV: &str = "DUST_FUNCTION_WARM_ENABLED";

#[cfg(test)]
const SANDBOX_TOKEN_ENV: &str = "DUST_SANDBOX_TOKEN";
#[cfg(test)]
const POD_USER_IDENTITY_ENV: &str = "DUST_POD_USER_IDENTITY";

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

pub(crate) fn warm_execution_enabled() -> bool {
    matches!(std::env::var(WARM_ENABLED_ENV).as_deref(), Ok("1"))
}

#[derive(Debug, Deserialize)]
struct WarmFrame {
    v: u32,
    #[serde(default)]
    ack: bool,
    #[serde(default)]
    outcome: Option<serde_json::Value>,
    #[serde(default, rename = "timingsMs")]
    timings_ms: Option<WarmPhaseTimings>,
    #[serde(default)]
    stale: bool,
    #[serde(default)]
    error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WarmPhaseTimings {
    #[serde(default)]
    pub handler: Option<u64>,
}

/// Outcome of asking the publication worker to run an invocation.
pub enum WarmRun {
    /// The worker produced this runner `Output` JSON: a served invocation, a
    /// pre-execution classification (`bad_input`, `overloaded` — delivered as
    /// the result, never retried cold), or the synthesized failure outcome
    /// when the worker acked but the outcome was lost. `ensure_ms` is time
    /// spent making the worker ready before the socket round trip.
    Outcome(serde_json::Value, Option<WarmPhaseTimings>, u64),
    /// No usable worker (ensure failed, protocol mismatch, first frame
    /// overdue...). Nothing executed; run cold.
    Miss,
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
pub(crate) fn ensure_trusted_warm_dir() -> Option<PathBuf> {
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

/// How long an unused cached bundle survives before opportunistic pruning
/// removes it. Content-addressed entries never go stale, only unused: a
/// republish changes the stamped hash, so old entries simply stop being
/// looked up.
const BUNDLE_CACHE_MAX_AGE: Duration = Duration::from_secs(7 * 24 * 3600);

/// A stamped bundle hash is exactly the lowercase hex sha256 front computes
/// at publish time; anything else must not touch the filesystem.
fn is_valid_bundle_sha256(sha256: &str) -> bool {
    sha256.len() == 64
        && sha256
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

fn bundle_cache_dir() -> Option<PathBuf> {
    // Same trust model as the rest of the warm dir (and the same root
    // refusal): only the invoking unprivileged user can write here, so a
    // cached bundle is exactly what this user previously read and verified.
    if rustix::process::geteuid().is_root() {
        return None;
    }
    let dir = ensure_trusted_warm_dir()?.join("bundles");
    let mut builder = std::fs::DirBuilder::new();
    builder.mode(0o700);
    match builder.create(&dir) {
        Ok(()) => {}
        Err(e) if e.kind() == ErrorKind::AlreadyExists => {}
        Err(_) => return None,
    }
    Some(dir)
}

/// Path of the locally cached copy of the bundle whose publish-time sha256 is
/// `sha256`, when one exists. A hit means the cold run can skip the
/// gcsfuse-backed functions dir entirely — both the resolution readdir and
/// the bundle read — which is the dominant cost of a first invocation. The
/// cache can never serve a stale bundle: a republish changes the stamped
/// hash, which is the lookup key.
pub fn cached_bundle_path(sha256: &str) -> Option<PathBuf> {
    if !is_valid_bundle_sha256(sha256) {
        return None;
    }
    let path = bundle_cache_dir()?.join(format!("{sha256}.js"));
    if std::fs::metadata(&path)
        .map(|m| m.is_file())
        .unwrap_or(false)
    {
        Some(path)
    } else {
        None
    }
}

/// Copies `handler` (just read from the functions dir) into the cache under
/// its stamped hash, so the next cold run of this publish skips gcsfuse.
/// Best-effort and silent: a failed populate only means the next run stays
/// on today's path. The bytes are re-hashed before caching — when gcsfuse
/// caching serves bytes older than the stamp, caching them under the stamp
/// would wrongly pin the stale version, so a mismatch caches nothing.
pub fn populate_bundle_cache(handler: &Path, sha256: &str) {
    if !is_valid_bundle_sha256(sha256) {
        return;
    }
    let Ok(bytes) = std::fs::read(handler) else {
        return;
    };
    let digest = ring::digest::digest(&ring::digest::SHA256, &bytes);
    let actual: String = digest.as_ref().iter().map(|b| format!("{b:02x}")).collect();
    if actual != sha256 {
        return;
    }
    if write_bundle_cache_entry(&bytes, sha256) {
        if let Some(dir) = bundle_cache_dir() {
            prune_bundle_cache(&dir, BUNDLE_CACHE_MAX_AGE);
        }
    }
}

/// Eagerly hash every function bundle under `dir` into the content-addressed
/// cache (keyed by content sha256). Used after extracting a publication's
/// `functions.tar` so every slug is warm/cold-ready without a per-function
/// fuse touch. Best-effort and idempotent.
pub fn populate_bundle_caches_from_dir(dir: &Path) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    let mut wrote_any = false;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|s| s.to_str()) else {
            continue;
        };
        // Skip markers / junk; archive entries are `<slug>.{ts,js,...}`.
        if name.starts_with('.') {
            continue;
        }
        let Ok(bytes) = std::fs::read(&path) else {
            continue;
        };
        let digest = ring::digest::digest(&ring::digest::SHA256, &bytes);
        let sha256: String = digest.as_ref().iter().map(|b| format!("{b:02x}")).collect();
        if write_bundle_cache_entry(&bytes, &sha256) {
            wrote_any = true;
        }
    }
    if wrote_any {
        if let Some(cache_dir) = bundle_cache_dir() {
            prune_bundle_cache(&cache_dir, BUNDLE_CACHE_MAX_AGE);
        }
    }
}

/// Write `bytes` under `bundles/<sha256>.js`. Returns whether a new entry was
/// created. Caller must have verified `sha256` matches `bytes`.
fn write_bundle_cache_entry(bytes: &[u8], sha256: &str) -> bool {
    if !is_valid_bundle_sha256(sha256) {
        return false;
    }
    let Some(dir) = bundle_cache_dir() else {
        return false;
    };
    let target = dir.join(format!("{sha256}.js"));
    if std::fs::metadata(&target).is_ok() {
        return false;
    }
    // Write-then-rename so a concurrent dsbx never observes (or imports) a
    // half-written bundle.
    let tmp = dir.join(format!("{sha256}.js.tmp-{}", std::process::id()));
    if std::fs::write(&tmp, bytes).is_err() {
        return false;
    }
    match std::fs::rename(&tmp, &target) {
        Ok(()) => true,
        Err(_) => {
            let _ = std::fs::remove_file(&tmp);
            false
        }
    }
}

/// Removes cache entries whose mtime is older than `max_age`. Best-effort.
fn prune_bundle_cache(dir: &Path, max_age: Duration) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    let now = std::time::SystemTime::now();
    for entry in entries.flatten() {
        let Ok(meta) = entry.metadata() else {
            continue;
        };
        if !meta.is_file() {
            continue;
        }
        let Ok(modified) = meta.modified() else {
            continue;
        };
        if now
            .duration_since(modified)
            .map(|age| age > max_age)
            .unwrap_or(false)
        {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

/// Tries to run `input` against this publication's resident worker. Ensures
/// the worker is ready (seed or become the seeder) first. Never errors: every
/// failure is a `Miss`.
pub async fn try_warm_run(name: &str, input: &str) -> WarmRun {
    if !warm_execution_enabled() {
        return WarmRun::Miss;
    }
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
    let ensure_started = Instant::now();
    let Some(socket) = publication::ensure_publication_worker().await else {
        return WarmRun::Miss;
    };
    let ensure_ms = ensure_started.elapsed().as_millis() as u64;

    let stream = match UnixStream::connect(&socket).await {
        Ok(stream) => stream,
        Err(_) => return WarmRun::Miss,
    };

    match roundtrip(stream, name, input).await {
        Ok(WarmRun::Outcome(outcome, phase, _)) => WarmRun::Outcome(outcome, phase, ensure_ms),
        Ok(WarmRun::Miss) | Err(_) => WarmRun::Miss,
    }
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
        return Ok(WarmRun::Outcome(outcome, frame.timings_ms, 0));
    }
    if !frame.ack {
        return Ok(WarmRun::Miss);
    }

    // Past the ack: never Miss again. A lost, overdue or unparsable outcome
    // frame is a failed invocation, not a cold retry.
    let mut second = String::new();
    match tokio::time::timeout(WARM_RESPONSE_TIMEOUT, reader.read_line(&mut second)).await {
        Ok(Ok(0)) | Ok(Err(_)) | Err(_) => {
            return Ok(WarmRun::Outcome(lost_outcome_after_ack(), None, 0))
        }
        Ok(Ok(_)) => {}
    }
    match serde_json::from_str::<WarmFrame>(second.trim()) {
        Ok(WarmFrame {
            v: WARM_PROTOCOL_VERSION,
            outcome: Some(outcome),
            timings_ms,
            ..
        }) => Ok(WarmRun::Outcome(outcome, timings_ms, 0)),
        _ => Ok(WarmRun::Outcome(lost_outcome_after_ack(), None, 0)),
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

    fn environment_fixture() -> String {
        let context_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("pod/context.ts");
        let context_import = serde_json::to_string(
            context_path
                .to_str()
                .expect("pod context path must be valid UTF-8"),
        )
        .expect("serialize pod context import");
        format!(
            r#"import {{ podEnv }} from {context_import};

export default {{
  async fetch() {{
    const child = Bun.spawnSync(["/usr/bin/env"]);
    const childEnv = new TextDecoder().decode(child.stdout);
    return Response.json({{
      contextToken: podEnv("DUST_SANDBOX_TOKEN") ?? null,
      contextIdentity: podEnv("DUST_POD_USER_IDENTITY") ?? null,
      childHasToken: childEnv.includes("DUST_SANDBOX_TOKEN="),
      childHasIdentity: childEnv.includes("DUST_POD_USER_IDENTITY="),
    }});
  }},
}};
"#
        )
    }

    fn restore_env(key: &str, original: Option<std::ffi::OsString>) {
        match original {
            Some(value) => std::env::set_var(key, value),
            None => std::env::remove_var(key),
        }
    }

    /// Publication worker: ensure seeds a resident Bun process with every
    /// slug pre-imported; try_warm_run then gets outcomes without a runner
    /// spawn. A rewritten local bundle turns the next attempt into a miss.
    #[tokio::test]
    // The env lock intentionally spans the awaits: the spawned worker and the
    // client both read process-global env (HOME, DUST_FUNCTIONS_DIR). Each
    // #[tokio::test] runs its own runtime, so contending tests just block on
    // the mutex.
    #[allow(clippy::await_holding_lock)]
    async fn warm_cycle_end_to_end() {
        let _guard = ENV_LOCK.lock().expect("ENV_LOCK poisoned");
        if rustix::process::geteuid().is_root() {
            eprintln!("skipping: warm path refuses root");
            return;
        }
        if !bun_available() {
            eprintln!("skipping: bun not on PATH");
            return;
        }
        let original_home = std::env::var_os("HOME");
        let original_functions_dir = std::env::var_os("DUST_FUNCTIONS_DIR");
        let original_warm_enabled = std::env::var_os(WARM_ENABLED_ENV);
        let original_token = std::env::var_os(SANDBOX_TOKEN_ENV);
        let original_identity = std::env::var_os(POD_USER_IDENTITY_ENV);

        let home = tempfile::tempdir().expect("home tempdir");
        std::env::set_var("HOME", home.path());

        // Publication layout: .../<publication_id>/functions/<slug>.ts
        let pub_root = tempfile::tempdir().expect("publication tempdir");
        let functions_dir = pub_root.path().join("pub-test").join("functions");
        std::fs::create_dir_all(&functions_dir).expect("mkdir functions");
        std::fs::write(functions_dir.join("greet.ts"), HELLO_FIXTURE).expect("fixture");
        std::fs::write(
            functions_dir.join("greet-environment.ts"),
            environment_fixture(),
        )
        .expect("environment fixture");
        std::fs::write(functions_dir.join("greet-aux.ts"), HELLO_FIXTURE).expect("sibling fixture");

        std::env::set_var("DUST_FUNCTIONS_DIR", &functions_dir);
        std::env::set_var(WARM_ENABLED_ENV, "1");
        std::env::set_var(SANDBOX_TOKEN_ENV, "invocation-token");
        std::env::set_var(POD_USER_IDENTITY_ENV, "invocation-identity");

        let input = serde_json::json!({ "url": "http://localhost/?name=warm" }).to_string();

        // First call ensures the publication worker (seed + eager import).
        let (outcome, ensure_ms) = match try_warm_run("greet", &input).await {
            WarmRun::Outcome(outcome, _, ensure_ms) => (outcome, ensure_ms),
            WarmRun::Miss => panic!("publication worker ensure failed"),
        };
        assert_eq!(
            outcome,
            serde_json::json!({ "ok": true, "output": { "hello": "warm" } })
        );
        // Ensure paid spawn+preload on this first call (or was already ready).
        let _ = ensure_ms;

        match try_warm_run("greet", &input).await {
            WarmRun::Outcome(_, _, ensure_ms) => {
                // Worker already ready — ensure should be cheap.
                assert!(ensure_ms < 100, "expected cheap ensure, got {ensure_ms}ms");
            }
            WarmRun::Miss => panic!("second warm attempt missed"),
        }

        // Sibling slugs were preloaded on the same worker.
        match try_warm_run("greet-aux", &input).await {
            WarmRun::Outcome(outcome, _, _) => {
                assert_eq!(
                    outcome,
                    serde_json::json!({ "ok": true, "output": { "hello": "warm" } })
                );
            }
            WarmRun::Miss => panic!("sibling warm attempt missed"),
        }

        let env_outcome = match try_warm_run("greet-environment", &input).await {
            WarmRun::Outcome(outcome, _, _) => outcome,
            WarmRun::Miss => panic!("environment probe missed"),
        };
        assert_eq!(
            env_outcome,
            serde_json::json!({
                "ok": true,
                "output": {
                    "contextToken": "invocation-token",
                    "contextIdentity": "invocation-identity",
                    "childHasToken": false,
                    "childHasIdentity": false,
                }
            })
        );

        restore_env("HOME", original_home);
        restore_env("DUST_FUNCTIONS_DIR", original_functions_dir);
        restore_env(WARM_ENABLED_ENV, original_warm_enabled);
        restore_env(SANDBOX_TOKEN_ENV, original_token);
        restore_env(POD_USER_IDENTITY_ENV, original_identity);
    }

    #[test]
    fn warm_execution_requires_explicit_opt_in() {
        let _guard = ENV_LOCK.lock().expect("ENV_LOCK poisoned");
        let original = std::env::var_os(WARM_ENABLED_ENV);

        std::env::remove_var(WARM_ENABLED_ENV);
        assert!(!warm_execution_enabled());
        std::env::set_var(WARM_ENABLED_ENV, "0");
        assert!(!warm_execution_enabled());
        std::env::set_var(WARM_ENABLED_ENV, "1");
        assert!(warm_execution_enabled());

        restore_env(WARM_ENABLED_ENV, original);
    }

    /// A squatted warm dir (wrong owner is hard to fake unprivileged, but a
    /// wrong mode is the same refusal path) must disable the warm path
    /// entirely rather than be used.
    #[test]
    fn refuses_a_squatted_warm_dir() {
        let _guard = ENV_LOCK.lock().expect("ENV_LOCK poisoned");
        if rustix::process::geteuid().is_root() {
            return;
        }
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
        if rustix::process::geteuid().is_root() {
            return;
        }
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
    fn publication_id_from_functions_dir_is_parent_basename() {
        let id = publication::publication_id_from_functions_dir(Path::new(
            "/mnt/frames/frm_x/publications/pub-abc/functions",
        ));
        assert_eq!(id.as_deref(), Some("pub-abc"));
        assert!(publication::publication_id_from_functions_dir(Path::new("functions")).is_none());
    }

    fn sha256_hex(bytes: &[u8]) -> String {
        ring::digest::digest(&ring::digest::SHA256, bytes)
            .as_ref()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect()
    }

    #[test]
    fn bundle_cache_populates_and_serves_matching_bytes() {
        let _guard = ENV_LOCK.lock().expect("ENV_LOCK poisoned");
        if rustix::process::geteuid().is_root() {
            return;
        }
        let original_home = std::env::var_os("HOME");
        let home = tempfile::tempdir().expect("home tempdir");
        std::env::set_var("HOME", home.path());

        let bundle_dir = tempfile::tempdir().expect("bundle tempdir");
        let handler = bundle_dir.path().join("greet.ts");
        std::fs::write(&handler, b"export default {};").expect("bundle");
        let sha256 = sha256_hex(b"export default {};");

        assert!(cached_bundle_path(&sha256).is_none());
        populate_bundle_cache(&handler, &sha256);
        let cached = cached_bundle_path(&sha256).expect("cache hit after populate");
        assert_eq!(
            std::fs::read(&cached).expect("cached bytes"),
            b"export default {};"
        );

        restore_env("HOME", original_home);
    }

    #[test]
    fn bundle_cache_refuses_bytes_that_do_not_match_the_stamp() {
        let _guard = ENV_LOCK.lock().expect("ENV_LOCK poisoned");
        if rustix::process::geteuid().is_root() {
            return;
        }
        let original_home = std::env::var_os("HOME");
        let home = tempfile::tempdir().expect("home tempdir");
        std::env::set_var("HOME", home.path());

        let bundle_dir = tempfile::tempdir().expect("bundle tempdir");
        let handler = bundle_dir.path().join("greet.ts");
        std::fs::write(&handler, b"current bytes").expect("bundle");

        // The gcsfuse-served-stale-bytes case: the stamp describes different
        // content than what was read, so nothing may be cached under it.
        let stamp_of_other_bytes = sha256_hex(b"republished bytes");
        populate_bundle_cache(&handler, &stamp_of_other_bytes);
        assert!(cached_bundle_path(&stamp_of_other_bytes).is_none());

        restore_env("HOME", original_home);
    }

    #[test]
    fn bundle_cache_refuses_malformed_hashes() {
        let _guard = ENV_LOCK.lock().expect("ENV_LOCK poisoned");
        if rustix::process::geteuid().is_root() {
            return;
        }
        let original_home = std::env::var_os("HOME");
        let home = tempfile::tempdir().expect("home tempdir");
        std::env::set_var("HOME", home.path());

        for bad in [
            "",
            "short",
            &"Z".repeat(64),
            &"A".repeat(64), // uppercase hex is not what front stamps
            "../../../../etc/passwd\0aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        ] {
            assert!(cached_bundle_path(bad).is_none());
            // Must also not create anything on disk.
            populate_bundle_cache(Path::new("/nonexistent"), bad);
        }
        assert!(
            !home.path().join(".dust-fn/bundles").exists() || {
                std::fs::read_dir(home.path().join(".dust-fn/bundles"))
                    .map(|entries| entries.count() == 0)
                    .unwrap_or(true)
            }
        );

        restore_env("HOME", original_home);
    }

    #[test]
    fn bundle_cache_prunes_old_entries_only() {
        let dir = tempfile::tempdir().expect("cache tempdir");
        let old = dir.path().join("old.js");
        let fresh = dir.path().join("fresh.js");
        std::fs::write(&old, b"old").expect("old");
        std::fs::write(&fresh, b"fresh").expect("fresh");
        std::thread::sleep(Duration::from_millis(20));

        // Everything written before the sleep is older than 1ms; a 7-day
        // horizon keeps both.
        prune_bundle_cache(dir.path(), BUNDLE_CACHE_MAX_AGE);
        assert!(old.exists() && fresh.exists());

        prune_bundle_cache(dir.path(), Duration::from_millis(1));
        assert!(!old.exists() && !fresh.exists());
    }
}
