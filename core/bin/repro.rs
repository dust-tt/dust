use axum::{
    extract::{self, DefaultBodyLimit},
    response::Json,
    routing::{get, post},
    Router,
};
use dust::utils::APIResponse;
use hyper::http::StatusCode;

use jemallocator::Jemalloc;
use serde_json::{json, Value};
use tokio::signal::unix::{signal, SignalKind};
use tracing::{error, info};

#[global_allocator]
static GLOBAL: Jemalloc = Jemalloc;

#[derive(serde::Deserialize)]
struct BigJsonArrayPayload {
    array: Vec<Value>,
}

async fn index() -> &'static str {
    "Hello !"
}

async fn big_json_array(
    extract::Json(payload): extract::Json<BigJsonArrayPayload>,
) -> (StatusCode, Json<APIResponse>) {
    let array = payload.array.clone();
    println!("Array size: {}", array.len());

    (
        StatusCode::OK,
        Json(APIResponse {
            error: None,
            response: Some(json!("Thank you for the big JSON array!")),
        }),
    )
}

fn main() {
    let rt = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .unwrap();

    let r = rt.block_on(async {
        let app = Router::new()
            // Index
            .route("/", get(index))
            // Big JSON Array
            .route("/big-json-array", post(big_json_array))
            // Extensions
            .layer(DefaultBodyLimit::disable());

        let (tx1, rx1) = tokio::sync::oneshot::channel::<()>();
        let (tx2, rx2) = tokio::sync::oneshot::channel::<()>();

        let srv = axum::Server::bind(&"[::]:3001".parse().unwrap())
            .serve(app.into_make_service())
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

        info!(pid = std::process::id() as u64, "API server started");

        let mut stream = signal(SignalKind::terminate()).unwrap();
        stream.recv().await;

        // Gracefully shut down the server
        info!("[GRACEFUL] SIGTERM received, stopping server...");
        tx1.send(()).ok();

        // Wait for the server to shutdown
        info!("[GRACEFUL] Awaiting server shutdown...");
        rx2.await.ok();

        info!("[GRACEFUL] Exiting!");

        // sleep for 1 second to allow the logger to flush
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;

        Ok::<(), anyhow::Error>(())
    });

    match r {
        Ok(_) => (),
        Err(e) => {
            error!(error = %e, "API Server error");
            std::process::exit(1);
        }
    }
}
