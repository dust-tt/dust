use std::time::Duration;

use anyhow::{Context, Result};
use dfs_api::{
    auth::hash_key,
    storage::{
        fdb,
        resources::{
            keys::{namespace_subspace, tenant_subspace},
            tenant::TenantResource,
        },
    },
};
use dfs_protocol::{
    ObjectId,
    rpc::{
        CreateSessionRequest, CreateTenantRequest, ErrorCode, ListGrantsRequest,
        RevokeSessionRequest, UpdateGrantsRequest, dfs_client::DfsClient,
    },
};
use tokio::{net::TcpListener, time::sleep};
use tonic::transport::Channel;

use crate::{MASTER_KEY, error_code, serve, with_authorization};

const CACHE_EXPIRY_TEST_INTERVAL: Duration = Duration::from_secs(16);

pub(crate) async fn tenant_key_cache_is_shared_across_connections_and_expires() -> Result<()> {
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let endpoint = format!("http://{}", listener.local_addr()?);
    tokio::spawn(dfs_api::serve(listener, MASTER_KEY, std::future::pending()));
    let mut client = DfsClient::new(Channel::from_shared(endpoint.clone())?.connect().await?);
    let master_authorization = format!("Bearer {MASTER_KEY}");
    let tenant = client
        .create_tenant(with_authorization(
            CreateTenantRequest {
                tenant_id: ObjectId::new_v7().to_string(),
                root_grants: vec![],
            },
            &master_authorization,
        )?)
        .await?
        .into_inner();
    let tenant_authorization = format!("Bearer {}", tenant.tenant_key);
    let (other, other_key) = TenantResource::new(ObjectId::new_v7().to_string())?;
    let other_authorization = format!("Bearer {other_key}");

    // The master key must not authorize tenant calls on the same connection.
    let error = client
        .create_session(with_authorization(
            CreateSessionRequest::default(),
            &master_authorization,
        )?)
        .await
        .err()
        .context("master key must not authorize a tenant call")?;
    assert_eq!(error_code(&error)?, ErrorCode::Unauthenticated);

    // Each tenant-key RPC must authenticate before returning its current stub response.
    for (authorization, expected) in [
        (&tenant_authorization, ErrorCode::Unsupported),
        (&other_authorization, ErrorCode::Unauthenticated),
    ] {
        let errors = [
            client
                .create_session(with_authorization(
                    CreateSessionRequest::default(),
                    authorization,
                )?)
                .await
                .err()
                .context("create session is not implemented")?,
            client
                .revoke_session(with_authorization(
                    RevokeSessionRequest::default(),
                    authorization,
                )?)
                .await
                .err()
                .context("revoke session is not implemented")?,
            client
                .list_grants(with_authorization(
                    ListGrantsRequest {
                        object_id: tenant.root_id,
                        after: None,
                        limit: 1,
                    },
                    authorization,
                )?)
                .await
                .err()
                .context("list grants is not implemented")?,
            client
                .update_grants(with_authorization(
                    UpdateGrantsRequest {
                        object_id: tenant.root_id,
                        changes: vec![],
                    },
                    authorization,
                )?)
                .await
                .err()
                .context("update grants is not implemented")?,
        ];
        for error in errors {
            assert_eq!(error_code(&error)?, expected);
        }
    }

    // A previous failure must not prevent authentication after the key is created.
    fdb::with_transaction(|tx| {
        let other = &other;
        async move { other.create(&tx).await }
    })
    .await?;
    let error = client
        .create_session(with_authorization(
            CreateSessionRequest::default(),
            &other_authorization,
        )?)
        .await
        .err()
        .context("create session is not implemented")?;
    assert_eq!(error_code(&error)?, ErrorCode::Unsupported);

    // Cached tenant authentication must not authorize tenant creation.
    for authorization in [&tenant_authorization, &other_authorization] {
        let error = client
            .create_tenant(with_authorization(
                CreateTenantRequest::default(),
                authorization,
            )?)
            .await
            .err()
            .context("tenant keys must not authorize tenant creation")?;
        assert_eq!(error_code(&error)?, ErrorCode::Unauthenticated);
    }
    let error = client
        .create_session(CreateSessionRequest::default())
        .await
        .err()
        .context("cached authentication still requires a bearer")?;
    assert_eq!(error_code(&error)?, ErrorCode::Unauthenticated);

    // Remove the records to prove connections share cached tenants within an API instance.
    let tenant_hash = hash_key(&tenant.tenant_key);
    fdb::database()?
        .run(|tx, _| {
            let tenant_id = &tenant.tenant_id;
            let other = &other;
            async move {
                for (id, hash) in [
                    (tenant_id, &tenant_hash),
                    (&other.tenant_id, &other.key_hash),
                ] {
                    let (begin, end) = tenant_subspace(id).range();
                    tx.clear_range(&begin, &end);
                    tx.clear(&namespace_subspace().pack(&("tenant-key", hash.as_slice())));
                }
                Ok(())
            }
        })
        .await?;
    let mut reconnected = DfsClient::new(Channel::from_shared(endpoint)?.connect().await?);
    let mut fresh_instance = DfsClient::new(serve().await?);
    for authorization in [&tenant_authorization, &other_authorization] {
        let cached = client
            .create_session(with_authorization(
                CreateSessionRequest::default(),
                authorization,
            )?)
            .await
            .err()
            .context("create session is not implemented")?;
        assert_eq!(error_code(&cached)?, ErrorCode::Unsupported);
        let shared = reconnected
            .create_session(with_authorization(
                CreateSessionRequest::default(),
                authorization,
            )?)
            .await
            .err()
            .context("create session is not implemented")?;
        assert_eq!(error_code(&shared)?, ErrorCode::Unsupported);
        let fresh = fresh_instance
            .create_session(with_authorization(
                CreateSessionRequest::default(),
                authorization,
            )?)
            .await
            .err()
            .context("deleted key must fail on a fresh API instance")?;
        assert_eq!(error_code(&fresh)?, ErrorCode::Unauthenticated);
    }

    // Hits after 16 seconds must not extend the 30-second expiry: both keys fail after 32 seconds.
    for expected in [ErrorCode::Unsupported, ErrorCode::Unauthenticated] {
        sleep(CACHE_EXPIRY_TEST_INTERVAL).await;
        for authorization in [&tenant_authorization, &other_authorization] {
            let error = reconnected
                .create_session(with_authorization(
                    CreateSessionRequest::default(),
                    authorization,
                )?)
                .await
                .err()
                .context("expected an authentication error or unimplemented session creation")?;
            assert_eq!(error_code(&error)?, expected);
        }
    }
    Ok(())
}
