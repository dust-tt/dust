use std::collections::{HashMap, HashSet};
use std::fs::{self, File, OpenOptions};
use std::io::{self, Seek, SeekFrom};
use std::num::NonZeroUsize;
use std::os::unix::fs::{MetadataExt, OpenOptionsExt, PermissionsExt};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};

use lru::LruCache;
use tempfile::NamedTempFile;
use uuid::Uuid;

use super::client::{FileSystemClient, NodeKind as RemoteNodeKind, RemoteNode};
use super::inode::{inode_for_node_id, node_id_for_inode, INodeNo};

pub const FUSE_ROOT_INODE: INodeNo = INodeNo::ROOT;
const DEFAULT_CONTENT_TYPE: &str = "application/octet-stream";
const METADATA_CACHE_TTL: Duration = Duration::from_secs(1);
const NODE_CACHE_CAPACITY: usize = 4096;
const DIRECTORY_CACHE_CAPACITY: usize = 256;
const DIRECTORY_ENTRY_CACHE_CAPACITY: usize = 8192;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum NodeKind {
    File,
    Directory,
}

#[derive(Clone, Debug)]
pub struct Node {
    pub inode: INodeNo,
    pub parent_inode: Option<INodeNo>,
    pub name: String,
    pub kind: NodeKind,
    pub mode: u16,
    pub size: u64,
    pub created_at_ms: i64,
    pub modified_at_ms: i64,
    blob_id: Option<String>,
    content_type: Option<String>,
}

impl Node {
    pub fn blob_id(&self) -> Option<&str> {
        self.blob_id.as_deref()
    }

    pub fn content_type(&self) -> &str {
        self.content_type.as_deref().unwrap_or(DEFAULT_CONTENT_TYPE)
    }
}

pub struct OpenedContent {
    pub node: Node,
    pub file: File,
    pub expected_blob_id: Option<String>,
    pub content_type: String,
}

#[derive(Clone, Debug)]
struct CachedContent {
    blob_id: Option<String>,
    path: PathBuf,
    size_bytes: u64,
    last_access: u64,
}

struct ContentCache {
    entries: HashMap<INodeNo, CachedContent>,
    capacity_bytes: u64,
    cached_bytes: u64,
    access_sequence: u64,
}

#[derive(Clone)]
struct CachedNode {
    node: Node,
    validated_at: Instant,
}

#[derive(Clone)]
struct CachedDirectory {
    children: Vec<Node>,
    validated_at: Instant,
}

struct MetadataCache {
    nodes: LruCache<INodeNo, CachedNode>,
    directories: LruCache<INodeNo, CachedDirectory>,
    directory_entries: usize,
}

impl MetadataCache {
    fn new() -> io::Result<Self> {
        let node_capacity =
            NonZeroUsize::new(NODE_CACHE_CAPACITY).ok_or_else(|| errno(libc::EINVAL))?;
        let directory_capacity =
            NonZeroUsize::new(DIRECTORY_CACHE_CAPACITY).ok_or_else(|| errno(libc::EINVAL))?;
        Ok(Self {
            nodes: LruCache::new(node_capacity),
            directories: LruCache::new(directory_capacity),
            directory_entries: 0,
        })
    }
}

pub struct FileStore {
    client: FileSystemClient,
    staging_dir: PathBuf,
    roots: Vec<Node>,
    cache: Mutex<ContentCache>,
    // Match the one-second FUSE attribute TTL so repeated opens and readdir
    // stay local without extending the period in which another writer is hidden.
    metadata: Mutex<MetadataCache>,
    // A fixed number of stripes prevents two downloads of the same inode from
    // replacing each other's cache file without growing one lock per file.
    // Different files can still download and upload in parallel.
    content_locks: [Mutex<()>; 64],
}

impl FileStore {
    pub fn staging_dir(&self) -> &Path {
        &self.staging_dir
    }

    pub fn open(
        staging_dir: &Path,
        api_url: &str,
        workspace_id: &str,
        token: String,
        token_file: PathBuf,
        cache_capacity_bytes: u64,
    ) -> io::Result<Self> {
        prepare_staging_directory(staging_dir)?;
        let client = FileSystemClient::new(api_url, workspace_id, token, token_file)?;
        let roots = client
            .initialize()?
            .into_iter()
            .map(Node::from_remote)
            .collect::<io::Result<Vec<_>>>()?;
        Ok(Self {
            client,
            staging_dir: staging_dir.to_path_buf(),
            roots,
            cache: Mutex::new(ContentCache {
                entries: HashMap::new(),
                capacity_bytes: cache_capacity_bytes,
                cached_bytes: 0,
                access_sequence: 0,
            }),
            metadata: Mutex::new(MetadataCache::new()?),
            content_locks: std::array::from_fn(|_| Mutex::new(())),
        })
    }

    pub fn node(&self, inode: INodeNo) -> io::Result<Node> {
        if inode == FUSE_ROOT_INODE {
            return Ok(Node::root());
        }
        if let Some(node) = self.cached_node(inode)? {
            return Ok(node);
        }
        let node = Node::from_remote(self.client.node(node_id_for_inode(inode)?)?)?;
        self.cache_node(node.clone())?;
        Ok(node)
    }

    pub fn lookup(&self, parent_inode: INodeNo, name: &str) -> io::Result<Node> {
        validate_name(name)?;
        if parent_inode == FUSE_ROOT_INODE {
            return self.root_by_name(name).ok_or_else(|| errno(libc::ENOENT));
        }
        let node = Node::from_remote(self.client.lookup(node_id_for_inode(parent_inode)?, name)?)?;
        self.cache_node(node.clone())?;
        Ok(node)
    }

    pub fn children(&self, parent_inode: INodeNo) -> io::Result<Vec<Node>> {
        if parent_inode == FUSE_ROOT_INODE {
            let mut roots = self.roots.clone();
            for alias in ["conversation", "pod"] {
                if let Some(mut root) = self.root_by_name(alias) {
                    root.name = alias.to_owned();
                    roots.push(root);
                }
            }
            return Ok(roots);
        }
        if let Some(children) = self.cached_children(parent_inode)? {
            return Ok(children);
        }
        let children = self
            .client
            .children(node_id_for_inode(parent_inode)?)?
            .into_iter()
            .map(Node::from_remote)
            .collect::<io::Result<Vec<_>>>()?;
        self.cache_children(parent_inode, children.clone())?;
        Ok(children)
    }

    fn root_by_name(&self, name: &str) -> Option<Node> {
        self.roots
            .iter()
            .find(|root| root.name == name)
            .or_else(|| match name {
                // Keep the paths used in prompts and older tools while the canonical
                // root names continue to include their stable Dust identifiers.
                "conversation" => self
                    .roots
                    .iter()
                    .find(|root| root.name.starts_with("conversation-")),
                "pod" => self.roots.iter().find(|root| root.name.starts_with("pod-")),
                _ => None,
            })
            .cloned()
    }

    pub fn create_file(&self, parent_inode: INodeNo, name: &str, mode: u16) -> io::Result<Node> {
        self.create_node(parent_inode, name, mode, RemoteNodeKind::File)
    }

    pub fn create_directory(
        &self,
        parent_inode: INodeNo,
        name: &str,
        mode: u16,
    ) -> io::Result<Node> {
        self.create_node(parent_inode, name, mode, RemoteNodeKind::Directory)
    }

    fn create_node(
        &self,
        parent_inode: INodeNo,
        name: &str,
        mode: u16,
        kind: RemoteNodeKind,
    ) -> io::Result<Node> {
        validate_name(name)?;
        if parent_inode == FUSE_ROOT_INODE {
            return Err(errno(libc::EPERM));
        }
        let node = Node::from_remote(self.client.create(
            &Uuid::new_v4().to_string(),
            node_id_for_inode(parent_inode)?,
            name,
            kind,
            mode,
        )?)?;
        self.invalidate_directory(parent_inode)?;
        self.cache_node(node.clone())?;
        Ok(node)
    }

    pub fn remove_file(&self, parent_inode: INodeNo, name: &str) -> io::Result<()> {
        let node = self.lookup(parent_inode, name)?;
        if node.kind != NodeKind::File {
            return Err(errno(libc::EISDIR));
        }
        self.remove(parent_inode, name, node.inode, RemoteNodeKind::File)
    }

    pub fn remove_directory(&self, parent_inode: INodeNo, name: &str) -> io::Result<()> {
        let node = self.lookup(parent_inode, name)?;
        if node.kind != NodeKind::Directory {
            return Err(errno(libc::ENOTDIR));
        }
        self.remove(parent_inode, name, node.inode, RemoteNodeKind::Directory)
    }

    fn remove(
        &self,
        parent_inode: INodeNo,
        name: &str,
        inode: INodeNo,
        kind: RemoteNodeKind,
    ) -> io::Result<()> {
        if parent_inode == FUSE_ROOT_INODE {
            return Err(errno(libc::EPERM));
        }
        self.client.remove(
            &Uuid::new_v4().to_string(),
            node_id_for_inode(parent_inode)?,
            name,
            kind,
        )?;
        self.invalidate_node(inode)?;
        self.invalidate_directory(parent_inode)?;
        self.forget_content(inode);
        Ok(())
    }

    pub fn forget_content(&self, inode: INodeNo) {
        if let Ok(mut cache) = self.cache() {
            let _ = Self::remove_cached_content(&mut cache, inode);
        }
    }

    pub fn rename(
        &self,
        parent_inode: INodeNo,
        name: &str,
        new_parent_inode: INodeNo,
        new_name: &str,
    ) -> io::Result<Node> {
        validate_name(name)?;
        validate_name(new_name)?;
        if parent_inode == FUSE_ROOT_INODE || new_parent_inode == FUSE_ROOT_INODE {
            return Err(errno(libc::EPERM));
        }
        let node = Node::from_remote(self.client.rename(
            &Uuid::new_v4().to_string(),
            node_id_for_inode(parent_inode)?,
            name,
            node_id_for_inode(new_parent_inode)?,
            new_name,
        )?)?;
        self.invalidate_directory(parent_inode)?;
        self.invalidate_directory(new_parent_inode)?;
        self.cache_node(node.clone())?;
        Ok(node)
    }

    pub fn set_mode(&self, inode: INodeNo, mode: u16) -> io::Result<Node> {
        if inode == FUSE_ROOT_INODE {
            return Err(errno(libc::EPERM));
        }
        let node = Node::from_remote(
            self.client
                .set_executable_bits(node_id_for_inode(inode)?, mode & 0o111)?,
        )?;
        self.cache_node(node.clone())?;
        Ok(node)
    }

    pub fn open_content(
        &self,
        inode: INodeNo,
        flags: i32,
        pinned_inodes: &HashSet<INodeNo>,
    ) -> io::Result<OpenedContent> {
        let _content = self.content_lock(inode)?;
        let mut node = self.node(inode)?;
        if node.kind != NodeKind::File {
            return Err(errno(libc::EISDIR));
        }
        let node_id = node_id_for_inode(node.inode)?;
        let cache_current = {
            let cache = self.cache()?;
            cache
                .entries
                .get(&inode)
                .map(|cached| cached.blob_id == node.blob_id && cached.path.exists())
                .unwrap_or(false)
        };
        if !cache_current {
            let mut temporary = NamedTempFile::new_in(&self.staging_dir)?;
            let mut opened_node = node.clone();
            if node.blob_id.is_some() {
                let content = self.client.content(node_id)?;
                if let Some(url) = content.download_url.as_deref() {
                    self.client.download(url, temporary.as_file_mut())?;
                }
                opened_node.blob_id = content.blob_id;
                if content.content_type.is_some() {
                    opened_node.content_type = content.content_type;
                }
            }
            temporary.as_file_mut().sync_data()?;
            let size_bytes = temporary.as_file().metadata()?.len();
            opened_node.size = size_bytes;
            let path = self.content_path(inode);
            temporary.persist(&path).map_err(|error| error.error)?;
            self.insert_cached_content(
                inode,
                CachedContent {
                    blob_id: opened_node.blob_id.clone(),
                    path,
                    size_bytes,
                    last_access: 0,
                },
            )?;
            self.cache_node(opened_node.clone())?;
            node = opened_node;
        } else {
            self.touch_cached_content(inode)?;
        }

        let mut protected_inodes = pinned_inodes.clone();
        protected_inodes.insert(inode);
        self.trim_cache(&protected_inodes)?;

        let path = self
            .cache()?
            .entries
            .get(&inode)
            .map(|cached| cached.path.clone())
            .ok_or_else(|| errno(libc::EIO))?;
        let file = open_staged_file(&path, flags)?;
        Ok(OpenedContent {
            expected_blob_id: node.blob_id.clone(),
            content_type: node.content_type().to_owned(),
            node,
            file,
        })
    }

    pub fn set_size(&self, inode: INodeNo, size: u64) -> io::Result<Node> {
        let opened = self.open_content(inode, libc::O_RDWR, &HashSet::new())?;
        opened.file.set_len(size)?;
        opened.file.sync_data()?;
        self.commit_content(
            inode,
            opened.expected_blob_id.as_deref(),
            &opened.content_type,
            &opened.file,
        )
    }

    pub fn commit_content(
        &self,
        inode: INodeNo,
        expected_blob_id: Option<&str>,
        content_type: &str,
        file: &File,
    ) -> io::Result<Node> {
        let node_id = node_id_for_inode(inode)?;
        file.sync_data()?;
        let size = file.metadata()?.len();
        let upload = self
            .client
            .prepare_upload(node_id, expected_blob_id, size, content_type)?;
        let mut upload_file = file.try_clone()?;
        upload_file.seek(SeekFrom::Start(0))?;
        self.client.upload(&upload, upload_file, size)?;
        let remote = self
            .client
            .commit_upload(node_id, expected_blob_id, &upload, size)?;
        let node = Node::from_remote(remote)?;
        self.update_cached_content(inode, &node, size)?;
        self.cache_node(node.clone())?;
        Ok(node)
    }

    pub fn trim_cache(&self, pinned_inodes: &HashSet<INodeNo>) -> io::Result<()> {
        let mut cache = self.cache()?;
        while cache.cached_bytes > cache.capacity_bytes {
            let candidate = cache
                .entries
                .iter()
                .filter(|(inode, _)| !pinned_inodes.contains(inode))
                .min_by_key(|(_, cached)| cached.last_access)
                .map(|(inode, _)| *inode);
            let Some(inode) = candidate else {
                // Open files are allowed to exceed the cache cap temporarily.
                break;
            };
            Self::remove_cached_content(&mut cache, inode)?;
        }
        Ok(())
    }

    fn insert_cached_content(&self, inode: INodeNo, mut cached: CachedContent) -> io::Result<()> {
        let mut cache = self.cache()?;
        cache.access_sequence = cache.access_sequence.saturating_add(1);
        cached.last_access = cache.access_sequence;
        let size_bytes = cached.size_bytes;
        if let Some(previous) = cache.entries.insert(inode, cached) {
            cache.cached_bytes = cache.cached_bytes.saturating_sub(previous.size_bytes);
        }
        cache.cached_bytes = cache.cached_bytes.saturating_add(size_bytes);
        Ok(())
    }

    fn touch_cached_content(&self, inode: INodeNo) -> io::Result<()> {
        let mut cache = self.cache()?;
        cache.access_sequence = cache.access_sequence.saturating_add(1);
        let access_sequence = cache.access_sequence;
        if let Some(cached) = cache.entries.get_mut(&inode) {
            cached.last_access = access_sequence;
        }
        Ok(())
    }

    fn update_cached_content(
        &self,
        inode: INodeNo,
        node: &Node,
        size_bytes: u64,
    ) -> io::Result<()> {
        let mut cache = self.cache()?;
        cache.access_sequence = cache.access_sequence.saturating_add(1);
        let access_sequence = cache.access_sequence;
        let previous_size = cache.entries.get(&inode).map(|cached| cached.size_bytes);
        if let Some(previous_size) = previous_size {
            cache.cached_bytes = cache.cached_bytes.saturating_sub(previous_size);
            cache.cached_bytes = cache.cached_bytes.saturating_add(size_bytes);
        }
        if let Some(cached) = cache.entries.get_mut(&inode) {
            cached.blob_id = node.blob_id.clone();
            cached.size_bytes = size_bytes;
            cached.last_access = access_sequence;
        }
        Ok(())
    }

    fn remove_cached_content(cache: &mut ContentCache, inode: INodeNo) -> io::Result<()> {
        let Some(cached) = cache.entries.get(&inode) else {
            return Ok(());
        };
        match fs::remove_file(&cached.path) {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
        let removed = cache.entries.remove(&inode);
        if let Some(removed) = removed {
            cache.cached_bytes = cache.cached_bytes.saturating_sub(removed.size_bytes);
        }
        Ok(())
    }

    fn cache(&self) -> io::Result<MutexGuard<'_, ContentCache>> {
        self.cache.lock().map_err(|_| errno(libc::EIO))
    }

    fn metadata(&self) -> io::Result<MutexGuard<'_, MetadataCache>> {
        self.metadata.lock().map_err(|_| errno(libc::EIO))
    }

    fn cached_node(&self, inode: INodeNo) -> io::Result<Option<Node>> {
        let mut metadata = self.metadata()?;
        match metadata.nodes.get(&inode).cloned() {
            Some(cached) if cached.validated_at.elapsed() <= METADATA_CACHE_TTL => {
                Ok(Some(cached.node))
            }
            Some(_) => {
                metadata.nodes.pop(&inode);
                Ok(None)
            }
            None => Ok(None),
        }
    }

    fn cache_node(&self, node: Node) -> io::Result<()> {
        let mut metadata = self.metadata()?;
        metadata.nodes.put(
            node.inode,
            CachedNode {
                node,
                validated_at: Instant::now(),
            },
        );
        Ok(())
    }

    fn cached_children(&self, parent_inode: INodeNo) -> io::Result<Option<Vec<Node>>> {
        let mut metadata = self.metadata()?;
        match metadata.directories.get(&parent_inode).cloned() {
            Some(cached) if cached.validated_at.elapsed() <= METADATA_CACHE_TTL => {
                Ok(Some(cached.children))
            }
            Some(_) => {
                if let Some(expired) = metadata.directories.pop(&parent_inode) {
                    metadata.directory_entries = metadata
                        .directory_entries
                        .saturating_sub(expired.children.len());
                }
                Ok(None)
            }
            None => Ok(None),
        }
    }

    fn cache_children(&self, parent_inode: INodeNo, children: Vec<Node>) -> io::Result<()> {
        let mut metadata = self.metadata()?;
        for child in &children {
            metadata.nodes.put(
                child.inode,
                CachedNode {
                    node: child.clone(),
                    validated_at: Instant::now(),
                },
            );
        }
        let child_count = children.len();
        if let Some((_, previous)) = metadata.directories.push(
            parent_inode,
            CachedDirectory {
                children,
                validated_at: Instant::now(),
            },
        ) {
            metadata.directory_entries = metadata
                .directory_entries
                .saturating_sub(previous.children.len());
        }
        metadata.directory_entries = metadata.directory_entries.saturating_add(child_count);
        while metadata.directory_entries > DIRECTORY_ENTRY_CACHE_CAPACITY {
            if let Some((_, removed)) = metadata.directories.pop_lru() {
                metadata.directory_entries = metadata
                    .directory_entries
                    .saturating_sub(removed.children.len());
            } else {
                break;
            }
        }
        Ok(())
    }

    fn invalidate_node(&self, inode: INodeNo) -> io::Result<()> {
        let mut metadata = self.metadata()?;
        metadata.nodes.pop(&inode);
        if let Some(removed) = metadata.directories.pop(&inode) {
            metadata.directory_entries = metadata
                .directory_entries
                .saturating_sub(removed.children.len());
        }
        Ok(())
    }

    fn invalidate_directory(&self, inode: INodeNo) -> io::Result<()> {
        let mut metadata = self.metadata()?;
        if let Some(removed) = metadata.directories.pop(&inode) {
            metadata.directory_entries = metadata
                .directory_entries
                .saturating_sub(removed.children.len());
        }
        Ok(())
    }

    fn content_lock(&self, inode: INodeNo) -> io::Result<MutexGuard<'_, ()>> {
        self.content_locks[inode.0 as usize % self.content_locks.len()]
            .lock()
            .map_err(|_| errno(libc::EIO))
    }

    fn content_path(&self, inode: INodeNo) -> PathBuf {
        self.staging_dir.join(format!("inode-{}", inode.0))
    }
}

fn prepare_staging_directory(path: &Path) -> io::Result<()> {
    let created = match fs::symlink_metadata(path) {
        Ok(_) => false,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            fs::create_dir_all(path)?;
            fs::set_permissions(path, fs::Permissions::from_mode(0o700))?;
            true
        }
        Err(error) => return Err(error),
    };
    let metadata = fs::symlink_metadata(path)?;
    if !metadata.file_type().is_dir() {
        return Err(errno(libc::ENOTDIR));
    }
    if metadata.uid() != unsafe { libc::geteuid() }
        || (!created && metadata.permissions().mode() & 0o077 != 0)
    {
        return Err(errno(libc::EACCES));
    }

    // The database and GCS are authoritative after a daemon crash. Removing
    // old local files avoids accumulating abandoned cache entries and prevents
    // un-fsynced bytes from being mistaken for committed content on restart.
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        let entry_type = fs::symlink_metadata(entry.path())?.file_type();
        if entry_type.is_file() || entry_type.is_symlink() {
            fs::remove_file(entry.path())?;
        } else {
            return Err(errno(libc::EIO));
        }
    }
    Ok(())
}

fn open_staged_file(path: &Path, flags: i32) -> io::Result<File> {
    let writable = is_writable(flags);
    let mut options = OpenOptions::new();
    options
        .read(true)
        .write(writable)
        .append(flags & libc::O_APPEND != 0)
        // Cached content lives outside the FUSE tree. Never let an unexpected
        // local link turn a filesystem open into access to another host path.
        .custom_flags(
            flags & !(libc::O_ACCMODE | libc::O_CREAT | libc::O_EXCL)
                | libc::O_NOFOLLOW
                | libc::O_CLOEXEC,
        );
    options.open(path)
}

impl Node {
    fn root() -> Self {
        Self {
            inode: FUSE_ROOT_INODE,
            parent_inode: None,
            name: String::new(),
            kind: NodeKind::Directory,
            mode: 0o755,
            size: 0,
            created_at_ms: 0,
            modified_at_ms: 0,
            blob_id: None,
            content_type: None,
        }
    }

    fn from_remote(remote: RemoteNode) -> io::Result<Self> {
        let inode = inode_for_node_id(remote.id)?;
        let parent_inode = remote.parent_id.map(inode_for_node_id).transpose()?;
        Ok(Self {
            inode,
            parent_inode: Some(parent_inode.unwrap_or(FUSE_ROOT_INODE)),
            name: remote.name,
            kind: match remote.kind {
                RemoteNodeKind::File => NodeKind::File,
                RemoteNodeKind::Directory => NodeKind::Directory,
            },
            mode: remote.mode,
            size: remote.size,
            created_at_ms: remote.created_at_ms,
            modified_at_ms: remote.modified_at_ms,
            blob_id: remote.blob_id,
            content_type: remote.content_type,
        })
    }
}

pub fn is_writable(flags: i32) -> bool {
    matches!(flags & libc::O_ACCMODE, libc::O_WRONLY | libc::O_RDWR)
}

fn validate_name(name: &str) -> io::Result<()> {
    if name.is_empty() || name == "." || name == ".." || name.contains('/') {
        Err(errno(libc::EINVAL))
    } else {
        Ok(())
    }
}

fn errno(code: i32) -> io::Error {
    io::Error::from_raw_os_error(code)
}

#[cfg(test)]
mod tests {
    use std::collections::{HashMap, HashSet};
    use std::fs;
    use std::os::unix::fs::{symlink, PermissionsExt};
    use std::sync::Mutex;

    use tempfile::tempdir;

    use super::super::client::{FileSystemClient, NodeKind as RemoteNodeKind, RemoteNode};
    use super::super::inode::{inode_for_node_id, node_id_for_inode, INodeNo};
    use super::{
        open_staged_file, prepare_staging_directory, CachedContent, ContentCache, FileStore,
        MetadataCache, Node, NodeKind, FUSE_ROOT_INODE, NODE_CACHE_CAPACITY,
    };

    fn empty_store(staging_dir: &std::path::Path, cache_capacity_bytes: u64) -> FileStore {
        FileStore {
            client: FileSystemClient::new(
                "http://127.0.0.1:9",
                "workspace",
                "token".to_owned(),
                staging_dir.join("token"),
            )
            .expect("client"),
            staging_dir: staging_dir.to_path_buf(),
            roots: Vec::new(),
            cache: Mutex::new(ContentCache {
                entries: HashMap::new(),
                capacity_bytes: cache_capacity_bytes,
                cached_bytes: 0,
                access_sequence: 0,
            }),
            metadata: Mutex::new(MetadataCache::new().expect("metadata cache")),
            content_locks: std::array::from_fn(|_| Mutex::new(())),
        }
    }

    #[test]
    fn database_ids_and_parent_ids_are_encoded_as_inodes() {
        let node = Node::from_remote(RemoteNode {
            id: 1,
            parent_id: Some(1),
            name: "file.txt".to_owned(),
            kind: RemoteNodeKind::File,
            mode: 0o644,
            size: 0,
            content_type: None,
            blob_id: None,
            created_at_ms: 0,
            modified_at_ms: 0,
        })
        .expect("database node");
        assert_eq!(node.inode, inode_for_node_id(1).expect("node inode"));
        assert_eq!(
            node.parent_inode,
            Some(inode_for_node_id(1).expect("parent inode"))
        );
        assert_eq!(node_id_for_inode(node.inode).ok(), Some(1));
        assert_ne!(node.inode, FUSE_ROOT_INODE);
    }

    #[test]
    fn metadata_cache_is_bounded_and_directory_entries_can_be_invalidated() {
        let directory = tempdir().expect("temporary directory");
        let store = empty_store(directory.path(), 1024);
        let make_node = |id| Node {
            inode: INodeNo(id),
            parent_inode: Some(INodeNo(2)),
            name: format!("node-{id}"),
            kind: NodeKind::File,
            mode: 0o644,
            size: 0,
            created_at_ms: 0,
            modified_at_ms: 0,
            blob_id: None,
            content_type: None,
        };

        for id in 2..=u64::try_from(NODE_CACHE_CAPACITY + 2).expect("cache size") {
            store.cache_node(make_node(id)).expect("cache node");
        }
        assert_eq!(
            store.metadata().expect("metadata cache").nodes.len(),
            NODE_CACHE_CAPACITY
        );

        store
            .cache_children(INodeNo(2), vec![make_node(50)])
            .expect("cache directory");
        assert!(store
            .cached_children(INodeNo(2))
            .expect("read directory")
            .is_some());
        store
            .invalidate_directory(INodeNo(2))
            .expect("invalidate directory");
        assert!(store
            .cached_children(INodeNo(2))
            .expect("read directory")
            .is_none());
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
        fs::write(staging.join("inode-3"), b"stale").expect("write stale inode");
        fs::write(staging.join(".tmp-content"), b"partial").expect("write temporary file");

        prepare_staging_directory(&staging).expect("prepare staging");

        assert_eq!(fs::read_dir(&staging).expect("list staging").count(), 0);
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
    fn cache_evicts_the_oldest_closed_file_and_keeps_pinned_files() {
        let directory = tempdir().expect("temporary directory");
        let first_path = directory.path().join("inode-3");
        let pinned_path = directory.path().join("inode-4");
        fs::write(&first_path, b"old").expect("write first cache file");
        fs::write(&pinned_path, b"new").expect("write pinned cache file");
        let store = empty_store(directory.path(), 3);
        store
            .insert_cached_content(
                INodeNo(3),
                CachedContent {
                    blob_id: Some("first".to_owned()),
                    path: first_path.clone(),
                    size_bytes: 3,
                    last_access: 0,
                },
            )
            .expect("insert first cache file");
        store
            .insert_cached_content(
                INodeNo(4),
                CachedContent {
                    blob_id: Some("pinned".to_owned()),
                    path: pinned_path.clone(),
                    size_bytes: 3,
                    last_access: 0,
                },
            )
            .expect("insert pinned cache file");

        store
            .trim_cache(&HashSet::from([INodeNo(4)]))
            .expect("trim cache");

        assert!(!first_path.exists());
        assert!(pinned_path.exists());
        let cache = store.cache().expect("read cache");
        assert_eq!(cache.cached_bytes, 3);
        assert_eq!(cache.entries.len(), 1);
    }
}
