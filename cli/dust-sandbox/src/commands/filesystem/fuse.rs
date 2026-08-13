use std::collections::{HashMap, HashSet};
use std::ffi::CString;
use std::ffi::OsStr;
use std::fs::{self, File};
use std::io::{self, Read};
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

use super::store::{is_writable, FileStore, Node, NodeKind, ROOT_ID};

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
    node: Node,
    file: File,
    expected_blob_id: Option<String>,
    content_type: String,
    dirty: bool,
    defer_truncate_commit: bool,
    writable: bool,
    unlinked: bool,
}

#[derive(Clone)]
struct DustFuse {
    store: Arc<FileStore>,
    handles: Arc<Mutex<HashMap<u64, Arc<Mutex<OpenHandle>>>>>,
    writable_nodes: Arc<Mutex<HashSet<u64>>>,
    staged_sizes: Arc<Mutex<HashMap<u64, u64>>>,
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
            writable_nodes: Arc::new(Mutex::new(HashSet::new())),
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

    fn staged_sizes(&self) -> io::Result<MutexGuard<'_, HashMap<u64, u64>>> {
        self.staged_sizes.lock().map_err(|_| errno(libc::EIO))
    }

    fn apply_staged_size(&self, node: &mut Node) -> io::Result<()> {
        if let Some(size) = self.staged_sizes()?.get(&node.id) {
            node.size = *size;
        }
        Ok(())
    }

    fn node(&self, node_id: u64) -> io::Result<Node> {
        let mut node = self.store.node(node_id)?;
        self.apply_staged_size(&mut node)?;
        Ok(node)
    }

    fn lookup_node(&self, parent_id: u64, name: &str) -> io::Result<Node> {
        let mut node = self.store.lookup(parent_id, name)?;
        self.apply_staged_size(&mut node)?;
        Ok(node)
    }

    fn children(&self, node_id: u64) -> io::Result<Vec<Node>> {
        let mut children = self.store.children(node_id)?;
        for child in &mut children {
            self.apply_staged_size(child)?;
        }
        Ok(children)
    }

    fn read_directory(&self, inode: u64, offset: u64, mut reply: ReplyDirectory) {
        let result = (|| {
            let directory = self.node(inode)?;
            if directory.kind != NodeKind::Directory {
                return Err(errno(libc::ENOTDIR));
            }
            let parent_id = directory.parent_id.unwrap_or(ROOT_ID);
            let mut entries = vec![
                (directory.id, NodeKind::Directory, ".".to_owned()),
                (parent_id, NodeKind::Directory, "..".to_owned()),
            ];
            entries.extend(
                self.children(directory.id)?
                    .into_iter()
                    .map(|node| (node.id, node.kind, node.name)),
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
        for (index, (node_id, kind, name)) in entries.into_iter().enumerate().skip(offset) {
            let next_offset = match u64::try_from(index.saturating_add(1)) {
                Ok(next_offset) => next_offset,
                Err(_) => {
                    reply.error(Errno::EOVERFLOW);
                    return;
                }
            };
            if reply.add(INodeNo(node_id), next_offset, file_type(kind), name) {
                break;
            }
        }
        reply.ok();
    }

    fn attributes(&self, node: &Node) -> FileAttr {
        FileAttr {
            ino: INodeNo(node.id),
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

    fn open_node(&self, node_id: u64, flags: i32) -> io::Result<u64> {
        let writable = is_writable(flags);
        if writable
            && !self
                .writable_nodes
                .lock()
                .map_err(|_| errno(libc::EIO))?
                .insert(node_id)
        {
            return Err(errno(libc::EBUSY));
        }

        let result = (|| {
            let pinned_node_ids = {
                let handles = self.handles()?;
                let mut pinned_node_ids = HashSet::with_capacity(handles.len());
                for open in handles.values() {
                    let open = open.lock().map_err(|_| errno(libc::EIO))?;
                    pinned_node_ids.insert(open.node.id);
                }
                pinned_node_ids
            };
            let mut opened = self.store.open_content(node_id, flags, &pinned_node_ids)?;
            let dirty = writable && flags & libc::O_TRUNC != 0;
            if dirty {
                opened.file.set_len(0)?;
                opened.node.size = 0;
                self.staged_sizes()?.insert(node_id, 0);
            }
            let handle = self.next_handle.fetch_add(1, Ordering::Relaxed);
            self.handles()?.insert(
                handle,
                Arc::new(Mutex::new(OpenHandle {
                    node: opened.node,
                    file: opened.file,
                    expected_blob_id: opened.expected_blob_id,
                    content_type: opened.content_type,
                    dirty,
                    defer_truncate_commit: dirty,
                    writable,
                    unlinked: false,
                })),
            );
            debug!(handle, node_id, writable, "opened filesystem handle");
            Ok(handle)
        })();

        if result.is_err() && writable {
            self.writable_nodes
                .lock()
                .map_err(|_| errno(libc::EIO))?
                .remove(&node_id);
        }
        result
    }

    fn active_node_ids(&self) -> io::Result<HashSet<u64>> {
        let handles = self.handles()?;
        let mut node_ids = HashSet::with_capacity(handles.len());
        for open in handles.values() {
            node_ids.insert(open.lock().map_err(|_| errno(libc::EIO))?.node.id);
        }
        Ok(node_ids)
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
            self.staged_sizes()?.remove(&open.node.id);
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
        let committed = self.store.commit_content(
            open.node.id,
            open.expected_blob_id.as_deref(),
            &open.content_type,
            &open.file,
        )?;
        open.expected_blob_id = committed.blob_id().map(str::to_owned);
        open.content_type = committed.content_type().to_owned();
        open.node = committed;
        open.dirty = false;
        open.defer_truncate_commit = false;
        self.staged_sizes()?.remove(&open.node.id);
        Ok(())
    }

    fn release_handle(&self, handle: u64) -> io::Result<()> {
        debug!(handle, "releasing filesystem handle");
        // Linux ignores errors returned by RELEASE. Written data and fsync had
        // the opportunity to report a failure. An O_TRUNC-only handle reaches
        // this final commit intentionally, so log any error before dropping it.
        let mut commit_result = self.commit_handle(handle, true);
        let removed = self.handles()?.remove(&handle);
        if let Some(open) = removed {
            let open = open.lock().map_err(|_| errno(libc::EIO))?;
            if open.writable {
                self.writable_nodes
                    .lock()
                    .map_err(|_| errno(libc::EIO))?
                    .remove(&open.node.id);
            }
        }
        if commit_result.is_ok() {
            // An open file is pinned even when the cache is over capacity.
            // Closing it is the first safe point at which its path may be
            // unlinked; existing file descriptors remain valid on Linux.
            let pinned_node_ids = self.active_node_ids()?;
            if let Err(error) = self.store.trim_cache(&pinned_node_ids) {
                commit_result = Err(error);
            }
        }
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

    fn truncate_writable_node(&self, inode: u64, size: u64) -> io::Result<Option<Node>> {
        let handles = self.handles()?;
        for shared in handles.values() {
            let mut open = shared.lock().map_err(|_| errno(libc::EIO))?;
            if open.node.id != inode || !open.writable {
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
        inode: u64,
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
                if open.node.id != inode || !open.writable {
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

    fn mark_unlinked(&self, node_id: u64, unlinked: bool) -> io::Result<()> {
        for open in self.handles()?.values() {
            let mut open = open.lock().map_err(|_| errno(libc::EIO))?;
            if open.node.id == node_id {
                open.unlinked = unlinked;
            }
        }
        Ok(())
    }

    fn node_for_handle(&self, handle: u64, inode: u64) -> io::Result<Node> {
        let shared = self.handle(handle)?;
        let open = shared.lock().map_err(|_| errno(libc::EIO))?;
        if open.node.id != inode {
            return Err(errno(libc::EBADF));
        }
        let mut node = open.node.clone();
        node.size = open.file.metadata()?.len();
        Ok(node)
    }

    fn update_open_nodes(&self, node: &Node) -> io::Result<()> {
        for open in self.handles()?.values() {
            let mut open = open.lock().map_err(|_| errno(libc::EIO))?;
            if open.node.id == node.id && !open.unlinked {
                open.node = node.clone();
            }
        }
        Ok(())
    }
}

impl Filesystem for DustFuse {
    fn init(&mut self, _request: &Request, config: &mut KernelConfig) -> io::Result<()> {
        // With this capability Linux carries O_TRUNC on OPEN instead of
        // issuing a separate SETATTR that could become its own revision.
        config
            .add_capabilities(InitFlags::FUSE_ATOMIC_O_TRUNC)
            .map_err(|_| errno(libc::ENOTSUP))
    }

    fn lookup(&self, _request: &Request, parent: INodeNo, name: &OsStr, reply: ReplyEntry) {
        let name = match utf8_name(name) {
            Ok(name) => name.to_owned(),
            Err(error) => {
                reply.error(to_errno(error));
                return;
            }
        };
        let Some(permit) = self.remote_permit("lookup") else {
            reply.error(Errno::EAGAIN);
            return;
        };
        let filesystem = self.clone();
        self.spawn_remote("lookup", permit, move || {
            match filesystem.lookup_node(parent.0, &name) {
                Ok(node) => reply.entry(
                    &METADATA_CACHE_TTL,
                    &filesystem.attributes(&node),
                    Generation(0),
                ),
                Err(error) => reply.error(to_errno(error)),
            }
        });
    }

    fn getattr(
        &self,
        _request: &Request,
        inode: INodeNo,
        handle: Option<FileHandle>,
        reply: ReplyAttr,
    ) {
        if let Some(handle) = handle {
            match self.node_for_handle(handle.0, inode.0) {
                Ok(node) => reply.attr(&METADATA_CACHE_TTL, &self.attributes(&node)),
                Err(error) => reply.error(to_errno(error)),
            }
            return;
        }
        let Some(permit) = self.remote_permit("getattr") else {
            reply.error(Errno::EAGAIN);
            return;
        };
        let filesystem = self.clone();
        self.spawn_remote("getattr", permit, move || match filesystem.node(inode.0) {
            Ok(node) => reply.attr(&METADATA_CACHE_TTL, &filesystem.attributes(&node)),
            Err(error) => reply.error(to_errno(error)),
        });
    }

    #[allow(clippy::too_many_arguments)]
    fn setattr(
        &self,
        _request: &Request,
        inode: INodeNo,
        mode: Option<u32>,
        uid: Option<u32>,
        gid: Option<u32>,
        size: Option<u64>,
        _atime: Option<TimeOrNow>,
        _mtime: Option<TimeOrNow>,
        _ctime: Option<SystemTime>,
        handle: Option<FileHandle>,
        _creation_time: Option<SystemTime>,
        _change_time: Option<SystemTime>,
        _backup_time: Option<SystemTime>,
        _flags: Option<BsdFileFlags>,
        reply: ReplyAttr,
    ) {
        if uid.is_some() || gid.is_some() {
            reply.error(Errno::EPERM);
            return;
        }
        if handle.is_some() && mode.is_none() {
            match self.set_attributes(inode.0, mode, size, handle) {
                Ok(node) => reply.attr(&METADATA_CACHE_TTL, &self.attributes(&node)),
                Err(error) => reply.error(to_errno(error)),
            }
            return;
        }
        let Some(permit) = self.remote_permit("setattr") else {
            reply.error(Errno::EAGAIN);
            return;
        };
        let filesystem = self.clone();
        self.spawn_remote("setattr", permit, move || {
            match filesystem.set_attributes(inode.0, mode, size, handle) {
                Ok(node) => reply.attr(&METADATA_CACHE_TTL, &filesystem.attributes(&node)),
                Err(error) => reply.error(to_errno(error)),
            }
        });
    }

    fn mkdir(
        &self,
        _request: &Request,
        parent: INodeNo,
        name: &OsStr,
        mode: u32,
        umask: u32,
        reply: ReplyEntry,
    ) {
        let name = match utf8_name(name) {
            Ok(name) => name.to_owned(),
            Err(error) => {
                reply.error(to_errno(error));
                return;
            }
        };
        let permissions = match permissions(mode, umask) {
            Ok(permissions) => permissions,
            Err(error) => {
                reply.error(to_errno(error));
                return;
            }
        };
        let Some(permit) = self.remote_permit("mkdir") else {
            reply.error(Errno::EAGAIN);
            return;
        };
        let filesystem = self.clone();
        self.spawn_remote("mkdir", permit, move || {
            let result = (|| {
                let _namespace = filesystem.namespace_write()?;
                filesystem
                    .store
                    .create_directory(parent.0, &name, permissions)
            })();
            match result {
                Ok(node) => reply.entry(
                    &METADATA_CACHE_TTL,
                    &filesystem.attributes(&node),
                    Generation(0),
                ),
                Err(error) => reply.error(to_errno(error)),
            }
        });
    }

    fn unlink(&self, _request: &Request, parent: INodeNo, name: &OsStr, reply: ReplyEmpty) {
        let name = match utf8_name(name) {
            Ok(name) => name.to_owned(),
            Err(error) => {
                reply.error(to_errno(error));
                return;
            }
        };
        let Some(permit) = self.remote_permit("unlink") else {
            reply.error(Errno::EAGAIN);
            return;
        };
        let filesystem = self.clone();
        self.spawn_remote("unlink", permit, move || {
            let result = (|| {
                let _namespace = filesystem.namespace_write()?;
                let node = filesystem.lookup_node(parent.0, &name)?;
                filesystem.mark_unlinked(node.id, true)?;
                if let Err(error) = filesystem.store.remove_file(parent.0, &name) {
                    filesystem.mark_unlinked(node.id, false)?;
                    return Err(error);
                }
                filesystem.staged_sizes()?.remove(&node.id);
                Ok(())
            })();
            reply_empty(result, reply);
        });
    }

    fn rmdir(&self, _request: &Request, parent: INodeNo, name: &OsStr, reply: ReplyEmpty) {
        let name = match utf8_name(name) {
            Ok(name) => name.to_owned(),
            Err(error) => {
                reply.error(to_errno(error));
                return;
            }
        };
        let Some(permit) = self.remote_permit("rmdir") else {
            reply.error(Errno::EAGAIN);
            return;
        };
        let filesystem = self.clone();
        self.spawn_remote("rmdir", permit, move || {
            let result = (|| {
                let _namespace = filesystem.namespace_write()?;
                let node = filesystem.lookup_node(parent.0, &name)?;
                filesystem.store.remove_directory(parent.0, &name)?;
                filesystem.staged_sizes()?.remove(&node.id);
                Ok(())
            })();
            reply_empty(result, reply);
        });
    }

    fn rename(
        &self,
        _request: &Request,
        parent: INodeNo,
        name: &OsStr,
        new_parent: INodeNo,
        new_name: &OsStr,
        flags: RenameFlags,
        reply: ReplyEmpty,
    ) {
        if !flags.is_empty() {
            reply.error(Errno::ENOTSUP);
            return;
        }
        let name = match utf8_name(name) {
            Ok(name) => name.to_owned(),
            Err(error) => {
                reply.error(to_errno(error));
                return;
            }
        };
        let new_name = match utf8_name(new_name) {
            Ok(name) => name.to_owned(),
            Err(error) => {
                reply.error(to_errno(error));
                return;
            }
        };
        let Some(permit) = self.remote_permit("rename") else {
            reply.error(Errno::EAGAIN);
            return;
        };
        let filesystem = self.clone();
        self.spawn_remote("rename", permit, move || {
            let result = (|| {
                let _namespace = filesystem.namespace_write()?;
                if parent == new_parent && name == new_name {
                    return Ok(());
                }
                let source = filesystem.lookup_node(parent.0, &name)?;
                let destination_id = match filesystem.lookup_node(new_parent.0, &new_name) {
                    Ok(destination) => Some(destination.id),
                    Err(error) if error.raw_os_error() == Some(libc::ENOENT) => None,
                    Err(error) => return Err(error),
                };
                if let Some(destination_id) = destination_id {
                    filesystem.mark_unlinked(destination_id, true)?;
                }
                let rename_result: io::Result<()> = (|| {
                    filesystem
                        .store
                        .rename(parent.0, &name, new_parent.0, &new_name)?;
                    if let Some(destination_id) = destination_id {
                        filesystem.store.forget_content(destination_id);
                    }
                    Ok(())
                })();
                if rename_result.is_err() {
                    if let Some(destination_id) = destination_id {
                        filesystem.mark_unlinked(destination_id, false)?;
                    }
                }
                rename_result?;
                debug!(node_id = source.id, "renamed filesystem inode");
                Ok(())
            })();
            reply_empty(result, reply);
        });
    }

    fn open(&self, _request: &Request, inode: INodeNo, flags: OpenFlags, reply: ReplyOpen) {
        let Some(permit) = self.remote_permit("open") else {
            reply.error(Errno::EAGAIN);
            return;
        };
        let filesystem = self.clone();
        self.spawn_remote("open", permit, move || {
            let result = (|| {
                // Opens may run together, but a rename or unlink takes the
                // write side so the handle is either fully opened before the
                // name disappears or fails after it disappeared.
                let _namespace = filesystem.namespace_read()?;
                filesystem.open_node(inode.0, flags.0)
            })();
            match result {
                Ok(handle) => reply.opened(FileHandle(handle), FopenFlags::empty()),
                Err(error) => reply.error(to_errno(error)),
            }
        });
    }

    #[allow(clippy::too_many_arguments)]
    fn read(
        &self,
        _request: &Request,
        _inode: INodeNo,
        handle: FileHandle,
        offset: u64,
        size: u32,
        _flags: OpenFlags,
        _lock_owner: Option<LockOwner>,
        reply: ReplyData,
    ) {
        let result = (|| {
            let shared = self.handle(handle.0)?;
            let open = shared.lock().map_err(|_| errno(libc::EIO))?;
            let mut bytes = vec![0; usize::try_from(size).map_err(|_| errno(libc::EOVERFLOW))?];
            let read = open.file.read_at(&mut bytes, offset)?;
            bytes.truncate(read);
            Ok(bytes)
        })();
        match result {
            Ok(bytes) => reply.data(&bytes),
            Err(error) => reply.error(to_errno(error)),
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn write(
        &self,
        _request: &Request,
        _inode: INodeNo,
        handle: FileHandle,
        offset: u64,
        data: &[u8],
        _write_flags: WriteFlags,
        _flags: OpenFlags,
        _lock_owner: Option<LockOwner>,
        reply: ReplyWrite,
    ) {
        let result = (|| {
            let shared = self.handle(handle.0)?;
            let mut open = shared.lock().map_err(|_| errno(libc::EIO))?;
            let node_id = open.node.id;
            let written = open.file.write_at(data, offset)?;
            let size = open.file.metadata()?.len();
            open.node.size = size;
            open.dirty = true;
            open.defer_truncate_commit = false;
            self.staged_sizes()?.insert(node_id, size);
            u32::try_from(written).map_err(|_| errno(libc::EOVERFLOW))
        })();
        match result {
            Ok(written) => reply.written(written),
            Err(error) => reply.error(to_errno(error)),
        }
    }

    fn flush(
        &self,
        _request: &Request,
        _inode: INodeNo,
        handle: FileHandle,
        _lock_owner: LockOwner,
        reply: ReplyEmpty,
    ) {
        let Some(permit) = self.remote_permit("flush") else {
            reply.error(Errno::EAGAIN);
            return;
        };
        let filesystem = self.clone();
        self.spawn_remote("flush", permit, move || {
            debug!(handle = handle.0, "flushing filesystem handle");
            reply_empty(filesystem.commit_handle(handle.0, false), reply);
        });
    }

    fn release(
        &self,
        _request: &Request,
        _inode: INodeNo,
        handle: FileHandle,
        _flags: OpenFlags,
        _lock_owner: Option<LockOwner>,
        _flush: bool,
        reply: ReplyEmpty,
    ) {
        let Some(permit) = self.remote_permit("release") else {
            // RELEASE errors are ignored by Linux. Falling back here is rare,
            // but dropping a dirty handle would silently lose the only record
            // that its staged content still needs upload.
            reply_empty(self.release_handle(handle.0), reply);
            return;
        };
        let filesystem = self.clone();
        self.spawn_remote("release", permit, move || {
            reply_empty(filesystem.release_handle(handle.0), reply);
        });
    }

    fn fsync(
        &self,
        _request: &Request,
        _inode: INodeNo,
        handle: FileHandle,
        data_only: bool,
        reply: ReplyEmpty,
    ) {
        let Some(permit) = self.remote_permit("fsync") else {
            reply.error(Errno::EAGAIN);
            return;
        };
        let filesystem = self.clone();
        self.spawn_remote("fsync", permit, move || {
            reply_empty(filesystem.sync_handle(handle.0, data_only), reply);
        });
    }

    fn opendir(&self, _request: &Request, inode: INodeNo, _flags: OpenFlags, reply: ReplyOpen) {
        let Some(permit) = self.remote_permit("opendir") else {
            reply.error(Errno::EAGAIN);
            return;
        };
        let filesystem = self.clone();
        self.spawn_remote("opendir", permit, move || match filesystem.node(inode.0) {
            Ok(node) if node.kind == NodeKind::Directory => {
                reply.opened(FileHandle(0), FopenFlags::empty());
            }
            Ok(_) => reply.error(Errno::ENOTDIR),
            Err(error) => reply.error(to_errno(error)),
        });
    }

    fn readdir(
        &self,
        _request: &Request,
        inode: INodeNo,
        _handle: FileHandle,
        offset: u64,
        reply: ReplyDirectory,
    ) {
        let Some(permit) = self.remote_permit("readdir") else {
            reply.error(Errno::EAGAIN);
            return;
        };
        let filesystem = self.clone();
        self.spawn_remote("readdir", permit, move || {
            filesystem.read_directory(inode.0, offset, reply);
        });
    }

    fn statfs(&self, _request: &Request, _inode: INodeNo, reply: ReplyStatfs) {
        let result = (|| local_statfs(self.store.staging_dir()))();
        match result {
            Ok(stats) => reply.statfs(
                stats.blocks,
                stats.blocks_free,
                stats.blocks_available,
                stats.files,
                stats.files_free,
                stats.block_size,
                stats.name_length,
                stats.fragment_size,
            ),
            Err(error) => reply.error(to_errno(error)),
        }
    }

    fn access(&self, _request: &Request, inode: INodeNo, _mask: AccessFlags, reply: ReplyEmpty) {
        let Some(permit) = self.remote_permit("access") else {
            reply.error(Errno::EAGAIN);
            return;
        };
        let filesystem = self.clone();
        self.spawn_remote("access", permit, move || {
            reply_empty(filesystem.node(inode.0).map(|_| ()), reply);
        });
    }

    fn create(
        &self,
        _request: &Request,
        parent: INodeNo,
        name: &OsStr,
        mode: u32,
        umask: u32,
        flags: i32,
        reply: ReplyCreate,
    ) {
        let name = match utf8_name(name) {
            Ok(name) => name.to_owned(),
            Err(error) => {
                reply.error(to_errno(error));
                return;
            }
        };
        let permissions = match permissions(mode, umask) {
            Ok(permissions) => permissions,
            Err(error) => {
                reply.error(to_errno(error));
                return;
            }
        };
        let Some(permit) = self.remote_permit("create") else {
            reply.error(Errno::EAGAIN);
            return;
        };
        let filesystem = self.clone();
        self.spawn_remote("create", permit, move || {
            let result = (|| {
                let _namespace = filesystem.namespace_write()?;
                let node = filesystem.store.create_file(parent.0, &name, permissions)?;
                let handle = filesystem.open_node(node.id, flags)?;
                Ok((node, handle))
            })();
            match result {
                Ok((node, handle)) => reply.created(
                    &METADATA_CACHE_TTL,
                    &filesystem.attributes(&node),
                    Generation(0),
                    FileHandle(handle),
                    FopenFlags::empty(),
                ),
                Err(error) => reply.error(to_errno(error)),
            }
        });
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
mod tests {
    use std::fs;
    use std::os::unix::fs::{symlink, PermissionsExt};
    use std::sync::atomic::AtomicUsize;
    use std::sync::Arc;

    use tempfile::tempdir;

    use super::{acquire_remote_permit, local_statfs, read_token};

    #[test]
    fn token_open_never_follows_a_symbolic_link() {
        let directory = tempdir().expect("temporary directory");
        let target = directory.path().join("target");
        let link = directory.path().join("token");
        fs::write(&target, "secret").expect("write target");
        fs::set_permissions(&target, fs::Permissions::from_mode(0o600)).expect("restrict target");
        symlink(&target, &link).expect("create link");

        let error = read_token(&link).expect_err("reject link");
        assert_eq!(
            error
                .root_cause()
                .downcast_ref::<std::io::Error>()
                .and_then(std::io::Error::raw_os_error),
            Some(libc::ELOOP)
        );
    }

    #[test]
    fn statfs_reports_the_real_staging_filesystem() {
        let directory = tempdir().expect("temporary directory");
        let stats = local_statfs(directory.path()).expect("read statvfs");
        assert!(stats.blocks > 0);
        assert!(stats.block_size > 0);
        assert!(stats.name_length > 0);
    }

    #[test]
    fn remote_operation_limit_rejects_excess_work_until_a_permit_is_released() {
        let in_flight = Arc::new(AtomicUsize::new(0));
        let first = acquire_remote_permit(&in_flight, 2).expect("first permit");
        let second = acquire_remote_permit(&in_flight, 2).expect("second permit");
        assert!(acquire_remote_permit(&in_flight, 2).is_none());

        drop(first);
        assert!(acquire_remote_permit(&in_flight, 2).is_some());
        drop(second);
    }
}
