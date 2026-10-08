use super::*;
use fuser::{Filesystem, Request};
use tokio::sync::{Semaphore, mpsc};

type Job = Box<dyn FnOnce(&mut Mount) + Send>;

struct PendingMutation(Arc<MountCounters>);
impl PendingMutation {
    fn new(counters: Arc<MountCounters>) -> Self {
        counters.pending_mutations.fetch_add(1, Ordering::Relaxed);
        Self(counters)
    }
}
impl Drop for PendingMutation {
    fn drop(&mut self) {
        self.0.pending_mutations.fetch_sub(1, Ordering::Relaxed);
    }
}

struct PendingWriteBytes {
    operations: Arc<MountCounters>,
    bytes: usize,
}
impl PendingWriteBytes {
    fn new(operations: Arc<MountCounters>, bytes: usize) -> Self {
        let retained = operations
            .retained_write_bytes
            .fetch_add(bytes as u64, Ordering::Relaxed)
            + bytes as u64;
        operations
            .peak_retained_write_bytes
            .fetch_max(retained, Ordering::Relaxed);
        Self { operations, bytes }
    }
}
impl Drop for PendingWriteBytes {
    fn drop(&mut self) {
        self.operations
            .retained_write_bytes
            .fetch_sub(self.bytes as u64, Ordering::Relaxed);
    }
}

pub struct Driver {
    state: Arc<Mutex<Mount>>,
    queue: mpsc::Sender<Job>,
    bytes: Arc<Semaphore>,
    writeback_queue: mpsc::Sender<Job>,
    writeback_bytes: Arc<Semaphore>,
    inodes: Inodes,
    operations: Arc<MountCounters>,
}

impl Mount {
    pub fn into_driver(self) -> Driver {
        let runtime = self.runtime.clone();
        let transition = self.transition.clone();
        let failure = self.notification_failure.clone();
        let inodes = self.inodes.clone();
        let operations = self.operations.clone();
        let enabled = self.kernel_prefetch && !self.direct_io;
        let reader = self.reader.clone();
        let writeback = self.experimental_kernel_writeback;
        let state = Arc::new(Mutex::new(self));
        state.lock().self_weak = Arc::downgrade(&state);
        if writeback {
            Mount::start_writer_renewal(&state, &runtime);
        }
        if enabled {
            let invalidating = state.lock().invalidating.clone();
            reader.set_kernel(KernelCache::new(
                Arc::downgrade(&state),
                transition.clone(),
                invalidating,
                failure.clone(),
            ));
        }
        let worker_state = state.clone();
        let (queue, mut receiver) = mpsc::channel::<Job>(128);
        let (writeback_queue, mut writebacks) = mpsc::channel::<Job>(WRITEBACK_REQUESTS + 1);
        runtime.spawn(async move {
            loop {
                let job = tokio::select! {
                    Some(job) = receiver.recv() => job,
                    Some(job) = writebacks.recv() => job,
                    else => break,
                };
                let transition = transition.clone().lock_owned().await;
                let state = worker_state.clone();
                if let Err(error) = tokio::task::spawn_blocking(move || {
                    let _transition = transition;
                    job(&mut state.lock());
                })
                .await
                {
                    tracing::error!(%error, "mutation worker failed");
                    failure.notify_one();
                    break;
                }
            }
        });
        Driver {
            state,
            queue,
            bytes: Arc::new(Semaphore::new(4 * MAX_IO_BYTES)),
            writeback_queue,
            writeback_bytes: Arc::new(Semaphore::new((WRITEBACK_REQUESTS + 1) * MAX_IO_BYTES)),
            inodes,
            operations,
        }
    }
}

impl Filesystem for Driver {
    fn ioctl(
        &mut self,
        _req: &Request<'_>,
        _ino: u64,
        _fh: u64,
        _flags: u32,
        _cmd: u32,
        _in_data: &[u8],
        _out_size: u32,
        reply: fuser::ReplyIoctl,
    ) {
        self.state
            .lock()
            .ioctl(_ino, _fh, _flags, _cmd, _in_data, _out_size, reply)
    }
    fn init(
        &mut self,
        _req: &Request<'_>,
        config: &mut KernelConfig,
    ) -> std::result::Result<(), i32> {
        self.state.lock().init(config)
    }
    fn lookup(&mut self, _req: &Request<'_>, parent: u64, name: &OsStr, reply: ReplyEntry) {
        self.state.lock().lookup(parent, name, reply)
    }
    fn forget(&mut self, _req: &Request<'_>, ino: u64, nlookup: u64) {
        self.state.lock().forget(ino, nlookup)
    }
    fn getattr(&mut self, _req: &Request<'_>, ino: u64, fh: Option<u64>, reply: ReplyAttr) {
        self.state.lock().getattr(ino, fh, reply)
    }
    fn open(&mut self, _req: &Request<'_>, ino: u64, flags: i32, reply: ReplyOpen) {
        if flags & (libc::O_ACCMODE | libc::O_TRUNC) == libc::O_RDONLY {
            self.state.lock().open(ino, flags, reply);
            return;
        }
        let Ok(slot) = self.queue.clone().try_reserve_owned() else {
            reply.error(libc::EBUSY);
            return;
        };
        let pins = [ino]
            .into_iter()
            .map(|ino| self.inodes.pin(ino, ReferenceKind::Work))
            .collect::<Result<Vec<_>>>();
        let pins = match pins {
            Ok(pins) => pins,
            Err(error) => {
                reply.error(error.code);
                return;
            }
        };
        let pending = PendingMutation::new(self.operations.clone());
        slot.send(Box::new(move |mount| {
            let _pending = pending;
            let _pins = pins;
            mount.open(ino, flags, reply);
        }));
    }
    fn read(
        &mut self,
        _req: &Request<'_>,
        ino: u64,
        fh: u64,
        offset: i64,
        size: u32,
        _flags: i32,
        _owner: Option<u64>,
        reply: ReplyData,
    ) {
        self.state
            .lock()
            .read(ino, fh, offset, size, _flags, _owner, reply)
    }
    fn write(
        &mut self,
        _req: &Request<'_>,
        _ino: u64,
        fh: u64,
        offset: i64,
        data: &[u8],
        _write_flags: u32,
        _flags: i32,
        _owner: Option<u64>,
        reply: ReplyWrite,
    ) {
        self.operations.write.fetch_add(1, Ordering::Relaxed);
        self.operations
            .write_bytes
            .fetch_add(data.len() as u64, Ordering::Relaxed);
        let buffered = _write_flags & fuser::consts::FUSE_WRITE_CACHE != 0;
        let (queue, allowance) = if buffered {
            (&self.writeback_queue, &self.writeback_bytes)
        } else {
            (&self.queue, &self.bytes)
        };
        let Ok(slot) = queue.clone().try_reserve_owned() else {
            self.state.lock().fail_writeback_handle(fh, libc::EBUSY);
            reply.error(libc::EBUSY);
            return;
        };
        if data.len() > MAX_IO_BYTES {
            self.state.lock().fail_writeback_handle(fh, libc::EINVAL);
            reply.error(libc::EINVAL);
            return;
        }
        let Ok(bytes) = allowance
            .clone()
            .try_acquire_many_owned(data.len().max(1) as u32)
        else {
            self.state.lock().fail_writeback_handle(fh, libc::EBUSY);
            reply.error(libc::EBUSY);
            return;
        };
        let pins = [_ino]
            .into_iter()
            .map(|ino| self.inodes.pin(ino, ReferenceKind::Work))
            .collect::<Result<Vec<_>>>();
        let pins = match pins {
            Ok(pins) => pins,
            Err(error) => {
                self.state.lock().fail_writeback_handle(fh, error.code);
                reply.error(error.code);
                return;
            }
        };
        let retained_bytes = PendingWriteBytes::new(self.operations.clone(), data.len());
        let data = data.to_vec();
        let pending = PendingMutation::new(self.operations.clone());
        slot.send(Box::new(move |mount| {
            let _pending = pending;
            let _pins = pins;
            let _bytes = bytes;
            let _retained_bytes = retained_bytes;
            mount.write(_ino, fh, offset, &data, _write_flags, _flags, _owner, reply);
        }));
    }
    fn create(
        &mut self,
        _req: &Request<'_>,
        parent: u64,
        name: &OsStr,
        mode: u32,
        umask: u32,
        flags: i32,
        reply: ReplyCreate,
    ) {
        let Ok(slot) = self.queue.clone().try_reserve_owned() else {
            reply.error(libc::EBUSY);
            return;
        };
        let pins = [parent]
            .into_iter()
            .map(|ino| self.inodes.pin(ino, ReferenceKind::Work))
            .collect::<Result<Vec<_>>>();
        let pins = match pins {
            Ok(pins) => pins,
            Err(error) => {
                reply.error(error.code);
                return;
            }
        };
        let name = name.to_os_string();
        let pending = PendingMutation::new(self.operations.clone());
        slot.send(Box::new(move |mount| {
            let _pending = pending;
            let _pins = pins;
            mount.create(parent, &name, mode, umask, flags, reply);
        }));
    }
    fn mkdir(
        &mut self,
        _req: &Request<'_>,
        parent: u64,
        name: &OsStr,
        mode: u32,
        umask: u32,
        reply: ReplyEntry,
    ) {
        let Ok(slot) = self.queue.clone().try_reserve_owned() else {
            reply.error(libc::EBUSY);
            return;
        };
        let pins = [parent]
            .into_iter()
            .map(|ino| self.inodes.pin(ino, ReferenceKind::Work))
            .collect::<Result<Vec<_>>>();
        let pins = match pins {
            Ok(pins) => pins,
            Err(error) => {
                reply.error(error.code);
                return;
            }
        };
        let name = name.to_os_string();
        let pending = PendingMutation::new(self.operations.clone());
        slot.send(Box::new(move |mount| {
            let _pending = pending;
            let _pins = pins;
            mount.mkdir(parent, &name, mode, umask, reply);
        }));
    }
    fn unlink(&mut self, _req: &Request<'_>, parent: u64, name: &OsStr, reply: ReplyEmpty) {
        let Ok(slot) = self.queue.clone().try_reserve_owned() else {
            reply.error(libc::EBUSY);
            return;
        };
        let pins = [parent]
            .into_iter()
            .map(|ino| self.inodes.pin(ino, ReferenceKind::Work))
            .collect::<Result<Vec<_>>>();
        let pins = match pins {
            Ok(pins) => pins,
            Err(error) => {
                reply.error(error.code);
                return;
            }
        };
        let name = name.to_os_string();
        let pending = PendingMutation::new(self.operations.clone());
        slot.send(Box::new(move |mount| {
            let _pending = pending;
            let _pins = pins;
            mount.unlink(parent, &name, reply);
        }));
    }
    fn rmdir(&mut self, _req: &Request<'_>, parent: u64, name: &OsStr, reply: ReplyEmpty) {
        let Ok(slot) = self.queue.clone().try_reserve_owned() else {
            reply.error(libc::EBUSY);
            return;
        };
        let pins = [parent]
            .into_iter()
            .map(|ino| self.inodes.pin(ino, ReferenceKind::Work))
            .collect::<Result<Vec<_>>>();
        let pins = match pins {
            Ok(pins) => pins,
            Err(error) => {
                reply.error(error.code);
                return;
            }
        };
        let name = name.to_os_string();
        let pending = PendingMutation::new(self.operations.clone());
        slot.send(Box::new(move |mount| {
            let _pending = pending;
            let _pins = pins;
            mount.rmdir(parent, &name, reply);
        }));
    }
    fn rename(
        &mut self,
        _req: &Request<'_>,
        parent: u64,
        name: &OsStr,
        newparent: u64,
        newname: &OsStr,
        flags: u32,
        reply: ReplyEmpty,
    ) {
        let Ok(slot) = self.queue.clone().try_reserve_owned() else {
            reply.error(libc::EBUSY);
            return;
        };
        let pins = [parent, newparent]
            .into_iter()
            .map(|ino| self.inodes.pin(ino, ReferenceKind::Work))
            .collect::<Result<Vec<_>>>();
        let pins = match pins {
            Ok(pins) => pins,
            Err(error) => {
                reply.error(error.code);
                return;
            }
        };
        let name = name.to_os_string();
        let newname = newname.to_os_string();
        let pending = PendingMutation::new(self.operations.clone());
        slot.send(Box::new(move |mount| {
            let _pending = pending;
            let _pins = pins;
            mount.rename(parent, &name, newparent, &newname, flags, reply);
        }));
    }
    fn setattr(
        &mut self,
        _req: &Request<'_>,
        ino: u64,
        mode: Option<u32>,
        uid: Option<u32>,
        gid: Option<u32>,
        size: Option<u64>,
        _atime: Option<TimeOrNow>,
        mtime: Option<TimeOrNow>,
        _ctime: Option<SystemTime>,
        fh: Option<u64>,
        _crtime: Option<SystemTime>,
        _chgtime: Option<SystemTime>,
        _bkuptime: Option<SystemTime>,
        flags: Option<u32>,
        reply: ReplyAttr,
    ) {
        let Ok(slot) = self.queue.clone().try_reserve_owned() else {
            reply.error(libc::EBUSY);
            return;
        };
        let pins = [ino]
            .into_iter()
            .map(|ino| self.inodes.pin(ino, ReferenceKind::Work))
            .collect::<Result<Vec<_>>>();
        let pins = match pins {
            Ok(pins) => pins,
            Err(error) => {
                reply.error(error.code);
                return;
            }
        };
        let pending = PendingMutation::new(self.operations.clone());
        slot.send(Box::new(move |mount| {
            let _pending = pending;
            let _pins = pins;
            mount.setattr(
                ino, mode, uid, gid, size, _atime, mtime, _ctime, fh, _crtime, _chgtime, _bkuptime,
                flags, reply,
            );
        }));
    }
    fn opendir(&mut self, _req: &Request<'_>, ino: u64, _flags: i32, reply: ReplyOpen) {
        self.state.lock().opendir(ino, _flags, reply)
    }
    fn readdir(
        &mut self,
        _req: &Request<'_>,
        ino: u64,
        fh: u64,
        offset: i64,
        reply: ReplyDirectory,
    ) {
        self.state.lock().readdir(ino, fh, offset, reply)
    }
    fn readdirplus(
        &mut self,
        _req: &Request<'_>,
        ino: u64,
        fh: u64,
        offset: i64,
        reply: ReplyDirectoryPlus,
    ) {
        self.state.lock().readdirplus(ino, fh, offset, reply)
    }
    fn releasedir(
        &mut self,
        _req: &Request<'_>,
        _ino: u64,
        fh: u64,
        _flags: i32,
        reply: ReplyEmpty,
    ) {
        self.state.lock().releasedir(_ino, fh, _flags, reply)
    }
    fn fsyncdir(
        &mut self,
        _req: &Request<'_>,
        ino: u64,
        fh: u64,
        _datasync: bool,
        reply: ReplyEmpty,
    ) {
        let Ok(slot) = self.queue.clone().try_reserve_owned() else {
            reply.error(libc::EBUSY);
            return;
        };
        let pins = [ino]
            .into_iter()
            .map(|ino| self.inodes.pin(ino, ReferenceKind::Work))
            .collect::<Result<Vec<_>>>();
        let pins = match pins {
            Ok(pins) => pins,
            Err(error) => {
                reply.error(error.code);
                return;
            }
        };
        let pending = PendingMutation::new(self.operations.clone());
        slot.send(Box::new(move |mount| {
            let _pending = pending;
            let _pins = pins;
            mount.fsyncdir(ino, fh, _datasync, reply);
        }));
    }
    fn flush(&mut self, _req: &Request<'_>, ino: u64, fh: u64, _owner: u64, reply: ReplyEmpty) {
        let Ok(slot) = self.queue.clone().try_reserve_owned() else {
            reply.error(libc::EBUSY);
            return;
        };
        let pins = [ino]
            .into_iter()
            .map(|ino| self.inodes.pin(ino, ReferenceKind::Work))
            .collect::<Result<Vec<_>>>();
        let pins = match pins {
            Ok(pins) => pins,
            Err(error) => {
                reply.error(error.code);
                return;
            }
        };
        let pending = PendingMutation::new(self.operations.clone());
        slot.send(Box::new(move |mount| {
            let _pending = pending;
            let _pins = pins;
            mount.flush(ino, fh, _owner, reply);
        }));
    }
    fn fsync(&mut self, _req: &Request<'_>, ino: u64, fh: u64, _datasync: bool, reply: ReplyEmpty) {
        let Ok(slot) = self.queue.clone().try_reserve_owned() else {
            reply.error(libc::EBUSY);
            return;
        };
        let pins = [ino]
            .into_iter()
            .map(|ino| self.inodes.pin(ino, ReferenceKind::Work))
            .collect::<Result<Vec<_>>>();
        let pins = match pins {
            Ok(pins) => pins,
            Err(error) => {
                reply.error(error.code);
                return;
            }
        };
        let pending = PendingMutation::new(self.operations.clone());
        slot.send(Box::new(move |mount| {
            let _pending = pending;
            let _pins = pins;
            mount.fsync(ino, fh, _datasync, reply);
        }));
    }
    fn release(
        &mut self,
        _req: &Request<'_>,
        _ino: u64,
        fh: u64,
        _flags: i32,
        _owner: Option<u64>,
        _flush: bool,
        reply: ReplyEmpty,
    ) {
        self.state
            .lock()
            .release(_ino, fh, _flags, _owner, _flush, reply)
    }
    fn getlk(
        &mut self,
        _req: &Request<'_>,
        _ino: u64,
        _fh: u64,
        _owner: u64,
        _start: u64,
        _end: u64,
        _typ: i32,
        _pid: u32,
        reply: fuser::ReplyLock,
    ) {
        self.state
            .lock()
            .getlk(_ino, _fh, _owner, _start, _end, _typ, _pid, reply)
    }
    fn setlk(
        &mut self,
        _req: &Request<'_>,
        _ino: u64,
        _fh: u64,
        _owner: u64,
        _start: u64,
        _end: u64,
        _typ: i32,
        _pid: u32,
        _sleep: bool,
        reply: ReplyEmpty,
    ) {
        self.state
            .lock()
            .setlk(_ino, _fh, _owner, _start, _end, _typ, _pid, _sleep, reply)
    }
    fn statfs(&mut self, _req: &Request<'_>, _ino: u64, reply: ReplyStatfs) {
        self.state.lock().statfs(_ino, reply)
    }
    fn access(&mut self, _req: &Request<'_>, ino: u64, mask: i32, reply: ReplyEmpty) {
        self.state.lock().access(ino, mask, reply)
    }
}
