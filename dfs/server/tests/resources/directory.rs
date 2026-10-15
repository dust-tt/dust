use std::collections::HashMap;

use anyhow::{Context, Result};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use dfs_api::storage::{
    self, fdb,
    resources::{
        directory::{self, ChildPage, DirectoryResource},
        keys::tenant_subspace,
        object::{self, ObjectResource},
        tenant::TenantResource,
    },
};
use dfs_protocol::{ObjectId, rpc::ObjectKind};
use foundationdb::{RangeOption, Transaction, options::StreamingMode, tuple::unpack};

mod lookup;
pub(crate) use lookup::lookup_attrs_require_readable_parents_and_children;

async fn create_child(
    tx: &Transaction,
    directory: &mut DirectoryResource,
    name: &str,
    kind: ObjectKind,
) -> Result<ObjectResource> {
    Ok(directory
        .create_child(
            tx,
            ObjectId::new_v7(),
            name.to_owned(),
            kind,
            None,
            HashMap::new(),
        )
        .await?)
}

async fn create_tenant_root() -> Result<TenantResource> {
    let (tenant, _) = TenantResource::new(ObjectId::new_v7().to_string())?;
    let root = ObjectResource::new_root(&tenant)?;
    fdb::with_transaction(|tx| {
        let root = &root;
        async move { root.create(&tx, &[]).await }
    })
    .await?;
    Ok(tenant)
}

async fn fetch_directory(
    tx: &Transaction,
    tenant: &TenantResource,
    directory_id: &ObjectId,
) -> Result<DirectoryResource> {
    let object = ObjectResource::fetch(tx, tenant, directory_id)
        .await?
        .context("missing directory")?;
    Ok(DirectoryResource::try_from(object)?)
}

async fn tenant_records(tx: &Transaction, tenant: &TenantResource) -> Result<Vec<Vec<u8>>> {
    let range = RangeOption {
        mode: StreamingMode::WantAll,
        ..RangeOption::from(tenant_subspace(&tenant.tenant_id).range())
    };
    let records = tx.get_range(&range, 1, false).await?;
    Ok(records
        .iter()
        .flat_map(|entry| [entry.key().to_vec(), entry.value().to_vec()])
        .collect())
}

async fn clear_tenant(tenant: &TenantResource) -> Result<()> {
    let tx = fdb::database()?.create_trx()?;
    let (begin, end) = tenant_subspace(&tenant.tenant_id).range();
    tx.clear_range(&begin, &end);
    tx.commit().await?;
    Ok(())
}

pub(crate) async fn child_creation_records_the_entry_and_bumps_the_directory() -> Result<()> {
    let tenant = create_tenant_root().await?;
    let longest_name = format!("{}x", "é".repeat(127));
    let tx = fdb::database()?.create_trx()?;
    let mut root = fetch_directory(&tx, &tenant, &tenant.root_id).await?;
    let created = [
        create_child(&tx, &mut root, "notes.txt", ObjectKind::File).await?,
        create_child(&tx, &mut root, &longest_name, ObjectKind::Directory).await?,
    ];
    tx.commit().await?;

    let tx = fdb::database()?.create_trx()?;
    let stored_root = fetch_directory(&tx, &tenant, &tenant.root_id).await?;
    let stored_root = stored_root.object();
    assert_eq!(
        (stored_root.attr_version, stored_root.content_version),
        (3, 3)
    );
    assert_eq!(stored_root.attr_version, root.object().attr_version);
    assert_eq!(stored_root.content_version, root.object().content_version);
    assert_eq!(stored_root.grants_version, 1);
    let last_child = created.last().context("missing created child")?;
    assert_eq!(stored_root.mtime_ms, last_child.ctime_ms);
    assert_eq!(stored_root.ctime_ms, last_child.ctime_ms);

    let subspace = tenant_subspace(&tenant.tenant_id);
    for child in &created {
        let entry_key = subspace.pack(&(
            "child",
            tenant.root_id.as_bytes().as_slice(),
            child.name.as_str(),
        ));
        let entry = tx.get(&entry_key, false).await?.context("missing entry")?;
        let entry_id: Vec<u8> = unpack(&entry)?;
        assert_eq!(entry_id, child.object_id.as_bytes());

        let stored = ObjectResource::fetch(&tx, &tenant, &child.object_id)
            .await?
            .context("missing child")?;
        assert_eq!(stored.parent_id, Some(tenant.root_id));
        assert_eq!(stored.name, child.name);
        assert_eq!(stored.kind, child.kind);
        assert_eq!((stored.attr_version, stored.content_version), (1, 1));
        assert_eq!(stored.grants_version, 1);
    }
    clear_tenant(&tenant).await
}

pub(crate) async fn child_creation_retry_returns_the_committed_child() -> Result<()> {
    let tenant = create_tenant_root().await?;
    let child_id = ObjectId::new_v7();
    let xattrs = HashMap::from([("user/tag".to_owned(), b"value".to_vec())]);
    let create = || {
        fdb::with_transaction(|tx| {
            let tenant = &tenant;
            let xattrs = &xattrs;
            async move {
                let root = ObjectResource::fetch(&tx, tenant, &tenant.root_id)
                    .await?
                    .ok_or(directory::Error::Object(object::Error::NotFound))?;
                DirectoryResource::try_from(root)?
                    .create_child(
                        &tx,
                        child_id,
                        "notes.txt".to_owned(),
                        ObjectKind::File,
                        Some("text/plain".to_owned()),
                        xattrs.clone(),
                    )
                    .await
            }
        })
    };
    create().await?;
    let tx = fdb::database()?.create_trx()?;
    let committed = tenant_records(&tx, &tenant).await?;

    // A retry after an unknown commit result runs `create_child` again in a new transaction.
    let retried = create().await?;

    let tx = fdb::database()?.create_trx()?;
    assert_eq!(tenant_records(&tx, &tenant).await?, committed);
    assert_eq!(retried.object_id, child_id);
    assert_eq!(retried.parent_id, Some(tenant.root_id));
    assert_eq!(retried.name, "notes.txt");
    assert_eq!(retried.kind, ObjectKind::File);
    let metadata = retried.metadata.context("missing retried metadata")?;
    assert_eq!(metadata.mime_type.as_deref(), Some("text/plain"));
    assert_eq!(metadata.xattrs, xattrs);
    clear_tenant(&tenant).await
}

pub(crate) async fn child_creation_rejections_leave_storage_unchanged() -> Result<()> {
    let tenant = create_tenant_root().await?;
    let tx = fdb::database()?.create_trx()?;
    let mut root = fetch_directory(&tx, &tenant, &tenant.root_id).await?;
    let existing_id = create_child(&tx, &mut root, "existing", ObjectKind::File)
        .await?
        .object_id;
    tx.commit().await?;

    let too_long = "é".repeat(128);
    let rejections = [
        (
            ObjectId::default(),
            "unset-id",
            ObjectKind::File,
            "ObjectInvalidId",
        ),
        (ObjectId::new_v7(), "", ObjectKind::File, "InvalidName"),
        (ObjectId::new_v7(), ".", ObjectKind::File, "InvalidName"),
        (ObjectId::new_v7(), "..", ObjectKind::File, "InvalidName"),
        (ObjectId::new_v7(), "a/b", ObjectKind::File, "InvalidName"),
        (ObjectId::new_v7(), "a\0b", ObjectKind::File, "InvalidName"),
        (
            ObjectId::new_v7(),
            &too_long,
            ObjectKind::File,
            "NameTooLong",
        ),
        (
            ObjectId::new_v7(),
            "link",
            ObjectKind::Symlink,
            "UnsupportedKind",
        ),
        (
            ObjectId::new_v7(),
            "existing",
            ObjectKind::File,
            "AlreadyExists",
        ),
        (
            ObjectId::new_v7(),
            "shared",
            ObjectKind::Directory,
            "AlreadyExists",
        ),
        (
            existing_id,
            "other",
            ObjectKind::File,
            "ObjectAlreadyExists",
        ),
    ];
    for (object_id, name, kind, expected) in rejections {
        let tx = fdb::database()?.create_trx()?;
        let before = tenant_records(&tx, &tenant).await?;
        let mut root = fetch_directory(&tx, &tenant, &tenant.root_id).await?;

        let result = root
            .create_child(&tx, object_id, name.to_owned(), kind, None, HashMap::new())
            .await;
        let error = match result {
            Err(storage::Error::Resource(error)) => error,
            other => anyhow::bail!("expected {expected}, got {:?}", other.err()),
        };
        let actual = match error {
            directory::Error::InvalidName => "InvalidName",
            directory::Error::NameTooLong => "NameTooLong",
            directory::Error::UnsupportedKind => "UnsupportedKind",
            directory::Error::AlreadyExists => "AlreadyExists",
            directory::Error::Object(object::Error::InvalidId) => "ObjectInvalidId",
            directory::Error::Object(object::Error::AlreadyExists) => "ObjectAlreadyExists",
            other => anyhow::bail!("expected {expected}, got {other:?}"),
        };
        assert_eq!(actual, expected);
        assert_eq!(tenant_records(&tx, &tenant).await?, before);
    }
    clear_tenant(&tenant).await
}

pub(crate) async fn shared_name_is_only_reserved_under_the_tenant_root() -> Result<()> {
    let tenant = create_tenant_root().await?;
    let tx = fdb::database()?.create_trx()?;
    let mut root = fetch_directory(&tx, &tenant, &tenant.root_id).await?;
    let docs_id = create_child(&tx, &mut root, "docs", ObjectKind::Directory)
        .await?
        .object_id;
    let mut docs = fetch_directory(&tx, &tenant, &docs_id).await?;
    let shared_id = create_child(&tx, &mut docs, "shared", ObjectKind::Directory)
        .await?
        .object_id;
    tx.commit().await?;

    let tx = fdb::database()?.create_trx()?;
    let docs = fetch_directory(&tx, &tenant, &docs_id).await?;
    assert_eq!(docs.lookup(&tx, "shared").await?, Some(shared_id));
    clear_tenant(&tenant).await
}

pub(crate) async fn child_lookup_resolves_names_within_each_directory() -> Result<()> {
    let tenant = create_tenant_root().await?;
    let tx = fdb::database()?.create_trx()?;
    let mut root = fetch_directory(&tx, &tenant, &tenant.root_id).await?;
    let root_file_id = create_child(&tx, &mut root, "a.txt", ObjectKind::File)
        .await?
        .object_id;
    let docs_id = create_child(&tx, &mut root, "docs", ObjectKind::Directory)
        .await?
        .object_id;
    let mut docs = fetch_directory(&tx, &tenant, &docs_id).await?;
    let docs_file_id = create_child(&tx, &mut docs, "a.txt", ObjectKind::File)
        .await?
        .object_id;
    tx.commit().await?;

    let tx = fdb::database()?.create_trx()?;
    let root = fetch_directory(&tx, &tenant, &tenant.root_id).await?;
    let docs = fetch_directory(&tx, &tenant, &docs_id).await?;
    assert_eq!(root.lookup(&tx, "a.txt").await?, Some(root_file_id));
    assert_eq!(root.lookup(&tx, "docs").await?, Some(docs_id));
    assert_eq!(docs.lookup(&tx, "a.txt").await?, Some(docs_file_id));
    assert_eq!(root.lookup(&tx, "missing").await?, None);
    assert_eq!(docs.lookup(&tx, "docs").await?, None);

    for name in ["", ".", "..", "docs/a.txt", "a\0b"] {
        assert!(matches!(
            root.lookup(&tx, name).await,
            Err(storage::Error::Resource(directory::Error::InvalidName))
        ));
    }
    assert!(matches!(
        root.lookup(&tx, &"é".repeat(128)).await,
        Err(storage::Error::Resource(directory::Error::NameTooLong))
    ));
    clear_tenant(&tenant).await
}

fn page_names(page: &ChildPage) -> Vec<&str> {
    page.entries
        .iter()
        .map(|entry| entry.name.as_str())
        .collect()
}

pub(crate) async fn child_listing_pages_through_entries_in_name_order() -> Result<()> {
    let tenant = create_tenant_root().await?;
    let tx = fdb::database()?.create_trx()?;
    let mut root = fetch_directory(&tx, &tenant, &tenant.root_id).await?;
    for name in ["b.txt", "é.txt", "a.txt", "B.txt", "c.txt"] {
        create_child(&tx, &mut root, name, ObjectKind::File).await?;
    }
    let docs_id = create_child(&tx, &mut root, "docs", ObjectKind::Directory)
        .await?
        .object_id;
    let mut docs = fetch_directory(&tx, &tenant, &docs_id).await?;
    let empty_id = create_child(&tx, &mut docs, "empty", ObjectKind::Directory)
        .await?
        .object_id;
    tx.commit().await?;

    let tx = fdb::database()?.create_trx()?;
    let root = fetch_directory(&tx, &tenant, &tenant.root_id).await?;
    let first = root.list(&tx, None, 4).await?;
    assert_eq!(page_names(&first), ["B.txt", "a.txt", "b.txt", "c.txt"]);
    let second = root.list(&tx, first.next_after.as_deref(), 4).await?;
    assert_eq!(page_names(&second), ["docs", "é.txt"]);
    assert_eq!(second.next_after, None);
    let docs_entry = second.entries.first().context("missing docs entry")?;
    assert_eq!(docs_entry.object_id, docs_id);

    let exact = root.list(&tx, None, 6).await?;
    assert_eq!(exact.entries.len(), 6);
    assert_eq!(exact.next_after, None);

    let docs = fetch_directory(&tx, &tenant, &docs_id).await?;
    assert_eq!(page_names(&docs.list(&tx, None, 4_096).await?), ["empty"]);
    let empty = fetch_directory(&tx, &tenant, &empty_id).await?;
    let empty_page = empty.list(&tx, None, 1).await?;
    assert!(empty_page.entries.is_empty());
    assert_eq!(empty_page.next_after, None);
    clear_tenant(&tenant).await
}

pub(crate) async fn child_listing_rejects_invalid_limits_and_cursors() -> Result<()> {
    let tenant = create_tenant_root().await?;
    let tx = fdb::database()?.create_trx()?;
    let mut root = fetch_directory(&tx, &tenant, &tenant.root_id).await?;
    let docs_id = create_child(&tx, &mut root, "docs", ObjectKind::Directory)
        .await?
        .object_id;
    let mut docs = fetch_directory(&tx, &tenant, &docs_id).await?;
    for name in ["a.txt", "b.txt"] {
        create_child(&tx, &mut docs, name, ObjectKind::File).await?;
    }
    tx.commit().await?;

    let tx = fdb::database()?.create_trx()?;
    let root = fetch_directory(&tx, &tenant, &tenant.root_id).await?;
    let docs = fetch_directory(&tx, &tenant, &docs_id).await?;
    for limit in [0, 4_097] {
        assert!(matches!(
            root.list(&tx, None, limit).await,
            Err(storage::Error::Resource(directory::Error::InvalidPageLimit))
        ));
    }
    let docs_cursor = docs
        .list(&tx, None, 1)
        .await?
        .next_after
        .context("missing docs cursor")?;
    let mut malformed_key = tenant_subspace(&tenant.tenant_id)
        .subspace(&("child", tenant.root_id.as_bytes().as_slice()))
        .bytes()
        .to_vec();
    malformed_key.extend([0xff, 0xff]);
    let malformed_cursor = URL_SAFE_NO_PAD.encode(malformed_key);
    for cursor in [
        docs_cursor.as_str(),
        malformed_cursor.as_str(),
        "not base64!",
        "AAAA",
    ] {
        assert!(matches!(
            root.list(&tx, Some(cursor), 1).await,
            Err(storage::Error::Resource(directory::Error::InvalidCursor))
        ));
    }
    clear_tenant(&tenant).await
}
