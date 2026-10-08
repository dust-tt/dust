use super::*;
use dfs_poc::live::mount_cache::{Limits as CacheLimits, MountCache};
use std::time::{Duration, Instant};

async fn file(f: &Fixture) -> Node {
    let root = f.client.view().await.unwrap().nodes[0].node.id.clone();
    f.client
        .mutate(Mutation::Create {
            parent: root,
            name: "live".into(),
            kind: Kind::File,
            mode: 0o600,
        })
        .await
        .unwrap()
        .node
        .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn live_metadata_fences_writes_and_preserves_local_acknowledgements() {
    let f = Fixture::new().await;
    let node = file(&f).await;
    let cache = MountCache::new(f.client.clone(), CacheLimits::default()).unwrap();
    let mut opened = cache.open_file(&node.id, libc::O_RDWR).await.unwrap();
    let calls = f.client.counters.calls.load(Ordering::Relaxed);
    cache
        .write_file(&mut opened, 0, b"first".to_vec())
        .await
        .unwrap();
    cache
        .write_file(&mut opened, 0, b"local".to_vec())
        .await
        .unwrap();
    assert_eq!(f.client.counters.calls.load(Ordering::Relaxed) - calls, 2);
    tokio::time::sleep(Duration::from_millis(1020)).await;
    let calls = f.client.counters.calls.load(Ordering::Relaxed);
    cache
        .write_file(&mut opened, 0, b"local".to_vec())
        .await
        .unwrap();
    assert_eq!(f.client.counters.calls.load(Ordering::Relaxed) - calls, 1);
    cache.invalidate().await;
    cache.refresh_file(&mut opened).await.unwrap();
    let prior = opened.node().clone();
    let changed = f
        .client
        .mutate(Mutation::Write {
            node: prior.id.clone(),
            base: prior.version,
            offset: 0,
            data: b"other".to_vec(),
            append: false,
            handle: None,
        })
        .await
        .unwrap()
        .node
        .unwrap();
    assert_eq!(
        cache
            .write_file(&mut opened, 0, b"stale".to_vec())
            .await
            .unwrap_err()
            .code,
        libc::ESTALE
    );
    assert_eq!(
        cache.read_file(&mut opened, 0, 5).await.unwrap().bytes,
        b"other"
    );
    assert_eq!(opened.node().version, changed.version);
    let before = f.client.counters.calls.load(Ordering::Relaxed);
    for _ in 0..20 {
        let handle = cache.open_file(&node.id, libc::O_RDONLY).await.unwrap();
        cache.close_file(handle).await.unwrap();
        assert_eq!(
            cache.read_file(&mut opened, 0, 5).await.unwrap().bytes,
            b"other"
        );
    }
    assert_eq!(f.client.counters.calls.load(Ordering::Relaxed), before);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn live_receipts_survive_close_and_sync_is_not_repeated() {
    let f = Fixture::new().await;
    let node = file(&f).await;
    let cache = MountCache::new(f.client.clone(), CacheLimits::default()).unwrap();
    let mut opened = cache.open_file(&node.id, libc::O_RDWR).await.unwrap();
    let outcome = cache
        .write_file(&mut opened, 0, b"durable".to_vec())
        .await
        .unwrap();
    let root = f.client.view().await.unwrap().nodes[0].node.id.clone();
    let second = cache
        .mutate(Mutation::Create {
            parent: root,
            name: "second".into(),
            kind: Kind::File,
            mode: 0o600,
        })
        .await
        .unwrap()
        .node
        .unwrap();
    let mut second = cache.open_file(&second.id, libc::O_RDWR).await.unwrap();
    let second_outcome = cache
        .write_file(&mut second, 0, b"also durable".to_vec())
        .await
        .unwrap();
    let metrics = f.engine.metrics(&f.client.session.id).unwrap();
    assert!(metrics.persisted < outcome.head);
    cache.flush_file(&mut opened).await.unwrap();
    assert_eq!(
        f.engine.metrics(&f.client.session.id).unwrap().persisted,
        metrics.persisted
    );
    cache.close_file(opened).await.unwrap();
    let mut reopened = cache.open_file(&node.id, libc::O_RDONLY).await.unwrap();
    cache.sync_file(&mut reopened).await.unwrap();
    assert!(f.engine.metrics(&f.client.session.id).unwrap().persisted >= second_outcome.head);
    let calls = f.client.counters.calls.load(Ordering::Relaxed);
    cache.sync_file(&mut reopened).await.unwrap();
    cache.sync_file(&mut second).await.unwrap();
    cache.flush_file(&mut reopened).await.unwrap();
    assert_eq!(f.client.counters.calls.load(Ordering::Relaxed), calls);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn live_ambiguous_append_survives_close_without_duplicate_publication() {
    let f = Fixture::new().await;
    let node = file(&f).await;
    let cache = MountCache::new(f.client.clone(), CacheLimits::default()).unwrap();
    let mut opened = cache
        .open_file(&node.id, libc::O_WRONLY | libc::O_APPEND)
        .await
        .unwrap();
    f.lose.store(true, Ordering::SeqCst);
    assert!(
        cache
            .write_file(&mut opened, 0, b"once".to_vec())
            .await
            .is_err()
    );
    let published = f.engine.metrics(&f.client.session.id).unwrap().published;
    cache.close_file(opened).await.unwrap();
    f.lose.store(false, Ordering::SeqCst);
    let mut reopened = cache.open_file(&node.id, libc::O_RDWR).await.unwrap();
    cache.sync_file(&mut reopened).await.unwrap();
    assert_eq!(
        f.engine.metrics(&f.client.session.id).unwrap().published,
        published
    );
    assert_eq!(
        cache.read_file(&mut reopened, 0, 32).await.unwrap().bytes,
        b"once"
    );
    assert!(f.engine.metrics(&f.client.session.id).unwrap().persisted >= published);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn live_revision_expiry_detects_same_size_same_mtime_rewrite() {
    let f = Fixture::new().await;
    let node = file(&f).await;
    let cache = MountCache::new(f.client.clone(), CacheLimits::default()).unwrap();
    let mut opened = cache.open_file(&node.id, libc::O_RDWR).await.unwrap();
    cache
        .write_file(&mut opened, 0, b"before".to_vec())
        .await
        .unwrap();
    assert_eq!(
        cache.read_file(&mut opened, 0, 6).await.unwrap().bytes,
        b"before"
    );
    let selected = opened.node().clone();
    let deadline = Instant::now() + opened.freshness().unwrap().remaining_at(Instant::now());
    let changed = f
        .client
        .mutate(Mutation::Write {
            node: selected.id.clone(),
            base: selected.version,
            offset: 0,
            data: b"after!".to_vec(),
            append: false,
            handle: None,
        })
        .await
        .unwrap()
        .node
        .unwrap();
    f.client
        .mutate(Mutation::SetAttr {
            node: changed.id,
            base: changed.version,
            mode: None,
            mtime_ms: Some(selected.mtime_ms),
            handle: None,
        })
        .await
        .unwrap();
    tokio::time::sleep_until((deadline + Duration::from_millis(20)).into()).await;
    assert_eq!(
        cache.read_file(&mut opened, 0, 6).await.unwrap().bytes,
        b"after!"
    );
    assert_eq!(opened.node().mtime_ms, selected.mtime_ms);
}

#[cfg(target_os = "linux")]
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn live_two_mounts_follow_revision_and_preserve_unlinked_identity() {
    use dfs_poc::live::mount::Mount;
    use std::{io::Write, os::unix::fs::FileExt};
    let f = Fixture::new().await;
    let node = file(&f).await;
    f.client
        .mutate(Mutation::Write {
            node: node.id,
            base: node.version,
            offset: 0,
            data: b"before".to_vec(),
            append: false,
            handle: None,
        })
        .await
        .unwrap();
    let other = Client::connect(&f.endpoint, "publication", None)
        .await
        .unwrap();
    let first = f.directory.path().join("first");
    let second = f.directory.path().join("second");
    std::fs::create_dir(&first).unwrap();
    std::fs::create_dir(&second).unwrap();
    let runtime = tokio::runtime::Handle::current();
    let a = Mount::new(f.client.clone(), runtime.clone(), CacheLimits::default())
        .unwrap()
        .spawn(
            &first,
            &[fuser::MountOption::FSName("dfs-live-test-a".into())],
        )
        .unwrap();
    let b = Mount::new(other, runtime, CacheLimits::default())
        .unwrap()
        .spawn(
            &second,
            &[fuser::MountOption::FSName("dfs-live-test-b".into())],
        )
        .unwrap();
    tokio::task::spawn_blocking(move || {
        let path = first.join("files/live");
        let remote = second.join("files/live");
        let reader = std::fs::File::open(&path).unwrap();
        let mut bytes = [0; 6];
        reader.read_exact_at(&mut bytes, 0).unwrap();
        assert_eq!(&bytes, b"before");
        let timestamp = std::fs::metadata(&remote).unwrap().modified().unwrap();
        let mut writer = std::fs::OpenOptions::new()
            .write(true)
            .open(&remote)
            .unwrap();
        writer.write_all(b"after!").unwrap();
        writer.set_modified(timestamp).unwrap();
        writer.sync_all().unwrap();
        std::thread::sleep(Duration::from_millis(1050));
        reader.read_exact_at(&mut bytes, 0).unwrap();
        assert_eq!(&bytes, b"after!");
        assert_eq!(
            std::fs::metadata(&path).unwrap().modified().unwrap(),
            timestamp
        );
        assert!(!first.join("files/new").exists());
        std::fs::write(second.join("files/new"), b"replacement").unwrap();
        std::thread::sleep(Duration::from_millis(1050));
        assert_eq!(
            std::fs::read(first.join("files/new")).unwrap(),
            b"replacement"
        );
        std::fs::rename(second.join("files/new"), &remote).unwrap();
        std::thread::sleep(Duration::from_millis(1050));
        assert_eq!(std::fs::read(&path).unwrap(), b"replacement");
        reader.read_exact_at(&mut bytes, 0).unwrap();
        assert_eq!(&bytes, b"after!");
        drop(reader);
        drop(writer);
        for mount in [&first, &second] {
            assert!(
                std::process::Command::new("fusermount3")
                    .arg("-u")
                    .arg(mount)
                    .status()
                    .unwrap()
                    .success()
            );
        }
        a.shutdown().unwrap();
        b.shutdown().unwrap();
    })
    .await
    .unwrap();
}

#[cfg(target_os = "linux")]
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn live_delayed_content_does_not_block_metadata_and_revalidates() {
    use dfs_poc::live::mount::Mount;
    let f = Fixture::new().await;
    let node = file(&f).await;
    let node = f
        .client
        .mutate(Mutation::Write {
            node: node.id,
            base: node.version,
            offset: 0,
            data: b"before".to_vec(),
            append: false,
            handle: None,
        })
        .await
        .unwrap()
        .node
        .unwrap();
    f.client
        .mutate(Mutation::Create {
            parent: node.parent.clone().unwrap(),
            name: "independent".into(),
            kind: Kind::File,
            mode: 0o600,
        })
        .await
        .unwrap();
    let mountpoint = f.directory.path().join("mount");
    std::fs::create_dir(&mountpoint).unwrap();
    let mount = Mount::new(
        f.client.clone(),
        tokio::runtime::Handle::current(),
        CacheLimits::default(),
    )
    .unwrap()
    .spawn(
        &mountpoint,
        &[fuser::MountOption::FSName("dfs-live-delayed".into())],
    )
    .unwrap();
    let read_path = mountpoint.join("files/live");
    f.pause.kind.store(1, Ordering::SeqCst);
    let read = tokio::task::spawn_blocking(move || std::fs::read(read_path));
    tokio::time::timeout(Duration::from_secs(5), f.pause.entered.notified())
        .await
        .unwrap();
    let metadata_path = mountpoint.join("files/independent");
    tokio::time::timeout(
        Duration::from_millis(500),
        tokio::task::spawn_blocking(move || std::fs::metadata(metadata_path)),
    )
    .await
    .unwrap()
    .unwrap()
    .unwrap();
    f.client
        .mutate(Mutation::Truncate {
            node: node.id,
            base: node.version,
            size: 3,
            handle: None,
        })
        .await
        .unwrap();
    tokio::time::sleep(Duration::from_millis(1050)).await;
    f.pause.resume.notify_one();
    assert_eq!(read.await.unwrap().unwrap(), b"bef");
    tokio::task::spawn_blocking(move || {
        assert!(
            std::process::Command::new("fusermount3")
                .arg("-u")
                .arg(&mountpoint)
                .status()
                .unwrap()
                .success()
        );
        mount.shutdown().unwrap();
    })
    .await
    .unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn live_cached_read_checks_expiry_ranges_and_local_revision() {
    let f = Fixture::new().await;
    let node = file(&f).await;
    let cache = MountCache::new(f.client.clone(), CacheLimits::default()).unwrap();
    let mut opened = cache.open_file(&node.id, libc::O_RDWR).await.unwrap();
    let bytes: Vec<u8> = (0..CHUNK_BYTES + 8)
        .map(|index| (index % 251) as u8)
        .collect();
    cache
        .write_file(&mut opened, 0, bytes.clone())
        .await
        .unwrap();
    assert!(
        cache
            .try_read_file(&mut opened, 0, bytes.len() as u32)
            .unwrap()
            .is_none()
    );
    assert_eq!(
        cache
            .read_file(&mut opened, 0, bytes.len() as u32)
            .await
            .unwrap()
            .bytes,
        bytes
    );
    let calls = f.client.counters.calls.load(Ordering::Relaxed);
    assert_eq!(
        cache
            .try_read_file(&mut opened, CHUNK_BYTES as u64 - 3, 11)
            .unwrap()
            .unwrap(),
        bytes[CHUNK_BYTES - 3..]
    );
    assert_eq!(
        cache
            .try_read_file(&mut opened, bytes.len() as u64, 32)
            .unwrap()
            .unwrap(),
        Vec::<u8>::new()
    );
    assert_eq!(f.client.counters.calls.load(Ordering::Relaxed), calls);
    cache.truncate_file(&mut opened, 3).await.unwrap();
    assert!(cache.try_read_file(&mut opened, 0, 10).unwrap().is_none());
    assert_eq!(
        cache.read_file(&mut opened, 0, 10).await.unwrap().bytes,
        bytes[..3]
    );
    assert_eq!(
        cache.try_read_file(&mut opened, 0, 10).unwrap().unwrap(),
        bytes[..3]
    );
    tokio::time::sleep(Duration::from_millis(1050)).await;
    assert!(cache.try_read_file(&mut opened, 0, 10).unwrap().is_none());
    assert_eq!(f.client.counters.calls.load(Ordering::Relaxed), calls + 2);
}

#[cfg(target_os = "linux")]
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn live_readdirplus_populates_bounded_kernel_metadata_and_cached_reads() {
    use dfs_poc::live::mount::Mount;
    let f = Fixture::new().await;
    let root = f.client.view().await.unwrap().nodes[0].node.id.clone();
    let mut target = None;
    for index in 0..64 {
        let node = f
            .client
            .mutate(Mutation::Create {
                parent: root.clone(),
                name: format!("entry-{index:03}"),
                kind: Kind::File,
                mode: 0o600,
            })
            .await
            .unwrap()
            .node
            .unwrap();
        if index == 63 {
            target = Some(node);
        }
    }
    let path = f.directory.path().join("mount");
    std::fs::create_dir(&path).unwrap();
    let mount = Mount::new(
        f.client.clone(),
        tokio::runtime::Handle::current(),
        CacheLimits::default(),
    )
    .unwrap();
    let counters = mount.counters.clone();
    let session = mount
        .spawn(&path, &[fuser::MountOption::FSName("dfs-live-plus".into())])
        .unwrap();
    let files = path.join("files");
    let entries: Vec<_> = std::fs::read_dir(&files)
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .collect();
    assert_eq!(entries.len(), 64);
    assert!(counters.readdirplus.load(Ordering::Relaxed) > 0);
    let lookup = counters.lookup.load(Ordering::Relaxed);
    let attrs = counters.getattr.load(Ordering::Relaxed);
    for path in &entries {
        assert_eq!(std::fs::metadata(path).unwrap().len(), 0);
    }
    assert_eq!(counters.lookup.load(Ordering::Relaxed), lookup);
    assert_eq!(counters.getattr.load(Ordering::Relaxed), attrs);
    let target = target.unwrap();
    f.client
        .mutate(Mutation::Write {
            node: target.id,
            base: target.version,
            offset: 0,
            data: b"new revision".to_vec(),
            append: false,
            handle: None,
        })
        .await
        .unwrap();
    tokio::time::sleep(Duration::from_millis(1050)).await;
    assert_eq!(std::fs::read_dir(&files).unwrap().count(), 64);
    let target = files.join("entry-063");
    assert_eq!(std::fs::metadata(&target).unwrap().len(), 12);
    assert_eq!(std::fs::read(&target).unwrap(), b"new revision");
    let reads = counters.cached_read.load(Ordering::Relaxed);
    let calls = f.client.counters.data_calls.load(Ordering::Relaxed);
    assert_eq!(std::fs::read(&target).unwrap(), b"new revision");
    assert!(counters.cached_read.load(Ordering::Relaxed) > reads);
    assert_eq!(f.client.counters.data_calls.load(Ordering::Relaxed), calls);
    session.shutdown().unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn live_directory_reply_expiry_revalidates_unchanged_attributes() {
    let f = Fixture::new().await;
    let node = file(&f).await;
    let cache = MountCache::new(f.client.clone(), CacheLimits::default()).unwrap();
    let mut previous = cache.directory(node.parent.as_deref()).await.unwrap();
    previous.freshness = dfs_poc::live::freshness::Freshness::from_validation_started_at(
        Instant::now() - Duration::from_secs(2),
    );
    let calls = f.client.counters.calls.load(Ordering::Relaxed);
    let current = cache
        .revalidate_directory(node.parent.as_deref(), &previous, Duration::ZERO)
        .await
        .unwrap();
    assert!(!current.freshness.requires_refresh_at(Instant::now()));
    assert_eq!(f.client.counters.calls.load(Ordering::Relaxed), calls + 1);
    f.client
        .mutate(Mutation::SetAttr {
            node: node.id,
            base: node.version,
            mode: Some(0o640),
            mtime_ms: None,
            handle: None,
        })
        .await
        .unwrap();
    let error = cache
        .revalidate_directory(node.parent.as_deref(), &previous, Duration::ZERO)
        .await
        .err()
        .unwrap();
    assert_eq!(error.code, libc::ESTALE);
}

#[cfg(target_os = "linux")]
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn live_default_binary_refreshes_revision_and_preserves_cli_ownership() {
    use std::os::unix::fs::MetadataExt;
    let f = Fixture::new().await;
    let node = file(&f).await;
    let token = f.directory.path().join("token");
    std::fs::write(&token, "publication").unwrap();
    let path = f.directory.path().join("default-mount");
    std::fs::create_dir(&path).unwrap();
    let mut process = tokio::process::Command::new(env!("CARGO_BIN_EXE_dfs-mount"))
        .args(["--endpoint", &f.endpoint, "--token-file"])
        .arg(&token)
        .arg("--mountpoint")
        .arg(&path)
        .args(["--uid", "4242", "--gid", "4243", "--cache-bytes", "1048576"])
        .kill_on_drop(true)
        .spawn()
        .unwrap();
    let deadline = Instant::now() + Duration::from_secs(10);
    while !std::process::Command::new("mountpoint")
        .arg("-q")
        .arg(&path)
        .status()
        .unwrap()
        .success()
    {
        assert!(process.try_wait().unwrap().is_none());
        assert!(Instant::now() < deadline);
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    let mounted = path.join("files/live");
    let metadata = std::fs::metadata(&mounted).unwrap();
    assert_eq!((metadata.uid(), metadata.gid()), (4242, 4243));
    assert!(std::fs::read(&mounted).unwrap().is_empty());
    f.client
        .mutate(Mutation::Write {
            node: node.id,
            base: node.version,
            offset: 0,
            data: b"changed".to_vec(),
            append: false,
            handle: None,
        })
        .await
        .unwrap();
    tokio::time::sleep(Duration::from_millis(1050)).await;
    assert_eq!(std::fs::read(&mounted).unwrap(), b"changed");
    assert_eq!(
        unsafe { libc::kill(process.id().unwrap() as i32, libc::SIGTERM) },
        0
    );
    assert!(
        tokio::time::timeout(Duration::from_secs(10), process.wait())
            .await
            .unwrap()
            .unwrap()
            .success()
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn live_content_hash_reuse_and_bounded_batches() -> anyhow::Result<()> {
    let f = Fixture::new().await;
    let client = &f.client;

    let root = client.view().await?.nodes[0].node.id.clone();
    let mut node = client
        .mutate(Mutation::Create {
            parent: root.clone(),
            name: "hash-reuse".into(),
            kind: Kind::File,
            mode: 0o600,
        })
        .await?
        .node
        .unwrap();
    let mut body = [
        vec![b'a'; CHUNK_BYTES],
        vec![b'b'; CHUNK_BYTES],
        vec![b'c'; CHUNK_BYTES],
    ]
    .concat();
    node = client
        .mutate(Mutation::Write {
            node: node.id.clone(),
            base: node.version,
            offset: 0,
            data: body.clone(),
            append: false,
            handle: None,
        })
        .await?
        .node
        .unwrap();
    let cache = MountCache::new(client.clone(), CacheLimits::default())?;
    let mut handle = cache.open_file(&node.id, libc::O_RDONLY).await?;
    assert_eq!(
        cache
            .read_file(&mut handle, 0, body.len() as u32)
            .await?
            .bytes,
        body
    );
    let payload = || {
        client
            .counters
            .block_chunk_bytes
            .load(std::sync::atomic::Ordering::Relaxed)
    };
    let before = payload();
    node = client
        .mutate(Mutation::SetAttr {
            node: node.id.clone(),
            base: node.version,
            mode: Some(0o640),
            mtime_ms: None,
            handle: None,
        })
        .await?
        .node
        .unwrap();
    cache.invalidate().await;
    assert_eq!(
        cache
            .read_file(&mut handle, 0, body.len() as u32)
            .await?
            .bytes,
        body
    );
    assert_eq!(payload(), before);
    node = client
        .mutate(Mutation::Write {
            node: node.id.clone(),
            base: node.version,
            offset: CHUNK_BYTES as u64,
            data: vec![b'd'; CHUNK_BYTES],
            append: false,
            handle: None,
        })
        .await?
        .node
        .unwrap();
    body[CHUNK_BYTES..2 * CHUNK_BYTES].fill(b'd');
    cache.invalidate().await;
    assert_eq!(
        cache
            .read_file(&mut handle, 0, body.len() as u32)
            .await?
            .bytes,
        body
    );
    assert_eq!(payload() - before, CHUNK_BYTES as u64);
    let range = BlockRead {
        node: node.id.clone(),
        version: node.version.clone(),
        offset: 0,
        size: 1,
        handle: None,
        known: vec![],
    };
    let mut absent = range.clone();
    absent.node = "absent".into();
    let Reply::Blocks(pages) = client
        .call(Call::ReadBlocks {
            ranges: vec![range.clone(), absent],
        })
        .await?
    else {
        panic!("block reply");
    };
    assert!(pages[0].is_ok());
    assert!(pages[1].is_err());
    assert_eq!(
        client
            .call(Call::ReadBlocks {
                ranges: vec![range.clone(); MAX_BLOCK_REQUESTS + 1]
            })
            .await
            .unwrap_err()
            .code,
        libc::E2BIG
    );
    let cold = MountCache::new(
        client.clone(),
        CacheLimits {
            concurrent_reads: 16,
            ..CacheLimits::default()
        },
    )?;
    let observation = cold.lookup(Some(&root), "hash-reuse").await?;
    let before = client
        .counters
        .block_batches
        .load(std::sync::atomic::Ordering::Relaxed);
    let reads = futures::future::join_all((0..16).map(|_| cold.read(&observation, 0, 1))).await;
    for read in reads {
        assert_eq!(read?.bytes, b"a");
    }
    assert!(
        client
            .counters
            .block_batches
            .load(std::sync::atomic::Ordering::Relaxed)
            - before
            < 16
    );
    let empty = MountCache::new(
        client.clone(),
        CacheLimits {
            content_bytes: 0,
            ..CacheLimits::default()
        },
    )?;
    let observation = empty.lookup(Some(&root), "hash-reuse").await?;
    assert_eq!(
        empty.read(&observation, 0, body.len() as u32).await?.bytes,
        body
    );
    assert_eq!(empty.content_stats().resident_bytes, 0);
    cache.close_file(handle).await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn buffered_batch_retains_identity_after_lost_reply_and_close() {
    let f = Fixture::new().await;
    let cache = MountCache::new(f.client.clone(), CacheLimits::default()).unwrap();
    let root = f.client.view().await.unwrap().nodes[0].node.id.clone();
    let node = cache
        .mutate(Mutation::Create {
            parent: root,
            name: "buffered-lost".into(),
            kind: Kind::File,
            mode: 0o600,
        })
        .await
        .unwrap()
        .node
        .unwrap();
    let mut handle = cache.open_file(&node.id, libc::O_RDWR).await.unwrap();
    cache
        .write_file(&mut handle, 0, b"once".to_vec())
        .await
        .unwrap();
    cache.close_file(handle).await.unwrap();
    f.lose.store(true, Ordering::SeqCst);
    assert_eq!(
        cache.finish_buffer().await.unwrap_err().code,
        libc::ETIMEDOUT
    );
    let published = f.engine.metrics(&f.client.session.id).unwrap().published;
    f.lose.store(false, Ordering::SeqCst);
    cache.finish_buffer().await.unwrap();
    assert_eq!(
        f.engine.metrics(&f.client.session.id).unwrap().published,
        published
    );
    let mut handle = cache.open_file(&node.id, libc::O_RDONLY).await.unwrap();
    assert_eq!(
        cache.read_file(&mut handle, 0, 32).await.unwrap().bytes,
        b"once"
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn buffered_partial_batch_retains_identity_and_unpublished_file() {
    let f = Fixture::new().await;
    let cache = MountCache::new(f.client.clone(), CacheLimits::default()).unwrap();
    let root = f.client.view().await.unwrap().nodes[0].node.id.clone();
    let mut handles = Vec::new();
    for n in 0..2 {
        let node = cache
            .mutate(Mutation::Create {
                parent: root.clone(),
                name: format!("partial-{n}"),
                kind: Kind::File,
                mode: 0o600,
            })
            .await
            .unwrap()
            .node
            .unwrap();
        let mut handle = cache.open_file(&node.id, libc::O_RDWR).await.unwrap();
        cache
            .write_file(&mut handle, 0, vec![n; 600 << 10])
            .await
            .unwrap();
        if n == 0 {
            cache
                .write_file(&mut handle, 600 << 10, vec![0; 600 << 10])
                .await
                .unwrap();
        }
        handles.push(handle);
    }
    f.lose.store(true, Ordering::SeqCst);
    assert_eq!(
        cache
            .write_file(&mut handles[1], 600 << 10, vec![1; 600 << 10])
            .await
            .unwrap_err()
            .code,
        libc::ETIMEDOUT
    );
    let view = f.client.view().await.unwrap();
    assert_eq!(view.nodes.len(), 2);
    assert!(
        view.nodes
            .iter()
            .any(|item| item.node.id == handles[0].node().id)
    );
    f.lose.store(false, Ordering::SeqCst);
    cache.finish_buffer().await.unwrap();
    assert_eq!(f.client.view().await.unwrap().nodes.len(), 3);
    assert_eq!(
        cache
            .read_file(&mut handles[0], 0, 600 << 10)
            .await
            .unwrap()
            .bytes,
        vec![0; 600 << 10]
    );
    assert_eq!(
        cache
            .read_file(&mut handles[0], 600 << 10, 600 << 10)
            .await
            .unwrap()
            .bytes,
        vec![0; 600 << 10]
    );
    assert_eq!(
        cache
            .read_file(&mut handles[1], 0, 600 << 10)
            .await
            .unwrap()
            .bytes,
        vec![1; 600 << 10]
    );
}
