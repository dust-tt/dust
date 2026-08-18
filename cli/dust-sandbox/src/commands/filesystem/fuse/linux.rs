//! Converts Dust file data and errors into the values Linux expects.
//!
//! This includes `stat` fields, file kinds, executable-bit checks, filesystem
//! size information, open-flag checks, and errno replies. It also reads the
//! local disk capacity reported by `statfs`.

use std::ffi::{CString, OsStr};
use std::io;
use std::os::unix::ffi::OsStrExt;
use std::path::Path;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use fuser::{Errno, FileAttr, FileType, ReplyEmpty};

use super::super::store::{Node, NodeKind};

// Linux reports allocated space in fixed 512-byte units through st_blocks.
const STAT_BLOCK_SIZE_BYTES: u64 = 512;
// Linux exposes this as the preferred size for file I/O through st_blksize.
const PREFERRED_IO_SIZE: u32 = 4096;

pub(super) struct LocalStatfs {
    pub blocks: u64,
    pub blocks_free: u64,
    pub blocks_available: u64,
    pub files: u64,
    pub files_free: u64,
    pub block_size: u32,
    pub name_length: u32,
    pub fragment_size: u32,
}

pub(super) fn file_attributes(node: &Node, uid: u32, gid: u32) -> FileAttr {
    FileAttr {
        ino: node.inode,
        size: node.size,
        blocks: stat_blocks(node.size),
        atime: time_from_ms(node.modified_at_ms),
        mtime: time_from_ms(node.modified_at_ms),
        ctime: time_from_ms(node.modified_at_ms),
        crtime: time_from_ms(node.created_at_ms),
        kind: file_type(node.kind),
        // The scoped sandbox token is the read/write boundary. Match today's
        // gcsfuse mount so both workload users can use the files, while keeping
        // the executable bits that Linux checks before execve.
        perm: match node.kind {
            NodeKind::Directory => 0o777,
            NodeKind::File => 0o666 | (node.mode & 0o111),
        },
        // A file has one directory entry. A directory also has its own `.`
        // entry, so Linux expects at least two links.
        nlink: if node.kind == NodeKind::Directory {
            2
        } else {
            1
        },
        uid,
        gid,
        rdev: 0,
        blksize: PREFERRED_IO_SIZE,
        flags: 0,
    }
}

fn stat_blocks(size: u64) -> u64 {
    size.div_ceil(STAT_BLOCK_SIZE_BYTES)
}

pub(super) fn local_statfs(path: &Path) -> io::Result<LocalStatfs> {
    let path = CString::new(path.as_os_str().as_bytes()).map_err(|_| errno(libc::EINVAL))?;
    let mut stats = std::mem::MaybeUninit::<libc::statvfs>::uninit();
    // SAFETY: `path` is NUL-terminated and `stats` points to writable memory.
    if unsafe { libc::statvfs(path.as_ptr(), stats.as_mut_ptr()) } != 0 {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: statvfs returned success and initialized every field.
    let stats = unsafe { stats.assume_init() };
    Ok(LocalStatfs {
        blocks: stats.f_blocks,
        blocks_free: stats.f_bfree,
        blocks_available: stats.f_bavail,
        files: stats.f_files,
        files_free: stats.f_ffree,
        block_size: u32::try_from(stats.f_bsize).map_err(|_| errno(libc::EOVERFLOW))?,
        name_length: u32::try_from(stats.f_namemax).map_err(|_| errno(libc::EOVERFLOW))?,
        fragment_size: u32::try_from(stats.f_frsize).map_err(|_| errno(libc::EOVERFLOW))?,
    })
}

pub(super) fn permissions(mode: u32, umask: u32) -> io::Result<u16> {
    u16::try_from((mode & !umask) & 0o7777).map_err(|_| errno(libc::EINVAL))
}

pub(super) fn executable_mode(kind: NodeKind, current: u16, requested: u32) -> io::Result<u16> {
    let requested = u16::try_from(requested & 0o7777).map_err(|_| errno(libc::EINVAL))?;
    match kind {
        NodeKind::Directory if requested == 0o777 => Ok(current),
        NodeKind::Directory => Err(errno(libc::EOPNOTSUPP)),
        NodeKind::File => {
            let requested_non_executable = requested & !0o111;
            let stored_non_executable = current & !0o111;
            if requested & !0o777 != 0 || requested_non_executable != 0o666 {
                return Err(errno(libc::EOPNOTSUPP));
            }
            Ok(stored_non_executable | (requested & 0o111))
        }
    }
}

pub(super) fn validate_open_flags(flags: i32) -> io::Result<()> {
    let unsupported = flags & libc::O_DIRECT != 0
        || flags & libc::O_PATH != 0
        || flags & libc::O_SYNC != 0
        || flags & libc::O_DSYNC != 0
        || flags & libc::O_TMPFILE == libc::O_TMPFILE;
    if unsupported {
        return Err(errno(libc::EOPNOTSUPP));
    }
    Ok(())
}

pub(super) fn validate_open_request(flags: i32) -> io::Result<()> {
    validate_open_flags(flags)?;
    if flags & libc::O_TRUNC != 0 && !super::super::store::is_writable(flags) {
        return Err(errno(libc::EACCES));
    }
    Ok(())
}

pub(super) fn utf8_name(name: &OsStr) -> io::Result<&str> {
    name.to_str().ok_or_else(|| errno(libc::EINVAL))
}

pub(super) fn file_type(kind: NodeKind) -> FileType {
    match kind {
        NodeKind::File => FileType::RegularFile,
        NodeKind::Directory => FileType::Directory,
    }
}

pub(super) fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|duration| i64::try_from(duration.as_millis()).ok())
        .unwrap_or(0)
}

pub(super) fn to_errno(error: io::Error) -> Errno {
    Errno::from_i32(error.raw_os_error().unwrap_or(libc::EIO))
}

pub(super) fn reply_ok_or_error(result: io::Result<()>, reply: ReplyEmpty) {
    match result {
        Ok(()) => reply.ok(),
        Err(error) => reply.error(to_errno(error)),
    }
}

pub(super) fn errno(code: i32) -> io::Error {
    io::Error::from_raw_os_error(code)
}

fn time_from_ms(value: i64) -> SystemTime {
    match u64::try_from(value) {
        Ok(value) => UNIX_EPOCH + Duration::from_millis(value),
        Err(_) => UNIX_EPOCH,
    }
}

#[cfg(test)]
mod tests {
    use tempfile::tempdir;

    use super::{
        executable_mode, local_statfs, stat_blocks, validate_open_flags, validate_open_request,
    };
    use crate::commands::filesystem::store::NodeKind;

    #[test]
    fn statfs_reports_the_real_staging_filesystem() {
        let directory = tempdir().expect("temporary directory");
        let stats = local_statfs(directory.path()).expect("read statvfs");
        assert!(stats.blocks > 0);
        assert!(stats.block_size > 0);
        assert!(stats.name_length > 0);
    }

    #[test]
    fn file_space_uses_linux_512_byte_blocks() {
        assert_eq!(stat_blocks(0), 0);
        assert_eq!(stat_blocks(1), 1);
        assert_eq!(stat_blocks(512), 1);
        assert_eq!(stat_blocks(513), 2);
        assert_eq!(stat_blocks(4096), 8);
        assert_eq!(stat_blocks(1024 * 1024), 2048);
    }

    #[test]
    fn cache_file_open_rejects_flags_whose_remote_meaning_is_not_supported() {
        for flags in [
            libc::O_DIRECT,
            libc::O_PATH,
            libc::O_SYNC,
            libc::O_DSYNC,
            libc::O_TMPFILE,
        ] {
            assert_eq!(
                validate_open_flags(libc::O_WRONLY | flags)
                    .expect_err("reject unsupported flag")
                    .raw_os_error(),
                Some(libc::EOPNOTSUPP)
            );
        }
        validate_open_flags(libc::O_WRONLY | libc::O_APPEND).expect("support append");
        assert_eq!(
            validate_open_request(libc::O_RDONLY | libc::O_TRUNC)
                .expect_err("reject read-only truncate")
                .raw_os_error(),
            Some(libc::EACCES)
        );
    }

    #[test]
    fn chmod_accepts_only_executable_bit_changes() {
        assert_eq!(
            executable_mode(NodeKind::File, 0o644, 0o777).expect("add executable"),
            0o755
        );
        assert_eq!(
            executable_mode(NodeKind::File, 0o755, 0o666).expect("remove executable"),
            0o644
        );
        assert!(executable_mode(NodeKind::File, 0o644, 0o644).is_err());
        assert_eq!(
            executable_mode(NodeKind::File, 0o644, 0o600)
                .expect_err("reject read bit change")
                .raw_os_error(),
            Some(libc::EOPNOTSUPP)
        );
        assert!(executable_mode(NodeKind::Directory, 0o755, 0o666).is_err());
    }
}
