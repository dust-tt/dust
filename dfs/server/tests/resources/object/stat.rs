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
    )
    .await?;
    assert_eq!(results.len(), 7);
    assert_eq!(
        results[1]
            .as_ref()
            .ok()
            .context("expected successful Stat")?
            .id,
        ObjectRef::Root
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
        assert_eq!(attributes.view.store_version, version);
        assert_eq!(attributes.view.auth_version, version);
    }

    assert!(matches!(
        ObjectResource::stat(&tx, &session, &[ObjectRef::Invalid]).await,
        Err(storage::Error::Resource(object::Error::InvalidId))
    ));

    // An expired read version must fail outside the per-object results.
    let stale_tx = fdb::database()?.create_trx()?;
    stale_tx.set_read_version(1);
    let result = ObjectResource::stat(&stale_tx, &session, &[root.object_id.into()]).await;
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
        let results = ObjectResource::stat(&tx, &session, &refs).await?;
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
        assert_eq!(projected.id, ObjectRef::Root);
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
        assert_eq!(projected.view, shared.view);
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
        let updated = ObjectResource::stat(&tx, &session, &refs).await?;
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
