//! Serves `dfs_mount::Fs` to the kernel through `fuser`.

use dfs_mount::{Attributes, DirEntry, Errno, Fs, Ino, Kind};
use dfs_protocol::READ_MAX_BYTES;
use fuser::{
    Config, FileAttr, FileHandle, FileType, Filesystem, Generation, INodeNo, IoctlFlags,
    MountOption, ReplyAttr, ReplyDirectory, ReplyEmpty, ReplyEntry, ReplyIoctl, ReplyXattr,
    Request, SessionACL,
};
use std::{ffi::OsStr, sync::Arc, time::Duration};
use tokio::runtime::Handle;

/**
 * @cc [owner:fontanierh,label:security] kernel-asks-again
 * Entry and attribute replies MUST have a zero TTL, so the kernel asks the mount again instead of
 * reusing what the server may have refused the session since.
 */
const TTL: Duration = Duration::ZERO;
/// `st_blocks` counts 512-byte blocks, whatever the filesystem's block size.
const STAT_BLOCK_BYTES: u64 = 512;
/// A directory's links: its entry in its parent and its own `.`.
const DIRECTORY_LINKS: u32 = 2;

/**
 * @cc [owner:fontanierh,label:security] owner-only
 * Only the user running the adapter MUST be able to use the mount (no `allow_other`): every user that
 * reaches it acts as the session.
 */
/**
 * @cc [owner:fontanierh,label:security] read-only-mount
 * The mount MUST be read-only, with `default_permissions`: the kernel refuses writes, and checks the
 * server's mode bits against the owner before asking the mount.
 */
pub(crate) fn config() -> Config {
    let mut config = Config::default();
    config.mount_options = vec![
        MountOption::FSName("dfs".to_owned()),
        MountOption::RO,
        MountOption::DefaultPermissions,
        MountOption::NoDev,
        MountOption::NoSuid,
        // Reads never update dfs timestamps.
        MountOption::NoAtime,
    ];
    config.acl = SessionACL::Owner;
    config
}

/// The `fuser` filesystem. Each request that may call the server runs as a task on `runtime`, so the
/// FUSE thread takes the next request without waiting for the reply.
pub(crate) struct Adapter {
    fs: Arc<Fs>,
    runtime: Handle,
    owner: Owner,
}

/// The owner of every inode: the user running the adapter, the only one who can use the mount.
#[derive(Clone, Copy)]
struct Owner {
    uid: u32,
    gid: u32,
}

impl Adapter {
    pub(crate) fn new(fs: Fs, runtime: Handle) -> Self {
        Self {
            fs: Arc::new(fs),
            runtime,
            owner: Owner {
                uid: nix::unistd::getuid().as_raw(),
                gid: nix::unistd::getgid().as_raw(),
            },
        }
    }
}

impl Owner {
    fn file_attr(self, attributes: &Attributes) -> FileAttr {
        let nlink = match attributes.kind {
            Kind::Directory => DIRECTORY_LINKS,
            Kind::File => 1,
        };
        FileAttr {
            ino: INodeNo(attributes.ino),
            size: attributes.size,
            blocks: attributes.size.div_ceil(STAT_BLOCK_BYTES),
            atime: attributes.atime,
            mtime: attributes.mtime,
            ctime: attributes.ctime,
            crtime: attributes.ctime,
            kind: file_type(attributes.kind),
            perm: attributes.permissions,
            nlink,
            uid: self.uid,
            gid: self.gid,
            rdev: 0,
            // Tools size their I/O buffers from it: one `Read` request's worth.
            blksize: READ_MAX_BYTES,
            flags: 0,
        }
    }
}

fn file_type(kind: Kind) -> FileType {
    match kind {
        Kind::Directory => FileType::Directory,
        Kind::File => FileType::RegularFile,
    }
}

fn errno(errno: Errno) -> fuser::Errno {
    fuser::Errno::from_i32(errno.0)
}

/**
 * @cc [owner:fontanierh,label:product] readdir-offsets
 * The listing of `ino` MUST start with `.` and `..`, and give each entry the offset of the next one,
 * so a `readdir` at an offset resumes right after the last entry the kernel took.
 */
fn listing(ino: Ino, entries: Vec<DirEntry>, offset: u64) -> impl Iterator<Item = (u64, DirEntry)> {
    // The kernel resolves `..` itself; its inode number in a listing is informational.
    let dots = [".", ".."].map(|name| DirEntry {
        ino,
        kind: Kind::Directory,
        name: name.to_owned(),
    });
    (1..)
        .zip(dots.into_iter().chain(entries))
        .skip_while(move |(next, _)| *next <= offset)
}

/**
 * @cc [owner:fontanierh,label:error-handling] no-enosys
 * The adapter MUST NOT reply `ENOSYS`, `fuser`'s default for every operation it does not override:
 * it overrides each operation the kernel sends to a read-only mount of directories, with
 * `default_permissions` and without readdirplus.
 */
impl Filesystem for Adapter {
    fn lookup(&self, _req: &Request, parent: INodeNo, name: &OsStr, reply: ReplyEntry) {
        // dfs names are UTF-8: no object has this name.
        let Some(name) = name.to_str().map(str::to_owned) else {
            return reply.error(fuser::Errno::ENOENT);
        };
        let fs = self.fs.clone();
        let owner = self.owner;
        self.runtime.spawn(async move {
            match fs.lookup(parent.0, &name).await {
                // Inode numbers are never reused, so their generation never changes.
                Ok(attributes) => reply.entry(&TTL, &owner.file_attr(&attributes), Generation(0)),
                Err(e) => reply.error(errno(e)),
            }
        });
    }

    fn forget(&self, _req: &Request, ino: INodeNo, nlookup: u64) {
        self.fs.forget(ino.0, nlookup);
    }

    fn getattr(&self, _req: &Request, ino: INodeNo, _fh: Option<FileHandle>, reply: ReplyAttr) {
        let fs = self.fs.clone();
        let owner = self.owner;
        self.runtime.spawn(async move {
            match fs.getattr(ino.0).await {
                Ok(attributes) => reply.attr(&TTL, &owner.file_attr(&attributes)),
                Err(e) => reply.error(errno(e)),
            }
        });
    }

    fn readdir(
        &self,
        _req: &Request,
        ino: INodeNo,
        _fh: FileHandle,
        offset: u64,
        mut reply: ReplyDirectory,
    ) {
        let fs = self.fs.clone();
        self.runtime.spawn(async move {
            // Each call lists the directory again: a listing that changes between calls may skip or
            // repeat entries.
            let entries = match fs.readdir(ino.0).await {
                Ok(entries) => entries,
                Err(e) => return reply.error(errno(e)),
            };
            for (next, entry) in listing(ino.0, entries, offset) {
                let full = reply.add(INodeNo(entry.ino), next, file_type(entry.kind), entry.name);
                if full {
                    break;
                }
            }
            reply.ok();
        });
    }

    fn fsyncdir(
        &self,
        _req: &Request,
        _ino: INodeNo,
        _fh: FileHandle,
        _datasync: bool,
        reply: ReplyEmpty,
    ) {
        // Nothing to write on a read-only mount.
        reply.ok();
    }

    fn getxattr(
        &self,
        _req: &Request,
        _ino: INodeNo,
        _name: &OsStr,
        _size: u32,
        reply: ReplyXattr,
    ) {
        // Needs the library's extended attributes, not supported yet.
        reply.error(fuser::Errno::EOPNOTSUPP);
    }

    fn listxattr(&self, _req: &Request, _ino: INodeNo, _size: u32, reply: ReplyXattr) {
        // Needs the library's extended attributes, not supported yet.
        reply.error(fuser::Errno::EOPNOTSUPP);
    }

    fn ioctl(
        &self,
        _req: &Request,
        _ino: INodeNo,
        _fh: FileHandle,
        _flags: IoctlFlags,
        _cmd: u32,
        _in_data: &[u8],
        _out_size: u32,
        reply: ReplyIoctl,
    ) {
        // The answer for a device that takes no ioctl.
        reply.error(fuser::Errno::ENOTTY);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use dfs_mount::ROOT_INO;
    use std::time::UNIX_EPOCH;

    const UID: u32 = 1000;
    const GID: u32 = 100;
    const SIZE: u64 = 1025;

    fn entry(ino: Ino, name: &str) -> DirEntry {
        DirEntry {
            ino,
            kind: Kind::Directory,
            name: name.to_owned(),
        }
    }

    #[test]
    fn the_mount_is_read_only_and_owner_only() {
        let config = config();
        assert!(config.mount_options.contains(&MountOption::RO));
        assert!(
            config
                .mount_options
                .contains(&MountOption::DefaultPermissions)
        );
        assert_eq!(config.acl, SessionACL::Owner);
    }

    #[test]
    fn file_attributes_belong_to_the_owner() {
        let owner = Owner { uid: UID, gid: GID };
        let ctime = UNIX_EPOCH + Duration::from_secs(2);
        let attr = owner.file_attr(&Attributes {
            ino: 7,
            kind: Kind::File,
            size: SIZE,
            permissions: 0o400,
            atime: UNIX_EPOCH,
            mtime: UNIX_EPOCH,
            ctime,
        });
        assert_eq!(attr.ino, INodeNo(7));
        assert_eq!(attr.kind, FileType::RegularFile);
        assert_eq!((attr.size, attr.blocks), (SIZE, 3));
        assert_eq!((attr.perm, attr.nlink), (0o400, 1));
        assert_eq!((attr.uid, attr.gid), (UID, GID));
        assert_eq!(attr.crtime, ctime);
    }

    #[test]
    fn listings_resume_after_the_offset() {
        let entries = || vec![entry(2, "a"), entry(3, "b")];
        let names = |offset| {
            listing(ROOT_INO, entries(), offset)
                .map(|(next, entry)| (next, entry.name))
                .collect::<Vec<_>>()
        };
        assert_eq!(
            names(0),
            [(1, "."), (2, ".."), (3, "a"), (4, "b")].map(|(next, name)| (next, name.to_owned()))
        );
        assert_eq!(names(3), [(4, "b".to_owned())]);
        assert!(names(4).is_empty());
        assert!(
            listing(5, entries(), 0)
                .take(2)
                .all(|(_, entry)| entry.ino == 5)
        );
    }
}
