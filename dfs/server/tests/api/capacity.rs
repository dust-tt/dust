use anyhow::{Context, Result};
use dfs_api::storage::{self, fdb, resources::keys::tenant_subspace};
use dfs_protocol::{ObjectId, rpc::ErrorCode};
use foundationdb::RangeOption;
use tonic::Status;

use crate::error_code;

pub(crate) async fn oversized_transactions_return_capacity_without_committing() -> Result<()> {
    let prefix = tenant_subspace(&ObjectId::new_v7().to_string()).subspace(&"capacity-test");
    let data = vec![0; 64 * 1024];
    let error = fdb::with_idempotent_transaction(|tx| {
        let prefix = &prefix;
        let data = &data;
        async move {
            // Each value fits FDB's value limit; together they exceed its transaction limit.
            for index in 0..160 {
                tx.set(&prefix.pack(&index), data);
            }
            Ok::<_, storage::Error<Status>>(())
        }
    })
    .await
    .err()
    .context("expected oversized transaction to fail")?;

    let status: Status = error.into();
    assert_eq!(error_code(&status)?, ErrorCode::Capacity);
    let tx = fdb::database()?.create_trx()?;
    let entries = tx
        .get_range(&RangeOption::from(prefix.range()), 1, false)
        .await?;
    assert!(entries.is_empty());
    Ok(())
}
