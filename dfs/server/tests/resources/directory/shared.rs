use anyhow::{Context, Result};
use dfs_api::storage::{
    self, fdb,
    resources::{
        directory::{self, DirectoryResource},
        object::{self, ObjectResource},
        session::SessionResource,
    },
};
use dfs_protocol::{
    NAME_MAX_BYTES, ObjectId, ObjectRef,
    rpc::{EntryPage, GrantUpdate, LookupTarget, MoveOperation, ObjectKind},
};
use foundationdb::Transaction;

use super::{attach, clear_tenant, create_child, create_tenant_root, fetch_directory};
use crate::object::{allow, deny};

async fn list(
    tx: &Transaction,
    session: &SessionResource,
    after: Option<&str>,
    limit: u32,
) -> Result<EntryPage, storage::Error<directory::Error>> {
    DirectoryResource::list_for_session(tx, session, ObjectRef::Shared, after, limit).await
}

fn target(name: impl Into<String>) -> LookupTarget {
    LookupTarget {
        parent_id: ObjectRef::Shared,
        name: name.into(),
    }
}

fn ids(page: &EntryPage) -> Result<Vec<ObjectId>> {
    page.entries
        .iter()
        .map(|entry| {
            let attr = entry.object.as_ref().context("missing shared attributes")?;
            let ObjectRef::Object(id) = attr.id else {
                anyhow::bail!("expected a real object ID");
            };
            Ok(id)
        })
        .collect()
}

pub(crate) async fn shared_lists_explicit_readable_entries_and_resolves_duplicate_names()
-> Result<()> {
    let tenant = create_tenant_root().await?;
    let tx = fdb::database()?.create_trx()?;
    let mut root = fetch_directory(&tx, &tenant, &tenant.root_id).await?;
    let hidden = create_child(&tx, &mut root, "hidden", ObjectKind::Directory).await?;
    let first = create_child(&tx, &mut root, "report--final.txt", ObjectKind::File).await?;
    let write = create_child(&tx, &mut root, "write", ObjectKind::File).await?;
    let zero = create_child(&tx, &mut root, "zero", ObjectKind::File).await?;
    create_child(&tx, &mut root, "inherited-only", ObjectKind::File).await?;
    let other = create_child(&tx, &mut root, "other-subject", ObjectKind::File).await?;
    let mut hidden = DirectoryResource::try_from(hidden)?;
    let second = create_child(&tx, &mut hidden, "report--final.txt", ObjectKind::File).await?;
    let long = create_child(
        &tx,
        &mut hidden,
        &"x".repeat(NAME_MAX_BYTES),
        ObjectKind::File,
    )
    .await?;
    let denied = create_child(&tx, &mut hidden, "write-without-read", ObjectKind::File).await?;
    for (id, grant) in [
        (tenant.root_id, allow("reader", 4)),
        (hidden.object().object_id, deny(6)),
        (first.object_id, allow("reader", 4)),
        (first.object_id, allow("group", 2)),
        (second.object_id, allow("reader", 4)),
        (second.object_id, deny(6)),
        (long.object_id, allow("group", 4)),
        (write.object_id, allow("reader", 2)),
        (zero.object_id, allow("reader", 0)),
        (other.object_id, allow("Reader", 4)),
        (denied.object_id, allow("reader", 2)),
    ] {
        attach(&tx, &tenant, id, grant).await?;
    }
    tx.commit().await?;

    let (session, _) = SessionResource::new(&tenant, vec!["reader".into(), "group".into()])?;
    let tx = fdb::database()?.create_trx()?;
    let page = list(&tx, &session, None, 4096).await?;
    let mut expected = vec![
        tenant.root_id,
        first.object_id,
        second.object_id,
        long.object_id,
        write.object_id,
        zero.object_id,
    ];
    expected.sort();
    assert_eq!(ids(&page)?, expected);
    assert!(page.next_after.is_none());
    let version = tx.get_read_version().await?;
    for entry in &page.entries {
        let attr = entry.object.as_ref().context("missing attributes")?;
        let ObjectRef::Object(id) = attr.id else {
            anyhow::bail!("expected a real ID");
        };
        assert_eq!(entry.name, format!("{}--{id}", attr.name));
        assert_eq!(attr.store_version, version);
        assert!(attr.metadata.is_none());
        if id == first.object_id || id == write.object_id {
            assert_eq!(attr.mode, 0o600);
        } else if id != tenant.root_id {
            assert_eq!(attr.mode, 0o400);
        }
    }
    let aliases: Vec<_> = page
        .entries
        .iter()
        .map(|entry| target(&entry.name))
        .collect();
    let results = DirectoryResource::lookup_for_session(&tx, &session, &aliases, true).await?;
    for (result, entry) in results.into_iter().zip(&page.entries) {
        let attr = result?;
        let listed = entry.object.as_ref().context("missing listed attributes")?;
        assert_eq!(attr.id, listed.id);
        assert_eq!(attr.name, listed.name);
        assert_eq!(attr.mode, listed.mode);
        assert_eq!(attr.store_version, version);
        assert!(attr.metadata.is_some());
    }
    let unreadable = DirectoryResource::lookup_for_session(
        &tx,
        &session,
        &[target(format!("{}--{}", denied.name, denied.object_id))],
        false,
    )
    .await?;
    assert!(matches!(
        unreadable[0],
        Err(directory::Error::Object(object::Error::NotAuthorized))
    ));
    let (empty, _) = SessionResource::new(&tenant, vec![])?;
    let page = list(&tx, &empty, None, 1).await?;
    assert!(page.entries.is_empty());
    assert!(page.next_after.is_none());
    clear_tenant(&tenant).await
}

pub(crate) async fn shared_pages_merge_subjects_without_duplicates_or_skipped_entries() -> Result<()>
{
    let tenant = create_tenant_root().await?;
    let tx = fdb::database()?.create_trx()?;
    let mut root = fetch_directory(&tx, &tenant, &tenant.root_id).await?;
    let mut objects = Vec::new();
    for index in 0..12 {
        objects
            .push(create_child(&tx, &mut root, &format!("file-{index}"), ObjectKind::File).await?);
    }
    objects.sort_by_key(|object| object.object_id);
    let mut expected = Vec::new();
    for (index, object) in objects.iter().enumerate() {
        if index % 3 == 1 {
            attach(&tx, &tenant, object.object_id, allow("a", 2)).await?;
        } else {
            expected.push(object.object_id);
            let subject = if index % 3 == 0 { "a" } else { "b" };
            attach(&tx, &tenant, object.object_id, allow(subject, 4)).await?;
        }
    }
    for mode in [0, 2, 6] {
        attach(&tx, &tenant, objects[0].object_id, allow("a", mode)).await?;
    }
    attach(&tx, &tenant, objects[0].object_id, allow("b", 4)).await?;
    tx.commit().await?;

    let (session, _) =
        SessionResource::new(&tenant, vec!["a".into(), "b".into(), "unused".into()])?;
    let tx = fdb::database()?.create_trx()?;
    let mut first_cursor = None;
    for limit in [1, 2, 5, 4096] {
        let mut after = None;
        let mut found = Vec::new();
        let mut empty_pages = 0;
        let mut finished = false;
        for _ in 0..30 {
            let page = list(&tx, &session, after.as_deref(), limit).await?;
            assert!(page.entries.len() <= limit as usize);
            if page.entries.is_empty() {
                empty_pages += 1;
            }
            found.extend(ids(&page)?);
            let Some(next) = page.next_after else {
                finished = true;
                break;
            };
            assert_ne!(after.as_ref(), Some(&next));
            first_cursor.get_or_insert_with(|| next.clone());
            after = Some(next);
        }
        assert!(finished, "pagination must terminate");
        assert_eq!(found, expected, "limit {limit}");
        if limit == 1 {
            assert!(empty_pages > 0);
        }
    }
    let cursor = first_cursor.context("missing shared cursor")?;
    let (other_session, _) = SessionResource::new(&tenant, vec!["a".into(), "b".into()])?;
    assert!(matches!(
        list(&tx, &other_session, Some(&cursor), 1).await,
        Err(storage::Error::Resource(directory::Error::InvalidCursor))
    ));
    let other = create_tenant_root().await?;
    let (mut other_session, _) = SessionResource::new(&other, vec!["a".into()])?;
    other_session.session_id = session.session_id.clone();
    assert!(matches!(
        list(&tx, &other_session, Some(&cursor), 1).await,
        Err(storage::Error::Resource(directory::Error::InvalidCursor))
    ));
    assert!(list(&tx, &other_session, None, 1).await?.entries.is_empty());
    assert!(matches!(
        DirectoryResource::list_for_session(&tx, &session, ObjectRef::Root, Some(&cursor), 1).await,
        Err(storage::Error::Resource(directory::Error::InvalidCursor))
    ));
    let tx = fdb::database()?.create_trx()?;
    tx.set_read_version(1);
    for limit in [0, 4097] {
        assert!(matches!(
            list(&tx, &session, None, limit).await,
            Err(storage::Error::Resource(directory::Error::InvalidPageLimit))
        ));
    }
    for cursor in ["not base64!", "AAAA"] {
        assert!(matches!(
            list(&tx, &session, Some(cursor), 1).await,
            Err(storage::Error::Resource(directory::Error::InvalidCursor))
        ));
    }
    clear_tenant(&other).await?;
    clear_tenant(&tenant).await
}

pub(crate) async fn shared_lookup_rechecks_membership_and_accepts_stale_names() -> Result<()> {
    let tenant = create_tenant_root().await?;
    let tx = fdb::database()?.create_trx()?;
    let mut root = fetch_directory(&tx, &tenant, &tenant.root_id).await?;
    let file = create_child(&tx, &mut root, "old--name", ObjectKind::File).await?;
    let inherited = create_child(&tx, &mut root, "inherited", ObjectKind::File).await?;
    attach(&tx, &tenant, tenant.root_id, allow("reader", 4)).await?;
    attach(&tx, &tenant, tenant.root_id, allow("owner", 6)).await?;
    attach(&tx, &tenant, file.object_id, allow("reader", 4)).await?;
    tx.commit().await?;
    let (reader, _) = SessionResource::new(&tenant, vec!["reader".into()])?;
    let (owner, _) = SessionResource::new(&tenant, vec!["owner".into()])?;
    let alias = format!("{}--{}", file.name, file.object_id);
    let tx = fdb::database()?.create_trx()?;
    let first =
        DirectoryResource::lookup_for_session(&tx, &reader, &[target(&alias)], false).await?;
    assert!(first[0].is_ok());
    let results = DirectoryResource::lookup_for_session(
        &tx,
        &reader,
        &[
            target(format!("inherited--{}", inherited.object_id)),
            target(format!("missing--{}", ObjectId::new_v7())),
            target("plain-name"),
            target(format!("a/b--{}", file.object_id)),
            target(format!(
                "{}--{}",
                "x".repeat(NAME_MAX_BYTES + 1),
                file.object_id
            )),
            target("name--0190C3A0B1C27D4E8F0A1B2C3D4E5F60"),
            target(format!("name--dfs://{}", file.object_id)),
            target(&alias),
            target(&alias),
        ],
        false,
    )
    .await?;
    for result in &results[..2] {
        assert!(matches!(
            result,
            Err(directory::Error::Object(object::Error::NotFound))
        ));
    }
    for index in [2, 3, 5, 6] {
        assert!(matches!(results[index], Err(directory::Error::InvalidName)));
    }
    assert!(matches!(results[4], Err(directory::Error::NameTooLong)));
    assert_eq!(results[7].as_ref().ok(), results[8].as_ref().ok());
    let other = create_tenant_root().await?;
    let (other_session, _) = SessionResource::new(&other, vec!["reader".into()])?;
    let foreign =
        DirectoryResource::lookup_for_session(&tx, &other_session, &[target(&alias)], false)
            .await?;
    assert!(matches!(
        foreign[0],
        Err(directory::Error::Object(object::Error::NotFound))
    ));

    DirectoryResource::apply_move(
        &tx,
        &owner,
        MoveOperation {
            object_id: file.object_id,
            parent_id: tenant.root_id,
            target_id: None,
            name: "renamed".into(),
        },
    )
    .await?;
    tx.commit().await?;
    let tx = fdb::database()?.create_trx()?;
    let renamed = DirectoryResource::lookup_for_session(&tx, &reader, &[target(&alias)], false)
        .await?
        .pop()
        .context("missing result")??;
    assert_eq!(renamed.name, "renamed");
    assert_eq!(renamed.id, file.object_id.into());
    let page = list(&tx, &reader, None, 4096).await?;
    assert!(
        page.entries
            .iter()
            .any(|entry| entry.name == format!("renamed--{}", file.object_id))
    );
    let mut file = ObjectResource::fetch(&tx, &tenant, &file.object_id)
        .await?
        .context("missing file")?;
    file.update_grants(
        &tx,
        &[GrantUpdate {
            grant: allow("reader", 4),
            remove: true,
        }],
    )?;
    tx.commit().await?;

    let tx = fdb::database()?.create_trx()?;
    let revoked =
        DirectoryResource::lookup_for_session(&tx, &reader, &[target(&alias)], false).await?;
    assert!(matches!(
        revoked[0],
        Err(directory::Error::Object(object::Error::NotFound))
    ));
    assert!(!ids(&list(&tx, &reader, None, 4096).await?)?.contains(&file.object_id));
    clear_tenant(&other).await?;
    clear_tenant(&tenant).await
}
