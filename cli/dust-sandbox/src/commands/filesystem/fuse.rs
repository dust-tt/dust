//! Mounts the Dust file tree through Linux FUSE.
//!
//! This file owns the shared state used by FUSE calls: the Front-backed store,
//! open handles, local file changes that are not saved yet, and limits for
//! calls that may wait on Front or GCS. The actual Linux FUSE calls live in
//! `operations`; the other child modules keep their supporting code separate.

use std::ffi::OsStr;
use std::io;
use std::path::Path;
use std::sync::{Arc, Mutex, MutexGuard, OnceLock, TryLockError};
use std::time::Duration;

use anyhow::Context;
use fuser::{
    AccessFlags, BsdFileFlags, Config, Errno, FileAttr, FileHandle, Filesystem, FopenFlags,
    Generation, INodeNo, InitFlags, KernelConfig, LockOwner, MountOption, Notifier, OpenFlags,
    RenameFlags, ReplyAttr, ReplyCreate, ReplyData, ReplyDirectory, ReplyEmpty, ReplyEntry,
    ReplyOpen, ReplyStatfs, ReplyWrite, Request, SessionACL, TimeOrNow, WriteFlags,
};
use tracing::{debug, info, warn};

use super::errno;
use super::remote::{RemoteExecutor, RemoteWork};
use super::store::{is_writable, FileStore, Node, NodeKind, FUSE_ROOT_INODE};

mod handles;
mod linux;
mod operations;

use handles::{DirectoryEntry, HandleTable, InodeLocks, OpenFile};
use linux::*;

// Linux may retain an entry for one second after the daemon's own one-second
// cache was read, so a change from another sandbox can take almost two seconds.
const KERNEL_ENTRY_TTL: Duration = Duration::from_secs(1);

pub fn mount(
    mountpoint: &Path,
    staging_dir: &Path,
    api_url: &str,
    workspace_id: &str,
    token_file: &Path,
    cache_capacity_bytes: u64,
    runtime: tokio::runtime::Handle,
) -> anyhow::Result<()> {
    let store = FileStore::open(
        staging_dir,
        api_url,
        workspace_id,
        token_file.to_path_buf(),
        cache_capacity_bytes,
    )
    .context("failed to initialize filesystem namespace")?;
    // The session is what can notify Linux, and it needs the filesystem to be
    // built first. The filesystem receives this empty slot and reads it once
    // the session has filled it in below.
    let notifier = Arc::new(OnceLock::new());
    let filesystem = DustFuse::new(store, runtime, Arc::clone(&notifier));
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
    let session = fuser::Session::new(filesystem, mountpoint, &config)
        .with_context(|| format!("failed to mount {}", mountpoint.display()))?;
    let _ = notifier.set(session.notifier());
    session
        .run()
        .with_context(|| format!("failed to serve {}", mountpoint.display()))
}

#[derive(Clone)]
struct DustFuse {
    store: Arc<FileStore>,
    handles: Arc<HandleTable>,
    staged_attributes: Arc<Mutex<std::collections::HashMap<INodeNo, StagedAttributes>>>,
    namespace_writes: Arc<Mutex<()>>,
    inode_locks: Arc<InodeLocks>,
    remote: RemoteExecutor,
    // Filled in once the FUSE session exists. Used to tell Linux to drop the
    // file details it cached before a save gave the file a new time.
    notifier: Arc<OnceLock<Notifier>>,
    uid: u32,
    gid: u32,
}

#[derive(Clone, Copy)]
struct StagedAttributes {
    size: u64,
    modified_at_ms: i64,
}

impl DustFuse {
    fn new(
        store: FileStore,
        runtime: tokio::runtime::Handle,
        notifier: Arc<OnceLock<Notifier>>,
    ) -> Self {
        Self {
            store: Arc::new(store),
            handles: Arc::new(HandleTable::new()),
            staged_attributes: Arc::new(Mutex::new(std::collections::HashMap::new())),
            namespace_writes: Arc::new(Mutex::new(())),
            inode_locks: Arc::new(InodeLocks::new()),
            remote: RemoteExecutor::new(runtime),
            notifier,
            // The daemon creates every node. Reporting its uid/gid makes normal
            // command-line tools behave as expected inside the sandbox.
            uid: unsafe { libc::geteuid() },
            gid: unsafe { libc::getegid() },
        }
    }

    fn spawn_remote<F>(&self, operation: &'static str, work: RemoteWork, task: F)
    where
        F: FnOnce(bool) + Send + 'static,
    {
        self.remote.spawn(operation, work, task);
    }

    fn namespace_write(&self) -> io::Result<MutexGuard<'_, ()>> {
        self.namespace_writes.lock().map_err(|_| errno(libc::EIO))
    }

    fn staged_attributes(
        &self,
    ) -> io::Result<MutexGuard<'_, std::collections::HashMap<INodeNo, StagedAttributes>>> {
        self.staged_attributes.lock().map_err(|_| errno(libc::EIO))
    }

    fn stage_attributes(&self, inode: INodeNo, size: u64) -> io::Result<()> {
        self.staged_attributes()?.insert(
            inode,
            StagedAttributes {
                size,
                modified_at_ms: now_ms(),
            },
        );
        Ok(())
    }

    fn clear_staged_attributes(&self, inode: INodeNo) -> io::Result<()> {
        self.staged_attributes()?.remove(&inode);
        Ok(())
    }

    fn apply_staged_attributes(&self, node: &mut Node) -> io::Result<()> {
        if let Some(staged) = self.staged_attributes()?.get(&node.inode) {
            node.size = staged.size;
            node.modified_at_ms = staged.modified_at_ms;
        }
        Ok(())
    }

    fn node(&self, inode: INodeNo) -> io::Result<Node> {
        let mut node = self.store.node(inode)?;
        self.apply_staged_attributes(&mut node)?;
        Ok(node)
    }

    fn lookup_node(&self, parent_inode: INodeNo, name: &str) -> io::Result<Node> {
        let mut node = self.store.lookup(parent_inode, name)?;
        self.apply_staged_attributes(&mut node)?;
        Ok(node)
    }

    fn children(&self, inode: INodeNo) -> io::Result<Vec<Node>> {
        let mut children = self.store.children(inode)?;
        for child in &mut children {
            self.apply_staged_attributes(child)?;
        }
        Ok(children)
    }

    fn create_directory_node(
        &self,
        parent: INodeNo,
        name: &str,
        permissions: u16,
    ) -> io::Result<Node> {
        let _namespace = self.namespace_write()?;
        self.store.create_directory(parent, name, permissions)
    }

    fn create_and_open_node(
        &self,
        parent: INodeNo,
        name: &str,
        permissions: u16,
        flags: i32,
    ) -> io::Result<(Node, u64)> {
        let _namespace = self.namespace_write()?;
        let node = self.store.create_file(parent, name, permissions)?;
        let handle = match self.open_node(node.inode, flags) {
            Ok(handle) => handle,
            Err(error) => {
                // A path-based cleanup could delete a different node if
                // another sandbox moved this node and reused the name.
                // Keep the empty node until Front supports delete-by-id.
                warn!(inode = node.inode.0, %error, "created file but local open failed");
                return Err(error);
            }
        };
        Ok((node, handle))
    }

    fn unlink_node(&self, parent: INodeNo, name: &str) -> io::Result<()> {
        let _namespace = self.namespace_write()?;
        let node = self.lookup_node(parent, name)?;
        let _inode = self.inode_locks.lock(node.inode)?;
        // The lookup above only chooses which lock to take. Which node stops
        // publishing is decided by the removal itself.
        let removed_inode = self.store.remove_file(parent, name)?;
        // Do this only after Front confirms the removal. A failed removal must
        // leave a dirty open handle able to publish its bytes later.
        self.mark_unlinked(removed_inode)?;
        self.clear_staged_attributes(removed_inode)
    }

    fn remove_directory_node(&self, parent: INodeNo, name: &str) -> io::Result<()> {
        let _namespace = self.namespace_write()?;
        let removed_inode = self.store.remove_directory(parent, name)?;
        self.clear_staged_attributes(removed_inode)
    }

    fn rename_node(
        &self,
        parent: INodeNo,
        name: &str,
        new_parent: INodeNo,
        new_name: &str,
    ) -> io::Result<()> {
        let _namespace = self.namespace_write()?;
        if parent == new_parent && name == new_name {
            return Ok(());
        }
        let destination_inode = match self.lookup_node(new_parent, new_name) {
            Ok(destination) => Some(destination.inode),
            Err(error) if error.raw_os_error() == Some(libc::ENOENT) => None,
            Err(error) => return Err(error),
        };
        let _destination = destination_inode
            .map(|inode| self.inode_locks.lock(inode))
            .transpose()?;
        let renamed = self.store.rename(parent, name, new_parent, new_name)?;
        // As with a removal, the lookup above only chooses the lock.
        if let Some(replaced_inode) = renamed.replaced_inode {
            // The replaced node stays readable through existing descriptors,
            // but those descriptors must never replace the new path later.
            self.mark_unlinked(replaced_inode)?;
            self.clear_staged_attributes(replaced_inode)?;
        }
        debug!(inode = renamed.node.inode.0, "renamed filesystem inode");
        Ok(())
    }

    fn open_directory(&self, inode: INodeNo) -> io::Result<u64> {
        let directory = self.node(inode)?;
        if directory.kind != NodeKind::Directory {
            return Err(errno(libc::ENOTDIR));
        }
        let parent_inode = directory.parent_inode.unwrap_or(FUSE_ROOT_INODE);
        let mut entries = vec![
            DirectoryEntry {
                inode: directory.inode,
                kind: NodeKind::Directory,
                name: ".".to_owned(),
            },
            DirectoryEntry {
                inode: parent_inode,
                kind: NodeKind::Directory,
                name: "..".to_owned(),
            },
        ];
        entries.extend(
            self.children(directory.inode)?
                .into_iter()
                .map(|node| DirectoryEntry {
                    inode: node.inode,
                    kind: node.kind,
                    name: node.name,
                }),
        );
        self.handles.insert_directory(entries)
    }

    fn read_directory(&self, handle: u64, offset: u64, mut reply: ReplyDirectory) {
        let entries = match self.handles.directory(handle) {
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
        for (index, entry) in entries.iter().enumerate().skip(offset) {
            let next_offset = match u64::try_from(index.saturating_add(1)) {
                Ok(next_offset) => next_offset,
                Err(_) => {
                    reply.error(Errno::EOVERFLOW);
                    return;
                }
            };
            if reply.add(
                entry.inode,
                next_offset,
                file_type(entry.kind),
                entry.name.as_str(),
            ) {
                break;
            }
        }
        reply.ok();
    }

    fn attributes(&self, node: &Node) -> FileAttr {
        file_attributes(node, self.uid, self.gid)
    }

    fn open_node(&self, inode: INodeNo, flags: i32) -> io::Result<u64> {
        validate_open_request(flags)?;
        let writable = is_writable(flags);
        // Namespace removal takes the same inode lock after resolving the name.
        // A local open therefore either installs its handle before unlink marks
        // it, or starts after the node was removed and fails cleanly.
        let _inode = self.inode_locks.lock(inode)?;
        let mut opened = self.store.open_content(inode, flags)?;
        let dirty = writable && flags & libc::O_TRUNC != 0;
        let result = (|| {
            if dirty {
                opened.set_len(0)?;
                self.stage_attributes(inode, 0)?;
            }
            let handle = self.handles.insert_file(OpenFile::new(opened, dirty))?;
            debug!(
                handle,
                inode = inode.0,
                writable,
                "opened filesystem handle"
            );
            Ok(handle)
        })();
        if result.is_err() && dirty {
            self.clear_staged_attributes(inode)?;
            self.store.discard_content(inode)?;
        }
        result
    }

    fn handle_inode(&self, handle: u64) -> io::Result<INodeNo> {
        let shared = self.handles.file(handle)?;
        let open = shared.lock().map_err(|_| errno(libc::EIO))?;
        Ok(open.inode())
    }

    fn commit_handle(&self, handle: u64, commit_deferred_truncate: bool) -> io::Result<()> {
        let inode = self.handle_inode(handle)?;
        let _inode = self.inode_locks.lock(inode)?;
        self.commit_handle_locked(handle, commit_deferred_truncate)
    }

    // The caller holds this inode's lock so a remove or rename-over cannot
    // change whether the open file is still allowed to publish its bytes.
    fn commit_handle_locked(&self, handle: u64, commit_deferred_truncate: bool) -> io::Result<()> {
        let shared = self.handles.file(handle)?;
        let mut open = shared.lock().map_err(|_| errno(libc::EIO))?;
        if open.is_unlinked() {
            open.sync_data()?;
            open.mark_committed();
            self.clear_staged_attributes(open.inode())?;
            return Ok(());
        }
        if !open.needs_commit(commit_deferred_truncate) {
            return open.sync_data();
        }
        // Shells commonly dup the descriptor returned for `> file`. Closing
        // the original descriptor sends FLUSH before the command writes to
        // stdout. Keep an O_TRUNC-only empty file local until a write, fsync,
        // or the final release so one shell overwrite creates one revision.
        let node = self.store.commit_content(open.content_mut())?;
        open.mark_committed();
        self.clear_staged_attributes(node.inode)?;
        drop(open);
        self.update_open_nodes(&node)?;
        self.forget_cached_attributes(node.inode);
        Ok(())
    }

    // While a file is being written, its size and time come from the local
    // staged copy, and Linux keeps that answer for a second. Saving the file
    // gives it the time Front recorded, and no reply carries that new time to
    // Linux. Without this, a program that reads the file right after writing it
    // sees the time change under it, which makes `tar` and `rsync` report that
    // the file changed while they were reading it.
    fn forget_cached_attributes(&self, inode: INodeNo) {
        let Some(notifier) = self.notifier.get() else {
            return;
        };
        // A negative offset drops the file details and keeps the contents that
        // Linux has cached, which the save did not change.
        if let Err(error) = notifier.inval_inode(inode, -1, 0) {
            debug!(
                inode = inode.0,
                %error,
                "could not drop the file details cached by Linux"
            );
        }
    }

    fn release_handle(&self, handle: u64) -> io::Result<()> {
        debug!(handle, "releasing filesystem handle");
        let inode = self.handle_inode(handle)?;
        // Keep remove, rename-over, and the final commit in one order. The
        // locked helper avoids taking this same lock a second time.
        let _inode = self.inode_locks.lock(inode)?;
        // Linux ignores errors returned by RELEASE. Written data and fsync
        // had the opportunity to report a failure. An O_TRUNC-only handle
        // reaches this final commit intentionally.
        let commit_result = self.commit_handle_locked(handle, true);
        let removed = self.handles.remove_file(handle)?;
        if commit_result.is_err() {
            self.clear_staged_attributes(inode)?;
            self.store.discard_content(inode)?;
        }
        drop(removed);
        debug!(
            handle,
            remaining_handles = self.handles.file_count()?,
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
        let inode = self.handle_inode(handle)?;
        let _inode = self.inode_locks.lock(inode)?;
        self.commit_handle_locked(handle, true)?;
        let shared = self.handles.file(handle)?;
        let open = lock_open_file(&shared)?;
        if data_only {
            open.sync_data()
        } else {
            open.sync_all()
        }
    }

    fn truncate_writable_node(&self, inode: INodeNo, size: u64) -> io::Result<Option<Node>> {
        for shared in self.handles.files_for_inode(inode)? {
            let mut open = shared.lock().map_err(|_| errno(libc::EIO))?;
            if !open.is_writable() {
                continue;
            }
            open.truncate(size)?;
            self.stage_attributes(inode, size)?;
            return Ok(Some(open.node().clone()));
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
                let shared = self.handles.file(handle.0)?;
                let mut open = lock_open_file(&shared)?;
                if open.inode() != inode || !open.is_writable() {
                    return Err(errno(libc::EBADF));
                }
                open.truncate(size)?;
                self.stage_attributes(inode, size)?;
            } else {
                // RELEASE takes the same lock before removing a handle. Take it
                // before the handle-table snapshot so we cannot resize an Arc
                // that RELEASE has already removed from the table.
                let _inode = self.inode_locks.lock(inode)?;
                local_node = self.truncate_writable_node(inode, size)?;
                if local_node.is_none() {
                    self.store.set_size(inode, size)?;
                }
            }
        }
        if let Some(mode) = mode {
            let current = self.node(inode)?;
            let permissions = executable_mode(current.kind, current.mode, mode)?;
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

    fn mark_unlinked(&self, inode: INodeNo) -> io::Result<()> {
        for open in self.handles.files_for_inode(inode)? {
            let mut open = open.lock().map_err(|_| errno(libc::EIO))?;
            open.mark_unlinked();
        }
        Ok(())
    }

    fn node_for_handle(&self, handle: u64, inode: INodeNo) -> io::Result<Node> {
        let shared = self.handles.file(handle)?;
        let open = lock_open_file(&shared)?;
        self.node_of_open_file(&open, inode)
    }

    // Reads the file details of an open handle without waiting for a commit
    // that may be uploading through it. `None` asks the caller to read the
    // shared file details instead, which report the same staged size.
    fn node_for_free_handle(&self, handle: u64, inode: INodeNo) -> io::Result<Option<Node>> {
        let shared = self.handles.file(handle)?;
        let open = match shared.try_lock() {
            Ok(open) => open,
            Err(TryLockError::WouldBlock) => return Ok(None),
            Err(TryLockError::Poisoned(_)) => return Err(errno(libc::EIO)),
        };
        self.node_of_open_file(&open, inode).map(Some)
    }

    fn node_of_open_file(&self, open: &OpenFile, inode: INodeNo) -> io::Result<Node> {
        if open.inode() != inode {
            return Err(errno(libc::EBADF));
        }
        let mut node = open.node().clone();
        self.apply_staged_attributes(&mut node)?;
        Ok(node)
    }

    fn update_open_nodes(&self, node: &Node) -> io::Result<()> {
        for open in self.handles.files_for_inode(node.inode)? {
            let mut open = open.lock().map_err(|_| errno(libc::EIO))?;
            if !open.is_unlinked() {
                open.replace_node(node.clone());
            }
        }
        Ok(())
    }
}

// Waits until the handle is free. A commit holds it while it uploads the staged
// file, so a write or a truncate that arrives during that upload waits here.
// Waiting is what a local filesystem does, and it also keeps the bytes being
// uploaded unchanged until the upload finishes.
fn lock_open_file(shared: &Arc<Mutex<OpenFile>>) -> io::Result<MutexGuard<'_, OpenFile>> {
    shared.lock().map_err(|_| errno(libc::EIO))
}
