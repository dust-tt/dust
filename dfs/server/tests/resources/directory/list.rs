use anyhow::{Context, Result};
use dfs_api::storage::{
    self, fdb,
    resources::{
        directory::{self, DirectoryResource},
        object,
        session::SessionResource,
    },
};
use dfs_protocol::{
    ObjectId, ObjectRef,
    rpc::{Attr, EntryPage, ObjectKind},
};
use foundationdb::Transaction;
use futures::future::try_join_all;

use super::{attach, clear_tenant, create_child, create_tenant_root, fetch_directory};
use crate::object::{allow, deny};

fn names(page: &EntryPage) -> Vec<&str> {
    page.entries
        .iter()
        .map(|entry| entry.name.as_str())
        .collect()
}

fn attr<'a>(page: &'a EntryPage, name: &str) -> Result<&'a Attr> {
    page.entries
        .iter()
        .find(|entry| entry.name == name)
        .and_then(|entry| entry.object.as_ref())
        .context("missing listed entry")
}

async fn list(
    tx: &Transaction,
    session: &SessionResource,
    directory_ref: impl Into<ObjectRef>,
    after: Option<&str>,
    limit: u32,
) -> Result<EntryPage, storage::Error<directory::Error>> {
    DirectoryResource::list_for_session(tx, session, directory_ref.into(), after, limit).await
}

pub(crate) async fn list_for_session_returns_readable_children_only() -> Result<()> {
    let tenant = create_tenant_root().await?;
    let tx = fdb::database()?.create_trx()?;
    let mut root = fetch_directory(&tx, &tenant, &tenant.root_id).await?;
    let notes = create_child(&tx, &mut root, "a.txt", ObjectKind::File).await?;
    let docs = create_child(&tx, &mut root, "docs", ObjectKind::Directory).await?;
    let hidden = create_child(&tx, &mut root, "hidden", ObjectKind::Directory).await?;
    let secret = create_child(&tx, &mut root, "secret.txt", ObjectKind::File).await?;
    create_child(&tx, &mut root, "zeta", ObjectKind::File).await?;
    let mut docs_directory = fetch_directory(&tx, &tenant, &docs.object_id).await?;
    create_child(&tx, &mut docs_directory, "notes.txt", ObjectKind::File).await?;
    let private = create_child(&tx, &mut docs_directory, "private.txt", ObjectKind::File).await?;
    let mut hidden_directory = fetch_directory(&tx, &tenant, &hidden.object_id).await?;
    let reopened = create_child(&tx, &mut hidden_directory, "reopened", ObjectKind::File).await?;
    tx.commit().await?;

    let tx = fdb::database()?.create_trx()?;
    try_join_all(
        [
            (tenant.root_id, allow("reader", 4)),
            (docs.object_id, allow("guest", 4)),
            (hidden.object_id, deny(4)),
            (secret.object_id, deny(4)),
            (private.object_id, deny(4)),
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
    let root_page = list(&tx, &reader, ObjectRef::Root, None, 4_096).await?;
    assert_eq!(names(&root_page), ["a.txt", "docs", "shared", "zeta"]);
    assert_eq!(root_page.next_after, None);
    assert!(root_page.entries.iter().all(|entry| {
        entry
            .object
            .as_ref()
            .is_some_and(|attr| attr.store_version == version)
    }));
    assert_eq!(attr(&root_page, "docs")?.id, docs.object_id.into());
    assert_eq!(attr(&root_page, "shared")?.id, ObjectRef::Shared);
    assert_eq!(attr(&root_page, "a.txt")?.metadata, None);
    let by_id = list(&tx, &reader, tenant.root_id, None, 4_096).await?;
    assert_eq!(names(&by_id), ["a.txt", "docs", "zeta"]);
    let docs_page = list(&tx, &reader, docs.object_id, None, 4_096).await?;
    assert_eq!(names(&docs_page), ["notes.txt"]);

    assert!(matches!(
        list(&tx, &reader, ObjectId::new_v7(), None, 1).await,
        Err(storage::Error::Resource(directory::Error::Object(
            object::Error::NotFound
        )))
    ));
    for object_id in [hidden.object_id, secret.object_id] {
        assert!(matches!(
            list(&tx, &reader, object_id, None, 1).await,
            Err(storage::Error::Resource(directory::Error::Object(
                object::Error::NotAuthorized
            )))
        ));
    }
    assert!(matches!(
        list(&tx, &reader, notes.object_id, None, 1).await,
        Err(storage::Error::Resource(directory::Error::NotDirectory))
    ));

    let (guest, _) = SessionResource::new(&tenant, vec!["guest".to_owned()])?;
    let guest_root = list(&tx, &guest, ObjectRef::Root, None, 4_096).await?;
    assert_eq!(names(&guest_root), ["docs", "shared"]);
    assert!(matches!(
        list(&tx, &guest, tenant.root_id, None, 1).await,
        Err(storage::Error::Resource(directory::Error::Object(
            object::Error::NotAuthorized
        )))
    ));

    let mut pages = Vec::new();
    let mut after = None;
    loop {
        let page = list(&tx, &reader, ObjectRef::Root, after.as_deref(), 1).await?;
        assert!(page.entries.len() <= 1);
        pages.push(names(&page).join(","));
        let Some(next_after) = page.next_after else {
            break;
        };
        after = Some(next_after);
    }
    assert_eq!(pages, ["a.txt", "docs", "", "", "shared", "zeta"]);
    clear_tenant(&tenant).await
}

pub(crate) async fn virtual_root_pages_keep_shared_within_the_limit() -> Result<()> {
    let tenant = create_tenant_root().await?;
    let tx = fdb::database()?.create_trx()?;
    let mut root = fetch_directory(&tx, &tenant, &tenant.root_id).await?;
    for name in ["a", "z"] {
        create_child(&tx, &mut root, name, ObjectKind::File).await?;
    }
    attach(&tx, &tenant, tenant.root_id, allow("reader", 4)).await?;
    tx.commit().await?;

    let (reader, _) = SessionResource::new(&tenant, vec!["reader".to_owned()])?;
    let tx = fdb::database()?.create_trx()?;
    let first = list(&tx, &reader, ObjectRef::Root, None, 2).await?;
    assert_eq!(names(&first), ["a", "shared"]);
    let after = first.next_after.context("missing cursor after shared")?;
    let second = list(&tx, &reader, ObjectRef::Root, Some(&after), 2).await?;
    assert_eq!(names(&second), ["z"]);
    assert_eq!(second.next_after, None);

    let complete = list(&tx, &reader, ObjectRef::Root, None, 3).await?;
    assert_eq!(names(&complete), ["a", "shared", "z"]);
    assert_eq!(complete.next_after, None);
    for cursor in ["not base64!", "AAAA"] {
        assert!(matches!(
            list(&tx, &reader, ObjectRef::Root, Some(cursor), 1).await,
            Err(storage::Error::Resource(directory::Error::InvalidCursor))
        ));
    }
    clear_tenant(&tenant).await
}

pub(crate) async fn list_rejects_invalid_references_before_reading() -> Result<()> {
    let tenant = create_tenant_root().await?;
    let (session, _) = SessionResource::new(&tenant, vec![])?;
    let tx = fdb::database()?.create_trx()?;
    tx.set_read_version(1);
    for reference in [ObjectRef::Invalid, ObjectRef::Object(ObjectId::default())] {
        assert!(matches!(
            list(&tx, &session, reference, None, 1).await,
            Err(storage::Error::Resource(directory::Error::Object(
                object::Error::InvalidId
            )))
        ));
    }
    clear_tenant(&tenant).await
}
