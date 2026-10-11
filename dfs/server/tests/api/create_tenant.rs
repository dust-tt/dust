use anyhow::Result;
use dfs_protocol::rpc::{CreateTenantRequest, ErrorCode, Grant, dfs_client::DfsClient};

use crate::{MASTER_KEY, error_code, serve, with_authorization};

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
