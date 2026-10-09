use std::time::{Duration, Instant};

use anyhow::{Context, Result};
use dfs_api::{
    auth,
    storage::{fdb, resources::tenant::TenantResource},
};
use dfs_protocol::ObjectId;
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
        tenants_are_fetched_after_create(&database).await?;
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

async fn tenants_are_fetched_after_create(database: &Database) -> Result<()> {
    let created = TenantResource {
        tenant_id: format!("test-{}", ObjectId::new_v7()),
        root_id: ObjectId::new_v7(),
        key_hash: auth::hash_key("key"),
    };
    let tenant_id = created.tenant_id.as_str();

    let missing = database
        .run(|transaction, _maybe_committed| async move {
            TenantResource::fetch(&transaction, tenant_id).await
        })
        .await?;
    database
        .run(|transaction, _maybe_committed| {
            created.create(&transaction);
            async { Ok(()) }
        })
        .await?;
    let fetched = database
        .run(|transaction, _maybe_committed| async move {
            TenantResource::fetch(&transaction, tenant_id).await
        })
        .await?
        .context("tenant missing after create")?;

    assert!(missing.is_none());
    assert_eq!(fetched.root_id, created.root_id);
    assert_eq!(fetched.key_hash, created.key_hash);
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
