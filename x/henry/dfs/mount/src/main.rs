//! dfs-mount: mounts one dfs-server session at a local directory.

mod commit;
mod fs;
mod state;

use std::os::unix::fs::MetadataExt as _;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use anyhow::{Context, bail};
use clap::Parser;
use dfs_proto::client::Client;
use dfs_proto::{PROTOCOL_VERSION, Request, Response};
use fuser::{Config, MountOption, SessionACL};

use crate::fs::{Fs, Mount};
use crate::state::Budget;

#[derive(Parser)]
struct Cli {
    #[arg(long, default_value = "127.0.0.1:7400")]
    addr: String,
    #[arg(long, env = "DFS_TOKEN")]
    token: String,
    /// Object id to mount as the root (defaults to the tenant root).
    #[arg(long)]
    root: Option<u64>,
    /// FUSE request threads. Kernel wakeups round-robin across idle threads, which costs a
    /// cross-CPU wakeup per request; one thread measured 5-10x faster per cached op.
    #[arg(long, default_value_t = 1)]
    threads: usize,
    /// MAX_EVENTUAL_CONSISTENCY_DELAY: longest between a mutation's acknowledgment here and every
    /// other mount serving it, split between the commit window and the cache TTL.
    #[arg(long, env = "DFS_MAX_DELAY_MS", default_value_t = 1000)]
    max_delay_ms: u64,
    /// Keeps expired whole listings and revalidates them in batches (one `Validate` call) instead
    /// of fetching each again. Off by default.
    #[arg(long, env = "DFS_REVALIDATE", value_parser = clap::builder::BoolishValueParser::new())]
    revalidate_listings: bool,
    /// Most file content cached, in MiB. Listings, attributes and pending writes are not counted.
    #[arg(long, env = "DFS_CACHE_MIB", default_value_t = 256)]
    cache_mib: usize,
    mountpoint: PathBuf,
}

fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    let metadata = std::fs::metadata(&cli.mountpoint).with_context(|| format!("{}", cli.mountpoint.display()))?;
    let runtime = tokio::runtime::Builder::new_multi_thread().worker_threads(2).enable_all().build()?;
    let rt = runtime.handle().clone();

    let client = Arc::new(rt.block_on(Client::connect(&cli.addr))?);
    let hello = rt.block_on(client.call(Request::Hello { version: PROTOCOL_VERSION, token: cli.token, root: cli.root }));
    let root = match hello.result {
        Ok(Response::Session { root: Some(root), .. }) => root,
        Ok(_) => bail!("an administrator session has no data root"),
        Err(errno) => bail!("hello failed: errno {}", errno.0),
    };
    let budget = Budget::new(Duration::from_millis(cli.max_delay_ms));
    let fs = Arc::new(Fs::new(rt.clone(), client.clone(), root, (metadata.uid(), metadata.gid()), budget, cli.revalidate_listings, cli.cache_mib << 20));
    rt.spawn(commit::run(fs.clone()));

    let mut config = Config::default();
    // No `DefaultPermissions`: the kernel would check mode bits against attributes it may not
    // cache; the mount checks them itself (`local-permissions`).
    config.mount_options =
        vec![MountOption::FSName("dfs".into()), MountOption::NoDev, MountOption::NoSuid, MountOption::NoAtime, MountOption::RW];
    config.acl = SessionACL::All;
    config.n_threads = Some(cli.threads);
    config.clone_fd = true;
    let session = fuser::Session::new(Mount(fs.clone()), &cli.mountpoint, &config)?;
    let background = session.spawn()?;
    eprintln!("{}", serde_json::json!({ "message": "mount budget", "window_ms": budget.window.as_millis() as u64, "ttl_ms": budget.ttl.as_millis() as u64, "revalidate_listings": cli.revalidate_listings, "cache_mib": cli.cache_mib }));
    println!("mounted {}", cli.mountpoint.display());

    let stop = Arc::new(AtomicBool::new(false));
    signal_hook::flag::register(signal_hook::consts::SIGTERM, stop.clone())?;
    signal_hook::flag::register(signal_hook::consts::SIGINT, stop.clone())?;
    while !stop.load(Ordering::Relaxed) && !background.guard.is_finished() {
        std::thread::sleep(Duration::from_millis(50));
    }
    let drained = fs.drain();
    if !background.guard.is_finished() {
        background.umount_and_join()?;
    }
    rt.block_on(client.call(Request::Close));
    eprintln!("{}", fs.stats_json());
    if let Err(e) = drained {
        bail!("drain failed: {e:?}");
    }
    Ok(())
}
