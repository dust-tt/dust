//! Parses the `dsbx filesystem mount` options and starts one FUSE mount.
//!
//! The command runs the filesystem in the current process. Production starts
//! it through `supervise`, which can restart the mount process if it exits.

use std::path::PathBuf;

#[cfg(not(target_os = "linux"))]
use anyhow::bail;
use clap::Args;

#[derive(Args, Clone, Debug)]
pub struct MountArgs {
    /// Directory where the filesystem will appear
    #[arg(long)]
    pub(super) mountpoint: PathBuf,
    /// Local directory used only for open files and write staging
    #[arg(long)]
    pub(super) staging_dir: PathBuf,
    /// Front base URL, for example http://host.docker.internal:3000
    #[arg(long)]
    pub(super) api_url: String,
    /// Workspace string ID carried by the sandbox filesystem token
    #[arg(long)]
    pub(super) workspace_id: String,
    /// Mode-0600 file containing the sandbox filesystem token
    #[arg(long)]
    pub(super) token_file: PathBuf,
    /// Maximum local content cache size in MiB; open files may temporarily exceed it
    #[arg(long, default_value_t = 512)]
    pub(super) cache_capacity_mib: u64,
}

#[cfg(target_os = "linux")]
pub fn run(args: MountArgs) -> anyhow::Result<()> {
    use anyhow::Context;

    let cache_capacity_bytes = args
        .cache_capacity_mib
        .checked_mul(1024 * 1024)
        .ok_or_else(|| anyhow::anyhow!("filesystem cache capacity is too large"))?;
    // Calls to Front run on this runtime while the mount keeps the current
    // thread busy, so it needs threads of its own. `filesystem::run` gave this
    // thread no runtime, which is what lets it be built and dropped here.
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .context("failed to start the filesystem runtime")?;
    super::fuse::mount(
        &args.mountpoint,
        &args.staging_dir,
        &args.api_url,
        &args.workspace_id,
        &args.token_file,
        cache_capacity_bytes,
        runtime.handle().clone(),
    )
}

#[cfg(not(target_os = "linux"))]
pub fn run(args: MountArgs) -> anyhow::Result<()> {
    let _ = args;
    bail!("dsbx filesystem mount is supported only on Linux")
}
