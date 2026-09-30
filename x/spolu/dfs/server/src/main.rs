mod api;

use std::net::SocketAddr;

use anyhow::{Context, Result};
use clap::Parser;
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
}

#[tokio::main]
async fn main() -> Result<()> {
    let config = Config::parse();
    init_tracing()?;

    let mut interrupt = signal(SignalKind::interrupt()).context("register SIGINT handler")?;
    let mut terminate = signal(SignalKind::terminate()).context("register SIGTERM handler")?;
    let listener = TcpListener::bind(config.listen)
        .await
        .with_context(|| format!("bind HTTP listener at {}", config.listen))?;

    info!(address = %listener.local_addr()?, "dfs server listening");

    axum::serve(listener, api::router())
        .with_graceful_shutdown(async move {
            tokio::select! {
                _ = interrupt.recv() => {}
                _ = terminate.recv() => {}
            }
            info!("dfs server shutting down");
        })
        .await
        .context("serve HTTP requests")?;

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
