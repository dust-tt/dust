use std::path::PathBuf;

#[cfg(not(target_os = "linux"))]
use anyhow::bail;
use clap::Args;

#[derive(Args, Debug)]
pub struct MountArgs {
    /// Directory where the filesystem will appear
    #[arg(long)]
    mountpoint: PathBuf,
    /// Local directory used only for open files and write staging
    #[arg(long)]
    staging_dir: PathBuf,
    /// Front base URL, for example http://host.docker.internal:3000
    #[arg(long)]
    api_url: String,
    /// Workspace string ID carried by the sandbox filesystem token
    #[arg(long)]
    workspace_id: String,
    /// Mode-0600 file containing the sandbox filesystem token
    #[arg(long)]
    token_file: PathBuf,
}

#[cfg(target_os = "linux")]
pub fn run(args: MountArgs) -> anyhow::Result<()> {
    super::fuse::mount(
        &args.mountpoint,
        &args.staging_dir,
        &args.api_url,
        &args.workspace_id,
        &args.token_file,
    )
}

#[cfg(not(target_os = "linux"))]
pub fn run(args: MountArgs) -> anyhow::Result<()> {
    let _ = args;
    bail!("dsbx filesystem mount is supported only on Linux")
}
