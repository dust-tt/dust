use anyhow::{Context, Result};
use dfs_api::storage::{
    self, fdb,
    resources::{
        keys::tenant_subspace,
        object::{self, ObjectResource},
        session::SessionResource,
        tenant::TenantResource,
    },
};
use dfs_protocol::{
    ObjectId, ObjectRef,
    rpc::{GrantUpdate, ObjectKind},
};
use foundationdb::tuple::{pack, unpack};

use super::{
    StoredObject,
    grants::{allow, deny},
};

pub(crate) async fn stat_distinguishes_object_errors_and_preserves_transaction_failures()
-> Result<()> {
    let (tenant, _) = TenantResource::new(ObjectId::new_v7().to_string())?;
    let (session, _) = SessionResource::new(&tenant, vec!["reader".to_owned()])?;
    let root = ObjectResource::new_root(&tenant)?;
    let mut hidden = ObjectResource::new_root(&tenant)?;
    hidden.object_id = ObjectId::new_v7();
    hidden.parent_id = Some(root.object_id);
    hidden.name = "hidden".to_owned();
    let mut symlink = ObjectResource::new_root(&tenant)?;
    symlink.object_id = ObjectId::new_v7();
    symlink.parent_id = Some(root.object_id);
    symlink.name = "symlink".to_owned();
    symlink.kind = ObjectKind::Symlink;

    let tx = fdb::database()?.create_trx()?;
    root.create(&tx, &[allow("reader", 4)]).await?;
    hidden.create(&tx, &[deny(4)]).await?;
    symlink.create(&tx, &[]).await?;
    let version = tx.get_read_version().await?;
    let missing = ObjectId::new_v7();
    let results = ObjectResource::stat(
        &tx,
        &session,
        &[
            root.object_id.into(),
            ObjectRef::Root,
            missing.into(),
            hidden.object_id.into(),
            ObjectRef::Shared,
            symlink.object_id.into(),
            root.object_id.into(),
        ],
        false,
    )
    .await?;
    assert_eq!(results.len(), 7);
    assert_eq!(
        results[1]
            .as_ref()
            .ok()
            .context("expected successful Stat")?
            .id,
        root.object_id.into()
    );
    assert!(matches!(results[2], Err(object::Error::NotFound)));
    assert!(matches!(results[3], Err(object::Error::NotAuthorized)));
    assert_eq!(
        results[4]
            .as_ref()
            .ok()
            .context("expected successful Stat")?
            .id,
        ObjectRef::Shared
    );
    assert!(matches!(results[5], Err(object::Error::UnsupportedKind)));
    for index in [0, 6] {
        let Ok(attributes) = &results[index] else {
            anyhow::bail!("readable root must retain its successful result");
        };
        assert_eq!(attributes.id, root.object_id.into());
        assert_eq!(attributes.mode, 0o500);
        assert_eq!(attributes.store_version, version);
    }

    assert!(matches!(
        ObjectResource::stat(&tx, &session, &[ObjectRef::Invalid], false).await,
        Err(storage::Error::Resource(object::Error::InvalidId))
    ));

    // An expired read version must fail outside the per-object results.
    let stale_tx = fdb::database()?.create_trx()?;
    stale_tx.set_read_version(1);
    let result = ObjectResource::stat(&stale_tx, &session, &[root.object_id.into()], false).await;
    let Err(storage::Error::Transaction(error)) = result else {
        anyhow::bail!("FDB failures must escape the batch unchanged");
    };
    assert_eq!(error.get_fdb_error().map(|error| error.code()), Some(1007));
    Ok(())
}

pub(crate) async fn virtual_stat_projects_root_and_keeps_shared_versions_fixed() -> Result<()> {
    for (grant_mode, root_mode) in [(0, 0o500), (2, 0o700), (4, 0o500), (6, 0o700)] {
        let (tenant, _) = TenantResource::new(ObjectId::new_v7().to_string())?;
        let (session, _) = SessionResource::new(&tenant, vec!["reader".to_owned()])?;
        let mut root = ObjectResource::new_root(&tenant)?;
        root.attr_version = 7;
        root.content_version = 9;
        let grant = allow("reader", grant_mode);
        let tx = fdb::database()?.create_trx()?;
        root.create(&tx, std::slice::from_ref(&grant)).await?;
        let refs = [
            ObjectRef::Shared,
            ObjectRef::Root,
            root.object_id.into(),
            ObjectRef::Root,
        ];
        let results = ObjectResource::stat(&tx, &session, &refs, false).await?;
        assert_eq!(results.len(), refs.len());
        let shared = results[0]
            .as_ref()
            .ok()
            .context("expected successful Stat")?;
        assert_eq!(shared.id, ObjectRef::Shared);
        assert_eq!(shared.name, "shared");
        assert_eq!(shared.kind(), ObjectKind::Directory);
        assert_eq!(shared.mode, 0o500);
        assert_eq!(shared.size, 0);
        assert_eq!(
            (shared.atime, shared.mtime, shared.ctime),
            (None, None, None)
        );
        assert_eq!((shared.attr_version, shared.content_version), (1, 1));
        assert!(shared.metadata.is_none());

        let projected = results[1]
            .as_ref()
            .ok()
            .context("expected successful Stat")?;
        assert_eq!(projected.id, root.object_id.into());
        assert_eq!(projected.name, "");
        assert_eq!(projected.kind(), ObjectKind::Directory);
        assert_eq!(projected.size, 0);
        assert_eq!(projected.mode, root_mode);
        assert_eq!((projected.attr_version, projected.content_version), (7, 9));
        assert_eq!(
            (projected.atime, projected.mtime, projected.ctime),
            (root.atime_ms, root.mtime_ms, root.ctime_ms)
        );
        assert!(projected.metadata.is_none());
        assert_eq!(projected.store_version, shared.store_version);
        assert_eq!(
            results[3]
                .as_ref()
                .ok()
                .context("expected successful Stat")?,
            projected
        );
        if grant_mode & 4 == 0 {
            assert!(matches!(results[2], Err(object::Error::NotAuthorized)));
        } else {
            assert_eq!(
                results[2]
                    .as_ref()
                    .ok()
                    .context("expected successful Stat")?
                    .id,
                root.object_id.into()
            );
        }

        root.update_grants(
            &tx,
            &[GrantUpdate {
                grant,
                remove: true,
            }],
        )?;
        // Directory mutations are not implemented yet; simulate their stored version increments.
        let key = tenant_subspace(&tenant.tenant_id)
            .pack(&("object", root.object_id.as_bytes().as_slice()));
        let value = tx.get(&key, false).await?.context("missing root")?;
        let mut attributes: StoredObject = unpack(&value)?;
        attributes.7 += 1;
        attributes.8 += 1;
        tx.set(&key, &pack(&attributes));
        let updated = ObjectResource::stat(&tx, &session, &refs, false).await?;
        let updated_root = updated[1]
            .as_ref()
            .ok()
            .context("expected successful Stat")?;
        assert_eq!(updated_root.mode, 0o500);
        assert_eq!(
            (updated_root.attr_version, updated_root.content_version),
            (8, 10)
        );
        assert_eq!(
            updated[0]
                .as_ref()
                .ok()
                .context("expected successful Stat")?,
            shared
        );
        assert!(matches!(updated[2], Err(object::Error::NotAuthorized)));
    }
    Ok(())
}

pub(crate) async fn metadata_reads_preserve_snapshot_and_tenant_scope() -> Result<()> {
    let (tenant, _) = TenantResource::new(ObjectId::new_v7().to_string())?;
    let (session, _) = SessionResource::new(&tenant, vec!["reader".to_owned()])?;
    let mut root = ObjectResource::new_root(&tenant)?;
    let metadata = root.metadata.as_mut().context("missing metadata")?;
    metadata.created_at_ms = 42;
    metadata.mime_type = Some("text/plain".to_owned());
    metadata.xattrs = std::collections::HashMap::from([
        ("user/é".to_owned(), vec![0, 0xff, 1]),
        ("empty".to_owned(), vec![]),
    ]);
    // Enough small entries to exercise range pagination while staying below the xattr byte limit.
    for index in 0..1_000 {
        metadata
            .xattrs
            .insert(format!("user/{index:04}"), vec![0xff; 8]);
    }
    let expected_xattrs: std::collections::BTreeMap<_, _> =
        metadata.xattrs.clone().into_iter().collect();
    let (mut other, _) = TenantResource::new(ObjectId::new_v7().to_string())?;
    other.root_id = root.object_id;
    let other_root = ObjectResource::new_root(&other)?;
    let (other_session, _) = SessionResource::new(&other, vec!["reader".to_owned()])?;
    let tx = fdb::database()?.create_trx()?;
    root.create(&tx, &[allow("reader", 4)]).await?;
    other_root.create(&tx, &[allow("reader", 4)]).await?;
    tx.commit().await?;

    let tx = fdb::database()?.create_trx()?;
    let version = tx.get_read_version().await?;
    let prefix = tenant_subspace(&tenant.tenant_id);
    let metadata_key = prefix.pack(&("metadata", root.object_id.as_bytes().as_slice()));
    let xattrs = prefix.subspace(&("metadata", root.object_id.as_bytes().as_slice(), "xattr"));
    let update = fdb::database()?.create_trx()?;
    update.set(&metadata_key, &pack(&(43_u64, None::<String>)));
    update.set(&xattrs.pack(&"user/é"), b"new value");
    update.set(&xattrs.pack(&"new"), b"new xattr");
    update.commit().await?;

    let refs = [root.object_id.into()];
    let result = ObjectResource::stat(&tx, &session, &refs, true).await?;
    let attr = result[0].as_ref().ok().context("missing attributes")?;
    assert_eq!(attr.store_version, version);
    let metadata = attr.metadata.as_ref().context("missing metadata")?;
    assert_eq!(metadata.created, 42);
    assert_eq!(metadata.mime_type.as_deref(), Some("text/plain"));
    assert_eq!(metadata.xattrs, expected_xattrs);
    let other_result = ObjectResource::stat(&tx, &other_session, &refs, true).await?;
    let other_attr = other_result[0]
        .as_ref()
        .ok()
        .context("missing other root")?;
    let other_metadata = other_attr.metadata.as_ref().context("missing metadata")?;
    assert_eq!(
        other_metadata.created,
        other_root
            .metadata
            .as_ref()
            .context("missing metadata")?
            .created_at_ms
    );
    assert_eq!(other_metadata.mime_type, None);
    assert!(other_metadata.xattrs.is_empty());

    let fresh = fdb::database()?.create_trx()?;
    let result = ObjectResource::stat(&fresh, &session, &refs, true).await?;
    let metadata = result[0]
        .as_ref()
        .ok()
        .context("missing updated attributes")?
        .metadata
        .as_ref()
        .context("missing updated metadata")?;
    assert_eq!(metadata.created, 43);
    assert_eq!(metadata.mime_type, None);
    assert_eq!(metadata.xattrs["user/é"], b"new value");
    assert_eq!(metadata.xattrs["new"], b"new xattr");
    assert!(metadata.xattrs["empty"].is_empty());

    // Corrupt metadata cannot affect unrequested reads or reveal an unreadable object.
    fresh.set(&metadata_key, &[0xff]);
    let result = ObjectResource::stat(&fresh, &session, &refs, false).await?;
    assert!(
        result[0]
            .as_ref()
            .ok()
            .context("missing attributes")?
            .metadata
            .is_none()
    );
    assert!(matches!(
        ObjectResource::stat(&fresh, &session, &refs, true).await,
        Err(storage::Error::Transaction(
            foundationdb::FdbBindingError::PackError(_)
        ))
    ));
    fresh.clear(&metadata_key);
    assert!(matches!(
        ObjectResource::stat(&fresh, &session, &refs, true).await,
        Err(storage::Error::Resource(object::Error::MissingMetadata))
    ));
    fresh.set(&metadata_key, &[0xff]);
    root.update_grants(
        &fresh,
        &[GrantUpdate {
            grant: allow("reader", 4),
            remove: true,
        }],
    )?;
    let result = ObjectResource::stat(&fresh, &session, &refs, true).await?;
    assert!(matches!(result[0], Err(object::Error::NotAuthorized)));
    let projected = ObjectResource::stat(
        &fresh,
        &session,
        &[ObjectRef::Root, ObjectRef::Shared],
        true,
    )
    .await?;
    for result in projected {
        let attr = result?;
        let metadata = attr.metadata.context("missing virtual metadata")?;
        assert_eq!(metadata.created, 0);
        assert_eq!(metadata.mime_type.as_deref(), Some("inode/directory"));
        assert!(metadata.xattrs.is_empty());
    }

    for tenant in [&tenant, &other] {
        let (begin, end) = tenant_subspace(&tenant.tenant_id).range();
        fresh.clear_range(&begin, &end);
    }
    fresh.commit().await?;
    Ok(())
}
