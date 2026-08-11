use std::path::PathBuf;

#[cfg(not(target_os = "linux"))]
use anyhow::bail;
use clap::Args;

#[derive(Args, Debug)]
pub struct MountArgs {
    /// Directory where the filesystem will appear
    #[arg(long)]
    mountpoint: PathBuf,
    /// Directory containing files.sqlite3 and file contents
    #[arg(long)]
    state_dir: PathBuf,
}

#[cfg(target_os = "linux")]
pub fn run(args: MountArgs) -> anyhow::Result<()> {
    super::fuse::mount(&args.mountpoint, &args.state_dir)
}

#[cfg(not(target_os = "linux"))]
pub fn run(args: MountArgs) -> anyhow::Result<()> {
    let _ = args;
    bail!("dsbx filesystem mount is supported only on Linux")
}
