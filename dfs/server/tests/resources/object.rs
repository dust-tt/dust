use std::{
    collections::HashMap,
    time::{SystemTime, UNIX_EPOCH},
};

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
use foundationdb::{RangeOption, tuple::unpack};

mod grants;
mod modes;
mod stat;
pub(crate) use grants::{
    grant_creation_and_update_validation_preserve_state,
    grant_listing_and_updates_preserve_indexes_and_attributes,
    grant_pagination_handles_full_pages_and_object_deletion,
    grant_update_retry_succeeds_without_changes,
};
pub(crate) use modes::{
    permission_reads_conflict_with_changes_and_retry,
    session_modes_evaluate_full_paths_and_all_grants,
    session_modes_isolate_tenants_and_reject_invalid_ancestry,
    tree_hints_follow_moves_and_recheck_grants,
};
pub(crate) use stat::{
    metadata_reads_preserve_snapshot_and_tenant_scope,
    stat_distinguishes_object_errors_and_preserves_transaction_failures,
    virtual_stat_projects_root_and_keeps_shared_versions_fixed,
};

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
        assert!(
            root.metadata
                .as_ref()
                .context("missing metadata")?
                .xattrs
                .is_empty()
        );
        fdb::with_transaction(|tx| {
            let root = &root;
            async move { root.create(&tx, &[]).await }
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
        let (created_at_ms, mime_type): (u64, Option<String>) = unpack(&metadata)?;
        assert_eq!(parent_id, None);
        assert!(name.is_empty());
        assert_eq!(kind, i32::from(ObjectKind::Directory));
        assert_eq!(size, 0);
        assert_eq!((attr_version, content_version), (1, 1));
        assert!((before_ms..=after_ms).contains(&u128::from(created_at_ms)));
        assert_eq!(atime_ms, Some(created_at_ms));
        assert_eq!(mtime_ms, atime_ms);
        assert_eq!(ctime_ms, atime_ms);
        assert_eq!(mime_type, None);
        // Attribute fetches do not need to decode or read the optional metadata.
        tx.set(&metadata_key, &[0xff]);
        let fetched = ObjectResource::fetch(&tx, tenant, &tenant.root_id)
            .await?
            .context("missing fetched root")?;
        assert_eq!(fetched.object_id, root.object_id);
        assert_eq!(fetched.tenant_id, root.tenant_id);
        assert_eq!(fetched.parent_id, None);
        assert_eq!(fetched.kind, ObjectKind::Directory);
        assert_eq!(fetched.attr_version, root.attr_version);
        assert_eq!(fetched.content_version, root.content_version);
        assert_eq!(fetched.atime_ms, root.atime_ms);
        assert!(fetched.metadata.is_none());
        let xattrs =
            subspace.subspace(&("metadata", tenant.root_id.as_bytes().as_slice(), "xattr"));
        assert!(
            tx.get_range(&RangeOption::from(xattrs.range()), 1, false)
                .await?
                .is_empty()
        );
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

pub(crate) async fn object_creation_retry_succeeds_without_changes() -> Result<()> {
    let (tenant, _) = TenantResource::new(ObjectId::new_v7().to_string())?;
    let mut root = ObjectResource::new_root(&tenant)?;
    root.metadata.as_mut().context("missing metadata")?.xattrs =
        HashMap::from([("user/tag".to_owned(), b"value".to_vec())]);
    let root_grants = [grants::allow("u:retry", 0o6)];
    let create = || {
        fdb::with_transaction(|tx| {
            let root = &root;
            let root_grants = &root_grants;
            async move { root.create(&tx, root_grants).await }
        })
    };
    create().await?;
    let tx = fdb::database()?.create_trx()?;
    let committed = grants::records(&tx, &tenant.tenant_id).await?;

    // A retry after an unknown commit result runs `create` again in a new transaction.
    create().await?;

    let tx = fdb::database()?.create_trx()?;
    assert_eq!(grants::records(&tx, &tenant.tenant_id).await?, committed);
    let (begin, end) = tenant_subspace(&tenant.tenant_id).range();
    tx.clear_range(&begin, &end);
    tx.commit().await?;
    Ok(())
}

pub(crate) async fn object_collisions_preserve_records_and_abort_staged_writes() -> Result<()> {
    let (tenant, _) = TenantResource::new(ObjectId::new_v7().to_string())?;
    let mut root = ObjectResource::new_root(&tenant)?;
    let original_xattrs = HashMap::from([
        (format!("{}x", "é".repeat(127)), vec![0, 0xff, 1]),
        ("user/tag".to_owned(), vec![]),
    ]);
    root.metadata.as_mut().context("missing metadata")?.xattrs = original_xattrs.clone();
    fdb::with_transaction(|tx| {
        let root = &root;
        async move { root.create(&tx, &[]).await }
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

    // Another object with the same ID: identical attributes would read as this test's own retry.
    root.ctime_ms = root.ctime_ms.map(|ctime_ms| ctime_ms + 1);
    root.metadata.as_mut().context("missing metadata")?.xattrs =
        HashMap::from([("new".to_owned(), b"must not commit".to_vec())]);
    let result = fdb::with_transaction(|tx| {
        let root = &root;
        let staged_key = &staged_key;
        async move {
            tx.set(staged_key, b"must not commit");
            root.create(&tx, &[]).await
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
    let xattrs = subspace.subspace(&("metadata", tenant.root_id.as_bytes().as_slice(), "xattr"));
    for (name, expected) in original_xattrs {
        assert_eq!(
            tx.get(&xattrs.pack(&name.as_str()), false)
                .await?
                .as_deref(),
            Some(expected.as_slice())
        );
    }
    assert!(tx.get(&xattrs.pack(&"new"), false).await?.is_none());
    let (begin, end) = subspace.range();
    tx.clear_range(&begin, &end);
    tx.commit().await?;
    Ok(())
}

pub(crate) async fn invalid_xattr_names_fail_before_staging_writes() -> Result<()> {
    for name in [String::new(), "user\0tag".to_owned(), "é".repeat(128)] {
        let (tenant, _) = TenantResource::new(ObjectId::new_v7().to_string())?;
        let mut root = ObjectResource::new_root(&tenant)?;
        root.metadata.as_mut().context("missing metadata")?.xattrs =
            HashMap::from([(name, vec![])]);
        let tx = fdb::database()?.create_trx()?;

        assert!(matches!(
            root.create(&tx, &[]).await,
            Err(storage::Error::Resource(object::Error::InvalidXattrName))
        ));
        let range = RangeOption::from(tenant_subspace(&tenant.tenant_id).range());
        assert!(tx.get_range(&range, 1, false).await?.is_empty());
    }
    Ok(())
}

pub(crate) async fn xattr_size_limit_counts_all_names_and_values() -> Result<()> {
    // The second value and both names add three bytes, reaching or exceeding the 32 KiB limit.
    for (value_bytes, accepted) in [(32_765, true), (32_766, false)] {
        let (tenant, _) = TenantResource::new(ObjectId::new_v7().to_string())?;
        let mut root = ObjectResource::new_root(&tenant)?;
        let xattrs = HashMap::from([
            ("a".to_owned(), vec![0xff; value_bytes]),
            ("b".to_owned(), vec![0]),
        ]);
        root.metadata.as_mut().context("missing metadata")?.xattrs = xattrs.clone();
        let tx = fdb::database()?.create_trx()?;
        let result = root.create(&tx, &[]).await;
        let subspace = tenant_subspace(&tenant.tenant_id);

        if accepted {
            result?;
            tx.commit().await?;
            let tx = fdb::database()?.create_trx()?;
            for (name, value) in xattrs {
                let key = subspace.pack(&(
                    "metadata",
                    tenant.root_id.as_bytes().as_slice(),
                    "xattr",
                    name.as_str(),
                ));
                assert_eq!(
                    tx.get(&key, false).await?.as_deref(),
                    Some(value.as_slice())
                );
            }
            let (begin, end) = subspace.range();
            tx.clear_range(&begin, &end);
            tx.commit().await?;
        } else {
            assert!(matches!(
                result,
                Err(storage::Error::Resource(object::Error::XattrsTooLarge))
            ));
            assert!(
                tx.get_range(&RangeOption::from(subspace.range()), 1, false)
                    .await?
                    .is_empty()
            );
        }
    }
    Ok(())
}
