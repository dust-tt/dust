use crate::{
    errno::Errno,
    fs::{Attributes, Ino, Kind},
};
use dfs_protocol::rpc::{Attr, ObjectKind};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// The permission bits of a mode: read, write and execute for owner, group and other, plus setuid,
/// setgid and sticky.
const PERMISSION_BITS: u32 = 0o7777;

impl Attributes {
    /// The attributes of inode `ino`, which holds the dfs object `attr` describes. Fails with `EIO`
    /// for symlinks, which the mount does not support yet, and for kinds it does not know.
    #[cfg_attr(
        not(test),
        expect(dead_code, reason = "used by `Fs::getattr`, not implemented yet")
    )]
    pub(crate) fn from_attr(ino: Ino, attr: &Attr) -> Result<Self, Errno> {
        let kind = match ObjectKind::try_from(attr.kind) {
            Ok(ObjectKind::Directory) => Kind::Directory,
            Ok(ObjectKind::File) => Kind::File,
            Ok(ObjectKind::Symlink) | Err(_) => return Err(Errno::EIO),
        };
        Ok(Self {
            ino,
            kind,
            size: attr.size,
            permissions: (attr.mode & PERMISSION_BITS) as u16,
            atime: time(attr.atime),
            mtime: time(attr.mtime),
            ctime: time(attr.ctime),
        })
    }
}

/// A dfs timestamp, in Unix milliseconds. A missing timestamp is the Unix epoch.
fn time(milliseconds: Option<u64>) -> SystemTime {
    UNIX_EPOCH + Duration::from_millis(milliseconds.unwrap_or(0))
}

#[cfg(test)]
mod tests {
    use super::*;

    const INO: Ino = 7;

    fn attr(kind: i32) -> Attr {
        Attr {
            kind,
            size: 42,
            mode: 0o500,
            atime: Some(1_000),
            mtime: Some(2_500),
            ctime: None,
            ..Attr::default()
        }
    }

    #[test]
    fn maps_files_and_directories() -> Result<(), Errno> {
        let directory = Attributes::from_attr(INO, &attr(ObjectKind::Directory.into()))?;
        assert_eq!(directory.kind, Kind::Directory);
        let file = Attributes::from_attr(INO, &attr(ObjectKind::File.into()))?;
        assert_eq!(
            file,
            Attributes {
                ino: INO,
                kind: Kind::File,
                size: 42,
                permissions: 0o500,
                atime: UNIX_EPOCH + Duration::from_secs(1),
                mtime: UNIX_EPOCH + Duration::from_millis(2_500),
                ctime: UNIX_EPOCH,
            }
        );
        Ok(())
    }

    #[test]
    fn keeps_only_permission_bits() -> Result<(), Errno> {
        let mut file = attr(ObjectKind::File.into());
        file.mode = 0o100_644;
        assert_eq!(Attributes::from_attr(INO, &file)?.permissions, 0o644);
        Ok(())
    }

    #[test]
    fn rejects_symlinks_and_unknown_kinds() {
        for kind in [ObjectKind::Symlink.into(), 99] {
            assert_eq!(Attributes::from_attr(INO, &attr(kind)), Err(Errno::EIO));
        }
    }
}
