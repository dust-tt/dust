//! Shared file service for HTTP and future filesystem adapters.
mod handles;
mod scratch;
mod write;

use clap::Args;
use std::{path::PathBuf, sync::Arc};
use tokio::sync::Semaphore;

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
    /// Bound accepted file mutations, including writers waiting on the same file.
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
                && (1..=Semaphore::MAX_PERMITS).contains(&config.file_mutations),
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
    pub async fn run<T: Send + 'static>(
        &self,
        task: impl Future<Output = Result<T, crate::api::ApiError>> + Send + 'static,
    ) -> Result<T, crate::api::ApiError> {
        let permit = self.admit()?;
        self.jobs
            .spawn(async move {
                let _permit = permit;
                task.await
            })
            .await
            .map_err(|_| crate::api::ApiError::Unavailable)?
    }

    pub async fn drain(&self) {
        self.jobs.close();
        self.jobs.wait().await;
    }

    pub fn admit(&self) -> Result<tokio::sync::OwnedSemaphorePermit, crate::api::ApiError> {
        self.mutations
            .clone()
            .try_acquire_owned()
            .map_err(|_| crate::api::ApiError::CapacityExhausted)
    }
}
