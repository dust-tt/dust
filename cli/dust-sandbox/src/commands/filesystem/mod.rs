mod client;
#[cfg(target_os = "linux")]
mod fuse;
mod mount;
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
mod store;

use clap::Subcommand;

#[derive(Debug, Subcommand)]
pub enum FilesystemCommand {
    /// Mount conversation/ and pod/ as one filesystem
    Mount(mount::MountArgs),
}

pub fn run(command: FilesystemCommand) -> anyhow::Result<()> {
    match command {
        FilesystemCommand::Mount(args) => mount::run(args),
    }
}
