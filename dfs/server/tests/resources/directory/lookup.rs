use anyhow::{Context, Result};
use dfs_api::storage::{
    self, fdb,
    resources::{
        directory::{self, DirectoryResource},
        object::{self, ObjectResource},
        session::SessionResource,
        tenant::TenantResource,
    },
};
use dfs_protocol::{
    ObjectId, ObjectRef,
    rpc::{Attr, Grant, GrantUpdate, LookupTarget, ObjectKind},
};
use foundationdb::Transaction;
use futures::future::try_join_all;

use super::{clear_tenant, create_child, create_tenant_root, fetch_directory};
use crate::object::{allow, deny};

fn target(parent_id: impl Into<ObjectRef>, name: &str) -> LookupTarget {
    LookupTarget {
        parent_id: parent_id.into(),
        name: name.to_owned(),
    }
}

async fn attach(
    tx: &Transaction,
    tenant: &TenantResource,
    object_id: ObjectId,
    grant: Grant,
) -> Result<()> {
    let mut object = ObjectResource::fetch(tx, tenant, &object_id)
        .await?
        .context("missing object")?;
    object.update_grants(
        tx,
        &[GrantUpdate {
            grant,
            remove: false,
        }],
    )?;
    Ok(())
}

fn found(result: &Result<Attr, directory::Error>) -> Result<&Attr> {
    result.as_ref().ok().context("expected a found child")
}

pub(crate) async fn lookup_attrs_require_readable_parents_and_children() -> Result<()> {
    let tenant = create_tenant_root().await?;
    let tx = fdb::database()?.create_trx()?;
    let mut root = fetch_directory(&tx, &tenant, &tenant.root_id).await?;
    let docs = create_child(&tx, &mut root, "docs", ObjectKind::Directory).await?;
    let secret = create_child(&tx, &mut root, "secret.txt", ObjectKind::File).await?;
    let hidden = create_child(&tx, &mut root, "hidden", ObjectKind::Directory).await?;
    let mut docs_directory = fetch_directory(&tx, &tenant, &docs.object_id).await?;
    let notes = create_child(&tx, &mut docs_directory, "notes.txt", ObjectKind::File).await?;
    let private = create_child(&tx, &mut docs_directory, "private.txt", ObjectKind::File).await?;
    let mut hidden_directory = fetch_directory(&tx, &tenant, &hidden.object_id).await?;
    let reopened = create_child(
        &tx,
        &mut hidden_directory,
        "reopened",
        ObjectKind::Directory,
    )
    .await?;
    tx.commit().await?;

    let tx = fdb::database()?.create_trx()?;
    try_join_all(
        [
            (tenant.root_id, allow("reader", 4)),
            (docs.object_id, allow("guest", 4)),
            (secret.object_id, deny(4)),
            (private.object_id, deny(4)),
            (hidden.object_id, deny(4)),
            (reopened.object_id, allow("reader", 4)),
        ]
        .into_iter()
        .map(|(object_id, grant)| attach(&tx, &tenant, object_id, grant)),
    )
    .await?;
    tx.commit().await?;

    let (reader, _) = SessionResource::new(&tenant, vec!["reader".to_owned()])?;
    let tx = fdb::database()?.create_trx()?;
    let version = tx.get_read_version().await?;
    let missing = ObjectId::new_v7();
    let results = DirectoryResource::lookup_attrs(
        &tx,
        &reader,
        &[
            target(docs.object_id, "notes.txt"),
            target(ObjectRef::Root, "docs"),
            target(ObjectRef::Root, "shared"),
            target(ObjectRef::Shared, "docs"),
            target(docs.object_id, "missing"),
            target(docs.object_id, "private.txt"),
            target(hidden.object_id, "reopened"),
            target(notes.object_id, "child"),
            target(secret.object_id, "child"),
            target(missing, "child"),
            target(docs.object_id, "a/b"),
            target(docs.object_id, "notes.txt"),
        ],
        true,
    )
    .await?;
    assert_eq!(results.len(), 12);
    for index in [0, 11] {
        let notes_attr = found(&results[index])?;
        assert_eq!(notes_attr.id, notes.object_id.into());
        assert_eq!(notes_attr.name, "notes.txt");
        assert_eq!(notes_attr.mode, 0o400);
        assert_eq!(notes_attr.store_version, version);
        assert!(notes_attr.metadata.is_some());
    }
    assert_eq!(found(&results[1])?.id, docs.object_id.into());
    assert_eq!(found(&results[2])?.id, ObjectRef::Shared);
    assert!(matches!(
        results[3],
        Err(directory::Error::SharedUnsupported)
    ));
    assert!(matches!(
        results[4],
        Err(directory::Error::Object(object::Error::NotFound))
    ));
    assert!(matches!(
        results[5],
        Err(directory::Error::Object(object::Error::NotAuthorized))
    ));
    assert!(matches!(
        results[6],
        Err(directory::Error::Object(object::Error::NotFound))
    ));
    assert!(matches!(results[7], Err(directory::Error::NotDirectory)));
    for index in [8, 9] {
        assert!(matches!(
            results[index],
            Err(directory::Error::Object(object::Error::NotFound))
        ));
    }
    assert!(matches!(results[10], Err(directory::Error::InvalidName)));

    let (guest, _) = SessionResource::new(&tenant, vec!["guest".to_owned()])?;
    let results = DirectoryResource::lookup_attrs(
        &tx,
        &guest,
        &[
            target(ObjectRef::Root, "docs"),
            target(tenant.root_id, "docs"),
            target(ObjectRef::Root, "secret.txt"),
        ],
        false,
    )
    .await?;
    let docs_attr = found(&results[0])?;
    assert_eq!(docs_attr.id, docs.object_id.into());
    assert_eq!(docs_attr.metadata, None);
    assert!(matches!(
        results[1],
        Err(directory::Error::Object(object::Error::NotFound))
    ));
    assert!(matches!(
        results[2],
        Err(directory::Error::Object(object::Error::NotAuthorized))
    ));

    assert!(matches!(
        DirectoryResource::lookup_attrs(
            &tx,
            &reader,
            &[
                target(docs.object_id, "notes.txt"),
                target(ObjectRef::Invalid, "x")
            ],
            false,
        )
        .await,
        Err(storage::Error::Resource(directory::Error::Object(
            object::Error::InvalidId
        )))
    ));
    clear_tenant(&tenant).await
}
