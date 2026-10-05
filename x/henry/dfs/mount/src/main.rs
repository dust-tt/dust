//! dfs-mount: mounts one dfs-server session at a local directory.

mod fs;

use std::os::unix::fs::MetadataExt as _;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use anyhow::{Context, bail};
use clap::Parser;
use dfs_proto::client::Client;
use dfs_proto::{PROTOCOL_VERSION, Request, Response};
use fuser::{Config, MountOption, SessionACL};

use crate::fs::{Fs, Job, Mount, Profile};

const RENEW_EVERY: Duration = Duration::from_secs(10);

#[derive(Parser)]
struct Cli {
    #[arg(long, default_value = "127.0.0.1:7400")]
    addr: String,
    #[arg(long, env = "DFS_TOKEN")]
    token: String,
    /// Object id to mount as the root (defaults to the tenant root).
    #[arg(long)]
    root: Option<u64>,
    #[arg(long, default_value_t = 8)]
    threads: usize,
    /// `matched` acknowledges close before its commit (labelled, non-default).
    #[arg(long, value_enum, default_value = "strict")]
    profile: Profile,
    mountpoint: PathBuf,
}

fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    let metadata = std::fs::metadata(&cli.mountpoint).with_context(|| format!("{}", cli.mountpoint.display()))?;
    let runtime = tokio::runtime::Builder::new_multi_thread().worker_threads(2).enable_all().build()?;
    let rt = runtime.handle().clone();

    let (pushed, mut invalidations) = tokio::sync::mpsc::unbounded_channel();
    let client = Arc::new(rt.block_on(Client::connect(&cli.addr, pushed))?);
    let sent = Instant::now();
    let hello = rt.block_on(client.call(Request::Hello { version: PROTOCOL_VERSION, token: cli.token, root: cli.root }));
    let (lease_ms, root) = match hello.result {
        Ok(Response::Session { lease_ms, root: Some(root), .. }) => (lease_ms, root),
        Ok(_) => bail!("an administrator session has no data root"),
        Err(errno) => bail!("hello failed: errno {}", errno.0),
    };

    let (jobs, queue) = std::sync::mpsc::channel::<Job>();
    let fs = Arc::new(Fs::new(
        rt.clone(),
        client.clone(),
        root.id,
        (metadata.uid(), metadata.gid()),
        sent + Duration::from_millis(lease_ms),
        jobs.clone(),
        cli.profile,
    ));

    let mut config = Config::default();
    config.mount_options = vec![
        MountOption::FSName("dfs".into()),
        MountOption::NoDev,
        MountOption::NoSuid,
        MountOption::NoAtime,
        MountOption::DefaultPermissions,
        MountOption::RW,
    ];
    config.acl = SessionACL::All;
    config.n_threads = Some(cli.threads);
    config.clone_fd = true;
    let session = fuser::Session::new(Mount(fs.clone()), &cli.mountpoint, &config)?;
    let notifier = session.notifier();
    let probe = session.notifier();

    // Kernel notifications block on kernel locks, so they never run on a FUSE request thread.
    let notifying = fs.clone();
    std::thread::spawn(move || {
        while let Ok(job) = queue.recv() {
            match job {
                Job::Remote(number, items) => {
                    let kernel = notifying.apply_remote(&items);
                    if notifying.notify(&notifier, &kernel) {
                        notifying.client.ack(number);
                    } else {
                        // Never acknowledge what the kernel may still serve: stop caching and let
                        // the server wait for this lease to expire.
                        let kernel = notifying.lose_lease();
                        notifying.notify(&notifier, &kernel);
                    }
                }
                Job::Notify(kernel) => {
                    if !notifying.notify(&notifier, &kernel) {
                        let kernel = notifying.lose_lease();
                        notifying.notify(&notifier, &kernel);
                    }
                }
                Job::LeaseLost => {
                    let kernel = notifying.lose_lease();
                    notifying.notify(&notifier, &kernel);
                }
            }
        }
    });

    let forward = jobs.clone();
    rt.spawn(async move {
        while let Some((number, items)) = invalidations.recv().await {
            let _ = forward.send(Job::Remote(number, items));
        }
        // The connection ended: nothing can be trusted any more.
        let _ = forward.send(Job::LeaseLost);
    });

    let renewing = fs.clone();
    rt.spawn(async move {
        loop {
            tokio::time::sleep(RENEW_EVERY).await;
            let sent = Instant::now();
            // A renewal that does not answer in time is a lost lease, not a pending one.
            match tokio::time::timeout(RENEW_EVERY, renewing.client.call(Request::Renew)).await.map(|r| r.result) {
                Ok(Ok(Response::Renewed { lease_ms })) => renewing.renewed(sent + Duration::from_millis(lease_ms)),
                _ => {
                    let _ = jobs.send(Job::LeaseLost);
                    break;
                }
            }
        }
    });

    let background = session.spawn()?;
    fs.probe_negative(&probe, &cli.mountpoint);
    eprintln!("{}", serde_json::json!({ "message": "mount probe", "negative_ttl": fs.negative_ttl() }));
    println!("mounted {}", cli.mountpoint.display());

    let stop = Arc::new(AtomicBool::new(false));
    signal_hook::flag::register(signal_hook::consts::SIGTERM, stop.clone())?;
    signal_hook::flag::register(signal_hook::consts::SIGINT, stop.clone())?;
    while !stop.load(Ordering::Relaxed) && !background.guard.is_finished() {
        std::thread::sleep(Duration::from_millis(100));
    }
    fs.flush_all();
    if !background.guard.is_finished() {
        background.umount_and_join()?;
    }
    rt.block_on(client.call(Request::Close));
    eprintln!("{}", fs.stats.json());
    Ok(())
}
