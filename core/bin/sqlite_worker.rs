use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};

use anyhow::{anyhow, Result};
use axum::{
    extract::{self, Path},
    routing::{get, post},
    Extension, Json, Router,
};
use dust::{
    sqlite_workers::sqlite_database::SqliteDatabase,
    utils::{self, error_response, APIResponse},
};
use hyper::{Body, Client, Request, StatusCode};
use serde::Deserialize;
use serde_json::json;
use tokio::{
    signal::unix::{signal, SignalKind},
    sync::Mutex,
};
use tower_http::trace::{self, TraceLayer};
use tracing::Level;

struct WorkerState {
    registry: Arc<Mutex<HashMap<String, SqliteDatabase>>>,
    is_shutting_down: Arc<AtomicBool>,
}

impl WorkerState {
    fn new() -> Self {
        Self {
            // TODO: store an instant of the last access for each DB.
            registry: Arc::new(Mutex::new(HashMap::new())),
            is_shutting_down: Arc::new(AtomicBool::new(false)),
        }
    }

    async fn run_loop(&self) {
        loop {
            if self.is_shutting_down.load(Ordering::SeqCst) {
                break;
            }

            match self.heartbeat().await {
                Ok(_) => utils::info("Heartbeat sent."),
                Err(e) => utils::error(&format!("Failed to send heartbeat: {:?}", e)),
            }
            // TODO: check for inactive DBs to kill.
            tokio::time::sleep(std::time::Duration::from_millis(1024)).await;
        }
    }

    async fn await_pending_queries(&self) {
        // TODO: wait for all pending database queries to finish.
        loop {
            // if no pending query...
            break;
            // tokio::time::sleep(std::time::Duration::from_millis(1024)).await;
        }
    }

    async fn heartbeat(&self) -> Result<()> {
        self._core_request("POST").await
    }

    async fn shutdown(&self) -> Result<()> {
        self.is_shutting_down.store(true, Ordering::SeqCst);
        self._core_request("DELETE").await
    }

    async fn _core_request(&self, method: &str) -> Result<()> {
        let hostname = match std::env::var("HOSTNAME") {
            Ok(hostname) => hostname,
            Err(_) => Err(anyhow!("HOSTNAME not set."))?,
        };

        let core_api = match std::env::var("CORE_API") {
            Ok(core_url) => core_url,
            Err(_) => Err(anyhow!("CORE_API not set."))?,
        };

        let req = Request::builder()
            .method(method)
            .uri(format!("{}/sqlite_workers/{}", core_api, hostname))
            .body(Body::empty())?;

        let res = Client::new().request(req).await?;

        match res.status().as_u16() {
            200 => Ok(()),
            s => Err(anyhow!("Failed to send heartbeat to core. Status: {}", s)),
        }
    }
}

/// Index

async fn index() -> (StatusCode, Json<APIResponse>) {
    (
        axum::http::StatusCode::OK,
        Json(APIResponse {
            error: None,
            response: Some(json!({"message": "Welcome to SQLite worker."})),
        }),
    )
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
) -> (StatusCode, Json<APIResponse>) {
    let mut registry = state.registry.lock().await;

    let db = match registry.get(&db_id) {
        Some(db) => db,
        None => {
            let db = SqliteDatabase::new(&db_id);
            registry.insert(db_id.clone(), db);
            registry.get(&db_id).unwrap()
        }
    };

    match db.query(payload.query).await {
        Ok(results) => (
            axum::http::StatusCode::OK,
            Json(APIResponse {
                error: None,
                response: Some(json!(results)),
            }),
        ),
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to query database",
            Some(e),
        ),
    }
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
        utils::info("[GRACEFUL] Sending shutdown request to core...");
        match state.shutdown().await {
            Ok(_) => utils::info("[GRACEFUL] Shutdown request sent."),
            Err(e) => utils::error(&format!("Failed to send shutdown request: {:?}", e)),
        }

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
