use std::{
    sync::atomic::{AtomicUsize, Ordering},
    time::{Duration, Instant},
};

use anyhow::Result;
use dfs_api::storage::{
    self, fdb,
    resources::{keys::tenant_subspace, tenant},
};
use dfs_protocol::ObjectId;
use foundationdb::Database;

const PING_DEADLINE_HEADROOM_MS: i32 = 5_000;
const UNREACHABLE_PING_DEADLINE: Duration =
    Duration::from_millis((fdb::PING_TIMEOUT_MS + PING_DEADLINE_HEADROOM_MS) as u64);

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
        fdb::ping(fdb::database()?).await?;
        ping_fails_instead_of_hanging_when_fdb_is_unreachable().await?;
        resource_errors_abort_staged_writes().await
    })
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

async fn resource_errors_abort_staged_writes() -> Result<()> {
    let tenant_id = ObjectId::new_v7().to_string();
    let key = tenant_subspace(&tenant_id).pack(&"resource-error-test");
    let attempts = AtomicUsize::new(0);
    let result = fdb::with_transaction(|tx| {
        attempts.fetch_add(1, Ordering::Relaxed);
        let key = &key;
        async move {
            tx.set(key, b"must not commit");
            tenant::TenantResource::new("tenant\0invalid".to_owned())?;
            Ok(())
        }
    })
    .await;

    assert!(matches!(
        result,
        Err(storage::Error::Resource(tenant::Error::InvalidId))
    ));
    assert_eq!(attempts.load(Ordering::Relaxed), 1);
    let tx = fdb::database()?.create_trx()?;
    assert!(tx.get(&key, false).await?.is_none());
    Ok(())
}
