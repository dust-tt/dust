use crate::config::Config;
use crate::connection::{handle_connection, ConnectionState};
use crate::health;
use crate::tls::load_tls_acceptor;
use anyhow::{anyhow, Result};
use std::sync::Arc;
use std::time::Duration;
use tokio::net::TcpListener;
use tokio::signal;
use tokio::sync::{watch, Semaphore};
use tokio::time::timeout;
use tracing::{error, info, warn};

const TLS_ACCEPT_TIMEOUT_SECONDS: u64 = 5;
const MAX_CONCURRENT_CONNECTIONS: usize = 1024;

pub async fn run(config: Config) -> Result<()> {
    let tls_acceptor = load_tls_acceptor(&config.tls_cert_path, &config.tls_key_path)?;
    let listener = TcpListener::bind(config.listen_addr).await?;
    let proxy_addr = listener.local_addr()?;
    let health_listener = TcpListener::bind(config.health_addr).await?;
    let health_addr = health_listener.local_addr()?;
    let state = Arc::new(ConnectionState::new(&config));

    // TODO(sandbox-egress): Confirm final certificate provisioning path once the Kubernetes
    // deployment and DNS name are introduced.
    let (shutdown_tx, shutdown_rx) = watch::channel(false);

    let mut health_handle = tokio::spawn(health::serve(health_listener, shutdown_rx.clone()));
    let proxy_handle = tokio::spawn(run_proxy_listener(
        listener,
        tls_acceptor,
        state,
        Arc::new(Semaphore::new(MAX_CONCURRENT_CONNECTIONS)),
        shutdown_rx.clone(),
    ));

    info!(addr = %proxy_addr, "proxy listener started");
    info!(addr = %health_addr, "health listener started");

    tokio::select! {
        _ = wait_for_shutdown_signal() => {
            info!("shutdown signal received");
            let _ = shutdown_tx.send(true);

            if let Err(error) = proxy_handle.await? {
                error!(error = %error, "proxy listener failed during shutdown");
                return Err(error);
            }
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

async fn run_proxy_listener(
    listener: TcpListener,
    tls_acceptor: tokio_rustls::TlsAcceptor,
    state: Arc<ConnectionState>,
    connection_slots: Arc<Semaphore>,
    mut shutdown: watch::Receiver<bool>,
) -> Result<()> {
    loop {
        tokio::select! {
            accept_result = listener.accept() => {
                let (stream, peer_addr) = accept_result?;
                let permit = match connection_slots.clone().try_acquire_owned() {
                    Ok(permit) => permit,
                    Err(_) => {
                        warn!(
                            peer_addr = %peer_addr,
                            max_concurrent_connections = MAX_CONCURRENT_CONNECTIONS,
                            "connection rejected because concurrency limit is reached"
                        );
                        drop(stream);
                        continue;
                    }
                };
                let tls_acceptor = tls_acceptor.clone();
                let state = state.clone();

                tokio::spawn(async move {
                    let _permit = permit;
                    match timeout(
                        Duration::from_secs(TLS_ACCEPT_TIMEOUT_SECONDS),
                        tls_acceptor.accept(stream),
                    )
                    .await
                    {
                        Ok(Ok(tls_stream)) => handle_connection(tls_stream, state).await,
                        Ok(Err(error)) => {
                            warn!(
                                error = %error,
                                peer_addr = %peer_addr,
                                "tls handshake failed"
                            );
                        }
                        Err(_) => {
                            warn!(
                                peer_addr = %peer_addr,
                                tls_accept_timeout_seconds = TLS_ACCEPT_TIMEOUT_SECONDS,
                                "tls handshake timed out"
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

    // TODO(sandbox-egress): In PR 3, supervise the proxy listener task and give accepted
    // connections a bounded drain window during shutdown instead of detaching them.
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
