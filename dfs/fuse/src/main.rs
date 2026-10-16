//! dfs-fuse: mounts one dfs session at a directory on Linux, with the configured folders at its
//! root. Kernel requests are served by the `dfs-mount` library.

mod adapter;

use adapter::Adapter;
use anyhow::{Context, Result, bail};
use clap::Parser;
use dfs_mount::{Folder, Fs, Remote};
use std::{
    fs::File,
    io::{IsTerminal, Read},
    os::unix::fs::PermissionsExt,
    path::{Path, PathBuf},
    sync::Arc,
    time::Duration,
};
use tokio::{
    signal::unix::{SignalKind, signal},
    time::{Instant, interval, interval_at},
};
use tonic::transport::{Channel, ClientTlsConfig, Endpoint};

/// How long to wait for the connection to the dfs server.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
/// How long a request to the dfs server may take before it fails, and the kernel request with it.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
/// How often to refresh the session. It expires one hour after its last refresh, so a few refreshes
/// in a row can fail before it does.
const SESSION_REFRESH_INTERVAL: Duration = Duration::from_secs(15 * 60);
/// A session key is 64 characters: a larger file is not a session key file.
const SESSION_KEY_FILE_MAX_BYTES: u64 = 256;
/// The permission bits of group and other users.
const GROUP_AND_OTHER_PERMISSIONS: u32 = 0o077;
/// How often to check whether the filesystem was unmounted from outside, as with `fusermount3 -u`.
const UNMOUNT_POLL_INTERVAL: Duration = Duration::from_millis(100);

#[derive(Parser)]
#[command(about = "Mount a dfs session on Linux")]
struct Cli {
    /// The dfs server's origin, such as `https://dfs.example.com`. Use HTTPS outside local
    /// development.
    #[arg(long, env = "DFS_ENDPOINT")]
    endpoint: String,
    /// A file holding only the session key, which group and other users cannot access.
    #[arg(long, env = "DFS_SESSION_KEY_FILE")]
    session_key_file: PathBuf,
    /// A folder to show at the mount root, as `NAME=OBJECT_ID`. Repeat for each folder.
    #[arg(long = "folder", value_parser = parse_folder)]
    folders: Vec<Folder>,
    /// The existing directory to mount on.
    mountpoint: PathBuf,
}

/**
 * @cc [owner:fontanierh,label:product] drain-before-unmount
 * On exit, `main` MUST unmount only after `drain` returns, so the kernel keeps serving the mount
 * while acknowledged changes commit. If `drain` failed, `main` MUST still unmount, then exit with
 * an error.
 */
fn main() -> Result<()> {
    let cli = Cli::parse();
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .with_writer(std::io::stderr)
        .with_ansi(std::io::stderr().is_terminal())
        .init();
    let session_key = read_session_key(&cli.session_key_file)
        .with_context(|| format!("session key file {}", cli.session_key_file.display()))?;
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?;
    let channel = runtime
        .block_on(connect(&cli.endpoint))
        .context("connect to the dfs server")?;
    let remote = Remote::new(channel, &session_key).context("invalid session key")?;
    runtime
        .block_on(remote.refresh_session())
        .context("refresh the session")?;
    let fs = Arc::new(Fs::new(remote.clone(), cli.folders).context("invalid folders")?);
    let adapter = Adapter::new(fs.clone(), runtime.handle().clone());
    let session = fuser::Session::new(adapter, &cli.mountpoint, &adapter::config())
        .with_context(|| format!("mount {}", cli.mountpoint.display()))?
        .spawn()?;
    tracing::info!(mountpoint = %cli.mountpoint.display(), "mounted");

    let served = runtime.block_on(serve(&remote, &session));
    let drained = runtime.block_on(drain(&fs));
    if session.guard.is_finished() {
        session.join()?;
    } else {
        session.umount_and_join()?;
    }
    tracing::info!(mountpoint = %cli.mountpoint.display(), "unmounted");
    served?;
    drained.context("commit the last changes")
}

/// A `--folder` value: `NAME=OBJECT_ID`. Names may contain `=`, object IDs cannot.
fn parse_folder(value: &str) -> Result<Folder, String> {
    let (name, id) = value
        .rsplit_once('=')
        .ok_or_else(|| "expected NAME=OBJECT_ID".to_owned())?;
    let id = id.parse().map_err(|_| format!("invalid object ID {id}"))?;
    Ok(Folder {
        name: name.to_owned(),
        id,
    })
}

/**
 * @cc [owner:fontanierh,label:security] private-key-file
 * `read_session_key` MUST fail unless the file is a regular file, no larger than a session key file
 * needs, that group and other users cannot access. Its errors MUST NOT include the file's content.
 */
fn read_session_key(path: &Path) -> Result<String> {
    let file = File::open(path)?;
    let metadata = file.metadata()?;
    if !metadata.is_file() || metadata.len() > SESSION_KEY_FILE_MAX_BYTES {
        bail!("not a session key file");
    }
    if metadata.permissions().mode() & GROUP_AND_OTHER_PERMISSIONS != 0 {
        bail!("accessible to group or other users");
    }
    let mut session_key = String::new();
    file.take(SESSION_KEY_FILE_MAX_BYTES)
        .read_to_string(&mut session_key)?;
    Ok(session_key.trim().to_owned())
}

/// A channel to `endpoint`, over TLS with the system's root certificates for an `https` origin.
/**
 * @cc [owner:fontanierh,label:performance] requests-time-out
 * Connecting and each request on the channel MUST time out, so a server that stops answering fails
 * kernel requests instead of holding them.
 */
async fn connect(endpoint: &str) -> Result<Channel> {
    let mut endpoint = Endpoint::from_shared(endpoint.to_owned())?
        .connect_timeout(CONNECT_TIMEOUT)
        .timeout(REQUEST_TIMEOUT);
    if endpoint.uri().scheme_str() == Some("https") {
        endpoint = endpoint.tls_config(ClientTlsConfig::new().with_native_roots())?;
    }
    Ok(endpoint.connect().await?)
}

/// Waits until every change the mount acknowledged is committed, so none is lost on exit. Fails
/// with the first failure since the last `fsync`.
async fn drain(_fs: &Fs) -> Result<()> {
    // The library acknowledges no changes yet.
    Ok(())
}

/// Refreshes the session periodically until a SIGINT or SIGTERM, or until the filesystem is
/// unmounted from outside (`fusermount3 -u`). Kernel requests fail with `EACCES` once the session
/// expires.
/**
 * @cc [owner:fontanierh,label:error-handling] refresh-keeps-serving
 * A failed session refresh MUST be logged and MUST NOT end `serve`. Refreshes MUST happen at an
 * interval well under the session's one-hour expiry, so several in a row can fail before it does.
 */
async fn serve(remote: &Remote, session: &fuser::BackgroundSession) -> Result<()> {
    let mut interrupt = signal(SignalKind::interrupt())?;
    let mut terminate = signal(SignalKind::terminate())?;
    let mut unmounted = interval(UNMOUNT_POLL_INTERVAL);
    // The session was refreshed just before mounting.
    let mut refresh = interval_at(
        Instant::now() + SESSION_REFRESH_INTERVAL,
        SESSION_REFRESH_INTERVAL,
    );
    loop {
        tokio::select! {
            _ = interrupt.recv() => return Ok(()),
            _ = terminate.recv() => return Ok(()),
            _ = unmounted.tick() => {
                if session.guard.is_finished() {
                    return Ok(());
                }
            }
            _ = refresh.tick() => {
                if let Err(errno) = remote.refresh_session().await {
                    tracing::warn!(%errno, "session refresh failed");
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use dfs_protocol::ObjectId;
    use std::{fs, os::unix::fs::OpenOptionsExt};

    const SESSION_KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    /// Read and write for the owner only.
    const PRIVATE: u32 = 0o600;
    /// Also readable by group and other users.
    const SHARED: u32 = 0o644;

    struct KeyFile(PathBuf);

    impl KeyFile {
        fn new(name: &str, mode: u32, content: &str) -> Result<Self> {
            let path = std::env::temp_dir().join(format!("dfs-fuse-{}-{name}", std::process::id()));
            let _ = fs::remove_file(&path);
            std::io::Write::write_all(
                &mut fs::OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .mode(mode)
                    .open(&path)?,
                content.as_bytes(),
            )?;
            Ok(Self(path))
        }
    }

    impl Drop for KeyFile {
        fn drop(&mut self) {
            let _ = fs::remove_file(&self.0);
        }
    }

    #[test]
    fn parses_folders() -> Result<(), String> {
        let id = ObjectId::new_v7();
        assert_eq!(
            parse_folder(&format!("a=b={id}"))?,
            Folder {
                name: "a=b".to_owned(),
                id
            }
        );
        assert!(parse_folder("conversation").is_err());
        assert!(parse_folder("conversation=not-an-id").is_err());
        Ok(())
    }

    #[test]
    fn reads_a_private_session_key_file() -> Result<()> {
        let file = KeyFile::new("private", PRIVATE, &format!("{SESSION_KEY}\n"))?;
        assert_eq!(read_session_key(&file.0)?, SESSION_KEY);
        Ok(())
    }

    #[test]
    fn rejects_shared_or_large_session_key_files_without_their_content() -> Result<()> {
        let shared = KeyFile::new("shared", SHARED, SESSION_KEY)?;
        let large = KeyFile::new("large", PRIVATE, &SESSION_KEY.repeat(5))?;
        for file in [&shared, &large] {
            let error = read_session_key(&file.0)
                .err()
                .context("expected an error")?;
            assert!(!format!("{error:#}").contains(SESSION_KEY));
        }
        assert!(read_session_key(&std::env::temp_dir()).is_err());
        Ok(())
    }
}
