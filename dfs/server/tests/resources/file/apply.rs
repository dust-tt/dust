use std::sync::atomic::{AtomicUsize, Ordering};

use dfs_api::storage::receipt::Receipt;
use dfs_protocol::rpc::{GrantUpdate, UpdateOperation, WriteOperation, operation::Operation};
use foundationdb::{RangeOption, options::StreamingMode};

use super::*;
use crate::object::allow;

async fn fixture(size: u64) -> Result<(SessionResource, ObjectResource)> {
    let (tenant, _) = TenantResource::new(ObjectId::new_v7().to_string())?;
    let tx = fdb::database()?.create_trx()?;
    ObjectResource::new_root(&tenant)?
        .create(
            &tx,
            &[
                allow("writer", 0o6),
                allow("reader", 0o4),
                allow("write-only", 0o2),
            ],
        )
        .await?;
    let mut object = object(&tenant, size)?;
    let metadata = object.metadata.as_mut().context("missing metadata")?;
    metadata.mime_type = Some("text/plain".to_owned());
    metadata
        .xattrs
        .insert("user.test".to_owned(), b"keep".to_vec());
    object.create(&tx, &[allow("other", 0o4)]).await?;
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

async fn records(tx: &Transaction, tenant: &TenantResource) -> Result<Vec<Vec<u8>>> {
    let range = RangeOption {
        mode: StreamingMode::WantAll,
        ..RangeOption::from(tenant_subspace(&tenant.tenant_id).range())
    };
    Ok(tx
        .get_range(&range, 1, false)
        .await?
        .iter()
        .flat_map(|entry| [entry.key().to_vec(), entry.value().to_vec()])
        .collect())
}

pub(crate) async fn writes_merge_blocks_and_preserve_unrelated_state() -> Result<()> {
    let (session, object) = fixture(0).await?;
    let tenant = &session.tenant;
    let tx = fdb::database()?.create_trx()?;
    let root_before = ObjectResource::fetch(&tx, tenant, &tenant.root_id)
        .await?
        .context("missing root")?;
    let grants_before = object.list_grants(&tx, None, 512).await?;
    let initial: Vec<_> = (0..2 * BLOCK_SIZE_BYTES + 10)
        .map(|index| (index % 251) as u8)
        .collect();
    let mut expected = vec![];
    let writes = [
        (0, initial),
        (
            (BLOCK_SIZE_BYTES - 3) as u64,
            vec![255; BLOCK_SIZE_BYTES + 8],
        ),
        ((2 * BLOCK_SIZE_BYTES + 20) as u64, b"tail".to_vec()),
        ((4 * BLOCK_SIZE_BYTES + 2) as u64, b"sparse".to_vec()),
        ((4 * BLOCK_SIZE_BYTES + 2) as u64, b"sparse".to_vec()),
        (u64::MAX, vec![]),
    ];
    for (index, (offset, data)) in writes.into_iter().enumerate() {
        if !data.is_empty() {
            expected.resize(expected.len().max(offset as usize + data.len()), 0);
            expected[offset as usize..offset as usize + data.len()].copy_from_slice(&data);
        }
        let mutation = FileResource::apply_write(
            &tx,
            &session,
            WriteOperation {
                object_id: object.object_id,
                offset,
                data,
                append: false,
            },
        )
        .await?;
        let attr = mutation.object.context("missing written file")?;
        assert_eq!(attr.size, expected.len() as u64);
        assert_eq!(
            (attr.attr_version, attr.content_version),
            (2 + index as u64, 2 + index as u64)
        );
        assert_eq!(attr.grants_version, object.grants_version);
        assert_eq!(attr.atime, object.atime_ms);
        assert_eq!(attr.mtime, attr.ctime);
        assert!(attr.ctime >= object.ctime_ms);
        assert_eq!(attr.mode, 0o600);
        assert_eq!(attr.store_version, tx.get_read_version().await?);
        assert!(attr.metadata.is_none());
        assert!(mutation.related.is_empty());
        assert_eq!(
            fetch(&tx, tenant, object.object_id)
                .await?
                .read(&tx, 0, READ_MAX_BYTES)
                .await?,
            expected
        );
    }
    assert!(
        tx.get(&block_key(tenant, object.object_id, 3), false)
            .await?
            .is_none()
    );
    tx.commit().await?;

    let tx = fdb::database()?.create_trx()?;
    let mut stored = ObjectResource::fetch(&tx, tenant, &object.object_id)
        .await?
        .context("missing file")?;
    assert_eq!(stored.parent_id, object.parent_id);
    assert_eq!(stored.name, object.name);
    assert_eq!(stored.list_grants(&tx, None, 512).await?, grants_before);
    stored.load_metadata(&tx).await?;
    let stored_metadata = stored.metadata.context("missing stored metadata")?;
    let original_metadata = object.metadata.context("missing original metadata")?;
    assert_eq!(
        stored_metadata.created_at_ms,
        original_metadata.created_at_ms
    );
    assert_eq!(stored_metadata.mime_type, original_metadata.mime_type);
    assert_eq!(stored_metadata.xattrs, original_metadata.xattrs);
    let root = ObjectResource::fetch(&tx, tenant, &tenant.root_id)
        .await?
        .context("missing root")?;
    assert_eq!(
        (root.attr_version, root.content_version),
        (root_before.attr_version, root_before.content_version)
    );
    assert_eq!(
        (root.mtime_ms, root.ctime_ms),
        (root_before.mtime_ms, root_before.ctime_ms)
    );
    assert_eq!(
        fetch(&tx, tenant, object.object_id)
            .await?
            .read(&tx, 0, READ_MAX_BYTES)
            .await?,
        expected
    );
    clear(tenant).await
}

pub(crate) async fn writes_reject_invalid_operations_without_staging_changes() -> Result<()> {
    let (session, object) = fixture((2 * BLOCK_SIZE_BYTES) as u64).await?;
    let tenant = &session.tenant;
    let tx = fdb::database()?.create_trx()?;
    let operation = WriteOperation {
        object_id: object.object_id,
        data: b"x".to_vec(),
        ..Default::default()
    };
    let before = records(&tx, tenant).await?;
    for subject in ["reader", "write-only", "no-access"] {
        let denied = SessionResource::new(tenant, vec![subject.to_owned()])?.0;
        assert!(matches!(
            FileResource::apply_write(&tx, &denied, operation.clone()).await,
            Err(storage::Error::Resource(file::Error::Object(
                object::Error::Forbidden
            )))
        ));
        assert_eq!(records(&tx, tenant).await?, before);
    }
    assert!(matches!(
        FileResource::apply_write(
            &tx,
            &session,
            WriteOperation {
                object_id: tenant.root_id,
                ..operation.clone()
            }
        )
        .await,
        Err(storage::Error::Resource(file::Error::IsDirectory))
    ));
    assert!(matches!(
        FileResource::apply_write(
            &tx,
            &session,
            WriteOperation {
                object_id: ObjectId::new_v7(),
                ..operation.clone()
            }
        )
        .await,
        Err(storage::Error::Resource(file::Error::Object(
            object::Error::NotFound
        )))
    ));
    assert!(matches!(
        FileResource::apply_write(
            &tx,
            &session,
            WriteOperation {
                offset: u64::MAX,
                ..operation.clone()
            }
        )
        .await,
        Err(storage::Error::Resource(file::Error::InvalidRange))
    ));
    let (other, _) = fixture(0).await?;
    assert!(matches!(
        FileResource::apply_write(&tx, &other, operation.clone()).await,
        Err(storage::Error::Resource(file::Error::Object(
            object::Error::NotFound
        )))
    ));
    assert_eq!(records(&tx, tenant).await?, before);

    // A bad final boundary must not leave the earlier, fully overwritten block staged.
    tx.set(
        &block_key(tenant, object.object_id, 1),
        &vec![0; BLOCK_SIZE_BYTES + 1],
    );
    let before = records(&tx, tenant).await?;
    assert!(matches!(
        FileResource::apply_write(
            &tx,
            &session,
            WriteOperation {
                data: vec![1; BLOCK_SIZE_BYTES + 1],
                ..operation.clone()
            }
        )
        .await,
        Err(storage::Error::Resource(file::Error::InvalidBlock))
    ));
    assert_eq!(records(&tx, tenant).await?, before);

    // Fully overwritten blocks need no old contents, even when the old block is malformed.
    FileResource::apply_write(
        &tx,
        &session,
        WriteOperation {
            offset: BLOCK_SIZE_BYTES as u64,
            data: vec![2; BLOCK_SIZE_BYTES],
            ..operation.clone()
        },
    )
    .await?;
    let mutation = FileResource::apply_write(
        &tx,
        &session,
        WriteOperation {
            offset: u64::MAX - 1,
            ..operation.clone()
        },
    )
    .await?;
    assert_eq!(
        mutation.object.context("missing attributes")?.size,
        u64::MAX
    );
    assert_eq!(
        fetch(&tx, tenant, object.object_id)
            .await?
            .read(&tx, u64::MAX - 2, 2)
            .await?,
        b"\0x"
    );
    let before = records(&tx, tenant).await?;
    assert!(matches!(
        FileResource::apply_write(
            &tx,
            &session,
            WriteOperation {
                append: true,
                ..operation
            }
        )
        .await,
        Err(storage::Error::Resource(file::Error::InvalidRange))
    ));
    assert_eq!(records(&tx, tenant).await?, before);
    tx.commit().await?;
    clear(&other.tenant).await?;
    clear(tenant).await
}

pub(crate) async fn writes_replay_append_results_and_follow_truncation() -> Result<()> {
    let (session, object) = fixture(9).await?;
    let tenant = &session.tenant;
    let tx = fdb::database()?.create_trx()?;
    tx.set(&block_key(tenant, object.object_id, 0), b"old bytes");
    tx.commit().await?;
    let operations = vec![
        Operation::Update(UpdateOperation {
            object_id: object.object_id,
            size: Some(0),
            ..Default::default()
        }),
        Operation::Write(WriteOperation {
            object_id: object.object_id,
            data: b"new".to_vec(),
            ..Default::default()
        }),
        Operation::Write(WriteOperation {
            object_id: object.object_id,
            offset: u64::MAX,
            data: b"!".to_vec(),
            append: true,
        }),
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
        for (index, mutation) in result.0.iter().enumerate() {
            let attr = mutation
                .object
                .as_ref()
                .context("missing file attributes")?;
            assert_eq!(attr.size, [0, 3, 4][index]);
            assert_eq!(
                (attr.attr_version, attr.content_version),
                (2 + index as u64, 2 + index as u64)
            );
        }
        if let Some(original) = &original {
            assert_eq!(&result, original);
        } else {
            original = Some(result);
        }
    }
    assert_eq!(calls.load(Ordering::Relaxed), 1);
    let tx = fdb::database()?.create_trx()?;
    let file = fetch(&tx, tenant, object.object_id).await?;
    assert_eq!(file.read(&tx, 0, READ_MAX_BYTES).await?, b"new!");
    assert_eq!(
        (file.object().attr_version, file.object().content_version),
        (4, 4)
    );
    clear(tenant).await
}

pub(crate) async fn writes_conflict_with_concurrent_append_and_grant_revocation() -> Result<()> {
    let (session, object) = fixture(0).await?;
    let tenant = &session.tenant;
    let operation = WriteOperation {
        object_id: object.object_id,
        append: true,
        data: b"x".to_vec(),
        ..Default::default()
    };
    let first = fdb::database()?.create_trx()?;
    let second = fdb::database()?.create_trx()?;
    FileResource::apply_write(&first, &session, operation.clone()).await?;
    FileResource::apply_write(&second, &session, operation.clone()).await?;
    first.commit().await?;
    let error: foundationdb::FdbError = second
        .commit()
        .await
        .err()
        .context("expected append conflict")?
        .into();
    assert_eq!(error.code(), 1020);
    let retry = fdb::database()?.create_trx()?;
    FileResource::apply_write(&retry, &session, operation.clone()).await?;
    retry.commit().await?;

    let tx = fdb::database()?.create_trx()?;
    FileResource::apply_write(&tx, &session, operation.clone()).await?;
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
    let error: foundationdb::FdbError = tx
        .commit()
        .await
        .err()
        .context("expected authorization conflict")?
        .into();
    assert_eq!(error.code(), 1020);
    let tx = fdb::database()?.create_trx()?;
    assert!(matches!(
        FileResource::apply_write(&tx, &session, operation).await,
        Err(storage::Error::Resource(file::Error::Object(
            object::Error::Forbidden
        )))
    ));
    assert_eq!(
        fetch(&tx, tenant, object.object_id)
            .await?
            .read(&tx, 0, READ_MAX_BYTES)
            .await?,
        b"xx"
    );
    clear(tenant).await
}
