use anyhow::{Context, Result};
use dfs_api::storage::resources::session::SessionResource;
use dfs_protocol::rpc::{CreateOperation, GrantUpdate};

use super::*;
use crate::object::allow;

async fn writer() -> Result<SessionResource> {
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

fn create(parent_id: ObjectId, name: &str, kind: ObjectKind) -> CreateOperation {
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
