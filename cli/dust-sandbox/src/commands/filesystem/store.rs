use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Seek, SeekFrom};
use std::os::unix::fs::OpenOptionsExt;
use std::path::{Path, PathBuf};

use tempfile::NamedTempFile;
use uuid::Uuid;

use super::client::{FileSystemClient, NodeKind as RemoteNodeKind, RemoteNode};

pub const ROOT_ID: u64 = 1;
const REMOTE_INODE_OFFSET: u64 = 2;
const DEFAULT_CONTENT_TYPE: &str = "application/octet-stream";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum NodeKind {
    File,
    Directory,
}

#[derive(Clone, Debug)]
pub struct Node {
    pub id: u64,
    pub parent_id: Option<u64>,
    pub name: String,
    pub kind: NodeKind,
    pub mode: u16,
    pub size: u64,
    pub created_at_ms: i64,
    pub modified_at_ms: i64,
    remote_id: Option<u64>,
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
    pub file: File,
    pub expected_blob_id: Option<String>,
    pub content_type: String,
}

#[derive(Clone, Debug)]
struct CachedContent {
    blob_id: Option<String>,
    path: PathBuf,
}

pub struct FileStore {
    client: FileSystemClient,
    staging_dir: PathBuf,
    roots: Vec<Node>,
    cached_content: HashMap<u64, CachedContent>,
    staged_sizes: HashMap<u64, u64>,
}

impl FileStore {
    pub fn open(
        staging_dir: &Path,
        api_url: &str,
        workspace_id: &str,
        token: String,
        token_file: PathBuf,
    ) -> io::Result<Self> {
        fs::create_dir_all(staging_dir)?;
        let client = FileSystemClient::new(api_url, workspace_id, token, token_file)?;
        let roots = client
            .initialize()?
            .into_iter()
            .map(Node::from_remote)
            .collect();
        Ok(Self {
            client,
            staging_dir: staging_dir.to_path_buf(),
            roots,
            cached_content: HashMap::new(),
            staged_sizes: HashMap::new(),
        })
    }

    pub fn node(&self, node_id: u64) -> io::Result<Node> {
        if node_id == ROOT_ID {
            return Ok(Node::root());
        }
        let remote_id = remote_id(node_id)?;
        let mut node = Node::from_remote(self.client.node(remote_id)?);
        self.apply_staged_size(&mut node);
        Ok(node)
    }

    pub fn lookup(&self, parent_id: u64, name: &str) -> io::Result<Node> {
        validate_name(name)?;
        if parent_id == ROOT_ID {
            return self
                .roots
                .iter()
                .find(|root| root.name == name)
                .cloned()
                .ok_or_else(|| errno(libc::ENOENT));
        }
        let mut node = Node::from_remote(self.client.lookup(remote_id(parent_id)?, name)?);
        self.apply_staged_size(&mut node);
        Ok(node)
    }

    pub fn children(&self, parent_id: u64) -> io::Result<Vec<Node>> {
        if parent_id == ROOT_ID {
            return Ok(self.roots.clone());
        }
        self.client
            .children(remote_id(parent_id)?)?
            .into_iter()
            .map(|remote| {
                let mut node = Node::from_remote(remote);
                self.apply_staged_size(&mut node);
                Ok(node)
            })
            .collect()
    }

    pub fn create_file(&self, parent_id: u64, name: &str, mode: u16) -> io::Result<Node> {
        self.create_node(parent_id, name, mode, RemoteNodeKind::File)
    }

    pub fn create_directory(&self, parent_id: u64, name: &str, mode: u16) -> io::Result<Node> {
        self.create_node(parent_id, name, mode, RemoteNodeKind::Directory)
    }

    fn create_node(
        &self,
        parent_id: u64,
        name: &str,
        mode: u16,
        kind: RemoteNodeKind,
    ) -> io::Result<Node> {
        validate_name(name)?;
        if parent_id == ROOT_ID {
            return Err(errno(libc::EPERM));
        }
        self.client
            .create(remote_id(parent_id)?, name, kind, mode)
            .map(Node::from_remote)
    }

    pub fn remove_file(&mut self, parent_id: u64, name: &str) -> io::Result<()> {
        let node = self.lookup(parent_id, name)?;
        if node.kind != NodeKind::File {
            return Err(errno(libc::EISDIR));
        }
        self.remove(parent_id, name, node.id)
    }

    pub fn remove_directory(&mut self, parent_id: u64, name: &str) -> io::Result<()> {
        let node = self.lookup(parent_id, name)?;
        if node.kind != NodeKind::Directory {
            return Err(errno(libc::ENOTDIR));
        }
        self.remove(parent_id, name, node.id)
    }

    fn remove(&mut self, parent_id: u64, name: &str, node_id: u64) -> io::Result<()> {
        if parent_id == ROOT_ID {
            return Err(errno(libc::EPERM));
        }
        self.client
            .remove(&Uuid::new_v4().to_string(), remote_id(parent_id)?, name)?;
        self.staged_sizes.remove(&node_id);
        if let Some(cached) = self.cached_content.remove(&node_id) {
            let _ = fs::remove_file(cached.path);
        }
        Ok(())
    }

    pub fn rename(
        &self,
        parent_id: u64,
        name: &str,
        new_parent_id: u64,
        new_name: &str,
    ) -> io::Result<Node> {
        validate_name(name)?;
        validate_name(new_name)?;
        if parent_id == ROOT_ID || new_parent_id == ROOT_ID {
            return Err(errno(libc::EPERM));
        }
        self.client
            .rename(
                &Uuid::new_v4().to_string(),
                remote_id(parent_id)?,
                name,
                remote_id(new_parent_id)?,
                new_name,
            )
            .map(Node::from_remote)
    }

    pub fn set_mode(&self, node_id: u64, mode: u16) -> io::Result<Node> {
        if node_id == ROOT_ID {
            return Err(errno(libc::EPERM));
        }
        self.client
            .set_mode(remote_id(node_id)?, mode)
            .map(Node::from_remote)
    }

    pub fn open_content(&mut self, node_id: u64, flags: i32) -> io::Result<OpenedContent> {
        let node = self.node(node_id)?;
        if node.kind != NodeKind::File {
            return Err(errno(libc::EISDIR));
        }
        let remote_id = node.remote_id.ok_or_else(|| errno(libc::EIO))?;
        let content = self.client.content(remote_id)?;
        let cache_current = self
            .cached_content
            .get(&node_id)
            .map(|cached| cached.blob_id == content.blob_id && cached.path.exists())
            .unwrap_or(false);
        if !cache_current {
            let mut temporary = NamedTempFile::new_in(&self.staging_dir)?;
            if let Some(url) = content.download_url.as_deref() {
                self.client.download(url, temporary.as_file_mut())?;
            }
            temporary.as_file_mut().sync_data()?;
            let path = self.content_path(node_id);
            temporary.persist(&path).map_err(|error| error.error)?;
            self.cached_content.insert(
                node_id,
                CachedContent {
                    blob_id: content.blob_id.clone(),
                    path,
                },
            );
        }

        let path = self
            .cached_content
            .get(&node_id)
            .map(|cached| cached.path.clone())
            .ok_or_else(|| errno(libc::EIO))?;
        let writable = is_writable(flags);
        let mut options = OpenOptions::new();
        options
            .read(true)
            .write(writable)
            .append(flags & libc::O_APPEND != 0)
            .custom_flags(flags & !(libc::O_ACCMODE | libc::O_CREAT | libc::O_EXCL));
        let file = options.open(path)?;
        Ok(OpenedContent {
            file,
            expected_blob_id: content.blob_id,
            content_type: content
                .content_type
                .unwrap_or_else(|| node.content_type().to_owned()),
        })
    }

    pub fn record_size(&mut self, node_id: u64, size: u64) {
        self.staged_sizes.insert(node_id, size);
    }

    pub fn set_size(&mut self, node_id: u64, size: u64) -> io::Result<Node> {
        let opened = self.open_content(node_id, libc::O_RDWR)?;
        opened.file.set_len(size)?;
        opened.file.sync_data()?;
        self.record_size(node_id, size);
        self.commit_content(
            node_id,
            opened.expected_blob_id.as_deref(),
            &opened.content_type,
            &opened.file,
        )
    }

    pub fn commit_content(
        &mut self,
        node_id: u64,
        expected_blob_id: Option<&str>,
        content_type: &str,
        file: &File,
    ) -> io::Result<Node> {
        let remote_id = remote_id(node_id)?;
        file.sync_data()?;
        let size = file.metadata()?.len();
        let upload = self
            .client
            .prepare_upload(remote_id, expected_blob_id, content_type)?;
        let mut upload_file = file.try_clone()?;
        upload_file.seek(SeekFrom::Start(0))?;
        self.client.upload(&upload, upload_file, size)?;
        let remote = self
            .client
            .commit_upload(remote_id, expected_blob_id, &upload)?;
        let node = Node::from_remote(remote);
        if let Some(cached) = self.cached_content.get_mut(&node_id) {
            cached.blob_id = node.blob_id.clone();
        }
        self.staged_sizes.remove(&node_id);
        Ok(node)
    }

    fn apply_staged_size(&self, node: &mut Node) {
        if let Some(size) = self.staged_sizes.get(&node.id) {
            node.size = *size;
        }
    }

    fn content_path(&self, node_id: u64) -> PathBuf {
        self.staging_dir.join(format!("inode-{node_id}"))
    }
}

impl Node {
    fn root() -> Self {
        Self {
            id: ROOT_ID,
            parent_id: None,
            name: String::new(),
            kind: NodeKind::Directory,
            mode: 0o755,
            size: 0,
            created_at_ms: 0,
            modified_at_ms: 0,
            remote_id: None,
            blob_id: None,
            content_type: None,
        }
    }

    fn from_remote(remote: RemoteNode) -> Self {
        Self {
            id: fuse_id(remote.id),
            parent_id: Some(remote.parent_id.map(fuse_id).unwrap_or(ROOT_ID)),
            name: remote.name,
            kind: match remote.kind {
                RemoteNodeKind::File => NodeKind::File,
                RemoteNodeKind::Directory => NodeKind::Directory,
            },
            mode: remote.mode,
            size: remote.size,
            created_at_ms: remote.created_at_ms,
            modified_at_ms: remote.modified_at_ms,
            remote_id: Some(remote.id),
            blob_id: remote.blob_id,
            content_type: remote.content_type,
        }
    }
}

fn fuse_id(remote_id: u64) -> u64 {
    remote_id.saturating_add(REMOTE_INODE_OFFSET)
}

fn remote_id(fuse_id: u64) -> io::Result<u64> {
    fuse_id
        .checked_sub(REMOTE_INODE_OFFSET)
        .filter(|id| *id > 0)
        .ok_or_else(|| errno(libc::EINVAL))
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
    use super::{fuse_id, remote_id, ROOT_ID};

    #[test]
    fn remote_inode_numbers_never_collide_with_the_virtual_root() {
        assert_ne!(fuse_id(1), ROOT_ID);
        assert_eq!(remote_id(fuse_id(42)).ok(), Some(42));
        assert!(remote_id(ROOT_ID).is_err());
    }
}
