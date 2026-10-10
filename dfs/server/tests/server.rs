use std::time::Duration;

use anyhow::{Context, Result};
use dfs_protocol::rpc::{Empty, ErrorCode, ErrorDetails, dfs_client::DfsClient};
use prost::Message;
use tokio::{net::TcpListener, sync::oneshot, time::timeout};
use tonic::{Request, Status, transport::Channel};
use tonic_health::pb::{
    HealthCheckRequest, health_check_response::ServingStatus, health_client::HealthClient,
};

mod api;

const MASTER_KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

async fn serve() -> Result<Channel> {
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let address = listener.local_addr()?;
    tokio::spawn(dfs_api::serve(listener, MASTER_KEY, std::future::pending()));
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
        dfs_rejects_a_missing_or_malformed_authorization_as_unauthenticated().await?;
        api::create_tenant::dfs_rejects_invalid_tenant_creation().await?;
        api::auth::tenant_key_cache_is_shared_across_connections_and_expires().await
    })
}

async fn health_checks_and_shutdown_work_without_authorization() -> Result<()> {
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let address = listener.local_addr()?;
    let (stop, stopped) = oneshot::channel();
    let server = tokio::spawn(dfs_api::serve(listener, MASTER_KEY, async {
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

async fn dfs_rejects_a_missing_or_malformed_authorization_as_unauthenticated() -> Result<()> {
    let mut client = DfsClient::new(serve().await?);
    let key = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    let Err(missing) = client.current_session(Empty {}).await else {
        anyhow::bail!("expected UNAUTHENTICATED without authorization");
    };
    assert_eq!(error_code(&missing)?, ErrorCode::Unauthenticated);

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
