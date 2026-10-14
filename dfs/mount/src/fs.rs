use crate::{errno::Errno, remote::Remote};
use dfs_protocol::ObjectId;
use std::time::SystemTime;

/// A FUSE inode number. dfs object IDs are 128 bits, so the mount gives each object a 64-bit number.
pub type Ino = u64;

/// The inode number FUSE gives the mount root.
pub const ROOT_INO: Ino = 1;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Directory,
    File,
}

/// Attributes of an inode, independent of the FUSE library.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Attributes {
    pub ino: Ino,
    pub kind: Kind,
    pub size: u64,
    pub permissions: u16,
    pub atime: SystemTime,
    pub mtime: SystemTime,
    pub ctime: SystemTime,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DirEntry {
    pub ino: Ino,
    pub kind: Kind,
    pub name: String,
}

/// An entry of the mount root: the dfs folder `id`, shown under `name`, such as `conversation`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Folder {
    pub name: String,
    pub id: ObjectId,
}

/// The filesystem served by the mount, independent of the FUSE library. Inode numbers come from
/// and go back to the kernel; everything else is fetched from the dfs server.
pub struct Fs {}

impl Fs {
    /// Fails with `EINVAL` if a folder name is not a valid basename, or if a name or a folder
    /// appears twice: a directory must not have two names.
    pub fn new(_remote: Remote, _folders: Vec<Folder>) -> Result<Self, Errno> {
        todo!()
    }

    pub async fn getattr(&self, _ino: Ino) -> Result<Attributes, Errno> {
        todo!()
    }

    /**
     * @cc [owner:fontanierh,label:coding] one-inode-per-object
     * While the kernel remembers an object, every lookup of it MUST return the same inode number.
     */
    /**
     * @cc [owner:fontanierh,label:coding] no-inode-reuse
     * An inode number MUST NOT be given to a different object during the life of the mount, even
     * after the kernel forgets it.
     */
    pub async fn lookup(&self, _parent: Ino, _name: &str) -> Result<Attributes, Errno> {
        todo!()
    }

    /**
     * @cc [owner:fontanierh,label:product] synthetic-root
     * The root MUST list only configured folders, and MUST be read-only.
     */
    pub async fn readdir(&self, _ino: Ino) -> Result<Vec<DirEntry>, Errno> {
        todo!()
    }

    /**
     * @cc [owner:fontanierh,label:coding] forget-counts
     * The mount MUST keep an object until the kernel has forgotten every lookup of it, and MUST
     * drop it then. The root MUST never be dropped.
     */
    pub fn forget(&self, _ino: Ino, _count: u64) {
        todo!()
    }
}
