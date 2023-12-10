use std::{collections::HashMap, sync::Arc};

use axum::{
    extract::{self, Path},
    routing::{get, post},
    Extension, Json, Router,
};
use dust::utils;
use rusqlite::Connection;
use serde::Deserialize;
use tokio::{
    signal::unix::{signal, SignalKind},
    sync::{mpsc, Mutex},
};
use tower_http::trace::{self, TraceLayer};
use tracing::Level;

enum DbMessage {
    Execute(String),
}

struct WorkerState {
    registry: Arc<Mutex<HashMap<String, mpsc::Sender<DbMessage>>>>,
}

impl WorkerState {
    fn new() -> Self {
        Self {
            registry: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    async fn run_loop(&self) {
        loop {
            // TODO: heartbeat to `core`.
            tokio::time::sleep(std::time::Duration::from_millis(1024)).await;
        }
    }

    async fn shutdown_signal(&self) {
        // TODO: send shutdown signal to `core`.
    }

    async fn await_pending_queries(&self) {
        // TODO: wait for all pending database queries to finish.
        loop {
            // if no pending query...
            break;
            // tokio::time::sleep(std::time::Duration::from_millis(1024)).await;
        }
    }
}

/// Index

async fn index() -> &'static str {
    "Welcome to Sqlite Workers!"
}

// Databases

#[derive(Deserialize)]
struct DbQueryBody {
    query: String,
}

async fn db_query(
    Path(db_id): Path<String>,
    Json(payload): Json<DbQueryBody>,
    Extension(state): Extension<Arc<WorkerState>>,
) -> impl axum::response::IntoResponse {
    let mut registry = state.registry.lock().await;

    let sender = match registry.get(&db_id) {
        Some(sender) => sender.clone(),
        None => {
            // If the database thread does not exist, create it.
            let (tx, mut rx) = mpsc::channel(32);

            let db_id_clone = db_id.clone();
            tokio::spawn(async move {
                // TODO: database init logic.
                let conn = Connection::open_in_memory().unwrap();
                //TODO: handle incoming message.
                while let Some(message) = rx.recv().await {
                    match message {
                        DbMessage::Execute(query) => {
                            println!("Executing query: {} on db: {}", query, db_id_clone);
                            let _ = conn.execute(&query, []);
                        }
                    }
                }
            });

            registry.insert(db_id.clone(), tx.clone());
            tx
        }
    };

    if let Err(_) = sender.send(DbMessage::Execute(payload.query)).await {
        return (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to execute database query",
        );
    }

    (
        axum::http::StatusCode::OK,
        "Database query executed successfully",
    )
}

fn main() {
    let rt = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(32)
        .enable_all()
        .build()
        .unwrap();

    let r = rt.block_on(async {
        tracing_subscriber::fmt()
            .with_target(false)
            .compact()
            .with_ansi(false)
            .init();

        let state = Arc::new(WorkerState::new());
        let app = Router::new()
            .route("/", get(index))
            .route("/db/:db_id", post(db_query))
            .layer(
                TraceLayer::new_for_http()
                    .make_span_with(trace::DefaultMakeSpan::new().level(Level::INFO))
                    .on_response(trace::DefaultOnResponse::new().level(Level::INFO)),
            )
            .layer(extract::Extension(state.clone()));

        // Start the heartbeat loop.
        let state_clone = state.clone();
        tokio::task::spawn(async move {
            state_clone.run_loop().await;
        });

        let (tx1, rx1) = tokio::sync::oneshot::channel::<()>();
        let (tx2, rx2) = tokio::sync::oneshot::channel::<()>();

        let srv = axum::Server::bind(&"[::]:3005".parse().unwrap())
            .serve(app.into_make_service())
            .with_graceful_shutdown(async {
                rx1.await.ok();
            });

        tokio::spawn(async move {
            if let Err(e) = srv.await {
                utils::error(&format!("server error: {}", e));
            }
            utils::info("[GRACEFUL] Server stopped");
            tx2.send(()).ok();
        });

        utils::info(&format!("Current PID: {}", std::process::id()));

        let mut stream = signal(SignalKind::terminate()).unwrap();
        stream.recv().await;

        // Gracefully shut down the server.
        utils::info("[GRACEFUL] SIGTERM received.");

        // Tell core to stop sending requests.
        utils::info("[GRACEFUL] Sending shutdown signal to core...");
        state.shutdown_signal().await;

        utils::info("[GRACEFUL] Shutting down server...");
        tx1.send(()).ok();

        // Wait for the server to shutdown
        utils::info("[GRACEFUL] Awaiting server shutdown...");
        rx2.await.ok();

        // Wait for the SQLite queries to finish.
        utils::info("[GRACEFUL] Awaiting database queries to finish...");
        state.await_pending_queries().await;

        utils::info("[GRACEFUL] Exiting in 1 second...");

        // sleep for 1 second to allow the logger to flush
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;

        Ok::<(), anyhow::Error>(())
    });

    match r {
        Ok(_) => (),
        Err(e) => {
            utils::error(&format!("Error: {:?}", e));
            std::process::exit(1);
        }
    }
}
