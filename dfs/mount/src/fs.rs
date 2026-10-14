use crate::{errno::Errno, inodes::Inodes, remote::Remote};
use dfs_protocol::{ObjectId, ObjectRef, is_valid_name, rpc::ObjectKind};
use std::{
    collections::HashSet,
    sync::{Mutex, PoisonError},
    time::SystemTime,
};

/// A FUSE inode number. dfs object IDs are 128 bits, so the mount gives each object a 64-bit number.
pub type Ino = u64;

/// The inode number FUSE gives the mount root.
pub const ROOT_INO: Ino = 1;

/// Read and execute for everyone: the root is read-only.
const ROOT_PERMISSIONS: u16 = 0o555;

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

/// A configured folder and its inode number, fixed for the life of the mount.
struct RootEntry {
    folder: Folder,
    ino: Ino,
}

/// The filesystem served by the mount, independent of the FUSE library. Inode numbers come from
/// and go back to the kernel; everything else is fetched from the dfs server.
pub struct Fs {
    remote: Remote,
    root_entries: Vec<RootEntry>,
    inodes: Mutex<Inodes>,
    /// When the mount started: the root's timestamps.
    started: SystemTime,
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
        let mut inodes = Inodes::new();
        let root_entries = folders
            .into_iter()
            .map(|folder| RootEntry {
                ino: inodes.pin(folder.id),
                folder,
            })
            .collect();
        Ok(Self {
            remote,
            root_entries,
            inodes: Mutex::new(inodes),
            started: SystemTime::now(),
        })
    }

    pub async fn getattr(&self, ino: Ino) -> Result<Attributes, Errno> {
        if ino != ROOT_INO {
            todo!()
        }
        Ok(Attributes {
            ino: ROOT_INO,
            kind: Kind::Directory,
            size: 0,
            permissions: ROOT_PERMISSIONS,
            atime: self.started,
            mtime: self.started,
            ctime: self.started,
        })
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
    pub async fn readdir(&self, ino: Ino) -> Result<Vec<DirEntry>, Errno> {
        if ino != ROOT_INO {
            todo!()
        }
        let references: Vec<ObjectRef> = self
            .root_entries
            .iter()
            .map(|entry| entry.folder.id.into())
            .collect();
        let results = self.remote.stat(&references).await?;
        let mut entries = Vec::new();
        for (entry, result) in self.root_entries.iter().zip(results) {
            match result {
                Ok(attr) if attr.kind() == ObjectKind::Directory => entries.push(DirEntry {
                    ino: entry.ino,
                    kind: Kind::Directory,
                    name: entry.folder.name.clone(),
                }),
                // Missing or unreadable folders, and folders that are not directories.
                Ok(_) | Err(Errno::ENOENT) => {}
                Err(errno) => return Err(errno),
            }
        }
        Ok(entries)
    }

    /**
     * @cc [owner:fontanierh,label:coding] forget-counts
     * The mount MUST keep an object until the kernel has forgotten every lookup of it, and MUST
     * drop it then. The root and configured folders MUST never be dropped.
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
    async fn the_root_is_a_read_only_directory() -> Result<(), Errno> {
        let root = new_fs(Vec::new())?.getattr(ROOT_INO).await?;
        assert_eq!(root.ino, ROOT_INO);
        assert_eq!(root.kind, Kind::Directory);
        assert_eq!(root.permissions, 0o555);
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
