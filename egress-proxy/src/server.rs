use crate::config::Config;
use crate::health;
use crate::jwt::JwtValidator;
use crate::tls::load_tls_acceptor;
use anyhow::{anyhow, Result};
use tokio::net::TcpListener;
use tokio::signal;
use tokio::sync::watch;
use tracing::{error, info};

pub async fn run(config: Config) -> Result<()> {
    let Config {
        listen_addr,
        health_addr,
        tls_cert_path,
        tls_key_path,
        jwt_secret,
        temporary_allowlist,
        environment,
        unsafe_skip_ssrf_check,
    } = config;

    let _tls_acceptor = load_tls_acceptor(&tls_cert_path, &tls_key_path)?;
    let _jwt_validator = JwtValidator::new(&jwt_secret);
    let _temporary_allowlist = temporary_allowlist;

    let listener = TcpListener::bind(health_addr).await?;
    let health_addr = listener.local_addr()?;

    // TODO(sandbox-egress): Bind and accept the sandbox forwarder listener on listen_addr in the
    // next PR once the parser/auth building blocks have landed.
    let _ = (listen_addr, environment, unsafe_skip_ssrf_check);
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
