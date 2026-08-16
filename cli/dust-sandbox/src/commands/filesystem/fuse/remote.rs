use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::runtime::Handle;
use tokio::sync::Semaphore;
use tracing::{debug, error, warn};

// Reads, uploads, and name changes use separate pools so one slow class cannot
// consume all of another class. Each pool also bounds waiting work.
const MAX_METADATA_OPERATIONS: usize = 32;
const MAX_METADATA_PENDING: usize = 64;
const MAX_CONTENT_OPERATIONS: usize = 8;
const MAX_CONTENT_PENDING: usize = 24;
const MAX_MUTATION_OPERATIONS: usize = 1;
const MAX_MUTATION_PENDING: usize = 16;
const MAX_RELEASE_OPERATIONS: usize = 4;
const MAX_QUEUE_WAIT: Duration = Duration::from_secs(5);

#[derive(Clone, Copy)]
pub(super) enum RemoteWork {
    Metadata,
    Content,
    Mutation,
    Release,
}

#[derive(Clone)]
struct RemotePool {
    active: Arc<Semaphore>,
    pending: Option<Arc<Semaphore>>,
}

impl RemotePool {
    fn new(active: usize, pending: usize) -> Self {
        Self {
            active: Arc::new(Semaphore::new(active)),
            pending: Some(Arc::new(Semaphore::new(pending))),
        }
    }

    fn release() -> Self {
        Self {
            active: Arc::new(Semaphore::new(MAX_RELEASE_OPERATIONS)),
            // Linux never retries RELEASE and ignores its errors. Keep this
            // queue available so a dirty final close is never dropped. Its
            // size is capped by HandleTable's 4,096 open-file limit.
            pending: None,
        }
    }
}

#[derive(Clone)]
pub(super) struct RemoteExecutor {
    runtime: Handle,
    metadata: RemotePool,
    content: RemotePool,
    mutation: RemotePool,
    release: RemotePool,
}

impl RemoteExecutor {
    pub fn new(runtime: Handle) -> Self {
        Self {
            runtime,
            metadata: RemotePool::new(MAX_METADATA_OPERATIONS, MAX_METADATA_PENDING),
            content: RemotePool::new(MAX_CONTENT_OPERATIONS, MAX_CONTENT_PENDING),
            mutation: RemotePool::new(MAX_MUTATION_OPERATIONS, MAX_MUTATION_PENDING),
            release: RemotePool::release(),
        }
    }

    pub fn spawn<F>(&self, operation: &'static str, work: RemoteWork, task: F)
    where
        F: FnOnce(bool) + Send + 'static,
    {
        let pool = match work {
            RemoteWork::Metadata => self.metadata.clone(),
            RemoteWork::Content => self.content.clone(),
            RemoteWork::Mutation => self.mutation.clone(),
            RemoteWork::Release => self.release.clone(),
        };
        let bounded_wait = pool.pending.is_some();
        let queued = match &pool.pending {
            Some(pending) => match Arc::clone(pending).try_acquire_owned() {
                Ok(queued) => Some(queued),
                Err(_) => {
                    warn!(operation, "filesystem remote queue is full");
                    // The closure owns the FUSE reply and can return EAGAIN without
                    // retaining request buffers in an unbounded task queue.
                    task(true);
                    return;
                }
            },
            None => None,
        };
        let started = Instant::now();
        let future = async move {
            let acquire = pool.active.acquire_owned();
            let permit = if bounded_wait {
                match tokio::time::timeout(MAX_QUEUE_WAIT, acquire).await {
                    Ok(Ok(permit)) => permit,
                    Ok(Err(_)) | Err(_) => {
                        warn!(operation, "filesystem remote queue wait expired");
                        task(true);
                        return;
                    }
                }
            } else {
                match acquire.await {
                    Ok(permit) => permit,
                    Err(_) => {
                        warn!(operation, "filesystem remote queue closed");
                        task(true);
                        return;
                    }
                }
            };
            debug!(
                operation,
                queue_wait_ms = started.elapsed().as_millis(),
                "started filesystem remote operation"
            );
            let result = tokio::task::spawn_blocking(move || {
                let _permit = permit;
                let _queued = queued;
                task(false);
            })
            .await;
            match result {
                Ok(()) => debug!(
                    operation,
                    elapsed_ms = started.elapsed().as_millis(),
                    "completed filesystem remote operation"
                ),
                Err(error) if error.is_panic() => {
                    // A panic may leave a FUSE reply unanswered or a lock poisoned.
                    // Exit so the supervisor can remount a clean daemon.
                    error!(operation, %error, "filesystem remote operation panicked");
                    std::process::abort();
                }
                Err(error) => warn!(operation, %error, "filesystem remote operation stopped"),
            }
        };
        drop(self.runtime.spawn(future));
    }
}

#[cfg(test)]
mod tests {
    use std::sync::mpsc;
    use std::time::Duration;

    use tokio::runtime::Runtime;

    use super::{RemoteExecutor, RemotePool, RemoteWork};

    #[test]
    fn work_waits_for_capacity_and_rejects_past_the_fixed_limit() {
        let runtime = Runtime::new().expect("runtime");
        let executor = RemoteExecutor {
            runtime: runtime.handle().clone(),
            metadata: RemotePool::new(1, 2),
            content: RemotePool::new(1, 2),
            mutation: RemotePool::new(1, 2),
            release: RemotePool::release(),
        };
        let (release_tx, release_rx) = mpsc::channel();
        let (started_tx, started_rx) = mpsc::channel();
        let (completed_tx, completed_rx) = mpsc::channel();

        executor.spawn("first", RemoteWork::Content, move |rejected| {
            assert!(!rejected);
            started_tx.send(()).expect("start first task");
            release_rx.recv().expect("release first task");
        });
        started_rx
            .recv_timeout(Duration::from_secs(1))
            .expect("first task started");
        executor.spawn("second", RemoteWork::Content, move |rejected| {
            assert!(!rejected);
            completed_tx.send(()).expect("complete second task");
        });

        let (rejected_tx, rejected_rx) = mpsc::channel();
        executor.spawn("third", RemoteWork::Content, move |rejected| {
            rejected_tx.send(rejected).expect("report rejection");
        });
        assert!(rejected_rx
            .recv_timeout(Duration::from_secs(1))
            .expect("third task replied"));

        assert!(completed_rx
            .recv_timeout(Duration::from_millis(20))
            .is_err());
        release_tx.send(()).expect("release first task");
        completed_rx
            .recv_timeout(Duration::from_secs(1))
            .expect("queued task completed");
    }
}
