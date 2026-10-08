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
    /// File containing only a session key. Never pass tenant or server keys to a sandbox.
    #[arg(long, env = "DFS_SESSION_KEY_FILE")]
    session_key_file: PathBuf,
    /// Existing, empty mount directory.
    mountpoint: PathBuf,
    /// Reject filesystem mutations.
    #[arg(long)]
    read_only: bool,
    /// Deferred callback workers; one separate receiving thread serves inline cache hits.
    #[arg(long, default_value = "8", value_parser = clap::value_parser!(u16).range(1..=8))]
    threads: u16,
    #[command(flatten)]
    cache: dfs_client::CacheConfig,
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
        sync::{
            Arc,
            atomic::{AtomicBool, Ordering},
        },
        time::Duration,
    };

    let key = dfs_protocol::credentials::read_key(&config.session_key_file)
        .context("read session key")?;
    let client = dfs_client::CachedClient::connect(&config.endpoint, &key, config.cache)?;
    ensure!(
        config.mountpoint.is_dir(),
        "mountpoint must be an existing directory"
    );
    ensure!(
        std::fs::read_dir(&config.mountpoint)?.next().is_none(),
        "mountpoint must be empty"
    );
    let stopped = Arc::new(AtomicBool::new(false));
    let filesystem = dfs_fuse::linux::Filesystem::new(
        client.clone(),
        config.read_only,
        stopped.clone(),
        usize::from(config.threads),
    )?;
    signal_hook::flag::register(SIGINT, stopped.clone())?;
    signal_hook::flag::register(SIGTERM, stopped.clone())?;
    let mut options = fuser::Config::default();
    options.mount_options = vec![
        MountOption::FSName("dfs".into()),
        MountOption::NoDev,
        MountOption::NoSuid,
        MountOption::NoAtime,
        if config.read_only {
            MountOption::RO
        } else {
            MountOption::RW
        },
    ];
    options.n_threads = Some(1);
    options.clone_fd = false;
    let session = Session::new(filesystem, &config.mountpoint, &options)?;
    let session = session.spawn()?;
    eprintln!("dfs-fuse: mounted; interrupt to unmount");
    while !stopped.load(Ordering::Relaxed) && !session.guard.is_finished() {
        std::thread::sleep(Duration::from_millis(100));
    }
    // Preserve a diagnostic snapshot even if an outstanding kernel request delays unmount.
    eprintln!("{}", client.metrics());
    let result = if session.guard.is_finished() {
        session.join()
    } else {
        session.umount_and_join()
    };
    result?;
    let started = std::time::Instant::now();
    let drain = client.drain();
    eprintln!(
        "{}",
        serde_json::json!({"client_drain_ms":started.elapsed().as_millis(),"failed":drain.is_err()})
    );
    eprintln!("{}", client.metrics());
    drain?;
    Ok(())
}
