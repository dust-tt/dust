use crate::config::Config;
use crate::connection::{handle_connection, ConnectionState};
use crate::health;
use crate::tls::load_tls_acceptor;
use anyhow::{anyhow, Result};
use std::sync::Arc;
use std::time::Duration;
use tokio::net::TcpListener;
use tokio::signal;
use tokio::sync::watch;
use tokio::task::{JoinError, JoinSet};
use tracing::{error, info, warn};

const CONNECTION_DRAIN_TIMEOUT_SECONDS: u64 = 5;

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
    let mut proxy_handle = tokio::spawn(run_proxy_listener(
        listener,
        tls_acceptor,
        state,
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
        proxy_result = &mut proxy_handle => {
            let _ = shutdown_tx.send(true);
            proxy_result??;
            return Err(anyhow!("proxy listener stopped unexpectedly"));
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
    mut shutdown: watch::Receiver<bool>,
) -> Result<()> {
    let mut connection_tasks = JoinSet::new();

    loop {
        tokio::select! {
            accept_result = listener.accept() => {
                let (stream, peer_addr) = accept_result?;
                let tls_acceptor = tls_acceptor.clone();
                let state = state.clone();

                connection_tasks.spawn(async move {
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
            join_result = connection_tasks.join_next(), if !connection_tasks.is_empty() => {
                log_connection_task_result(join_result);
            }
            changed = shutdown.changed() => {
                if changed.is_err() || *shutdown.borrow() {
                    break;
                }
            }
        }
    }

    drain_connection_tasks(connection_tasks).await;

    Ok(())
}

async fn drain_connection_tasks(mut connection_tasks: JoinSet<()>) {
    if connection_tasks.is_empty() {
        return;
    }

    let drain_timeout = Duration::from_secs(CONNECTION_DRAIN_TIMEOUT_SECONDS);
    match tokio::time::timeout(drain_timeout, async {
        while let Some(join_result) = connection_tasks.join_next().await {
            log_connection_task_result(Some(join_result));
        }
    })
    .await
    {
        Ok(()) => {}
        Err(_) => {
            let pending_tasks = connection_tasks.len();
            warn!(
                pending_tasks,
                drain_timeout_seconds = CONNECTION_DRAIN_TIMEOUT_SECONDS,
                "aborting active connections after shutdown drain timeout"
            );
            connection_tasks.abort_all();
            while let Some(join_result) = connection_tasks.join_next().await {
                log_connection_task_result(Some(join_result));
            }
        }
    }
}

fn log_connection_task_result(join_result: Option<Result<(), JoinError>>) {
    if let Some(Err(error)) = join_result {
        warn!(error = %error, "connection task failed");
    }
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
