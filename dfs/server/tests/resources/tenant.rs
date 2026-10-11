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
use foundationdb::{
    FdbBindingError,
    tuple::{pack, unpack},
};

pub(crate) async fn authentication_requires_a_matching_index_and_tenant_record() -> Result<()> {
    let (owner, _) = tenant::TenantResource::new(ObjectId::new_v7().to_string())?;
    let (other, _) = tenant::TenantResource::new(ObjectId::new_v7().to_string())?;
    fdb::with_transaction(|tx| {
        let owner = &owner;
        let other = &other;
        async move {
            owner.create(&tx).await?;
            other.create(&tx).await?;
            for expected in [owner, other] {
                let authenticated =
                    tenant::TenantResource::authenticate(&tx, &expected.key_hash).await?;
                assert_eq!(authenticated.tenant_id, expected.tenant_id);
                assert_eq!(authenticated.root_id, expected.root_id);
                assert_eq!(authenticated.key_hash, expected.key_hash);
            }

            let lookup = namespace_subspace().pack(&("tenant-key", owner.key_hash.as_slice()));
            tx.set(&lookup, &pack(&other.tenant_id.as_str()));
            assert!(matches!(
                tenant::TenantResource::authenticate(&tx, &owner.key_hash).await,
                Err(storage::Error::Resource(tenant::Error::InvalidKey))
            ));

            tx.set(&lookup, &pack(&owner.tenant_id.as_str()));
            let record = tenant_subspace(&owner.tenant_id).pack(&"tenant");
            tx.set(
                &record,
                &pack(&(owner.root_id.as_bytes().as_slice(), &[0u8; 31][..])),
            );
            assert!(matches!(
                tenant::TenantResource::authenticate(&tx, &owner.key_hash).await,
                Err(storage::Error::InvalidKeyHash(_))
            ));
            tx.set(&record, &pack(&(&[0u8; 15][..], owner.key_hash.as_slice())));
            assert!(matches!(
                tenant::TenantResource::authenticate(&tx, &owner.key_hash).await,
                Err(storage::Error::InvalidObjectId(_))
            ));
            tx.clear(&tenant_subspace(&owner.tenant_id).pack(&"tenant"));
            assert!(matches!(
                tenant::TenantResource::authenticate(&tx, &owner.key_hash).await,
                Err(storage::Error::Resource(tenant::Error::InvalidKey))
            ));

            tx.clear(&lookup);
            assert!(matches!(
                tenant::TenantResource::authenticate(&tx, &owner.key_hash).await,
                Err(storage::Error::Resource(tenant::Error::InvalidKey))
            ));

            // Malformed stored data remains a storage failure, not an invalid credential.
            tx.set(&lookup, &[0xff]);
            assert!(matches!(
                tenant::TenantResource::authenticate(&tx, &owner.key_hash).await,
                Err(storage::Error::Transaction(FdbBindingError::PackError(_)))
            ));

            for tenant in [owner, other] {
                let (begin, end) = tenant_subspace(&tenant.tenant_id).range();
                tx.clear_range(&begin, &end);
                tx.clear(&namespace_subspace().pack(&("tenant-key", tenant.key_hash.as_slice())));
            }
            Ok::<(), storage::Error<tenant::Error>>(())
        }
    })
    .await?;
    Ok(())
}

pub(crate) async fn decoding_errors_abort_creation_and_retain_their_type() -> Result<()> {
    let (tenant, _) = tenant::TenantResource::new(ObjectId::new_v7().to_string())?;
    let record = tenant_subspace(&tenant.tenant_id).pack(&"tenant");
    let lookup = namespace_subspace().pack(&("tenant-key", tenant.key_hash.as_slice()));

    for invalid_key_hash in [true, false] {
        let value = if invalid_key_hash {
            pack(&(tenant.root_id.as_bytes().as_slice(), &[0u8; 31][..]))
        } else {
            pack(&(&[0u8; 15][..], tenant.key_hash.as_slice()))
        };
        let attempts = AtomicUsize::new(0);
        let result = fdb::with_transaction(|tx| {
            attempts.fetch_add(1, Ordering::Relaxed);
            let tenant = &tenant;
            let record = &record;
            let value = &value;
            async move {
                tenant.create(&tx).await?;
                tx.set(record, value);
                tenant.create(&tx).await
            }
        })
        .await;

        let (record_exists, lookup_exists) = fdb::database()?
            .run(|tx, _| {
                let record = &record;
                let lookup = &lookup;
                async move {
                    let record_exists = tx.get(record, false).await?.is_some();
                    let lookup_exists = tx.get(lookup, false).await?.is_some();
                    tx.clear(record);
                    tx.clear(lookup);
                    Ok((record_exists, lookup_exists))
                }
            })
            .await?;

        if invalid_key_hash {
            assert!(matches!(result, Err(storage::Error::InvalidKeyHash(_))));
        } else {
            assert!(matches!(result, Err(storage::Error::InvalidObjectId(_))));
        }
        assert_eq!(attempts.load(Ordering::Relaxed), 1);
        assert!(!record_exists);
        assert!(!lookup_exists);
    }
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
