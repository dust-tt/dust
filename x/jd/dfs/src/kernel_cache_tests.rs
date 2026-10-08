use super::*;
use fuser::{Filesystem, Request};

struct Pages;

fn attributes(ino: u64) -> FileAttr {
    FileAttr {
        ino,
        size: 8192,
        blocks: 16,
        atime: UNIX_EPOCH,
        mtime: UNIX_EPOCH,
        ctime: UNIX_EPOCH,
        crtime: UNIX_EPOCH,
        kind: if ino == 1 {
            FileType::Directory
        } else {
            FileType::RegularFile
        },
        perm: 0o755,
        nlink: 1,
        uid: unsafe { libc::getuid() },
        gid: unsafe { libc::getgid() },
        rdev: 0,
        blksize: 4096,
        flags: 0,
    }
}

impl Filesystem for Pages {
    fn lookup(&mut self, _: &Request<'_>, _: u64, name: &OsStr, reply: ReplyEntry) {
        if name == "file" {
            reply.entry(&TTL, &attributes(4), 0);
        } else {
            reply.error(libc::ENOENT);
        }
    }
    fn getattr(&mut self, _: &Request<'_>, ino: u64, _: Option<u64>, reply: ReplyAttr) {
        reply.attr(&TTL, &attributes(ino));
    }
    fn open(&mut self, _: &Request<'_>, _: u64, _: i32, reply: ReplyOpen) {
        reply.opened(0, fuser::consts::FOPEN_KEEP_CACHE);
    }
    fn read(
        &mut self,
        _: &Request<'_>,
        _: u64,
        _: u64,
        offset: i64,
        size: u32,
        _: i32,
        _: Option<u64>,
        reply: ReplyData,
    ) {
        reply.data(&vec![
            b'a';
            (8192u64.saturating_sub(offset as u64)).min(u64::from(size))
                as usize
        ]);
    }
}

struct PartialStore {
    notifier: fuser::Notifier,
    path: std::path::PathBuf,
    kernel: Arc<KernelCache>,
    panic: bool,
    fail_invalidation: bool,
}

impl StoreNotifications for PartialStore {
    fn store(&self, ino: u64, offset: u64, bytes: &[u8]) -> std::io::Result<()> {
        self.notifier.store(ino, offset, &bytes[..4096])?;
        assert_eq!(&std::fs::read(&self.path).unwrap()[..4096], &[b'b'; 4096]);
        assert!(!self.panic, "injected failure after partial store");
        Err(std::io::Error::from_raw_os_error(libc::EIO))
    }
    fn invalidate(&self, ino: u64, offset: i64, length: i64) -> std::io::Result<()> {
        assert!(self.kernel.transition.try_lock().is_ok());
        assert!(self.kernel.invalidating.load(Ordering::SeqCst) > 0);
        if self.fail_invalidation {
            return Err(std::io::Error::from_raw_os_error(libc::EIO));
        }
        self.notifier.inval_inode(ino, offset, length)
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn partial_store_recovers_pages_or_disables_insertion_before_releasing_ordering() {
    for (panic, fail_invalidation) in [(false, false), (false, true), (true, false)] {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().to_owned();
        let session = fuser::spawn_mount2(Pages, &path, &[]).unwrap();
        let file = path.join("file");
        let initial_file = file.clone();
        tokio::task::spawn_blocking(move || {
            assert_eq!(std::fs::read(initial_file).unwrap(), vec![b'a'; 8192])
        })
        .await
        .unwrap();
        let invalidating = Arc::new(AtomicU64::new(0));
        let failure = Arc::new(tokio::sync::Notify::new());
        let transition = Arc::new(tokio::sync::Mutex::new(()));
        let kernel = KernelCache::new(
            Weak::new(),
            transition.clone(),
            invalidating.clone(),
            failure.clone(),
        );
        let inodes = Inodes::new(8, None).unwrap();
        let pin = inodes
            .allocate("file", ReferenceKind::Notification)
            .unwrap();
        assert_eq!(pin.ino(), 4);
        let notifications = PartialStore {
            notifier: session.notifier(),
            path: file.clone(),
            kernel: kernel.clone(),
            panic,
            fail_invalidation,
        };
        let worker = InsertionWorker {
            _transition: transition.clone().lock_owned().await,
            invalidating: invalidating.clone(),
            failure: failure.clone(),
        };
        let result = tokio::task::spawn_blocking(move || {
            kernel.store_ranges(
                &notifications,
                vec![(
                    pin,
                    ReadRange {
                        node: "file".into(),
                        version: "version".into(),
                        offset: 0,
                        size: 8192,
                    },
                    vec![b'b'; 8192],
                )],
                "incarnation",
                0,
                worker,
            )
        })
        .await;
        assert!(transition.try_lock().is_ok());
        assert_eq!(inodes.snapshot()["notification_references"], 0);
        if panic || fail_invalidation {
            if panic {
                assert!(result.unwrap_err().is_panic());
            } else {
                assert_eq!(result.unwrap().unwrap_err().code, libc::EIO);
            }
            assert!(invalidating.load(Ordering::SeqCst) > 0);
            tokio::time::timeout(Duration::from_secs(2), failure.notified())
                .await
                .unwrap();
        } else {
            result.unwrap().unwrap();
            assert_eq!(invalidating.load(Ordering::SeqCst), 0);
            tokio::task::spawn_blocking(move || {
                assert_eq!(std::fs::read(file).unwrap(), vec![b'a'; 8192])
            })
            .await
            .unwrap();
        }
        tokio::task::spawn_blocking(move || {
            let status = std::process::Command::new("/bin/fusermount3")
                .args(["-u", "--"])
                .arg(&path)
                .status()
                .unwrap();
            assert!(status.success());
            drop(session);
            assert!(!path.join("file").exists());
        })
        .await
        .unwrap();
    }
}
