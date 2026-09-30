use std::net::SocketAddr;

use anyhow::{Context, Result};
use clap::Parser;
use dfs_server::{api, storage::StorageConfig};
use tokio::net::TcpListener;
use tokio::signal::unix::{SignalKind, signal};
use tracing::info;
use tracing_subscriber::{EnvFilter, filter::LevelFilter};

#[derive(Parser)]
#[command(version, about = "dfs:// filesystem server")]
struct Config {
    /// Address on which to listen for HTTP requests.
    #[arg(long, env = "DFS_LISTEN", default_value = "127.0.0.1:8080")]
    listen: SocketAddr,

    #[command(flatten)]
    storage: StorageConfig,
}

/**
 * @cc [owner:spolu,label:concurrency] graceful-shutdown-signals
 * SIGINT and SIGTERM MUST stop accepting HTTP connections and let in-flight requests finish before
 * the server exits successfully.
 */
#[tokio::main]
async fn main() -> Result<()> {
    let config = Config::parse();
    init_tracing()?;

    let mut interrupt = signal(SignalKind::interrupt()).context("register SIGINT handler")?;
    let mut terminate = signal(SignalKind::terminate()).context("register SIGTERM handler")?;
    let listener = TcpListener::bind(config.listen)
        .await
        .with_context(|| format!("bind HTTP listener at {}", config.listen))?;
    let storage = config.storage.open().await?;

    info!(address = %listener.local_addr()?, "dfs server listening");

    let serve_result = axum::serve(listener, api::router())
        .with_graceful_shutdown(async move {
            tokio::select! {
                _ = interrupt.recv() => {}
                _ = terminate.recv() => {}
            }
            info!("dfs server shutting down");
        })
        .await
        .context("serve HTTP requests");

    let close_result = match storage {
        Some(storage) => storage.close().await,
        None => Ok(()),
    };
    serve_result?;
    close_result?;

    info!("dfs server stopped");
    Ok(())
}

fn init_tracing() -> Result<()> {
    let filter = EnvFilter::builder()
        .with_default_directive(LevelFilter::INFO.into())
        .from_env()
        .context("parse RUST_LOG")?;
    let subscriber = tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_writer(std::io::stderr)
        .json()
        .finish();

    tracing::subscriber::set_global_default(subscriber).context("initialize logging")
}
