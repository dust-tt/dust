mod client;
#[cfg(target_os = "linux")]
mod fuse;
mod inode;
mod mount;
// The worker pools behind the FUSE calls. They use no Linux API, so they also
// compile and run their tests on developer machines.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
mod remote;
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
mod store;
#[cfg(target_os = "linux")]
mod supervise;

use std::io;

use anyhow::bail;
use clap::Subcommand;

#[derive(Debug, Subcommand)]
pub enum FilesystemCommand {
    /// Mount conversation/ and pod/ as one filesystem
    Mount(mount::MountArgs),
    /// Keep the filesystem mounted and restart it after an unexpected exit
    Supervise(mount::MountArgs),
}

pub fn run(command: FilesystemCommand) -> anyhow::Result<()> {
    // `dsbx` runs its commands inside a Tokio runtime, and the filesystem
    // cannot start there: the blocking HTTP client refuses to be built while a
    // runtime is entered on the thread, and the mount then keeps its thread
    // busy until it ends. This thread runs no runtime, so both are fine, and
    // the runtime the filesystem starts for itself can also be dropped here.
    let running = std::thread::spawn(move || match command {
        FilesystemCommand::Mount(args) => mount::run(args),
        #[cfg(target_os = "linux")]
        FilesystemCommand::Supervise(args) => supervise::run(args),
        #[cfg(not(target_os = "linux"))]
        FilesystemCommand::Supervise(args) => mount::run(args),
    });
    match running.join() {
        Ok(result) => result,
        Err(_) => bail!("the filesystem command panicked"),
    }
}

// Builds an error holding one POSIX error number such as `libc::ENOENT`. Every
// layer reports failures this way, so the FUSE reply can pass the same number
// back to Linux.
fn errno(code: i32) -> io::Error {
    io::Error::from_raw_os_error(code)
}
