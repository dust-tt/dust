use std::sync::atomic::{AtomicUsize, Ordering};

use dfs_api::storage::{receipt::Receipt, resources::session::SessionResource};
use dfs_protocol::rpc::{GrantUpdate, MoveOperation, operation::Operation};

use super::{
    apply::{create, writer},
    *,
};
use crate::object::deny;

pub(crate) async fn apply_move_preserves_records_and_updates_versions() -> Result<()> {
    let session = writer().await?;
    let tenant = &session.tenant;
    let tx = fdb::database()?.create_trx()?;
    let mut root = fetch_directory(&tx, tenant, &tenant.root_id).await?;
    let target = create_child(&tx, &mut root, "target", ObjectKind::Directory).await?;
    let mut file = root
        .create_child(
            &tx,
            ObjectId::new_v7(),
            "file".to_owned(),
            ObjectKind::File,
            Some("text/plain".to_owned()),
            HashMap::from([("user.tag".to_owned(), b"keep".to_vec())]),
        )
        .await?;
    file.update_grants(
        &tx,
        &[GrantUpdate {
            grant: deny(0o2),
            remove: false,
        }],
    )?;
    let prefix = tenant_subspace(&tenant.tenant_id);
    let block_key = prefix.pack(&("block", file.object_id.as_bytes().as_slice(), 0u64));
    tx.set(&block_key, b"keep");
    let before = tenant_records(&tx, tenant).await?;
    tx.commit().await?;

    let tx = fdb::database()?.create_trx()?;
    let result = DirectoryResource::apply_move(
        &tx,
        &session,
        MoveOperation {
            object_id: file.object_id,
            parent_id: tenant.root_id,
            target_id: Some(target.object_id),
            name: "moved".to_owned(),
        },
    )
    .await?;
    let attr = result.object.context("missing moved file")?;
    assert_eq!(attr.id, file.object_id.into());
    assert_eq!(attr.name, "moved");
    assert_eq!(attr.mode, 0o400);
    assert!(attr.metadata.is_none());
    assert_eq!(attr.attr_version, file.attr_version + 1);
    assert_eq!(attr.content_version, file.content_version);
    assert_eq!(attr.grants_version, file.grants_version);
    assert_eq!(attr.atime, file.atime_ms);
    assert_eq!(attr.mtime, file.mtime_ms);
    assert!(attr.ctime >= file.ctime_ms);
    assert_eq!(result.related.len(), 2);
    for (parent, before) in result.related.iter().zip([root.object(), &target]) {
        assert_eq!(parent.id, before.object_id.into());
        assert_eq!(parent.attr_version, before.attr_version + 1);
        assert_eq!(parent.content_version, before.content_version + 1);
        assert_eq!(parent.grants_version, before.grants_version);
        assert_eq!(parent.atime, before.atime_ms);
        assert_eq!(parent.mtime, attr.ctime);
        assert_eq!(parent.ctime, attr.ctime);
    }
    tx.commit().await?;

    let tx = fdb::database()?.create_trx()?;
    let root = fetch_directory(&tx, tenant, &tenant.root_id).await?;
    let target = fetch_directory(&tx, tenant, &target.object_id).await?;
    assert!(root.lookup(&tx, "file").await?.is_none());
    assert_eq!(target.lookup(&tx, "moved").await?, Some(file.object_id));
    let stored = ObjectResource::fetch(&tx, tenant, &file.object_id)
        .await?
        .context("missing file")?;
    assert_eq!(stored.parent_id, Some(target.object().object_id));
    assert_eq!(stored.name, attr.name);
    assert_eq!(stored.attr_version, attr.attr_version);
    // Only object attributes and directory bindings may change; metadata, grants, and blocks stay.
    let unchanged = |records: Vec<Vec<u8>>| -> Vec<Vec<u8>> {
        records
            .as_chunks::<2>()
            .0
            .iter()
            .filter(|record| {
                let object_prefix = prefix.subspace(&"object");
                let child_prefix = prefix.subspace(&"child");
                !object_prefix.is_start_of(&record[0]) && !child_prefix.is_start_of(&record[0])
            })
            .flatten()
            .cloned()
            .collect()
    };
    assert_eq!(
        unchanged(tenant_records(&tx, tenant).await?),
        unchanged(before)
    );
    clear_tenant(tenant).await
}

async fn cycle_fixture() -> Result<(SessionResource, MoveOperation, MoveOperation)> {
    let session = writer().await?;
    let tenant = &session.tenant;
    let tx = fdb::database()?.create_trx()?;
    let mut root = fetch_directory(&tx, tenant, &tenant.root_id).await?;
    // Disjoint operation targets can still have intersecting ancestry: /p/a/x and /q/b/y.
    let mut p = DirectoryResource::try_from(
        create_child(&tx, &mut root, "p", ObjectKind::Directory).await?,
    )?;
    let mut q = DirectoryResource::try_from(
        create_child(&tx, &mut root, "q", ObjectKind::Directory).await?,
    )?;
    let mut a =
        DirectoryResource::try_from(create_child(&tx, &mut p, "a", ObjectKind::Directory).await?)?;
    let mut b =
        DirectoryResource::try_from(create_child(&tx, &mut q, "b", ObjectKind::Directory).await?)?;
    let x = create_child(&tx, &mut a, "x", ObjectKind::Directory).await?;
    let y = create_child(&tx, &mut b, "y", ObjectKind::Directory).await?;
    tx.commit().await?;
    let first = MoveOperation {
        object_id: a.object().object_id,
        parent_id: p.object().object_id,
        target_id: Some(y.object_id),
        name: "a".to_owned(),
    };
    let second = MoveOperation {
        object_id: b.object().object_id,
        parent_id: q.object().object_id,
        target_id: Some(x.object_id),
        name: "b".to_owned(),
    };
    Ok((session, first, second))
}

pub(crate) async fn apply_moves_in_separate_transactions_conflict_on_ancestry() -> Result<()> {
    let (session, first, second) = cycle_fixture().await?;
    let tx = fdb::database()?.create_trx()?;
    let concurrent = fdb::database()?.create_trx()?;
    DirectoryResource::apply_move(&tx, &session, first).await?;
    DirectoryResource::apply_move(&concurrent, &session, second.clone()).await?;
    tx.commit().await?;
    let error: foundationdb::FdbError = concurrent
        .commit()
        .await
        .err()
        .context("expected conflict")?
        .into();
    assert_eq!(error.code(), 1020);
    let retry = fdb::database()?.create_trx()?;
    assert!(matches!(
        DirectoryResource::apply_move(&retry, &session, second).await,
        Err(storage::Error::Resource(directory::Error::InvalidMove))
    ));
    clear_tenant(&session.tenant).await
}

pub(crate) async fn apply_moves_with_disjoint_targets_cannot_create_a_cycle() -> Result<()> {
    let (session, first, second) = cycle_fixture().await?;
    let tx = fdb::database()?.create_trx()?;
    let results = ObjectResource::apply(
        &tx,
        &session,
        vec![
            Operation::Move(first.clone()),
            Operation::Move(second.clone()),
        ],
    )
    .await?;
    assert!(results[0].is_ok());
    assert!(
        matches!(results[1], Err(object::Error::Directory(ref error))
        if matches!(**error, directory::Error::InvalidMove))
    );
    tx.commit().await?;
    let tx = fdb::database()?.create_trx()?;
    let moved = ObjectResource::fetch(&tx, &session.tenant, &first.object_id)
        .await?
        .context("missing moved directory")?;
    let rejected = ObjectResource::fetch(&tx, &session.tenant, &second.object_id)
        .await?
        .context("missing rejected directory")?;
    assert_eq!(moved.parent_id, first.target_id);
    assert_eq!(rejected.parent_id, Some(second.parent_id));
    clear_tenant(&session.tenant).await
}

pub(crate) async fn apply_move_receipt_preserves_per_operation_results() -> Result<()> {
    let session = writer().await?;
    let tenant = &session.tenant;
    let directory = create(tenant.root_id, "directory", ObjectKind::Directory);
    let file = create(tenant.root_id, "file", ObjectKind::File);
    let operations = vec![
        Operation::Create(directory.clone()),
        Operation::Create(file.clone()),
        Operation::Move(MoveOperation {
            parent_id: tenant.root_id,
            object_id: file.object_id,
            target_id: Some(directory.object_id),
            name: "moved".to_owned(),
        }),
        // A rename to the current name still advances versions, returning its parent only once.
        Operation::Move(MoveOperation {
            parent_id: directory.object_id,
            object_id: file.object_id,
            target_id: None,
            name: "moved".to_owned(),
        }),
    ];
    let calls = AtomicUsize::new(0);
    let mut receipt = Receipt::new()?;
    let mut original = None;
    for _ in 0..2 {
        let result = receipt
            .with_transaction(|tx| {
                let session = &session;
                let calls = &calls;
                let operations = operations.clone();
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
        let (results, _) = &result;
        assert_eq!(
            results[1]
                .object
                .as_ref()
                .context("missing created file")?
                .name,
            "file"
        );
        assert_eq!(
            results[2]
                .object
                .as_ref()
                .context("missing moved file")?
                .attr_version,
            2
        );
        assert_eq!(results[2].related.len(), 2);
        assert_eq!(results[2].related[0].content_version, 4);
        assert_eq!(results[2].related[1].content_version, 2);
        assert_eq!(
            results[3]
                .object
                .as_ref()
                .context("missing renamed file")?
                .attr_version,
            3
        );
        assert_eq!(results[3].related.len(), 1);
        assert_eq!(results[3].related[0].id, directory.object_id.into());
        assert_eq!(results[3].related[0].content_version, 3);
        if let Some(original) = &original {
            assert_eq!(&result, original);
        } else {
            original = Some(result);
        }
    }
    assert_eq!(calls.load(Ordering::Relaxed), 1);
    clear_tenant(tenant).await
}

pub(crate) async fn apply_move_collisions_preserve_destinations_and_concurrent_children()
-> Result<()> {
    for kind in [ObjectKind::File, ObjectKind::Directory] {
        let session = writer().await?;
        let tenant = &session.tenant;
        let tx = fdb::database()?.create_trx()?;
        let mut root = fetch_directory(&tx, tenant, &tenant.root_id).await?;
        let source = create_child(&tx, &mut root, "source", kind).await?;
        let destination = create_child(&tx, &mut root, "destination", kind).await?;
        tx.commit().await?;

        let operation = MoveOperation {
            parent_id: tenant.root_id,
            object_id: source.object_id,
            target_id: None,
            name: "destination".to_owned(),
        };
        let tx = fdb::database()?.create_trx()?;
        let before = tenant_records(&tx, tenant).await?;
        assert!(matches!(
            DirectoryResource::apply_move(&tx, &session, operation.clone()).await,
            Err(storage::Error::Resource(directory::Error::AlreadyExists))
        ));
        assert_eq!(tenant_records(&tx, tenant).await?, before);
        tx.commit().await?;

        if kind == ObjectKind::Directory {
            // The destination ID is not a Move target, so Create runs in a separate batch.
            let child = create(destination.object_id, "child", ObjectKind::File);
            let operations = vec![Operation::Move(operation), Operation::Create(child.clone())];
            assert_eq!(
                ObjectResource::group_by_targets(operations.clone()).len(),
                2
            );
            let tx = fdb::database()?.create_trx()?;
            let results = ObjectResource::apply(&tx, &session, operations).await?;
            assert!(
                matches!(results[0], Err(object::Error::Directory(ref error))
                if matches!(**error, directory::Error::AlreadyExists))
            );
            assert!(results[1].is_ok());
            tx.commit().await?;

            let tx = fdb::database()?.create_trx()?;
            let root = fetch_directory(&tx, tenant, &tenant.root_id).await?;
            assert_eq!(root.lookup(&tx, "source").await?, Some(source.object_id));
            assert_eq!(
                root.lookup(&tx, "destination").await?,
                Some(destination.object_id)
            );
            let destination = fetch_directory(&tx, tenant, &destination.object_id).await?;
            assert_eq!(
                destination.lookup(&tx, "child").await?,
                Some(child.object_id)
            );
            let (stored, mode) =
                ObjectResource::modes_for_session(&tx, &session, &[child.object_id])
                    .await?
                    .pop()
                    .flatten()
                    .context("missing child")?;
            assert_eq!(stored.parent_id, Some(destination.object().object_id));
            assert!(mode.can_read());
        }
        clear_tenant(tenant).await?;
    }
    Ok(())
}

pub(crate) async fn apply_remove_then_move_serializes_destination_operations() -> Result<()> {
    let session = writer().await?;
    let tenant = &session.tenant;
    let tx = fdb::database()?.create_trx()?;
    let mut root = fetch_directory(&tx, tenant, &tenant.root_id).await?;
    let source = create_child(&tx, &mut root, "source", ObjectKind::Directory).await?;
    let destination = create_child(&tx, &mut root, "destination", ObjectKind::Directory).await?;
    tx.commit().await?;

    let child = create(destination.object_id, "child", ObjectKind::File);
    let operations = vec![
        Operation::Remove(dfs_protocol::rpc::RemoveOperation {
            parent_id: tenant.root_id,
            object_id: destination.object_id,
            kind: ObjectKind::Directory.into(),
        }),
        Operation::Move(MoveOperation {
            parent_id: tenant.root_id,
            object_id: source.object_id,
            target_id: None,
            name: "destination".to_owned(),
        }),
        Operation::Create(child.clone()),
    ];
    assert_eq!(
        ObjectResource::group_by_targets(operations.clone()).len(),
        1
    );
    let tx = fdb::database()?.create_trx()?;
    let results = ObjectResource::apply(&tx, &session, operations).await?;
    assert!(results[0].is_ok());
    assert!(results[1].is_ok());
    assert!(
        matches!(results[2], Err(object::Error::Directory(ref error))
        if matches!(**error, directory::Error::Object(object::Error::NotFound)))
    );
    tx.commit().await?;

    let tx = fdb::database()?.create_trx()?;
    let root = fetch_directory(&tx, tenant, &tenant.root_id).await?;
    assert!(root.lookup(&tx, "source").await?.is_none());
    assert_eq!(
        root.lookup(&tx, "destination").await?,
        Some(source.object_id)
    );
    for id in [destination.object_id, child.object_id] {
        assert!(ObjectResource::fetch(&tx, tenant, &id).await?.is_none());
    }
    clear_tenant(tenant).await
}

pub(crate) async fn apply_move_rejections_leave_no_staged_writes() -> Result<()> {
    let session = writer().await?;
    let tenant = &session.tenant;
    let tx = fdb::database()?.create_trx()?;
    let mut root = fetch_directory(&tx, tenant, &tenant.root_id).await?;
    let file = create_child(&tx, &mut root, "file", ObjectKind::File).await?;
    create_child(&tx, &mut root, "occupied", ObjectKind::File).await?;
    let directory = create_child(&tx, &mut root, "directory", ObjectKind::Directory).await?;
    let nonempty = create_child(&tx, &mut root, "nonempty", ObjectKind::Directory).await?;
    let mut nonempty = DirectoryResource::try_from(nonempty)?;
    let nested = create_child(&tx, &mut nonempty, "nested", ObjectKind::Directory).await?;
    let mut unreadable = create_child(&tx, &mut root, "unreadable", ObjectKind::File).await?;
    unreadable.update_grants(
        &tx,
        &[GrantUpdate {
            grant: deny(0o4),
            remove: false,
        }],
    )?;
    let mut restricted = Vec::new();
    for denied in [0o4, 0o2] {
        let mut parent = create_child(
            &tx,
            &mut root,
            &format!("denied-{denied}"),
            ObjectKind::Directory,
        )
        .await?;
        parent.update_grants(
            &tx,
            &[GrantUpdate {
                grant: deny(denied),
                remove: false,
            }],
        )?;
        let mut parent = DirectoryResource::try_from(parent)?;
        let child = create_child(&tx, &mut parent, "child", ObjectKind::File).await?;
        restricted.push((parent.object().object_id, child.object_id));
    }
    tx.commit().await?;
    let operation = MoveOperation {
        parent_id: tenant.root_id,
        object_id: file.object_id,
        target_id: None,
        name: "renamed".to_owned(),
    };
    let tx = fdb::database()?.create_trx()?;
    let before = tenant_records(&tx, tenant).await?;
    for subject in ["read-only", "write-only", "no-access"] {
        let denied = SessionResource::new(tenant, vec![subject.to_owned()])?.0;
        assert!(matches!(
            DirectoryResource::apply_move(&tx, &denied, operation.clone()).await,
            Err(storage::Error::Resource(directory::Error::Forbidden))
        ));
        assert_eq!(tenant_records(&tx, tenant).await?, before);
    }
    let mut denied_operations = vec![MoveOperation {
        object_id: unreadable.object_id,
        ..operation.clone()
    }];
    for (parent_id, object_id) in restricted {
        denied_operations.push(MoveOperation {
            parent_id,
            object_id,
            target_id: Some(tenant.root_id),
            ..operation.clone()
        });
        denied_operations.push(MoveOperation {
            target_id: Some(parent_id),
            ..operation.clone()
        });
    }
    for operation in denied_operations {
        assert!(matches!(
            DirectoryResource::apply_move(&tx, &session, operation).await,
            Err(storage::Error::Resource(directory::Error::Forbidden))
        ));
        assert_eq!(tenant_records(&tx, tenant).await?, before);
    }
    let cases = [
        (
            MoveOperation {
                name: "".to_owned(),
                ..operation.clone()
            },
            directory::Error::InvalidName,
        ),
        (
            MoveOperation {
                name: "occupied".to_owned(),
                ..operation.clone()
            },
            directory::Error::AlreadyExists,
        ),
        (
            MoveOperation {
                name: "shared".to_owned(),
                ..operation.clone()
            },
            directory::Error::AlreadyExists,
        ),
        (
            MoveOperation {
                name: "directory".to_owned(),
                ..operation.clone()
            },
            directory::Error::AlreadyExists,
        ),
        (
            MoveOperation {
                object_id: directory.object_id,
                name: "nonempty".to_owned(),
                ..operation.clone()
            },
            directory::Error::AlreadyExists,
        ),
        (
            MoveOperation {
                object_id: directory.object_id,
                target_id: Some(directory.object_id),
                ..operation.clone()
            },
            directory::Error::InvalidMove,
        ),
        (
            MoveOperation {
                object_id: nonempty.object().object_id,
                target_id: Some(nested.object_id),
                ..operation.clone()
            },
            directory::Error::InvalidMove,
        ),
        (
            MoveOperation {
                object_id: tenant.root_id,
                ..operation.clone()
            },
            directory::Error::Forbidden,
        ),
    ];
    for (operation, expected) in cases {
        let error = DirectoryResource::apply_move(&tx, &session, operation)
            .await
            .err()
            .context("expected rejection")?;
        // Match typed variants; each rejection must leave the transaction unchanged.
        assert!(matches!(
            (error, expected),
            (
                storage::Error::Resource(directory::Error::InvalidName),
                directory::Error::InvalidName
            ) | (
                storage::Error::Resource(directory::Error::AlreadyExists),
                directory::Error::AlreadyExists
            ) | (
                storage::Error::Resource(directory::Error::InvalidMove),
                directory::Error::InvalidMove
            ) | (
                storage::Error::Resource(directory::Error::Forbidden),
                directory::Error::Forbidden
            )
        ));
        assert_eq!(tenant_records(&tx, tenant).await?, before);
    }
    for operation in [
        MoveOperation {
            parent_id: directory.object_id,
            ..operation.clone()
        },
        MoveOperation {
            object_id: ObjectId::new_v7(),
            ..operation
        },
    ] {
        assert!(matches!(
            DirectoryResource::apply_move(&tx, &session, operation).await,
            Err(storage::Error::Resource(directory::Error::Object(
                object::Error::NotFound
            )))
        ));
        assert_eq!(tenant_records(&tx, tenant).await?, before);
    }
    clear_tenant(tenant).await
}
