//! Read the FDB byte-sample estimate for one existing scale tenant without scanning its contents.
use anyhow::{Result, ensure};
use clap::Parser;
use dfs_core::keys::{Keys, prefix_end};
use dfs_server_v5::storage::StorageConfig;
use foundationdb::{Database, options::TransactionOption};

#[derive(Parser)]
struct Config {
    #[command(flatten)]
    storage: StorageConfig,
    #[arg(long)]
    tenant: String,
}

/// @cc [owner:spolu,label:testing;backend] read-only-fixture-size
/// Measurement MUST perform only reads against an existing format-6 scale tenant. Missing/foreign
/// formats or tenants MUST fail without initialization. Report FDB's byte-sample estimate as logical
/// key/value bytes, never as exact physical disk, replication, ES storage or permission-tree RAM.
fn main() -> Result<()> {
    dfs_server_v5::network::run(async {
        let config = Config::parse();
        ensure!(
            config.storage.fdb_prefix.starts_with("dfs-v5-scale-")
                && config.storage.fdb_prefix.len() <= 256,
            "an existing isolated scale prefix is required"
        );
        let keys = Keys::new(&config.tenant)?;
        let database = Database::from_path(&config.storage.fdb_cluster_file)?;
        let transaction = database.create_trx()?;
        transaction.set_option(TransactionOption::Timeout(10_000))?;
        // The format check guards the same deployment prefix encoding as Storage::open.
        let mut deployment = vec![5];
        deployment.extend_from_slice(&(config.storage.fdb_prefix.len() as u16).to_be_bytes());
        deployment.extend_from_slice(config.storage.fdb_prefix.as_bytes());
        let format = transaction
            .get(&[deployment.as_slice(), b"\0format"].concat(), true)
            .await?;
        ensure!(
            format.as_deref() == Some(b"dfs-v5-fdb-6".as_slice()),
            "existing format-6 deployment required"
        );
        let tenant_key = [deployment.as_slice(), keys.tenant().as_slice()].concat();
        ensure!(
            transaction.get(&tenant_key, true).await?.is_some(),
            "existing tenant required"
        );
        // Format 6 places a one-byte family after the length-delimited tenant prefix.
        let mut tenant_prefix = keys.tenant();
        ensure!(
            tenant_prefix.pop() == Some(6),
            "unexpected tenant key encoding"
        );
        let start = [deployment.as_slice(), tenant_prefix.as_slice()].concat();
        let bytes = transaction
            .get_estimated_range_size_bytes(&start, &prefix_end(&start))
            .await?;
        ensure!(bytes >= 0, "invalid range size estimate");
        println!(
            "{}",
            serde_json::json!({"tenant":config.tenant,"estimated_logical_kv_bytes":bytes,
                "scope":"FDB byte-sample estimate; excludes physical replication/log overhead, ES and RAM"})
        );
        Ok(())
    })
}
