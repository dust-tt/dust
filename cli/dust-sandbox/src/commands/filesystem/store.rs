use std::io::{self, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

use tempfile::NamedTempFile;
use tracing::warn;
use uuid::Uuid;

use super::client::{FileSystemClient, NodeKind as RemoteNodeKind, RemoteNode};
use super::errno;
use super::inode::{
    inode_for_node_id, node_id_for_inode, INodeNo, CONVERSATION_LINK_INODE, POD_LINK_INODE,
};

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
    // Only the `conversation` and `pod` links at the top of the mount. The
    // database holds no symbolic link of its own.
    Symlink,
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

// `/files` holds one directory per conversation or Pod, named with its Dust
// identifier. Prompts and older tools also use the shorter `conversation` and
// `pod` paths, which this daemon adds as symbolic links to those directories.
struct RootLink {
    inode: INodeNo,
    name: &'static str,
    target: String,
}

// The name of each link, the start of the root directory name it points to, and
// the inode it keeps for the life of the mount.
const ROOT_LINKS: [(&str, &str, INodeNo); 2] = [
    ("conversation", "conversation-", CONVERSATION_LINK_INODE),
    ("pod", "pod-", POD_LINK_INODE),
];

impl RootLink {
    fn all(roots: &[Node]) -> Vec<Self> {
        ROOT_LINKS
            .into_iter()
            .filter_map(|(name, prefix, inode)| {
                // A root already using the short name needs no link, and a
                // second entry under that name would hide the root itself.
                if roots.iter().any(|root| root.name == name) {
                    return None;
                }
                let target = roots.iter().find(|root| root.name.starts_with(prefix))?;
                Some(Self {
                    inode,
                    name,
                    target: target.name.clone(),
                })
            })
            .collect()
    }

    fn node(&self) -> Node {
        Node {
            inode: self.inode,
            parent_inode: Some(FUSE_ROOT_INODE),
            name: self.name.to_owned(),
            kind: NodeKind::Symlink,
            // A symbolic link carries no permission of its own, and its size is
            // the length of the name it points to.
            mode: 0o777,
            size: self.target.len() as u64,
            created_at_ms: 0,
            modified_at_ms: 0,
            blob_id: None,
            content_type: None,
        }
    }
}

// The node that now carries the new name, and the one the rename replaced.
pub struct RenameOutcome {
    pub node: Node,
    pub replaced_inode: Option<INodeNo>,
}

pub struct FileStore {
    client: FileSystemClient,
    staging_dir: PathBuf,
    roots: Vec<Node>,
    root_links: Vec<RootLink>,
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
        let root_links = RootLink::all(&roots);
        Ok(Self {
            client,
            staging_dir: staging_dir.to_path_buf(),
            roots,
            root_links,
            content: ContentCache::new(cache_capacity_bytes),
            metadata: Mutex::new(MetadataCache::new()?),
        })
    }

    pub fn node(&self, inode: INodeNo) -> io::Result<Node> {
        if inode == FUSE_ROOT_INODE {
            return Ok(Node::root());
        }
        if let Some(link) = self.root_link(inode) {
            return Ok(link.node());
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
            return self.root_entry(name).ok_or_else(|| errno(libc::ENOENT));
        }
        let node = Node::from_remote(self.client.lookup(node_id_for_inode(parent_inode)?, name)?)?;
        self.cache_node(node.clone())?;
        Ok(node)
    }

    pub fn children(&self, parent_inode: INodeNo) -> io::Result<Vec<Node>> {
        if parent_inode == FUSE_ROOT_INODE {
            let mut entries = self.roots.clone();
            entries.extend(self.root_links.iter().map(RootLink::node));
            return Ok(entries);
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

    // The top of the mount holds the roots granted by the sandbox token plus
    // the short links to them.
    fn root_entry(&self, name: &str) -> Option<Node> {
        if let Some(root) = self.roots.iter().find(|root| root.name == name) {
            return Some(root.clone());
        }
        self.root_links
            .iter()
            .find(|link| link.name == name)
            .map(RootLink::node)
    }

    fn root_link(&self, inode: INodeNo) -> Option<&RootLink> {
        self.root_links.iter().find(|link| link.inode == inode)
    }

    // Returns the root directory name that one of the short links points to.
    pub fn read_link(&self, inode: INodeNo) -> io::Result<String> {
        // EINVAL is what Linux expects when a path turns out not to be a link.
        self.root_link(inode)
            .map(|link| link.target.clone())
            .ok_or_else(|| errno(libc::EINVAL))
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

    pub fn remove_file(&self, parent_inode: INodeNo, name: &str) -> io::Result<INodeNo> {
        let node = self.lookup(parent_inode, name)?;
        match node.kind {
            NodeKind::File => {}
            NodeKind::Directory => return Err(errno(libc::EISDIR)),
            // `rm /files/conversation` arrives here. The links are part of the
            // mount layout, so no sandbox command removes them.
            NodeKind::Symlink => return Err(errno(libc::EPERM)),
        }
        self.remove(parent_inode, name, node.inode, RemoteNodeKind::File)
    }

    pub fn remove_directory(&self, parent_inode: INodeNo, name: &str) -> io::Result<INodeNo> {
        let node = self.lookup(parent_inode, name)?;
        if node.kind != NodeKind::Directory {
            return Err(errno(libc::ENOTDIR));
        }
        self.remove(parent_inode, name, node.inode, RemoteNodeKind::Directory)
    }

    // Returns the node that lost this name. Another sandbox can move a different
    // node onto the name between the caller's lookup and this removal, so Front's
    // answer decides, not the inode the caller resolved.
    fn remove(
        &self,
        parent_inode: INodeNo,
        name: &str,
        inode: INodeNo,
        kind: RemoteNodeKind,
    ) -> io::Result<INodeNo> {
        if parent_inode == FUSE_ROOT_INODE {
            return Err(errno(libc::EPERM));
        }
        let removed_node_id = self.client.remove(
            &Uuid::new_v4().to_string(),
            node_id_for_inode(parent_inode)?,
            name,
            kind,
        )?;
        let removed_inode = inode_for_node_id(removed_node_id)?;
        if removed_inode != inode {
            warn!(
                expected_inode = inode.0,
                removed_inode = removed_inode.0,
                "another sandbox changed this name before it was removed"
            );
            // The node the caller resolved still exists under another name, so
            // only its stale details go and its local content stays usable.
            self.invalidate_node(inode)?;
        }
        self.invalidate_node(removed_inode)?;
        self.invalidate_directory(parent_inode)?;
        self.forget_content_after_namespace_change(removed_inode);
        Ok(removed_inode)
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
    ) -> io::Result<RenameOutcome> {
        validate_name(name)?;
        validate_name(new_name)?;
        if parent_inode == FUSE_ROOT_INODE || new_parent_inode == FUSE_ROOT_INODE {
            return Err(errno(libc::EPERM));
        }
        let renamed = self.client.rename(
            &Uuid::new_v4().to_string(),
            node_id_for_inode(parent_inode)?,
            name,
            node_id_for_inode(new_parent_inode)?,
            new_name,
        )?;
        // Front names the node the rename replaced, so the destination needs no
        // lookup of its own.
        let replaced_inode = renamed
            .replaced_node_id
            .map(inode_for_node_id)
            .transpose()?;
        let node = Node::from_remote(renamed.node)?;
        self.invalidate_directory(parent_inode)?;
        self.invalidate_directory(new_parent_inode)?;
        self.cache_node(node.clone())?;
        if let Some(replaced_inode) = replaced_inode {
            if replaced_inode != node.inode {
                self.invalidate_node(replaced_inode)?;
                self.forget_content_after_namespace_change(replaced_inode);
            }
        }
        Ok(RenameOutcome {
            node,
            replaced_inode,
        })
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
        let remote = match self.client.commit_upload(
            node_id,
            opened.expected_blob_id.as_deref(),
            &upload,
            size,
        ) {
            Ok(remote) => remote,
            // A commit whose response was lost is sent again by the HTTP
            // client. Front has already stored the new blob by then, so the
            // second try reports the blob it was given as out of date.
            Err(error) if error.raw_os_error() == Some(libc::ESTALE) => {
                self.node_after_lost_commit(node_id, &upload.blob_id, error)?
            }
            Err(error) => return Err(error),
        };
        self.finish_content_commit(opened, remote, size)
    }

    // Reports whether the commit that answered ESTALE is one this daemon has
    // already made. Front gives every upload its own blob ID, so a node holding
    // the blob we just uploaded can only be the result of our own commit. Any
    // other blob means another sandbox wrote the file first, which stays an
    // error the caller must see.
    fn node_after_lost_commit(
        &self,
        node_id: u64,
        blob_id: &str,
        stale: io::Error,
    ) -> io::Result<RemoteNode> {
        match self.client.node(node_id) {
            Ok(remote) if remote.blob_id.as_deref() == Some(blob_id) => Ok(remote),
            _ => Err(stale),
        }
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

#[cfg(test)]
mod tests {
    use std::fs;
    use std::io::Write;
    use std::net::TcpListener;
    use std::sync::Mutex;
    use std::thread::JoinHandle;

    use tempfile::tempdir;

    use super::super::client::test_support::read_request;
    use super::super::client::{NodeKind as RemoteNodeKind, RemoteNode};
    use super::super::inode::{inode_for_node_id, node_id_for_inode};
    use super::{
        errno, CachedContent, ContentCache, FileStore, FileSystemClient, MetadataCache, Node,
        NodeKind, RootLink, FUSE_ROOT_INODE,
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

    // Nothing listens on this address, so a test that expects a call to Front
    // to fail needs no server of its own.
    const UNREACHABLE_FRONT: &str = "http://127.0.0.1:1";

    fn root(inode: u64, name: &str) -> Node {
        Node {
            inode: super::INodeNo(inode),
            parent_inode: Some(FUSE_ROOT_INODE),
            name: name.to_owned(),
            kind: NodeKind::Directory,
            mode: 0o755,
            size: 0,
            created_at_ms: 0,
            modified_at_ms: 0,
            blob_id: None,
            content_type: None,
        }
    }

    fn store(
        staging_dir: &std::path::Path,
        capacity: u64,
        api_url: &str,
        roots: Vec<Node>,
    ) -> FileStore {
        FileStore {
            client: FileSystemClient::new(
                api_url,
                "1",
                "test-token".to_owned(),
                staging_dir.join("token"),
            )
            .expect("filesystem client"),
            staging_dir: staging_dir.to_path_buf(),
            root_links: RootLink::all(&roots),
            roots,
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
        let store = store(directory.path(), 0, UNREACHABLE_FRONT, Vec::new());
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
        let store = store(directory.path(), 1024, UNREACHABLE_FRONT, Vec::new());
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
        let store = store(directory.path(), 1024, UNREACHABLE_FRONT, Vec::new());
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
        let store = store(directory.path(), 1024, UNREACHABLE_FRONT, Vec::new());
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

    #[test]
    fn the_short_root_name_is_a_link_with_an_inode_of_its_own() {
        let directory = tempdir().expect("temporary directory");
        let conversation = root(2, "conversation-abc");
        let store = store(
            directory.path(),
            1024,
            UNREACHABLE_FRONT,
            vec![conversation.clone()],
        );

        let link = store
            .lookup(FUSE_ROOT_INODE, "conversation")
            .expect("look up the short name");
        assert_eq!(link.kind, NodeKind::Symlink);
        assert_eq!(
            store.read_link(link.inode).expect("read the link"),
            "conversation-abc"
        );
        // Linux moves a directory between two names that report one inode, so
        // the link must never carry the inode of the root it points to.
        assert_ne!(link.inode, conversation.inode);
        assert_eq!(
            store.node(link.inode).expect("stat the link").kind,
            link.kind
        );

        let root_directory = store
            .lookup(FUSE_ROOT_INODE, "conversation-abc")
            .expect("look up the root");
        assert_eq!(root_directory.kind, NodeKind::Directory);
        assert_eq!(root_directory.inode, conversation.inode);
    }

    #[test]
    fn the_mount_root_lists_each_root_with_its_link() {
        let directory = tempdir().expect("temporary directory");
        let store = store(
            directory.path(),
            1024,
            UNREACHABLE_FRONT,
            vec![root(2, "conversation-abc")],
        );

        let entries = store
            .children(FUSE_ROOT_INODE)
            .expect("list the mount root")
            .into_iter()
            .map(|node| (node.name, node.kind))
            .collect::<Vec<_>>();

        // This sandbox holds no Pod root, so it gets no `pod` link either.
        assert_eq!(
            entries,
            vec![
                ("conversation-abc".to_owned(), NodeKind::Directory),
                ("conversation".to_owned(), NodeKind::Symlink),
            ]
        );
    }

    #[test]
    fn a_root_already_using_the_short_name_gets_no_link() {
        let directory = tempdir().expect("temporary directory");
        let store = store(
            directory.path(),
            1024,
            UNREACHABLE_FRONT,
            vec![root(2, "conversation")],
        );

        let entry = store
            .lookup(FUSE_ROOT_INODE, "conversation")
            .expect("look up the root");

        assert_eq!(entry.kind, NodeKind::Directory);
        assert_eq!(store.children(FUSE_ROOT_INODE).expect("list").len(), 1);
    }

    #[test]
    fn reading_a_link_from_anything_but_a_link_is_rejected() {
        let directory = tempdir().expect("temporary directory");
        let store = store(directory.path(), 1024, UNREACHABLE_FRONT, Vec::new());

        assert_eq!(
            store
                .read_link(super::INodeNo(3))
                .expect_err("reject a regular file")
                .raw_os_error(),
            Some(libc::EINVAL)
        );
    }

    // Answers one metadata call with the file details Front holds.
    fn front_serving_blob(blob_id: &'static str) -> (String, JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("listen");
        let address = listener.local_addr().expect("local address");
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept request");
            read_request(&mut stream);
            let body = serde_json::json!({
                "node": {
                    "id": 3,
                    "parentId": 2,
                    "name": "file.txt",
                    "kind": "file",
                    "mode": 0o644,
                    "size": 3,
                    "contentType": null,
                    "blobId": blob_id,
                    "createdAtMs": 1,
                    "modifiedAtMs": 1
                }
            })
            .to_string();
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .expect("write response");
        });
        (format!("http://{address}"), server)
    }

    #[test]
    fn a_commit_whose_reply_was_lost_is_accepted_on_the_second_try() {
        let directory = tempdir().expect("temporary directory");
        let (api_url, server) = front_serving_blob("uploaded-blob");
        let store = store(directory.path(), 1024, &api_url, Vec::new());

        let recovered = store
            .node_after_lost_commit(3, "uploaded-blob", errno(libc::ESTALE))
            .expect("accept a commit this daemon already made");

        assert_eq!(recovered.blob_id.as_deref(), Some("uploaded-blob"));
        server.join().expect("server thread");
    }

    #[test]
    fn a_commit_refused_because_another_sandbox_wrote_first_stays_an_error() {
        let directory = tempdir().expect("temporary directory");
        let (api_url, server) = front_serving_blob("another-sandbox-blob");
        let store = store(directory.path(), 1024, &api_url, Vec::new());

        let error = store
            .node_after_lost_commit(3, "uploaded-blob", errno(libc::ESTALE))
            .expect_err("report the conflict to the caller");

        assert_eq!(error.raw_os_error(), Some(libc::ESTALE));
        server.join().expect("server thread");
    }

    #[test]
    fn the_node_front_reports_removing_wins_over_the_one_looked_up() {
        // Front answers the lookup with node 7 and then reports removing node 9.
        // That is what another sandbox moving a different node onto this name
        // looks like from here, and the caller has to hear about node 9.
        let listener = TcpListener::bind("127.0.0.1:0").expect("listen");
        let address = listener.local_addr().expect("local address");
        let server = std::thread::spawn(move || {
            let bodies = [
                r#"{"node":{"id":7,"parentId":2,"name":"file.txt","kind":"file","mode":420,"size":0,"contentType":null,"blobId":null,"createdAtMs":1,"modifiedAtMs":1}}"#,
                r#"{"removedNodeId":9}"#,
            ];
            for body in bodies {
                let (mut stream, _) = listener.accept().expect("accept request");
                read_request(&mut stream);
                write!(
                    stream,
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                )
                .expect("write response");
            }
        });

        let directory = tempdir().expect("temporary directory");
        let store = store(
            directory.path(),
            1024,
            &format!("http://{address}"),
            Vec::new(),
        );

        let removed = store
            .remove_file(super::INodeNo(2), "file.txt")
            .expect("remove the file");

        assert_eq!(removed, inode_for_node_id(9).expect("removed inode"));
        assert_ne!(removed, inode_for_node_id(7).expect("looked up inode"));
        server.join().expect("server thread");
    }
}
