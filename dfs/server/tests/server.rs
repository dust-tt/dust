use std::time::{Duration, Instant};

use anyhow::Result;
use dfs_api::{fdb, router};
use tokio::net::TcpListener;
use tokio_stream::wrappers::TcpListenerStream;
use tonic::transport::Channel;
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

#[tokio::test]
async fn health_service_reports_serving() -> Result<()> {
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let address = listener.local_addr()?;
    tokio::spawn(async move {
        let _ = router()
            .serve_with_incoming(TcpListenerStream::new(listener))
            .await;
    });
    let channel = Channel::from_shared(format!("http://{address}"))?
        .connect()
        .await?;
    let mut client = HealthClient::new(channel);

    let response = client
        .check(HealthCheckRequest {
            service: String::new(),
        })
        .await?
        .into_inner();

    assert_eq!(response.status(), ServingStatus::Serving);
    Ok(())
}
