use std::time::{Duration, Instant};

use anyhow::Result;
use dfs_api::{fdb, router};
use dfs_protocol::{
    ObjectId,
    rpc::{
        ApplyRequest, CreateSessionRequest, CreateTenantRequest, Empty, ErrorCode, ErrorDetails,
        ListGrantsRequest, ListRequest, LookupRequest, ReadFilesRequest, ReadRequest,
        SearchRequest, StatRequest, UpdateGrantsRequest, ValidateRequest, dfs_client::DfsClient,
    },
};
use prost::Message;
use tokio::net::TcpListener;
use tokio_stream::wrappers::TcpListenerStream;
use tonic::{Code, Request, Status, transport::Channel};
use tonic_health::pb::{
    HealthCheckRequest, health_check_response::ServingStatus, health_client::HealthClient,
};

/// Same lookup as the server: dust-hive envs export their own cluster file through `env.sh`.
fn cluster_file() -> String {
    std::env::var("FDB_CLUSTER_FILE").unwrap_or_else(|_| "fdb.cluster".to_owned())
}

#[tokio::test]
async fn fdb_answers_a_transaction() -> Result<()> {
    let database = fdb::open(&cluster_file())?;

    fdb::ping(&database).await?;
    Ok(())
}

#[tokio::test]
async fn ping_fails_instead_of_hanging_when_fdb_is_unreachable() -> Result<()> {
    let cluster_file =
        std::env::temp_dir().join(format!("dfs-unreachable-{}.cluster", std::process::id()));
    std::fs::write(&cluster_file, "test:test@127.0.0.1:1\n")?;
    let database = fdb::open(&cluster_file.to_string_lossy())?;
    let started = Instant::now();

    let result = fdb::ping(&database).await;

    std::fs::remove_file(&cluster_file)?;
    assert!(result.is_err());
    assert!(started.elapsed() < Duration::from_secs(10));
    Ok(())
}

async fn serve() -> Result<Channel> {
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let address = listener.local_addr()?;
    tokio::spawn(async move {
        let _ = router()
            .serve_with_incoming(TcpListenerStream::new(listener))
            .await;
    });
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

#[tokio::test]
async fn health_service_reports_serving() -> Result<()> {
    let mut client = HealthClient::new(serve().await?);

    let response = client
        .check(HealthCheckRequest {
            service: String::new(),
        })
        .await?
        .into_inner();

    assert_eq!(response.status(), ServingStatus::Serving);
    Ok(())
}

#[tokio::test]
async fn dfs_rejects_a_request_without_authorization_as_unauthenticated() -> Result<()> {
    let mut client = DfsClient::new(serve().await?);

    let Err(status) = client.current_session(Empty {}).await else {
        anyhow::bail!("expected UNAUTHENTICATED");
    };

    assert_eq!(status.code(), Code::Unauthenticated);
    assert_eq!(error_code(&status)?, ErrorCode::Unauthenticated);
    Ok(())
}

#[tokio::test]
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

#[tokio::test]
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
            .close_session(with_authorization(Empty {}, auth)?)
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
