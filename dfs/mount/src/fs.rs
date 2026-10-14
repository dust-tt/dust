use crate::{errno::Errno, inodes::Inodes, remote::Remote};
use dfs_protocol::{ObjectId, is_valid_name};
use std::{
    collections::HashSet,
    sync::{Mutex, PoisonError},
    time::SystemTime,
};

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
pub struct Fs {
    #[expect(
        dead_code,
        reason = "used by `getattr`, `lookup` and `readdir`, not implemented yet"
    )]
    remote: Remote,
    #[expect(
        dead_code,
        reason = "used by `lookup` and `readdir`, not implemented yet"
    )]
    folders: Vec<Folder>,
    inodes: Mutex<Inodes>,
}

impl Fs {
    /// A directory must not have two names, so each folder appears once.
    /**
     * @cc [owner:fontanierh,label:product] valid-folders
     * `new` MUST fail with `EINVAL` unless every folder name is a valid object name, no name appears
     * twice, and no folder ID appears twice.
     */
    pub fn new(remote: Remote, folders: Vec<Folder>) -> Result<Self, Errno> {
        let mut names = HashSet::new();
        let mut ids = HashSet::new();
        for folder in &folders {
            if !is_valid_name(&folder.name) || !names.insert(&folder.name) || !ids.insert(folder.id)
            {
                return Err(Errno::EINVAL);
            }
        }
        Ok(Self {
            remote,
            folders,
            inodes: Mutex::new(Inodes::new()),
        })
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
    pub fn forget(&self, ino: Ino, count: u64) {
        self.inodes
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .forget(ino, count);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tonic::transport::Channel;

    fn folder(name: &str, id: ObjectId) -> Folder {
        Folder {
            name: name.to_owned(),
            id,
        }
    }

    fn new_fs(folders: Vec<Folder>) -> Result<Fs, Errno> {
        let channel = Channel::from_static("http://127.0.0.1:1").connect_lazy();
        Fs::new(Remote::new(channel, &"0".repeat(64))?, folders)
    }

    #[tokio::test]
    async fn new_accepts_distinct_folders() -> Result<(), Errno> {
        new_fs(vec![
            folder("conversation", ObjectId::new_v7()),
            folder("project", ObjectId::new_v7()),
        ])?;
        Ok(())
    }

    #[tokio::test]
    async fn new_rejects_invalid_or_repeated_folders() {
        let id = ObjectId::new_v7();
        for folders in [
            vec![folder("", id)],
            vec![folder("..", id)],
            vec![folder("a/b", id)],
            vec![folder("a", id), folder("a", ObjectId::new_v7())],
            vec![folder("a", id), folder("b", id)],
        ] {
            assert_eq!(new_fs(folders).err(), Some(Errno::EINVAL));
        }
    }
}
