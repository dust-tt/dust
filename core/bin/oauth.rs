use dust::oauth::app;
use dust::open_telemetry::init_subscribers;
use tokio::{
    net::TcpListener,
    signal::unix::{signal, SignalKind},
};

use tracing::{error, info};

fn main() {
    let rt = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .unwrap();

    let r = rt.block_on(async {
        let _guard = init_subscribers()?;

        let app = app::create_app().await?;

        let (tx1, rx1) = tokio::sync::oneshot::channel::<()>();
        let (tx2, rx2) = tokio::sync::oneshot::channel::<()>();

        let port = std::env::var("OAUTH_PORT").unwrap_or_else(|_| "3006".to_string());
        let addr = format!("[::]:{}", port);

        let srv = axum::serve(
            TcpListener::bind::<std::net::SocketAddr>(addr.parse().unwrap()).await?,
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

        info!(pid = std::process::id() as u64, port = %port, "oauth server started");

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
