use std::{
    collections::HashMap,
    sync::atomic::{AtomicUsize, Ordering},
};

use anyhow::{Context, Result};
use dfs_api::storage::{
    self, fdb,
    receipt::Receipt,
    resources::{
        file::{self, BLOCK_SIZE_BYTES, FileResource},
        keys::tenant_subspace,
        object::{self, ObjectResource},
        session::SessionResource,
        tenant::TenantResource,
    },
};
use dfs_protocol::{
    ObjectId,
    rpc::{GrantUpdate, ObjectKind, UpdateOperation, XattrChange, operation::Operation},
};

use super::grants::{allow, records};

async fn fixture(size: u64) -> Result<(SessionResource, ObjectResource)> {
    let (tenant, _) = TenantResource::new(ObjectId::new_v7().to_string())?;
    let tx = fdb::database()?.create_trx()?;
    ObjectResource::new_root(&tenant)?
        .create(
            &tx,
            &[
                allow("writer", 0o6),
                allow("read-only", 0o4),
                allow("write-only", 0o2),
            ],
        )
        .await?;
    let mut object = ObjectResource::new(
        &tenant,
        ObjectId::new_v7(),
        Some(tenant.root_id),
        "file".to_owned(),
        ObjectKind::File,
        Some("text/plain".to_owned()),
        HashMap::from([
            ("keep".to_owned(), b"unchanged".to_vec()),
            ("remove".to_owned(), b"removed".to_vec()),
        ]),
        1,
    );
    object.size = size;
    object.create(&tx, &[]).await?;
    tx.commit().await?;
    Ok((
        SessionResource::new(&tenant, vec!["writer".to_owned()])?.0,
        object,
    ))
}

async fn clear(tenant: &TenantResource) -> Result<()> {
    let tx = fdb::database()?.create_trx()?;
    let (begin, end) = tenant_subspace(&tenant.tenant_id).range();
    tx.clear_range(&begin, &end);
    tx.commit().await?;
    Ok(())
}

pub(crate) async fn updates_patch_metadata_and_preserve_receipt_results() -> Result<()> {
    let (session, object) = fixture(0).await?;
    let tenant = &session.tenant;
    let operations = vec![
        Operation::Update(UpdateOperation {
            object_id: object.object_id,
            mime_type: Some(String::new()),
            atime: Some(0),
            mtime: Some(42),
            xattrs: vec![
                XattrChange {
                    name: "remove".to_owned(),
                    value: None,
                },
                XattrChange {
                    name: "user/é".to_owned(),
                    value: Some(b"first".to_vec()),
                },
                XattrChange {
                    name: "user/é".to_owned(),
                    value: Some(vec![]),
                },
            ],
            ..Default::default()
        }),
        Operation::Update(UpdateOperation {
            object_id: object.object_id,
            ..Default::default()
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
        for (index, mutation) in result.0.iter().enumerate() {
            let attr = mutation
                .object
                .as_ref()
                .context("missing updated attributes")?;
            assert_eq!(attr.id, object.object_id.into());
            assert_eq!(attr.attr_version, 2 + index as u64);
            assert_eq!((attr.content_version, attr.grants_version), (1, 1));
            assert_eq!((attr.atime, attr.mtime), (Some(0), Some(42)));
            assert!(attr.ctime > object.ctime_ms);
            assert_eq!(attr.mode, 0o600);
            assert!(attr.metadata.is_none());
            assert!(mutation.related.is_empty());
        }
        if let Some(original) = &original {
            assert_eq!(&result, original);
        } else {
            original = Some(result);
        }
    }
    assert_eq!(calls.load(Ordering::Relaxed), 1);
    let tx = fdb::database()?.create_trx()?;
    let mut stored = ObjectResource::fetch(&tx, tenant, &object.object_id)
        .await?
        .context("missing file")?;
    stored.load_metadata(&tx).await?;
    let metadata = stored.metadata.context("missing metadata")?;
    assert_eq!(metadata.created_at_ms, 1);
    assert_eq!(metadata.mime_type, None);
    assert_eq!(
        metadata.xattrs,
        HashMap::from([
            ("keep".to_owned(), b"unchanged".to_vec()),
            ("user/é".to_owned(), vec![]),
        ])
    );
    let root = ObjectResource::fetch(&tx, tenant, &tenant.root_id)
        .await?
        .context("missing root")?;
    assert_eq!((root.attr_version, root.content_version), (1, 1));

    // Directory metadata is writable without changing its listing version.
    let mutation = ObjectResource::apply_update(
        &tx,
        &session,
        UpdateOperation {
            object_id: tenant.root_id,
            mime_type: Some("inode/directory".to_owned()),
            ..Default::default()
        },
    )
    .await?;
    let attr = mutation.object.context("missing root attributes")?;
    assert_eq!(
        (attr.attr_version, attr.content_version, attr.grants_version),
        (2, 1, 1)
    );
    assert_eq!((attr.atime, attr.mtime), (root.atime_ms, root.mtime_ms));
    tx.commit().await?;
    let tx = fdb::database()?.create_trx()?;
    let mut root = ObjectResource::fetch(&tx, tenant, &tenant.root_id)
        .await?
        .context("missing root")?;
    root.load_metadata(&tx).await?;
    assert_eq!(
        root.metadata
            .context("missing metadata")?
            .mime_type
            .as_deref(),
        Some("inode/directory")
    );
    clear(tenant).await
}

pub(crate) async fn updates_reject_invalid_patches_without_staging_writes() -> Result<()> {
    let (session, object) = fixture(10).await?;
    let tenant = &session.tenant;
    let tx = fdb::database()?.create_trx()?;
    let before = records(&tx, &tenant.tenant_id).await?;
    for subject in ["unknown", "read-only", "write-only"] {
        let denied = SessionResource::new(tenant, vec![subject.to_owned()])?.0;
        assert!(matches!(
            ObjectResource::apply_update(
                &tx,
                &denied,
                UpdateOperation {
                    object_id: object.object_id,
                    size: Some(0),
                    ..Default::default()
                }
            )
            .await,
            Err(storage::Error::Resource(object::Error::Forbidden))
        ));
        assert_eq!(records(&tx, &tenant.tenant_id).await?, before);
    }
    for name in [String::new(), "a\0b".to_owned(), "é".repeat(128)] {
        assert!(matches!(
            ObjectResource::apply_update(
                &tx,
                &session,
                UpdateOperation {
                    object_id: object.object_id,
                    size: Some(0),
                    mime_type: Some("application/json".to_owned()),
                    xattrs: vec![XattrChange { name, value: None }],
                    ..Default::default()
                }
            )
            .await,
            Err(storage::Error::Resource(object::Error::InvalidXattrName))
        ));
        assert_eq!(records(&tx, &tenant.tenant_id).await?, before);
    }
    for mime_type in ["invalid".to_owned(), format!("text/{}", "a".repeat(251))] {
        assert!(matches!(
            ObjectResource::apply_update(
                &tx,
                &session,
                UpdateOperation {
                    object_id: object.object_id,
                    size: Some(0),
                    mime_type: Some(mime_type),
                    ..Default::default()
                }
            )
            .await,
            Err(storage::Error::Resource(object::Error::InvalidMimeType))
        ));
        assert_eq!(records(&tx, &tenant.tenant_id).await?, before);
    }
    assert!(matches!(
        ObjectResource::apply_update(
            &tx,
            &session,
            UpdateOperation {
                object_id: object.object_id,
                size: Some(0),
                xattrs: vec![XattrChange {
                    name: "a".to_owned(),
                    value: Some(vec![0; 32 * 1024 - 1])
                }],
                ..Default::default()
            }
        )
        .await,
        Err(storage::Error::Resource(object::Error::XattrsTooLarge))
    ));
    assert_eq!(records(&tx, &tenant.tenant_id).await?, before);
    let result = ObjectResource::apply_update(
        &tx,
        &session,
        UpdateOperation {
            object_id: tenant.root_id,
            size: Some(0),
            mime_type: Some("text/plain".to_owned()),
            ..Default::default()
        },
    )
    .await;
    assert!(
        matches!(result, Err(storage::Error::Resource(object::Error::File(error)))
        if matches!(*error, file::Error::IsDirectory))
    );
    assert_eq!(records(&tx, &tenant.tenant_id).await?, before);
    let (other, _) = fixture(0).await?;
    assert!(matches!(
        ObjectResource::apply_update(
            &tx,
            &session,
            UpdateOperation {
                object_id: other.tenant.root_id,
                ..Default::default()
            }
        )
        .await,
        Err(storage::Error::Resource(object::Error::NotFound))
    ));
    assert_eq!(records(&tx, &tenant.tenant_id).await?, before);
    // A malformed boundary block must reject the complete patch before metadata is written.
    let block_key = tenant_subspace(&tenant.tenant_id).pack(&(
        "block",
        object.object_id.as_bytes().as_slice(),
        0u64,
    ));
    tx.set(&block_key, &vec![0; BLOCK_SIZE_BYTES + 1]);
    let before = records(&tx, &tenant.tenant_id).await?;
    let result = ObjectResource::apply_update(
        &tx,
        &session,
        UpdateOperation {
            object_id: object.object_id,
            size: Some(5),
            mime_type: Some("application/json".to_owned()),
            ..Default::default()
        },
    )
    .await;
    assert!(
        matches!(result, Err(storage::Error::Resource(object::Error::File(error)))
        if matches!(*error, file::Error::InvalidBlock))
    );
    assert_eq!(records(&tx, &tenant.tenant_id).await?, before);
    tx.commit().await?;
    clear(&other.tenant).await?;
    clear(tenant).await
}

pub(crate) async fn updates_resize_files_without_restoring_discarded_bytes() -> Result<()> {
    let size = (2 * BLOCK_SIZE_BYTES + 5) as u64;
    let (session, object) = fixture(size).await?;
    let tenant = &session.tenant;
    let blocks = tenant_subspace(&tenant.tenant_id)
        .subspace(&("block", object.object_id.as_bytes().as_slice()));
    let tx = fdb::database()?.create_trx()?;
    tx.set(&blocks.pack(&0u64), &vec![1; BLOCK_SIZE_BYTES]);
    tx.set(&blocks.pack(&1u64), &vec![2; BLOCK_SIZE_BYTES]);
    tx.set(&blocks.pack(&2u64), &[3; 5]);
    tx.commit().await?;

    let tx = fdb::database()?.create_trx()?;
    let shrink = BLOCK_SIZE_BYTES as u64 + 3;
    for (index, size) in [shrink, size, size, BLOCK_SIZE_BYTES as u64, 0, u64::MAX]
        .into_iter()
        .enumerate()
    {
        let mutation = ObjectResource::apply_update(
            &tx,
            &session,
            UpdateOperation {
                object_id: object.object_id,
                size: Some(size),
                ..Default::default()
            },
        )
        .await?;
        let attr = mutation.object.context("missing file attributes")?;
        assert_eq!(attr.size, size);
        assert_eq!(
            (attr.attr_version, attr.content_version),
            (2 + index as u64, 2 + index as u64)
        );
        assert_eq!(attr.grants_version, object.grants_version);
        assert_eq!(attr.atime, object.atime_ms);
        assert_eq!(attr.mtime, attr.ctime);
        let file = FileResource::try_from(
            ObjectResource::fetch(&tx, tenant, &object.object_id)
                .await?
                .context("missing file")?,
        )?;
        if index == 1 {
            let data = file.read(&tx, 0, size as u32).await?;
            assert_eq!(&data[..BLOCK_SIZE_BYTES], &vec![1; BLOCK_SIZE_BYTES]);
            assert_eq!(&data[BLOCK_SIZE_BYTES..shrink as usize], &[2; 3]);
            assert!(data[shrink as usize..].iter().all(|byte| *byte == 0));
            assert!(tx.get(&blocks.pack(&2u64), false).await?.is_none());
        }
        if index == 3 {
            assert!(tx.get(&blocks.pack(&1u64), false).await?.is_none());
        }
        if index == 5 {
            assert!(tx.get(&blocks.pack(&0u64), false).await?.is_none());
            assert_eq!(file.read(&tx, u64::MAX - 3, 3).await?, vec![0; 3]);
        }
    }
    // Explicit mtime wins when combined with a resize; atime zero remains a supplied timestamp.
    let mutation = ObjectResource::apply_update(
        &tx,
        &session,
        UpdateOperation {
            object_id: object.object_id,
            size: Some(10),
            atime: Some(0),
            mtime: Some(42),
            ..Default::default()
        },
    )
    .await?;
    let attr = mutation.object.context("missing file attributes")?;
    assert_eq!((attr.atime, attr.mtime), (Some(0), Some(42)));
    tx.commit().await?;
    clear(tenant).await
}

pub(crate) async fn updates_conflict_with_grant_revocation() -> Result<()> {
    let (session, object) = fixture(0).await?;
    let tenant = &session.tenant;
    let tx = fdb::database()?.create_trx()?;
    let operation = UpdateOperation {
        object_id: object.object_id,
        mtime: Some(42),
        ..Default::default()
    };
    ObjectResource::apply_update(&tx, &session, operation.clone()).await?;
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
    let error: foundationdb::FdbError =
        tx.commit().await.err().context("expected conflict")?.into();
    assert_eq!(error.code(), 1020);
    let tx = fdb::database()?.create_trx()?;
    assert!(matches!(
        ObjectResource::apply_update(&tx, &session, operation).await,
        Err(storage::Error::Resource(object::Error::Forbidden))
    ));
    let stored = ObjectResource::fetch(&tx, tenant, &object.object_id)
        .await?
        .context("missing file")?;
    assert_eq!(stored.attr_version, object.attr_version);
    assert_eq!(stored.mtime_ms, object.mtime_ms);
    clear(tenant).await
}
