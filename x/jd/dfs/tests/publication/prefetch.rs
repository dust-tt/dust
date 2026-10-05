use super::*;
use dfs_poc::{
    cache::Cache,
    mount::{InvalidationBarrier, Mount, MountConfig, invalidate_cached_nodes},
    reader::ReadLimits,
};
use parking_lot::{Mutex, RwLock};
use std::{os::unix::fs::MetadataExt, time::Duration};

async fn server_client(endpoint: &str, server: &mut std::process::Child) -> Client {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(20);
    loop {
        assert!(server.try_wait().unwrap().is_none());
        if let Ok(client) = Client::connect(endpoint, "restart-prefetch", None).await {
            return client;
        }
        assert!(tokio::time::Instant::now() < deadline, "server readiness");
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
}

struct Server(std::process::Child);
impl Drop for Server {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn linux_completed_prefetch_cannot_cross_a_real_server_restart_with_unchanged_versions() {
    use std::os::unix::fs::FileExt;
    let directory = tempfile::tempdir().unwrap();
    let credentials = directory.path().join("credentials.json");
    std::fs::write(
        &credentials,
        serde_json::to_vec(&vec![Credential {
            token_hash: token_hash("restart-prefetch"),
            tenant: "tenant".into(),
            principal: "admin".into(),
            issuer: "test".into(),
            subject: "admin".into(),
            admin: true,
            scope: None,
            expires_ms: u64::MAX,
        }])
        .unwrap(),
    )
    .unwrap();
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    drop(listener);
    let endpoint = format!("http://{address}");
    let start = || {
        Server(
            std::process::Command::new(env!("CARGO_BIN_EXE_dfsd"))
                .arg("--db")
                .arg(directory.path().join("db"))
                .arg("--credentials")
                .arg(&credentials)
                .arg("--listen")
                .arg(address.to_string())
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .spawn()
                .unwrap(),
        )
    };
    let mut server = start();
    let client = server_client(&endpoint, &mut server.0).await;
    let root = client.view().await.unwrap().nodes[0].node.id.clone();
    let node = client
        .mutate(Mutation::Create {
            parent: root,
            name: "target".into(),
            kind: Kind::File,
            mode: 0o644,
        })
        .await
        .unwrap()
        .node
        .unwrap();
    let mutation = Mutation::Write {
        node: node.id,
        base: node.version,
        offset: 0,
        data: vec![b'x'; 32768],
        append: false,
        handle: None,
    };
    let identity = client.prepare_publication(&mutation).unwrap();
    let published = client.publish(identity, mutation).await.unwrap();
    let node = published.outcome.node.unwrap();
    client.persist_through(published.receipt).await.unwrap();
    let view = client.view().await.unwrap();
    let incarnation = view.incarnation.clone();
    let generation = view.auth_generation;
    let cache = Arc::new(Mutex::new(Cache::new(view, 0).unwrap()));
    let client_slot = Arc::new(RwLock::new(client.clone()));
    let mount = Mount::new(
        cache.clone(),
        client_slot.clone(),
        tokio::runtime::Handle::current(),
        MountConfig {
            uid: unsafe { libc::getuid() },
            gid: unsafe { libc::getgid() },
            read_ahead_bytes: 0,
            direct_io: false,
            kernel_prefetch: true,
            experimental_kernel_writeback: false,
            writeback_capacity: 128,
            read_limits: ReadLimits::default(),
            directory_snapshot_bytes: 1 << 20,
            publication_only_sync: false,
            publication_capacity: 100_000,
            inode_capacity: 200_000,
        },
    )
    .unwrap();
    let gate = mount.gate.clone();
    let transition = mount.transition.clone();
    let invalidating = mount.invalidating.clone();
    let inodes = mount.inodes.clone();
    let reader = mount.reader.clone();
    let notifier_slot = mount.notifier.clone();
    let path = directory.path().join("mount");
    std::fs::create_dir(&path).unwrap();
    let session = fuser::spawn_mount2(mount.into_driver(), &path, &[]).unwrap();
    let notifier = session.notifier();
    *notifier_slot.write() = Some(notifier.clone());
    let target = path.join("files/target");
    let opened = target.clone();
    let old_file = tokio::task::spawn_blocking(move || {
        let file = std::fs::File::open(opened).unwrap();
        let mut bytes = [0; 4096];
        assert_eq!(file.read_at(&mut bytes, 0).unwrap(), 4096);
        assert_eq!(bytes, [b'x'; 4096]);
        file
    })
    .await
    .unwrap();
    let ranges = vec![ReadRange {
        node: node.id.clone(),
        version: node.version.clone(),
        offset: 0,
        size: 32768,
    }];
    let Reply::Pack(parts) = client
        .call(Call::ReadPack {
            ranges: ranges.clone(),
        })
        .await
        .unwrap()
    else {
        panic!("prefetch reply")
    };
    let exclusion = transition.clone().lock_owned().await;
    let kernel = reader.kernel_cache().unwrap();
    let insertion_kernel = kernel.clone();
    let old_incarnation = incarnation.clone();
    let insertion = tokio::spawn(async move {
        insertion_kernel
            .insert(
                old_incarnation,
                generation,
                ranges.into_iter().zip(parts).collect(),
            )
            .await
    });
    drop(server);
    server = start();
    let fresh = server_client(&endpoint, &mut server.0).await;
    let view = fresh.view().await.unwrap();
    assert_ne!(view.incarnation, incarnation);
    assert_eq!(
        view.nodes
            .iter()
            .find(|item| item.node.id == node.id)
            .unwrap()
            .node
            .version,
        node.version
    );
    let barrier = InvalidationBarrier::new(invalidating);
    let retained = inodes.clone();
    let changed = tokio::task::spawn_blocking(move || {
        let _gate = gate.lock();
        let mut cache = cache.lock();
        retained.retain_active(|id| {
            cache
                .namespace
                .nodes
                .get(id)
                .is_some_and(|item| item.node.kind == Kind::Directory)
        });
        let changed = cache.replace(view).unwrap();
        *client_slot.write() = fresh;
        changed
    })
    .await
    .unwrap();
    drop(exclusion);
    tokio::task::spawn_blocking(move || {
        invalidate_cached_nodes(&notifier, &inodes, changed, Vec::new(), true, Vec::new()).unwrap()
    })
    .await
    .unwrap();
    barrier.complete();
    insertion.await.unwrap().unwrap();
    assert_eq!(kernel.snapshot()["store_calls"], 0);
    assert_eq!(kernel.snapshot()["stale_bytes"], 32768);
    tokio::task::spawn_blocking(move || {
        let mut bytes = [0; 4096];
        let error = old_file
            .read_at(&mut bytes, 0)
            .unwrap_err()
            .raw_os_error()
            .unwrap();
        assert!(
            [libc::ESTALE, libc::EIO].contains(&error),
            "unexpected errno {error}"
        );
        assert_eq!(std::fs::read(target).unwrap(), vec![b'x'; 32768]);
        drop(old_file);
        unmount(&path, session);
    })
    .await
    .unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn linux_inflight_prefetch_cannot_restore_overwritten_revoked_or_replaced_files() {
    for operation in ["overwrite", "revoke", "replace"] {
        let f = Fixture::new().await;
        let root = f.client.view().await.unwrap().nodes[0].node.id.clone();
        f.client
            .mutate(Mutation::Grant {
                node: root.clone(),
                subject: "writer".into(),
                verbs: ALL,
            })
            .await
            .unwrap();
        let node = f
            .client
            .mutate(Mutation::Create {
                parent: root.clone(),
                name: "target".into(),
                kind: Kind::File,
                mode: 0o644,
            })
            .await
            .unwrap()
            .node
            .unwrap();
        let node = f
            .client
            .mutate(Mutation::Write {
                node: node.id,
                base: node.version,
                offset: 0,
                data: vec![b'x'; 32768],
                append: false,
                handle: None,
            })
            .await
            .unwrap()
            .node
            .unwrap();
        let client = Client::connect(&f.endpoint, "writer", None).await.unwrap();
        let view = client.view().await.unwrap();
        let incarnation = view.incarnation.clone();
        let generation = view.auth_generation;
        let cache = Arc::new(Mutex::new(Cache::new(view, 0).unwrap()));
        let mount = Mount::new(
            cache.clone(),
            Arc::new(RwLock::new(client.clone())),
            tokio::runtime::Handle::current(),
            MountConfig {
                uid: unsafe { libc::getuid() },
                gid: unsafe { libc::getgid() },
                read_ahead_bytes: 0,
                direct_io: false,
                kernel_prefetch: true,
                experimental_kernel_writeback: false,
                writeback_capacity: 128,
                read_limits: ReadLimits::default(),
                directory_snapshot_bytes: 1 << 20,
                publication_only_sync: false,
                publication_capacity: 100_000,
                inode_capacity: 200_000,
            },
        )
        .unwrap();
        let gate = mount.gate.clone();
        let transition = mount.transition.clone();
        let invalidating = mount.invalidating.clone();
        let inodes = mount.inodes.clone();
        let reader = mount.reader.clone();
        let notifier_slot = mount.notifier.clone();
        let path = f.directory.path().join("prefetch-race");
        std::fs::create_dir(&path).unwrap();
        let session = fuser::spawn_mount2(mount.into_driver(), &path, &[]).unwrap();
        let notifier = session.notifier();
        *notifier_slot.write() = Some(notifier.clone());
        let file = path.join("files/target");
        let initial = file.clone();
        let old_ino = tokio::task::spawn_blocking(move || {
            assert_eq!(std::fs::read(&initial).unwrap(), vec![b'x'; 32768]);
            std::fs::metadata(initial).unwrap().ino()
        })
        .await
        .unwrap();
        let ranges = vec![ReadRange {
            node: node.id.clone(),
            version: node.version.clone(),
            offset: 0,
            size: 32768,
        }];
        f.pause.kind.store(2, Ordering::SeqCst);
        let rpc = client.clone();
        let requested = ranges.clone();
        let fetch =
            tokio::spawn(async move { rpc.call(Call::ReadPack { ranges: requested }).await });
        tokio::time::timeout(Duration::from_secs(5), f.pause.entered.notified())
            .await
            .unwrap();
        match operation {
            "overwrite" => {
                f.client
                    .mutate(Mutation::Write {
                        node: node.id.clone(),
                        base: node.version,
                        offset: 0,
                        data: vec![b'y'; 32768],
                        append: false,
                        handle: None,
                    })
                    .await
                    .unwrap();
            }
            "revoke" => {
                f.client
                    .mutate(Mutation::Grant {
                        node: root.clone(),
                        subject: "writer".into(),
                        verbs: WRITE | LIST | TRAVERSE,
                    })
                    .await
                    .unwrap();
            }
            _ => {
                f.client
                    .mutate(Mutation::Unlink {
                        parent: root.clone(),
                        name: "target".into(),
                        expected: node.entry_token,
                        directory: false,
                    })
                    .await
                    .unwrap();
                let replacement = f
                    .client
                    .mutate(Mutation::Create {
                        parent: root,
                        name: "target".into(),
                        kind: Kind::File,
                        mode: 0o644,
                    })
                    .await
                    .unwrap()
                    .node
                    .unwrap();
                f.client
                    .mutate(Mutation::Write {
                        node: replacement.id,
                        base: replacement.version,
                        offset: 0,
                        data: vec![b'z'; 32768],
                        append: false,
                        handle: None,
                    })
                    .await
                    .unwrap();
            }
        }
        let view = client.view().await.unwrap();
        let exclusion = transition.lock_owned().await;
        let barrier = InvalidationBarrier::new(invalidating);
        let refresh_cache = cache.clone();
        let removed = if operation == "replace" {
            vec![node.id.clone()]
        } else {
            Vec::new()
        };
        let changed = tokio::task::spawn_blocking(move || {
            let _gate = gate.lock();
            refresh_cache.lock().replace(view).unwrap()
        })
        .await
        .unwrap();
        drop(exclusion);
        let tracked = inodes.clone();
        tokio::task::spawn_blocking(move || {
            invalidate_cached_nodes(&notifier, &inodes, changed, removed, false, Vec::new())
                .unwrap()
        })
        .await
        .unwrap();
        barrier.complete();
        if operation == "replace" {
            let target = file.clone();
            let identity = node.id.clone();
            tokio::task::spawn_blocking(move || {
                assert_ne!(std::fs::metadata(target).unwrap().ino(), old_ino);
                let deadline = std::time::Instant::now() + Duration::from_secs(5);
                while tracked.is_active(old_ino, &identity) {
                    assert!(
                        std::time::Instant::now() < deadline,
                        "old lookup was not forgotten"
                    );
                    std::thread::sleep(Duration::from_millis(10));
                }
            })
            .await
            .unwrap();
        }
        f.pause.resume.notify_one();
        let Reply::Pack(parts) = fetch.await.unwrap().unwrap() else {
            panic!("missing prefetched parts")
        };
        let kernel = reader.kernel_cache().unwrap();
        kernel
            .insert(
                incarnation,
                generation,
                ranges.into_iter().zip(parts).collect(),
            )
            .await
            .unwrap();
        assert_eq!(kernel.snapshot()["store_calls"], 0);
        assert_eq!(kernel.snapshot()["stale_bytes"], 32768);
        assert_eq!(cache.lock().content.bytes, 0);
        tokio::task::spawn_blocking(move || {
            if operation == "revoke" {
                let error = std::fs::read(&file).unwrap_err().raw_os_error().unwrap();
                assert!(
                    [libc::EACCES, libc::EIO].contains(&error),
                    "unexpected errno {error}"
                );
            } else {
                assert_eq!(
                    std::fs::read(&file).unwrap(),
                    vec![if operation == "overwrite" { b'y' } else { b'z' }; 32768]
                );
                assert_eq!(std::fs::metadata(&file).unwrap().len(), 32768);
                if operation == "replace" {
                    assert_ne!(std::fs::metadata(&file).unwrap().ino(), old_ino);
                }
            }
            unmount(&path, session);
        })
        .await
        .unwrap();
    }
}
