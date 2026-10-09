use std::net::SocketAddr;

use clap::Parser;
use dfs_api::{fdb, serve};
use tokio::{
    net::TcpListener,
    signal::unix::{SignalKind, signal},
};

#[derive(Parser)]
#[command(
    version,
    about = "dfs-server: Dust distributed file system (dfs://) server"
)]
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

    let mut interrupt = signal(SignalKind::interrupt())?;
    let mut terminate = signal(SignalKind::terminate())?;
    let listener = TcpListener::bind(config.listen).await?;
    tracing::info!(listen = %listener.local_addr()?, "dfs-api listening");
    serve(listener, async {
        tokio::select! {
            _ = interrupt.recv() => {}
            _ = terminate.recv() => {}
        }
    })
    .await
}
