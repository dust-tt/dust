use dust::oauth::app;
use tokio::{
    net::TcpListener,
    signal::unix::{signal, SignalKind},
};

use tracing::{error, info};
use tracing_bunyan_formatter::{BunyanFormattingLayer, JsonStorageLayer};
use tracing_subscriber::prelude::*;

fn main() {
    let rt = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .unwrap();

    let r = rt.block_on(async {
        tracing_subscriber::registry()
            .with(JsonStorageLayer)
            .with(
                BunyanFormattingLayer::new("oauth".into(), std::io::stdout)
                    .skip_fields(vec!["file", "line", "target"].into_iter())
                    .unwrap(),
            )
            .with(tracing_subscriber::EnvFilter::new("info"))
            .init();

        let app = app::create_app().await?;

        let (tx1, rx1) = tokio::sync::oneshot::channel::<()>();
        let (tx2, rx2) = tokio::sync::oneshot::channel::<()>();

        let srv = axum::serve(
            TcpListener::bind::<std::net::SocketAddr>("[::]:3006".parse().unwrap()).await?,
            app.into_make_service(),
        )
        .with_graceful_shutdown(async {
            rx1.await.ok();
        });

        tokio::spawn(async move {
            if let Err(e) = srv.await {
                error!(error = %e, "Server error");
            }
            info!("[GRACEFUL] Server stopped");
            tx2.send(()).ok();
        });

        info!(pid = std::process::id() as u64, "oauth server started");

        let mut stream = signal(SignalKind::terminate()).unwrap();
        stream.recv().await;

        // Gracefully shut down the server
        info!("[GRACEFUL] SIGTERM received, stopping server...");
        tx1.send(()).ok();

        // Wait for the server to shutdown
        info!("[GRACEFUL] Awaiting server shutdown...");
        rx2.await.ok();

        info!("[GRACEFUL] Exiting");

        // sleep for 1 second to allow the logger to flush
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;

        Ok::<(), anyhow::Error>(())
    });

    match r {
        Ok(_) => (),
        Err(e) => {
            error!(error = %e, "oauth server error");
            std::process::exit(1);
        }
    }
}
