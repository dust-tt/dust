use anyhow::{anyhow, Result};
use axum::{
    extract::{Path, State},
    response::Json,
    routing::{delete, get, post},
    Router,
};
use axum_tracing_opentelemetry::middleware::{OtelAxumLayer, OtelInResponseLayer};

use dust::{
    databases::table::{LocalTable, Table},
    databases_store::{self, gcs::GoogleCloudStorageDatabasesStore},
    open_telemetry::init_subscribers,
    sqlite_workers::{
        client::HEARTBEAT_INTERVAL_MS,
        sqlite_database::{SqliteDatabase, SqliteDatabaseError},
    },
    utils::{self, error_response, APIResponse},
};
use hyper::StatusCode;
use lazy_static::lazy_static;
use reqwest::Method;
use serde::Deserialize;
use serde_json::json;
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};
use tikv_jemallocator::Jemalloc;
use tokio::sync::Mutex;
use tokio::{
    net::TcpListener,
    signal::unix::{signal, SignalKind},
};
use tracing::{error, info};

#[global_allocator]
static GLOBAL: Jemalloc = Jemalloc;

lazy_static! {
    static ref WORKER_URL: String = match std::env::var("IS_LOCAL_DEV") {
        Ok(_) => "http://localhost:3005".to_string(),
        _ => {
            let port = std::env::var("POD_PORT").unwrap();
            let ip = std::env::var("POD_IP").unwrap();
            format!("http://{}:{}", ip, port)
        }
    };
    static ref CORE_API: String = std::env::var("CORE_API").unwrap();
    static ref CORE_API_KEY: String = std::env::var("CORE_API_KEY").unwrap();
}

// Duration after which a database is considered inactive and can be removed from the registry.
const DATABASE_TIMEOUT_DURATION: Duration = std::time::Duration::from_secs(5 * 60); // 5 minutes

// Default number of milliseconds after which a query execution is considered timed out.
const DEFAULT_QUERY_TIMEOUT_MS: u64 = 10_000;

// Cleanup databases every 30 seconds instead of every loop iteration.
const DATABASE_CLEANUP_INTERVAL: Duration = Duration::from_secs(30);

const CORE_API_TIMEOUT: Duration = Duration::from_secs(2);

struct DatabaseEntry {
    database: Arc<Mutex<SqliteDatabase>>,
    last_accessed: Instant,
}

struct WorkerState {
    databases_store: Box<dyn databases_store::store::DatabasesStore + Sync + Send>,

    registry: Arc<Mutex<HashMap<String, DatabaseEntry>>>,
    is_shutting_down: Arc<AtomicBool>,
    last_successful_heartbeat: Arc<AtomicU64>,
}

impl WorkerState {
    fn new(databases_store: Box<dyn databases_store::store::DatabasesStore + Sync + Send>) -> Self {
        Self {
            databases_store,

            // TODO: store an instant of the last access for each DB.
            registry: Arc::new(Mutex::new(HashMap::new())),
            is_shutting_down: Arc::new(AtomicBool::new(false)),
            // Initialize with 0 timestamp to indicate no heartbeat has been sent yet
            last_successful_heartbeat: Arc::new(AtomicU64::new(0)),
        }
    }

    async fn run_loop(&self) {
        let mut last_cleanup = Instant::now();

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

            // Run cleanup in background if enough time has passed.
            if last_cleanup.elapsed() >= DATABASE_CLEANUP_INTERVAL {
                let registry = self.registry.clone();
                tokio::task::spawn_blocking(move || {
                    let rt = tokio::runtime::Handle::current();
                    rt.block_on(async move {
                        registry.lock().await.retain(|_, entry| {
                            entry.last_accessed.elapsed() < DATABASE_TIMEOUT_DURATION
                        });
                    });
                });
                last_cleanup = Instant::now();
            }

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
        match self._core_request("POST").await {
            Ok(response) => {
                self.last_successful_heartbeat
                    .store(utils::now(), Ordering::SeqCst);
                Ok(response)
            }
            Err(e) => Err(e),
        }
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

    async fn _core_request(&self, method: &str) -> Result<()> {
        let res = reqwest::Client::builder()
            .timeout(CORE_API_TIMEOUT)
            .build()?
            .request(
                Method::from_bytes(method.as_bytes())?,
                format!("{}/sqlite_workers", *CORE_API),
            )
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", *CORE_API_KEY))
            .json(&json!({
                "url": *WORKER_URL,
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

async fn index(State(state): State<Arc<WorkerState>>) -> Result<&'static str, StatusCode> {
    let now = utils::now();
    let last_heartbeat = state.last_successful_heartbeat.load(Ordering::SeqCst);

    // If last_heartbeat is 0, no successful heartbeat has been sent yet
    if last_heartbeat == 0 {
        error!("Health check failed: no successful heartbeat yet");
        return Err(StatusCode::SERVICE_UNAVAILABLE);
    }

    let elapsed = now - last_heartbeat;

    if elapsed < HEARTBEAT_INTERVAL_MS * 10 {
        Ok("sqlite_worker server ready")
    } else {
        error!(
            "Health check failed: last heartbeat was {} ms ago (threshold: {} ms)",
            elapsed,
            HEARTBEAT_INTERVAL_MS * 10
        );
        Err(StatusCode::SERVICE_UNAVAILABLE)
    }
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

    let local_tables = match payload
        .tables
        .into_iter()
        .map(|t| LocalTable::from_table(t))
        .collect::<Result<Vec<_>>>()
    {
        Ok(lts) => lts,
        Err(e) => {
            return error_response(
                StatusCode::BAD_REQUEST,
                "invalid_table",
                "Failed to convert tables to local tables",
                Some(e),
            )
        }
    };

    let mut guard = database.lock().await;

    match guard
        .init(local_tables, state.databases_store.clone())
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
        let _guard = init_subscribers()?;

        let databases_store = Box::new(GoogleCloudStorageDatabasesStore::new());

        let state = Arc::new(WorkerState::new(databases_store));

        let router = Router::new()
            .route("/databases", delete(expire_all))
            .route("/databases/{database_id}", post(databases_query))
            .route("/databases/{database_id}", delete(databases_delete))
            .layer(OtelInResponseLayer::default())
            // Start OpenTelemetry trace on incoming request.
            .layer(OtelAxumLayer::default())
            .with_state(state.clone());

        let health_check_router = Router::new()
            .route("/", get(index))
            .with_state(state.clone());

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
