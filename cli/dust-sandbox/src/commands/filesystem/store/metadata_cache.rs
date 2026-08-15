use std::io;
use std::num::NonZeroUsize;
use std::time::{Duration, Instant};

use lru::LruCache;

use super::{errno, INodeNo, Node};

const METADATA_CACHE_TTL: Duration = Duration::from_secs(1);
const NODE_CACHE_CAPACITY: usize = 4096;
const DIRECTORY_CACHE_CAPACITY: usize = 256;
const DIRECTORY_ENTRY_CACHE_CAPACITY: usize = 8192;

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

pub(super) struct MetadataCache {
    nodes: LruCache<INodeNo, CachedNode>,
    directories: LruCache<INodeNo, CachedDirectory>,
    directory_entries: usize,
}

impl MetadataCache {
    pub(super) fn new() -> io::Result<Self> {
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

    pub(super) fn node(&mut self, inode: INodeNo) -> Option<Node> {
        match self.nodes.get(&inode).cloned() {
            Some(cached) if cached.validated_at.elapsed() <= METADATA_CACHE_TTL => {
                Some(cached.node)
            }
            Some(_) => {
                self.nodes.pop(&inode);
                None
            }
            None => None,
        }
    }

    pub(super) fn put_node(&mut self, node: Node) {
        self.nodes.put(
            node.inode,
            CachedNode {
                node,
                validated_at: Instant::now(),
            },
        );
    }

    pub(super) fn children(&mut self, parent_inode: INodeNo) -> io::Result<Option<Vec<Node>>> {
        match self.directories.get(&parent_inode).cloned() {
            Some(cached) if cached.validated_at.elapsed() <= METADATA_CACHE_TTL => {
                Ok(Some(cached.children))
            }
            Some(_) => {
                if let Some(expired) = self.directories.pop(&parent_inode) {
                    self.directory_entries = self
                        .directory_entries
                        .checked_sub(expired.children.len())
                        .ok_or_else(|| errno(libc::EIO))?;
                }
                Ok(None)
            }
            None => Ok(None),
        }
    }

    pub(super) fn put_children(
        &mut self,
        parent_inode: INodeNo,
        children: Vec<Node>,
    ) -> io::Result<()> {
        for child in &children {
            self.put_node(child.clone());
        }
        let child_count = children.len();
        if let Some((_, previous)) = self.directories.push(
            parent_inode,
            CachedDirectory {
                children,
                validated_at: Instant::now(),
            },
        ) {
            self.directory_entries = self
                .directory_entries
                .checked_sub(previous.children.len())
                .ok_or_else(|| errno(libc::EIO))?;
        }
        self.directory_entries = self
            .directory_entries
            .checked_add(child_count)
            .ok_or_else(|| errno(libc::EIO))?;
        while self.directory_entries > DIRECTORY_ENTRY_CACHE_CAPACITY {
            let Some((_, removed)) = self.directories.pop_lru() else {
                break;
            };
            self.directory_entries = self
                .directory_entries
                .checked_sub(removed.children.len())
                .ok_or_else(|| errno(libc::EIO))?;
        }
        Ok(())
    }

    pub(super) fn invalidate_node(&mut self, inode: INodeNo) -> io::Result<()> {
        self.nodes.pop(&inode);
        if let Some(removed) = self.directories.pop(&inode) {
            self.directory_entries = self
                .directory_entries
                .checked_sub(removed.children.len())
                .ok_or_else(|| errno(libc::EIO))?;
        }
        Ok(())
    }

    pub(super) fn invalidate_directory(&mut self, inode: INodeNo) -> io::Result<()> {
        if let Some(removed) = self.directories.pop(&inode) {
            self.directory_entries = self
                .directory_entries
                .checked_sub(removed.children.len())
                .ok_or_else(|| errno(libc::EIO))?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::{MetadataCache, NODE_CACHE_CAPACITY};
    use crate::commands::filesystem::inode::INodeNo;
    use crate::commands::filesystem::store::{Node, NodeKind};

    fn node(id: u64) -> Node {
        Node {
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
        }
    }

    #[test]
    fn bounds_nodes_and_invalidates_directory_entries() {
        let mut cache = MetadataCache::new().expect("metadata cache");
        for id in 2..=u64::try_from(NODE_CACHE_CAPACITY + 2).expect("cache size") {
            cache.put_node(node(id));
        }
        assert_eq!(cache.nodes.len(), NODE_CACHE_CAPACITY);

        cache
            .put_children(INodeNo(2), vec![node(50)])
            .expect("cache directory");
        assert!(cache
            .children(INodeNo(2))
            .expect("read directory")
            .is_some());
        cache
            .invalidate_directory(INodeNo(2))
            .expect("invalidate directory");
        assert!(cache
            .children(INodeNo(2))
            .expect("read directory")
            .is_none());
    }
}
