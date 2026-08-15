use std::collections::HashMap;
use std::ffi::CString;
use std::ffi::OsStr;
use std::fs;
use std::io::{self, Read};
use std::ops::{Deref, DerefMut};
use std::os::unix::ffi::OsStrExt;
use std::os::unix::fs::FileExt;
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
use std::path::Path;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, RwLock, RwLockReadGuard, RwLockWriteGuard};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use anyhow::Context;
use fuser::{
    AccessFlags, BsdFileFlags, Config, Errno, FileAttr, FileHandle, FileType, Filesystem,
    FopenFlags, Generation, INodeNo, InitFlags, KernelConfig, LockOwner, MountOption, OpenFlags,
    RenameFlags, ReplyAttr, ReplyCreate, ReplyData, ReplyDirectory, ReplyEmpty, ReplyEntry,
    ReplyOpen, ReplyStatfs, ReplyWrite, Request, SessionACL, TimeOrNow, WriteFlags,
};
use tracing::{debug, info, warn};

use super::store::{is_writable, FileStore, Node, NodeKind, OpenedContent, FUSE_ROOT_INODE};

mod operations;

const METADATA_CACHE_TTL: Duration = Duration::from_secs(1);
const BLOCK_SIZE: u32 = 4096;
// Front calls may take up to the HTTP timeout during an outage. Keep them off
// fuser's request threads so reads and writes to already-open local files do
// not stall behind unrelated network requests. The cap prevents an unhealthy
// API from creating an unbounded number of blocking tasks in one sandbox.
const MAX_REMOTE_OPERATIONS: usize = 32;

pub fn mount(
    mountpoint: &Path,
    staging_dir: &Path,
    api_url: &str,
    workspace_id: &str,
    token_file: &Path,
    cache_capacity_bytes: u64,
) -> anyhow::Result<()> {
    let token = read_token(token_file)?;
    let store = FileStore::open(
        staging_dir,
        api_url,
        workspace_id,
        token,
        token_file.to_path_buf(),
        cache_capacity_bytes,
    )
    .context("failed to initialize filesystem namespace")?;
    let filesystem = DustFuse::new(store, tokio::runtime::Handle::current());
    let mut config = Config::default();
    config.mount_options = vec![
        MountOption::FSName("dust-files".to_owned()),
        MountOption::RW,
        MountOption::NoDev,
        MountOption::NoSuid,
        MountOption::NoAtime,
    ];
    config.acl = SessionACL::All;
    config.n_threads = Some(4);
    config.clone_fd = true;

    info!(
        mountpoint = %mountpoint.display(),
        staging_dir = %staging_dir.display(),
        "mounting sandbox filesystem"
    );
    fuser::mount(filesystem, mountpoint, &config)
        .with_context(|| format!("failed to mount {}", mountpoint.display()))
}

fn read_token(token_file: &Path) -> anyhow::Result<String> {
    // The sandbox user cannot write the root-owned runtime directory, but do
    // not rely on that alone: opening without following links prevents a
    // swapped token path from escaping that directory.
    let mut token_handle = fs::OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC)
        .open(token_file)
        .context("failed to open filesystem token file")?;
    let metadata = token_handle
        .metadata()
        .context("failed to inspect filesystem token file")?;
    if metadata.permissions().mode() & 0o077 != 0 {
        anyhow::bail!("filesystem token file must not be readable by group or others");
    }
    let mut token = String::new();
    token_handle
        .read_to_string(&mut token)
        .context("failed to read filesystem token file")?;
    let token = token.trim().to_owned();
    if token.is_empty() {
        anyhow::bail!("filesystem token file is empty");
    }
    Ok(token)
}

struct OpenHandle {
    content: OpenedContent,
    dirty: bool,
    defer_truncate_commit: bool,
    unlinked: bool,
}

impl Deref for OpenHandle {
    type Target = OpenedContent;

    fn deref(&self) -> &Self::Target {
        &self.content
    }
}

impl DerefMut for OpenHandle {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.content
    }
}

#[derive(Clone)]
struct DustFuse {
    store: Arc<FileStore>,
    handles: Arc<Mutex<HashMap<u64, Arc<Mutex<OpenHandle>>>>>,
    staged_sizes: Arc<Mutex<HashMap<INodeNo, u64>>>,
    namespace: Arc<RwLock<()>>,
    next_handle: Arc<AtomicU64>,
    remote_in_flight: Arc<AtomicUsize>,
    runtime: tokio::runtime::Handle,
    uid: u32,
    gid: u32,
}

struct RemotePermit {
    in_flight: Arc<AtomicUsize>,
}

impl Drop for RemotePermit {
    fn drop(&mut self) {
        self.in_flight.fetch_sub(1, Ordering::Release);
    }
}

fn acquire_remote_permit(in_flight: &Arc<AtomicUsize>, limit: usize) -> Option<RemotePermit> {
    in_flight
        .fetch_update(Ordering::AcqRel, Ordering::Acquire, |current| {
            (current < limit).then_some(current + 1)
        })
        .ok()?;
    Some(RemotePermit {
        in_flight: Arc::clone(in_flight),
    })
}

impl DustFuse {
    fn new(store: FileStore, runtime: tokio::runtime::Handle) -> Self {
        Self {
            store: Arc::new(store),
            handles: Arc::new(Mutex::new(HashMap::new())),
            staged_sizes: Arc::new(Mutex::new(HashMap::new())),
            namespace: Arc::new(RwLock::new(())),
            next_handle: Arc::new(AtomicU64::new(1)),
            remote_in_flight: Arc::new(AtomicUsize::new(0)),
            runtime,
            // The daemon creates every node. Reporting its uid/gid makes normal
            // command-line tools behave as expected inside the sandbox.
            uid: unsafe { libc::geteuid() },
            gid: unsafe { libc::getegid() },
        }
    }

    fn remote_permit(&self, operation: &'static str) -> Option<RemotePermit> {
        let permit = acquire_remote_permit(&self.remote_in_flight, MAX_REMOTE_OPERATIONS);
        if permit.is_none() {
            warn!(
                operation,
                limit = MAX_REMOTE_OPERATIONS,
                "filesystem remote operation limit reached"
            );
        }
        permit
    }

    fn spawn_remote<F>(&self, operation: &'static str, permit: RemotePermit, task: F)
    where
        F: FnOnce() + Send + 'static,
    {
        let started = Instant::now();
        // Reply objects are explicitly Send in fuser. The process already runs
        // on Tokio, whose blocking pool grows independently of fuser's fixed
        // request threads and queues work once its own safe limit is reached.
        drop(self.runtime.spawn_blocking(move || {
            let _permit = permit;
            task();
            debug!(
                operation,
                elapsed_ms = started.elapsed().as_millis(),
                "completed filesystem remote operation"
            );
        }));
    }

    fn handles(&self) -> io::Result<MutexGuard<'_, HashMap<u64, Arc<Mutex<OpenHandle>>>>> {
        self.handles.lock().map_err(|_| errno(libc::EIO))
    }

    fn namespace_read(&self) -> io::Result<RwLockReadGuard<'_, ()>> {
        self.namespace.read().map_err(|_| errno(libc::EIO))
    }

    fn namespace_write(&self) -> io::Result<RwLockWriteGuard<'_, ()>> {
        self.namespace.write().map_err(|_| errno(libc::EIO))
    }

    fn staged_sizes(&self) -> io::Result<MutexGuard<'_, HashMap<INodeNo, u64>>> {
        self.staged_sizes.lock().map_err(|_| errno(libc::EIO))
    }

    fn apply_staged_size(&self, node: &mut Node) -> io::Result<()> {
        if let Some(size) = self.staged_sizes()?.get(&node.inode) {
            node.size = *size;
        }
        Ok(())
    }

    fn node(&self, inode: INodeNo) -> io::Result<Node> {
        let mut node = self.store.node(inode)?;
        self.apply_staged_size(&mut node)?;
        Ok(node)
    }

    fn lookup_node(&self, parent_inode: INodeNo, name: &str) -> io::Result<Node> {
        let mut node = self.store.lookup(parent_inode, name)?;
        self.apply_staged_size(&mut node)?;
        Ok(node)
    }

    fn children(&self, inode: INodeNo) -> io::Result<Vec<Node>> {
        let mut children = self.store.children(inode)?;
        for child in &mut children {
            self.apply_staged_size(child)?;
        }
        Ok(children)
    }

    fn read_directory(&self, inode: INodeNo, offset: u64, mut reply: ReplyDirectory) {
        let result = (|| {
            let directory = self.node(inode)?;
            if directory.kind != NodeKind::Directory {
                return Err(errno(libc::ENOTDIR));
            }
            let parent_inode = directory.parent_inode.unwrap_or(FUSE_ROOT_INODE);
            let mut entries = vec![
                (directory.inode, NodeKind::Directory, ".".to_owned()),
                (parent_inode, NodeKind::Directory, "..".to_owned()),
            ];
            entries.extend(
                self.children(directory.inode)?
                    .into_iter()
                    .map(|node| (node.inode, node.kind, node.name)),
            );
            Ok(entries)
        })();
        let entries = match result {
            Ok(entries) => entries,
            Err(error) => {
                reply.error(to_errno(error));
                return;
            }
        };
        let offset = match usize::try_from(offset) {
            Ok(offset) => offset,
            Err(_) => {
                reply.error(Errno::EOVERFLOW);
                return;
            }
        };
        for (index, (inode, kind, name)) in entries.into_iter().enumerate().skip(offset) {
            let next_offset = match u64::try_from(index.saturating_add(1)) {
                Ok(next_offset) => next_offset,
                Err(_) => {
                    reply.error(Errno::EOVERFLOW);
                    return;
                }
            };
            if reply.add(inode, next_offset, file_type(kind), name) {
                break;
            }
        }
        reply.ok();
    }

    fn attributes(&self, node: &Node) -> FileAttr {
        FileAttr {
            ino: node.inode,
            size: node.size,
            blocks: node.size.div_ceil(u64::from(BLOCK_SIZE)),
            atime: time_from_ms(node.modified_at_ms),
            mtime: time_from_ms(node.modified_at_ms),
            ctime: time_from_ms(node.modified_at_ms),
            crtime: time_from_ms(node.created_at_ms),
            kind: file_type(node.kind),
            perm: node.mode,
            nlink: if node.kind == NodeKind::Directory {
                2
            } else {
                1
            },
            uid: self.uid,
            gid: self.gid,
            rdev: 0,
            blksize: BLOCK_SIZE,
            flags: 0,
        }
    }

    fn open_node(&self, inode: INodeNo, flags: i32) -> io::Result<u64> {
        let writable = is_writable(flags);
        let mut opened = self.store.open_content(inode, flags)?;
        (|| {
            let dirty = writable && flags & libc::O_TRUNC != 0;
            if dirty {
                opened.file.set_len(0)?;
                opened.node.size = 0;
                self.staged_sizes()?.insert(inode, 0);
            }
            let handle = self.next_handle.fetch_add(1, Ordering::Relaxed);
            self.handles()?.insert(
                handle,
                Arc::new(Mutex::new(OpenHandle {
                    content: opened,
                    dirty,
                    defer_truncate_commit: dirty,
                    unlinked: false,
                })),
            );
            debug!(
                handle,
                inode = inode.0,
                writable,
                "opened filesystem handle"
            );
            Ok(handle)
        })()
    }

    fn handle(&self, handle: u64) -> io::Result<Arc<Mutex<OpenHandle>>> {
        self.handles()?
            .get(&handle)
            .cloned()
            .ok_or_else(|| errno(libc::EBADF))
    }

    fn commit_handle(&self, handle: u64, commit_deferred_truncate: bool) -> io::Result<()> {
        let shared = self.handle(handle)?;
        let mut open = shared.lock().map_err(|_| errno(libc::EIO))?;
        if open.unlinked {
            open.file.sync_data()?;
            open.dirty = false;
            self.staged_sizes()?.remove(&open.node.inode);
            return Ok(());
        }
        if !open.dirty {
            return open.file.sync_data();
        }
        // Shells commonly dup the descriptor returned for `> file`. Closing
        // the original descriptor sends FLUSH before the command writes to
        // stdout. Keep an O_TRUNC-only empty file local until a write, fsync,
        // or the final release so one shell overwrite creates one revision.
        if open.defer_truncate_commit && !commit_deferred_truncate {
            return open.file.sync_data();
        }
        self.store.commit_content(&mut open.content)?;
        open.dirty = false;
        open.defer_truncate_commit = false;
        self.staged_sizes()?.remove(&open.node.inode);
        Ok(())
    }

    fn release_handle(&self, handle: u64) -> io::Result<()> {
        debug!(handle, "releasing filesystem handle");
        // Linux ignores errors returned by RELEASE. Written data and fsync had
        // the opportunity to report a failure. An O_TRUNC-only handle reaches
        // this final commit intentionally, so log any error before dropping it.
        let commit_result = self.commit_handle(handle, true);
        // Dropping the handle releases its store-owned pin and writer slot.
        self.handles()?.remove(&handle);
        debug!(
            handle,
            remaining_handles = self.handles()?.len(),
            "released filesystem handle"
        );
        if let Err(error) = &commit_result {
            warn!(
                handle,
                errno = error.raw_os_error(),
                error = %error,
                "final filesystem handle commit failed during release"
            );
        }
        commit_result
    }

    fn sync_handle(&self, handle: u64, data_only: bool) -> io::Result<()> {
        self.commit_handle(handle, true)?;
        let shared = self.handle(handle)?;
        let open = shared.lock().map_err(|_| errno(libc::EIO))?;
        if data_only {
            open.file.sync_data()
        } else {
            open.file.sync_all()
        }
    }

    fn truncate_writable_node(&self, inode: INodeNo, size: u64) -> io::Result<Option<Node>> {
        let handles = self.handles()?;
        for shared in handles.values() {
            let mut open = shared.lock().map_err(|_| errno(libc::EIO))?;
            if open.node.inode != inode || !open.is_writable() {
                continue;
            }
            open.file.set_len(size)?;
            open.node.size = size;
            open.dirty = true;
            open.defer_truncate_commit = false;
            self.staged_sizes()?.insert(inode, size);
            return Ok(Some(open.node.clone()));
        }
        Ok(None)
    }

    fn set_attributes(
        &self,
        inode: INodeNo,
        mode: Option<u32>,
        size: Option<u64>,
        handle: Option<FileHandle>,
    ) -> io::Result<Node> {
        let mut local_node = None;
        if let Some(size) = size {
            // Linux may follow an O_TRUNC open with SETATTR(size=0) but omit
            // the FUSE file handle. Reuse the one permitted writable handle;
            // committing through a second handle would advance the blob and
            // make the real writer fail its next fsync with ESTALE.
            if let Some(handle) = handle {
                let shared = self.handle(handle.0)?;
                let mut open = shared.lock().map_err(|_| errno(libc::EIO))?;
                if open.node.inode != inode || !open.is_writable() {
                    return Err(errno(libc::EBADF));
                }
                open.file.set_len(size)?;
                open.node.size = size;
                open.dirty = true;
                self.staged_sizes()?.insert(inode, size);
            } else {
                local_node = self.truncate_writable_node(inode, size)?;
                if local_node.is_none() {
                    self.store.set_size(inode, size)?;
                }
            }
        }
        if let Some(mode) = mode {
            let permissions = u16::try_from(mode & 0o7777).map_err(|_| errno(libc::EINVAL))?;
            let node = self.store.set_mode(inode, permissions)?;
            self.update_open_nodes(&node)?;
            if let Some(local) = &mut local_node {
                local.mode = node.mode;
                local.modified_at_ms = node.modified_at_ms;
            }
        }
        match handle {
            Some(handle) => self.node_for_handle(handle.0, inode),
            None => match local_node {
                Some(node) => Ok(node),
                None => self.node(inode),
            },
        }
    }

    fn mark_unlinked(&self, inode: INodeNo, unlinked: bool) -> io::Result<()> {
        for open in self.handles()?.values() {
            let mut open = open.lock().map_err(|_| errno(libc::EIO))?;
            if open.node.inode == inode {
                open.unlinked = unlinked;
            }
        }
        Ok(())
    }

    fn node_for_handle(&self, handle: u64, inode: INodeNo) -> io::Result<Node> {
        let shared = self.handle(handle)?;
        let open = shared.lock().map_err(|_| errno(libc::EIO))?;
        if open.node.inode != inode {
            return Err(errno(libc::EBADF));
        }
        let mut node = open.node.clone();
        node.size = open.file.metadata()?.len();
        Ok(node)
    }

    fn update_open_nodes(&self, node: &Node) -> io::Result<()> {
        for open in self.handles()?.values() {
            let mut open = open.lock().map_err(|_| errno(libc::EIO))?;
            if open.node.inode == node.inode && !open.unlinked {
                open.node = node.clone();
            }
        }
        Ok(())
    }
}

struct LocalStatfs {
    blocks: u64,
    blocks_free: u64,
    blocks_available: u64,
    files: u64,
    files_free: u64,
    block_size: u32,
    name_length: u32,
    fragment_size: u32,
}

fn local_statfs(path: &Path) -> io::Result<LocalStatfs> {
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

fn permissions(mode: u32, umask: u32) -> io::Result<u16> {
    u16::try_from((mode & !umask) & 0o7777).map_err(|_| errno(libc::EINVAL))
}

fn utf8_name(name: &OsStr) -> io::Result<&str> {
    name.to_str().ok_or_else(|| errno(libc::EINVAL))
}

fn file_type(kind: NodeKind) -> FileType {
    match kind {
        NodeKind::File => FileType::RegularFile,
        NodeKind::Directory => FileType::Directory,
    }
}

fn time_from_ms(value: i64) -> SystemTime {
    match u64::try_from(value) {
        Ok(value) => UNIX_EPOCH + Duration::from_millis(value),
        Err(_) => UNIX_EPOCH,
    }
}

fn to_errno(error: io::Error) -> Errno {
    Errno::from_i32(error.raw_os_error().unwrap_or(libc::EIO))
}

fn reply_empty(result: io::Result<()>, reply: ReplyEmpty) {
    match result {
        Ok(()) => reply.ok(),
        Err(error) => reply.error(to_errno(error)),
    }
}

fn errno(code: i32) -> io::Error {
    io::Error::from_raw_os_error(code)
}

#[cfg(test)]
mod tests;
