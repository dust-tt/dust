use anyhow::{Context, Result};
use dfs_api::storage::resources::session::SessionResource;
use dfs_protocol::rpc::{CreateOperation, GrantUpdate, MoveOperation, RemoveOperation};
use foundationdb::tuple::pack;

use super::*;
use crate::object::{allow, deny};

async fn writer() -> Result<SessionResource> {
    let tenant = create_tenant_root().await?;
    let tx = fdb::database()?.create_trx()?;
    let mut root = ObjectResource::fetch(&tx, &tenant, &tenant.root_id)
        .await?
        .context("missing root")?;
    root.update_grants(
        &tx,
        &[GrantUpdate {
            grant: allow("writer", 0o2),
            remove: false,
        }],
    )?;
    tx.commit().await?;
    Ok(SessionResource::new(&tenant, vec!["writer".to_owned()])?.0)
}

fn create(parent_id: ObjectId, name: &str, kind: ObjectKind) -> CreateOperation {
    CreateOperation {
        parent_id,
        object_id: ObjectId::new_v7(),
        name: name.to_owned(),
        kind: kind.into(),
        ..Default::default()
    }
}

pub(crate) async fn apply_create_receipt_preserves_nested_results() -> Result<()> {
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
        // The first result includes the later creation of its child.
        assert_eq!(
            (parent_attr.attr_version, parent_attr.content_version),
            (2, 2)
        );
        let file_attr = mutations[1].object.as_ref().context("missing file")?;
        assert_eq!(file_attr.id, file.object_id.into());
        assert_eq!(file_attr.mode, 0o200);
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
    let unauthorized = SessionResource::new(tenant, vec!["reader".to_owned()])?.0;
    assert!(matches!(
        DirectoryResource::apply_create(
            &tx,
            &unauthorized,
            create(tenant.root_id, "denied", ObjectKind::File)
        )
        .await,
        Err(storage::Error::Resource(directory::Error::Forbidden))
    ));
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

    // Overflow is a per-operation failure, including when it is discovered on the parent.
    let tx = fdb::database()?.create_trx()?;
    let root = ObjectResource::fetch(&tx, tenant, &tenant.root_id)
        .await?
        .context("missing root")?;
    let key =
        tenant_subspace(&tenant.tenant_id).pack(&("object", tenant.root_id.as_bytes().as_slice()));
    tx.set(
        &key,
        &pack(&(
            None::<&[u8]>,
            "",
            i32::from(ObjectKind::Directory),
            root.size,
            root.atime_ms,
            root.mtime_ms,
            root.ctime_ms,
            u64::MAX,
            root.content_version,
            root.grants_version,
        )),
    );
    tx.commit().await?;
    let tx = fdb::database()?.create_trx()?;
    let before = tenant_records(&tx, tenant).await?;
    assert!(matches!(
        DirectoryResource::apply_create(
            &tx,
            &session,
            create(tenant.root_id, "overflow", ObjectKind::File)
        )
        .await,
        Err(storage::Error::Resource(directory::Error::Object(
            object::Error::VersionOverflow
        )))
    ));
    assert_eq!(tenant_records(&tx, tenant).await?, before);
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
            grant: allow("writer", 0o2),
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

pub(crate) async fn directory_apply_moves_preserve_identity_and_removals_clear_records()
-> Result<()> {
    let session = writer().await?;
    let tenant = &session.tenant;
    let mut operation = create(tenant.root_id, "file", ObjectKind::File);
    operation
        .xattrs
        .insert("user.test".to_owned(), b"value".to_vec());
    let tx = fdb::database()?.create_trx()?;
    let first = DirectoryResource::apply_create(&tx, &session, operation.clone()).await?;
    assert_eq!(first.object.context("missing created attr")?.mode, 0o200);
    tx.commit().await?;

    let tx = fdb::database()?.create_trx()?;
    let before_duplicate = tenant_records(&tx, tenant).await?;
    assert!(matches!(
        DirectoryResource::apply_create(&tx, &session, operation.clone()).await,
        Err(storage::Error::Resource(directory::Error::AlreadyExists))
    ));
    assert_eq!(tenant_records(&tx, tenant).await?, before_duplicate);
    tx.commit().await?;

    let tx = fdb::database()?.create_trx()?;
    let target = create(tenant.root_id, "target", ObjectKind::Directory);
    DirectoryResource::apply_create(&tx, &session, target.clone()).await?;
    let mut object = ObjectResource::fetch(&tx, tenant, &operation.object_id)
        .await?
        .context("missing file")?;
    object.update_grants(
        &tx,
        &[
            GrantUpdate {
                grant: deny(0o6),
                remove: false,
            },
            GrantUpdate {
                grant: allow("other", 0o4),
                remove: false,
            },
        ],
    )?;
    let blocks = tenant_subspace(&tenant.tenant_id)
        .subspace(&("block", operation.object_id.as_bytes().as_slice()));
    tx.set(&blocks.pack(&0u64), b"contents");
    tx.commit().await?;

    let movement = MoveOperation {
        object_id: operation.object_id,
        parent_id: tenant.root_id,
        target_id: Some(target.object_id),
        name: "moved".to_owned(),
        replace: false,
    };
    {
        let tx = fdb::database()?.create_trx()?;
        let mutation = DirectoryResource::apply_move(&tx, &session, movement.clone()).await?;
        let attr = mutation.object.context("missing moved attr")?;
        assert_eq!(attr.id, operation.object_id.into());
        assert_eq!(attr.mode, 0);
        assert_eq!(attr.name, "moved");
        assert_eq!(
            (attr.attr_version, attr.content_version, attr.grants_version),
            (2, 1, 2)
        );
        assert_eq!(
            fetch_directory(&tx, tenant, &tenant.root_id)
                .await?
                .lookup(&tx, "file")
                .await?,
            None
        );
        assert_eq!(
            fetch_directory(&tx, tenant, &target.object_id)
                .await?
                .lookup(&tx, "moved")
                .await?,
            Some(operation.object_id)
        );
        assert_eq!(
            tx.get(&blocks.pack(&0u64), false).await?.as_deref(),
            Some(b"contents".as_slice())
        );
        tx.commit().await?;
    }
    let removal = RemoveOperation {
        object_id: operation.object_id,
        parent_id: target.object_id,
        kind: ObjectKind::File.into(),
    };
    {
        let tx = fdb::database()?.create_trx()?;
        let mutation = DirectoryResource::apply_remove(&tx, &session, removal.clone()).await?;
        assert!(mutation.object.is_none());
        assert_eq!(mutation.related.len(), 1);
        assert_eq!(mutation.related[0].id, target.object_id.into());
        assert_eq!(mutation.related[0].mode, 0o200);
        assert!(
            ObjectResource::fetch(&tx, tenant, &operation.object_id)
                .await?
                .is_none()
        );
        let root = fetch_directory(&tx, tenant, &target.object_id).await?;
        assert_eq!(root.lookup(&tx, "moved").await?, None);
        // Includes object, metadata, xattrs, blocks, and both directions of the grant index.
        for record in tenant_records(&tx, tenant).await?.as_chunks::<2>().0 {
            for bytes in record {
                assert!(
                    !bytes
                        .windows(operation.object_id.as_bytes().len())
                        .any(|bytes| bytes == operation.object_id.as_bytes())
                );
            }
        }
        tx.commit().await?;
    }
    let tx = fdb::database()?.create_trx()?;
    let recreated = DirectoryResource::apply_create(&tx, &session, operation.clone()).await?;
    let attr = recreated.object.context("missing recreated attr")?;
    assert_eq!(attr.id, operation.object_id.into());
    assert_eq!(attr.grants_version, 1);
    tx.commit().await?;
    clear_tenant(tenant).await
}

pub(crate) async fn apply_move_and_remove_rejections_leave_no_staged_writes() -> Result<()> {
    let session = writer().await?;
    let tenant = &session.tenant;
    let directory = create(tenant.root_id, "directory", ObjectKind::Directory);
    let nested = create(directory.object_id, "nested", ObjectKind::Directory);
    let file = create(tenant.root_id, "file", ObjectKind::File);
    let tx = fdb::database()?.create_trx()?;
    for operation in [&directory, &nested, &file] {
        DirectoryResource::apply_create(&tx, &session, operation.clone()).await?;
    }
    tx.commit().await?;

    let tx = fdb::database()?.create_trx()?;
    let before = tenant_records(&tx, tenant).await?;
    for operation in [
        MoveOperation {
            object_id: directory.object_id,
            parent_id: tenant.root_id,
            target_id: Some(nested.object_id),
            name: "cycle".to_owned(),
            replace: false,
        },
        MoveOperation {
            object_id: file.object_id,
            parent_id: tenant.root_id,
            target_id: None,
            name: "directory".to_owned(),
            replace: false,
        },
        MoveOperation {
            object_id: file.object_id,
            parent_id: tenant.root_id,
            target_id: None,
            name: "directory".to_owned(),
            replace: true,
        },
        MoveOperation {
            object_id: file.object_id,
            parent_id: directory.object_id,
            target_id: None,
            name: "wrong-parent".to_owned(),
            replace: false,
        },
        MoveOperation {
            object_id: tenant.root_id,
            parent_id: tenant.root_id,
            target_id: None,
            name: "root".to_owned(),
            replace: false,
        },
    ] {
        assert!(
            DirectoryResource::apply_move(&tx, &session, operation)
                .await
                .is_err()
        );
        assert_eq!(tenant_records(&tx, tenant).await?, before);
    }
    assert!(matches!(
        DirectoryResource::apply_remove(
            &tx,
            &session,
            RemoveOperation {
                object_id: directory.object_id,
                parent_id: tenant.root_id,
                kind: ObjectKind::Directory.into()
            }
        )
        .await,
        Err(storage::Error::Resource(directory::Error::NotEmpty))
    ));
    assert_eq!(tenant_records(&tx, tenant).await?, before);
    tx.commit().await?;

    clear_tenant(tenant).await
}

pub(crate) async fn moves_check_both_parents_and_revalidate_staged_tree_hints() -> Result<()> {
    let writer = writer().await?;
    let tenant = &writer.tenant;
    let source = create(tenant.root_id, "source", ObjectKind::Directory);
    let target = create(tenant.root_id, "target", ObjectKind::Directory);
    let tx = fdb::database()?.create_trx()?;
    for operation in [&source, &target] {
        DirectoryResource::apply_create(&tx, &writer, operation.clone()).await?;
    }
    let file = create(source.object_id, "file", ObjectKind::File);
    DirectoryResource::apply_create(&tx, &writer, file.clone()).await?;
    for (id, subject, mode) in [
        (source.object_id, "source", 0o6),
        (target.object_id, "target", 0o2),
        (file.object_id, "nobody", 0),
    ] {
        let mut object = ObjectResource::fetch(&tx, tenant, &id)
            .await?
            .context("missing object")?;
        object.update_grants(
            &tx,
            &[
                GrantUpdate {
                    grant: deny(0o6),
                    remove: false,
                },
                GrantUpdate {
                    grant: allow(subject, mode),
                    remove: false,
                },
            ],
        )?;
    }
    tx.commit().await?;
    let movement = MoveOperation {
        object_id: file.object_id,
        parent_id: source.object_id,
        target_id: Some(target.object_id),
        name: "file".to_owned(),
        replace: false,
    };
    for subject in ["source", "target"] {
        let session = SessionResource::new(tenant, vec![subject.to_owned()])?.0;
        let tx = fdb::database()?.create_trx()?;
        let before = tenant_records(&tx, tenant).await?;
        assert!(matches!(
            DirectoryResource::apply_move(&tx, &session, movement.clone()).await,
            Err(storage::Error::Resource(directory::Error::Forbidden))
        ));
        assert_eq!(tenant_records(&tx, tenant).await?, before);
        tx.commit().await?;
    }
    let session = SessionResource::new(tenant, vec!["source".to_owned(), "target".to_owned()])?.0;
    let tx = fdb::database()?.create_trx()?;
    let mutation = DirectoryResource::apply_move(&tx, &session, movement).await?;
    assert_eq!(mutation.object.context("missing moved file")?.mode, 0);
    tx.commit().await?;

    // A later operation follows the new parent even when hints contain the old ancestry.
    let directory = create(source.object_id, "staged", ObjectKind::Directory);
    let tx = fdb::database()?.create_trx()?;
    DirectoryResource::apply_create(&tx, &session, directory.clone()).await?;
    let initial = ObjectResource::modes_for_session(&tx, &session, &[directory.object_id]).await?;
    assert_eq!(
        initial[0]
            .as_ref()
            .context("missing staged directory")?
            .1
            .bits(),
        0o6
    );
    DirectoryResource::apply_move(
        &tx,
        &session,
        MoveOperation {
            object_id: directory.object_id,
            parent_id: source.object_id,
            target_id: Some(target.object_id),
            name: "staged".to_owned(),
            replace: false,
        },
    )
    .await?;
    let mutation = DirectoryResource::apply_create(
        &tx,
        &session,
        create(directory.object_id, "nested", ObjectKind::File),
    )
    .await?;
    assert_eq!(mutation.object.context("missing nested file")?.mode, 0o200);
    drop(tx);

    // An aborted attempt may leave parent hints, but all ancestry and existence is checked again.
    let tx = fdb::database()?.create_trx()?;
    assert!(
        ObjectResource::modes_for_session(&tx, &session, &[directory.object_id]).await?[0]
            .is_none()
    );
    DirectoryResource::apply_create(&tx, &session, directory.clone()).await?;
    let retried = ObjectResource::modes_for_session(&tx, &session, &[directory.object_id]).await?;
    assert_eq!(
        retried[0]
            .as_ref()
            .context("missing retried directory")?
            .1
            .bits(),
        0o6
    );
    tx.commit().await?;
    clear_tenant(tenant).await
}

pub(crate) async fn move_replacement_clears_victim_and_rejects_nonempty_directories() -> Result<()>
{
    let session = writer().await?;
    let tenant = &session.tenant;
    let moved = create(tenant.root_id, "moved", ObjectKind::File);
    let victim = create(tenant.root_id, "victim", ObjectKind::File);
    let directory = create(tenant.root_id, "directory", ObjectKind::Directory);
    let occupied = create(tenant.root_id, "occupied", ObjectKind::Directory);
    let tx = fdb::database()?.create_trx()?;
    for operation in [&moved, &victim, &directory, &occupied] {
        DirectoryResource::apply_create(&tx, &session, operation.clone()).await?;
    }
    DirectoryResource::apply_create(
        &tx,
        &session,
        create(occupied.object_id, "child", ObjectKind::File),
    )
    .await?;
    let mut object = ObjectResource::fetch(&tx, tenant, &victim.object_id)
        .await?
        .context("missing victim")?;
    object.update_grants(
        &tx,
        &[GrantUpdate {
            grant: allow("other", 0o6),
            remove: false,
        }],
    )?;
    let subspace = tenant_subspace(&tenant.tenant_id);
    let block = subspace.pack(&("block", victim.object_id.as_bytes().as_slice(), 0u64));
    tx.set(&block, b"victim bytes");
    tx.commit().await?;

    let tx = fdb::database()?.create_trx()?;
    let before = tenant_records(&tx, tenant).await?;
    assert!(matches!(
        DirectoryResource::apply_move(
            &tx,
            &session,
            MoveOperation {
                object_id: directory.object_id,
                parent_id: tenant.root_id,
                target_id: None,
                name: "occupied".to_owned(),
                replace: true,
            }
        )
        .await,
        Err(storage::Error::Resource(directory::Error::NotEmpty))
    ));
    assert_eq!(tenant_records(&tx, tenant).await?, before);
    tx.commit().await?;

    let movement = MoveOperation {
        object_id: moved.object_id,
        parent_id: tenant.root_id,
        target_id: None,
        name: "victim".to_owned(),
        replace: true,
    };
    {
        let tx = fdb::database()?.create_trx()?;
        DirectoryResource::apply_move(&tx, &session, movement.clone()).await?;
        assert!(
            ObjectResource::fetch(&tx, tenant, &victim.object_id)
                .await?
                .is_none()
        );
        assert!(tx.get(&block, false).await?.is_none());
        assert!(
            tx.get(
                &subspace.pack(&(
                    "grant-object",
                    "ALLOW",
                    "other",
                    victim.object_id.as_bytes().as_slice(),
                    0o6u32
                )),
                false
            )
            .await?
            .is_none()
        );
        assert_eq!(
            fetch_directory(&tx, tenant, &tenant.root_id)
                .await?
                .lookup(&tx, "victim")
                .await?,
            Some(moved.object_id)
        );
        tx.commit().await?;
    }
    clear_tenant(tenant).await
}

pub(crate) async fn apply_receipt_preserves_later_creates_when_the_batch_is_retried() -> Result<()>
{
    use dfs_api::storage::receipt::Receipt;
    use dfs_protocol::rpc::operation::Operation;
    use std::sync::atomic::{AtomicUsize, Ordering};

    let session = writer().await?;
    let tenant = &session.tenant;
    let a = create(tenant.root_id, "a", ObjectKind::File);
    let b = create(tenant.root_id, "temp", ObjectKind::File);
    let tx = fdb::database()?.create_trx()?;
    DirectoryResource::apply_create(&tx, &session, a.clone()).await?;
    tx.commit().await?;
    let operations = vec![
        Operation::Move(MoveOperation {
            object_id: a.object_id,
            parent_id: tenant.root_id,
            target_id: None,
            name: "temp".to_owned(),
            replace: true,
        }),
        Operation::Move(MoveOperation {
            object_id: a.object_id,
            parent_id: tenant.root_id,
            target_id: None,
            name: "final".to_owned(),
            replace: false,
        }),
        Operation::Create(b.clone()),
    ];
    let calls = AtomicUsize::new(0);
    let mut receipt = Receipt::new()?;
    let mut original = None;
    for _ in 0..2 {
        let result = receipt
            .with_transaction(|tx| {
                let session = &session;
                let operations = operations.clone();
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
        if let Some(original) = &original {
            assert_eq!(&result, original);
        } else {
            original = Some(result);
        }
        let tx = fdb::database()?.create_trx()?;
        let root = fetch_directory(&tx, tenant, &tenant.root_id).await?;
        assert_eq!(root.lookup(&tx, "final").await?, Some(a.object_id));
        assert_eq!(root.lookup(&tx, "temp").await?, Some(b.object_id));
        assert!(
            ObjectResource::fetch(&tx, tenant, &b.object_id)
                .await?
                .is_some()
        );
    }
    assert_eq!(calls.load(Ordering::Relaxed), 1);
    clear_tenant(tenant).await
}
