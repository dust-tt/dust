//! Shared file service for HTTP and future filesystem adapters.
mod handles;
mod scratch;
#[cfg(test)]
mod tests;
mod write;

use clap::Args;
use std::{path::PathBuf, sync::Arc};
use tokio::sync::Semaphore;

const MAX_WAITING_FILE_JOBS: usize = 256;

pub(crate) use handles::{Handle, HandleMode};
pub(crate) use scratch::io_error;
pub(crate) use write::{WriteKind, WriteRequest, fingerprint, replay, upload_error};

#[derive(Args)]
pub struct FileConfig {
    /// Directory for anonymous, temporary file assembly. No recovery data is stored here.
    #[arg(long, env = "DFS_SCRATCH_DIR", default_value_os_t = std::env::temp_dir())]
    pub scratch_dir: PathBuf,
    /// Shared logical size quota for all temporary assembly files.
    #[arg(long, env = "DFS_SCRATCH_BYTES", default_value_t = 1024 * 1024 * 1024)]
    pub scratch_bytes: u64,
    /// Bound active file jobs; at most 256 additional jobs may wait without polling their input.
    #[arg(long, env = "DFS_FILE_MUTATIONS", default_value_t = 16)]
    pub file_mutations: usize,
}

impl Default for FileConfig {
    fn default() -> Self {
        Self {
            scratch_dir: std::env::temp_dir(),
            scratch_bytes: 1024 * 1024 * 1024,
            file_mutations: 16,
        }
    }
}

pub(crate) struct Files {
    handles: handles::Handles,
    scratch: scratch::Scratch,
    mutations: Arc<Semaphore>,
    admitted: Arc<Semaphore>,
    jobs: tokio_util::task::TaskTracker,
}

impl Default for Files {
    fn default() -> Self {
        Self::configured(FileConfig::default())
    }
}

impl Files {
    pub fn new(config: FileConfig) -> anyhow::Result<Self> {
        anyhow::ensure!(
            config.scratch_bytes > 0
                && (1..=Semaphore::MAX_PERMITS - MAX_WAITING_FILE_JOBS)
                    .contains(&config.file_mutations),
            "invalid file resource limits"
        );
        std::fs::create_dir_all(&config.scratch_dir)?;
        anyhow::ensure!(
            config.scratch_dir.is_dir(),
            "scratch directory is not a directory"
        );
        Ok(Self::configured(config))
    }

    fn configured(config: FileConfig) -> Self {
        Self {
            handles: handles::Handles::default(),
            scratch: scratch::Scratch::new(config.scratch_dir, config.scratch_bytes),
            mutations: Arc::new(Semaphore::new(config.file_mutations)),
            admitted: Arc::new(Semaphore::new(
                config.file_mutations + MAX_WAITING_FILE_JOBS,
            )),
            jobs: tokio_util::task::TaskTracker::new(),
        }
    }

    /**
     * @cc [owner:spolu,label:concurrency] cancellation-safe-file-publication
     * Admit a bounded job before spawning. Once admitted, disconnecting the HTTP caller MUST NOT
     * cancel publication or release its request gate before the database submission completes.
     * Track jobs and drain them before closing storage. Timeouts may abandon preparation, never an
     * in-progress metadata publication. Persistent receipts resolve lost responses after restart.
     */
    /// @cc [owner:spolu,label:performance;concurrency] bounded-file-job-queue
    /// At most the configured active count plus 256 waiting jobs may be admitted. Excess requests
    /// MUST fail with capacity exhaustion before polling their work. Waiting jobs MUST NOT poll
    /// streaming input bodies or acquire file/scratch/transfer resources until an active slot is
    /// available. Session-bound jobs MUST recheck their authority when they execute after waiting.
    pub async fn run<T: Send + 'static>(
        &self,
        task: impl Future<Output = Result<T, crate::api::ApiError>> + Send + 'static,
    ) -> Result<T, crate::api::ApiError> {
        let permit = self
            .admitted
            .clone()
            .try_acquire_owned()
            .map_err(|_| crate::api::ApiError::CapacityExhausted)?;
        let active = self.mutations.clone();
        self.jobs
            .spawn(async move {
                let _permit = permit;
                let _active = active
                    .acquire_owned()
                    .await
                    .map_err(|_| crate::api::ApiError::Unavailable)?;
                task.await
            })
            .await
            .map_err(|_| crate::api::ApiError::Unavailable)?
    }

    pub async fn drain(&self) {
        self.jobs.close();
        self.jobs.wait().await;
    }
}
