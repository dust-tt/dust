use anyhow::{Context, Result};
use dfs_api::storage::{
    fdb,
    resources::{
        file::{BLOCK_SIZE_BYTES, READ_MAX_BYTES},
        keys::{namespace_subspace, tenant_subspace},
        object::ObjectResource,
        session::SessionResource,
        tenant::TenantResource,
    },
};
use dfs_protocol::{
    ObjectId,
    rpc::{
        AllowGrant, DenyGrant, ErrorCode, Grant, GrantUpdate, ObjectKind, ReadRequest,
        dfs_client::DfsClient, grant,
    },
};

use crate::{error_code, serve, with_authorization};

pub(crate) async fn read_returns_ranges_attributes_and_conceals_inaccessible_objects() -> Result<()>
{
    let mut client = DfsClient::new(serve().await?);
    let (tenant, _) = TenantResource::new(ObjectId::new_v7().to_string())?;
    let (session, session_key) = SessionResource::new(&tenant, vec!["reader".to_owned()])?;
    let authorization = format!("Bearer {session_key}");
    let allow = Grant {
        kind: Some(grant::Kind::Allow(AllowGrant {
            subject: "reader".to_owned(),
            mode: 6,
        })),
    };
    let deny = Grant {
        kind: Some(grant::Kind::Deny(DenyGrant { mode: 4 })),
    };
    let tx = fdb::database()?.create_trx()?;
    tenant.create(&tx).await?;
    session.create(&tx).await?;
    ObjectResource::new_root(&tenant)?
        .create(&tx, std::slice::from_ref(&allow))
        .await?;
    let mut file = ObjectResource::new_root(&tenant)?;
    file.object_id = ObjectId::new_v7();
    file.parent_id = Some(tenant.root_id);
    file.name = "report.txt".to_owned();
    file.kind = ObjectKind::File;
    file.size = (BLOCK_SIZE_BYTES + 3) as u64;
    file.attr_version = 4;
    file.content_version = 3;
    file.grants_version = 2;
    file.create(&tx, &[]).await?;
    let prefix = tenant_subspace(&tenant.tenant_id);
    tx.set(
        &prefix.pack(&("block", file.object_id.as_bytes().as_slice(), 0_u64)),
        &vec![b'a'; BLOCK_SIZE_BYTES],
    );
    tx.set(
        &prefix.pack(&("block", file.object_id.as_bytes().as_slice(), 1_u64)),
        b"end",
    );
    // Read does not load optional metadata.
    tx.set(
        &prefix.pack(&("metadata", file.object_id.as_bytes().as_slice())),
        &[0xff],
    );
    let mut hidden_directory = ObjectResource::new_root(&tenant)?;
    hidden_directory.object_id = ObjectId::new_v7();
    hidden_directory.parent_id = Some(tenant.root_id);
    hidden_directory.name = "hidden".to_owned();
    hidden_directory
        .create(&tx, std::slice::from_ref(&deny))
        .await?;

    let (other, _) = TenantResource::new(ObjectId::new_v7().to_string())?;
    let (other_session, other_key) = SessionResource::new(&other, vec!["reader".to_owned()])?;
    other.create(&tx).await?;
    other_session.create(&tx).await?;
    ObjectResource::new_root(&other)?
        .create(&tx, &[allow])
        .await?;
    let mut other_file = ObjectResource::new_root(&other)?;
    other_file.object_id = file.object_id;
    other_file.parent_id = Some(other.root_id);
    other_file.name = "other.txt".to_owned();
    other_file.kind = ObjectKind::File;
    other_file.size = 5;
    other_file.create(&tx, &[]).await?;
    tx.set(
        &tenant_subspace(&other.tenant_id).pack(&(
            "block",
            file.object_id.as_bytes().as_slice(),
            0_u64,
        )),
        b"other",
    );
    tx.commit().await?;

    let request = ReadRequest {
        object_id: file.object_id,
        offset: (BLOCK_SIZE_BYTES - 2) as u64,
        length: 10,
    };
    let result = client
        .read(with_authorization(request.clone(), &authorization)?)
        .await?
        .into_inner();
    assert_eq!(result.data, b"aaend");
    let attrs = result.object;
    assert_eq!(attrs.id, file.object_id.into());
    assert_eq!(attrs.name, file.name);
    assert_eq!(attrs.kind(), ObjectKind::File);
    assert_eq!(attrs.size, file.size);
    assert_eq!(attrs.mode, 0o600);
    assert_eq!(
        (
            attrs.attr_version,
            attrs.content_version,
            attrs.grants_version
        ),
        (4, 3, 2)
    );
    assert_eq!(
        (attrs.atime, attrs.mtime, attrs.ctime),
        (file.atime_ms, file.mtime_ms, file.ctime_ms)
    );
    assert!(attrs.metadata.is_none());
    assert!(attrs.store_version > 0);

    for (offset, length) in [(file.size, 10), (u64::MAX, 10), (0, 0)] {
        let result = client
            .read(with_authorization(
                ReadRequest {
                    offset,
                    length,
                    ..request.clone()
                },
                &authorization,
            )?)
            .await?
            .into_inner();
        assert!(result.data.is_empty());
        assert_eq!(result.object.size, file.size);
    }
    let result = client
        .read(with_authorization(
            ReadRequest {
                offset: 0,
                length: 10,
                ..request.clone()
            },
            &format!("Bearer {other_key}"),
        )?)
        .await?
        .into_inner();
    assert_eq!(result.data, b"other");
    assert_eq!(result.object.name, "other.txt");

    for (object_id, length, expected) in [
        (tenant.root_id, 1, ErrorCode::IsDirectory),
        (hidden_directory.object_id, 0, ErrorCode::NotFound),
        (other.root_id, 1, ErrorCode::NotFound),
        (ObjectId::new_v7(), 1, ErrorCode::NotFound),
        (file.object_id, READ_MAX_BYTES + 1, ErrorCode::InvalidInput),
    ] {
        let Err(status) = client
            .read(with_authorization(
                ReadRequest {
                    object_id,
                    offset: 0,
                    length,
                },
                &authorization,
            )?)
            .await
        else {
            anyhow::bail!("expected {expected:?}");
        };
        assert_eq!(error_code(&status)?, expected);
    }

    // Revoke read access after the successful reads populated the grant cache.
    let tx = fdb::database()?.create_trx()?;
    let mut stored = ObjectResource::fetch(&tx, &tenant, &file.object_id)
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
    let Err(status) = client
        .read(with_authorization(request, &authorization)?)
        .await
    else {
        anyhow::bail!("expected revoked read to be concealed");
    };
    assert_eq!(error_code(&status)?, ErrorCode::NotFound);

    let tx = fdb::database()?.create_trx()?;
    for session in [&session, &other_session] {
        SessionResource::revoke(&tx, &session.tenant, &session.session_id).await?;
    }
    for tenant in [&tenant, &other] {
        let (begin, end) = tenant_subspace(&tenant.tenant_id).range();
        tx.clear_range(&begin, &end);
        tx.clear(&namespace_subspace().pack(&("tenant-key", tenant.key_hash.as_slice())));
    }
    tx.commit().await?;
    Ok(())
}
