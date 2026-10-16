use anyhow::{Context, Result};
use dfs_api::storage::{
    self, fdb,
    resources::{
        file::{self, BLOCK_SIZE_BYTES, FileResource},
        keys::tenant_subspace,
        object::{self, ObjectResource},
        session::SessionResource,
        tenant::TenantResource,
    },
};
use dfs_protocol::{
    ObjectId, READ_MAX_BYTES,
    rpc::{AllowGrant, Grant, ObjectKind, grant},
};
use foundationdb::Transaction;

fn object(tenant: &TenantResource, size: u64) -> Result<ObjectResource> {
    let mut object = ObjectResource::new_root(tenant)?;
    object.object_id = ObjectId::new_v7();
    object.parent_id = Some(tenant.root_id);
    object.name = "content.txt".to_owned();
    object.kind = ObjectKind::File;
    object.size = size;
    Ok(object)
}

fn block_key(tenant: &TenantResource, id: ObjectId, index: u64) -> Vec<u8> {
    tenant_subspace(&tenant.tenant_id).pack(&("block", id.as_bytes().as_slice(), index))
}

async fn fetch(tx: &Transaction, tenant: &TenantResource, id: ObjectId) -> Result<FileResource> {
    Ok(FileResource::try_from(
        ObjectResource::fetch(tx, tenant, &id)
            .await?
            .context("missing file")?,
    )?)
}

pub(crate) async fn batch_reads_reject_invalid_ids_and_preserve_transaction_errors() -> Result<()> {
    let (tenant, _) = TenantResource::new(ObjectId::new_v7().to_string())?;
    let (session, _) = SessionResource::new(&tenant, vec!["reader".to_owned()])?;
    let tx = fdb::database()?.create_trx()?;
    tx.set_read_version(1);
    assert!(matches!(
        FileResource::read_batch_for_session(
            &tx,
            &session,
            &[ObjectId::new_v7(), ObjectId::default()],
            READ_MAX_BYTES as usize,
        )
        .await,
        Err(storage::Error::Resource(file::Error::Object(
            object::Error::InvalidId
        )))
    ));
    let Err(storage::Error::Transaction(error)) = FileResource::read_batch_for_session(
        &tx,
        &session,
        &[ObjectId::new_v7()],
        READ_MAX_BYTES as usize,
    )
    .await
    else {
        anyhow::bail!("expected a transaction failure, not a per-file error");
    };
    assert_eq!(error.get_fdb_error().map(|error| error.code()), Some(1007));
    Ok(())
}

pub(crate) async fn batch_reads_budget_only_data_and_preserve_per_file_errors() -> Result<()> {
    let (tenant, _) = TenantResource::new(ObjectId::new_v7().to_string())?;
    let (session, _) = SessionResource::new(&tenant, vec!["reader".to_owned()])?;
    let content = object(&tenant, 3)?;
    let broken = object(&tenant, 4)?;
    let empty = object(&tenant, 0)?;
    let oversized = object(&tenant, u64::from(READ_MAX_BYTES) + 1)?;
    let tx = fdb::database()?.create_trx()?;
    ObjectResource::new_root(&tenant)?
        .create(
            &tx,
            &[Grant {
                kind: Some(grant::Kind::Allow(AllowGrant {
                    subject: "reader".to_owned(),
                    mode: 4,
                })),
            }],
        )
        .await?;
    for object in [&content, &broken, &empty, &oversized] {
        object.create(&tx, &[]).await?;
    }
    tx.set(&block_key(&tenant, content.object_id, 0), b"abc");
    for object in [&broken, &oversized] {
        tx.set(
            &block_key(&tenant, object.object_id, 0),
            &vec![0; BLOCK_SIZE_BYTES + 1],
        );
    }
    tx.commit().await?;

    let tx = fdb::database()?.create_trx()?;
    let results = FileResource::read_batch_for_session(
        &tx,
        &session,
        &[
            broken.object_id,
            content.object_id,
            content.object_id,
            empty.object_id,
            oversized.object_id,
            ObjectId::new_v7(),
            tenant.root_id,
        ],
        3,
    )
    .await?;
    assert_eq!(results.len(), 7);
    // The corrupt first file cannot fit, leaving the exact data budget for the next file.
    for index in [0, 2, 4] {
        assert!(matches!(results[index], Err(file::Error::Capacity)));
    }
    let Ok((attributes, data)) = &results[1] else {
        anyhow::bail!("expected a file matching the exact data budget");
    };
    assert_eq!(attributes.id, content.object_id.into());
    assert_eq!(attributes.store_version, tx.get_read_version().await?);
    assert_eq!(data, b"abc");
    let Ok((attributes, data)) = &results[3] else {
        anyhow::bail!("expected an empty file after exhausting the budget");
    };
    assert_eq!(attributes.id, empty.object_id.into());
    assert!(data.is_empty());
    assert!(matches!(
        results[5],
        Err(file::Error::Object(object::Error::NotFound))
    ));
    assert!(matches!(results[6], Err(file::Error::IsDirectory)));

    let results = FileResource::read_batch_for_session(
        &tx,
        &session,
        &[content.object_id, empty.object_id],
        0,
    )
    .await?;
    assert!(matches!(results[0], Err(file::Error::Capacity)));
    assert!(matches!(&results[1], Ok((_, data)) if data.is_empty()));

    let results = FileResource::read_batch_for_session(
        &tx,
        &session,
        &[broken.object_id, empty.object_id],
        4,
    )
    .await?;
    assert!(matches!(results[0], Err(file::Error::InvalidBlock)));
    assert!(matches!(&results[1], Ok((_, data)) if data.is_empty()));

    let results = FileResource::read_batch_for_session(
        &tx,
        &session,
        &[oversized.object_id],
        READ_MAX_BYTES as usize + 1,
    )
    .await?;
    assert!(matches!(results[0], Err(file::Error::Capacity)));

    let (begin, end) = tenant_subspace(&tenant.tenant_id).range();
    tx.clear_range(&begin, &end);
    tx.commit().await?;
    Ok(())
}

pub(crate) async fn reads_clip_to_eof_and_zero_fill_sparse_and_short_blocks() -> Result<()> {
    let (tenant, _) = TenantResource::new(ObjectId::new_v7().to_string())?;
    let object = object(&tenant, (3 * BLOCK_SIZE_BYTES + 7) as u64)?;
    let tx = fdb::database()?.create_trx()?;
    object.create(&tx, &[]).await?;
    let first: Vec<_> = (0..BLOCK_SIZE_BYTES)
        .map(|index| (index % 251) as u8)
        .collect();
    // There is no write resource yet; seed content blocks directly.
    tx.set(&block_key(&tenant, object.object_id, 0), &first);
    tx.set(&block_key(&tenant, object.object_id, 1), b"abc");
    tx.set(
        &block_key(&tenant, object.object_id, 3),
        b"last bytes beyond EOF",
    );
    let file = FileResource::try_from(object)?;
    let mut expected = vec![0; file.object().size as usize];
    expected[..BLOCK_SIZE_BYTES].copy_from_slice(&first);
    expected[BLOCK_SIZE_BYTES..BLOCK_SIZE_BYTES + 3].copy_from_slice(b"abc");
    expected[3 * BLOCK_SIZE_BYTES..].copy_from_slice(b"last by");

    for (offset, length) in [
        (0, READ_MAX_BYTES),
        ((BLOCK_SIZE_BYTES - 2) as u64, (BLOCK_SIZE_BYTES + 8) as u32),
        ((BLOCK_SIZE_BYTES + 20) as u64, 30),
        ((3 * BLOCK_SIZE_BYTES + 2) as u64, 20),
        (file.object().size, 10),
        (u64::MAX, 10),
        (0, 0),
    ] {
        let start = offset.min(file.object().size) as usize;
        let end = (start + length as usize).min(expected.len());
        assert_eq!(file.read(&tx, offset, length).await?, expected[start..end]);
    }
    // Malformed blocks outside the requested range must not be read.
    tx.set(
        &block_key(&tenant, file.object().object_id, 2),
        &vec![0; BLOCK_SIZE_BYTES + 1],
    );
    assert_eq!(file.read(&tx, 0, 3).await?, first[..3]);
    assert!(file.read(&tx, 0, 0).await?.is_empty());
    assert!(file.read(&tx, u64::MAX, 1).await?.is_empty());
    Ok(())
}

pub(crate) async fn reads_preserve_tenant_scope_snapshot_and_attributes() -> Result<()> {
    let (tenant, _) = TenantResource::new(ObjectId::new_v7().to_string())?;
    let (other, _) = TenantResource::new(ObjectId::new_v7().to_string())?;
    let (session, _) = SessionResource::new(&tenant, vec!["reader".to_owned()])?;
    let (other_session, _) = SessionResource::new(&other, vec!["reader".to_owned()])?;
    let object = object(&tenant, 5)?;
    let mut foreign = self::object(&other, 5)?;
    foreign.object_id = object.object_id;
    let tx = fdb::database()?.create_trx()?;
    let grant = Grant {
        kind: Some(grant::Kind::Allow(AllowGrant {
            subject: "reader".to_owned(),
            mode: 4,
        })),
    };
    for tenant in [&tenant, &other] {
        ObjectResource::new_root(tenant)?
            .create(&tx, std::slice::from_ref(&grant))
            .await?;
    }
    object.create(&tx, &[]).await?;
    foreign.create(&tx, &[]).await?;
    let key = block_key(&tenant, object.object_id, 0);
    tx.set(&key, b"first");
    tx.set(&block_key(&other, object.object_id, 0), b"other");
    tx.commit().await?;

    let old = fdb::database()?.create_trx()?;
    let (file, attributes) =
        FileResource::fetch_for_session(&old, &session, &object.object_id).await?;
    let (foreign, _) =
        FileResource::fetch_for_session(&old, &other_session, &object.object_id).await?;
    assert_eq!(attributes.id, object.object_id.into());
    assert_eq!(attributes.store_version, old.get_read_version().await?);
    assert_eq!(attributes.mode, 0o400);
    assert!(attributes.metadata.is_none());
    let attrs_key = tenant_subspace(&tenant.tenant_id)
        .pack(&("object", object.object_id.as_bytes().as_slice()));
    let attrs = old
        .get(&attrs_key, false)
        .await?
        .context("missing attributes")?
        .to_vec();

    let update = fdb::database()?.create_trx()?;
    update.set(&key, b"new");
    let mut updated = ObjectResource::fetch(&update, &tenant, &object.object_id)
        .await?
        .context("missing file")?;
    updated.size = 3;
    updated.record_content_change(&update, 123)?;
    update.commit().await?;

    assert_eq!(file.read(&old, 0, 10).await?, b"first");
    assert_eq!(foreign.read(&old, 0, 10).await?, b"other");
    assert_eq!(file.object().size, 5);
    assert_eq!(file.object().content_version, 1);
    assert_eq!(attributes.size, file.object().size);
    assert_eq!(attributes.content_version, file.object().content_version);
    assert_eq!(
        old.get(&attrs_key, false)
            .await?
            .context("missing attributes")?
            .as_ref(),
        attrs
    );

    let fresh = fdb::database()?.create_trx()?;
    let (file, attributes) =
        FileResource::fetch_for_session(&fresh, &session, &object.object_id).await?;
    let before = fresh
        .get(&attrs_key, false)
        .await?
        .context("missing attributes")?
        .to_vec();
    assert_eq!(file.read(&fresh, 0, 10).await?, b"new");
    assert_eq!(file.object().content_version, 2);
    assert_eq!(attributes.size, 3);
    assert_eq!(attributes.content_version, 2);
    assert_eq!(attributes.store_version, fresh.get_read_version().await?);
    assert_eq!(
        fresh
            .get(&attrs_key, false)
            .await?
            .context("missing attributes")?
            .as_ref(),
        before
    );
    for tenant in [&tenant, &other] {
        let (begin, end) = tenant_subspace(&tenant.tenant_id).range();
        fresh.clear_range(&begin, &end);
    }
    fresh.commit().await?;
    Ok(())
}

pub(crate) async fn reads_validate_kind_length_blocks_and_handle_maximum_offsets() -> Result<()> {
    let (tenant, _) = TenantResource::new(ObjectId::new_v7().to_string())?;
    assert!(matches!(
        FileResource::try_from(ObjectResource::new_root(&tenant)?),
        Err(file::Error::IsDirectory)
    ));
    let mut symlink = ObjectResource::new_root(&tenant)?;
    symlink.kind = ObjectKind::Symlink;
    assert!(matches!(
        FileResource::try_from(symlink),
        Err(file::Error::UnsupportedKind)
    ));

    let object = object(&tenant, u64::MAX)?;
    let tx = fdb::database()?.create_trx()?;
    object.create(&tx, &[]).await?;
    let last = u64::MAX / BLOCK_SIZE_BYTES as u64;
    tx.set(
        &block_key(&tenant, object.object_id, last),
        &vec![7; BLOCK_SIZE_BYTES],
    );
    let file = FileResource::try_from(object)?;
    assert_eq!(file.read(&tx, u64::MAX - 3, 10).await?, [7; 3]);
    assert!(matches!(
        file.read(&tx, 0, READ_MAX_BYTES + 1).await,
        Err(storage::Error::Resource(file::Error::InvalidLength))
    ));
    tx.set(
        &block_key(&tenant, file.object().object_id, 0),
        &vec![0; BLOCK_SIZE_BYTES + 1],
    );
    assert!(matches!(
        file.read(&tx, 0, 1).await,
        Err(storage::Error::Resource(file::Error::InvalidBlock))
    ));
    Ok(())
}

pub(crate) async fn block_reads_conflict_with_concurrent_writes() -> Result<()> {
    let (tenant, _) = TenantResource::new(ObjectId::new_v7().to_string())?;
    let object = object(&tenant, 1)?;
    let tx = fdb::database()?.create_trx()?;
    object.create(&tx, &[]).await?;
    tx.commit().await?;

    let reader = fdb::database()?.create_trx()?;
    let file = fetch(&reader, &tenant, object.object_id).await?;
    assert_eq!(file.read(&reader, 0, 1).await?, [0]);
    let writer = fdb::database()?.create_trx()?;
    writer.set(&block_key(&tenant, object.object_id, 0), b"x");
    writer.commit().await?;
    reader.set(
        &tenant_subspace(&tenant.tenant_id).pack(&"read-test"),
        b"must conflict",
    );
    let Err(error) = reader.commit().await else {
        anyhow::bail!("expected block read conflict");
    };
    assert_eq!(foundationdb::FdbError::from(error).code(), 1020);

    let tx = fdb::database()?.create_trx()?;
    let (begin, end) = tenant_subspace(&tenant.tenant_id).range();
    tx.clear_range(&begin, &end);
    tx.commit().await?;
    Ok(())
}
