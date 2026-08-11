mod attach;
mod changes;
#[cfg(target_os = "linux")]
mod fuse;
mod mount;
mod show;
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
mod store;

use clap::Subcommand;

#[derive(Debug, Subcommand)]
pub enum FilesystemCommand {
    /// Mount conversation/ and pod/ as one filesystem
    Mount(mount::MountArgs),
    /// Show the stored identity for one path
    Show(show::ShowArgs),
    /// Attach a Dust FileResource ID to one file
    Attach(attach::AttachArgs),
    /// Print filesystem changes in the order they happened
    Changes(changes::ChangesArgs),
}

pub fn run(command: FilesystemCommand) -> anyhow::Result<()> {
    match command {
        FilesystemCommand::Mount(args) => mount::run(args),
        FilesystemCommand::Show(args) => show::run(args),
        FilesystemCommand::Attach(args) => attach::run(args),
        FilesystemCommand::Changes(args) => changes::run(args),
    }
}
