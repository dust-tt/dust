use super::*;
use dfs_poc::{
    cache::Cache,
    mount::{Mount, MountConfig},
    reader::ReadLimits,
};
use parking_lot::{Mutex, RwLock};
use std::{
    io::{Read, Seek, SeekFrom, Write},
    os::{fd::IntoRawFd, unix::fs::FileExt},
    path::PathBuf,
};

async fn mounted(f: &Fixture) -> (PathBuf, fuser::BackgroundSession) {
    let (path, session, _) = mounted_as(f, &f.client).await;
    (path, session)
}

async fn mounted_as(
    f: &Fixture,
    client: &Client,
) -> (
    PathBuf,
    fuser::BackgroundSession,
    Arc<dfs_poc::mount::MountCounters>,
) {
    let _ = tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .try_init();
    let path = f.directory.path().join("writeback-mount");
    std::fs::create_dir(&path).unwrap();
    let mount = Mount::new(
        Arc::new(Mutex::new(
            Cache::new(client.view().await.unwrap(), 0).unwrap(),
        )),
        Arc::new(RwLock::new(client.clone())),
        tokio::runtime::Handle::current(),
        MountConfig {
            uid: unsafe { libc::getuid() },
            gid: unsafe { libc::getgid() },
            read_ahead_bytes: 0,
            direct_io: false,
            kernel_prefetch: true,
            experimental_kernel_writeback: true,
            writeback_capacity: 8,
            read_limits: ReadLimits::default(),
            directory_snapshot_bytes: 1 << 20,
            publication_only_sync: false,
            publication_capacity: 100_000,
            inode_capacity: 200_000,
        },
    )
    .unwrap();
    let notifier = mount.notifier.clone();
    let operations = mount.operations.clone();
    let session = fuser::spawn_mount2(
        mount.into_driver(),
        &path,
        &[fuser::MountOption::FSName("dfs-writeback-test".into())],
    )
    .unwrap();
    *notifier.write() = Some(session.notifier());
    (path, session, operations)
}

async fn seed(f: &Fixture, name: &str, bytes: &[u8]) -> Node {
    let root = f.client.view().await.unwrap().nodes[0].node.id.clone();
    let node = f
        .client
        .mutate(Mutation::Create {
            parent: root,
            name: name.into(),
            kind: Kind::File,
            mode: 0o600,
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
            data: bytes.to_vec(),
            append: false,
            handle: None,
        })
        .await
        .unwrap()
        .node
        .unwrap()
}

fn remote_bytes(runtime: &tokio::runtime::Handle, client: &Client, id: &str) -> Vec<u8> {
    let Reply::Node(node) = runtime
        .block_on(client.call(Call::Stat {
            node: id.into(),
            handle: None,
        }))
        .unwrap()
    else {
        panic!()
    };
    let Reply::Data(bytes) = runtime
        .block_on(client.call(Call::Read {
            node: node.id,
            version: Some(node.version),
            offset: 0,
            size: node.size as u32,
            handle: None,
        }))
        .unwrap()
    else {
        panic!()
    };
    bytes
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn linux_writeback_partial_pages_shared_handles_append_truncate_and_close() {
    let f = Fixture::new().await;
    let original = vec![b'x'; 8192];
    let node = seed(&f, "shared", &original).await;
    let remote = Client::connect(&f.endpoint, "publication", None)
        .await
        .unwrap();
    let (path, session) = mounted(&f).await;
    let runtime = tokio::runtime::Handle::current();
    let engine = f.engine.clone();
    let local_session = f.client.session.id.clone();
    tokio::task::spawn_blocking(move || {
        let target = path.join("files/shared");
        let first = std::fs::OpenOptions::new()
            .write(true)
            .open(&target)
            .unwrap();
        let second = std::fs::OpenOptions::new()
            .write(true)
            .open(&target)
            .unwrap();
        assert_eq!(
            runtime
                .block_on(remote.call(Call::Open {
                    node: node.id.clone(),
                    write: true
                }))
                .unwrap_err()
                .code,
            libc::EBUSY
        );
        let before = engine.metrics(&local_session).unwrap().published;
        for offset in 0..256 {
            first
                .write_at(&[b'a' + (offset % 26) as u8], offset)
                .unwrap();
        }
        second.write_at(b"second", 4100).unwrap();
        second.sync_all().unwrap();
        let after = engine.metrics(&local_session).unwrap();
        assert!(
            after.published - before < 32,
            "small writes did not coalesce"
        );
        assert_eq!(after.pending_bytes, 0);
        let mut expected = original;
        for (offset, byte) in expected.iter_mut().take(256).enumerate() {
            *byte = b'a' + (offset % 26) as u8;
        }
        expected[4100..4106].copy_from_slice(b"second");
        assert_eq!(remote_bytes(&runtime, &remote, &node.id), expected);
        let mut append = std::fs::OpenOptions::new()
            .append(true)
            .open(&target)
            .unwrap();
        append.write_all(b"append-one").unwrap();
        append.write_all(b"-two").unwrap();
        append.sync_all().unwrap();
        expected.extend_from_slice(b"append-one-two");
        assert_eq!(remote_bytes(&runtime, &remote, &node.id), expected);
        use std::os::unix::fs::OpenOptionsExt;
        let direct = std::fs::OpenOptions::new()
            .write(true)
            .custom_flags(libc::O_DIRECT)
            .open(&target)
            .unwrap();
        let mut aligned = std::ptr::null_mut();
        assert_eq!(unsafe { libc::posix_memalign(&mut aligned, 4096, 4096) }, 0);
        unsafe {
            std::ptr::write_bytes(aligned.cast::<u8>(), b'd', 4096);
        }
        let bytes = unsafe { std::slice::from_raw_parts(aligned.cast::<u8>(), 4096) };
        direct.write_at(bytes, 0).unwrap();
        unsafe {
            libc::free(aligned);
        }
        direct.sync_all().unwrap();
        expected[..4096].fill(b'd');
        assert_eq!(remote_bytes(&runtime, &remote, &node.id), expected);
        drop(direct);
        first.set_len(4120).unwrap();
        second.write_at(b"tail", 4116).unwrap();
        first.sync_all().unwrap();
        expected.truncate(4120);
        expected[4116..4120].copy_from_slice(b"tail");
        assert_eq!(remote_bytes(&runtime, &remote, &node.id), expected);
        drop(append);
        drop(first);
        drop(second);
        let mut close_only = std::fs::OpenOptions::new()
            .write(true)
            .open(&target)
            .unwrap();
        close_only.write_all(b"close").unwrap();
        let fd = close_only.into_raw_fd();
        assert_eq!(unsafe { libc::close(fd) }, 0);
        expected[..5].copy_from_slice(b"close");
        assert_eq!(remote_bytes(&runtime, &remote, &node.id), expected);
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
        loop {
            match runtime.block_on(remote.call(Call::Open {
                node: node.id.clone(),
                write: true,
            })) {
                Ok(Reply::Handle(handle, _)) => {
                    runtime
                        .block_on(remote.call(Call::Close { handle }))
                        .unwrap();
                    break;
                }
                Err(error) if error.code == libc::EBUSY && std::time::Instant::now() < deadline => {
                    std::thread::sleep(std::time::Duration::from_millis(10))
                }
                result => panic!("ownership not released: {result:?}"),
            }
        }
        unmount(&path, session);
    })
    .await
    .unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn linux_writeback_renews_ownership_and_keeps_unlinked_mapping_alive() {
    use std::os::fd::AsRawFd;
    let f = Fixture::with_limits(Limits {
        writer_lease_ms: 900,
        ..Limits::default()
    })
    .await;
    let node = seed(&f, "mapped", &vec![0; 4096]).await;
    let remote = Client::connect(&f.endpoint, "publication", None)
        .await
        .unwrap();
    let (path, session) = mounted(&f).await;
    let runtime = tokio::runtime::Handle::current();
    tokio::task::spawn_blocking(move || {
        let target = path.join("files/mapped");
        let file = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open(&target)
            .unwrap();
        let mapping = unsafe {
            libc::mmap(
                std::ptr::null_mut(),
                4096,
                libc::PROT_READ | libc::PROT_WRITE,
                libc::MAP_SHARED,
                file.as_raw_fd(),
                0,
            )
        };
        assert_ne!(mapping, libc::MAP_FAILED);
        unsafe {
            std::ptr::copy_nonoverlapping(b"mapped".as_ptr(), mapping.cast::<u8>(), 6);
        }
        drop(file);
        std::thread::sleep(std::time::Duration::from_millis(1800));
        assert_eq!(
            runtime
                .block_on(remote.call(Call::Open {
                    node: node.id.clone(),
                    write: true
                }))
                .unwrap_err()
                .code,
            libc::EBUSY
        );
        assert_eq!(unsafe { libc::msync(mapping, 4096, libc::MS_SYNC) }, 0);
        assert_eq!(&remote_bytes(&runtime, &remote, &node.id)[..6], b"mapped");
        std::fs::rename(&target, path.join("files/renamed")).unwrap();
        let mut retained = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open(path.join("files/renamed"))
            .unwrap();
        std::fs::remove_file(path.join("files/renamed")).unwrap();
        unsafe {
            std::ptr::copy_nonoverlapping(b"unlinked".as_ptr(), mapping.cast::<u8>(), 8);
        }
        assert_eq!(unsafe { libc::msync(mapping, 4096, libc::MS_SYNC) }, 0);
        retained.sync_all().unwrap();
        retained.seek(SeekFrom::Start(0)).unwrap();
        let mut actual = [0; 8];
        retained.read_exact(&mut actual).unwrap();
        assert_eq!(&actual, b"unlinked");
        assert_eq!(unsafe { libc::munmap(mapping, 4096) }, 0);
        drop(retained);
        unmount(&path, session);
    })
    .await
    .unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn linux_writeback_rejected_batch_poison_survives_fsync_close_and_new_open() {
    let f = Fixture::new().await;
    let node = seed(&f, "failed", b"unchanged").await;
    let (path, session) = mounted(&f).await;
    let reject = f.reject.clone();
    let remote = Client::connect(&f.endpoint, "publication", None)
        .await
        .unwrap();
    let runtime = tokio::runtime::Handle::current();
    tokio::task::spawn_blocking(move || {
        let target = path.join("files/failed");
        let mut first = std::fs::OpenOptions::new()
            .write(true)
            .open(&target)
            .unwrap();
        let second = std::fs::OpenOptions::new()
            .write(true)
            .open(&target)
            .unwrap();
        first.write_all(b"rejected!").unwrap();
        reject.store(true, Ordering::SeqCst);
        assert_eq!(
            first.sync_all().unwrap_err().raw_os_error(),
            Some(libc::EAGAIN)
        );
        reject.store(false, Ordering::SeqCst);
        assert_eq!(
            second.sync_all().unwrap_err().raw_os_error(),
            Some(libc::EAGAIN)
        );
        for file in [first, second] {
            assert_eq!(unsafe { libc::close(file.into_raw_fd()) }, -1);
            assert_eq!(
                std::io::Error::last_os_error().raw_os_error(),
                Some(libc::EAGAIN)
            );
        }
        assert_eq!(
            std::fs::OpenOptions::new()
                .write(true)
                .open(&target)
                .unwrap_err()
                .raw_os_error(),
            Some(libc::EAGAIN)
        );
        assert_eq!(remote_bytes(&runtime, &remote, &node.id), b"unchanged");
        std::fs::write(path.join("files/healthy"), b"other inode progresses").unwrap();
        unmount(&path, session);
    })
    .await
    .unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn linux_writeback_unknown_publication_resolves_without_clearing_inode_failure() {
    let f = Fixture::new().await;
    let node = seed(&f, "unknown", b"original").await;
    let (path, session) = mounted(&f).await;
    let lose = f.lose.clone();
    let remote = Client::connect(&f.endpoint, "publication", None)
        .await
        .unwrap();
    let engine = f.engine.clone();
    let runtime = tokio::runtime::Handle::current();
    tokio::task::spawn_blocking(move || {
        let target = path.join("files/unknown");
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .open(&target)
            .unwrap();
        file.write_all(b"accepted").unwrap();
        lose.store(true, Ordering::SeqCst);
        assert_eq!(
            file.sync_all().unwrap_err().raw_os_error(),
            Some(libc::ETIMEDOUT)
        );
        let published = engine.metrics(&remote.session.id).unwrap().published;
        lose.store(false, Ordering::SeqCst);
        assert_eq!(
            file.sync_all().unwrap_err().raw_os_error(),
            Some(libc::ETIMEDOUT)
        );
        assert_eq!(
            engine.metrics(&remote.session.id).unwrap().published,
            published
        );
        assert_eq!(remote_bytes(&runtime, &remote, &node.id), b"accepted");
        assert_eq!(unsafe { libc::close(file.into_raw_fd()) }, -1);
        assert_eq!(
            std::io::Error::last_os_error().raw_os_error(),
            Some(libc::ETIMEDOUT)
        );
        assert_eq!(
            std::fs::File::open(target).unwrap_err().raw_os_error(),
            Some(libc::ETIMEDOUT)
        );
        unmount(&path, session);
    })
    .await
    .unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn linux_writeback_permission_loss_rejects_dirty_pages_and_write_only_falls_back() {
    use std::os::fd::AsRawFd;
    for write_only in [false, true] {
        let f = Fixture::new().await;
        let node = seed(&f, "authority", b"original").await;
        let root = f
            .client
            .view()
            .await
            .unwrap()
            .nodes
            .iter()
            .find(|item| item.node.kind == Kind::Directory)
            .unwrap()
            .node
            .id
            .clone();
        f.client
            .mutate(Mutation::Grant {
                node: root.clone(),
                subject: "writer".into(),
                verbs: TRAVERSE | LIST | WRITE | if write_only { 0 } else { READ },
            })
            .await
            .unwrap();
        let client = Client::connect(&f.endpoint, "writer", None).await.unwrap();
        let (path, session, _) = mounted_as(&f, &client).await;
        let admin = f.client.clone();
        let runtime = tokio::runtime::Handle::current();
        tokio::task::spawn_blocking(move || {
            let target = path.join("files/authority");
            let mut file = std::fs::OpenOptions::new()
                .write(true)
                .open(&target)
                .unwrap();
            if write_only {
                file.write_all(b"fallback").unwrap();
                assert_eq!(remote_bytes(&runtime, &admin, &node.id), b"fallback");
                let Reply::Handle(handle, _) = runtime
                    .block_on(admin.call(Call::Open {
                        node: node.id.clone(),
                        write: true,
                    }))
                    .unwrap()
                else {
                    panic!()
                };
                runtime
                    .block_on(admin.call(Call::Close { handle }))
                    .unwrap();
                let mapping = unsafe {
                    libc::mmap(
                        std::ptr::null_mut(),
                        4096,
                        libc::PROT_WRITE,
                        libc::MAP_SHARED,
                        file.as_raw_fd(),
                        0,
                    )
                };
                assert_eq!(mapping, libc::MAP_FAILED);
                file.sync_all().unwrap();
                assert_eq!(unsafe { libc::close(file.into_raw_fd()) }, 0);
            } else {
                file.write_all(b"rejected").unwrap();
                runtime
                    .block_on(admin.mutate(Mutation::Grant {
                        node: root.clone(),
                        subject: "writer".into(),
                        verbs: TRAVERSE | LIST | WRITE,
                    }))
                    .unwrap();
                assert_eq!(
                    file.sync_all().unwrap_err().raw_os_error(),
                    Some(libc::EACCES)
                );
                runtime
                    .block_on(admin.mutate(Mutation::Grant {
                        node: root,
                        subject: "writer".into(),
                        verbs: TRAVERSE | LIST | WRITE | READ,
                    }))
                    .unwrap();
                assert_eq!(
                    file.sync_all().unwrap_err().raw_os_error(),
                    Some(libc::EACCES)
                );
                assert_eq!(remote_bytes(&runtime, &admin, &node.id), b"original");
                assert_eq!(unsafe { libc::close(file.into_raw_fd()) }, -1);
                assert_eq!(
                    std::io::Error::last_os_error().raw_os_error(),
                    Some(libc::EACCES)
                );
            }
            unmount(&path, session);
        })
        .await
        .unwrap();
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn linux_writeback_page_fill_retries_after_another_page_publishes() {
    use std::os::fd::AsRawFd;
    let f = Fixture::new().await;
    let node = seed(&f, "page-race", &vec![b'x'; 8192]).await;
    let (path, session, operations) = mounted_as(&f, &f.client).await;
    let target = path.join("files/page-race");
    let file = tokio::task::spawn_blocking(move || {
        let file = std::fs::OpenOptions::new()
            .write(true)
            .open(target)
            .unwrap();
        file.write_at(&vec![b'a'; 4096], 0).unwrap();
        file
    })
    .await
    .unwrap();
    let flush_file = file.try_clone().unwrap();
    f.pause.kind.store(1, Ordering::SeqCst);
    let writing = tokio::task::spawn_blocking(move || {
        file.write_at(b"partial", 4096).unwrap();
        file.sync_all().unwrap();
        drop(file);
    });
    tokio::time::timeout(
        std::time::Duration::from_secs(5),
        f.pause.entered.notified(),
    )
    .await
    .unwrap();
    let flushing = tokio::task::spawn_blocking(move || {
        assert_eq!(
            unsafe {
                libc::sync_file_range(
                    flush_file.as_raw_fd(),
                    0,
                    4096,
                    libc::SYNC_FILE_RANGE_WAIT_BEFORE
                        | libc::SYNC_FILE_RANGE_WRITE
                        | libc::SYNC_FILE_RANGE_WAIT_AFTER,
                )
            },
            0
        );
        flush_file
    });
    let flushed = tokio::time::timeout(std::time::Duration::from_secs(5), flushing).await;
    f.pause.resume.notify_one();
    let flush_file = flushed.unwrap().unwrap();
    writing.await.unwrap();
    assert!(
        operations.snapshot()["writeback_read_retries"]
            .as_u64()
            .unwrap()
            > 0
    );
    let remote = Client::connect(&f.endpoint, "publication", None)
        .await
        .unwrap();
    let runtime = tokio::runtime::Handle::current();
    tokio::task::spawn_blocking(move || {
        let actual = remote_bytes(&runtime, &remote, &node.id);
        assert_eq!(&actual[..4096], &vec![b'a'; 4096]);
        assert_eq!(&actual[4096..4103], b"partial");
        assert_eq!(&actual[4103..], &vec![b'x'; 8192 - 4103]);
        drop(flush_file);
        unmount(&path, session);
    })
    .await
    .unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn linux_writeback_expired_owner_cannot_publish_dirty_pages_over_replacement() {
    let f = Fixture::with_limits(Limits {
        writer_lease_ms: 900,
        ..Limits::default()
    })
    .await;
    let node = seed(&f, "expired", &vec![b'x'; 4096]).await;
    let (path, session) = mounted(&f).await;
    let target = path.join("files/expired");
    f.pause.kind.store(4, Ordering::SeqCst);
    let file = tokio::task::spawn_blocking(move || {
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .open(target)
            .unwrap();
        file.write_all(&vec![b'a'; 4096]).unwrap();
        file
    })
    .await
    .unwrap();
    tokio::time::timeout(
        std::time::Duration::from_secs(5),
        f.pause.entered.notified(),
    )
    .await
    .unwrap();
    tokio::time::sleep(std::time::Duration::from_millis(1100)).await;
    let remote = Client::connect(&f.endpoint, "publication", None)
        .await
        .unwrap();
    let Reply::WritebackHandle(replacement) = remote
        .call(Call::OpenWriteback {
            node: node.id.clone(),
            request: "replacement".into(),
        })
        .await
        .unwrap()
    else {
        panic!()
    };
    remote
        .mutate(Mutation::Write {
            node: node.id.clone(),
            base: replacement.node.version,
            offset: 0,
            data: vec![b'b'; 4096],
            append: false,
            handle: Some(replacement.handle.clone()),
        })
        .await
        .unwrap();
    f.pause.resume.notify_one();
    let runtime = tokio::runtime::Handle::current();
    tokio::task::spawn_blocking(move || {
        file.write_at(&vec![b'c'; 4096], 0).unwrap();
        assert_eq!(
            file.sync_all().unwrap_err().raw_os_error(),
            Some(libc::ESTALE)
        );
        assert_eq!(unsafe { libc::close(file.into_raw_fd()) }, -1);
        assert_eq!(
            std::io::Error::last_os_error().raw_os_error(),
            Some(libc::ESTALE)
        );
        assert_eq!(remote_bytes(&runtime, &remote, &node.id), vec![b'b'; 4096]);
        assert!(matches!(
            runtime
                .block_on(remote.call(Call::RenewWriteback {
                    handle: replacement.handle.clone()
                }))
                .unwrap(),
            Reply::WriterLease(_)
        ));
        runtime
            .block_on(remote.call(Call::Close {
                handle: replacement.handle,
            }))
            .unwrap();
        unmount(&path, session);
    })
    .await
    .unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn linux_writeback_admission_counts_failed_inodes_and_releases_healthy_ones() {
    let f = Fixture::new().await;
    for index in 0..9 {
        seed(&f, &format!("bounded-{index}"), b"initial").await;
    }
    let (path, session, operations) = mounted_as(&f, &f.client).await;
    let reject = f.reject.clone();
    tokio::task::spawn_blocking(move || {
        let open = |index| {
            std::fs::OpenOptions::new()
                .write(true)
                .open(path.join(format!("files/bounded-{index}")))
        };
        let mut failed = open(0).unwrap();
        failed.write_all(b"failed!").unwrap();
        reject.store(true, Ordering::SeqCst);
        assert_eq!(
            failed.sync_all().unwrap_err().raw_os_error(),
            Some(libc::EAGAIN)
        );
        reject.store(false, Ordering::SeqCst);
        assert_eq!(unsafe { libc::close(failed.into_raw_fd()) }, -1);
        let mut healthy: Vec<_> = (1..8).map(|index| open(index).unwrap()).collect();
        let shared = open(1).unwrap();
        assert_eq!(operations.snapshot()["writeback_inodes"], 8);
        assert_eq!(open(8).unwrap_err().raw_os_error(), Some(libc::EMFILE));
        drop(healthy.pop());
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
        let admitted = loop {
            match open(8) {
                Ok(file) => break file,
                Err(error)
                    if error.raw_os_error() == Some(libc::EMFILE)
                        && std::time::Instant::now() < deadline =>
                {
                    std::thread::sleep(std::time::Duration::from_millis(10))
                }
                Err(error) => panic!("capacity was not released: {error}"),
            }
        };
        assert_eq!(open(0).unwrap_err().raw_os_error(), Some(libc::EAGAIN));
        assert_eq!(operations.snapshot()["writeback_inodes"], 8);
        assert_eq!(operations.snapshot()["writeback_failed_inodes"], 1);
        drop(admitted);
        drop(shared);
        drop(healthy);
        unmount(&path, session);
    })
    .await
    .unwrap();
}
