//! The dfs mount library: what a FUSE adapter needs to serve a dfs session as a filesystem.
//!
//! - `remote`: the connection to the dfs server, authenticated with a session key.
//! - `fs`: the filesystem operations, in FUSE terms but independent of the FUSE library.
//!
//! The mount root is built by the mount itself: it lists the folders the caller configures.
//! Operations inside dfs directories return `EOPNOTSUPP` until the server supports them.

mod attributes;
mod errno;
mod fs;
mod inodes;
mod remote;

pub use errno::Errno;
pub use fs::{Attributes, DirEntry, Folder, Fs, Ino, Kind, ROOT_INO};
pub use remote::Remote;
