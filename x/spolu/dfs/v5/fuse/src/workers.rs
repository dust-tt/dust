use parking_lot::Mutex;
use std::{
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
        mpsc,
    },
    thread::JoinHandle,
};
type Job = Box<dyn FnOnce() + Send>;
const MAX_JOBS: usize = 64;

pub(crate) struct Slot(Arc<AtomicUsize>);
impl Drop for Slot {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::Release);
    }
}

/// @cc [owner:spolu,label:concurrency;performance] bounded-fuse-workers
/// Admission MUST bound running plus queued jobs at 64. A slot MUST be reserved before enqueue;
/// queue saturation MUST fail before executing the callback. Shutdown MUST join all admitted work.
pub(crate) struct Workers {
    sender: Option<mpsc::SyncSender<Job>>,
    jobs: Arc<AtomicUsize>,
    threads: Vec<JoinHandle<()>>,
}
impl Workers {
    pub fn new(count: usize) -> std::io::Result<Self> {
        if !(1..=8).contains(&count) {
            return Err(std::io::Error::other("worker count must be 1..8"));
        }
        let (sender, receiver) = mpsc::sync_channel::<Job>(MAX_JOBS);
        let receiver = Arc::new(Mutex::new(receiver));
        let mut threads = Vec::new();
        for index in 0..count {
            let receiver = receiver.clone();
            threads.push(
                std::thread::Builder::new()
                    .name(format!("dfs-fuse-{index}"))
                    .spawn(move || {
                        loop {
                            let job = receiver.lock().recv();
                            match job {
                                Ok(job) => job(),
                                Err(_) => return,
                            }
                        }
                    })?,
            );
        }
        Ok(Self {
            sender: Some(sender),
            jobs: Default::default(),
            threads,
        })
    }
    pub fn reserve(&self) -> Option<Slot> {
        self.jobs
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |jobs| {
                (jobs < MAX_JOBS).then_some(jobs + 1)
            })
            .ok()?;
        Some(Slot(self.jobs.clone()))
    }
    pub fn submit(&self, slot: Slot, operation: impl FnOnce() + Send + 'static) {
        let job = Box::new(move || {
            let _slot = slot;
            operation();
        });
        // Reserved total work cannot fill the queue; disconnection drops replies with EIO.
        if let Some(sender) = &self.sender {
            let _ = sender.try_send(job);
        }
    }
}
impl Drop for Workers {
    fn drop(&mut self) {
        self.sender.take();
        for thread in self.threads.drain(..) {
            let _ = thread.join();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn running_and_queued_work_share_one_bound_and_shutdown_joins() -> std::io::Result<()> {
        let pool = Workers::new(2)?;
        let gate = Arc::new((Mutex::new(false), parking_lot::Condvar::new()));
        let completed = Arc::new(AtomicUsize::new(0));
        for _ in 0..MAX_JOBS {
            let slot = pool
                .reserve()
                .ok_or_else(|| std::io::Error::other("missing slot"))?;
            let gate = gate.clone();
            let completed = completed.clone();
            pool.submit(slot, move || {
                let (lock, wake) = &*gate;
                let mut ready = lock.lock();
                while !*ready {
                    wake.wait(&mut ready);
                }
                completed.fetch_add(1, Ordering::Release);
            });
        }
        assert!(pool.reserve().is_none());
        *gate.0.lock() = true;
        gate.1.notify_all();
        drop(pool);
        assert_eq!(completed.load(Ordering::Acquire), MAX_JOBS);
        Ok(())
    }
}
