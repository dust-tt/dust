use std::sync::OnceLock;

use anyhow::{Context, Result};
use foundationdb::{
    Database, FdbBindingError, RetryableTransaction,
    options::{DatabaseOption, TransactionOption},
};

use super::Error;

/// dust-hive envs export their own cluster file through `env.sh`.
const CLUSTER_FILE_ENV: &str = "FDB_CLUSTER_FILE";
const DEFAULT_CLUSTER_FILE: &str = "fdb.cluster";

/// `Database::run` retries forever by default; this bounds every transaction, retries included.
const TRANSACTION_TIMEOUT_MS: i32 = 5_000;

static DATABASE: OnceLock<Database> = OnceLock::new();

/// The process-wide database, opened on first use. The caller must have booted the network first.
pub fn database() -> Result<&'static Database> {
    if let Some(database) = DATABASE.get() {
        return Ok(database);
    }
    let database = open()?;
    Ok(DATABASE.get_or_init(|| database))
}

/**
 * @cc [owner:spolu,label:backend;error-handling] preserve-fdb-retry-errors
 * FDB failures MUST reach Database::run unchanged so it can decide whether to retry. Resource
 * failures MUST abort the attempt without committing or retrying and retain their typed error
 * after the runner returns.
 */
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
            // Database::run only accepts FdbBindingError. Carry resource errors through its
            // CustomError variant while leaving FDB errors available to the retry logic.
            async move { future.await.map_err(FdbBindingError::from) }
        })
        .await
        // Recover boxed resource errors so the API can map them to their specific status.
        .map_err(Error::from)
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
