mod config;
mod health;
mod server;
mod tls;

use anyhow::Result;
use config::Config;
use tracing::{error, info};

#[tokio::main]
async fn main() {
    if let Err(error) = run().await {
        error!(error = %error, "egress proxy failed");
        std::process::exit(1);
    }
}

async fn run() -> Result<()> {
    init_tracing();

    let config = Config::from_env()?;
    info!(
        configured_proxy_addr = %config.listen_addr,
        health_addr = %config.health_addr,
        "starting egress proxy"
    );

    server::run(config).await
}

fn init_tracing() {
    let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));

    let subscriber = tracing_subscriber::fmt()
        .with_env_filter(env_filter)
        .json()
        .finish();

    let _ = tracing::subscriber::set_global_default(subscriber);
}
