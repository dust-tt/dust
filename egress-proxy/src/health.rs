use anyhow::Result;
use axum::{routing::get, Router};
use tokio::net::TcpListener;
use tokio::sync::watch;
use tracing::info;

pub async fn serve(listener: TcpListener, mut shutdown: watch::Receiver<bool>) -> Result<()> {
    let local_addr = listener.local_addr()?;
    let app = Router::new().route("/healthz", get(healthz));

    info!(addr = %local_addr, "health server started");

    axum::serve(listener, app)
        .with_graceful_shutdown(async move {
            while shutdown.changed().await.is_ok() {
                if *shutdown.borrow() {
                    break;
                }
            }
        })
        .await?;

    Ok(())
}

async fn healthz() -> &'static str {
    // TODO(sandbox-egress): Add readiness checks for the GCS policy provider once PR 2 wires
    // policy reads.
    "ok"
}
