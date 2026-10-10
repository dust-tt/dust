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
