use std::net::SocketAddr;

use clap::Parser;
use dfs_api::{fdb, router};
use tokio::signal::unix::{SignalKind, signal};

#[derive(Parser)]
#[command(version, about = "dfs gRPC API")]
struct Config {
    #[arg(long, env = "DFS_LISTEN", default_value = "127.0.0.1:50051")]
    listen: SocketAddr,
    #[arg(long, env = "FDB_CLUSTER_FILE", default_value = "fdb.cluster")]
    fdb_cluster_file: String,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let config = Config::parse();
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .json()
        .init();

    let database = fdb::open(&config.fdb_cluster_file)?;
    fdb::ping(&database).await?;
    tracing::info!(cluster_file = %config.fdb_cluster_file, "connected to FoundationDB");

    tracing::info!(listen = %config.listen, "dfs-api listening");
    router()
        .serve_with_shutdown(config.listen, shutdown_signal())
        .await?;
    Ok(())
}

async fn shutdown_signal() {
    let terminate = async {
        match signal(SignalKind::terminate()) {
            Ok(mut stream) => {
                stream.recv().await;
            }
            Err(_) => std::future::pending::<()>().await,
        }
    };
    tokio::select! {
        _ = tokio::signal::ctrl_c() => {}
        _ = terminate => {}
    }
}
