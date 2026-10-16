use std::{
    collections::HashMap,
    fmt,
    time::{Duration, Instant},
};

use foundationdb::{
    FdbBindingError, RangeOption, RetryableTransaction, Transaction,
    options::{MutationType, StreamingMode},
    tuple::{Subspace, Versionstamp, pack_with_versionstamp, unpack},
};
use tokio::sync::Mutex;
use uuid::Uuid;

use super::{fdb, resources::keys::namespace_subspace};
use crate::{clock, storage};

const FAMILY: &str = "receipt";
const LIFETIME_MS: u64 = fdb::TRANSACTION_TIMEOUT_MS as u64;
const CLEANUP_GRACE_MS: u64 = 60_000;
const CLEANUP_BATCH_SIZE: usize = 100;

#[derive(Debug)]
pub enum Error {
    TimestampGeneration,
    Expired,
    MissingResult,
    InvalidVersion,
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::TimestampGeneration => "receipt timestamp generation failed",
            Self::Expired => "receipt retry window expired",
            Self::MissingResult => "committed receipt has no saved result",
            Self::InvalidVersion => "invalid receipt commit version",
        })
    }
}

impl std::error::Error for Error {}

/**
 * @cc [owner:spolu,label:backend] receipt-transaction-identity
 * A receipt MUST be created before the retry loop and reused only for that logical operation.
 * Its ID, creation timestamp, and saved results MUST remain owned by that invocation. Receipts
 * MUST NOT be reconstructed for another process or reused for another logical operation.
 */
pub struct Receipt<T> {
    id: Uuid,
    created_at_ms: u64,
    started: Instant,
    results: Mutex<HashMap<Uuid, T>>,
}

impl<T: Clone> Receipt<T> {
    pub fn new() -> Result<Self, Error> {
        Ok(Self {
            id: Uuid::now_v7(),
            created_at_ms: clock::now_ms().map_err(|_| Error::TimestampGeneration)?,
            started: Instant::now(),
            results: Mutex::new(HashMap::new()),
        })
    }

    /**
     * @cc [owner:spolu,label:backend;security] receipt-atomic-replay
     * Within the retry window, each attempt MUST read its receipt with conflict tracking before
     * running the body. The marker MUST commit atomically with the body's writes and identify the
     * committing attempt and version. If present, the body MUST NOT run: that attempt's saved result
     * and original commit version MUST be returned, or an error if the saved result is missing.
     * An absent marker MUST cause the body to run again; saved results alone MUST NOT imply commit.
     * An expired invocation MUST fail without executing the body, even after its marker is removed.
     * Body errors MUST preserve transaction retry behavior and MUST NOT stage a receipt.
     */
    pub async fn with_transaction<F, Fut, E>(
        &mut self,
        body: F,
    ) -> Result<(T, i64), storage::Error<E>>
    where
        F: Fn(RetryableTransaction) -> Fut,
        Fut: Future<Output = Result<T, storage::Error<E>>>,
        E: std::error::Error + Send + Sync + 'static,
    {
        // Exclusive access keeps one retry loop responsible for this logical operation.
        let receipt = &*self;
        let ((result, replay_version), commit_version) = fdb::with_transaction_and_version(|tx| {
            let body = &body;
            async move { receipt.attempt(&tx, || body(tx.clone())).await }
        })
        .await?;
        let version = replay_version
            .or(commit_version)
            .ok_or(Error::InvalidVersion)?;
        Ok((result, version))
    }

    async fn attempt<F, Fut, E>(
        &self,
        tx: &Transaction,
        body: F,
    ) -> Result<(T, Option<i64>), storage::Error<E>>
    where
        F: FnOnce() -> Fut,
        Fut: Future<Output = Result<T, storage::Error<E>>>,
        E: std::error::Error + Send + Sync + 'static,
    {
        let now_ms = clock::now_ms().map_err(|_| Error::TimestampGeneration)?;
        if self.started.elapsed() >= Duration::from_millis(LIFETIME_MS)
            || now_ms.saturating_sub(self.created_at_ms) >= LIFETIME_MS
        {
            // Never execute an old invocation again after its marker becomes eligible for cleanup.
            return Err(Error::Expired.into());
        }
        let key = self.key();
        let marker = tx.get(&key, false).await.map_err(FdbBindingError::from)?;
        if let Some(marker) = marker {
            let (attempt_id, stamp): (Uuid, Versionstamp) =
                unpack(&marker).map_err(FdbBindingError::PackError)?;
            if !stamp.is_complete() {
                return Err(Error::InvalidVersion.into());
            }
            let result = self
                .results
                .lock()
                .await
                .get(&attempt_id)
                .cloned()
                .ok_or(Error::MissingResult)?;
            return Ok((
                result,
                Some(fdb::version_from_stamp(stamp.transaction_version())),
            ));
        }
        let result = body().await?;
        // A previous attempt can still be committing after a client-version change. Keep each
        // result until the marker tells us which attempt committed, even if another body ran later.
        let attempt_id = Uuid::now_v7();
        self.results.lock().await.insert(attempt_id, result.clone());
        // Only the commit marker is persisted; generic results need no storage serialization.
        tx.atomic_op(
            &key,
            &pack_with_versionstamp(&(attempt_id, Versionstamp::incomplete(0))),
            MutationType::SetVersionstampedValue,
        );
        Ok((result, None))
    }

    fn key(&self) -> Vec<u8> {
        subspace().pack(&(self.created_at_ms, self.id.as_bytes().as_slice()))
    }
}

/**
 * @cc [owner:spolu,label:backend;concurrency] receipt-cleanup-window
 * Cleanup MUST delete at most 100 markers strictly older than the transaction timeout plus cleanup
 * grace, using conflict-tracked reads in the caller's transaction. Newer markers MUST remain.
 * Callers MUST use current Unix time; inter-instance clock skew MUST remain below the cleanup grace.
 * Draining and scheduling MUST happen outside this function, in fresh transactions.
 */
pub async fn clear_expired(tx: &Transaction, now_ms: u64) -> Result<usize, FdbBindingError> {
    let cutoff_ms = now_ms.saturating_sub(LIFETIME_MS + CLEANUP_GRACE_MS);
    let prefix = subspace();
    let range = RangeOption {
        limit: Some(CLEANUP_BATCH_SIZE),
        mode: StreamingMode::WantAll,
        ..RangeOption::from((prefix.range().0, prefix.pack(&cutoff_ms)))
    };
    let entries = tx.get_range(&range, 1, false).await?;
    for entry in &entries {
        tx.clear(entry.key());
    }
    Ok(entries.len())
}

fn subspace() -> Subspace {
    namespace_subspace().subspace(&FAMILY)
}

#[cfg(test)]
#[path = "../../tests/storage/receipt.rs"]
mod tests;
