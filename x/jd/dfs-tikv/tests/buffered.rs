use dfs_tikv::mount_cache::{Limits as CacheLimits, MountCache};
use dfs_tikv::{
    client::Client,
    engine::{Engine, Limits, token_hash},
    model::*,
    rpc::Service,
    wire::dfs_server::DfsServer,
};
use std::sync::{Arc, atomic::Ordering};

struct Fixture {
    client: Client,
    endpoint: String,
    server: tokio::task::JoinHandle<()>,
    _directory: tempfile::TempDir,
}
impl Drop for Fixture {
    fn drop(&mut self) {
        self.server.abort();
    }
}
impl Fixture {
    async fn new() -> anyhow::Result<Self> {
        let directory = tempfile::tempdir()?;
        let credentials = ["admin", "writer"]
            .into_iter()
            .map(|subject| Credential {
                token_hash: token_hash(subject),
                tenant: "tenant".into(),
                issuer: "test".into(),
                subject: subject.into(),
                principal: subject.into(),
                admin: subject == "admin",
                scope: None,
                expires_ms: now_ms() + 3_600_000,
            })
            .collect();
        let config = dfs_tikv::Config::new(
            std::env::var("DFS_TIKV_TEST_PD")?
                .split(',')
                .map(str::to_owned)
                .collect(),
            format!("buffer-{}", id()),
        );
        let engine = Arc::new(
            Engine::open(
                dfs_tikv::Store::connect(config).await?,
                credentials,
                Limits::default(),
            )
            .await?,
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
        let endpoint = format!("http://{}", listener.local_addr()?);
        let server = tokio::spawn(async move {
            tonic::transport::Server::builder()
                .add_service(DfsServer::new(Service::new(engine)))
                .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
                .await
                .unwrap();
        });
        let client = Client::connect(&endpoint, "admin", None).await?;
        Ok(Self {
            client,
            endpoint,
            server,
            _directory: directory,
        })
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "requires real TiKV in dust-dev"]
async fn buffered_creates_coalesce_and_sync_preserves_all_files() -> anyhow::Result<()> {
    let f = Fixture::new().await?;
    let cache = MountCache::new(f.client.clone(), CacheLimits::default())?;
    let root = f.client.view().await?.nodes[0].node.id.clone();
    cache.validation().await?;
    let before = f.client.counters.mutation_calls.load(Ordering::Relaxed);
    let mut ids = Vec::new();
    for n in 0..32 {
        let node = cache
            .mutate(Mutation::Create {
                parent: root.clone(),
                name: format!("file-{n}"),
                kind: Kind::File,
                mode: 0o600,
            })
            .await?
            .node
            .unwrap();
        let mut handle = cache.open_file(&node.id, libc::O_RDWR).await?;
        cache.write_file(&mut handle, 0, vec![n; 4096]).await?;
        cache
            .setattr_file(&mut handle, Some(0o640), Some(1234))
            .await?;
        assert_eq!(
            cache.try_read_file(&mut handle, 0, 4096)?.unwrap(),
            vec![n; 4096]
        );
        cache.flush_file(&mut handle).await?;
        cache.close_file(handle).await?;
        ids.push(node.id);
    }
    assert_eq!(
        f.client.counters.mutation_calls.load(Ordering::Relaxed),
        before
    );
    assert_eq!(f.client.view().await?.nodes.len(), 1);
    cache.finish_buffer().await?;
    assert_eq!(
        f.client.counters.mutation_calls.load(Ordering::Relaxed) - before,
        1
    );
    let view = f.client.view().await?;
    assert_eq!(view.nodes.len(), 33);
    for (n, id) in ids.iter().enumerate() {
        let item = view.nodes.iter().find(|item| &item.node.id == id).unwrap();
        assert_eq!(
            (item.node.mode, item.node.mtime_ms, item.node.size),
            (0o640, 1234, 4096)
        );
        let mut handle = cache.open_file(id, libc::O_RDONLY).await?;
        assert_eq!(
            cache.read_file(&mut handle, 0, 4096).await?.bytes,
            vec![n as u8; 4096]
        );
    }
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "requires real TiKV in dust-dev"]
async fn file_batch_is_atomic_fenced_and_idempotent() -> anyhow::Result<()> {
    let f = Fixture::new().await?;
    let root = f.client.view().await?.nodes[0].node.id.clone();
    let file = |name: &str| FileUpdate {
        node: Node {
            id: id(),
            parent: Some(root.clone()),
            name: name.into(),
            kind: Kind::File,
            version: id(),
            entry_token: id(),
            size: 4,
            mode: 0o600,
            mtime_ms: 9,
            unlinked: false,
        },
        base: None,
        data: b"data".to_vec(),
    };
    let existing = file("exists");
    let mutation = Mutation::PutFiles {
        files: vec![file("first"), existing.clone()],
    };
    let identity = f.client.prepare_publication(&mutation)?;
    let published = f.client.publish(identity.clone(), mutation.clone()).await?;
    let repeated = f.client.publish(identity, mutation).await?;
    assert_eq!(published.outcome.head, repeated.outcome.head);
    let collision = Mutation::PutFiles {
        files: vec![file("absent"), file("exists")],
    };
    assert_eq!(
        f.client.mutate(collision).await.unwrap_err().code,
        libc::EEXIST
    );
    assert_eq!(f.client.view().await?.nodes.len(), 3);
    let mut replacement = existing.clone();
    replacement.base = Some(existing.node.version.clone());
    replacement.node.version = id();
    replacement.data = b"next".to_vec();
    f.client
        .mutate(Mutation::PutFiles {
            files: vec![replacement.clone()],
        })
        .await?;
    replacement.node.version = id();
    assert_eq!(
        f.client
            .mutate(Mutation::PutFiles {
                files: vec![file("rolled-back"), replacement]
            })
            .await
            .unwrap_err()
            .code,
        libc::ESTALE
    );
    assert_eq!(f.client.view().await?.nodes.len(), 3);
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "requires real TiKV in dust-dev"]
async fn buffered_revocation_is_deferred_and_retained() -> anyhow::Result<()> {
    let f = Fixture::new().await?;
    let root = f.client.view().await?.nodes[0].node.id.clone();
    f.client
        .mutate(Mutation::Grant {
            node: root.clone(),
            subject: "writer".into(),
            verbs: CREATE | READ | WRITE | LIST | TRAVERSE,
        })
        .await?;
    let writer = Client::connect(&f.endpoint, "writer", None).await?;
    let cache = MountCache::new(writer, CacheLimits::default())?;
    let node = cache
        .mutate(Mutation::Create {
            parent: root.clone(),
            name: "revoked".into(),
            kind: Kind::File,
            mode: 0o600,
        })
        .await?
        .node
        .unwrap();
    let mut handle = cache.open_file(&node.id, libc::O_RDWR).await?;
    cache
        .write_file(&mut handle, 0, b"pending".to_vec())
        .await?;
    f.client
        .mutate(Mutation::Grant {
            node: root,
            subject: "writer".into(),
            verbs: 0,
        })
        .await?;
    tokio::time::sleep(std::time::Duration::from_millis(520)).await;
    assert_eq!(
        cache
            .write_file(&mut handle, 0, b"expired".to_vec())
            .await
            .unwrap_err()
            .code,
        libc::EACCES
    );
    cache.close_file(handle).await?;
    assert_eq!(cache.finish_buffer().await.unwrap_err().code, libc::EACCES);
    assert_eq!(cache.finish_buffer().await.unwrap_err().code, libc::EACCES);
    assert_eq!(f.client.view().await?.nodes.len(), 1);
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "requires real TiKV in dust-dev"]
async fn graceful_unmount_drains_unpublished_files() -> anyhow::Result<()> {
    let f = Fixture::new().await?;
    let runtime = tokio::runtime::Handle::current();
    let client = f.client.clone();
    tokio::task::spawn_blocking(move || -> anyhow::Result<()> {
        let directory = tempfile::tempdir()?;
        let mount = dfs_tikv::mount::Mount::new(client, runtime, CacheLimits::default())?;
        let session = mount.spawn(
            directory.path(),
            &[fuser::MountOption::FSName("buffer-test".into())],
        )?;
        for n in 0..16 {
            std::fs::write(
                directory.path().join(format!("files/file-{n}")),
                vec![n as u8; 4096],
            )?;
        }
        let result = std::process::Command::new("fusermount3")
            .args(["-u", "--"])
            .arg(directory.path())
            .output()?;
        anyhow::ensure!(
            result.status.success(),
            "{}",
            String::from_utf8_lossy(&result.stderr)
        );
        session.shutdown()?;
        Ok(())
    })
    .await??;
    let view = f.client.view().await?;
    assert_eq!(view.nodes.len(), 17);
    for n in 0..16 {
        let node = &view
            .nodes
            .iter()
            .find(|item| item.node.name == format!("file-{n}"))
            .unwrap()
            .node;
        let Reply::Data(bytes) = f
            .client
            .call(Call::Read {
                node: node.id.clone(),
                version: None,
                offset: 0,
                size: 4096,
                handle: None,
            })
            .await?
        else {
            anyhow::bail!("read reply");
        };
        assert_eq!(bytes, vec![n as u8; 4096]);
    }
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "requires real TiKV in dust-dev"]
async fn incremental_refresh_handles_more_than_128_changes() -> anyhow::Result<()> {
    let f = Fixture::new().await?;
    let view = f.client.view().await?;
    let root = view.nodes[0].node.id.clone();
    for batch in 0..3 {
        let files = (0..64)
            .map(|n| FileUpdate {
                node: Node {
                    id: id(),
                    parent: Some(root.clone()),
                    name: format!("delta-{batch}-{n}"),
                    kind: Kind::File,
                    version: id(),
                    entry_token: id(),
                    size: 0,
                    mode: 0o600,
                    mtime_ms: 0,
                    unlinked: false,
                },
                base: None,
                data: Vec::new(),
            })
            .collect();
        f.client.mutate(Mutation::PutFiles { files }).await?;
    }
    let other = Client::connect(&f.endpoint, "admin", None).await?;
    let Reply::Delta(delta) = other
        .call(Call::Changes {
            cursor: Cursor {
                incarnation: view.incarnation,
                head: view.head,
            },
        })
        .await?
    else {
        anyhow::bail!("delta reply");
    };
    assert!(!delta.reset);
    assert_eq!(delta.head, view.head + 192);
    assert_eq!(delta.upserts.len(), 193);
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "requires real TiKV in dust-dev"]
async fn capacity_flush_keeps_current_file_buffered() -> anyhow::Result<()> {
    let f = Fixture::new().await?;
    let cache = MountCache::new(f.client.clone(), CacheLimits::default())?;
    let root = f.client.view().await?.nodes[0].node.id.clone();
    cache.validation().await?;
    let before = f.client.counters.mutation_calls.load(Ordering::Relaxed);
    let mut nodes = Vec::new();
    for n in 0..2 {
        let node = cache
            .mutate(Mutation::Create {
                parent: root.clone(),
                name: format!("capacity-{n}"),
                kind: Kind::File,
                mode: 0o600,
            })
            .await?
            .node
            .unwrap();
        let mut handle = cache.open_file(&node.id, libc::O_RDWR).await?;
        cache.write_file(&mut handle, 0, vec![n; 600 << 10]).await?;
        cache
            .write_file(&mut handle, 600 << 10, vec![n; 600 << 10])
            .await?;
        cache
            .setattr_file(&mut handle, Some(0o640), Some(1234))
            .await?;
        cache.flush_file(&mut handle).await?;
        cache.close_file(handle).await?;
        nodes.push(node.id);
    }
    assert_eq!(
        f.client.counters.mutation_calls.load(Ordering::Relaxed),
        before + 1
    );
    let view = f.client.view().await?;
    assert_eq!(view.nodes.len(), 2);
    assert!(view.nodes.iter().any(|item| item.node.id == nodes[0]));
    assert!(!view.nodes.iter().any(|item| item.node.id == nodes[1]));
    cache.finish_buffer().await?;
    assert_eq!(
        f.client.counters.mutation_calls.load(Ordering::Relaxed),
        before + 2
    );
    for (n, node) in nodes.into_iter().enumerate() {
        let mut handle = cache.open_file(&node, libc::O_RDONLY).await?;
        assert_eq!(
            cache.read_file(&mut handle, 0, 600 << 10).await?.bytes,
            vec![n as u8; 600 << 10]
        );
        assert_eq!(
            cache
                .read_file(&mut handle, 600 << 10, 600 << 10)
                .await?
                .bytes,
            vec![n as u8; 600 << 10]
        );
        assert_eq!(handle.node().size, 1200 << 10);
        assert_eq!(handle.node().mode, 0o640);
        assert_eq!(handle.node().mtime_ms, 1234);
        cache.close_file(handle).await?;
    }
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "requires real TiKV in dust-dev"]
async fn acknowledged_directory_overlay_preserves_unseen_changes() -> anyhow::Result<()> {
    let f = Fixture::new().await?;
    let cache = MountCache::new(f.client.clone(), CacheLimits::default())?;
    let root = f.client.view().await?.nodes[0].node.id.clone();
    cache.validation().await?;
    let before = f.client.counters.head_calls.load(Ordering::Relaxed);
    f.client
        .mutate(Mutation::Create {
            parent: root.clone(),
            name: "external".into(),
            kind: Kind::Directory,
            mode: 0o700,
        })
        .await?;
    let node = cache
        .mutate(Mutation::Create {
            parent: root.clone(),
            name: "local".into(),
            kind: Kind::Directory,
            mode: 0o700,
        })
        .await?
        .node
        .unwrap();
    assert_eq!(
        cache.lookup(Some(&root), "local").await?.item.node.id,
        node.id
    );
    assert_eq!(f.client.counters.head_calls.load(Ordering::Relaxed), before);
    cache.invalidate().await;
    assert_eq!(
        cache.lookup(Some(&root), "external").await?.item.node.name,
        "external"
    );
    assert_eq!(
        cache.lookup(Some(&root), "local").await?.item.node.id,
        node.id
    );
    assert_eq!(
        f.client.counters.head_calls.load(Ordering::Relaxed),
        before + 1
    );
    cache.finish_buffer().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore]
async fn buffered_directories_and_children_publish_atomically() -> anyhow::Result<()> {
    let f = Fixture::new().await?;
    let root = f.client.view().await?.nodes[0].node.id.clone();
    f.client
        .mutate(Mutation::Grant {
            node: root.clone(),
            subject: "writer".into(),
            verbs: CREATE | READ | WRITE | LIST | TRAVERSE,
        })
        .await?;
    let writer = Client::connect(&f.endpoint, "writer", None).await?;
    let cache = MountCache::new(writer.clone(), CacheLimits::default())?;
    cache.validation().await?;
    let before = writer.counters.mutation_calls.load(Ordering::Relaxed);
    let mut parent = root.clone();
    let mut directories = Vec::new();
    for depth in 0..8 {
        let node = cache
            .mutate(Mutation::Create {
                parent,
                name: format!("level-{depth}"),
                kind: Kind::Directory,
                mode: 0o700,
            })
            .await?
            .node
            .unwrap();
        cache
            .mutate(Mutation::SetAttr {
                node: node.id.clone(),
                base: node.version.clone(),
                mode: Some(0o750),
                mtime_ms: Some(1234),
                handle: None,
            })
            .await?;
        let node = cache.object(&node.id).await?.item.node;
        assert_eq!(
            cache
                .mutate(Mutation::Truncate {
                    node: node.id.clone(),
                    base: node.version.clone(),
                    size: 1,
                    handle: None,
                })
                .await
                .unwrap_err()
                .code,
            libc::EISDIR
        );
        directories.push(node.id.clone());
        parent = node.id;
    }
    let leaf = cache
        .mutate(Mutation::Create {
            parent: parent.clone(),
            name: "leaf".into(),
            kind: Kind::File,
            mode: 0o600,
        })
        .await?
        .node
        .unwrap();
    let mut handle = cache.open_file(&leaf.id, libc::O_RDWR).await?;
    cache.write_file(&mut handle, 0, b"nested".to_vec()).await?;
    assert_eq!(
        writer.counters.mutation_calls.load(Ordering::Relaxed),
        before
    );
    assert_eq!(f.client.view().await?.nodes.len(), 1);
    cache.sync_file(&mut handle).await?;
    assert_eq!(
        writer.counters.mutation_calls.load(Ordering::Relaxed),
        before + 1
    );
    let view = f.client.view().await?;
    assert_eq!(view.nodes.len(), 10);
    for directory in directories {
        let item = view
            .nodes
            .iter()
            .find(|item| item.node.id == directory)
            .unwrap();
        assert_eq!(
            (
                item.node.kind,
                item.node.mode,
                item.node.mtime_ms,
                item.node.size
            ),
            (Kind::Directory, 0o750, 1234, 0)
        );
    }
    assert_eq!(cache.read_file(&mut handle, 0, 6).await?.bytes, b"nested");
    cache.close_file(handle).await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore]
async fn buffered_directory_collision_leaves_no_descendants() -> anyhow::Result<()> {
    let f = Fixture::new().await?;
    let cache = MountCache::new(f.client.clone(), CacheLimits::default())?;
    let root = f.client.view().await?.nodes[0].node.id.clone();
    let directory = cache
        .mutate(Mutation::Create {
            parent: root.clone(),
            name: "collision".into(),
            kind: Kind::Directory,
            mode: 0o700,
        })
        .await?
        .node
        .unwrap();
    let leaf = cache
        .mutate(Mutation::Create {
            parent: directory.id.clone(),
            name: "leaf".into(),
            kind: Kind::File,
            mode: 0o600,
        })
        .await?
        .node
        .unwrap();
    let mut handle = cache.open_file(&leaf.id, libc::O_RDWR).await?;
    cache
        .write_file(&mut handle, 0, b"unpublished".to_vec())
        .await?;
    let external = f
        .client
        .mutate(Mutation::Create {
            parent: root,
            name: "collision".into(),
            kind: Kind::Directory,
            mode: 0o700,
        })
        .await?
        .node
        .unwrap();
    assert_eq!(cache.finish_buffer().await.unwrap_err().code, libc::EEXIST);
    cache.close_file(handle).await?;
    assert_eq!(cache.finish_buffer().await.unwrap_err().code, libc::EEXIST);
    let view = f.client.view().await?;
    assert_eq!(view.nodes.len(), 2);
    assert!(view.nodes.iter().any(|item| item.node.id == external.id));
    assert!(
        !view
            .nodes
            .iter()
            .any(|item| item.node.id == directory.id || item.node.id == leaf.id)
    );
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore]
async fn buffered_directory_attributes_keep_original_fence() -> anyhow::Result<()> {
    let f = Fixture::new().await?;
    let root = f.client.view().await?.nodes[0].node.id.clone();
    let directory = f
        .client
        .mutate(Mutation::Create {
            parent: root,
            name: "directory".into(),
            kind: Kind::Directory,
            mode: 0o700,
        })
        .await?
        .node
        .unwrap();
    let cache = MountCache::new(f.client.clone(), CacheLimits::default())?;
    cache.validation().await?;
    cache
        .mutate(Mutation::SetAttr {
            node: directory.id.clone(),
            base: directory.version.clone(),
            mode: Some(0o751),
            mtime_ms: Some(1000),
            handle: None,
        })
        .await?;
    cache.finish_buffer().await?;
    let directory = cache.object(&directory.id).await?.item.node;
    let committed = f.client.view().await?;
    let actual = committed
        .nodes
        .iter()
        .find(|item| item.node.id == directory.id)
        .unwrap();
    assert_eq!((actual.node.mode, actual.node.mtime_ms), (0o751, 1000));
    let before = f.client.counters.mutation_calls.load(Ordering::Relaxed);
    cache
        .mutate(Mutation::SetAttr {
            node: directory.id.clone(),
            base: directory.version.clone(),
            mode: Some(0o750),
            mtime_ms: Some(1234),
            handle: None,
        })
        .await?;
    let leaf = cache
        .mutate(Mutation::Create {
            parent: directory.id.clone(),
            name: "leaf".into(),
            kind: Kind::File,
            mode: 0o600,
        })
        .await?
        .node
        .unwrap();
    assert_eq!(
        f.client.counters.mutation_calls.load(Ordering::Relaxed),
        before
    );
    let latest = f
        .client
        .mutate(Mutation::SetAttr {
            node: directory.id.clone(),
            base: directory.version,
            mode: Some(0o755),
            mtime_ms: Some(5678),
            handle: None,
        })
        .await?
        .node
        .unwrap();
    assert_eq!(cache.finish_buffer().await.unwrap_err().code, libc::ESTALE);
    assert_eq!(cache.finish_buffer().await.unwrap_err().code, libc::ESTALE);
    let view = f.client.view().await?;
    assert!(!view.nodes.iter().any(|item| item.node.id == leaf.id));
    let actual = view
        .nodes
        .iter()
        .find(|item| item.node.id == directory.id)
        .unwrap();
    assert_eq!(actual.node, latest);
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore]
async fn directory_updates_remain_complete_during_concurrent_flush() -> anyhow::Result<()> {
    let f = Fixture::new().await?;
    let root = f.client.view().await?.nodes[0].node.id.clone();
    let directory = f
        .client
        .mutate(Mutation::Create {
            parent: root,
            name: "directory".into(),
            kind: Kind::Directory,
            mode: 0o700,
        })
        .await?
        .node
        .unwrap();
    let cache = Arc::new(MountCache::new(f.client.clone(), CacheLimits::default())?);
    let stop = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let flushing = {
        let cache = cache.clone();
        let stop = stop.clone();
        tokio::spawn(async move {
            while !stop.load(Ordering::Relaxed) {
                cache.flush_buffer(true).await?;
                cache.invalidate().await;
                tokio::task::yield_now().await;
            }
            Result::<()>::Ok(())
        })
    };
    for time in 1000..1064 {
        let node = cache.object(&directory.id).await?.item.node;
        cache
            .mutate(Mutation::SetAttr {
                node: node.id,
                base: node.version,
                mode: Some(0o750),
                mtime_ms: Some(time),
                handle: None,
            })
            .await?;
        tokio::task::yield_now().await;
    }
    stop.store(true, Ordering::Relaxed);
    flushing.await??;
    cache.finish_buffer().await?;
    let view = f.client.view().await?;
    let actual = view
        .nodes
        .iter()
        .find(|item| item.node.id == directory.id)
        .unwrap();
    assert_eq!((actual.node.mode, actual.node.mtime_ms), (0o750, 1063));
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore]
async fn partial_drain_retains_each_records_original_age() -> anyhow::Result<()> {
    let f = Fixture::new().await?;
    let root = f.client.view().await?.nodes[0].node.id.clone();
    let cache = MountCache::new(f.client.clone(), CacheLimits::default())?;
    let mut handles = Vec::new();
    for (name, size) in [
        ("older-a", MAX_BATCH_BYTES * 3 / 8),
        ("older-b", MAX_BATCH_BYTES * 3 / 8),
        ("younger", MAX_BATCH_BYTES * 3 / 8),
    ] {
        let node = cache
            .mutate(Mutation::Create {
                parent: root.clone(),
                name: name.into(),
                kind: Kind::File,
                mode: 0o600,
            })
            .await?
            .node
            .unwrap();
        let mut handle = cache.open_file(&node.id, libc::O_RDWR).await?;
        cache.write_file(&mut handle, 0, vec![42; size]).await?;
        handles.push(handle);
        if name == "older-b" {
            tokio::time::sleep(std::time::Duration::from_millis(110)).await;
        }
    }
    let before = f.client.counters.mutation_calls.load(Ordering::Relaxed);
    assert_eq!(before, 1);
    cache.flush_buffer(false).await?;
    assert_eq!(
        f.client.counters.mutation_calls.load(Ordering::Relaxed),
        before
    );
    tokio::time::sleep(std::time::Duration::from_millis(110)).await;
    cache
        .setattr_file(&mut handles[2], Some(0o640), Some(1234))
        .await?;
    cache.flush_buffer(false).await?;
    assert_eq!(
        f.client.counters.mutation_calls.load(Ordering::Relaxed),
        before + 1
    );
    cache.finish_buffer().await?;
    let view = f.client.view().await?;
    assert_eq!(view.nodes.len(), 4);
    assert_eq!(
        cache.read_file(&mut handles[2], 0, 1).await?.bytes,
        vec![42]
    );
    for handle in handles {
        cache.close_file(handle).await?;
    }
    Ok(())
}
