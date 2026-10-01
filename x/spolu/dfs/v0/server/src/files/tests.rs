use std::sync::atomic::{AtomicUsize, Ordering};

use anyhow::Result;
use tokio::sync::oneshot;

use super::*;
use crate::api::ApiError;

#[tokio::test]
async fn bursts_wait_without_starting_work_and_admitted_jobs_survive_caller_cancellation()
-> Result<()> {
    let directory = tempfile::tempdir()?;
    let files = Files::new(FileConfig {
        file_mutations: 1,
        scratch_dir: directory.path().to_owned(),
        ..Default::default()
    })?;
    let (release, wait) = oneshot::channel();
    let (started, start) = oneshot::channel();
    let mut first = Box::pin(files.run(async move {
        let _ = started.send(());
        wait.await.map_err(|_| ApiError::Internal)?;
        Ok(())
    }));
    assert!(futures::poll!(first.as_mut()).is_pending());
    start.await?;
    let completed = Arc::new(AtomicUsize::new(0));
    for _ in 0..MAX_WAITING_FILE_JOBS {
        let completed = completed.clone();
        let mut queued = Box::pin(files.run(async move {
            completed.fetch_add(1, Ordering::SeqCst);
            Ok(())
        }));
        assert!(futures::poll!(queued.as_mut()).is_pending());
        // Losing the caller must not cancel the admitted job or prematurely release its slot.
        drop(queued);
    }
    let observed = completed.clone();
    assert_eq!(
        files
            .run(async move {
                observed.fetch_add(1, Ordering::SeqCst);
                Ok(())
            })
            .await,
        Err(ApiError::CapacityExhausted)
    );
    tokio::task::yield_now().await;
    assert_eq!(completed.load(Ordering::SeqCst), 0);
    let _ = release.send(());
    first.await?;
    files.drain().await;
    assert_eq!(completed.load(Ordering::SeqCst), MAX_WAITING_FILE_JOBS);
    Ok(())
}
