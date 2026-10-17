use std::{convert::Infallible, time::Duration};

use anyhow::Result;
use ring::rand::{SecureRandom, SystemRandom};
use tokio::time::sleep;

use crate::{
    clock,
    storage::{self, fdb, receipt, resources::session::SessionResource},
};

const STORAGE_SWEEP_MIN_INTERVAL_MS: u64 = 1_000;
const STORAGE_SWEEP_MAX_INTERVAL_MS: u64 = 60_000;
const SESSION_SWEEP_GRACE_PERIOD_MS: u64 = 60_000;

/**
 * @cc [owner:spolu,label:backend;concurrency] storage-sweep-scheduling
 * Every pass, including the first, MUST wait a fresh random delay between one and sixty seconds
 * before accessing FDB. Sessions and receipts MUST share this delay and the pass timestamp.
 * Each cleanup MUST run even if the other fails; failures MUST be logged and wait until the next
 * pass before retrying.
 */
pub(crate) async fn sweep_expired_storage() {
    loop {
        sleep(Duration::from_millis(STORAGE_SWEEP_MIN_INTERVAL_MS)).await;
        if let Err(error) = sweep().await {
            tracing::error!(
                error = format!("{error:#}"),
                "expired storage cleanup failed"
            );
        }
    }
}

async fn sweep() -> Result<()> {
    let mut random = [0; size_of::<u64>()];
    SystemRandom::new()
        .fill(&mut random)
        .map_err(|_| anyhow::anyhow!("storage cleanup jitter generation failed"))?;
    let jitter_ms = u64::from_le_bytes(random)
        % (STORAGE_SWEEP_MAX_INTERVAL_MS - STORAGE_SWEEP_MIN_INTERVAL_MS + 1);
    sleep(Duration::from_millis(jitter_ms)).await;

    let now_ms = clock::now_ms()?;
    let (sessions, receipts) = tokio::join!(
        sweep_expired_sessions(now_ms),
        sweep_expired_receipts(now_ms),
    );
    if let Err(error) = sessions {
        tracing::error!(
            error = format!("{error:#}"),
            "expired session cleanup failed"
        );
    }
    if let Err(error) = receipts {
        tracing::error!(
            error = format!("{error:#}"),
            "expired receipt cleanup failed"
        );
    }
    Ok(())
}

/**
 * @cc [owner:spolu,label:backend;concurrency] session-sweep-cutoff
 * A pass MUST only consider sessions expired for at least one minute and MUST use the same cutoff
 * for every batch, draining the index in fresh ordinary transactions without further delays.
 */
async fn sweep_expired_sessions(now_ms: u64) -> Result<()> {
    let cutoff_ms = now_ms.saturating_sub(SESSION_SWEEP_GRACE_PERIOD_MS);
    let mut processed_entries = 0;
    let mut revoked_sessions = 0;
    loop {
        let (processed, revoked) = fdb::with_transaction(|tx| async move {
            SessionResource::revoke_expired(&tx, cutoff_ms).await
        })
        .await?;
        processed_entries += processed;
        revoked_sessions += revoked;
        if processed == 0 {
            tracing::info!(
                processed_entries,
                revoked_sessions,
                "expired session cleanup completed"
            );
            return Ok(());
        }
    }
}

/**
 * @cc [owner:spolu,label:backend;concurrency] receipt-sweep-batches
 * A pass MUST drain expired receipts using the same timestamp for every batch, in fresh ordinary
 * transactions without further delays or new receipts. The completed pass MUST log its total.
 */
async fn sweep_expired_receipts(now_ms: u64) -> Result<()> {
    let mut deleted_receipts = 0;
    loop {
        let deleted = fdb::with_transaction(|tx| async move {
            receipt::clear_expired(&tx, now_ms)
                .await
                .map_err(storage::Error::<Infallible>::from)
        })
        .await?;
        deleted_receipts += deleted;
        if deleted == 0 {
            tracing::info!(deleted_receipts, "expired receipt cleanup completed");
            return Ok(());
        }
    }
}
