use crate::config::Config;
use crate::health;
use anyhow::{anyhow, Result};
use tokio::net::TcpListener;
use tokio::signal;
use tokio::sync::watch;
use tracing::{error, info};

pub async fn run(config: Config) -> Result<()> {
    let listener = TcpListener::bind(config.health_addr).await?;
    let health_addr = listener.local_addr()?;

    // TODO(sandbox-egress): Add the proxy listener, TLS loading, and protocol wiring in the next
    // PR once the service shell has landed.
    let (shutdown_tx, shutdown_rx) = watch::channel(false);
    let mut health_handle = tokio::spawn(health::serve(listener, shutdown_rx));

    info!(addr = %health_addr, "health listener started");

    tokio::select! {
        _ = wait_for_shutdown_signal() => {
            info!("shutdown signal received");
            let _ = shutdown_tx.send(true);

            if let Err(error) = health_handle.await? {
                error!(error = %error, "health server failed during shutdown");
                return Err(error);
            }
        }
        health_result = &mut health_handle => {
            let _ = shutdown_tx.send(true);
            health_result??;
            return Err(anyhow!("health server stopped unexpectedly"));
        }
    }

    info!("egress proxy stopped");
    Ok(())
}

async fn wait_for_shutdown_signal() {
    #[cfg(unix)]
    {
        let mut terminate = signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler");

        tokio::select! {
            _ = terminate.recv() => {}
            _ = signal::ctrl_c() => {}
        }
    }

    #[cfg(not(unix))]
    {
        let _ = signal::ctrl_c().await;
    }
}
