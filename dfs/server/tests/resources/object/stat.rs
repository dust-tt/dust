use anyhow::Result;
use dfs_api::storage::{
    self, fdb,
    resources::{
        object::{self, ObjectResource},
        session::SessionResource,
        tenant::TenantResource,
    },
};
use dfs_protocol::{ObjectId, rpc::ObjectKind};

use super::grants::{allow, deny};

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
            root.object_id,
            missing,
            hidden.object_id,
            symlink.object_id,
            root.object_id,
        ],
    )
    .await?;
    assert_eq!(results.len(), 5);
    assert!(matches!(results[1], Err(object::Error::NotFound)));
    assert!(matches!(results[2], Err(object::Error::NotAuthorized)));
    assert!(matches!(results[3], Err(object::Error::UnsupportedKind)));
    for index in [0, 4] {
        let Ok(attributes) = &results[index] else {
            anyhow::bail!("readable root must retain its successful result");
        };
        assert_eq!(attributes.id, root.object_id.into());
        assert_eq!(attributes.mode, 0o500);
        assert_eq!(attributes.view.store_version, version);
        assert_eq!(attributes.view.auth_version, version);
    }

    // An expired read version must fail outside the per-object results.
    let stale_tx = fdb::database()?.create_trx()?;
    stale_tx.set_read_version(1);
    let result = ObjectResource::stat(&stale_tx, &session, &[root.object_id]).await;
    let Err(storage::Error::Transaction(error)) = result else {
        anyhow::bail!("FDB failures must escape the batch unchanged");
    };
    assert_eq!(error.get_fdb_error().map(|error| error.code()), Some(1007));
    Ok(())
}
