use anyhow::{Context, Result};
use dfs_api::{
    auth::hash_key,
    storage::{
        fdb,
        resources::keys::{namespace_subspace, tenant_subspace},
    },
};
use dfs_protocol::{
    ObjectId,
    rpc::{CreateTenantRequest, ErrorCode, Grant, dfs_client::DfsClient},
};

use crate::{MASTER_KEY, error_code, serve, with_authorization};

pub(crate) async fn tenant_creation_persists_root_and_rejects_duplicates() -> Result<()> {
    let mut client = DfsClient::new(serve().await?);
    let authorization = format!("Bearer {MASTER_KEY}");
    let request = CreateTenantRequest {
        tenant_id: ObjectId::new_v7().to_string(),
        root_grants: vec![],
    };
    let tenant = client
        .create_tenant(with_authorization(request.clone(), &authorization)?)
        .await?
        .into_inner();
    let subspace = tenant_subspace(&tenant.tenant_id);
    let object_key = subspace.pack(&("object", tenant.root_id.as_bytes().as_slice()));
    let metadata_key = subspace.pack(&("metadata", tenant.root_id.as_bytes().as_slice()));
    let tx = fdb::database()?.create_trx()?;
    let root = tx.get(&object_key, false).await?.context("missing root")?;
    let metadata = tx
        .get(&metadata_key, false)
        .await?
        .context("missing root metadata")?;

    let error = client
        .create_tenant(with_authorization(request, &authorization)?)
        .await
        .err()
        .context("expected duplicate tenant creation to fail")?;
    assert_eq!(error_code(&error)?, ErrorCode::AlreadyExists);

    let tx = fdb::database()?.create_trx()?;
    assert_eq!(
        tx.get(&object_key, false).await?.as_deref(),
        Some(root.as_ref())
    );
    assert_eq!(
        tx.get(&metadata_key, false).await?.as_deref(),
        Some(metadata.as_ref())
    );
    let (begin, end) = subspace.range();
    tx.clear_range(&begin, &end);
    tx.clear(&namespace_subspace().pack(&("tenant-key", hash_key(&tenant.tenant_key).as_slice())));
    tx.commit().await?;
    Ok(())
}

pub(crate) async fn dfs_rejects_invalid_tenant_creation() -> Result<()> {
    let mut client = DfsClient::new(serve().await?);
    let authorization = format!("Bearer {MASTER_KEY}");
    let inputs = [
        (String::new(), vec![]),
        ("é".repeat(129), vec![]),
        ("tenant\0suffix".to_owned(), vec![]),
        ("tenant".to_owned(), vec![Grant::default()]),
    ];

    for (tenant_id, root_grants) in inputs {
        let Err(status) = client
            .create_tenant(with_authorization(
                CreateTenantRequest {
                    tenant_id,
                    root_grants,
                },
                &authorization,
            )?)
            .await
        else {
            anyhow::bail!("expected INVALID_INPUT for invalid tenant creation");
        };
        assert_eq!(error_code(&status)?, ErrorCode::InvalidInput);
        assert_eq!(status.code(), tonic::Code::InvalidArgument);
        assert_eq!(status.message(), "Invalid input.");
    }
    Ok(())
}
