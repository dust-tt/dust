use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result};
use dfs_api::storage::{
    self, fdb,
    resources::{
        keys::tenant_subspace,
        object::{self, ObjectResource},
        tenant::TenantResource,
    },
};
use dfs_protocol::{ObjectId, rpc::ObjectKind};
use foundationdb::tuple::unpack;

type StoredObject = (
    Option<Vec<u8>>,
    String,
    i32,
    u64,
    Option<u64>,
    Option<u64>,
    Option<u64>,
    u64,
    u64,
);

pub(crate) async fn root_creation_persists_isolated_records() -> Result<()> {
    let (tenant, _) = TenantResource::new(ObjectId::new_v7().to_string())?;
    let (mut other, _) = TenantResource::new(format!("{}/other", tenant.tenant_id))?;
    other.root_id = tenant.root_id;

    for tenant in [&tenant, &other] {
        let before_ms = SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis();
        let root = ObjectResource::new_root(tenant)?;
        fdb::with_transaction(|tx| {
            let root = &root;
            async move { root.create(&tx).await }
        })
        .await?;
        let after_ms = SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis();
        let subspace = tenant_subspace(&tenant.tenant_id);
        let object_key = subspace.pack(&("object", tenant.root_id.as_bytes().as_slice()));
        let metadata_key = subspace.pack(&("metadata", tenant.root_id.as_bytes().as_slice()));
        let tx = fdb::database()?.create_trx()?;
        let value = tx.get(&object_key, false).await?.context("missing root")?;
        let (
            parent_id,
            name,
            kind,
            size,
            atime_ms,
            mtime_ms,
            ctime_ms,
            attr_version,
            content_version,
        ): StoredObject = unpack(&value)?;
        let metadata = tx
            .get(&metadata_key, false)
            .await?
            .context("missing root metadata")?;
        let (created_at_ms, mime_type): (u64, String) = unpack(&metadata)?;
        assert_eq!(parent_id, None);
        assert!(name.is_empty());
        assert_eq!(kind, i32::from(ObjectKind::Directory));
        assert_eq!(size, 0);
        assert_eq!((attr_version, content_version), (1, 1));
        assert!((before_ms..=after_ms).contains(&u128::from(created_at_ms)));
        assert_eq!(atime_ms, Some(created_at_ms));
        assert_eq!(mtime_ms, atime_ms);
        assert_eq!(ctime_ms, atime_ms);
        assert!(mime_type.is_empty());
    }

    // Both tenants retain separate objects despite sharing an object ID and an ID string prefix.
    let tx = fdb::database()?.create_trx()?;
    for tenant in [&tenant, &other] {
        let subspace = tenant_subspace(&tenant.tenant_id);
        assert!(
            tx.get(
                &subspace.pack(&("object", tenant.root_id.as_bytes().as_slice())),
                false,
            )
            .await?
            .is_some()
        );
        let (begin, end) = subspace.range();
        tx.clear_range(&begin, &end);
    }
    tx.commit().await?;
    Ok(())
}

pub(crate) async fn object_collisions_preserve_records_and_abort_staged_writes() -> Result<()> {
    let (tenant, _) = TenantResource::new(ObjectId::new_v7().to_string())?;
    let root = ObjectResource::new_root(&tenant)?;
    fdb::with_transaction(|tx| {
        let root = &root;
        async move { root.create(&tx).await }
    })
    .await?;
    let subspace = tenant_subspace(&tenant.tenant_id);
    let object_key = subspace.pack(&("object", tenant.root_id.as_bytes().as_slice()));
    let metadata_key = subspace.pack(&("metadata", tenant.root_id.as_bytes().as_slice()));
    let staged_key = subspace.pack(&"staged");
    let tx = fdb::database()?.create_trx()?;
    let original = tx.get(&object_key, false).await?.context("missing root")?;
    let original_metadata = tx
        .get(&metadata_key, false)
        .await?
        .context("missing root metadata")?;

    let result = fdb::with_transaction(|tx| {
        let root = &root;
        let staged_key = &staged_key;
        async move {
            tx.set(staged_key, b"must not commit");
            root.create(&tx).await
        }
    })
    .await;
    assert!(matches!(
        result,
        Err(storage::Error::Resource(object::Error::AlreadyExists))
    ));

    let tx = fdb::database()?.create_trx()?;
    assert_eq!(
        tx.get(&object_key, false).await?.as_deref(),
        Some(original.as_ref())
    );
    assert_eq!(
        tx.get(&metadata_key, false).await?.as_deref(),
        Some(original_metadata.as_ref())
    );
    assert!(tx.get(&staged_key, false).await?.is_none());
    let (begin, end) = subspace.range();
    tx.clear_range(&begin, &end);
    tx.commit().await?;
    Ok(())
}
