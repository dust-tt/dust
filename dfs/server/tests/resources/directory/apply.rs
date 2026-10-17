use anyhow::{Context, Result};
use dfs_api::storage::resources::session::SessionResource;
use dfs_protocol::rpc::{CreateOperation, GrantUpdate, RemoveOperation};

use super::*;
use crate::object::{allow, deny};

pub(super) async fn writer() -> Result<SessionResource> {
    let tenant = create_tenant_root().await?;
    let tx = fdb::database()?.create_trx()?;
    let mut root = ObjectResource::fetch(&tx, &tenant, &tenant.root_id)
        .await?
        .context("missing root")?;
    root.update_grants(
        &tx,
        &[("writer", 0o6), ("read-only", 0o4), ("write-only", 0o2)].map(|(subject, mode)| {
            GrantUpdate {
                grant: allow(subject, mode),
                remove: false,
            }
        }),
    )?;
    tx.commit().await?;
    Ok(SessionResource::new(&tenant, vec!["writer".to_owned()])?.0)
}

pub(super) fn create(parent_id: ObjectId, name: &str, kind: ObjectKind) -> CreateOperation {
    CreateOperation {
        parent_id,
        object_id: ObjectId::new_v7(),
        name: name.to_owned(),
        kind: kind.into(),
        ..Default::default()
    }
}

pub(crate) async fn apply_create_receipt_preserves_per_operation_results() -> Result<()> {
    use dfs_api::storage::receipt::Receipt;
    use dfs_protocol::rpc::operation::Operation;
    use std::sync::atomic::{AtomicUsize, Ordering};

    let session = writer().await?;
    let tenant = &session.tenant;
    let directory = create(tenant.root_id, "directory", ObjectKind::Directory);
    let mut file = create(directory.object_id, "file", ObjectKind::File);
    file.mime_type = Some(String::new());
    file.xattrs
        .insert("user.test".to_owned(), b"value".to_vec());
    let calls = AtomicUsize::new(0);
    let mut receipt = Receipt::new()?;
    let mut original = None;
    for _ in 0..2 {
        let result = receipt
            .with_transaction(|tx| {
                let session = &session;
                let operations = vec![
                    Operation::Create(directory.clone()),
                    Operation::Create(file.clone()),
                ];
                let calls = &calls;
                async move {
                    calls.fetch_add(1, Ordering::Relaxed);
                    ObjectResource::apply(&tx, session, operations)
                        .await?
                        .into_iter()
                        .collect::<Result<Vec<_>, _>>()
                        .map_err(storage::Error::Resource)
                }
            })
            .await?;
        let (mutations, _) = &result;
        assert_eq!(mutations.len(), 2);
        let parent_attr = mutations[0].object.as_ref().context("missing directory")?;
        assert_eq!(parent_attr.id, directory.object_id.into());
        assert_eq!(parent_attr.mode, 0o700);
        // The first result stays at creation state, even after its child is created.
        assert_eq!(
            (parent_attr.attr_version, parent_attr.content_version),
            (1, 1)
        );
        assert_eq!(mutations[0].related.len(), 1);
        let root_attr = &mutations[0].related[0];
        assert_eq!(root_attr.id, tenant.root_id.into());
        assert_eq!((root_attr.attr_version, root_attr.content_version), (2, 2));
        let file_attr = mutations[1].object.as_ref().context("missing file")?;
        assert_eq!(file_attr.id, file.object_id.into());
        assert_eq!(file_attr.mode, 0o600);
        assert_eq!(mutations[1].related.len(), 1);
        // The later result supplies the directory's updated attributes to the client.
        let updated_parent = &mutations[1].related[0];
        assert_eq!(updated_parent.id, directory.object_id.into());
        assert_eq!(
            (updated_parent.attr_version, updated_parent.content_version),
            (2, 2)
        );
        assert_eq!(updated_parent.mtime, file_attr.ctime);
        assert_eq!(updated_parent.ctime, file_attr.ctime);
        if let Some(original) = &original {
            assert_eq!(&result, original);
        } else {
            original = Some(result);
        }
    }
    assert_eq!(calls.load(Ordering::Relaxed), 1);

    let tx = fdb::database()?.create_trx()?;
    for operation in [&directory, &file] {
        let parent = fetch_directory(&tx, tenant, &operation.parent_id).await?;
        assert_eq!(
            parent.lookup(&tx, &operation.name).await?,
            Some(operation.object_id)
        );
        let mut object = ObjectResource::fetch(&tx, tenant, &operation.object_id)
            .await?
            .context("missing created object")?;
        object.load_metadata(&tx).await?;
        let metadata = object.metadata.context("missing metadata")?;
        assert_eq!(metadata.mime_type, None);
        assert_eq!(
            metadata.xattrs,
            operation.xattrs.clone().into_iter().collect()
        );
    }
    clear_tenant(tenant).await
}

pub(crate) async fn apply_create_rejections_leave_no_staged_writes() -> Result<()> {
    let session = writer().await?;
    let tenant = &session.tenant;
    let file = create(tenant.root_id, "file", ObjectKind::File);
    let tx = fdb::database()?.create_trx()?;
    DirectoryResource::apply_create(&tx, &session, file).await?;
    tx.commit().await?;

    let tx = fdb::database()?.create_trx()?;
    let before = tenant_records(&tx, tenant).await?;
    for subject in ["no-access", "read-only", "write-only"] {
        let unauthorized = SessionResource::new(tenant, vec![subject.to_owned()])?.0;
        for kind in [ObjectKind::File, ObjectKind::Directory] {
            assert!(matches!(
                DirectoryResource::apply_create(
                    &tx,
                    &unauthorized,
                    create(tenant.root_id, "denied", kind)
                )
                .await,
                Err(storage::Error::Resource(directory::Error::Forbidden))
            ));
            assert_eq!(tenant_records(&tx, tenant).await?, before);
        }
    }
    for mut invalid in [
        create(tenant.root_id, "shared", ObjectKind::File),
        create(tenant.root_id, "file", ObjectKind::File),
        create(tenant.root_id, "invalid/name", ObjectKind::File),
        create(tenant.root_id, "symlink", ObjectKind::Symlink),
        create(tenant.root_id, "mime", ObjectKind::File),
        create(tenant.root_id, "xattr", ObjectKind::File),
    ] {
        if invalid.name == "mime" {
            invalid.mime_type = Some("invalid".to_owned());
        }
        if invalid.name == "xattr" {
            invalid.xattrs.insert(String::new(), vec![]);
        }
        assert!(
            DirectoryResource::apply_create(&tx, &session, invalid)
                .await
                .is_err()
        );
        assert_eq!(tenant_records(&tx, tenant).await?, before);
    }
    tx.commit().await?;

    clear_tenant(tenant).await
}

pub(crate) async fn apply_create_conflicts_with_grant_revocation() -> Result<()> {
    let session = writer().await?;
    let tenant = &session.tenant;
    let operation = create(tenant.root_id, "file", ObjectKind::File);
    let tx = fdb::database()?.create_trx()?;
    DirectoryResource::apply_create(&tx, &session, operation.clone()).await?;
    let revoke = fdb::database()?.create_trx()?;
    let mut root = ObjectResource::fetch(&revoke, tenant, &tenant.root_id)
        .await?
        .context("missing root")?;
    root.update_grants(
        &revoke,
        &[GrantUpdate {
            grant: allow("writer", 0o6),
            remove: true,
        }],
    )?;
    revoke.commit().await?;
    let error = tx.commit().await.err().context("expected conflict")?;
    let error: foundationdb::FdbError = error.into();
    assert_eq!(error.code(), 1020);
    let tx = fdb::database()?.create_trx()?;
    assert!(matches!(
        DirectoryResource::apply_create(&tx, &session, operation.clone()).await,
        Err(storage::Error::Resource(directory::Error::Forbidden))
    ));
    assert!(
        ObjectResource::fetch(&tx, tenant, &operation.object_id)
            .await?
            .is_none()
    );
    clear_tenant(tenant).await
}

pub(crate) async fn apply_remove_clears_owned_records_and_updates_parent() -> Result<()> {
    let session = writer().await?;
    let tenant = &session.tenant;
    let tx = fdb::database()?.create_trx()?;
    let mut parent = fetch_directory(&tx, tenant, &tenant.root_id).await?;
    let sibling = create_child(&tx, &mut parent, "keep", ObjectKind::File).await?;
    let prefix = tenant_subspace(&tenant.tenant_id);
    tx.set(
        &prefix.pack(&("block", sibling.object_id.as_bytes().as_slice(), 0u64)),
        b"keep",
    );
    let mut expected = tenant_records(&tx, tenant).await?;
    let before = parent.object().clone();

    let mut file = parent
        .create_child(
            &tx,
            ObjectId::new_v7(),
            "remove".to_owned(),
            ObjectKind::File,
            Some("text/plain".to_owned()),
            HashMap::from([("user.tag".to_owned(), b"value".to_vec())]),
        )
        .await?;
    // More than one grant page ensures removal does not leave reverse entries behind.
    let grants: Vec<_> = (0..513)
        .map(|index| GrantUpdate {
            grant: allow(&format!("reader-{index}"), 0o4),
            remove: false,
        })
        .collect();
    for changes in grants.chunks(512) {
        file.update_grants(&tx, changes)?;
    }
    for index in [0u64, 3] {
        tx.set(
            &prefix.pack(&("block", file.object_id.as_bytes().as_slice(), index)),
            b"data",
        );
    }
    tx.commit().await?;

    let tx = fdb::database()?.create_trx()?;
    let mutation = DirectoryResource::apply_remove(
        &tx,
        &session,
        RemoveOperation {
            parent_id: tenant.root_id,
            object_id: file.object_id,
            kind: ObjectKind::File.into(),
        },
    )
    .await?;
    assert!(mutation.object.is_none());
    assert_eq!(mutation.related.len(), 1);
    let attr = &mutation.related[0];
    assert_eq!(attr.id, tenant.root_id.into());
    assert_eq!(attr.mode, 0o700);
    assert_eq!(attr.attr_version, before.attr_version + 2);
    assert_eq!(attr.content_version, before.content_version + 2);
    assert_eq!(attr.grants_version, before.grants_version);
    assert_eq!(attr.atime, before.atime_ms);
    assert_eq!(attr.mtime, attr.ctime);
    assert!(attr.mtime >= file.mtime_ms);
    assert!(attr.metadata.is_none());
    tx.commit().await?;

    let tx = fdb::database()?.create_trx()?;
    let parent = fetch_directory(&tx, tenant, &tenant.root_id).await?;
    assert_eq!(parent.object().attr_version, attr.attr_version);
    assert_eq!(parent.object().mtime_ms, attr.mtime);
    let root_key = prefix.pack(&("object", tenant.root_id.as_bytes().as_slice()));
    let root_index = expected
        .as_chunks::<2>()
        .0
        .iter()
        .position(|record| record[0] == root_key)
        .context("missing root record")?;
    expected[root_index * 2 + 1] = tx
        .get(&root_key, false)
        .await?
        .context("missing root")?
        .to_vec();
    // Apart from the parent's attributes, every record is exactly as it was before file creation.
    assert_eq!(tenant_records(&tx, tenant).await?, expected);
    clear_tenant(tenant).await
}

pub(crate) async fn apply_remove_rejections_leave_no_staged_writes() -> Result<()> {
    let session = writer().await?;
    let tenant = &session.tenant;
    let tx = fdb::database()?.create_trx()?;
    let mut parent = fetch_directory(&tx, tenant, &tenant.root_id).await?;
    let file = create_child(&tx, &mut parent, "file", ObjectKind::File).await?;
    let directory = create_child(&tx, &mut parent, "directory", ObjectKind::Directory).await?;
    let mut directory = DirectoryResource::try_from(directory)?;
    create_child(&tx, &mut directory, "nested", ObjectKind::File).await?;
    let mut restricted = Vec::new();
    for denied in [0o6, 0o4, 0o2] {
        let mut object = create_child(
            &tx,
            &mut parent,
            &format!("denied-{denied}"),
            ObjectKind::File,
        )
        .await?;
        object.update_grants(
            &tx,
            &[GrantUpdate {
                grant: deny(denied),
                remove: false,
            }],
        )?;
        restricted.push(object.object_id);
    }
    tx.commit().await?;

    let remove = RemoveOperation {
        parent_id: tenant.root_id,
        object_id: file.object_id,
        kind: ObjectKind::File.into(),
    };
    let tx = fdb::database()?.create_trx()?;
    let before = tenant_records(&tx, tenant).await?;
    for subject in ["no-access", "read-only", "write-only"] {
        let denied = SessionResource::new(tenant, vec![subject.to_owned()])?.0;
        assert!(matches!(
            DirectoryResource::apply_remove(&tx, &denied, remove.clone()).await,
            Err(storage::Error::Resource(directory::Error::Forbidden))
        ));
        assert_eq!(tenant_records(&tx, tenant).await?, before);
    }
    for object_id in restricted {
        assert!(matches!(
            DirectoryResource::apply_remove(
                &tx,
                &session,
                RemoveOperation {
                    object_id,
                    ..remove.clone()
                }
            )
            .await,
            Err(storage::Error::Resource(directory::Error::Forbidden))
        ));
        assert_eq!(tenant_records(&tx, tenant).await?, before);
    }
    assert!(matches!(
        DirectoryResource::apply_remove(
            &tx,
            &session,
            RemoveOperation {
                object_id: directory.object().object_id,
                kind: ObjectKind::Directory.into(),
                ..remove.clone()
            }
        )
        .await,
        Err(storage::Error::Resource(directory::Error::NotEmpty))
    ));
    assert_eq!(tenant_records(&tx, tenant).await?, before);
    assert!(matches!(
        DirectoryResource::apply_remove(
            &tx,
            &session,
            RemoveOperation {
                kind: ObjectKind::Directory.into(),
                ..remove.clone()
            }
        )
        .await,
        Err(storage::Error::Resource(directory::Error::InvalidKind))
    ));
    assert_eq!(tenant_records(&tx, tenant).await?, before);
    for operation in [
        RemoveOperation {
            object_id: ObjectId::new_v7(),
            ..remove.clone()
        },
        RemoveOperation {
            parent_id: directory.object().object_id,
            ..remove.clone()
        },
    ] {
        assert!(matches!(
            DirectoryResource::apply_remove(&tx, &session, operation).await,
            Err(storage::Error::Resource(directory::Error::Object(
                object::Error::NotFound
            )))
        ));
        assert_eq!(tenant_records(&tx, tenant).await?, before);
    }
    assert!(matches!(
        DirectoryResource::apply_remove(
            &tx,
            &session,
            RemoveOperation {
                object_id: tenant.root_id,
                kind: ObjectKind::Directory.into(),
                ..remove
            }
        )
        .await,
        Err(storage::Error::Resource(directory::Error::Forbidden))
    ));
    assert_eq!(tenant_records(&tx, tenant).await?, before);
    tx.commit().await?;
    clear_tenant(tenant).await
}

pub(crate) async fn apply_remove_receipt_preserves_deleted_parent_attributes() -> Result<()> {
    use dfs_api::storage::receipt::Receipt;
    use dfs_protocol::rpc::operation::Operation;
    use std::sync::atomic::{AtomicUsize, Ordering};

    let session = writer().await?;
    let tenant = &session.tenant;
    let directory = create(tenant.root_id, "directory", ObjectKind::Directory);
    let file = create(directory.object_id, "file", ObjectKind::File);
    let operations = vec![
        Operation::Create(directory.clone()),
        Operation::Create(file.clone()),
        Operation::Remove(RemoveOperation {
            parent_id: directory.object_id,
            object_id: file.object_id,
            kind: ObjectKind::File.into(),
        }),
        Operation::Remove(RemoveOperation {
            parent_id: tenant.root_id,
            object_id: directory.object_id,
            kind: ObjectKind::Directory.into(),
        }),
    ];
    let calls = AtomicUsize::new(0);
    let mut receipt = Receipt::new()?;
    let mut original = None;
    for _ in 0..2 {
        let result = receipt
            .with_transaction(|tx| {
                let operations = operations.clone();
                let session = &session;
                let calls = &calls;
                async move {
                    calls.fetch_add(1, Ordering::Relaxed);
                    ObjectResource::apply(&tx, session, operations)
                        .await?
                        .into_iter()
                        .collect::<Result<Vec<_>, _>>()
                        .map_err(storage::Error::Resource)
                }
            })
            .await?;
        let (mutations, _) = &result;
        assert_eq!(mutations.len(), 4);
        assert!(mutations[2].object.is_none());
        assert_eq!(mutations[2].related.len(), 1);
        let deleted_parent = &mutations[2].related[0];
        assert_eq!(deleted_parent.id, directory.object_id.into());
        assert_eq!(
            (deleted_parent.attr_version, deleted_parent.content_version),
            (3, 3)
        );
        assert!(mutations[3].object.is_none());
        assert_eq!(mutations[3].related.len(), 1);
        let root = &mutations[3].related[0];
        assert_eq!(root.id, tenant.root_id.into());
        assert_eq!((root.attr_version, root.content_version), (3, 3));
        if let Some(original) = &original {
            assert_eq!(&result, original);
        } else {
            original = Some(result);
        }
    }
    assert_eq!(calls.load(Ordering::Relaxed), 1);
    let tx = fdb::database()?.create_trx()?;
    assert!(
        ObjectResource::fetch(&tx, tenant, &directory.object_id)
            .await?
            .is_none()
    );
    assert!(
        ObjectResource::fetch(&tx, tenant, &file.object_id)
            .await?
            .is_none()
    );
    clear_tenant(tenant).await
}

pub(crate) async fn apply_remove_conflicts_with_new_children() -> Result<()> {
    let session = writer().await?;
    let tenant = &session.tenant;
    let directory = create(tenant.root_id, "directory", ObjectKind::Directory);
    let tx = fdb::database()?.create_trx()?;
    DirectoryResource::apply_create(&tx, &session, directory.clone()).await?;
    tx.commit().await?;

    let tx = fdb::database()?.create_trx()?;
    DirectoryResource::apply_remove(
        &tx,
        &session,
        RemoveOperation {
            parent_id: tenant.root_id,
            object_id: directory.object_id,
            kind: ObjectKind::Directory.into(),
        },
    )
    .await?;
    let concurrent = fdb::database()?.create_trx()?;
    let child = create(directory.object_id, "child", ObjectKind::File);
    DirectoryResource::apply_create(&concurrent, &session, child.clone()).await?;
    concurrent.commit().await?;
    let error: foundationdb::FdbError =
        tx.commit().await.err().context("expected conflict")?.into();
    assert_eq!(error.code(), 1020);
    let tx = fdb::database()?.create_trx()?;
    assert!(
        ObjectResource::fetch(&tx, tenant, &directory.object_id)
            .await?
            .is_some()
    );
    assert!(
        ObjectResource::fetch(&tx, tenant, &child.object_id)
            .await?
            .is_some()
    );
    clear_tenant(tenant).await
}
