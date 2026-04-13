mod config;
mod health;
mod server;

use anyhow::Result;
use config::Config;
use tracing::error;

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
