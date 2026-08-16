mod client;
#[cfg(target_os = "linux")]
mod fuse;
// The queue does not use Linux APIs. Compile its inline tests on developer
// machines too, even though the full FUSE mount is Linux-only.
#[cfg(all(test, not(target_os = "linux")))]
#[allow(dead_code)]
#[path = "fuse/remote.rs"]
mod fuse_remote_tests;
mod inode;
mod mount;
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
mod store;
#[cfg(target_os = "linux")]
mod supervise;

use clap::Subcommand;

#[derive(Debug, Subcommand)]
pub enum FilesystemCommand {
    /// Mount conversation/ and pod/ as one filesystem
    Mount(mount::MountArgs),
    /// Keep the filesystem mounted and restart it after an unexpected exit
    Supervise(mount::MountArgs),
}

pub fn run(command: FilesystemCommand) -> anyhow::Result<()> {
    match command {
        FilesystemCommand::Mount(args) => mount::run(args),
        #[cfg(target_os = "linux")]
        FilesystemCommand::Supervise(args) => supervise::run(args),
        #[cfg(not(target_os = "linux"))]
        FilesystemCommand::Supervise(args) => mount::run(args),
    }
}
