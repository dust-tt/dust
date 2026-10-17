use std::time::Duration;

use anyhow::Result;
use dfs_api::{
    clock,
    storage::{
        fdb,
        resources::{
            keys::{namespace_subspace, tenant_subspace},
            session::SessionResource,
            tenant::TenantResource,
        },
    },
};
use dfs_protocol::ObjectId;
use futures::future::try_join_all;
use tokio::time::{sleep, timeout};

const SWEEP_TEST_DEADLINE: Duration = Duration::from_secs(70);
const SWEEP_TEST_POLL_INTERVAL: Duration = Duration::from_millis(100);

pub(crate) async fn server_sweeps_expired_storage_and_preserves_live_entries() -> Result<()> {
    let (tenant, _) = TenantResource::new(ObjectId::new_v7().to_string())?;
    let (live_session, _) = SessionResource::new(&tenant, vec![])?;
    let receipts = namespace_subspace().subspace(&"idempotency-receipt");
    let recent_receipt =
        receipts.pack(&(clock::now_ms()?, uuid::Uuid::now_v7().as_bytes().as_slice()));
    let mut expired_keys = Vec::new();
    let tx = fdb::database()?.create_trx()?;
    tenant.create(&tx).await?;
    live_session.create(&tx).await?;
    tx.set(&recent_receipt, &[]);
    // Seed more than one batch in both indexes. Historical timestamps avoid waiting for expiry.
    for _ in 0..101 {
        let (mut session, _) = SessionResource::new(&tenant, vec![])?;
        session.expires_at_ms = 1;
        session.create(&tx).await?;
        expired_keys.push(tenant_subspace(&tenant.tenant_id).pack(&(
            "session",
            session.session_id.as_str(),
            "state",
        )));
        let key = receipts.pack(&(1u64, uuid::Uuid::now_v7().as_bytes().as_slice()));
        tx.set(&key, &[]);
        expired_keys.push(key);
    }
    tx.commit().await?;

    let _channel = crate::serve().await?;
    timeout(SWEEP_TEST_DEADLINE, async {
        loop {
            let tx = fdb::database()?.create_trx()?;
            let entries = try_join_all(expired_keys.iter().map(|key| tx.get(key, false))).await?;
            if entries.iter().all(Option::is_none) {
                break;
            }
            sleep(SWEEP_TEST_POLL_INTERVAL).await;
        }
        Ok::<_, anyhow::Error>(())
    })
    .await??;

    let tx = fdb::database()?.create_trx()?;
    assert!(tx.get(&recent_receipt, false).await?.is_some());
    let authenticated = SessionResource::authenticate(&tx, &live_session.key_hash).await?;
    assert_eq!(authenticated.session_id, live_session.session_id);

    SessionResource::revoke(&tx, &tenant, &live_session.session_id).await?;
    let (begin, end) = tenant_subspace(&tenant.tenant_id).range();
    tx.clear_range(&begin, &end);
    tx.clear(&namespace_subspace().pack(&("tenant-key", tenant.key_hash.as_slice())));
    tx.clear(&recent_receipt);
    tx.commit().await?;
    Ok(())
}
