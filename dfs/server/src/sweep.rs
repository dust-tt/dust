use std::time::{Duration, SystemTime, UNIX_EPOCH};

use anyhow::Result;
use ring::rand::{SecureRandom, SystemRandom};
use tokio::time::sleep;

use crate::storage::{fdb, resources::session::SessionResource};

const SESSION_SWEEP_MIN_INTERVAL_MS: u64 = 60_000;
const SESSION_SWEEP_MAX_INTERVAL_MS: u64 = 300_000;

/**
 * @cc [owner:spolu,label:backend;concurrency] session-sweep-scheduling
 * Every pass, including the first, MUST wait a fresh random delay between one and five minutes
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

async fn sweep() -> Result<()> {
    let mut random = [0; size_of::<u64>()];
    SystemRandom::new()
        .fill(&mut random)
        .map_err(|_| anyhow::anyhow!("session cleanup jitter generation failed"))?;
    let jitter_ms = u64::from_le_bytes(random)
        % (SESSION_SWEEP_MAX_INTERVAL_MS - SESSION_SWEEP_MIN_INTERVAL_MS + 1);
    sleep(Duration::from_millis(jitter_ms)).await;

    // Keep the cutoff fixed while draining this pass in bounded transactions.
    let cutoff_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)?
        .as_millis()
        .try_into()?;
    loop {
        let processed = fdb::with_transaction(|tx| async move {
            SessionResource::revoke_expired(&tx, cutoff_ms).await
        })
        .await?;
        if processed == 0 {
            return Ok(());
        }
    }
}
