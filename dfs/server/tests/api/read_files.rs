use anyhow::{Context, Result};
use dfs_api::storage::{
    fdb,
    resources::{
        file::BLOCK_SIZE_BYTES,
        keys::{namespace_subspace, tenant_subspace},
        object::ObjectResource,
        session::SessionResource,
        tenant::TenantResource,
    },
};
use dfs_protocol::{
    ObjectId, READ_FILES_MAX_OBJECTS, READ_MAX_BYTES,
    rpc::{
        AllowGrant, DenyGrant, ErrorCode, FileResult, Grant, GrantUpdate, ObjectKind,
        ReadFilesRequest, dfs_client::DfsClient, grant,
    },
};
use prost::Message;

use crate::{error_code, serve, with_authorization};

fn file(tenant: &TenantResource, size: u64) -> Result<ObjectResource> {
    let mut object = ObjectResource::new_root(tenant)?;
    object.object_id = ObjectId::new_v7();
    object.parent_id = Some(tenant.root_id);
    object.name = "content.txt".to_owned();
    object.kind = ObjectKind::File;
    object.size = size;
    Ok(object)
}

fn assert_error(result: &FileResult, expected: ErrorCode) -> Result<()> {
    assert!(result.object.is_none());
    assert!(result.data.is_none());
    assert_eq!(
        result.error.as_ref().context("missing error")?.code(),
        expected
    );
    Ok(())
}

pub(crate) async fn read_files_preserves_order_duplicates_and_per_file_errors() -> Result<()> {
    let mut client = DfsClient::new(serve().await?);
    let (tenant, _) = TenantResource::new(ObjectId::new_v7().to_string())?;
    let (session, session_key) = SessionResource::new(&tenant, vec!["reader".to_owned()])?;
    let authorization = format!("Bearer {session_key}");
    let deny = Grant {
        kind: Some(grant::Kind::Deny(DenyGrant { mode: 4 })),
    };
    let tx = fdb::database()?.create_trx()?;
    tenant.create(&tx).await?;
    session.create(&tx).await?;
    ObjectResource::new_root(&tenant)?
        .create(
            &tx,
            &[Grant {
                kind: Some(grant::Kind::Allow(AllowGrant {
                    subject: "reader".to_owned(),
                    mode: 6,
                })),
            }],
        )
        .await?;
    let content = file(&tenant, (BLOCK_SIZE_BYTES + 3) as u64)?;
    let empty = file(&tenant, 0)?;
    let broken = file(&tenant, 1)?;
    let hidden = file(&tenant, u64::from(READ_MAX_BYTES) + 1)?;
    let mut hidden_directory = file(&tenant, 0)?;
    hidden_directory.kind = ObjectKind::Directory;
    for object in [&content, &empty, &broken] {
        object.create(&tx, &[]).await?;
    }
    for object in [&hidden, &hidden_directory] {
        object.create(&tx, std::slice::from_ref(&deny)).await?;
    }
    let prefix = tenant_subspace(&tenant.tenant_id);
    tx.set(
        &prefix.pack(&("block", content.object_id.as_bytes().as_slice(), 0_u64)),
        &vec![b'a'; BLOCK_SIZE_BYTES],
    );
    tx.set(
        &prefix.pack(&("block", content.object_id.as_bytes().as_slice(), 1_u64)),
        b"end",
    );
    tx.set(
        &prefix.pack(&("block", broken.object_id.as_bytes().as_slice(), 0_u64)),
        &vec![0; BLOCK_SIZE_BYTES + 1],
    );
    // Optional metadata must not be loaded by ReadFiles.
    tx.set(
        &prefix.pack(&("metadata", content.object_id.as_bytes().as_slice())),
        &[0xff],
    );
    tx.commit().await?;

    let ids = vec![
        content.object_id,
        ObjectId::new_v7(),
        empty.object_id,
        hidden.object_id,
        content.object_id,
        tenant.root_id,
        broken.object_id,
        hidden_directory.object_id,
    ];
    let batch = client
        .read_files(with_authorization(
            ReadFilesRequest {
                object_ids: ids.clone(),
            },
            &authorization,
        )?)
        .await?
        .into_inner();
    assert_eq!(batch.results.len(), ids.len());
    for (result, id) in batch.results.iter().zip(&ids) {
        assert_eq!(&result.object_id, id);
    }
    let mut expected = vec![b'a'; BLOCK_SIZE_BYTES];
    expected.extend_from_slice(b"end");
    assert_eq!(batch.results[0].data.as_deref(), Some(expected.as_slice()));
    assert_eq!(batch.results[4], batch.results[0]);
    assert_eq!(batch.results[2].data.as_deref(), Some([].as_slice()));
    let attributes = batch.results[0]
        .object
        .as_ref()
        .context("missing attributes")?;
    assert_eq!(attributes.id, content.object_id.into());
    assert_eq!(attributes.name, content.name);
    assert_eq!(attributes.size, content.size);
    assert_eq!(attributes.mode, 0o600);
    assert!(attributes.store_version > 0);
    for index in [0, 2, 4] {
        let result = &batch.results[index];
        let object = result.object.as_ref().context("missing attributes")?;
        assert!(object.metadata.is_none());
        assert_eq!(object.store_version, attributes.store_version);
        assert!(result.error.is_none());
    }
    for (index, error) in [
        (1, ErrorCode::NotFound),
        (3, ErrorCode::NotFound),
        (5, ErrorCode::IsDirectory),
        (6, ErrorCode::Internal),
        (7, ErrorCode::NotFound),
    ] {
        assert_error(&batch.results[index], error)?;
    }

    for count in [0, READ_FILES_MAX_OBJECTS + 1] {
        let Err(status) = client
            .read_files(with_authorization(
                ReadFilesRequest {
                    object_ids: vec![empty.object_id; count],
                },
                &authorization,
            )?)
            .await
        else {
            anyhow::bail!("expected invalid batch length");
        };
        assert_eq!(error_code(&status)?, ErrorCode::InvalidInput);
    }

    // A fresh transaction must recheck grants even after the batch populated TreeHints.
    let tx = fdb::database()?.create_trx()?;
    let mut stored = ObjectResource::fetch(&tx, &tenant, &content.object_id)
        .await?
        .context("missing file")?;
    stored.update_grants(
        &tx,
        &[GrantUpdate {
            grant: deny,
            remove: false,
        }],
    )?;
    tx.commit().await?;
    let batch = client
        .read_files(with_authorization(
            ReadFilesRequest {
                object_ids: vec![content.object_id, empty.object_id],
            },
            &authorization,
        )?)
        .await?
        .into_inner();
    assert_error(&batch.results[0], ErrorCode::NotFound)?;
    assert!(batch.results[1].error.is_none());

    let tx = fdb::database()?.create_trx()?;
    SessionResource::revoke(&tx, &tenant, &session.session_id).await?;
    let (begin, end) = prefix.range();
    tx.clear_range(&begin, &end);
    tx.clear(&namespace_subspace().pack(&("tenant-key", tenant.key_hash.as_slice())));
    tx.commit().await?;
    Ok(())
}

pub(crate) async fn read_files_budgets_all_results_before_reading_blocks() -> Result<()> {
    let mut client = DfsClient::new(serve().await?);
    let (tenant, _) = TenantResource::new(ObjectId::new_v7().to_string())?;
    let (session, session_key) = SessionResource::new(&tenant, vec!["reader".to_owned()])?;
    let authorization = format!("Bearer {session_key}");
    let tx = fdb::database()?.create_trx()?;
    tenant.create(&tx).await?;
    session.create(&tx).await?;
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
    let full = file(&tenant, u64::from(READ_MAX_BYTES))?;
    // The remaining payload fits by itself, but the batch's trailing error results do not.
    let near_full = file(&tenant, u64::from(READ_MAX_BYTES) - 1024)?;
    let oversized = file(&tenant, u64::from(READ_MAX_BYTES) + 1)?;
    let empty = file(&tenant, 0)?;
    for object in [&full, &near_full, &oversized, &empty] {
        object.create(&tx, &[]).await?;
    }
    let prefix = tenant_subspace(&tenant.tenant_id);
    // Corrupt blocks prove that capacity-rejected files are never downloaded.
    for object in [&near_full, &oversized] {
        tx.set(
            &prefix.pack(&("block", object.object_id.as_bytes().as_slice(), 0_u64)),
            &vec![0; BLOCK_SIZE_BYTES + 1],
        );
    }
    tx.commit().await?;

    let mut ids = vec![full.object_id; 3];
    ids.extend([near_full.object_id, oversized.object_id, empty.object_id]);
    ids.resize(READ_FILES_MAX_OBJECTS, ObjectId::new_v7());
    let batch = client
        .read_files(with_authorization(
            ReadFilesRequest {
                object_ids: ids.clone(),
            },
            &authorization,
        )?)
        .await?
        .into_inner();
    assert_eq!(batch.results.len(), READ_FILES_MAX_OBJECTS);
    assert!(batch.encoded_len() <= 4 * 1024 * 1024);
    for (result, id) in batch.results.iter().zip(&ids) {
        assert_eq!(&result.object_id, id);
    }
    for result in &batch.results[..3] {
        assert!(result.error.is_none());
        let data = result.data.as_ref().context("missing file data")?;
        assert_eq!(data.len(), READ_MAX_BYTES as usize);
        assert!(data.iter().all(|byte| *byte == 0));
    }
    assert_error(&batch.results[3], ErrorCode::Capacity)?;
    assert_error(&batch.results[4], ErrorCode::Capacity)?;
    assert!(batch.results[5].error.is_none());
    assert_eq!(batch.results[5].data.as_deref(), Some([].as_slice()));
    for result in &batch.results[6..] {
        assert_error(result, ErrorCode::NotFound)?;
    }

    // Four 1 MiB files fit the raw data limit, but not the encoded response limit.
    let batch = client
        .read_files(with_authorization(
            ReadFilesRequest {
                object_ids: vec![full.object_id; 4],
            },
            &authorization,
        )?)
        .await?
        .into_inner();
    assert_eq!(batch.results.len(), 4);
    assert!(
        batch.results[..3]
            .iter()
            .all(|result| result.error.is_none())
    );
    assert_error(&batch.results[3], ErrorCode::Capacity)?;

    let tx = fdb::database()?.create_trx()?;
    SessionResource::revoke(&tx, &tenant, &session.session_id).await?;
    let (begin, end) = prefix.range();
    tx.clear_range(&begin, &end);
    tx.clear(&namespace_subspace().pack(&("tenant-key", tenant.key_hash.as_slice())));
    tx.commit().await?;
    Ok(())
}
