use std::collections::HashMap;

use anyhow::{Context, Result};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use dfs_api::storage::{
    self, fdb,
    resources::{
        directory::{self, ChildCreateParams, ChildPage, DirectoryResource},
        keys::tenant_subspace,
        object::{self, ObjectResource},
        tenant::TenantResource,
    },
};
use dfs_protocol::{ObjectId, rpc::ObjectKind};
use foundationdb::{RangeOption, Transaction, options::StreamingMode, tuple::unpack};

fn child_params(name: &str, kind: ObjectKind) -> ChildCreateParams {
    ChildCreateParams {
        object_id: ObjectId::new_v7(),
        name: name.to_owned(),
        kind,
        mime_type: None,
        xattrs: HashMap::new(),
    }
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
    let children_params = [
        child_params("notes.txt", ObjectKind::File),
        child_params(&longest_name, ObjectKind::Directory),
    ];
    let expected_ids: Vec<ObjectId> = children_params
        .iter()
        .map(|child| child.object_id)
        .collect();

    let tx = fdb::database()?.create_trx()?;
    let mut root = fetch_directory(&tx, &tenant, &tenant.root_id).await?;
    let mut created = Vec::new();
    for child_params in children_params {
        created.push(root.create_child(&tx, child_params).await?);
    }
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
    let last_child = created.last().context("missing created child")?;
    assert_eq!(stored_root.mtime_ms, last_child.ctime_ms);
    assert_eq!(stored_root.ctime_ms, last_child.ctime_ms);

    let subspace = tenant_subspace(&tenant.tenant_id);
    for (child, expected_id) in created.iter().zip(expected_ids) {
        let entry_key = subspace.pack(&(
            "child",
            tenant.root_id.as_bytes().as_slice(),
            child.name.as_str(),
        ));
        let entry = tx.get(&entry_key, false).await?.context("missing entry")?;
        let entry_id: Vec<u8> = unpack(&entry)?;
        assert_eq!(entry_id, expected_id.as_bytes());

        let stored = ObjectResource::fetch(&tx, &tenant, &expected_id)
            .await?
            .context("missing child")?;
        assert_eq!(stored.parent_id, Some(tenant.root_id));
        assert_eq!(stored.name, child.name);
        assert_eq!(stored.kind, child.kind);
        assert_eq!((stored.attr_version, stored.content_version), (1, 1));
    }
    clear_tenant(&tenant).await
}

pub(crate) async fn child_creation_rejections_leave_storage_unchanged() -> Result<()> {
    let tenant = create_tenant_root().await?;
    let existing_params = child_params("existing", ObjectKind::File);
    let existing_id = existing_params.object_id;
    let tx = fdb::database()?.create_trx()?;
    let mut root = fetch_directory(&tx, &tenant, &tenant.root_id).await?;
    root.create_child(&tx, existing_params).await?;
    tx.commit().await?;

    let too_long = "é".repeat(128);
    let rejections = [
        (child_params("", ObjectKind::File), "InvalidName"),
        (child_params(".", ObjectKind::File), "InvalidName"),
        (child_params("..", ObjectKind::File), "InvalidName"),
        (child_params("a/b", ObjectKind::File), "InvalidName"),
        (child_params("a\0b", ObjectKind::File), "InvalidName"),
        (child_params(&too_long, ObjectKind::File), "NameTooLong"),
        (child_params("link", ObjectKind::Symlink), "UnsupportedKind"),
        (child_params("existing", ObjectKind::File), "AlreadyExists"),
        (
            ChildCreateParams {
                object_id: existing_id,
                ..child_params("other", ObjectKind::File)
            },
            "ObjectAlreadyExists",
        ),
    ];
    for (child, expected) in rejections {
        let tx = fdb::database()?.create_trx()?;
        let before = tenant_records(&tx, &tenant).await?;
        let mut root = fetch_directory(&tx, &tenant, &tenant.root_id).await?;

        let error = match root.create_child(&tx, child).await {
            Err(storage::Error::Resource(error)) => error,
            other => anyhow::bail!("expected {expected}, got {:?}", other.err()),
        };
        let actual = match error {
            directory::Error::InvalidName => "InvalidName",
            directory::Error::NameTooLong => "NameTooLong",
            directory::Error::UnsupportedKind => "UnsupportedKind",
            directory::Error::AlreadyExists => "AlreadyExists",
            directory::Error::Object(object::Error::AlreadyExists) => "ObjectAlreadyExists",
            other => anyhow::bail!("expected {expected}, got {other:?}"),
        };
        assert_eq!(actual, expected);
        assert_eq!(tenant_records(&tx, &tenant).await?, before);
    }
    clear_tenant(&tenant).await
}

pub(crate) async fn child_lookup_resolves_names_within_each_directory() -> Result<()> {
    let tenant = create_tenant_root().await?;
    let root_file_params = child_params("a.txt", ObjectKind::File);
    let docs_params = child_params("docs", ObjectKind::Directory);
    let docs_file_params = child_params("a.txt", ObjectKind::File);
    let (root_file_id, docs_id, docs_file_id) = (
        root_file_params.object_id,
        docs_params.object_id,
        docs_file_params.object_id,
    );

    let tx = fdb::database()?.create_trx()?;
    let mut root = fetch_directory(&tx, &tenant, &tenant.root_id).await?;
    root.create_child(&tx, root_file_params).await?;
    root.create_child(&tx, docs_params).await?;
    let mut docs = fetch_directory(&tx, &tenant, &docs_id).await?;
    docs.create_child(&tx, docs_file_params).await?;
    tx.commit().await?;

    let tx = fdb::database()?.create_trx()?;
    let root = fetch_directory(&tx, &tenant, &tenant.root_id).await?;
    let docs = fetch_directory(&tx, &tenant, &docs_id).await?;
    assert_eq!(root.lookup_child(&tx, "a.txt").await?, Some(root_file_id));
    assert_eq!(root.lookup_child(&tx, "docs").await?, Some(docs_id));
    assert_eq!(docs.lookup_child(&tx, "a.txt").await?, Some(docs_file_id));
    assert_eq!(root.lookup_child(&tx, "missing").await?, None);
    assert_eq!(docs.lookup_child(&tx, "docs").await?, None);

    for name in ["", ".", "..", "docs/a.txt", "a\0b"] {
        assert!(matches!(
            root.lookup_child(&tx, name).await,
            Err(storage::Error::Resource(directory::Error::InvalidName))
        ));
    }
    assert!(matches!(
        root.lookup_child(&tx, &"é".repeat(128)).await,
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
    let docs_params = child_params("docs", ObjectKind::Directory);
    let empty_params = child_params("empty", ObjectKind::Directory);
    let (docs_id, empty_id) = (docs_params.object_id, empty_params.object_id);

    let tx = fdb::database()?.create_trx()?;
    let mut root = fetch_directory(&tx, &tenant, &tenant.root_id).await?;
    for name in ["b.txt", "é.txt", "a.txt", "B.txt", "c.txt"] {
        root.create_child(&tx, child_params(name, ObjectKind::File))
            .await?;
    }
    root.create_child(&tx, docs_params).await?;
    let mut docs = fetch_directory(&tx, &tenant, &docs_id).await?;
    docs.create_child(&tx, empty_params).await?;
    tx.commit().await?;

    let tx = fdb::database()?.create_trx()?;
    let root = fetch_directory(&tx, &tenant, &tenant.root_id).await?;
    let first = root.list_children(&tx, None, 4).await?;
    assert_eq!(page_names(&first), ["B.txt", "a.txt", "b.txt", "c.txt"]);
    let second = root
        .list_children(&tx, first.next_after.as_deref(), 4)
        .await?;
    assert_eq!(page_names(&second), ["docs", "é.txt"]);
    assert_eq!(second.next_after, None);
    let docs_entry = second.entries.first().context("missing docs entry")?;
    assert_eq!(docs_entry.object_id, docs_id);

    let exact = root.list_children(&tx, None, 6).await?;
    assert_eq!(exact.entries.len(), 6);
    assert_eq!(exact.next_after, None);

    let docs = fetch_directory(&tx, &tenant, &docs_id).await?;
    assert_eq!(
        page_names(&docs.list_children(&tx, None, 4_096).await?),
        ["empty"]
    );
    let empty = fetch_directory(&tx, &tenant, &empty_id).await?;
    let empty_page = empty.list_children(&tx, None, 1).await?;
    assert!(empty_page.entries.is_empty());
    assert_eq!(empty_page.next_after, None);
    clear_tenant(&tenant).await
}

pub(crate) async fn child_listing_rejects_invalid_limits_and_cursors() -> Result<()> {
    let tenant = create_tenant_root().await?;
    let docs_params = child_params("docs", ObjectKind::Directory);
    let docs_id = docs_params.object_id;

    let tx = fdb::database()?.create_trx()?;
    let mut root = fetch_directory(&tx, &tenant, &tenant.root_id).await?;
    root.create_child(&tx, docs_params).await?;
    let mut docs = fetch_directory(&tx, &tenant, &docs_id).await?;
    for name in ["a.txt", "b.txt"] {
        docs.create_child(&tx, child_params(name, ObjectKind::File))
            .await?;
    }
    tx.commit().await?;

    let tx = fdb::database()?.create_trx()?;
    let root = fetch_directory(&tx, &tenant, &tenant.root_id).await?;
    let docs = fetch_directory(&tx, &tenant, &docs_id).await?;
    for limit in [0, 4_097] {
        assert!(matches!(
            root.list_children(&tx, None, limit).await,
            Err(storage::Error::Resource(directory::Error::InvalidPageLimit))
        ));
    }
    let docs_cursor = docs
        .list_children(&tx, None, 1)
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
            root.list_children(&tx, Some(cursor), 1).await,
            Err(storage::Error::Resource(directory::Error::InvalidCursor))
        ));
    }
    clear_tenant(&tenant).await
}
