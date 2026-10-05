use dfs_poc::{
    client::Client,
    engine::{Engine, Limits, token_hash},
    model::*,
    rpc::{Service, decode},
    wire::{
        Frame,
        dfs_server::{Dfs, DfsServer},
    },
};
use std::sync::{
    Arc,
    atomic::{AtomicBool, AtomicU8, Ordering},
};
use tonic::{Request, Response, Status};

#[cfg(target_os = "linux")]
#[path = "publication/prefetch.rs"]
mod prefetch;

#[cfg(target_os = "linux")]
fn unmount(path: &std::path::Path, session: fuser::BackgroundSession) {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    loop {
        let output = std::process::Command::new("/bin/fusermount3")
            .args(["-u", "--"])
            .arg(path)
            .output()
            .unwrap();
        if output.status.success() {
            break;
        }
        let message = String::from_utf8_lossy(&output.stderr);
        assert!(
            message.contains("Device or resource busy") && std::time::Instant::now() < deadline,
            "unmount {}: {message}",
            path.display()
        );
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
    drop(session);
}

#[derive(Default)]
struct ReadPause {
    kind: AtomicU8,
    entered: tokio::sync::Notify,
    resume: tokio::sync::Notify,
}

#[derive(Clone)]
struct LostReplies {
    service: Service,
    engine: Arc<Engine>,
    lose: Arc<AtomicBool>,
    logout: Arc<AtomicBool>,
    reject: Arc<AtomicBool>,
    pause: Arc<ReadPause>,
}
#[tonic::async_trait]
impl Dfs for LostReplies {
    type SnapshotStream = <Service as Dfs>::SnapshotStream;
    type WatchStream = <Service as Dfs>::WatchStream;
    async fn call(&self, request: Request<Frame>) -> std::result::Result<Response<Frame>, Status> {
        let envelope: Envelope = decode(request.get_ref().clone()).unwrap();
        if matches!(envelope.call, Call::Mutate { .. }) && self.reject.load(Ordering::SeqCst) {
            return Err(Status::resource_exhausted("publication admission"));
        }
        let reply = self.service.call(request).await?;
        let kind = match envelope.call {
            Call::Read { .. } => 1,
            Call::ReadPack { .. } => 2,
            Call::Mutate { .. } => 3,
            Call::RenewWriteback { .. } => 4,
            _ => 0,
        };
        if kind != 0
            && self
                .pause
                .kind
                .compare_exchange(kind, 0, Ordering::SeqCst, Ordering::SeqCst)
                .is_ok()
        {
            self.pause.entered.notify_one();
            self.pause.resume.notified().await;
        }
        if matches!(envelope.call, Call::Mutate { .. })
            && self.lose.load(Ordering::SeqCst)
            && decode::<Result<Reply>>(reply.get_ref().clone())
                .unwrap()
                .is_ok()
        {
            if self.logout.swap(false, Ordering::SeqCst) {
                self.engine.logout(&envelope.session);
            }
            return Err(Status::unavailable("publication reply lost"));
        }
        Ok(reply)
    }
    async fn snapshot(
        &self,
        request: Request<Frame>,
    ) -> std::result::Result<Response<Self::SnapshotStream>, Status> {
        self.service.snapshot(request).await
    }
    async fn watch(
        &self,
        request: Request<Frame>,
    ) -> std::result::Result<Response<Self::WatchStream>, Status> {
        self.service.watch(request).await
    }
}
struct Fixture {
    directory: tempfile::TempDir,
    engine: Arc<Engine>,
    client: Client,
    endpoint: String,
    lose: Arc<AtomicBool>,
    logout: Arc<AtomicBool>,
    reject: Arc<AtomicBool>,
    pause: Arc<ReadPause>,
    server: tokio::task::JoinHandle<()>,
}
impl Fixture {
    async fn new() -> Self {
        Self::with_limits(Limits::default()).await
    }
    async fn with_limits(limits: Limits) -> Self {
        let directory = tempfile::tempdir().unwrap();
        let engine = Arc::new(
            Engine::open(
                directory.path().join("db"),
                vec![
                    Credential {
                        token_hash: token_hash("publication"),
                        tenant: "tenant".into(),
                        principal: "admin".into(),
                        issuer: "test".into(),
                        subject: "admin".into(),
                        admin: true,
                        scope: None,
                        expires_ms: u64::MAX,
                    },
                    Credential {
                        token_hash: token_hash("writer"),
                        tenant: "tenant".into(),
                        principal: "writer".into(),
                        issuer: "test".into(),
                        subject: "writer".into(),
                        admin: false,
                        scope: None,
                        expires_ms: u64::MAX,
                    },
                ],
                limits,
            )
            .unwrap(),
        );
        let lose = Arc::new(AtomicBool::new(false));
        let logout = Arc::new(AtomicBool::new(false));
        let reject = Arc::new(AtomicBool::new(false));
        let pause = Arc::new(ReadPause::default());
        let service = LostReplies {
            service: Service::new(engine.clone()),
            engine: engine.clone(),
            lose: lose.clone(),
            logout: logout.clone(),
            reject: reject.clone(),
            pause: pause.clone(),
        };
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint = format!("http://{}", listener.local_addr().unwrap());
        let server = tokio::spawn(async move {
            tonic::transport::Server::builder()
                .add_service(DfsServer::new(service))
                .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
                .await
                .unwrap();
        });
        let client = Client::connect(&endpoint, "publication", None)
            .await
            .unwrap();
        Self {
            directory,
            engine,
            client,
            endpoint,
            lose,
            logout,
            reject,
            pause,
            server,
        }
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        self.server.abort();
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn lost_replies_and_session_loss_resolve_without_republishing() {
    for logout in [false, true] {
        let f = Fixture::new().await;
        let root = f.client.view().await.unwrap().nodes[0].node.id.clone();
        let mutation = Mutation::Create {
            parent: root,
            name: "once".into(),
            kind: Kind::File,
            mode: 0o600,
        };
        let identity = f.client.prepare_publication(&mutation).unwrap();
        assert!(
            f.client
                .resolve_publication(identity.clone())
                .await
                .unwrap()
                .is_none()
        );
        f.lose.store(true, Ordering::SeqCst);
        f.logout.store(logout, Ordering::SeqCst);
        assert_eq!(
            f.client
                .publish(identity.clone(), mutation)
                .await
                .unwrap_err()
                .code,
            libc::ETIMEDOUT
        );
        f.lose.store(false, Ordering::SeqCst);
        let new_client = Client::connect(&f.endpoint, "publication", None)
            .await
            .unwrap();
        let metrics = f.engine.metrics(&new_client.session.id).unwrap();
        assert_eq!(metrics.published, 1);
        assert_eq!(metrics.persisted, 0);
        let publication = new_client
            .resolve_publication(identity)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(publication.outcome.node.as_ref().unwrap().name, "once");
        let confirmation = new_client
            .persist_through(publication.receipt)
            .await
            .unwrap();
        assert_eq!(confirmation.engine_prefix, 1);
        assert_eq!(
            f.engine.metrics(&new_client.session.id).unwrap().published,
            1
        );
    }
}

#[cfg(target_os = "linux")]
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn linux_fsync_persists_recovers_lost_writes_and_retains_errors_on_close() {
    use dfs_poc::{
        cache::Cache,
        mount::{Mount, MountConfig},
        reader::ReadLimits,
    };
    use parking_lot::{Mutex, RwLock};
    use std::{
        io::{Read, Seek, SeekFrom, Write},
        os::fd::IntoRawFd,
    };
    for publication_only_sync in [false, true] {
        let f = Fixture::new().await;
        let path = f.directory.path().join("mount");
        std::fs::create_dir(&path).unwrap();
        let cache = Arc::new(Mutex::new(
            Cache::new(f.client.view().await.unwrap(), 0).unwrap(),
        ));
        let mount = Mount::new(
            cache,
            Arc::new(RwLock::new(f.client.clone())),
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
                publication_only_sync,
                publication_capacity: if publication_only_sync { 3 } else { 100_000 },
                inode_capacity: 200_000,
            },
        )
        .unwrap();
        let notifier = mount.notifier.clone();
        let session = fuser::spawn_mount2(
            mount.into_driver(),
            &path,
            &[fuser::MountOption::FSName("dfs-publication-test".into())],
        )
        .unwrap();
        *notifier.write() = Some(session.notifier());
        let engine = f.engine.clone();
        let client_session = f.client.session.id.clone();
        let lose = f.lose.clone();
        tokio::task::spawn_blocking(move || {
            let mut file = std::fs::OpenOptions::new()
                .read(true)
                .write(true)
                .create(true)
                .truncate(true)
                .open(path.join("files/file"))
                .unwrap();
            file.write_all(b"before").unwrap();
            assert_eq!(engine.metrics(&client_session).unwrap().persisted, 0);
            file.sync_all().unwrap();
            if publication_only_sync {
                std::fs::File::open(path.join("files"))
                    .unwrap()
                    .sync_all()
                    .unwrap();
                assert_eq!(engine.metrics(&client_session).unwrap().persisted, 0);
                for index in 0..8 {
                    let other = path.join(format!("files/other-{index}"));
                    std::fs::write(&other, b"published").unwrap();
                    std::fs::remove_file(other).unwrap();
                }
                lose.store(true, Ordering::SeqCst);
                file.seek(SeekFrom::Start(0)).unwrap();
                assert_eq!(
                    file.write(b"uncertain").unwrap_err().raw_os_error(),
                    Some(libc::ETIMEDOUT)
                );
                let published = engine.metrics(&client_session).unwrap().published;
                lose.store(false, Ordering::SeqCst);
                file.sync_all().unwrap();
                assert_eq!(
                    engine.metrics(&client_session).unwrap().published,
                    published
                );
                assert_eq!(engine.metrics(&client_session).unwrap().persisted, 0);
                drop(file);
                unmount(&path, session);
                return;
            }
            assert_eq!(engine.metrics(&client_session).unwrap().pending_bytes, 0);
            lose.store(true, Ordering::SeqCst);
            file.seek(SeekFrom::Start(0)).unwrap();
            assert_eq!(
                file.write(b"published despite timeout")
                    .unwrap_err()
                    .raw_os_error(),
                Some(libc::ETIMEDOUT)
            );
            let published = engine.metrics(&client_session).unwrap().published;
            assert!(engine.metrics(&client_session).unwrap().pending_bytes > 0);
            lose.store(false, Ordering::SeqCst);
            file.sync_all().unwrap();
            assert_eq!(
                engine.metrics(&client_session).unwrap().published,
                published
            );
            assert_eq!(
                engine.metrics(&client_session).unwrap().persisted,
                published
            );
            file.seek(SeekFrom::Start(0)).unwrap();
            let mut contents = String::new();
            file.read_to_string(&mut contents).unwrap();
            assert_eq!(contents, "published despite timeout");
            assert_eq!(file.metadata().unwrap().len(), contents.len() as u64);
            std::fs::create_dir(path.join("files/directory")).unwrap();
            std::fs::rename(path.join("files/file"), path.join("files/renamed")).unwrap();
            assert!(engine.metrics(&client_session).unwrap().pending_bytes > 0);
            std::fs::File::open(path.join("files"))
                .unwrap()
                .sync_all()
                .unwrap();
            assert_eq!(engine.metrics(&client_session).unwrap().pending_bytes, 0);
            assert!(path.join("files/renamed").exists());
            assert!(!path.join("files/file").exists());
            file.write_all(b"unpersisted").unwrap();
            engine.fail_sync.store(true, Ordering::SeqCst);
            assert_eq!(file.sync_all().unwrap_err().raw_os_error(), Some(libc::EIO));
            let fd = file.into_raw_fd();
            assert_eq!(unsafe { libc::close(fd) }, -1);
            assert_eq!(
                std::io::Error::last_os_error().raw_os_error(),
                Some(libc::EIO)
            );
            unmount(&path, session);
        })
        .await
        .unwrap();
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn admission_rejection_does_not_become_an_unknown_publication() {
    let f = Fixture::new().await;
    let root = f.client.view().await.unwrap().nodes[0].node.id.clone();
    let mutation = Mutation::Create {
        parent: root,
        name: "admission".into(),
        kind: Kind::File,
        mode: 0o600,
    };
    let publication = f.client.prepare_publication(&mutation).unwrap();
    f.reject.store(true, Ordering::SeqCst);
    assert_eq!(
        f.client
            .publish(publication.clone(), mutation.clone())
            .await
            .unwrap_err()
            .code,
        libc::EAGAIN
    );
    assert!(
        f.client
            .resolve_publication(publication.clone())
            .await
            .unwrap()
            .is_none()
    );
    assert_eq!(f.engine.metrics(&f.client.session.id).unwrap().published, 0);
    f.reject.store(false, Ordering::SeqCst);
    f.client.publish(publication, mutation).await.unwrap();
    assert_eq!(f.engine.metrics(&f.client.session.id).unwrap().published, 1);
}

#[cfg(target_os = "linux")]
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn linux_inode_lifetimes_survive_unlink_and_reclaim_after_close_and_snapshot_failure() {
    use dfs_poc::{
        cache::Cache,
        mount::{Mount, MountConfig},
        reader::ReadLimits,
    };
    use parking_lot::{Mutex, RwLock};
    use std::{
        io::{Read, Seek, SeekFrom, Write},
        os::unix::fs::MetadataExt,
    };
    for directory_snapshot_bytes in [1 << 20, 128] {
        let f = Fixture::new().await;
        let path = f.directory.path().join("mount");
        std::fs::create_dir(&path).unwrap();
        let mount = Mount::new(
            Arc::new(Mutex::new(
                Cache::new(f.client.view().await.unwrap(), 0).unwrap(),
            )),
            Arc::new(RwLock::new(f.client.clone())),
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
                directory_snapshot_bytes,
                publication_only_sync: false,
                publication_capacity: 100_000,
                inode_capacity: 36,
            },
        )
        .unwrap();
        let inodes = mount.inodes.clone();
        let notifier = mount.notifier.clone();
        let session = fuser::spawn_mount2(
            mount.into_driver(),
            &path,
            &[fuser::MountOption::FSName("dfs-inodes-test".into())],
        )
        .unwrap();
        *notifier.write() = Some(session.notifier());
        let engine = f.engine.clone();
        let client_session = f.client.session.id.clone();
        tokio::task::spawn_blocking(move || {
            let directory = path.join("files");
            for index in 0..32 {
                let filename = directory.join(format!("file-{index}"));
                let mut original = std::fs::OpenOptions::new()
                    .read(true)
                    .write(true)
                    .create_new(true)
                    .open(&filename)
                    .unwrap();
                original.write_all(b"original").unwrap();
                original.sync_all().unwrap();
                let old_ino = original.metadata().unwrap().ino();
                let mut read_only = std::fs::File::open(&filename).unwrap();
                std::fs::remove_file(&filename).unwrap();
                let mut replacement = std::fs::OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(&filename)
                    .unwrap();
                replacement.write_all(b"replacement").unwrap();
                replacement.sync_all().unwrap();
                assert_ne!(old_ino, replacement.metadata().unwrap().ino());
                original.seek(SeekFrom::Start(0)).unwrap();
                let mut bytes = Vec::new();
                original.read_to_end(&mut bytes).unwrap();
                assert_eq!(bytes, b"original");
                assert_eq!(original.metadata().unwrap().len(), 8);
                assert_eq!(original.metadata().unwrap().nlink(), 0);
                drop(original);
                let mut read_only_bytes = Vec::new();
                read_only.read_to_end(&mut read_only_bytes).unwrap();
                assert_eq!(read_only_bytes, b"original");
                assert_eq!(read_only.metadata().unwrap().nlink(), 0);
                assert_eq!(std::fs::read(&filename).unwrap(), b"replacement");
            }
            let limit_path = directory.join("limit");
            let limit_file = std::fs::File::create(&limit_path).unwrap();
            let published = engine.metrics(&client_session).unwrap().published;
            assert_eq!(
                std::fs::File::create(directory.join("overflow"))
                    .unwrap_err()
                    .raw_os_error(),
                Some(libc::ENFILE)
            );
            assert_eq!(
                engine.metrics(&client_session).unwrap().published,
                published
            );
            std::fs::remove_file(&limit_path).unwrap();
            drop(limit_file);
            let mut entries = std::fs::read_dir(&directory).unwrap();
            if directory_snapshot_bytes == 128 {
                assert_eq!(
                    entries.next().unwrap().unwrap_err().raw_os_error(),
                    Some(libc::ENOMEM)
                );
            } else {
                let first = entries.next().unwrap().unwrap();
                assert_eq!(first.metadata().unwrap().len(), 11);
                assert!(inodes.snapshot()["directory_references"].as_u64().unwrap() >= 32);
            }
            for index in 0..32 {
                std::fs::remove_file(directory.join(format!("file-{index}"))).unwrap();
            }
            drop(entries);
            let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
            loop {
                let stats = inodes.snapshot();
                if stats["records"] == 3
                    && stats["open_references"] == 0
                    && stats["inflight_references"] == 0
                    && stats["directory_references"] == 0
                {
                    assert_eq!(stats["open_references"], 0);
                    assert_eq!(stats["inflight_references"], 0);
                    assert_eq!(stats["directory_references"], 0);
                    assert!(stats["reclaimed"].as_u64().unwrap() >= 64);
                    break;
                }
                assert!(
                    std::time::Instant::now() < deadline,
                    "unreclaimed inode state: {stats}"
                );
                std::thread::sleep(std::time::Duration::from_millis(10));
            }
            unmount(&path, session);
        })
        .await
        .unwrap();
    }
}

#[cfg(target_os = "linux")]
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn linux_adjacent_prefetch_populates_kernel_pages_with_zero_daemon_residency() {
    use dfs_poc::{
        cache::Cache,
        mount::{Mount, MountConfig},
        reader::ReadLimits,
    };
    use parking_lot::{Mutex, RwLock};
    let f = Fixture::new().await;
    let root = f.client.view().await.unwrap().nodes[0].node.id.clone();
    for index in 0..8 {
        let node = f
            .client
            .mutate(Mutation::Create {
                parent: root.clone(),
                name: format!("prefetch-{index}"),
                kind: Kind::File,
                mode: 0o644,
            })
            .await
            .unwrap()
            .node
            .unwrap();
        f.client
            .mutate(Mutation::Write {
                node: node.id,
                base: node.version,
                offset: 0,
                data: vec![index as u8; 32768],
                append: false,
                handle: None,
            })
            .await
            .unwrap();
    }
    let path = f.directory.path().join("kernel-mount");
    std::fs::create_dir(&path).unwrap();
    let cache = Arc::new(Mutex::new(
        Cache::new(f.client.view().await.unwrap(), 0).unwrap(),
    ));
    let mount = Mount::new(
        cache.clone(),
        Arc::new(RwLock::new(f.client.clone())),
        tokio::runtime::Handle::current(),
        MountConfig {
            uid: unsafe { libc::getuid() },
            gid: unsafe { libc::getgid() },
            read_ahead_bytes: 256 << 10,
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
    let reader = mount.reader.clone();
    let operations = mount.operations.clone();
    let notifier = mount.notifier.clone();
    let session = fuser::spawn_mount2(
        mount.into_driver(),
        &path,
        &[fuser::MountOption::FSName(
            "dfs-kernel-prefetch-test".into(),
        )],
    )
    .unwrap();
    *notifier.write() = Some(session.notifier());
    tokio::task::spawn_blocking(move || {
        for index in 0..8 {
            assert_eq!(
                std::fs::metadata(path.join(format!("files/prefetch-{index}")))
                    .unwrap()
                    .len(),
                32768
            );
        }
        for index in 0..2 {
            assert_eq!(
                std::fs::read(path.join(format!("files/prefetch-{index}"))).unwrap(),
                vec![index as u8; 32768]
            );
        }
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
        while reader.kernel_snapshot()["store_notification_bytes"]
            .as_u64()
            .unwrap()
            < 6 * 32768
        {
            assert!(
                std::time::Instant::now() < deadline,
                "prefetch did not finish: {}",
                reader.kernel_snapshot()
            );
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        let before = operations.snapshot()["read"].as_u64().unwrap();
        for index in 2..8 {
            assert_eq!(
                std::fs::read(path.join(format!("files/prefetch-{index}"))).unwrap(),
                vec![index as u8; 32768]
            );
        }
        assert_eq!(operations.snapshot()["read"].as_u64().unwrap(), before);
        assert_eq!(cache.lock().content.bytes, 0);
        assert_eq!(reader.kernel_snapshot()["refetch_bytes"], 0);
        unmount(&path, session);
    })
    .await
    .unwrap();
}

#[cfg(target_os = "linux")]
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn linux_kernel_store_allows_read_progress_and_orders_truncate_before_stale_insertion() {
    use dfs_poc::{
        cache::Cache,
        mount::{Mount, MountConfig},
        reader::ReadLimits,
    };
    use parking_lot::{Mutex, RwLock};
    use std::{io::Write, time::Duration};
    let f = Fixture::new().await;
    let root = f.client.view().await.unwrap().nodes[0].node.id.clone();
    let mut nodes = Vec::new();
    for name in ["race", "other"] {
        let node = f
            .client
            .mutate(Mutation::Create {
                parent: root.clone(),
                name: name.into(),
                kind: Kind::File,
                mode: 0o644,
            })
            .await
            .unwrap()
            .node
            .unwrap();
        nodes.push(
            f.client
                .mutate(Mutation::Write {
                    node: node.id,
                    base: node.version,
                    offset: 0,
                    data: vec![42; 32768],
                    append: false,
                    handle: None,
                })
                .await
                .unwrap()
                .node
                .unwrap(),
        );
    }
    let view = f.client.view().await.unwrap();
    let incarnation = view.incarnation.clone();
    let generation = view.auth_generation;
    let path = f.directory.path().join("kernel-race");
    std::fs::create_dir(&path).unwrap();
    let mount = Mount::new(
        Arc::new(Mutex::new(Cache::new(view, 0).unwrap())),
        Arc::new(RwLock::new(f.client.clone())),
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
    let reader = mount.reader.clone();
    let operations = mount.operations.clone();
    let notifier = mount.notifier.clone();
    let session = fuser::spawn_mount2(
        mount.into_driver(),
        &path,
        &[fuser::MountOption::FSName("dfs-kernel-race".into())],
    )
    .unwrap();
    *notifier.write() = Some(session.notifier());
    let kernel = reader.kernel_cache().unwrap();
    f.pause.kind.store(1, Ordering::SeqCst);
    let read_path = path.join("files/race");
    let demand = tokio::task::spawn_blocking(move || std::fs::read(read_path).unwrap());
    tokio::time::timeout(Duration::from_secs(5), f.pause.entered.notified())
        .await
        .unwrap();
    let range = ReadRange {
        node: nodes[0].id.clone(),
        version: nodes[0].version.clone(),
        offset: 0,
        size: 32768,
    };
    let insertion = {
        let kernel = kernel.clone();
        let range = range.clone();
        let incarnation = incarnation.clone();
        tokio::spawn(async move {
            kernel
                .insert(incarnation, generation, vec![(range, vec![42; 32768])])
                .await
        })
    };
    tokio::time::timeout(Duration::from_secs(5), async {
        while kernel.snapshot()["store_calls"] == 0 {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    assert!(!insertion.is_finished());
    let write_path = path.join("files/race");
    let mutation = tokio::task::spawn_blocking(move || {
        let mut file = std::fs::File::create(write_path).unwrap();
        file.write_all(b"new").unwrap();
        file.sync_all().unwrap();
    });
    tokio::time::timeout(Duration::from_secs(5), async {
        while operations.snapshot()["pending_mutations"] == 0 {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    let other_path = path.join("files/other");
    let other = tokio::task::spawn_blocking(move || std::fs::read(other_path).unwrap());
    let progressed = tokio::time::timeout(Duration::from_secs(2), other).await;
    f.pause.resume.notify_one();
    assert_eq!(
        tokio::time::timeout(Duration::from_secs(5), demand)
            .await
            .unwrap()
            .unwrap(),
        vec![42; 32768]
    );
    tokio::time::timeout(Duration::from_secs(5), insertion)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    tokio::time::timeout(Duration::from_secs(5), mutation)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(progressed.unwrap().unwrap(), vec![42; 32768]);
    let calls = kernel.snapshot()["store_calls"].as_u64().unwrap();
    kernel
        .insert(incarnation, generation, vec![(range, vec![42; 32768])])
        .await
        .unwrap();
    assert_eq!(kernel.snapshot()["store_calls"].as_u64().unwrap(), calls);
    assert_eq!(kernel.snapshot()["stale_bytes"], 32768);
    tokio::task::spawn_blocking(move || {
        assert_eq!(std::fs::metadata(path.join("files/race")).unwrap().len(), 3);
        assert_eq!(std::fs::read(path.join("files/race")).unwrap(), b"new");
        unmount(&path, session);
    })
    .await
    .unwrap();
}

#[cfg(target_os = "linux")]
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn linux_delayed_metadata_replies_precede_remote_change_invalidation() {
    use dfs_poc::{
        cache::Cache,
        mount::{InvalidationBarrier, Mount, MountConfig, invalidate_cached_nodes},
        reader::ReadLimits,
    };
    use parking_lot::{Mutex, RwLock};
    use std::{os::unix::fs::PermissionsExt, time::Duration};

    for operation in ["create", "mkdir", "setattr"] {
        let f = Fixture::new().await;
        let root = f.client.view().await.unwrap().nodes[0].node.id.clone();
        if operation == "setattr" {
            f.client
                .mutate(Mutation::Create {
                    parent: root.clone(),
                    name: "target".into(),
                    kind: Kind::File,
                    mode: 0o644,
                })
                .await
                .unwrap();
        }
        let path = f.directory.path().join("delayed-metadata");
        std::fs::create_dir(&path).unwrap();
        let cache = Arc::new(Mutex::new(
            Cache::new(f.client.view().await.unwrap(), 0).unwrap(),
        ));
        let mount = Mount::new(
            cache.clone(),
            Arc::new(RwLock::new(f.client.clone())),
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
        let notifier_slot = mount.notifier.clone();
        let session = fuser::spawn_mount2(
            mount.into_driver(),
            &path,
            &[fuser::MountOption::FSName("dfs-metadata-race".into())],
        )
        .unwrap();
        let notifier = session.notifier();
        *notifier_slot.write() = Some(notifier.clone());
        f.pause.kind.store(3, Ordering::SeqCst);
        let target = path.join("files/target");
        let callback = tokio::task::spawn_blocking(move || match operation {
            "create" => std::fs::File::create(target).map(drop),
            "mkdir" => std::fs::create_dir(target),
            _ => std::fs::set_permissions(target, std::fs::Permissions::from_mode(0o640)),
        });
        tokio::time::timeout(Duration::from_secs(5), f.pause.entered.notified())
            .await
            .unwrap();
        assert!(gate.try_lock().is_none());
        let node = f
            .client
            .view()
            .await
            .unwrap()
            .nodes
            .into_iter()
            .find(|item| item.visible_name == "target")
            .unwrap()
            .node;
        if operation == "setattr" {
            f.client
                .mutate(Mutation::SetAttr {
                    node: node.id,
                    base: node.version,
                    mode: Some(0o600),
                    mtime_ms: None,
                    handle: None,
                })
                .await
                .unwrap();
        } else {
            f.client
                .mutate(Mutation::Unlink {
                    parent: root,
                    name: "target".into(),
                    expected: node.entry_token,
                    directory: operation == "mkdir",
                })
                .await
                .unwrap();
        }
        let view = f.client.view().await.unwrap();
        let refresh_started = Arc::new(tokio::sync::Notify::new());
        let started = refresh_started.clone();
        let refresh = tokio::spawn(async move {
            started.notify_one();
            let transition = transition.lock_owned().await;
            let barrier = InvalidationBarrier::new(invalidating);
            let changed = tokio::task::spawn_blocking(move || {
                let _guard = gate.lock();
                cache.lock().replace(view).unwrap()
            })
            .await
            .unwrap();
            drop(transition);
            tokio::task::spawn_blocking(move || {
                invalidate_cached_nodes(&notifier, &inodes, changed, Vec::new(), false, Vec::new())
                    .unwrap();
            })
            .await
            .unwrap();
            barrier.complete();
        });
        refresh_started.notified().await;
        tokio::task::yield_now().await;
        assert!(!refresh.is_finished());
        f.pause.resume.notify_one();
        let result = tokio::time::timeout(Duration::from_secs(5), callback)
            .await
            .unwrap()
            .unwrap();
        if operation != "create" {
            result.unwrap();
        }
        tokio::time::timeout(Duration::from_secs(5), refresh)
            .await
            .unwrap()
            .unwrap();
        tokio::task::spawn_blocking(move || {
            let target = path.join("files/target");
            if operation == "setattr" {
                assert_eq!(
                    std::fs::metadata(target).unwrap().permissions().mode() & 0o777,
                    0o600
                );
            } else {
                assert_eq!(
                    std::fs::metadata(target).unwrap_err().raw_os_error(),
                    Some(libc::ENOENT)
                );
                assert!(
                    !std::fs::read_dir(path.join("files"))
                        .unwrap()
                        .any(|entry| entry.unwrap().file_name() == "target")
                );
            }
            unmount(&path, session);
        })
        .await
        .unwrap();
    }
}

#[cfg(target_os = "linux")]
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn linux_namespace_capacity_rejects_create_before_publication() {
    use dfs_poc::{
        cache::{Cache, NamespaceLimits},
        mount::{Mount, MountConfig},
        reader::ReadLimits,
    };
    use parking_lot::{Mutex, RwLock};
    for nodes_limited in [true, false] {
        let f = Fixture::new().await;
        let view = f.client.view().await.unwrap();
        let bytes = view
            .nodes
            .iter()
            .map(ViewNode::namespace_bytes)
            .sum::<usize>();
        let limits = NamespaceLimits {
            nodes: if nodes_limited { 1 } else { 32 },
            bytes: if nodes_limited { 1 << 20 } else { bytes + 4095 },
        };
        let path = f.directory.path().join("namespace-limit");
        std::fs::create_dir(&path).unwrap();
        let mount = Mount::new(
            Arc::new(Mutex::new(Cache::with_limits(view, 0, limits).unwrap())),
            Arc::new(RwLock::new(f.client.clone())),
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
        let session = fuser::spawn_mount2(
            mount.into_driver(),
            &path,
            &[fuser::MountOption::FSName("dfs-namespace-limit".into())],
        )
        .unwrap();
        tokio::task::spawn_blocking(move || {
            assert_eq!(
                std::fs::File::create(path.join("files/file"))
                    .unwrap_err()
                    .raw_os_error(),
                Some(libc::EOVERFLOW)
            );
            assert_eq!(
                std::fs::create_dir(path.join("files/directory"))
                    .unwrap_err()
                    .raw_os_error(),
                Some(libc::EOVERFLOW)
            );
            assert_eq!(std::fs::read_dir(path.join("files")).unwrap().count(), 0);
            unmount(&path, session);
        })
        .await
        .unwrap();
        assert_eq!(f.engine.metrics(&f.client.session.id).unwrap().published, 0);
        assert_eq!(f.client.view().await.unwrap().nodes.len(), 1);
    }
}

#[cfg(target_os = "linux")]
#[path = "publication/writeback.rs"]
mod writeback;
