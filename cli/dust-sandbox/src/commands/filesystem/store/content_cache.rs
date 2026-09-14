//! Keeps downloaded file contents in a private directory on the sandbox disk.
//!
//! An open handle keeps its local file in place, and only one writable handle
//! can exist for an inode at a time. When the cache is full, it removes the
//! least recently used files that are no longer open. After a daemon restart,
//! files left in this directory are removed because Front and GCS hold the
//! saved version.

use std::collections::HashSet;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::os::unix::fs::{MetadataExt, OpenOptionsExt, PermissionsExt};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};

use lru::LruCache;
use tracing::warn;

use super::{errno, is_writable, INodeNo, Node};

const CONTENT_CACHE_ENTRY_CAPACITY: usize = 4096;
// A cold open holds its stripe while content downloads. Keep enough stripes
// that an unrelated file is very unlikely to share that wait.
const CONTENT_LOCK_STRIPES: usize = 1024;
const CACHE_MARKER: &str = ".dust-filesystem-cache-v1";
// The marker is written under this name and then renamed, so a daemon that dies
// in between leaves this one file and startup knows it can remove it.
const CACHE_MARKER_TEMPORARY: &str = ".dust-filesystem-cache-v1.tmp";
const CACHE_MARKER_CONTENT: &[u8] = b"Dust filesystem staging directory\n";

#[derive(Clone, Debug)]
pub(super) struct CachedContent {
    pub(super) blob_id: Option<String>,
    pub(super) path: PathBuf,
    pub(super) size_bytes: u64,
    open_count: usize,
}

impl CachedContent {
    pub(super) fn new(blob_id: Option<String>, path: PathBuf, size_bytes: u64) -> Self {
        Self {
            blob_id,
            path,
            size_bytes,
            open_count: 0,
        }
    }
}

struct ContentCacheState {
    entries: LruCache<INodeNo, CachedContent>,
    writers: HashSet<INodeNo>,
    capacity_bytes: u64,
    cached_bytes: u64,
}

#[derive(Clone)]
pub(super) struct ContentCache {
    state: Arc<Mutex<ContentCacheState>>,
    locks: Arc<[Mutex<()>; CONTENT_LOCK_STRIPES]>,
}

pub struct OpenedContent {
    pub node: Node,
    pub file: File,
    pub(super) expected_blob_id: Option<String>,
    pub(super) content_type: String,
    lease: ContentLease,
}

struct ContentLease {
    cache: ContentCache,
    inode: INodeNo,
    writable: bool,
}

pub(super) struct OpenReservation {
    cache: ContentCache,
    inode: INodeNo,
    writable: bool,
    active: bool,
}

impl ContentCache {
    pub(super) fn new(capacity_bytes: u64) -> Self {
        Self {
            state: Arc::new(Mutex::new(ContentCacheState {
                entries: LruCache::unbounded(),
                writers: HashSet::new(),
                capacity_bytes,
                cached_bytes: 0,
            })),
            locks: Arc::new(std::array::from_fn(|_| Mutex::new(()))),
        }
    }

    pub(super) fn lock(&self, inode: INodeNo) -> io::Result<MutexGuard<'_, ()>> {
        self.locks[inode.0 as usize % self.locks.len()]
            .lock()
            .map_err(|_| errno(libc::EIO))
    }

    pub(super) fn is_current(&self, inode: INodeNo, blob_id: Option<&str>) -> io::Result<bool> {
        let state = self.state()?;
        Ok(state
            .entries
            .peek(&inode)
            .is_some_and(|cached| cached.blob_id.as_deref() == blob_id && cached.path.exists()))
    }

    pub(super) fn insert(&self, inode: INodeNo, mut cached: CachedContent) -> io::Result<()> {
        let mut state = self.state()?;
        if let Some(previous) = state.entries.pop(&inode) {
            cached.open_count = previous.open_count;
            state.cached_bytes = state
                .cached_bytes
                .checked_sub(previous.size_bytes)
                .ok_or_else(|| errno(libc::EIO))?;
        }
        let size_bytes = cached.size_bytes;
        state.entries.put(inode, cached);
        state.cached_bytes = state
            .cached_bytes
            .checked_add(size_bytes)
            .ok_or_else(|| errno(libc::EIO))?;
        Ok(())
    }

    pub(super) fn update(&self, inode: INodeNo, node: &Node, size_bytes: u64) -> io::Result<()> {
        let mut state = self.state()?;
        let previous_size = state.entries.peek(&inode).map(|cached| cached.size_bytes);
        if let Some(previous_size) = previous_size {
            state.cached_bytes = state
                .cached_bytes
                .checked_sub(previous_size)
                .and_then(|bytes| bytes.checked_add(size_bytes))
                .ok_or_else(|| errno(libc::EIO))?;
        }
        if let Some(cached) = state.entries.get_mut(&inode) {
            cached.blob_id = node.blob_id.clone();
            cached.size_bytes = size_bytes;
        }
        Self::trim_locked(&mut state)
    }

    pub(super) fn forget(&self, inode: INodeNo) -> io::Result<()> {
        let mut state = self.state()?;
        let Some(cached) = state.entries.pop(&inode) else {
            return Ok(());
        };
        match fs::remove_file(&cached.path) {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => {
                state.entries.put(inode, cached);
                return Err(error);
            }
        }
        state.cached_bytes = state
            .cached_bytes
            .checked_sub(cached.size_bytes)
            .ok_or_else(|| errno(libc::EIO))?;
        Ok(())
    }

    pub(super) fn discard(&self, inode: INodeNo) -> io::Result<()> {
        let mut state = self.state()?;
        let Some(cached) = state.entries.pop(&inode) else {
            return Ok(());
        };
        state.cached_bytes = state
            .cached_bytes
            .checked_sub(cached.size_bytes)
            .ok_or_else(|| errno(libc::EIO))?;
        match fs::remove_file(&cached.path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
            // Keep the entry invalid even if removing its local file fails.
            // A later open must fetch Front's committed version.
            Err(error) => Err(error),
        }
    }

    pub(super) fn reserve_open(
        &self,
        inode: INodeNo,
        writable: bool,
    ) -> io::Result<OpenReservation> {
        if writable && !self.state()?.writers.insert(inode) {
            return Err(errno(libc::EBUSY));
        }
        Ok(OpenReservation {
            cache: self.clone(),
            inode,
            writable,
            active: true,
        })
    }

    fn open(&self, inode: INodeNo, flags: i32, node: Node) -> io::Result<OpenedContent> {
        let mut state = self.state()?;
        let path = {
            let cached = state
                .entries
                .get_mut(&inode)
                .ok_or_else(|| errno(libc::EIO))?;
            cached.open_count = cached
                .open_count
                .checked_add(1)
                .ok_or_else(|| errno(libc::EIO))?;
            cached.path.clone()
        };
        let file = match open_staged_file(&path, flags) {
            Ok(file) => file,
            Err(error) => {
                Self::release_open(&mut state, inode)?;
                return Err(error);
            }
        };
        if let Err(error) = Self::trim_locked(&mut state) {
            Self::release_open(&mut state, inode)?;
            return Err(error);
        }
        Ok(OpenedContent {
            expected_blob_id: node.blob_id.clone(),
            content_type: node.content_type().to_owned(),
            node,
            file,
            lease: ContentLease {
                cache: self.clone(),
                inode,
                writable: is_writable(flags),
            },
        })
    }

    fn state(&self) -> io::Result<MutexGuard<'_, ContentCacheState>> {
        self.state.lock().map_err(|_| errno(libc::EIO))
    }

    fn release_open(state: &mut ContentCacheState, inode: INodeNo) -> io::Result<()> {
        let cached = state
            .entries
            .get_mut(&inode)
            .ok_or_else(|| errno(libc::EIO))?;
        cached.open_count = cached
            .open_count
            .checked_sub(1)
            .ok_or_else(|| errno(libc::EIO))?;
        Ok(())
    }

    fn trim_locked(state: &mut ContentCacheState) -> io::Result<()> {
        let mut retained = Vec::new();
        while state.cached_bytes > state.capacity_bytes
            || state.entries.len() + retained.len() > CONTENT_CACHE_ENTRY_CAPACITY
        {
            let Some((inode, cached)) = state.entries.pop_lru() else {
                break;
            };
            if cached.open_count > 0 {
                retained.push((inode, cached));
                continue;
            }
            match fs::remove_file(&cached.path) {
                Ok(()) => {}
                Err(error) if error.kind() == io::ErrorKind::NotFound => {}
                Err(error) => {
                    retained.push((inode, cached));
                    for (inode, cached) in retained {
                        state.entries.put(inode, cached);
                    }
                    return Err(error);
                }
            }
            state.cached_bytes = state
                .cached_bytes
                .checked_sub(cached.size_bytes)
                .ok_or_else(|| errno(libc::EIO))?;
        }
        for (inode, cached) in retained {
            state.entries.put(inode, cached);
        }
        Ok(())
    }
}

impl OpenReservation {
    pub(super) fn open(mut self, flags: i32, node: Node) -> io::Result<OpenedContent> {
        let opened = self.cache.open(self.inode, flags, node)?;
        // The content lease now owns the writer reservation.
        self.active = false;
        Ok(opened)
    }
}

impl Drop for OpenReservation {
    fn drop(&mut self) {
        if !self.active || !self.writable {
            return;
        }
        match self.cache.state() {
            Ok(mut state) => {
                state.writers.remove(&self.inode);
            }
            Err(error) => {
                warn!(inode = self.inode.0, %error, "failed to release filesystem writer");
            }
        }
    }
}

impl OpenedContent {
    pub fn is_writable(&self) -> bool {
        self.lease.writable
    }

    // Keep the node returned to Linux aligned with the staged file bytes.
    pub fn set_len(&mut self, size: u64) -> io::Result<()> {
        self.file.set_len(size)?;
        self.node.size = size;
        Ok(())
    }
}

impl Drop for ContentLease {
    fn drop(&mut self) {
        let result = (|| {
            let mut state = self.cache.state()?;
            if self.writable {
                state.writers.remove(&self.inode);
            }
            if state.entries.contains(&self.inode) {
                ContentCache::release_open(&mut state, self.inode)?;
            }
            ContentCache::trim_locked(&mut state)
        })();
        if let Err(error) = result {
            warn!(
                inode = self.inode.0,
                %error,
                "failed to release staged filesystem content"
            );
        }
    }
}

pub(super) fn prepare_staging_directory(path: &Path) -> io::Result<()> {
    let parent = path.parent().ok_or_else(|| errno(libc::EINVAL))?;
    let parent_metadata = fs::symlink_metadata(parent)?;
    if !parent_metadata.file_type().is_dir()
        || parent_metadata.uid() != unsafe { libc::geteuid() }
        || parent_metadata.permissions().mode() & 0o022 != 0
    {
        return Err(errno(libc::EACCES));
    }
    match fs::symlink_metadata(path) {
        Ok(_) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            fs::create_dir(path)?;
            fs::set_permissions(path, fs::Permissions::from_mode(0o700))?;
        }
        Err(error) => return Err(error),
    }
    let metadata = fs::symlink_metadata(path)?;
    if !metadata.file_type().is_dir() {
        return Err(errno(libc::ENOTDIR));
    }
    if metadata.uid() != unsafe { libc::geteuid() } || metadata.permissions().mode() & 0o077 != 0 {
        return Err(errno(libc::EACCES));
    }

    let entries = fs::read_dir(path)?.collect::<Result<Vec<_>, _>>()?;
    let mut marker_found = false;
    let mut managed_files = Vec::new();
    // Counted while scanning: these files only make sense in a directory this
    // cache has already claimed.
    let mut files_that_need_a_marker = 0_usize;
    for entry in entries {
        let name = entry.file_name();
        let name = name.to_str().ok_or_else(|| errno(libc::EACCES))?;
        if name == CACHE_MARKER {
            validate_cache_marker(&entry.path())?;
            marker_found = true;
            continue;
        }
        let entry_type = fs::symlink_metadata(entry.path())?.file_type();
        // The three kinds of file this cache creates: content staged for an
        // open file, a download still being written, and the marker on its way
        // into place.
        let staged_content = name.strip_prefix("inode-").is_some_and(|suffix| {
            !suffix.is_empty() && suffix.bytes().all(|byte| byte.is_ascii_digit())
        });
        let download_in_progress = name.starts_with(".tmp");
        let half_written_marker = name == CACHE_MARKER_TEMPORARY;
        if !(staged_content || download_in_progress || half_written_marker)
            || !(entry_type.is_file() || entry_type.is_symlink())
        {
            // Never clean an arbitrary private directory passed by mistake.
            return Err(errno(libc::EACCES));
        }
        if !half_written_marker {
            files_that_need_a_marker += 1;
        }
        managed_files.push(entry.path());
    }
    if !marker_found && files_that_need_a_marker > 0 {
        // With no marker, this cache never finished claiming the directory, so
        // its files belong to something else and must stay. The one exception is
        // the marker being written when the daemon died, handled below: staged
        // content only appears after a startup that did write the marker.
        return Err(errno(libc::EACCES));
    }
    // The database and GCS are authoritative after a daemon crash. Only names
    // created by this cache are removed; an unexpected name fails closed above.
    // This runs before the marker is written, because that write uses the same
    // name as the file a half-written marker leaves here.
    for managed_file in managed_files {
        fs::remove_file(managed_file)?;
    }
    if !marker_found {
        write_cache_marker(path)?;
    }
    Ok(())
}

fn write_cache_marker(path: &Path) -> io::Result<()> {
    // Write the whole marker under a second name and rename it into place, so
    // another startup finds either no marker or a complete one. The name is
    // fixed rather than random, because startup has to tell the file left by a
    // half-written marker apart from files it must not touch.
    let temporary = path.join(CACHE_MARKER_TEMPORARY);
    let mut marker = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o600)
        .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC)
        .open(&temporary)?;
    marker.write_all(CACHE_MARKER_CONTENT)?;
    marker.sync_data()?;
    drop(marker);
    fs::rename(&temporary, path.join(CACHE_MARKER))
}

fn validate_cache_marker(path: &Path) -> io::Result<()> {
    let mut marker = OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC)
        .open(path)?;
    let metadata = marker.metadata()?;
    if !metadata.file_type().is_file()
        || metadata.uid() != unsafe { libc::geteuid() }
        || metadata.permissions().mode() & 0o077 != 0
    {
        return Err(errno(libc::EACCES));
    }
    let mut content = Vec::new();
    marker.read_to_end(&mut content)?;
    if content != CACHE_MARKER_CONTENT {
        return Err(errno(libc::EACCES));
    }
    Ok(())
}

fn open_staged_file(path: &Path, flags: i32) -> io::Result<File> {
    let writable = is_writable(flags);
    let mut options = OpenOptions::new();
    options
        .read(true)
        .write(writable)
        // Cached content lives outside the FUSE tree. Never let an unexpected
        // local link turn a filesystem open into access to another host path.
        // Flags such as O_TRUNC and O_SYNC belong to the remote file,
        // not this private cache fd, and are handled or rejected by DustFuse.
        .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC);
    options.open(path)
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::io::Read;
    use std::os::unix::fs::{symlink, PermissionsExt};

    use tempfile::tempdir;

    use super::{
        open_staged_file, prepare_staging_directory, validate_cache_marker, CachedContent,
        ContentCache, CACHE_MARKER, CACHE_MARKER_CONTENT, CACHE_MARKER_TEMPORARY,
        CONTENT_CACHE_ENTRY_CAPACITY,
    };
    use crate::commands::filesystem::inode::INodeNo;
    use crate::commands::filesystem::store::{Node, NodeKind};

    fn node(inode: INodeNo, blob_id: &str, size: u64) -> Node {
        Node {
            inode,
            parent_inode: Some(INodeNo(2)),
            name: format!("inode-{}", inode.0),
            kind: NodeKind::File,
            mode: 0o644,
            size,
            created_at_ms: 0,
            modified_at_ms: 0,
            blob_id: Some(blob_id.to_owned()),
            content_type: None,
        }
    }

    #[test]
    fn staged_content_open_never_follows_a_symbolic_link() {
        let directory = tempdir().expect("temporary directory");
        let target = directory.path().join("target");
        let link = directory.path().join("inode-3");
        fs::write(&target, b"secret").expect("write target");
        symlink(&target, &link).expect("create link");

        let error = open_staged_file(&link, libc::O_RDONLY).expect_err("reject link");
        assert_eq!(error.raw_os_error(), Some(libc::ELOOP));
    }

    #[test]
    fn staging_startup_removes_files_left_by_a_previous_daemon() {
        let directory = tempdir().expect("temporary directory");
        let staging = directory.path().join("staging");
        fs::create_dir(&staging).expect("create staging");
        fs::set_permissions(&staging, fs::Permissions::from_mode(0o700)).expect("restrict staging");
        prepare_staging_directory(&staging).expect("claim staging directory");
        fs::write(staging.join("inode-3"), b"stale").expect("write stale inode");
        fs::write(staging.join(".tmp-content"), b"partial").expect("write temporary file");

        prepare_staging_directory(&staging).expect("prepare staging");

        let names = fs::read_dir(&staging)
            .expect("list staging")
            .map(|entry| entry.expect("staging entry").file_name())
            .collect::<Vec<_>>();
        assert_eq!(names, vec![std::ffi::OsString::from(CACHE_MARKER)]);
    }

    #[test]
    fn staging_startup_rejects_a_symbolic_link() {
        let directory = tempdir().expect("temporary directory");
        let target = directory.path().join("target");
        let staging = directory.path().join("staging");
        fs::create_dir(&target).expect("create target");
        symlink(&target, &staging).expect("create staging link");

        let error = prepare_staging_directory(&staging).expect_err("reject staging link");

        assert_eq!(error.raw_os_error(), Some(libc::ENOTDIR));
    }

    #[test]
    fn staging_startup_finishes_a_marker_left_half_written_by_a_crash() {
        let directory = tempdir().expect("temporary directory");
        let staging = directory.path().join("staging");
        fs::create_dir(&staging).expect("create staging");
        fs::set_permissions(&staging, fs::Permissions::from_mode(0o700)).expect("restrict staging");
        // What a daemon that died between writing the marker and renaming it
        // into place leaves behind. Refusing to start here would make the
        // staging directory unusable for good.
        fs::write(staging.join(CACHE_MARKER_TEMPORARY), CACHE_MARKER_CONTENT)
            .expect("write the half-written marker");

        prepare_staging_directory(&staging).expect("recover and claim the directory");

        let names = fs::read_dir(&staging)
            .expect("list staging")
            .map(|entry| entry.expect("staging entry").file_name())
            .collect::<Vec<_>>();
        assert_eq!(names, vec![std::ffi::OsString::from(CACHE_MARKER)]);
        validate_cache_marker(&staging.join(CACHE_MARKER)).expect("the marker is complete");
    }

    #[test]
    fn staging_startup_keeps_refusing_an_unmarked_directory_holding_other_files() {
        let directory = tempdir().expect("temporary directory");
        let staging = directory.path().join("staging");
        fs::create_dir(&staging).expect("create staging");
        fs::set_permissions(&staging, fs::Permissions::from_mode(0o700)).expect("restrict staging");
        // Staged content and download files only appear after a startup that
        // wrote the marker, so without one they came from somewhere else.
        fs::write(staging.join("inode-7"), b"content").expect("write staged content");
        fs::write(staging.join(".tmpAbC123"), b"download").expect("write a download file");

        let error = prepare_staging_directory(&staging).expect_err("refuse the directory");

        assert_eq!(error.raw_os_error(), Some(libc::EACCES));
        assert_eq!(
            fs::read(staging.join("inode-7")).expect("read staged content"),
            b"content"
        );
        assert_eq!(
            fs::read(staging.join(".tmpAbC123")).expect("read the download file"),
            b"download"
        );
    }

    #[test]
    fn staging_startup_never_cleans_an_unmarked_private_directory() {
        let directory = tempdir().expect("temporary directory");
        let staging = directory.path().join("staging");
        fs::create_dir(&staging).expect("create staging");
        fs::set_permissions(&staging, fs::Permissions::from_mode(0o700)).expect("restrict staging");
        let important = staging.join("important-key");
        fs::write(&important, b"keep me").expect("write important file");

        let error = prepare_staging_directory(&staging).expect_err("reject unrelated directory");

        assert_eq!(error.raw_os_error(), Some(libc::EACCES));
        assert_eq!(
            fs::read(&important).expect("read important file"),
            b"keep me"
        );
    }

    #[test]
    fn cache_keeps_each_file_pinned_before_another_open_can_trim_it() {
        let directory = tempdir().expect("temporary directory");
        let first_inode = INodeNo(3);
        let second_inode = INodeNo(4);
        let first_path = directory.path().join("inode-3");
        let second_path = directory.path().join("inode-4");
        fs::write(&first_path, b"one").expect("write first content");
        fs::write(&second_path, b"two").expect("write second content");
        let cache = ContentCache::new(3);
        cache
            .insert(
                first_inode,
                CachedContent::new(Some("first".to_owned()), first_path.clone(), 3),
            )
            .expect("insert first content");
        let mut first = cache
            .open(first_inode, libc::O_RDONLY, node(first_inode, "first", 3))
            .expect("open first content");

        cache
            .insert(
                second_inode,
                CachedContent::new(Some("second".to_owned()), second_path.clone(), 3),
            )
            .expect("insert second content");
        let second = cache
            .open(
                second_inode,
                libc::O_RDONLY,
                node(second_inode, "second", 3),
            )
            .expect("open second content");

        let mut bytes = Vec::new();
        first
            .file
            .read_to_end(&mut bytes)
            .expect("read first content");
        assert_eq!(bytes, b"one");
        assert!(first_path.exists());
        assert!(second_path.exists());

        drop(second);
        assert!(first_path.exists());
        assert!(!second_path.exists());
    }

    #[test]
    fn cache_allows_only_one_writable_open_per_inode() {
        let directory = tempdir().expect("temporary directory");
        let inode = INodeNo(3);
        let path = directory.path().join("inode-3");
        fs::write(&path, b"content").expect("write content");
        let cache = ContentCache::new(1024);
        cache
            .insert(inode, CachedContent::new(Some("blob".to_owned()), path, 7))
            .expect("insert content");
        let reservation = cache
            .reserve_open(inode, true)
            .expect("reserve first writer");
        let first = reservation
            .open(libc::O_RDWR, node(inode, "blob", 7))
            .expect("open first writer");

        let Err(error) = cache.reserve_open(inode, true) else {
            panic!("accepted a second writer");
        };
        assert_eq!(error.raw_os_error(), Some(libc::EBUSY));

        drop(first);
        let reservation = cache
            .reserve_open(inode, true)
            .expect("reserve writer after close");
        drop(reservation);
    }

    #[test]
    fn resizing_staged_content_updates_its_node_size() {
        let directory = tempdir().expect("temporary directory");
        let inode = INodeNo(3);
        let path = directory.path().join("inode-3");
        fs::write(&path, b"original").expect("write content");
        let cache = ContentCache::new(1024);
        cache
            .insert(inode, CachedContent::new(Some("blob".to_owned()), path, 8))
            .expect("insert content");
        let reservation = cache.reserve_open(inode, true).expect("reserve writer");
        let mut opened = reservation
            .open(libc::O_RDWR, node(inode, "blob", 8))
            .expect("open content");

        opened.set_len(0).expect("truncate content");

        assert_eq!(opened.file.metadata().expect("content metadata").len(), 0);
        assert_eq!(opened.node.size, 0);
    }

    #[test]
    fn discard_never_reuses_bytes_from_a_failed_commit() {
        let directory = tempdir().expect("temporary directory");
        let inode = INodeNo(3);
        let path = directory.path().join("inode-3");
        fs::write(&path, b"unpublished").expect("write staged bytes");
        let cache = ContentCache::new(1024);
        cache
            .insert(
                inode,
                CachedContent::new(Some("committed-blob".to_owned()), path.clone(), 11),
            )
            .expect("insert content");

        cache.discard(inode).expect("discard content");

        assert!(!cache
            .is_current(inode, Some("committed-blob"))
            .expect("inspect cache"));
        assert!(!path.exists());
        let reservation = cache
            .reserve_open(inode, true)
            .expect("writer slot is reusable");
        drop(reservation);
    }

    #[test]
    fn cache_enforces_its_entry_limit_for_empty_files() {
        let directory = tempdir().expect("temporary directory");
        let cache = ContentCache::new(u64::MAX);
        for offset in 0..=CONTENT_CACHE_ENTRY_CAPACITY {
            let inode = INodeNo(u64::try_from(offset + 2).expect("inode"));
            cache
                .insert(
                    inode,
                    CachedContent::new(
                        None,
                        directory.path().join(format!("inode-{}", inode.0)),
                        0,
                    ),
                )
                .expect("insert empty content");
        }
        {
            let mut state = cache.state().expect("cache state");
            ContentCache::trim_locked(&mut state).expect("trim cache");
            assert_eq!(state.entries.len(), CONTENT_CACHE_ENTRY_CAPACITY);
        }
    }

    #[test]
    fn cache_trims_grown_content_when_its_open_lease_is_dropped() {
        let directory = tempdir().expect("temporary directory");
        let inode = INodeNo(3);
        let path = directory.path().join("inode-3");
        fs::write(&path, b"old").expect("write content");
        let cache = ContentCache::new(3);
        cache
            .insert(
                inode,
                CachedContent::new(Some("old".to_owned()), path.clone(), 3),
            )
            .expect("insert content");
        let opened = cache
            .open(inode, libc::O_RDONLY, node(inode, "old", 3))
            .expect("open content");
        fs::write(&path, b"larger").expect("grow content");
        cache
            .update(inode, &node(inode, "new", 6), 6)
            .expect("update cache size");
        assert!(path.exists());

        drop(opened);
        assert!(!path.exists());
    }
}
