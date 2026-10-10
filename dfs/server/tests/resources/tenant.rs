use std::sync::atomic::{AtomicUsize, Ordering};

use anyhow::{Context, Result};
use dfs_api::storage::{
    self, fdb,
    resources::{
        keys::{namespace_subspace, tenant_subspace},
        tenant,
    },
};
use dfs_protocol::ObjectId;
use foundationdb::tuple::unpack;

pub(crate) async fn resource_errors_abort_staged_writes() -> Result<()> {
    let tenant_id = ObjectId::new_v7().to_string();
    let subspace = tenant_subspace(&tenant_id);
    let key = subspace.pack(&"resource-error-test");
    let (tenant, _) = tenant::TenantResource::new(tenant_id.clone())?;
    fdb::with_transaction(|tx| {
        let tenant = &tenant;
        async move { tenant.create(&tx).await }
    })
    .await?;

    let (duplicate, _) = tenant::TenantResource::new(tenant_id)?;
    let (pending, _) = tenant::TenantResource::new(ObjectId::new_v7().to_string())?;
    let attempts = AtomicUsize::new(0);
    let result = fdb::with_transaction(|tx| {
        attempts.fetch_add(1, Ordering::Relaxed);
        let key = &key;
        let duplicate = &duplicate;
        let pending = &pending;
        async move {
            tx.set(key, b"must not commit");
            pending.create(&tx).await?;
            duplicate.create(&tx).await
        }
    })
    .await;

    // Reusing the original identity succeeds, as on a retry after an unknown commit result.
    fdb::with_transaction(|tx| {
        let tenant = &tenant;
        async move { tenant.create(&tx).await }
    })
    .await?;

    let lookup_key = namespace_subspace().pack(&("tenant-key", tenant.key_hash.as_slice()));
    let duplicate_lookup_key =
        namespace_subspace().pack(&("tenant-key", duplicate.key_hash.as_slice()));
    let pending_lookup_key =
        namespace_subspace().pack(&("tenant-key", pending.key_hash.as_slice()));
    let pending_subspace = tenant_subspace(&pending.tenant_id);
    let (rolled_back, lookup, duplicate_lookup, pending_record, pending_lookup) = fdb::database()?
        .run(|tx, _| {
            let key = &key;
            let subspace = &subspace;
            let lookup_key = &lookup_key;
            let duplicate_lookup_key = &duplicate_lookup_key;
            let pending_lookup_key = &pending_lookup_key;
            let pending_subspace = &pending_subspace;
            async move {
                let rolled_back = tx.get(key, false).await?.is_none();
                let lookup = tx.get(lookup_key, false).await?;
                let duplicate_lookup = tx.get(duplicate_lookup_key, false).await?;
                let pending_record = tx.get(&pending_subspace.pack(&"tenant"), false).await?;
                let pending_lookup = tx.get(pending_lookup_key, false).await?;
                let (begin, end) = subspace.range();
                tx.clear_range(&begin, &end);
                let (begin, end) = pending_subspace.range();
                tx.clear_range(&begin, &end);
                tx.clear(lookup_key);
                tx.clear(duplicate_lookup_key);
                tx.clear(pending_lookup_key);
                Ok((
                    rolled_back,
                    lookup,
                    duplicate_lookup,
                    pending_record,
                    pending_lookup,
                ))
            }
        })
        .await?;

    assert!(matches!(
        result,
        Err(storage::Error::Resource(tenant::Error::AlreadyExists))
    ));
    assert_eq!(attempts.load(Ordering::Relaxed), 1);
    assert!(rolled_back);
    let indexed_tenant_id: String = unpack(&lookup.context("missing tenant key lookup")?)?;
    assert_eq!(indexed_tenant_id, tenant.tenant_id);
    assert!(duplicate_lookup.is_none());
    assert!(pending_record.is_none());
    assert!(pending_lookup.is_none());
    Ok(())
}

pub(crate) async fn tenant_key_collisions_preserve_the_existing_owner() -> Result<()> {
    let (owner, _) = tenant::TenantResource::new(ObjectId::new_v7().to_string())?;
    let (mut collision, _) = tenant::TenantResource::new(ObjectId::new_v7().to_string())?;
    collision.key_hash = owner.key_hash;
    fdb::with_transaction(|tx| {
        let owner = &owner;
        async move { owner.create(&tx).await }
    })
    .await?;

    let result = fdb::with_transaction(|tx| {
        let collision = &collision;
        async move { collision.create(&tx).await }
    })
    .await;

    let lookup_key = namespace_subspace().pack(&("tenant-key", owner.key_hash.as_slice()));
    let owner_subspace = tenant_subspace(&owner.tenant_id);
    let collision_subspace = tenant_subspace(&collision.tenant_id);
    let (lookup, collision_record) = fdb::database()?
        .run(|tx, _| {
            let lookup_key = &lookup_key;
            let owner_subspace = &owner_subspace;
            let collision_subspace = &collision_subspace;
            async move {
                let lookup = tx.get(lookup_key, false).await?;
                let collision_record = tx.get(&collision_subspace.pack(&"tenant"), false).await?;
                for subspace in [owner_subspace, collision_subspace] {
                    let (begin, end) = subspace.range();
                    tx.clear_range(&begin, &end);
                }
                tx.clear(lookup_key);
                Ok((lookup, collision_record))
            }
        })
        .await?;

    assert!(matches!(
        result,
        Err(storage::Error::Resource(tenant::Error::KeyCollision))
    ));
    let indexed_tenant_id: String = unpack(&lookup.context("missing tenant key lookup")?)?;
    assert_eq!(indexed_tenant_id, owner.tenant_id);
    assert!(collision_record.is_none());
    Ok(())
}
