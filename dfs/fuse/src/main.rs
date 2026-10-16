//! dfs-fuse: mounts one dfs session at a directory on Linux, with the configured folders at its
//! root. Kernel requests are served by the `dfs-mount` library.

mod adapter;

use adapter::Adapter;
use anyhow::{Context, Result};
use clap::Parser;
use dfs_mount::{Folder, Fs, Remote};
use std::{
    path::{Path, PathBuf},
    sync::Arc,
};
use tonic::transport::Channel;

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

fn main() -> Result<()> {
    let cli = Cli::parse();
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
    eprintln!("dfs-fuse: mounted {}", cli.mountpoint.display());

    runtime.block_on(serve(&remote, &session))?;
    let drained = runtime.block_on(drain(&fs));
    if session.guard.is_finished() {
        session.join()?;
    } else {
        session.umount_and_join()?;
    }
    eprintln!("dfs-fuse: unmounted {}", cli.mountpoint.display());
    drained.context("commit the last changes")
}

/// A `--folder` value: `NAME=OBJECT_ID`. Names may contain `=`, object IDs cannot.
fn parse_folder(_value: &str) -> Result<Folder, String> {
    todo!()
}

/**
 * @cc [owner:fontanierh,label:security] private-key-file
 * `read_session_key` MUST fail unless the file is a regular file, no larger than a session key file
 * needs, that group and other users cannot access. Its errors MUST NOT include the file's content.
 */
fn read_session_key(_path: &Path) -> Result<String> {
    todo!()
}

/// A channel to `endpoint`, over TLS with the system's root certificates for an `https` origin.
/// Connecting and each request time out, so a server that stops answering fails kernel requests
/// instead of holding them.
async fn connect(_endpoint: &str) -> Result<Channel> {
    todo!()
}

/// Waits until every change the mount acknowledged is committed, so none is lost on exit. Fails
/// with the first failure since the last `fsync`.
async fn drain(_fs: &Fs) -> Result<()> {
    todo!()
}

/// Refreshes the session periodically until a SIGINT or SIGTERM, or until the filesystem is
/// unmounted from outside (`fusermount3 -u`). A failed refresh is logged: kernel requests fail with
/// `EACCES` once the session expires.
async fn serve(_remote: &Remote, _session: &fuser::BackgroundSession) -> Result<()> {
    todo!()
}
