use anyhow::{Context, Result};
use foundationdb::{
    Database,
    options::{DatabaseOption, TransactionOption},
};

/// dust-hive envs export their own cluster file through `env.sh`.
const CLUSTER_FILE_ENV: &str = "FDB_CLUSTER_FILE";
const DEFAULT_CLUSTER_FILE: &str = "fdb.cluster";

/// `Database::run` retries forever by default; this bounds every transaction, retries included.
const TRANSACTION_TIMEOUT_MS: i32 = 5_000;

/// Opens the database named by `FDB_CLUSTER_FILE`. The caller must have booted the network first.
pub fn open() -> Result<Database> {
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
    let transaction = database.create_trx()?;
    transaction.set_option(TransactionOption::Timeout(PING_TIMEOUT_MS))?;
    transaction.get_read_version().await.with_context(|| {
        format!("FoundationDB did not answer within {PING_TIMEOUT_MS} ms; is it running?")
    })?;
    Ok(())
}
