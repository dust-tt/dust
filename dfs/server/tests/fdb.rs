use std::time::{Duration, Instant};

use anyhow::Result;
use dfs_api::storage::fdb;
use foundationdb::{Database, options::TransactionOption};

const PING_DEADLINE_HEADROOM_MS: i32 = 5_000;
const UNREACHABLE_PING_DEADLINE: Duration =
    Duration::from_millis((fdb::PING_TIMEOUT_MS + PING_DEADLINE_HEADROOM_MS) as u64);
const TRANSACTION_TIMEOUT_MS: i32 = 5_000;

/// The network boots once per process and cannot restart once stopped, so every FDB check runs
/// under this one test, which holds the guard and drops it before the binary exits.
#[test]
fn fdb_client() -> Result<()> {
    // SAFETY: the only `boot` in this test binary; `_network` is dropped when this test returns.
    #[allow(unsafe_code)]
    let _network = unsafe { foundationdb::boot() };
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?;

    runtime.block_on(async {
        let database = fdb::open()?;
        fdb::ping(&database).await?;
        writes_are_read_back_then_cleared(&database).await?;
        ping_fails_instead_of_hanging_when_fdb_is_unreachable().await
    })
}

async fn writes_are_read_back_then_cleared(database: &Database) -> Result<()> {
    let key = format!("dfs-test/round-trip/{}", std::process::id()).into_bytes();
    let key = key.as_slice();

    database
        .run(|transaction, _maybe_committed| async move {
            transaction.set_option(TransactionOption::Timeout(TRANSACTION_TIMEOUT_MS))?;
            transaction.set(key, b"hello");
            Ok(())
        })
        .await?;
    let written = database
        .run(|transaction, _maybe_committed| async move {
            transaction.set_option(TransactionOption::Timeout(TRANSACTION_TIMEOUT_MS))?;
            let value = transaction.get(key, false).await?;
            transaction.clear(key);
            Ok(value.map(|value| value.to_vec()))
        })
        .await?;
    let cleared = database
        .run(|transaction, _maybe_committed| async move {
            transaction.set_option(TransactionOption::Timeout(TRANSACTION_TIMEOUT_MS))?;
            Ok(transaction.get(key, false).await?)
        })
        .await?;

    assert_eq!(written.as_deref(), Some(b"hello".as_slice()));
    assert!(cleared.is_none());
    Ok(())
}

async fn ping_fails_instead_of_hanging_when_fdb_is_unreachable() -> Result<()> {
    let cluster_file =
        std::env::temp_dir().join(format!("dfs-unreachable-{}.cluster", std::process::id()));
    std::fs::write(&cluster_file, "test:test@127.0.0.1:1\n")?;
    let database = Database::from_path(&cluster_file.to_string_lossy())?;
    let started = Instant::now();

    let result = fdb::ping(&database).await;

    std::fs::remove_file(&cluster_file)?;
    assert!(result.is_err());
    assert!(started.elapsed() < UNREACHABLE_PING_DEADLINE);
    Ok(())
}
