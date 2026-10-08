use std::sync::OnceLock;

use anyhow::{Context, Result};
use foundationdb::{Database, api::NetworkAutoStop, options::TransactionOption};

static NETWORK: OnceLock<NetworkAutoStop> = OnceLock::new();

/// Opens the database named by `cluster_file`, booting the client network on first use.
pub fn open(cluster_file: &str) -> Result<Database> {
    NETWORK.get_or_init(|| {
        // SAFETY: `get_or_init` runs this once per process, and the static keeps the network
        // alive until the process exits.
        #[allow(unsafe_code)]
        unsafe {
            foundationdb::boot()
        }
    });
    Database::from_path(cluster_file)
        .with_context(|| format!("opening cluster file {cluster_file}"))
}

/// FDB clients retry forever by default; give up instead so an unreachable cluster is reported.
const PING_TIMEOUT_MS: i32 = 5_000;

/// Fails unless the cluster answers a transaction within `PING_TIMEOUT_MS`.
pub async fn ping(database: &Database) -> Result<()> {
    let transaction = database.create_trx()?;
    transaction.set_option(TransactionOption::Timeout(PING_TIMEOUT_MS))?;
    transaction.get_read_version().await.with_context(|| {
        format!("FoundationDB did not answer within {PING_TIMEOUT_MS} ms; is it running?")
    })?;
    Ok(())
}
