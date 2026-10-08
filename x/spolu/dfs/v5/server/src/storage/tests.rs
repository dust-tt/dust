use super::*;
use anyhow::{Context, Result, ensure};
use std::sync::atomic::{AtomicUsize, Ordering};

pub(crate) async fn retry_contracts(storage: &Storage) -> Result<()> {
    for code in [1037, 1031] {
        retry_read(storage, code).await?;
    }
    for error in [
        status(ErrorCode::Unavailable),
        fdb_failed(FdbError::from_code(1021)),
        fdb_failed(FdbError::from_code(2000)),
    ] {
        let attempts = AtomicUsize::new(0);
        let result = storage
            .transact(|_| {
                attempts.fetch_add(1, Ordering::Relaxed);
                let error = error.clone();
                async move { Err::<(WriteBatch, ()), _>(error) }
            })
            .await;
        ensure!(result.is_err() && attempts.load(Ordering::Relaxed) == 1);
    }
    ensure!(!commit_error(FdbError::from_code(1021)).is_retryable_not_committed());
    let error = fdb_failed(FdbError::from_code(1037));
    ensure!(error.message() == "Unavailable." && error.metadata().is_empty());
    Ok(())
}

async fn retry_read(storage: &Storage, code: i32) -> Result<()> {
    let key = format!("retry-read-test-{code}");
    let attempts = AtomicUsize::new(0);
    storage
        .transact(|snapshot| {
            let attempts = &attempts;
            let key = key.as_bytes();
            async move {
                ensure_empty(&snapshot, key).await?;
                let mut batch = WriteBatch::new();
                batch.increment(key);
                if attempts.fetch_add(1, Ordering::Relaxed) == 0 {
                    batch.apply(&snapshot)?;
                    return Err(fdb_failed(FdbError::from_code(code)));
                }
                Ok((batch, ()))
            }
        })
        .await?;
    ensure!(attempts.load(Ordering::Relaxed) == 2);
    let value = storage.get(key).await?.context("committed increment")?;
    ensure!(value.as_ref() == 1i64.to_le_bytes());

    Ok(())
}

async fn ensure_empty(snapshot: &Snapshot, key: &[u8]) -> Result<(), Status> {
    if snapshot.get(key).await?.is_some() {
        return Err(status(ErrorCode::Internal));
    }
    Ok(())
}
