use std::io::{self, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

use tempfile::NamedTempFile;
use tracing::warn;
use uuid::Uuid;

use super::client::{FileSystemClient, NodeKind as RemoteNodeKind, RemoteNode};
use super::inode::{inode_for_node_id, node_id_for_inode, INodeNo};

// Keeps downloaded file bytes on local disk while open handles are using them.
mod content_cache;
// Keeps recent nodes and directory listings in memory for one second.
mod metadata_cache;

pub use content_cache::OpenedContent;
use content_cache::{prepare_staging_directory, CachedContent, ContentCache};
use metadata_cache::MetadataCache;

pub const FUSE_ROOT_INODE: INodeNo = INodeNo::ROOT;
const DEFAULT_CONTENT_TYPE: &str = "application/octet-stream";

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

pub struct FileStore {
    client: FileSystemClient,
    staging_dir: PathBuf,
    roots: Vec<Node>,
    content: ContentCache,
    // This daemon cache and Linux's entry cache each last one second. Together,
    // a change from another sandbox can take almost two seconds to become visible.
    metadata: Mutex<MetadataCache>,
}

impl FileStore {
    pub fn staging_dir(&self) -> &Path {
        &self.staging_dir
    }

    pub fn open(
        staging_dir: &Path,
        api_url: &str,
        workspace_id: &str,
        token_file: PathBuf,
        cache_capacity_bytes: u64,
    ) -> io::Result<Self> {
        // The sandbox mounts this below a root-owned runtime directory. The
        // checks here protect the final directory and rely on that trusted parent.
        prepare_staging_directory(staging_dir)?;
        let client = FileSystemClient::from_token_file(api_url, workspace_id, token_file)?;
        let roots = client
            .initialize()?
            .into_iter()
            .map(Node::from_remote)
            .collect::<io::Result<Vec<_>>>()?;
        Ok(Self {
            client,
            staging_dir: staging_dir.to_path_buf(),
            roots,
            content: ContentCache::new(cache_capacity_bytes),
            metadata: Mutex::new(MetadataCache::new()?),
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
        self.forget_content_after_namespace_change(inode);
        Ok(())
    }

    fn forget_content_after_namespace_change(&self, inode: INodeNo) {
        if let Err(error) = self.content.forget(inode) {
            // The namespace mutation already committed. Keep its successful
            // result and report the local cache cleanup separately.
            warn!(inode = inode.0, %error, "failed to remove staged filesystem content");
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
        let replaced_inode = match self.lookup(new_parent_inode, new_name) {
            Ok(destination) => Some(destination.inode),
            Err(error) if error.raw_os_error() == Some(libc::ENOENT) => None,
            Err(error) => return Err(error),
        };
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
        if let Some(replaced_inode) = replaced_inode {
            if replaced_inode != node.inode {
                self.forget_content_after_namespace_change(replaced_inode);
            }
        }
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

    pub fn open_content(&self, inode: INodeNo, flags: i32) -> io::Result<OpenedContent> {
        let writable = is_writable(flags);
        let reservation = self.content.reserve_open(inode, writable)?;
        (|| {
            let _content = self.content.lock(inode)?;
            let mut node = self.node(inode)?;
            if node.kind != NodeKind::File {
                return Err(errno(libc::EISDIR));
            }
            let node_id = node_id_for_inode(node.inode)?;
            let cache_current = { self.content.is_current(inode, node.blob_id())? };
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
                self.content.insert(
                    inode,
                    CachedContent::new(opened_node.blob_id.clone(), path, size_bytes),
                )?;
                self.cache_node(opened_node.clone())?;
                node = opened_node;
            }

            reservation.open(flags, node)
        })()
    }

    pub fn set_size(&self, inode: INodeNo, size: u64) -> io::Result<Node> {
        let mut opened = self.open_content(inode, libc::O_RDWR)?;
        let result = (|| {
            opened.set_len(size)?;
            opened.file.sync_data()?;
            self.commit_content(&mut opened)
        })();
        if result.is_err() {
            // No open handle remains to retry this truncate. Drop its changed
            // local bytes so a later open fetches the saved version.
            if let Err(error) = self.discard_content(inode) {
                warn!(inode = inode.0, %error, "failed to discard rejected truncate");
            }
        }
        result
    }

    pub fn commit_content(&self, opened: &mut OpenedContent) -> io::Result<Node> {
        if !opened.is_writable() {
            return Err(errno(libc::EBADF));
        }
        let inode = opened.node.inode;
        let node_id = node_id_for_inode(inode)?;
        opened.file.sync_data()?;
        let size = opened.file.metadata()?.len();
        let upload = self.client.prepare_upload(
            node_id,
            opened.expected_blob_id.as_deref(),
            size,
            &opened.content_type,
        )?;
        let mut upload_file = opened.file.try_clone()?;
        upload_file.seek(SeekFrom::Start(0))?;
        self.client.upload(&upload, upload_file, size)?;
        let remote = self.client.commit_upload(
            node_id,
            opened.expected_blob_id.as_deref(),
            &upload,
            size,
        )?;
        self.finish_content_commit(opened, remote, size)
    }

    fn finish_content_commit(
        &self,
        opened: &mut OpenedContent,
        remote: RemoteNode,
        size: u64,
    ) -> io::Result<Node> {
        let inode = opened.node.inode;
        let node = match Node::from_remote(remote) {
            Ok(node) => node,
            Err(error) => {
                // Front accepted the new blob, but its response cannot be used.
                // Do not leave changed bytes labelled with the previous blob ID.
                if let Err(discard_error) = self.discard_content(inode) {
                    warn!(inode = inode.0, %discard_error, "failed to discard content after an invalid commit response");
                }
                return Err(error);
            }
        };
        if let Err(error) = self
            .content
            .update(inode, &node, size)
            .and_then(|()| self.cache_node(node.clone()))
        {
            // The write is already durable. If both caches can be dropped, a
            // later open can reload the new revision and this commit succeeded.
            if let Err(discard_error) = self.discard_content(inode) {
                warn!(inode = inode.0, %discard_error, "failed to discard content after a cache update error");
                return Err(error);
            }
            warn!(inode = inode.0, %error, "discarded content after a cache update error");
        }
        opened.expected_blob_id = node.blob_id.clone();
        opened.content_type = node.content_type().to_owned();
        opened.node = node.clone();
        Ok(node)
    }

    pub fn discard_content(&self, inode: INodeNo) -> io::Result<()> {
        // Always try both. The local path may contain bytes that do not match
        // the node still held in the metadata cache.
        let metadata_result = self.invalidate_node(inode);
        let content_result = self.content.discard(inode);
        metadata_result.and(content_result)
    }

    fn metadata(&self) -> io::Result<MutexGuard<'_, MetadataCache>> {
        self.metadata.lock().map_err(|_| errno(libc::EIO))
    }

    fn cached_node(&self, inode: INodeNo) -> io::Result<Option<Node>> {
        Ok(self.metadata()?.node(inode))
    }

    fn cache_node(&self, node: Node) -> io::Result<()> {
        self.metadata()?.put_node(node);
        Ok(())
    }

    fn cached_children(&self, parent_inode: INodeNo) -> io::Result<Option<Vec<Node>>> {
        self.metadata()?.children(parent_inode)
    }

    fn cache_children(&self, parent_inode: INodeNo, children: Vec<Node>) -> io::Result<()> {
        self.metadata()?.put_children(parent_inode, children)
    }

    fn invalidate_node(&self, inode: INodeNo) -> io::Result<()> {
        self.metadata()?.invalidate_node(inode)
    }

    fn invalidate_directory(&self, inode: INodeNo) -> io::Result<()> {
        self.metadata()?.invalidate_directory(inode)
    }

    fn content_path(&self, inode: INodeNo) -> PathBuf {
        self.staging_dir.join(format!("inode-{}", inode.0))
    }
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
    use std::fs;
    use std::sync::Mutex;

    use tempfile::tempdir;

    use super::super::client::{NodeKind as RemoteNodeKind, RemoteNode};
    use super::super::inode::{inode_for_node_id, node_id_for_inode};
    use super::{
        CachedContent, ContentCache, FileStore, FileSystemClient, MetadataCache, Node, NodeKind,
        FUSE_ROOT_INODE,
    };

    fn file(inode: u64, size: u64) -> Node {
        Node {
            inode: super::INodeNo(inode),
            parent_inode: Some(super::INodeNo(2)),
            name: format!("inode-{inode}"),
            kind: NodeKind::File,
            mode: 0o644,
            size,
            created_at_ms: 0,
            modified_at_ms: 0,
            blob_id: Some(format!("blob-{inode}")),
            content_type: None,
        }
    }

    fn store(staging_dir: &std::path::Path, capacity: u64) -> FileStore {
        FileStore {
            client: FileSystemClient::new(
                "http://127.0.0.1:1",
                "1",
                "test-token".to_owned(),
                staging_dir.join("token"),
            )
            .expect("filesystem client"),
            staging_dir: staging_dir.to_path_buf(),
            roots: Vec::new(),
            content: ContentCache::new(capacity),
            metadata: Mutex::new(MetadataCache::new().expect("metadata cache")),
        }
    }

    fn stage(store: &FileStore, node: &Node, bytes: &[u8]) {
        let path = store.content_path(node.inode);
        fs::write(&path, bytes).expect("write staged content");
        store
            .content
            .insert(
                node.inode,
                CachedContent::new(node.blob_id.clone(), path, bytes.len() as u64),
            )
            .expect("cache staged content");
        store.cache_node(node.clone()).expect("cache node");
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
    fn public_open_keeps_zero_capacity_cache_content_alive_until_close() {
        let directory = tempdir().expect("temporary directory");
        let store = store(directory.path(), 0);
        let first = file(3, 3);
        stage(&store, &first, b"one");
        let first_open = store
            .open_content(first.inode, libc::O_RDONLY)
            .expect("open first file");

        let second = file(4, 3);
        stage(&store, &second, b"two");
        let second_open = store
            .open_content(second.inode, libc::O_RDONLY)
            .expect("open second file");

        assert!(store.content_path(first.inode).exists());
        assert!(store.content_path(second.inode).exists());
        drop(second_open);
        assert!(store.content_path(first.inode).exists());
        assert!(!store.content_path(second.inode).exists());
        drop(first_open);
    }

    #[test]
    fn public_open_allows_one_writer_per_inode() {
        let directory = tempdir().expect("temporary directory");
        let store = store(directory.path(), 1024);
        let node = file(3, 3);
        stage(&store, &node, b"one");
        let first = store
            .open_content(node.inode, libc::O_RDWR)
            .expect("open first writer");

        let Err(error) = store.open_content(node.inode, libc::O_RDWR) else {
            panic!("accepted a second writer");
        };
        assert_eq!(error.raw_os_error(), Some(libc::EBUSY));

        drop(first);
        store
            .open_content(node.inode, libc::O_RDWR)
            .expect("open writer after close");
    }

    #[test]
    fn invalid_committed_response_discards_old_cache_entries() {
        let directory = tempdir().expect("temporary directory");
        let store = store(directory.path(), 1024);
        let node = file(3, 3);
        stage(&store, &node, b"new");
        let mut opened = store
            .open_content(node.inode, libc::O_RDWR)
            .expect("open writer");

        let invalid_remote = RemoteNode {
            id: 0,
            parent_id: Some(2),
            name: node.name.clone(),
            kind: RemoteNodeKind::File,
            mode: node.mode,
            size: node.size,
            content_type: Some(node.content_type().to_owned()),
            blob_id: Some("committed-blob".to_owned()),
            created_at_ms: 0,
            modified_at_ms: 0,
        };
        store
            .finish_content_commit(&mut opened, invalid_remote, node.size)
            .expect_err("reject invalid committed node");

        assert!(!store.content_path(node.inode).exists());
        assert!(store
            .cached_node(node.inode)
            .expect("metadata cache")
            .is_none());
    }

    #[test]
    fn failed_handleless_truncate_discards_changed_cache_bytes() {
        let directory = tempdir().expect("temporary directory");
        let store = store(directory.path(), 1024);
        let node = file(3, 3);
        stage(&store, &node, b"one");

        store
            .set_size(node.inode, 1)
            .expect_err("Front is deliberately unavailable");

        assert!(!store.content_path(node.inode).exists());
        assert!(store
            .cached_node(node.inode)
            .expect("metadata cache")
            .is_none());
    }
}
