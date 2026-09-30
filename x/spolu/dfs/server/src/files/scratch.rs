use crate::api::ApiError;
use std::{
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
};

pub(super) struct Scratch {
    directory: PathBuf,
    limit: u64,
    used: Arc<AtomicU64>,
}

impl Scratch {
    pub fn new(directory: PathBuf, limit: u64) -> Self {
        Self {
            directory,
            limit,
            used: Arc::new(AtomicU64::new(0)),
        }
    }

    /**
     * @cc [owner:spolu,label:performance;concurrency] bounded-anonymous-scratch
     * Reserve the entire resulting logical file size before allocating disk or reading file bytes.
     * Reject quota exhaustion instead of accumulating waiters or silently spilling without a bound.
     * Scratch files MUST be anonymous/unlinked on supported Unix hosts, disappear after their final
     * descriptor closes (including process death), and never be recovery inputs. Release reservations
     * on every failure or cancellation. Disk full/quota failures MUST return CapacityExhausted.
     */
    pub async fn create(&self, size: u64) -> Result<ScratchFile, ApiError> {
        self.used
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |used| {
                used.checked_add(size).filter(|total| *total <= self.limit)
            })
            .map_err(|_| ApiError::CapacityExhausted)?;
        let lease = DiskLease {
            size,
            used: self.used.clone(),
        };
        let directory = self.directory.clone();
        // Keep the quota in the blocking task if its awaiting request is cancelled.
        let (file, lease) = tokio::task::spawn_blocking(move || {
            let file = tempfile::tempfile_in(directory).map_err(io_error)?;
            Ok::<_, ApiError>((file, lease))
        })
        .await
        .map_err(|_| ApiError::Unavailable)??;
        let file = tokio::fs::File::from_std(file);
        file.set_len(size).await.map_err(io_error)?;
        Ok(ScratchFile {
            file,
            _lease: lease,
        })
    }
}

pub(super) struct ScratchFile {
    pub file: tokio::fs::File,
    _lease: DiskLease,
}
struct DiskLease {
    size: u64,
    used: Arc<AtomicU64>,
}
impl Drop for DiskLease {
    fn drop(&mut self) {
        self.used.fetch_sub(self.size, Ordering::AcqRel);
    }
}

pub(crate) fn io_error(error: std::io::Error) -> ApiError {
    if error.kind() == std::io::ErrorKind::StorageFull
        || matches!(error.raw_os_error(), Some(28 | 69 | 122))
    {
        ApiError::CapacityExhausted
    } else {
        ApiError::Unavailable
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn disk_quota_is_shared_and_anonymous_files_are_reclaimed() -> anyhow::Result<()> {
        let directory = tempfile::tempdir()?;
        let scratch = Scratch::new(directory.path().to_owned(), 10);
        let first = scratch.create(6).await?;
        assert!(matches!(
            scratch.create(5).await,
            Err(ApiError::CapacityExhausted)
        ));
        assert!(std::fs::read_dir(directory.path())?.next().is_none());
        drop(first);
        let second = scratch.create(10).await?;
        drop(second);
        assert_eq!(scratch.used.load(Ordering::Acquire), 0);
        let unavailable = Scratch::new(directory.path().join("missing"), 10);
        assert!(unavailable.create(5).await.is_err());
        assert_eq!(unavailable.used.load(Ordering::Acquire), 0);
        assert_eq!(
            io_error(std::io::Error::from_raw_os_error(28)),
            ApiError::CapacityExhausted
        );
        Ok(())
    }
}
