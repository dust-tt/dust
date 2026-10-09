use std::net::SocketAddr;

use clap::Parser;
use dfs_api::{serve, storage::fdb};
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

    // SAFETY: `boot` runs once, here, and `_network` lives until `main` returns, so the network is
    // stopped before exit on every path. It is declared before `database`, so it outlives it.
    // See https://docs.rs/foundationdb/0.11.0/foundationdb/fn.boot.html
    #[allow(unsafe_code)]
    let _network = unsafe { foundationdb::boot() };
    let database = fdb::open()?;
    fdb::ping(&database).await?;
    tracing::info!("connected to FoundationDB");

    let mut interrupt = signal(SignalKind::interrupt())?;
    let mut terminate = signal(SignalKind::terminate())?;
    let listener = TcpListener::bind(config.listen).await?;
    tracing::info!(listen = %listener.local_addr()?, "dfs-api listening");
    serve(listener, database, async {
        tokio::select! {
            _ = interrupt.recv() => {}
            _ = terminate.recv() => {}
        }
    })
    .await
}
