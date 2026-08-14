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
