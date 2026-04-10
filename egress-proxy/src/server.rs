use crate::config::Config;
use crate::connection::{handle_connection, ConnectionState};
use crate::health;
use crate::tls::load_tls_acceptor;
use anyhow::Result;
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::signal;
use tokio::sync::watch;
use tracing::{error, info, warn};

pub async fn run(config: Config) -> Result<()> {
    let tls_acceptor = load_tls_acceptor(&config.tls_cert_path, &config.tls_key_path)?;
    let listener = TcpListener::bind(config.listen_addr).await?;
    let proxy_addr = listener.local_addr()?;
    let state = Arc::new(ConnectionState::new(&config));

    // TODO(sandbox-egress): Confirm final certificate provisioning path once the Kubernetes
    // deployment and DNS name are introduced.
    let (shutdown_tx, shutdown_rx) = watch::channel(false);

    let health_handle = tokio::spawn(health::serve(config.health_addr, shutdown_rx.clone()));
    let proxy_handle = tokio::spawn(run_proxy_listener(
        listener,
        tls_acceptor,
        state,
        shutdown_rx.clone(),
    ));

    info!(addr = %proxy_addr, "proxy listener started");

    wait_for_shutdown_signal().await;
    // TODO(sandbox-egress): Tune graceful shutdown once we know Kubernetes termination grace
    // and expected long-lived connection behavior.
    info!("shutdown signal received");
    let _ = shutdown_tx.send(true);

    if let Err(error) = proxy_handle.await? {
        error!(error = %error, "proxy listener failed");
    }
    if let Err(error) = health_handle.await? {
        error!(error = %error, "health server failed");
    }

    info!("egress proxy stopped");
    Ok(())
}

async fn run_proxy_listener(
    listener: TcpListener,
    tls_acceptor: tokio_rustls::TlsAcceptor,
    state: Arc<ConnectionState>,
    mut shutdown: watch::Receiver<bool>,
) -> Result<()> {
    loop {
        tokio::select! {
            accept_result = listener.accept() => {
                let (stream, peer_addr) = accept_result?;
                let tls_acceptor = tls_acceptor.clone();
                let state = state.clone();

                tokio::spawn(async move {
                    match tls_acceptor.accept(stream).await {
                        Ok(tls_stream) => handle_connection(tls_stream, state).await,
                        Err(error) => {
                            warn!(
                                error = %error,
                                peer_addr = %peer_addr,
                                "tls handshake failed"
                            );
                        }
                    }
                });
            }
            changed = shutdown.changed() => {
                if changed.is_err() || *shutdown.borrow() {
                    break;
                }
            }
        }
    }

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
