use anyhow::{anyhow, Result};
use axum::{
    extract::{Path, State},
    response::Json,
    routing::{delete, get, post},
    Router,
};
use dust::{
    databases::database::Table,
    databases_store::{self, store::DatabasesStore},
    sqlite_workers::sqlite_database::{SqliteDatabase, SqliteDatabaseError},
    utils::{error_response, APIResponse, CoreRequestMakeSpan},
};
use hyper::StatusCode;
use reqwest::Method;
use serde::Deserialize;
use serde_json::json;
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};
use tokio::sync::Mutex;
use tokio::{
    net::TcpListener,
    signal::unix::{signal, SignalKind},
};
use tower_http::trace::{self, TraceLayer};
use tracing::{error, info, Level};
use tracing_bunyan_formatter::{BunyanFormattingLayer, JsonStorageLayer};
use tracing_subscriber::prelude::*;

// Duration after which a database is considered inactive and can be removed from the registry.
const DATABASE_TIMEOUT_DURATION: Duration = std::time::Duration::from_secs(5 * 60); // 5 minutes

// Default number of milliseconds after which a query execution is considered timed out.
const DEFAULT_QUERY_TIMEOUT_MS: u64 = 10_000;

struct DatabaseEntry {
    database: Arc<Mutex<SqliteDatabase>>,
    last_accessed: Instant,
}

struct WorkerState {
    databases_store: Box<dyn databases_store::store::DatabasesStore + Sync + Send>,

    registry: Arc<Mutex<HashMap<String, DatabaseEntry>>>,
    is_shutting_down: Arc<AtomicBool>,
}

impl WorkerState {
    fn new(databases_store: Box<dyn databases_store::store::DatabasesStore + Sync + Send>) -> Self {
        Self {
            databases_store,

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
                Ok(_) => (),
                Err(e) => {
                    error!(
                        error = %e,
                        "Failed to send heartbeat"
                    );
                }
            }

            self.cleanup_inactive_databases().await;

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

    async fn invalidate_database(&self, database_id: &str) {
        // Terminate (invalidate) the DB if it exists.
        let mut registry = self.registry.lock().await;
        match registry.get(database_id) {
            Some(_) => {
                // Removing the DB from the registry will destroy the SQLite connection and hence the
                // in-memory DB.
                registry.remove(database_id);
            }
            None => (),
        }
    }

    async fn cleanup_inactive_databases(&self) {
        let mut registry = self.registry.lock().await;
        registry.retain(|_, entry| entry.last_accessed.elapsed() < DATABASE_TIMEOUT_DURATION);
    }

    async fn _core_request(&self, method: &str) -> Result<()> {
        let worker_url = match std::env::var("IS_LOCAL_DEV") {
            Ok(_) => "http://localhost:3005".to_string(),
            _ => {
                let port = match std::env::var("POD_PORT") {
                    Ok(port) => port,
                    Err(_) => Err(anyhow!("PORT not set."))?,
                };
                let ip = match std::env::var("POD_IP") {
                    Ok(ip) => ip,
                    Err(_) => Err(anyhow!("IP not set."))?,
                };

                format!("http://{}:{}", ip, port)
            }
        };

        let core_api = match std::env::var("CORE_API") {
            Ok(core_url) => core_url,
            Err(_) => Err(anyhow!("CORE_API not set."))?,
        };

        let core_api_key = match std::env::var("CORE_API_KEY") {
            Ok(api_key) => api_key,
            Err(_) => Err(anyhow!("CORE_API_KEY not set."))?,
        };

        let res = reqwest::Client::new()
            .request(
                Method::from_bytes(method.as_bytes())?,
                format!("{}/sqlite_workers", core_api),
            )
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", core_api_key))
            .json(&json!({
                "url": worker_url,
            }))
            .send()
            .await?;

        match res.status().as_u16() {
            200 => Ok(()),
            s => Err(anyhow!("Failed to send heartbeat to core. Status: {}", s)),
        }
    }
}

/// Index

async fn index() -> &'static str {
    "sqlite_worker server ready"
}

// Databases

#[derive(Deserialize)]
struct DbQueryPayload {
    query: String,
    tables: Vec<Table>,
    timeout_ms: Option<u64>,
}

async fn databases_query(
    Path(database_id): Path<String>,
    State(state): State<Arc<WorkerState>>,
    Json(payload): Json<DbQueryPayload>,
) -> (StatusCode, Json<APIResponse>) {
    let database = {
        let mut registry = state.registry.lock().await;
        let entry = registry
            .entry(database_id.clone())
            .or_insert_with(|| DatabaseEntry {
                database: Arc::new(Mutex::new(SqliteDatabase::new())),
                last_accessed: Instant::now(),
            });
        entry.last_accessed = Instant::now();
        entry.database.clone()
    };
    let timeout = payload.timeout_ms.unwrap_or(DEFAULT_QUERY_TIMEOUT_MS);

    let mut guard = database.lock().await;

    match guard
        .init(payload.tables, state.databases_store.clone())
        .await
    {
        Ok(_) => (),
        Err(e) => {
            return error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_server_error",
                "Failed to initialize database",
                Some(e),
            )
        }
    }

    match guard.query(&payload.query, timeout).await {
        Ok(results) => (
            axum::http::StatusCode::OK,
            Json(APIResponse {
                error: None,
                response: Some(json!(results)),
            }),
        ),
        Err(e) => match e {
            SqliteDatabaseError::QueryExecutionError(e) => error_response(
                StatusCode::BAD_REQUEST,
                "query_execution_error",
                e.to_string().as_str(),
                Some(e.into()),
            ),
            SqliteDatabaseError::ExceededMaxRows(max) => error_response(
                StatusCode::BAD_REQUEST,
                "too_many_result_rows",
                &format!("Result contains too many rows (max: {})", max),
                Some(e.into()),
            ),
            _ => error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_server_error",
                "Failed to query database",
                Some(e.into()),
            ),
        },
    }
}

async fn databases_delete(
    Path(database_id): Path<String>,
    State(state): State<Arc<WorkerState>>,
) -> (StatusCode, Json<APIResponse>) {
    state.invalidate_database(&database_id).await;

    (
        axum::http::StatusCode::OK,
        Json(APIResponse {
            error: None,
            response: Some(json!({
                "success": true,
            })),
        }),
    )
}

async fn expire_all(State(state): State<Arc<WorkerState>>) -> (StatusCode, Json<APIResponse>) {
    let mut registry = state.registry.lock().await;
    registry.clear();

    (
        axum::http::StatusCode::OK,
        Json(APIResponse {
            error: None,
            response: Some(json!({
                "success": true,
            })),
        }),
    )
}

fn main() {
    let rt = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(32)
        .enable_all()
        .build()
        .unwrap();

    let r = rt.block_on(async {
        tracing_subscriber::registry()
            .with(JsonStorageLayer)
            .with(
                BunyanFormattingLayer::new("sqlite_worker".into(), std::io::stdout)
                    .skip_fields(vec!["file", "line", "target"].into_iter())
                    .unwrap(),
            )
            .with(tracing_subscriber::EnvFilter::new("info"))
            .init();

        let databases_store: Box<dyn databases_store::store::DatabasesStore + Sync + Send> =
            match std::env::var("DATABASES_STORE_DATABASE_URI") {
                Ok(db_uri) => {
                    let s = databases_store::store::PostgresDatabasesStore::new(&db_uri).await?;
                    s.init().await?;
                    Box::new(s)
                }
                Err(_) => Err(anyhow!("DATABASES_STORE_DATABASE_URI not set."))?,
            };

        let state = Arc::new(WorkerState::new(databases_store));

        let router = Router::new()
            .route("/databases", delete(expire_all))
            .route("/databases/:database_id", post(databases_query))
            .route("/databases/:database_id", delete(databases_delete))
            .layer(
                TraceLayer::new_for_http()
                    .make_span_with(CoreRequestMakeSpan::new())
                    .on_response(trace::DefaultOnResponse::new().level(Level::INFO)),
            )
            .with_state(state.clone());

        let health_check_router = Router::new().route("/", get(index));

        let app = Router::new().merge(router).merge(health_check_router);

        // Start the heartbeat loop.
        let state_clone = state.clone();
        tokio::task::spawn(async move {
            state_clone.run_loop().await;
        });

        let (tx1, rx1) = tokio::sync::oneshot::channel::<()>();
        let (tx2, rx2) = tokio::sync::oneshot::channel::<()>();

        let srv = axum::serve(
            TcpListener::bind::<std::net::SocketAddr>("[::]:3005".parse().unwrap()).await?,
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

        info!(
            pid = std::process::id() as u64,
            "sqlite_worker server started"
        );

        let mut stream = signal(SignalKind::terminate()).unwrap();
        stream.recv().await;

        // Gracefully shut down the server.
        info!("[GRACEFUL] SIGTERM received");

        // Tell core to stop sending requests.
        info!("[GRACEFUL] Sending shutdown request to core...");
        match state.shutdown().await {
            Ok(_) => info!("[GRACEFUL] Shutdown request sent"),
            Err(e) => {
                error!(
                    error = %e,
                    "Failed to send shutdown request"
                );
            }
        }

        info!("[GRACEFUL] Shutting down server...");
        tx1.send(()).ok();

        // Wait for the server to shutdown
        info!("[GRACEFUL] Awaiting server shutdown...");
        rx2.await.ok();

        // Wait for the SQLite queries to finish.
        info!("[GRACEFUL] Awaiting database queries to finish...");
        state.await_pending_queries().await;

        info!("[GRACEFUL] Exiting");

        // sleep for 1 second to allow the logger to flush
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;

        Ok::<(), anyhow::Error>(())
    });

    match r {
        Ok(_) => (),
        Err(e) => {
            error!(error = %e, "sqlite_worker server error");
            std::process::exit(1);
        }
    }
}
