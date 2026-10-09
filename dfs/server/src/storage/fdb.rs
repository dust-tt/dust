use anyhow::{Context, Result};
use foundationdb::{Database, options::TransactionOption};

/// Opens the database named by `cluster_file`. The caller must have booted the network first.
pub fn open(cluster_file: &str) -> Result<Database> {
    Database::from_path(cluster_file)
        .with_context(|| format!("opening cluster file {cluster_file}"))
}

/// FDB clients retry forever by default; give up instead so an unreachable cluster is reported.
pub const PING_TIMEOUT_MS: i32 = 5_000;

/// Fails unless the cluster answers a transaction within `PING_TIMEOUT_MS`.
pub async fn ping(database: &Database) -> Result<()> {
    let transaction = database.create_trx()?;
    transaction.set_option(TransactionOption::Timeout(PING_TIMEOUT_MS))?;
    transaction.get_read_version().await.with_context(|| {
        format!("FoundationDB did not answer within {PING_TIMEOUT_MS} ms; is it running?")
    })?;
    Ok(())
}
