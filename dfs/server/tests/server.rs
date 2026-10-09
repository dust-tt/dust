use std::time::Duration;

use anyhow::{Context, Result};
use dfs_protocol::{
    ObjectId,
    rpc::{
        ApplyRequest, CreateSessionRequest, CreateTenantRequest, Empty, ErrorCode, ErrorDetails,
        ListGrantsRequest, ListRequest, LookupRequest, ReadFilesRequest, ReadRequest,
        RevokeSessionRequest, SearchRequest, StatRequest, UpdateGrantsRequest, ValidateRequest,
        dfs_client::DfsClient,
    },
};
use prost::Message;
use tokio::{net::TcpListener, sync::oneshot, time::timeout};
use tonic::{Code, Request, Status, transport::Channel};
use tonic_health::pb::{
    HealthCheckRequest, health_check_response::ServingStatus, health_client::HealthClient,
};

async fn serve() -> Result<Channel> {
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let address = listener.local_addr()?;
    tokio::spawn(dfs_api::serve(listener, std::future::pending()));
    Ok(Channel::from_shared(format!("http://{address}"))?
        .connect()
        .await?)
}

fn error_code(status: &Status) -> Result<ErrorCode> {
    Ok(ErrorDetails::decode(status.details())?.code())
}

fn with_authorization<T>(message: T, authorization: &str) -> Result<Request<T>> {
    let mut request = Request::new(message);
    request
        .metadata_mut()
        .insert("authorization", authorization.parse()?);
    Ok(request)
}

const WELL_FORMED_AUTHORIZATION: &str =
    "Bearer 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const SHUTDOWN_TEST_DEADLINE: Duration = Duration::from_secs(5);

/// The FDB network boots once per process and cannot restart once stopped, so every server check
/// runs under this one test, which holds the guard and drops it before the binary exits.
#[test]
fn server() -> Result<()> {
    // SAFETY: the only `boot` in this test binary; `_network` is dropped when this test returns.
    #[allow(unsafe_code)]
    let _network = unsafe { foundationdb::boot() };
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?;

    runtime.block_on(async {
        health_checks_and_shutdown_work_without_authorization().await?;
        dfs_rejects_oversized_requests().await?;
        dfs_rejects_a_request_without_authorization_as_unauthenticated().await?;
        dfs_rejects_a_malformed_authorization_as_unauthenticated().await?;
        every_dfs_rpc_answers_unsupported_to_an_authenticated_request().await
    })
}

async fn health_checks_and_shutdown_work_without_authorization() -> Result<()> {
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let address = listener.local_addr()?;
    let (stop, stopped) = oneshot::channel();
    let server = tokio::spawn(dfs_api::serve(listener, async {
        let _ = stopped.await;
    }));
    let channel = Channel::from_shared(format!("http://{address}"))?
        .connect()
        .await?;
    let mut client = HealthClient::new(channel);
    let mut watches = Vec::new();

    for service in ["", "dfs.v1.Dfs"] {
        let request = HealthCheckRequest {
            service: service.to_owned(),
        };
        let response = client.check(request.clone()).await?.into_inner();
        assert_eq!(response.status(), ServingStatus::Serving);
        let mut watch = client.watch(request).await?.into_inner();
        assert_eq!(
            watch
                .message()
                .await?
                .context("health stream ended")?
                .status(),
            ServingStatus::Serving
        );
        watches.push(watch);
    }

    stop.send(())
        .map_err(|_| anyhow::anyhow!("server stopped"))?;
    for watch in &mut watches {
        assert_eq!(
            timeout(SHUTDOWN_TEST_DEADLINE, watch.message())
                .await??
                .context("health stream ended before shutdown notification")?
                .status(),
            ServingStatus::NotServing
        );
    }
    drop(watches);
    drop(client);
    timeout(SHUTDOWN_TEST_DEADLINE, server).await???;

    Ok(())
}

async fn dfs_rejects_oversized_requests() -> Result<()> {
    let mut client = DfsClient::new(serve().await?);
    let error = client
        .create_tenant(with_authorization(
            CreateTenantRequest {
                tenant_id: "x".repeat(dfs_api::MAX_MESSAGE_SIZE + 1),
                ..Default::default()
            },
            WELL_FORMED_AUTHORIZATION,
        )?)
        .await
        .err()
        .context("oversized request unexpectedly succeeded")?;

    assert_eq!(error.code(), Code::OutOfRange);
    Ok(())
}

async fn dfs_rejects_a_request_without_authorization_as_unauthenticated() -> Result<()> {
    let mut client = DfsClient::new(serve().await?);

    let Err(status) = client.current_session(Empty {}).await else {
        anyhow::bail!("expected UNAUTHENTICATED");
    };

    assert_eq!(status.code(), Code::Unauthenticated);
    assert_eq!(error_code(&status)?, ErrorCode::Unauthenticated);
    Ok(())
}

async fn dfs_rejects_a_malformed_authorization_as_unauthenticated() -> Result<()> {
    let mut client = DfsClient::new(serve().await?);
    let key = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    let malformed = [
        format!("Basic {key}"),
        format!("Bearer {}", &key[1..]),
        format!("Bearer {key}0"),
        "Bearer ".to_owned(),
    ];

    for authorization in malformed {
        let Err(status) = client
            .current_session(with_authorization(Empty {}, &authorization)?)
            .await
        else {
            anyhow::bail!("expected UNAUTHENTICATED for {authorization:?}");
        };
        assert_eq!(
            error_code(&status)?,
            ErrorCode::Unauthenticated,
            "{authorization:?}"
        );
    }
    Ok(())
}

async fn every_dfs_rpc_answers_unsupported_to_an_authenticated_request() -> Result<()> {
    let mut client = DfsClient::new(serve().await?);
    let auth = WELL_FORMED_AUTHORIZATION;
    let object_id = ObjectId::new_v7();

    let results = [
        client
            .create_tenant(with_authorization(CreateTenantRequest::default(), auth)?)
            .await
            .map(drop),
        client
            .create_session(with_authorization(CreateSessionRequest::default(), auth)?)
            .await
            .map(drop),
        client
            .current_session(with_authorization(Empty {}, auth)?)
            .await
            .map(drop),
        client
            .revoke_session(with_authorization(
                RevokeSessionRequest {
                    session_id: "session".into(),
                },
                auth,
            )?)
            .await
            .map(drop),
        client
            .refresh_session(with_authorization(Empty {}, auth)?)
            .await
            .map(drop),
        client
            .list_grants(with_authorization(
                ListGrantsRequest {
                    object_id,
                    ..Default::default()
                },
                auth,
            )?)
            .await
            .map(drop),
        client
            .update_grants(with_authorization(
                UpdateGrantsRequest {
                    object_id,
                    ..Default::default()
                },
                auth,
            )?)
            .await
            .map(drop),
        client
            .stat(with_authorization(StatRequest::default(), auth)?)
            .await
            .map(drop),
        client
            .lookup(with_authorization(LookupRequest::default(), auth)?)
            .await
            .map(drop),
        client
            .list(with_authorization(ListRequest::default(), auth)?)
            .await
            .map(drop),
        client
            .read(with_authorization(
                ReadRequest {
                    object_id,
                    ..Default::default()
                },
                auth,
            )?)
            .await
            .map(drop),
        client
            .read_files(with_authorization(ReadFilesRequest::default(), auth)?)
            .await
            .map(drop),
        client
            .validate(with_authorization(ValidateRequest::default(), auth)?)
            .await
            .map(drop),
        client
            .apply(with_authorization(ApplyRequest::default(), auth)?)
            .await
            .map(drop),
        client
            .search(with_authorization(SearchRequest::default(), auth)?)
            .await
            .map(drop),
    ];

    for (index, result) in results.into_iter().enumerate() {
        let Err(status) = result else {
            anyhow::bail!("RPC #{index} succeeded, expected UNSUPPORTED");
        };
        assert_eq!(status.code(), Code::Unimplemented, "RPC #{index}");
        assert_eq!(error_code(&status)?, ErrorCode::Unsupported, "RPC #{index}");
    }
    Ok(())
}
