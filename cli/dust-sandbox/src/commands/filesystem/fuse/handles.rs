//! Keeps the state Linux expects us to remember between OPEN and RELEASE.
//!
//! Linux gives later READ, WRITE, FLUSH, and RELEASE calls a temporary handle
//! number. This file maps that number to the local file and its unsaved state.
//! It also keeps directory listings stable while READDIR returns them over
//! several calls, and prevents two operations from changing one inode at once.

use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io;
use std::os::unix::fs::FileExt;
use std::sync::{Arc, Mutex, MutexGuard};

use fuser::INodeNo;

use super::super::errno;
use super::super::store::{Node, OpenedContent};

pub(super) struct OpenFile {
    content: OpenedContent,
    dirty: bool,
    defer_truncate_commit: bool,
    unlinked: bool,
}

impl OpenFile {
    pub fn new(content: OpenedContent, truncated: bool) -> Self {
        Self {
            content,
            dirty: truncated,
            defer_truncate_commit: truncated,
            unlinked: false,
        }
    }

    pub fn inode(&self) -> INodeNo {
        self.content.node.inode
    }

    pub fn is_writable(&self) -> bool {
        self.content.is_writable()
    }

    pub fn node(&self) -> &Node {
        &self.content.node
    }

    fn duplicate_file(&self) -> io::Result<File> {
        self.content.file.try_clone()
    }

    pub fn record_write(&mut self, offset: u64, bytes: &[u8]) -> io::Result<(usize, u64)> {
        let written = self.content.file.write_at(bytes, offset)?;
        // pwrite already changed the staged file. Mark it dirty before any
        // fallible size calculation so RELEASE cannot trust unpublished bytes.
        self.dirty = true;
        self.defer_truncate_commit = false;
        let end = offset
            .checked_add(u64::try_from(written).map_err(|_| errno(libc::EOVERFLOW))?)
            .ok_or_else(|| errno(libc::EOVERFLOW))?;
        self.content.node.size = self.content.node.size.max(end);
        Ok((written, self.content.node.size))
    }

    pub fn truncate(&mut self, size: u64) -> io::Result<()> {
        self.content.set_len(size)?;
        self.dirty = true;
        self.defer_truncate_commit = false;
        Ok(())
    }

    pub fn sync_data(&self) -> io::Result<()> {
        self.content.file.sync_data()
    }

    pub fn sync_all(&self) -> io::Result<()> {
        self.content.file.sync_all()
    }

    pub fn content_mut(&mut self) -> &mut OpenedContent {
        &mut self.content
    }

    pub fn needs_commit(&self, include_deferred_truncate: bool) -> bool {
        self.dirty && !self.unlinked && (include_deferred_truncate || !self.defer_truncate_commit)
    }

    pub fn mark_committed(&mut self) {
        self.dirty = false;
        self.defer_truncate_commit = false;
    }

    pub fn mark_unlinked(&mut self) {
        self.unlinked = true;
    }

    pub fn is_unlinked(&self) -> bool {
        self.unlinked
    }

    pub fn replace_node(&mut self, node: Node) {
        self.content.node = node;
    }
}

#[derive(Clone)]
pub(super) struct DirectoryEntry {
    pub inode: INodeNo,
    pub kind: super::super::store::NodeKind,
    pub name: String,
}

struct HandleState {
    next: u64,
    files: HashMap<u64, Arc<Mutex<OpenFile>>>,
    local_files: HashMap<u64, Arc<File>>,
    file_inodes: HashMap<u64, INodeNo>,
    files_by_inode: HashMap<INodeNo, HashSet<u64>>,
    directories: HashMap<u64, Arc<[DirectoryEntry]>>,
    directory_entries: usize,
}

pub(super) struct HandleTable {
    state: Mutex<HandleState>,
}

// A final commit may hold one stripe while it calls Front and GCS. A larger
// fixed set keeps the memory bounded while making unrelated collisions rare.
const INODE_LOCK_STRIPES: usize = 1024;
const MAX_OPEN_DIRECTORY_ENTRIES: usize = 200_000;
const MAX_OPEN_FILE_HANDLES: usize = 4096;
const MAX_OPEN_DIRECTORY_HANDLES: usize = 1024;

pub(super) struct InodeLocks {
    locks: [Mutex<()>; INODE_LOCK_STRIPES],
}

impl InodeLocks {
    pub fn new() -> Self {
        Self {
            locks: std::array::from_fn(|_| Mutex::new(())),
        }
    }

    pub fn lock(&self, inode: INodeNo) -> io::Result<MutexGuard<'_, ()>> {
        self.locks[inode.0 as usize % self.locks.len()]
            .lock()
            .map_err(|_| errno(libc::EIO))
    }
}

impl HandleTable {
    pub fn new() -> Self {
        Self {
            state: Mutex::new(HandleState {
                next: 1,
                files: HashMap::new(),
                local_files: HashMap::new(),
                file_inodes: HashMap::new(),
                files_by_inode: HashMap::new(),
                directories: HashMap::new(),
                directory_entries: 0,
            }),
        }
    }

    pub fn insert_file(&self, open: OpenFile) -> io::Result<u64> {
        let inode = open.inode();
        // try_clone duplicates the Linux file descriptor, not the file bytes.
        // READ uses this descriptor without taking the OpenFile mutex. Large
        // reads may arrive in parallel, and a remote commit may hold that
        // mutex while it uploads bytes.
        let local_file = Arc::new(open.duplicate_file()?);
        let mut state = self.state()?;
        if state.files.len() >= MAX_OPEN_FILE_HANDLES {
            return Err(errno(libc::EMFILE));
        }
        let handle = Self::allocate(&mut state)?;
        state.files.insert(handle, Arc::new(Mutex::new(open)));
        state.local_files.insert(handle, local_file);
        state.file_inodes.insert(handle, inode);
        state
            .files_by_inode
            .entry(inode)
            .or_default()
            .insert(handle);
        Ok(handle)
    }

    pub fn file(&self, handle: u64) -> io::Result<Arc<Mutex<OpenFile>>> {
        self.state()?
            .files
            .get(&handle)
            .cloned()
            .ok_or_else(|| errno(libc::EBADF))
    }

    pub fn local_file(&self, handle: u64) -> io::Result<Arc<File>> {
        self.state()?
            .local_files
            .get(&handle)
            .cloned()
            .ok_or_else(|| errno(libc::EBADF))
    }

    pub fn files_for_inode(&self, inode: INodeNo) -> io::Result<Vec<Arc<Mutex<OpenFile>>>> {
        let state = self.state()?;
        let Some(handles) = state.files_by_inode.get(&inode) else {
            return Ok(Vec::new());
        };
        Ok(handles
            .iter()
            .filter_map(|handle| state.files.get(handle).cloned())
            .collect())
    }

    pub fn remove_file(&self, handle: u64) -> io::Result<Option<Arc<Mutex<OpenFile>>>> {
        let mut state = self.state()?;
        let removed = state.files.remove(&handle);
        state.local_files.remove(&handle);
        if let Some(inode) = state.file_inodes.remove(&handle) {
            if let Some(handles) = state.files_by_inode.get_mut(&inode) {
                handles.remove(&handle);
                if handles.is_empty() {
                    state.files_by_inode.remove(&inode);
                }
            }
        }
        Ok(removed)
    }

    pub fn insert_directory(&self, entries: Vec<DirectoryEntry>) -> io::Result<u64> {
        let mut state = self.state()?;
        if state.directories.len() >= MAX_OPEN_DIRECTORY_HANDLES {
            return Err(errno(libc::EMFILE));
        }
        let total = state
            .directory_entries
            .checked_add(entries.len())
            .ok_or_else(|| errno(libc::EMFILE))?;
        if total > MAX_OPEN_DIRECTORY_ENTRIES {
            return Err(errno(libc::EMFILE));
        }
        let handle = Self::allocate(&mut state)?;
        state.directories.insert(handle, entries.into());
        state.directory_entries = total;
        Ok(handle)
    }

    pub fn directory(&self, handle: u64) -> io::Result<Arc<[DirectoryEntry]>> {
        self.state()?
            .directories
            .get(&handle)
            .cloned()
            .ok_or_else(|| errno(libc::EBADF))
    }

    pub fn remove_directory(&self, handle: u64) -> io::Result<()> {
        let mut state = self.state()?;
        let Some(entries) = state.directories.remove(&handle) else {
            return Err(errno(libc::EBADF));
        };
        state.directory_entries = state
            .directory_entries
            .checked_sub(entries.len())
            .ok_or_else(|| errno(libc::EIO))?;
        Ok(())
    }

    pub fn file_count(&self) -> io::Result<usize> {
        Ok(self.state()?.files.len())
    }

    fn allocate(state: &mut HandleState) -> io::Result<u64> {
        let handle = state.next;
        state.next = state
            .next
            .checked_add(1)
            .ok_or_else(|| errno(libc::EMFILE))?;
        Ok(handle)
    }

    fn state(&self) -> io::Result<MutexGuard<'_, HandleState>> {
        self.state.lock().map_err(|_| errno(libc::EIO))
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{mpsc, Arc, Barrier};
    use std::time::Duration;

    use fuser::INodeNo;

    use super::{DirectoryEntry, HandleTable, InodeLocks};
    use crate::commands::filesystem::store::NodeKind;

    #[test]
    fn directory_handles_keep_one_snapshot_until_release() {
        let handles = HandleTable::new();
        let handle = handles
            .insert_directory(vec![DirectoryEntry {
                inode: INodeNo(7),
                kind: NodeKind::File,
                name: "first".to_owned(),
            }])
            .expect("insert directory");

        let entries = handles.directory(handle).expect("directory snapshot");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "first");

        handles.remove_directory(handle).expect("release directory");
        assert!(handles.directory(handle).is_err());
    }

    #[test]
    fn inode_lock_waits_for_the_current_operation() {
        let locks = Arc::new(InodeLocks::new());
        let inode = INodeNo(42);
        let current = locks.lock(inode).expect("lock inode");
        let ready = Arc::new(Barrier::new(2));
        let (acquired_tx, acquired_rx) = mpsc::channel();

        let waiter_locks = Arc::clone(&locks);
        let waiter_ready = Arc::clone(&ready);
        let waiter = std::thread::spawn(move || {
            waiter_ready.wait();
            let _guard = waiter_locks.lock(inode).expect("wait for inode");
            acquired_tx.send(()).expect("report acquired lock");
        });

        ready.wait();
        assert!(acquired_rx.try_recv().is_err());
        drop(current);
        acquired_rx
            .recv_timeout(Duration::from_secs(1))
            .expect("waiter acquires released inode");
        waiter.join().expect("join waiter");
    }
}
