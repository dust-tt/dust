use std::collections::HashMap;
use std::ffi::{OsStr, OsString};
use std::fs::{self, File, OpenOptions};
use std::io;
use std::os::unix::fs::{FileExt, FileTypeExt, MetadataExt, OpenOptionsExt};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use anyhow::Context;
use parking_lot::Mutex;
use rustix::fs::{AtFlags, Mode, Timespec, Timestamps, CWD, UTIME_NOW, UTIME_OMIT};
use rustix::process::{getegid, geteuid};

use super::model::{
    child_path, is_at_or_below, path_for_mutation, rebase_path, MountIdentity, MountKind,
    MountSpec, MountTable, NodeKey, NodeTable, ROOT_INODE,
};
use super::mutation::{MutationError, MutationOperation, MutationPort};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EntryKind {
    File,
    Directory,
    Symlink,
    NamedPipe,
    CharDevice,
    BlockDevice,
    Socket,
}

#[derive(Clone, Debug)]
pub struct Attributes {
    pub inode: u64,
    pub size: u64,
    pub blocks: u64,
    pub atime: SystemTime,
    pub mtime: SystemTime,
    pub ctime: SystemTime,
    pub kind: EntryKind,
    pub permissions: u16,
    pub links: u32,
    pub uid: u32,
    pub gid: u32,
    pub rdev: u32,
    pub block_size: u32,
}

#[derive(Clone, Debug)]
pub struct Entry {
    pub attributes: Attributes,
}

#[derive(Clone, Debug)]
pub struct DirectoryEntry {
    pub inode: u64,
    pub kind: EntryKind,
    pub name: OsString,
}

#[derive(Clone, Copy, Debug)]
pub enum SetTime {
    Specific(SystemTime),
    Now,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct SetAttributes {
    pub mode: Option<u32>,
    pub uid: Option<u32>,
    pub gid: Option<u32>,
    pub size: Option<u64>,
    pub atime: Option<SetTime>,
    pub mtime: Option<SetTime>,
    pub handle: Option<u64>,
}

#[derive(Clone, Copy, Debug)]
pub struct FilesystemStats {
    pub blocks: u64,
    pub blocks_free: u64,
    pub blocks_available: u64,
    pub files: u64,
    pub files_free: u64,
    pub block_size: u32,
    pub name_length: u32,
    pub fragment_size: u32,
}

#[derive(Debug)]
pub struct FsError {
    pub errno: i32,
    message: String,
}

impl FsError {
    pub fn errno(errno: i32) -> Self {
        Self {
            errno,
            message: io::Error::from_raw_os_error(errno).to_string(),
        }
    }

    fn message(errno: i32, message: impl Into<String>) -> Self {
        Self {
            errno,
            message: message.into(),
        }
    }
}

impl std::fmt::Display for FsError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for FsError {}

impl From<io::Error> for FsError {
    fn from(error: io::Error) -> Self {
        let errno = error.raw_os_error().unwrap_or(libc::EIO);
        Self::message(errno, error.to_string())
    }
}

impl From<rustix::io::Errno> for FsError {
    fn from(error: rustix::io::Errno) -> Self {
        Self::message(error.raw_os_error(), error.to_string())
    }
}

impl From<MutationError> for FsError {
    fn from(error: MutationError) -> Self {
        Self::message(error.errno, error.to_string())
    }
}

type FsResult<T> = Result<T, FsError>;

#[derive(Debug)]
struct HandleState {
    mount_index: usize,
    path: PathBuf,
    dirty: bool,
}

#[derive(Debug)]
struct OpenHandle {
    file: File,
    state: HandleState,
}

struct BackingNode<'a> {
    relative_path: PathBuf,
    resolved_path: PathBuf,
    identity: &'a MountIdentity,
    read_only: bool,
}

pub struct DustFilesystem {
    mounts: MountTable,
    nodes: Mutex<NodeTable>,
    handles: Mutex<HashMap<u64, OpenHandle>>,
    next_handle: AtomicU64,
    mutations: Arc<dyn MutationPort>,
}

impl DustFilesystem {
    pub fn new(mounts: MountTable, mutations: Arc<dyn MutationPort>) -> Self {
        Self {
            mounts,
            nodes: Mutex::new(NodeTable::new()),
            handles: Mutex::new(HashMap::new()),
            next_handle: AtomicU64::new(1),
            mutations,
        }
    }

    pub fn lookup(&self, parent_inode: u64, name: &OsStr) -> FsResult<Entry> {
        let parent = self.nodes.lock().key(parent_inode)?;
        let key = match parent {
            NodeKey::Root => self
                .mounts
                .root_entry(name)
                .ok_or_else(|| FsError::errno(libc::ENOENT))?,
            NodeKey::Backing { mount_index, path } => NodeKey::Backing {
                mount_index,
                path: child_path(&path, name)?,
            },
            NodeKey::Alias { .. } => return Err(FsError::errno(libc::ENOTDIR)),
        };
        self.entry_for_key(key)
    }

    pub fn attributes(&self, inode: u64, handle: Option<u64>) -> FsResult<Attributes> {
        if let Some(handle) = handle {
            let handles = self.handles.lock();
            let open_handle = handles
                .get(&handle)
                .ok_or_else(|| FsError::errno(libc::EBADF))?;
            return attributes_from_metadata(inode, &open_handle.file.metadata()?);
        }

        let key = self.nodes.lock().key(inode)?;
        match key {
            NodeKey::Root => Ok(synthetic_attributes(inode, EntryKind::Directory, 0o777, 0)),
            NodeKey::Alias { mount_index } => {
                let target = self.mounts.target(mount_index)?;
                Ok(synthetic_attributes(
                    inode,
                    EntryKind::Symlink,
                    0o777,
                    target.name.as_encoded_bytes().len() as u64,
                ))
            }
            NodeKey::Backing { mount_index, path } => {
                let resolved = self.resolve_path(mount_index, &path, false)?;
                attributes_from_metadata(inode, &fs::symlink_metadata(resolved)?)
            }
        }
    }

    pub fn readlink(&self, inode: u64) -> FsResult<Vec<u8>> {
        let key = self.nodes.lock().key(inode)?;
        match key {
            NodeKey::Alias { mount_index } => Ok(self
                .mounts
                .target(mount_index)?
                .name
                .as_encoded_bytes()
                .to_vec()),
            NodeKey::Backing { mount_index, path } => {
                let resolved = self.resolve_path(mount_index, &path, false)?;
                Ok(fs::read_link(resolved)?
                    .as_os_str()
                    .as_encoded_bytes()
                    .to_vec())
            }
            NodeKey::Root => Err(FsError::errno(libc::EINVAL)),
        }
    }

    pub fn read_directory(&self, inode: u64) -> FsResult<Vec<DirectoryEntry>> {
        let key = self.nodes.lock().key(inode)?;
        match key {
            NodeKey::Root => self.read_root_directory(),
            NodeKey::Backing { mount_index, path } => {
                self.read_backing_directory(inode, mount_index, &path)
            }
            NodeKey::Alias { .. } => Err(FsError::errno(libc::ENOTDIR)),
        }
    }

    pub fn mkdir(&self, parent_inode: u64, name: &OsStr) -> FsResult<Entry> {
        let (mount_index, parent_path) = self.backing_key(parent_inode)?;
        let path = child_path(&parent_path, name)?;
        let node = self.backing_node(mount_index, &path, false)?;
        self.require_writable(node.read_only)?;
        if fs::symlink_metadata(&node.resolved_path).is_ok() {
            return Err(FsError::errno(libc::EEXIST));
        }

        self.mutations.apply(
            node.identity,
            MutationOperation::Mkdir {
                path: path_for_mutation(&node.relative_path)?,
            },
        )?;
        self.entry_for_key(NodeKey::Backing { mount_index, path })
    }

    pub fn rmdir(&self, parent_inode: u64, name: &OsStr) -> FsResult<()> {
        let (mount_index, parent_path) = self.backing_key(parent_inode)?;
        let path = child_path(&parent_path, name)?;
        let node = self.backing_node(mount_index, &path, false)?;
        self.require_writable(node.read_only)?;
        if fs::read_dir(&node.resolved_path)?.next().is_some() {
            return Err(FsError::errno(libc::ENOTEMPTY));
        }

        self.mutations.apply(
            node.identity,
            MutationOperation::Rmdir {
                path: path_for_mutation(&node.relative_path)?,
            },
        )?;
        self.nodes.lock().remove_subtree(mount_index, &path);
        Ok(())
    }

    pub fn unlink(&self, parent_inode: u64, name: &OsStr) -> FsResult<()> {
        let (mount_index, parent_path) = self.backing_key(parent_inode)?;
        let path = child_path(&parent_path, name)?;
        let node = self.backing_node(mount_index, &path, false)?;
        self.require_writable(node.read_only)?;
        let metadata = fs::symlink_metadata(&node.resolved_path)?;
        if metadata.is_dir() {
            return Err(FsError::errno(libc::EISDIR));
        }

        self.mutations.apply(
            node.identity,
            MutationOperation::Unlink {
                path: path_for_mutation(&node.relative_path)?,
            },
        )?;
        self.nodes.lock().remove_subtree(mount_index, &path);
        Ok(())
    }

    pub fn rename(
        &self,
        parent_inode: u64,
        name: &OsStr,
        new_parent_inode: u64,
        new_name: &OsStr,
    ) -> FsResult<()> {
        let (source_mount, source_parent) = self.backing_key(parent_inode)?;
        let (destination_mount, destination_parent) = self.backing_key(new_parent_inode)?;
        let source_path = child_path(&source_parent, name)?;
        let destination_path = child_path(&destination_parent, new_name)?;

        if source_mount == destination_mount
            && source_path != destination_path
            && is_at_or_below(&destination_path, &source_path)
        {
            return Err(FsError::errno(libc::EINVAL));
        }

        let source = self.backing_node(source_mount, &source_path, false)?;
        let destination = self.backing_node(destination_mount, &destination_path, false)?;
        self.require_writable(source.read_only)?;
        self.require_writable(destination.read_only)?;

        let source_metadata = fs::symlink_metadata(&source.resolved_path)?;
        match fs::symlink_metadata(&destination.resolved_path) {
            Ok(destination_metadata) => {
                if source_metadata.is_dir() && !destination_metadata.is_dir() {
                    return Err(FsError::errno(libc::ENOTDIR));
                }
                if !source_metadata.is_dir() && destination_metadata.is_dir() {
                    return Err(FsError::errno(libc::EISDIR));
                }
                if source_metadata.is_dir()
                    && fs::read_dir(&destination.resolved_path)?.next().is_some()
                {
                    return Err(FsError::errno(libc::ENOTEMPTY));
                }
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }

        self.mutations.apply(
            source.identity,
            MutationOperation::Rename {
                path: path_for_mutation(&source.relative_path)?,
                destination_mount: destination.identity.clone(),
                destination_path: path_for_mutation(&destination.relative_path)?,
            },
        )?;

        self.nodes.lock().move_subtree(
            source_mount,
            &source_path,
            destination_mount,
            &destination_path,
        );
        self.update_handles_after_move(
            source_mount,
            &source_path,
            destination_mount,
            &destination_path,
        );
        Ok(())
    }

    pub fn open(&self, inode: u64, flags: i32) -> FsResult<u64> {
        let (mount_index, path) = self.backing_key(inode)?;
        let node = self
            .backing_node(mount_index, &path, true)
            .map_err(|error| {
                FsError::message(
                    error.errno,
                    format!("failed to resolve {} for open: {error}", path.display()),
                )
            })?;
        let writable = access_mode_is_writable(flags);
        let truncated = flags & libc::O_TRUNC != 0;
        if writable || truncated {
            self.require_writable(node.read_only)?;
        }

        let file = open_existing(&node.resolved_path, flags).map_err(|error| {
            FsError::message(
                error.raw_os_error().unwrap_or(libc::EIO),
                format!(
                    "failed to open {} with flags {flags:#x}: {error}",
                    node.resolved_path.display()
                ),
            )
        })?;
        self.insert_handle(file, mount_index, path, truncated)
    }

    pub fn create(
        &self,
        parent_inode: u64,
        name: &OsStr,
        mode: u32,
        umask: u32,
        flags: i32,
    ) -> FsResult<(Entry, u64)> {
        let (mount_index, parent_path) = self.backing_key(parent_inode)?;
        let path = child_path(&parent_path, name)?;
        let node = self.backing_node(mount_index, &path, false)?;
        self.require_writable(node.read_only)?;

        let file = open_created(&node.resolved_path, flags, mode & !umask)?;
        let metadata = file.metadata()?;
        let inode = self.nodes.lock().inode_for(NodeKey::Backing {
            mount_index,
            path: path.clone(),
        });
        let entry = Entry {
            attributes: attributes_from_metadata(inode, &metadata)?,
        };
        let handle = self.insert_handle(file, mount_index, path, true)?;
        Ok((entry, handle))
    }

    pub fn read(&self, handle: u64, offset: u64, size: u32) -> FsResult<Vec<u8>> {
        let handles = self.handles.lock();
        let open_handle = handles
            .get(&handle)
            .ok_or_else(|| FsError::errno(libc::EBADF))?;
        let mut buffer = vec![0; size as usize];
        let bytes_read = open_handle.file.read_at(&mut buffer, offset)?;
        buffer.truncate(bytes_read);
        Ok(buffer)
    }

    pub fn write(&self, handle: u64, offset: u64, data: &[u8]) -> FsResult<u32> {
        let mut handles = self.handles.lock();
        let open_handle = handles
            .get_mut(&handle)
            .ok_or_else(|| FsError::errno(libc::EBADF))?;
        let target = self.mounts.target(open_handle.state.mount_index)?;
        self.require_writable(target.read_only)?;
        let written = open_handle.file.write_at(data, offset)?;
        open_handle.state.dirty = true;
        u32::try_from(written).map_err(|_| FsError::errno(libc::EOVERFLOW))
    }

    pub fn flush(&self, handle: u64) -> FsResult<()> {
        let handles = self.handles.lock();
        let open_handle = handles
            .get(&handle)
            .ok_or_else(|| FsError::errno(libc::EBADF))?;
        open_handle.file.sync_all()?;
        Ok(())
    }

    pub fn fsync(&self, handle: u64, data_only: bool) -> FsResult<()> {
        let handles = self.handles.lock();
        let open_handle = handles
            .get(&handle)
            .ok_or_else(|| FsError::errno(libc::EBADF))?;
        if data_only {
            open_handle.file.sync_data()?;
        } else {
            open_handle.file.sync_all()?;
        }
        // Do not notify Front here. gcsfuse finalizes a newly created object when the backing
        // handle closes, so a content_committed request during fsync races an object that is not
        // visible yet and turns a successful write into EIO. `release` owns the notification and
        // deliberately sends it only after dropping the backing file.
        Ok(())
    }

    pub fn release(&self, handle: u64) -> FsResult<()> {
        let open_handle = self
            .handles
            .lock()
            .remove(&handle)
            .ok_or_else(|| FsError::errno(libc::EBADF))?;
        open_handle.file.sync_all()?;
        let state = open_handle.state;
        // Closing the gcsfuse handle is the publication boundary for new objects. Keep this drop
        // before the semantic commit: Front must never reconcile a FileResource against stale or
        // not-yet-visible bytes.
        drop(open_handle.file);
        if state.dirty {
            self.commit(state.mount_index, &state.path)?;
        }
        Ok(())
    }

    pub fn set_attributes(&self, inode: u64, values: SetAttributes) -> FsResult<Attributes> {
        let (mount_index, path) = self.backing_key(inode)?;
        let node = self.backing_node(mount_index, &path, false)?;
        self.require_writable(node.read_only)?;

        if let Some(mode) = values.mode {
            rustix::fs::chmodat(
                CWD,
                &node.resolved_path,
                Mode::from_raw_mode(mode),
                AtFlags::SYMLINK_NOFOLLOW,
            )?;
        }
        if values.uid.is_some() || values.gid.is_some() {
            rustix::fs::chownat(
                CWD,
                &node.resolved_path,
                values.uid.map(rustix::fs::Uid::from_raw),
                values.gid.map(rustix::fs::Gid::from_raw),
                AtFlags::SYMLINK_NOFOLLOW,
            )?;
        }
        if let Some(size) = values.size {
            self.truncate(mount_index, &path, values.handle, size)?;
        }
        if values.atime.is_some() || values.mtime.is_some() {
            let timestamps = Timestamps {
                last_access: set_time_to_timespec(values.atime)?,
                last_modification: set_time_to_timespec(values.mtime)?,
            };
            rustix::fs::utimensat(
                CWD,
                &node.resolved_path,
                &timestamps,
                AtFlags::SYMLINK_NOFOLLOW,
            )?;
        }

        self.attributes(inode, values.handle)
    }

    pub fn stats(&self, inode: u64) -> FsResult<FilesystemStats> {
        let path = match self.nodes.lock().key(inode)? {
            NodeKey::Root => self.mounts.target(0)?.source.clone(),
            NodeKey::Alias { mount_index } => self.mounts.target(mount_index)?.source.clone(),
            NodeKey::Backing { mount_index, path } => {
                self.resolve_path(mount_index, &path, true)?
            }
        };
        let stats = rustix::fs::statvfs(path)?;
        Ok(FilesystemStats {
            blocks: stats.f_blocks,
            blocks_free: stats.f_bfree,
            blocks_available: stats.f_bavail,
            files: stats.f_files,
            files_free: stats.f_ffree,
            block_size: u32::try_from(stats.f_bsize)
                .map_err(|_| FsError::errno(libc::EOVERFLOW))?,
            name_length: u32::try_from(stats.f_namemax)
                .map_err(|_| FsError::errno(libc::EOVERFLOW))?,
            fragment_size: u32::try_from(stats.f_frsize)
                .map_err(|_| FsError::errno(libc::EOVERFLOW))?,
        })
    }

    pub fn access(&self, inode: u64, wants_write: bool) -> FsResult<()> {
        let key = self.nodes.lock().key(inode)?;
        let read_only = match key {
            NodeKey::Root => false,
            NodeKey::Alias { mount_index } | NodeKey::Backing { mount_index, .. } => {
                self.mounts.target(mount_index)?.read_only
            }
        };
        if wants_write {
            self.require_writable(read_only)?;
        }
        self.attributes(inode, None)?;
        Ok(())
    }

    fn entry_for_key(&self, key: NodeKey) -> FsResult<Entry> {
        if let NodeKey::Backing { mount_index, path } = &key {
            let resolved = self.resolve_path(*mount_index, path, false)?;
            let metadata = fs::symlink_metadata(resolved)?;
            let inode = self.nodes.lock().inode_for(key);
            return Ok(Entry {
                attributes: attributes_from_metadata(inode, &metadata)?,
            });
        }
        let inode = self.nodes.lock().inode_for(key);
        Ok(Entry {
            attributes: self.attributes(inode, None)?,
        })
    }

    fn read_root_directory(&self) -> FsResult<Vec<DirectoryEntry>> {
        let mut entries = vec![
            DirectoryEntry {
                inode: ROOT_INODE,
                kind: EntryKind::Directory,
                name: OsString::from("."),
            },
            DirectoryEntry {
                inode: ROOT_INODE,
                kind: EntryKind::Directory,
                name: OsString::from(".."),
            },
        ];
        let mut nodes = self.nodes.lock();
        entries.extend(self.mounts.root_entries().iter().map(|(name, key)| {
            let kind = match key {
                NodeKey::Alias { .. } => EntryKind::Symlink,
                NodeKey::Backing { .. } => EntryKind::Directory,
                NodeKey::Root => EntryKind::Directory,
            };
            DirectoryEntry {
                inode: nodes.inode_for(key.clone()),
                kind,
                name: name.clone(),
            }
        }));
        Ok(entries)
    }

    fn read_backing_directory(
        &self,
        inode: u64,
        mount_index: usize,
        path: &Path,
    ) -> FsResult<Vec<DirectoryEntry>> {
        let resolved = self.resolve_path(mount_index, path, true)?;
        let parent_inode = if path.as_os_str().is_empty() {
            ROOT_INODE
        } else {
            let parent_path = path.parent().unwrap_or_else(|| Path::new(""));
            self.nodes.lock().inode_for(NodeKey::Backing {
                mount_index,
                path: parent_path.to_path_buf(),
            })
        };
        let mut entries = vec![
            DirectoryEntry {
                inode,
                kind: EntryKind::Directory,
                name: OsString::from("."),
            },
            DirectoryEntry {
                inode: parent_inode,
                kind: EntryKind::Directory,
                name: OsString::from(".."),
            },
        ];

        for directory_entry in fs::read_dir(resolved)? {
            let directory_entry = directory_entry?;
            let child_path = path.join(directory_entry.file_name());
            // DirEntry::file_type uses the type returned by readdir and only asks the backing
            // filesystem when it reports DT_UNKNOWN. Calling symlink_metadata unconditionally
            // turned one GCS list into N extra metadata requests (24s for 20 entries in the live
            // benchmark).
            let kind = entry_kind_from_file_type(&directory_entry.file_type()?)?;
            let child_inode = self.nodes.lock().inode_for(NodeKey::Backing {
                mount_index,
                path: child_path,
            });
            entries.push(DirectoryEntry {
                inode: child_inode,
                kind,
                name: directory_entry.file_name(),
            });
        }
        Ok(entries)
    }

    fn backing_key(&self, inode: u64) -> FsResult<(usize, PathBuf)> {
        match self.nodes.lock().key(inode)? {
            NodeKey::Backing { mount_index, path } => Ok((mount_index, path)),
            NodeKey::Root | NodeKey::Alias { .. } => Err(FsError::errno(libc::EBUSY)),
        }
    }

    fn backing_node(
        &self,
        mount_index: usize,
        relative_path: &Path,
        follow_final: bool,
    ) -> FsResult<BackingNode<'_>> {
        let target = self.mounts.target(mount_index)?;
        Ok(BackingNode {
            relative_path: relative_path.to_path_buf(),
            resolved_path: self.resolve_path(mount_index, relative_path, follow_final)?,
            identity: &target.identity,
            read_only: target.read_only,
        })
    }

    fn resolve_path(
        &self,
        mount_index: usize,
        relative_path: &Path,
        follow_final: bool,
    ) -> FsResult<PathBuf> {
        let target = self.mounts.target(mount_index)?;
        let candidate = target.source.join(relative_path);
        let resolved = if follow_final {
            fs::canonicalize(&candidate)?
        } else if relative_path.as_os_str().is_empty() {
            target.source.clone()
        } else {
            let parent = candidate
                .parent()
                .ok_or_else(|| FsError::errno(libc::EACCES))?;
            let resolved_parent = fs::canonicalize(parent)?;
            let file_name = candidate
                .file_name()
                .ok_or_else(|| FsError::errno(libc::EINVAL))?;
            resolved_parent.join(file_name)
        };
        if !resolved.starts_with(&target.source) {
            return Err(FsError::errno(libc::EACCES));
        }
        Ok(resolved)
    }

    fn require_writable(&self, read_only: bool) -> FsResult<()> {
        if read_only {
            Err(FsError::errno(libc::EROFS))
        } else {
            Ok(())
        }
    }

    fn insert_handle(
        &self,
        file: File,
        mount_index: usize,
        path: PathBuf,
        dirty: bool,
    ) -> FsResult<u64> {
        let handle = self.next_handle.fetch_add(1, Ordering::Relaxed);
        if handle == 0 {
            return Err(FsError::errno(libc::EOVERFLOW));
        }
        self.handles.lock().insert(
            handle,
            OpenHandle {
                file,
                state: HandleState {
                    mount_index,
                    path,
                    dirty,
                },
            },
        );
        Ok(handle)
    }

    fn commit(&self, mount_index: usize, path: &Path) -> FsResult<()> {
        let target = self.mounts.target(mount_index)?;
        self.mutations.apply(
            &target.identity,
            MutationOperation::ContentCommitted {
                path: path_for_mutation(path)?,
            },
        )?;
        Ok(())
    }

    fn truncate(
        &self,
        mount_index: usize,
        path: &Path,
        handle: Option<u64>,
        size: u64,
    ) -> FsResult<()> {
        if let Some(handle) = handle {
            let mut handles = self.handles.lock();
            let open_handle = handles
                .get_mut(&handle)
                .ok_or_else(|| FsError::errno(libc::EBADF))?;
            open_handle.file.set_len(size)?;
            open_handle.state.dirty = true;
            return Ok(());
        }

        let resolved = self.resolve_path(mount_index, path, true)?;
        let file = OpenOptions::new().write(true).open(resolved)?;
        file.set_len(size)?;
        file.sync_all()?;
        drop(file);
        self.commit(mount_index, path)
    }

    fn update_handles_after_move(
        &self,
        source_mount: usize,
        source_path: &Path,
        destination_mount: usize,
        destination_path: &Path,
    ) {
        for open_handle in self.handles.lock().values_mut() {
            if open_handle.state.mount_index != source_mount
                || !is_at_or_below(&open_handle.state.path, source_path)
            {
                continue;
            }
            let rebased_path =
                match rebase_path(&open_handle.state.path, source_path, destination_path) {
                    Some(path) => path,
                    None => continue,
                };
            open_handle.state.mount_index = destination_mount;
            open_handle.state.path = rebased_path;
        }
    }
}

fn open_existing(path: &Path, flags: i32) -> io::Result<File> {
    let mut options = OpenOptions::new();
    match flags & libc::O_ACCMODE {
        libc::O_WRONLY => {
            options.write(true);
        }
        libc::O_RDWR => {
            options.read(true).write(true);
        }
        _ => {
            options.read(true);
        }
    }
    options.truncate(flags & libc::O_TRUNC != 0);
    options.custom_flags(flags & !(libc::O_ACCMODE | libc::O_TRUNC));
    options.open(path)
}

fn open_created(path: &Path, flags: i32, mode: u32) -> io::Result<File> {
    let mut options = OpenOptions::new();
    match flags & libc::O_ACCMODE {
        libc::O_RDONLY => {
            options.read(true).write(true);
        }
        libc::O_RDWR => {
            options.read(true).write(true);
        }
        _ => {
            options.write(true);
        }
    }
    options
        .create(true)
        .truncate(true)
        .mode(mode)
        .custom_flags(flags & !(libc::O_ACCMODE | libc::O_CREAT | libc::O_EXCL | libc::O_TRUNC));
    options.open(path)
}

fn access_mode_is_writable(flags: i32) -> bool {
    matches!(flags & libc::O_ACCMODE, libc::O_WRONLY | libc::O_RDWR)
}

fn attributes_from_metadata(inode: u64, metadata: &fs::Metadata) -> FsResult<Attributes> {
    Ok(Attributes {
        inode,
        size: metadata.size(),
        blocks: metadata.blocks(),
        atime: system_time(metadata.atime(), metadata.atime_nsec()),
        mtime: system_time(metadata.mtime(), metadata.mtime_nsec()),
        ctime: system_time(metadata.ctime(), metadata.ctime_nsec()),
        kind: entry_kind(metadata)?,
        permissions: (metadata.mode() & 0o7777) as u16,
        links: u32::try_from(metadata.nlink()).map_err(|_| FsError::errno(libc::EOVERFLOW))?,
        uid: metadata.uid(),
        gid: metadata.gid(),
        rdev: u32::try_from(metadata.rdev()).map_err(|_| FsError::errno(libc::EOVERFLOW))?,
        block_size: u32::try_from(metadata.blksize())
            .map_err(|_| FsError::errno(libc::EOVERFLOW))?,
    })
}

fn synthetic_attributes(inode: u64, kind: EntryKind, permissions: u16, size: u64) -> Attributes {
    let now = SystemTime::now();
    Attributes {
        inode,
        size,
        blocks: 0,
        atime: now,
        mtime: now,
        ctime: now,
        kind,
        permissions,
        links: if kind == EntryKind::Directory { 2 } else { 1 },
        uid: geteuid().as_raw(),
        gid: getegid().as_raw(),
        rdev: 0,
        block_size: 4096,
    }
}

fn entry_kind(metadata: &fs::Metadata) -> FsResult<EntryKind> {
    entry_kind_from_file_type(&metadata.file_type())
}

fn entry_kind_from_file_type(file_type: &fs::FileType) -> FsResult<EntryKind> {
    if file_type.is_file() {
        Ok(EntryKind::File)
    } else if file_type.is_dir() {
        Ok(EntryKind::Directory)
    } else if file_type.is_symlink() {
        Ok(EntryKind::Symlink)
    } else if file_type.is_fifo() {
        Ok(EntryKind::NamedPipe)
    } else if file_type.is_char_device() {
        Ok(EntryKind::CharDevice)
    } else if file_type.is_block_device() {
        Ok(EntryKind::BlockDevice)
    } else if file_type.is_socket() {
        Ok(EntryKind::Socket)
    } else {
        Err(FsError::errno(libc::ENOTSUP))
    }
}

fn system_time(seconds: i64, nanoseconds: i64) -> SystemTime {
    let nanoseconds = u32::try_from(nanoseconds.clamp(0, 999_999_999)).unwrap_or(0);
    if seconds >= 0 {
        UNIX_EPOCH
            .checked_add(Duration::new(seconds as u64, nanoseconds))
            .unwrap_or(UNIX_EPOCH)
    } else if nanoseconds == 0 {
        UNIX_EPOCH
            .checked_sub(Duration::new(seconds.unsigned_abs(), 0))
            .unwrap_or(UNIX_EPOCH)
    } else {
        UNIX_EPOCH
            .checked_sub(Duration::new(
                seconds.unsigned_abs().saturating_sub(1),
                1_000_000_000 - nanoseconds,
            ))
            .unwrap_or(UNIX_EPOCH)
    }
}

fn set_time_to_timespec(value: Option<SetTime>) -> FsResult<Timespec> {
    match value {
        None => Ok(Timespec {
            tv_sec: 0,
            tv_nsec: UTIME_OMIT,
        }),
        Some(SetTime::Now) => Ok(Timespec {
            tv_sec: 0,
            tv_nsec: UTIME_NOW,
        }),
        Some(SetTime::Specific(value)) => system_time_to_timespec(value),
    }
}

fn system_time_to_timespec(value: SystemTime) -> FsResult<Timespec> {
    match value.duration_since(UNIX_EPOCH) {
        Ok(duration) => Ok(Timespec {
            tv_sec: i64::try_from(duration.as_secs())
                .map_err(|_| FsError::errno(libc::EOVERFLOW))?,
            tv_nsec: duration.subsec_nanos().into(),
        }),
        Err(error) => {
            let duration = error.duration();
            let seconds =
                i64::try_from(duration.as_secs()).map_err(|_| FsError::errno(libc::EOVERFLOW))?;
            if duration.subsec_nanos() == 0 {
                Ok(Timespec {
                    tv_sec: -seconds,
                    tv_nsec: 0,
                })
            } else {
                Ok(Timespec {
                    tv_sec: -seconds.saturating_add(1),
                    tv_nsec: (1_000_000_000 - duration.subsec_nanos()).into(),
                })
            }
        }
    }
}

#[derive(Default)]
struct SelfTestMutationAdapter {
    sources: HashMap<MountIdentity, PathBuf>,
    operations: Mutex<Vec<(MountIdentity, MutationOperation)>>,
}

impl MutationPort for SelfTestMutationAdapter {
    fn apply(
        &self,
        mount: &MountIdentity,
        operation: MutationOperation,
    ) -> Result<(), MutationError> {
        let source = self
            .sources
            .get(mount)
            .ok_or_else(|| MutationError::new(libc::ENOENT, "self-test mount not found"))?;
        let result = match &operation {
            MutationOperation::Mkdir { path } => fs::create_dir(source.join(path)),
            MutationOperation::Rmdir { path } => fs::remove_dir(source.join(path)),
            MutationOperation::Unlink { path } => fs::remove_file(source.join(path)),
            MutationOperation::Rename {
                path,
                destination_mount,
                destination_path,
            } => {
                let destination_source = self.sources.get(destination_mount).ok_or_else(|| {
                    MutationError::new(libc::ENOENT, "self-test destination mount not found")
                })?;
                fs::rename(source.join(path), destination_source.join(destination_path))
            }
            MutationOperation::ContentCommitted { .. } => Ok(()),
        };
        result.map_err(MutationError::from)?;
        self.operations.lock().push((mount.clone(), operation));
        Ok(())
    }
}

pub fn run_self_test() -> anyhow::Result<()> {
    let temporary_directory = tempfile::tempdir()?;
    let conversation_source = temporary_directory.path().join("conversation");
    let pod_source = temporary_directory.path().join("pod");
    fs::create_dir(&conversation_source)?;
    fs::create_dir(&pod_source)?;

    let conversation_identity = MountIdentity {
        kind: MountKind::Conversation,
        id: "conv_1".to_owned(),
    };
    let pod_identity = MountIdentity {
        kind: MountKind::Pod,
        id: "pod_1".to_owned(),
    };
    let mounts = MountTable::from_specs(vec![
        MountSpec {
            name: "conversation-conv_1".to_owned(),
            source: conversation_source.clone(),
            kind: MountKind::Conversation,
            owner_id: conversation_identity.id.clone(),
            read_only: false,
            legacy_name: Some("conversation".to_owned()),
        },
        MountSpec {
            name: "pod-pod_1".to_owned(),
            source: pod_source.clone(),
            kind: MountKind::Pod,
            owner_id: pod_identity.id.clone(),
            read_only: false,
            legacy_name: Some("pod".to_owned()),
        },
    ])?;
    let adapter = Arc::new(SelfTestMutationAdapter {
        sources: HashMap::from([
            (conversation_identity, conversation_source.clone()),
            (pod_identity, pod_source.clone()),
        ]),
        operations: Mutex::new(Vec::new()),
    });
    let filesystem = DustFilesystem::new(mounts, adapter.clone());

    let conversation = filesystem.lookup(ROOT_INODE, OsStr::new("conversation-conv_1"))?;
    let pod = filesystem.lookup(ROOT_INODE, OsStr::new("pod-pod_1"))?;
    let folder = filesystem.mkdir(conversation.attributes.inode, OsStr::new("folder"))?;
    let (_frame, handle) = filesystem.create(
        folder.attributes.inode,
        OsStr::new("frame.tsx"),
        0o644,
        0,
        libc::O_WRONLY,
    )?;
    filesystem.write(handle, 0, b"export default 1")?;
    filesystem.release(handle)?;
    filesystem.rename(
        folder.attributes.inode,
        OsStr::new("frame.tsx"),
        folder.attributes.inode,
        OsStr::new("renamed.tsx"),
    )?;
    filesystem.rename(
        folder.attributes.inode,
        OsStr::new("renamed.tsx"),
        pod.attributes.inode,
        OsStr::new("frame.tsx"),
    )?;
    let moved_frame = filesystem
        .lookup(pod.attributes.inode, OsStr::new("frame.tsx"))
        .context("cross-mount destination lookup failed")?;
    let moved_handle = filesystem
        .open(moved_frame.attributes.inode, libc::O_RDONLY)
        .context("cross-mount destination open failed")?;
    anyhow::ensure!(
        filesystem
            .read(moved_handle, 0, 64)
            .context("cross-mount destination read failed")?
            == b"export default 1",
        "cross-mount destination should be immediately readable"
    );
    filesystem
        .release(moved_handle)
        .context("cross-mount destination release failed")?;
    filesystem.unlink(pod.attributes.inode, OsStr::new("frame.tsx"))?;
    filesystem.rmdir(conversation.attributes.inode, OsStr::new("folder"))?;

    anyhow::ensure!(
        !conversation_source.join("folder").exists(),
        "conversation source should be empty"
    );
    anyhow::ensure!(
        !pod_source.join("frame.tsx").exists(),
        "pod destination should have been deleted"
    );
    let operations = adapter.operations.lock();
    anyhow::ensure!(
        operations.len() == 6,
        "expected six semantic operations, got {}",
        operations.len()
    );
    anyhow::ensure!(
        matches!(operations[3].1, MutationOperation::Rename { .. }),
        "fourth semantic operation should be the cross-mount rename"
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::symlink;

    fn make_writable_test_filesystem(
        source: PathBuf,
    ) -> (DustFilesystem, Arc<SelfTestMutationAdapter>) {
        let identity = MountIdentity {
            kind: MountKind::Conversation,
            id: "conv_test".to_owned(),
        };
        let mounts = MountTable::from_specs(vec![MountSpec {
            name: "conversation-conv_test".to_owned(),
            source: source.clone(),
            kind: MountKind::Conversation,
            owner_id: identity.id.clone(),
            read_only: false,
            legacy_name: None,
        }])
        .expect("writable test mount should be valid");
        let adapter = Arc::new(SelfTestMutationAdapter {
            sources: HashMap::from([(identity, source)]),
            operations: Mutex::new(Vec::new()),
        });
        (DustFilesystem::new(mounts, adapter.clone()), adapter)
    }

    #[test]
    fn behavioral_self_test_passes() {
        run_self_test().expect("filesystem self-test should pass");
    }

    #[test]
    fn read_only_mount_rejects_mutations() {
        let temporary_directory = tempfile::tempdir().expect("temporary directory should exist");
        let identity = MountIdentity {
            kind: MountKind::Pod,
            id: "pod_read_only".to_owned(),
        };
        let mounts = MountTable::from_specs(vec![MountSpec {
            name: "pod-pod_read_only".to_owned(),
            source: temporary_directory.path().to_path_buf(),
            kind: MountKind::Pod,
            owner_id: identity.id.clone(),
            read_only: true,
            legacy_name: Some("pod".to_owned()),
        }])
        .expect("read-only mount should be valid");
        let adapter = Arc::new(SelfTestMutationAdapter {
            sources: HashMap::from([(identity, temporary_directory.path().to_path_buf())]),
            operations: Mutex::new(Vec::new()),
        });
        let filesystem = DustFilesystem::new(mounts, adapter.clone());
        let pod = filesystem
            .lookup(ROOT_INODE, OsStr::new("pod-pod_read_only"))
            .expect("pod root should exist");

        let error = filesystem
            .mkdir(pod.attributes.inode, OsStr::new("blocked"))
            .expect_err("read-only mount must reject mkdir");

        assert_eq!(error.errno, libc::EROFS);
        assert!(adapter.operations.lock().is_empty());
    }

    #[test]
    fn symlinks_cannot_escape_the_backing_mount() {
        let temporary_directory = tempfile::tempdir().expect("temporary directory should exist");
        let source = temporary_directory.path().join("source");
        let outside = temporary_directory.path().join("outside.txt");
        fs::create_dir(&source).expect("source directory should exist");
        fs::write(&outside, "secret").expect("outside file should exist");
        symlink(&outside, source.join("escape")).expect("symlink should be created");

        let identity = MountIdentity {
            kind: MountKind::Conversation,
            id: "conv_secure".to_owned(),
        };
        let mounts = MountTable::from_specs(vec![MountSpec {
            name: "conversation-conv_secure".to_owned(),
            source: source.clone(),
            kind: MountKind::Conversation,
            owner_id: identity.id.clone(),
            read_only: false,
            legacy_name: None,
        }])
        .expect("mount should be valid");
        let adapter = Arc::new(SelfTestMutationAdapter {
            sources: HashMap::from([(identity, source)]),
            operations: Mutex::new(Vec::new()),
        });
        let filesystem = DustFilesystem::new(mounts, adapter);
        let conversation = filesystem
            .lookup(ROOT_INODE, OsStr::new("conversation-conv_secure"))
            .expect("conversation root should exist");
        let escape = filesystem
            .lookup(conversation.attributes.inode, OsStr::new("escape"))
            .expect("symlink metadata should remain visible");

        let error = filesystem
            .open(escape.attributes.inode, libc::O_RDONLY)
            .expect_err("opening an escaping symlink must fail");

        assert_eq!(error.errno, libc::EACCES);
    }

    #[test]
    fn dirty_content_is_committed_only_after_release() {
        let temporary_directory = tempfile::tempdir().expect("temporary directory should exist");
        let (filesystem, adapter) =
            make_writable_test_filesystem(temporary_directory.path().to_path_buf());
        let conversation = filesystem
            .lookup(ROOT_INODE, OsStr::new("conversation-conv_test"))
            .expect("conversation root should exist");
        let (_, handle) = filesystem
            .create(
                conversation.attributes.inode,
                OsStr::new("new-file.txt"),
                0o644,
                0,
                libc::O_WRONLY,
            )
            .expect("file creation should succeed");

        filesystem
            .write(handle, 0, b"new content")
            .expect("file write should succeed");
        filesystem
            .fsync(handle, false)
            .expect("backing fsync should succeed");
        assert!(adapter.operations.lock().is_empty());

        filesystem
            .release(handle)
            .expect("release should publish and commit the file");
        let operations = adapter.operations.lock();
        assert_eq!(operations.len(), 1);
        assert!(matches!(
            operations[0].1,
            MutationOperation::ContentCommitted { .. }
        ));
    }

    #[test]
    fn directory_entries_preserve_backing_file_types() {
        let temporary_directory = tempfile::tempdir().expect("temporary directory should exist");
        fs::write(temporary_directory.path().join("file.txt"), "content")
            .expect("test file should exist");
        fs::create_dir(temporary_directory.path().join("folder"))
            .expect("test directory should exist");
        symlink("file.txt", temporary_directory.path().join("link"))
            .expect("test symlink should exist");
        let (filesystem, _) =
            make_writable_test_filesystem(temporary_directory.path().to_path_buf());
        let conversation = filesystem
            .lookup(ROOT_INODE, OsStr::new("conversation-conv_test"))
            .expect("conversation root should exist");

        let entries = filesystem
            .read_directory(conversation.attributes.inode)
            .expect("directory listing should succeed");

        assert!(entries.iter().any(|entry| {
            entry.name == OsStr::new("file.txt") && entry.kind == EntryKind::File
        }));
        assert!(entries.iter().any(|entry| {
            entry.name == OsStr::new("folder") && entry.kind == EntryKind::Directory
        }));
        assert!(entries
            .iter()
            .any(|entry| { entry.name == OsStr::new("link") && entry.kind == EntryKind::Symlink }));
    }
}
