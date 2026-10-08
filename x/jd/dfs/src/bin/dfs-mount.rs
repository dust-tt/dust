#[cfg(target_os = "linux")]
#[derive(clap::Parser)]
struct Args {
    #[arg(long, default_value = "http://127.0.0.1:7443")]
    endpoint: String,
    #[arg(long)]
    token_file: std::path::PathBuf,
    #[arg(long)]
    ca: Option<std::path::PathBuf>,
    #[arg(long)]
    mountpoint: std::path::PathBuf,
    #[arg(long)]
    read_only: bool,
    #[arg(long, alias = "cache-bytes", default_value_t = 256 << 20)]
    content_cache_bytes: usize,
    #[arg(long, default_value_t = 100_000)]
    metadata_nodes: usize,
    #[arg(long, default_value_t = 128 << 20)]
    metadata_bytes: usize,
    #[arg(long, default_value_t = 32 << 20)]
    directory_snapshot_bytes: usize,
    #[arg(long, default_value_t = 8)]
    read_concurrency: usize,
    #[arg(long)]
    uid: Option<u32>,
    #[arg(long)]
    gid: Option<u32>,
    #[arg(long)]
    allow_other: bool,
    #[arg(long)]
    metrics_file: Option<std::path::PathBuf>,
}

#[cfg(target_os = "linux")]
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    use clap::Parser;
    use dfs_poc::{
        client::Client,
        live::{mount::Mount, mount_cache::Limits},
    };
    let args = Args::parse();
    let token = std::fs::read_to_string(args.token_file)?;
    let ca = args.ca.map(std::fs::read).transpose()?;
    let client = Client::connect(&args.endpoint, token.trim(), ca).await?;
    let client_counters = client.counters.clone();
    let mount = Mount::new(
        client,
        tokio::runtime::Handle::current(),
        Limits {
            content_bytes: args.content_cache_bytes,
            metadata_nodes: args.metadata_nodes,
            metadata_bytes: args.metadata_bytes,
            directory_bytes: args.directory_snapshot_bytes,
            concurrent_reads: args.read_concurrency,
        },
    )?
    .with_owner(
        args.uid.unwrap_or_else(|| unsafe { libc::getuid() }),
        args.gid.unwrap_or_else(|| unsafe { libc::getgid() }),
    );
    let mount_counters = mount.counters.clone();
    let mut options = vec![
        fuser::MountOption::FSName("dfs".to_owned()),
        fuser::MountOption::NoAtime,
        fuser::MountOption::NoDev,
        fuser::MountOption::NoSuid,
    ];
    if args.allow_other {
        options.push(fuser::MountOption::AllowOther);
        options.push(fuser::MountOption::DefaultPermissions);
    }
    if args.read_only {
        options.push(fuser::MountOption::RO);
    }
    let session = mount.spawn(&args.mountpoint, &options)?;
    let mut terminate = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())?;
    tokio::select! {
        signal = tokio::signal::ctrl_c() => signal?,
        _ = terminate.recv() => {},
    }
    session.shutdown()?;
    if let Some(path) = args.metrics_file {
        std::fs::write(
            path,
            serde_json::to_vec_pretty(&serde_json::json!({
                "client": client_counters.snapshot(),
                "fuse": mount_counters.snapshot(),
                "content_cache_bytes": args.content_cache_bytes,
            }))?,
        )?;
    }
    Ok(())
}

#[cfg(not(target_os = "linux"))]
fn main() -> anyhow::Result<()> {
    anyhow::bail!("FUSE mount requires Linux")
}
