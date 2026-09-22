//! One resident Bun worker per Frame publication.
//!
//! Fast invocations talk to a single unix-socket worker keyed by publication
//! id. Seed (or the first invoke that wins the lock) materializes bundles
//! locally, starts the worker, and waits until every slug is imported. Later
//! invokes pay only the socket round trip.
//!
//! GCS rule: at most one fuse touch (`functions.tar`). Local ready / extract
//! skips the mount entirely.
//!
//! Lock rule: `flock` on a local lockfile so a crash releases the lock. Waiters
//! bound their wait and fail open (return `None`) rather than wedge the Frame.

use std::fs::File;
use std::io::ErrorKind;
use std::os::fd::AsRawFd as _;
use std::os::unix::fs::DirBuilderExt as _;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::{Duration, Instant};

use tokio::process::Command;

use super::archive;
use super::warm::ensure_trusted_warm_dir;
use super::RUNNER_JS;

const SANDBOX_TOKEN_ENV: &str = "DUST_SANDBOX_TOKEN";
const POD_USER_IDENTITY_ENV: &str = "DUST_POD_USER_IDENTITY";

const READY_MARKER: &str = "ready";
const LOCK_FILE: &str = "lock";
const SOCKET_NAME: &str = "worker.sock";

/// Bound on waiting for another process's ensure (or our own spawn) to write
/// the ready marker. Past this we fail open so the Frame never wedges.
const ENSURE_WAIT: Duration = Duration::from_secs(45);

/// Poll interval while waiting on ready / lock release.
const POLL: Duration = Duration::from_millis(50);

/// Publication id from `$DUST_FUNCTIONS_DIR`'s parent basename. Pure path math
/// — never touches the gcsfuse mount.
pub fn publication_id_from_functions_dir(functions_dir: &Path) -> Option<String> {
    let id = functions_dir
        .parent()?
        .file_name()?
        .to_str()
        .filter(|s| is_safe_publication_id(s))?;
    Some(id.to_string())
}

fn is_safe_publication_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

fn publications_root() -> Option<PathBuf> {
    let dir = ensure_trusted_warm_dir()?.join("publications");
    mkdir_700(&dir)?;
    Some(dir)
}

fn mkdir_700(dir: &Path) -> Option<()> {
    let mut builder = std::fs::DirBuilder::new();
    builder.mode(0o700);
    match builder.create(dir) {
        Ok(()) => Some(()),
        Err(e) if e.kind() == ErrorKind::AlreadyExists => Some(()),
        Err(_) => None,
    }
}

struct PublicationPaths {
    dir: PathBuf,
    socket: PathBuf,
    ready: PathBuf,
    lock: PathBuf,
}

fn publication_paths(publication_id: &str) -> Option<PublicationPaths> {
    let dir = publications_root()?.join(publication_id);
    mkdir_700(&dir)?;
    Some(PublicationPaths {
        socket: dir.join(SOCKET_NAME),
        ready: dir.join(READY_MARKER),
        lock: dir.join(LOCK_FILE),
        dir,
    })
}

fn is_listening(socket: &Path) -> bool {
    std::os::unix::net::UnixStream::connect(socket).is_ok()
}

/// Ensure the publication worker is up with every slug imported.
///
/// Returns the worker socket, or `None` on any failure / timeout (fail-open).
/// Idempotent: a ready worker is returned with no GCS touch.
/// Seed calls this without warm enabled; invokes gate on warm separately.
pub async fn ensure_publication_worker() -> Option<PathBuf> {
    if rustix::process::geteuid().is_root() {
        return None;
    }
    let functions_dir = std::env::var("DUST_FUNCTIONS_DIR").ok()?;
    if functions_dir.is_empty() {
        return None;
    }
    let functions_dir = PathBuf::from(functions_dir);
    let publication_id = publication_id_from_functions_dir(&functions_dir)?;
    let paths = publication_paths(&publication_id)?;

    if paths.ready.is_file() && is_listening(&paths.socket) {
        return Some(paths.socket);
    }

    let lock_file = open_lock_file(&paths.lock)?;
    match try_lock_exclusive(&lock_file) {
        LockResult::Busy => {
            // Another ensure is in flight — wait for ready, then fail open.
            wait_until_ready(&paths, ENSURE_WAIT).await
        }
        LockResult::Held => {
            // Re-check under the lock: the winner may have finished between
            // our first probe and acquiring the flock.
            if paths.ready.is_file() && is_listening(&paths.socket) {
                return Some(paths.socket);
            }
            let result = seed_under_lock(&functions_dir, &paths).await;
            // Lock released when lock_file drops.
            drop(lock_file);
            result
        }
    }
}

enum LockResult {
    Held,
    Busy,
}

fn open_lock_file(path: &Path) -> Option<File> {
    std::fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(path)
        .ok()
}

fn try_lock_exclusive(file: &File) -> LockResult {
    // LOCK_EX | LOCK_NB: exclusive, non-blocking. Crash / exit releases the
    // flock automatically — no stale lockfile to scrub.
    let rc = unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) };
    if rc == 0 {
        LockResult::Held
    } else {
        LockResult::Busy
    }
}

async fn wait_until_ready(paths: &PublicationPaths, budget: Duration) -> Option<PathBuf> {
    let deadline = Instant::now() + budget;
    while Instant::now() < deadline {
        if paths.ready.is_file() && is_listening(&paths.socket) {
            return Some(paths.socket.clone());
        }
        tokio::time::sleep(POLL).await;
    }
    None
}

async fn seed_under_lock(functions_dir: &Path, paths: &PublicationPaths) -> Option<PathBuf> {
    // Clear a half-finished prior attempt before we start.
    let _ = std::fs::remove_file(&paths.ready);
    if !is_listening(&paths.socket) {
        let _ = std::fs::remove_file(&paths.socket);
    } else {
        // A live worker without a ready marker is unexpected; leave it alone
        // and wait — better than killing a healthy process.
        return wait_until_ready(paths, ENSURE_WAIT).await;
    }

    let bundles_dir = archive::ensure_functions_archive_extracted(functions_dir)?;
    spawn_publication_worker(&bundles_dir, paths)?;
    wait_until_ready(paths, ENSURE_WAIT).await
}

fn spawn_publication_worker(bundles_dir: &Path, paths: &PublicationPaths) -> Option<()> {
    let warm_dir = ensure_trusted_warm_dir()?;
    let runner = stage_runner(&warm_dir)?;

    let log = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(paths.dir.join("server.log"))
        .ok();

    let mut cmd = Command::new("bun");
    cmd.arg(&runner)
        .arg("serve")
        .arg(bundles_dir)
        .arg(&paths.socket)
        .arg(&paths.ready)
        .env("NODE_PATH", super::harness_node_path())
        // Scrub invocation-scoped secrets from the resident process; they
        // arrive per-request in the warm envelope instead.
        .env_remove(SANDBOX_TOKEN_ENV)
        .env_remove(POD_USER_IDENTITY_ENV)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(log.map(Stdio::from).unwrap_or_else(Stdio::null))
        .process_group(0);
    cmd.spawn().ok()?;
    Some(())
}

fn stage_runner(dir: &Path) -> Option<PathBuf> {
    let hash = format!("{:08x}", fnv1a(RUNNER_JS.as_bytes()) as u32);
    let path = dir.join(format!("runner-{hash}.js"));
    if path.is_file() {
        return Some(path);
    }
    let tmp = dir.join(format!("runner-{hash}.js.tmp-{}", std::process::id()));
    std::fs::write(&tmp, RUNNER_JS.as_bytes()).ok()?;
    match std::fs::rename(&tmp, &path) {
        Ok(()) => Some(path),
        Err(_) => {
            let _ = std::fs::remove_file(&tmp);
            if path.is_file() {
                Some(path)
            } else {
                None
            }
        }
    }
}

fn fnv1a(bytes: &[u8]) -> u64 {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

/// Entry for `dsbx function materialize-archive`: start the publication
/// worker (eager import) when unprivileged; as root, extract the archive
/// only (cold-cache seed for privileged contexts).
pub async fn materialize_publication() -> Result<(), String> {
    let dir = std::env::var("DUST_FUNCTIONS_DIR")
        .map_err(|_| "DUST_FUNCTIONS_DIR is not set".to_string())?;
    if dir.is_empty() {
        return Err("DUST_FUNCTIONS_DIR is empty".to_string());
    }
    let functions_dir = PathBuf::from(&dir);

    if !rustix::process::geteuid().is_root() {
        match ensure_publication_worker().await {
            Some(_) => Ok(()),
            None => Err(format!(
                "failed to ensure publication worker for {}",
                functions_dir.display()
            )),
        }
    } else {
        match archive::ensure_functions_archive_extracted(&functions_dir) {
            Some(_) => Ok(()),
            None => Err(format!(
                "failed to materialize functions.tar next to {}",
                functions_dir.display()
            )),
        }
    }
}
