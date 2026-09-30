#[cfg(target_os = "linux")]
use std::io::Read;
use std::path::PathBuf;

use anyhow::Result;
#[cfg(target_os = "linux")]
use anyhow::{Context, ensure};
use clap::Parser;

#[derive(Parser)]
#[command(
    version,
    about = "Mount a dfs session on Linux (no macFUSE dependency)"
)]
struct Config {
    /// HTTP(S) origin of the dfs server. Use TLS outside local development.
    #[arg(long, env = "DFS_ENDPOINT", default_value = "http://127.0.0.1:8080")]
    endpoint: String,
    /// File containing only a session key. Never pass workspace or server keys to a sandbox.
    #[arg(long, env = "DFS_SESSION_KEY_FILE")]
    session_key_file: PathBuf,
    /// Existing, empty mount directory.
    mountpoint: PathBuf,
    /// Reject filesystem mutations.
    #[arg(long)]
    read_only: bool,
    /// Number of blocking kernel/HTTP workers; bounds concurrent request buffers.
    #[arg(long, default_value = "8", value_parser = clap::value_parser!(u16).range(1..=32))]
    threads: u16,
}

fn main() -> Result<()> {
    let config = Config::parse();
    run(config)
}

#[cfg(not(target_os = "linux"))]
fn run(_config: Config) -> Result<()> {
    anyhow::bail!(
        "dfs mounting requires Linux and /dev/fuse; the API client and server run natively on macOS"
    )
}

#[cfg(target_os = "linux")]
fn run(config: Config) -> Result<()> {
    use fuser::{MountOption, Session};
    use signal_hook::consts::{SIGINT, SIGTERM};
    use std::{
        os::unix::fs::PermissionsExt,
        sync::{
            Arc,
            atomic::{AtomicBool, Ordering},
        },
        time::Duration,
    };

    let key_file =
        std::fs::File::open(&config.session_key_file).context("open session key file")?;
    ensure!(
        key_file.metadata()?.permissions().mode() & 0o077 == 0,
        "session key file must have mode 0600 or stricter"
    );
    let mut key = String::new();
    key_file
        .take(514)
        .read_to_string(&mut key)
        .context("read session key file")?;
    ensure!(key.len() <= 513, "session key file is too large");
    let client = dfs_client::Client::new(&config.endpoint, key.trim())?;
    ensure!(
        config.mountpoint.is_dir(),
        "mountpoint must be an existing directory"
    );
    ensure!(
        std::fs::read_dir(&config.mountpoint)?.next().is_none(),
        "mountpoint must be empty"
    );
    let filesystem = dfs_fuse::linux::Filesystem::new(client, config.read_only)?;
    let stopped = Arc::new(AtomicBool::new(false));
    signal_hook::flag::register(SIGINT, stopped.clone())?;
    signal_hook::flag::register(SIGTERM, stopped.clone())?;
    let mut options = fuser::Config::default();
    options.mount_options = vec![
        MountOption::FSName("dfs".into()),
        MountOption::NoDev,
        MountOption::NoSuid,
        MountOption::NoAtime,
        MountOption::DefaultPermissions,
        if config.read_only {
            MountOption::RO
        } else {
            MountOption::RW
        },
    ];
    options.n_threads = Some(usize::from(config.threads));
    options.clone_fd = true;
    let session = Session::new(filesystem, &config.mountpoint, &options)?.spawn()?;
    eprintln!("dfs-fuse: mounted; interrupt to unmount");
    while !stopped.load(Ordering::Relaxed) && !session.guard.is_finished() {
        std::thread::sleep(Duration::from_millis(100));
    }
    if session.guard.is_finished() {
        session.join()?;
    } else {
        session.umount_and_join()?;
    }
    Ok(())
}
