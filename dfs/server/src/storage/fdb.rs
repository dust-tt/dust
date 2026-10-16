use std::sync::OnceLock;

use anyhow::{Context, Result};
use foundationdb::{
    Database, FdbBindingError, RetryableTransaction,
    options::{DatabaseOption, TransactionOption},
};

use super::{Error, receipt::Receipt};

/// dust-hive envs export their own cluster file through `env.sh`.
const CLUSTER_FILE_ENV: &str = "FDB_CLUSTER_FILE";
const DEFAULT_CLUSTER_FILE: &str = "fdb.cluster";

/// `Database::run` retries forever by default; this bounds every transaction, retries included.
pub const TRANSACTION_TIMEOUT_MS: i32 = 5_000;
const NO_COMMIT_VERSION_CODE: i32 = 2021;

static DATABASE: OnceLock<Database> = OnceLock::new();

/// The process-wide database, opened on first use. The caller must have booted the network first.
pub fn database() -> Result<&'static Database> {
    if let Some(database) = DATABASE.get() {
        return Ok(database);
    }
    let database = open()?;
    Ok(DATABASE.get_or_init(|| database))
}

pub async fn with_transaction<F, Fut, T, E>(body: F) -> Result<T, Error<E>>
where
    F: Fn(RetryableTransaction) -> Fut,
    Fut: Future<Output = Result<T, Error<E>>>,
    E: std::error::Error + Send + Sync + 'static,
{
    let database = database().map_err(Error::Open)?;
    database
        .run(|tx, _maybe_committed| {
            let future = body(tx);
            // Database::run only accepts FdbBindingError. Carry resource and decoding errors through
            // its CustomError variant while leaving FDB errors available to the retry logic.
            async move { future.await.map_err(FdbBindingError::from) }
        })
        .await
        // Recover boxed errors so the API can map each variant to its specific status.
        .map_err(Error::from)
}

/**
 * @cc [owner:spolu,label:backend;security] idempotent-transaction
 * One receipt MUST cover the whole retry loop. Within the retry window, observing a committed
 * receipt MUST return that attempt's saved result and original commit version without rerunning
 * the body. An absent receipt MUST allow another attempt. Expired invocations MUST fail without
 * executing the body. The mechanism MUST remain independent of resource and API types.
 * All persistent writes performed by the body MUST use the supplied transaction.
 */
pub async fn with_idempotent_transaction<F, Fut, T, E>(body: F) -> Result<(T, i64), Error<E>>
where
    F: Fn(RetryableTransaction) -> Fut,
    Fut: Future<Output = Result<T, Error<E>>>,
    T: Clone,
    E: std::error::Error + Send + Sync + 'static,
{
    let mut receipt = Receipt::new()?;
    receipt.with_transaction(body).await
}

/**
 * @cc [owner:spolu,label:backend] transaction-commit-version
 * Returned values MUST come from the successful attempt, accompanied by its commit version, or
 * None for a read-only commit. Closure and commit errors MUST retain the normal transaction retry
 * and domain-error behavior. The versionstamp MUST be awaited only after the runner commits.
 */
pub async fn with_transaction_and_version<F, Fut, T, E>(
    body: F,
) -> Result<(T, Option<i64>), Error<E>>
where
    F: Fn(RetryableTransaction) -> Fut,
    Fut: Future<Output = Result<T, Error<E>>>,
    E: std::error::Error + Send + Sync + 'static,
{
    let (value, versionstamp) = with_transaction(|tx| {
        // The future survives the transaction handle and resolves only after the runner commits.
        let versionstamp = tx.get_versionstamp();
        let future = body(tx);
        async move { Ok((future.await?, versionstamp)) }
    })
    .await?;
    let version = match versionstamp.await {
        Ok(stamp) => {
            // FDB's ten-byte transaction versionstamp starts with the eight-byte big-endian version.
            Some(version_from_stamp(&stamp))
        }
        Err(error) if error.code() == NO_COMMIT_VERSION_CODE => None,
        Err(error) => return Err(FdbBindingError::from(error).into()),
    };
    Ok((value, version))
}

pub(super) fn version_from_stamp(stamp: &[u8]) -> i64 {
    stamp
        .iter()
        .take(size_of::<i64>())
        .fold(0, |version, byte| (version << u8::BITS) | i64::from(*byte))
}

fn open() -> Result<Database> {
    let cluster_file =
        std::env::var(CLUSTER_FILE_ENV).unwrap_or_else(|_| DEFAULT_CLUSTER_FILE.to_owned());
    tracing::info!(cluster_file = %cluster_file, "opening FoundationDB");
    let database = Database::from_path(&cluster_file)
        .with_context(|| format!("opening cluster file {cluster_file}"))?;
    database.set_option(DatabaseOption::TransactionTimeout(TRANSACTION_TIMEOUT_MS))?;
    Ok(database)
}

/// FDB clients retry forever by default; give up instead so an unreachable cluster is reported.
pub const PING_TIMEOUT_MS: i32 = 5_000;

/// Fails unless the cluster answers a transaction within `PING_TIMEOUT_MS`.
pub async fn ping(database: &Database) -> Result<()> {
    let tx = database.create_trx()?;
    tx.set_option(TransactionOption::Timeout(PING_TIMEOUT_MS))?;
    tx.get_read_version().await.with_context(|| {
        format!("FoundationDB did not answer within {PING_TIMEOUT_MS} ms; is it running?")
    })?;
    Ok(())
}
