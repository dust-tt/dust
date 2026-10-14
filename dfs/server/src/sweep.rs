use std::time::Duration;

use anyhow::Result;
use ring::rand::{SecureRandom, SystemRandom};
use tokio::time::sleep;

use crate::{
    clock,
    storage::{fdb, resources::session::SessionResource},
};

const SESSION_SWEEP_MIN_INTERVAL_MS: u64 = 1_000;
const SESSION_SWEEP_MAX_INTERVAL_MS: u64 = 60_000;
const SESSION_SWEEP_GRACE_PERIOD_MS: u64 = 60_000;

/**
 * @cc [owner:spolu,label:backend;concurrency] session-sweep-scheduling
 * Every pass, including the first, MUST wait a fresh random delay between one and sixty seconds
 * before accessing FDB. A failed pass MUST be logged and wait again before retrying.
 */
pub(crate) async fn sweep_expired_sessions() {
    loop {
        sleep(Duration::from_millis(SESSION_SWEEP_MIN_INTERVAL_MS)).await;
        if let Err(error) = sweep().await {
            tracing::error!(
                error = format!("{error:#}"),
                "expired session cleanup failed"
            );
        }
    }
}

/**
 * @cc [owner:spolu,label:backend;concurrency] session-sweep-cutoff
 * A pass MUST only consider sessions expired for at least one minute and MUST use the same cutoff
 * for every batch.
 */
async fn sweep() -> Result<()> {
    let mut random = [0; size_of::<u64>()];
    SystemRandom::new()
        .fill(&mut random)
        .map_err(|_| anyhow::anyhow!("session cleanup jitter generation failed"))?;
    let jitter_ms = u64::from_le_bytes(random)
        % (SESSION_SWEEP_MAX_INTERVAL_MS - SESSION_SWEEP_MIN_INTERVAL_MS + 1);
    sleep(Duration::from_millis(jitter_ms)).await;

    // Keep the cutoff fixed and commit batches without another delay until the index is drained.
    let now_ms = clock::now_ms()?;
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
