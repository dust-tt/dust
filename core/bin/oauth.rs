use anyhow::anyhow;
use axum::{
    extract::{Path, State},
    response::Json,
    routing::{get, post},
    Router,
};
use dust::{
    oauth::{
        connection::{Connection, ConnectionProvider},
        store,
    },
    utils::{error_response, APIResponse, CoreRequestMakeSpan},
};
use hyper::StatusCode;
use serde::Deserialize;
use serde_json::json;
use std::sync::Arc;
use tokio::{
    net::TcpListener,
    signal::unix::{signal, SignalKind},
};
use tower_http::trace::{self, TraceLayer};
use tracing::{error, info, Level};
use tracing_bunyan_formatter::{BunyanFormattingLayer, JsonStorageLayer};
use tracing_subscriber::prelude::*;

struct OAuthState {
    store: Box<dyn store::OAuthStore + Sync + Send>,
}

impl OAuthState {
    fn new(store: Box<dyn store::OAuthStore + Sync + Send>) -> Self {
        Self { store }
    }
}

async fn index() -> &'static str {
    "oauth server ready"
}

#[derive(Deserialize)]
struct ConnectionCreatePayload {
    provider: ConnectionProvider,
    metadata: serde_json::Value,
}

async fn connections_create(
    State(state): State<Arc<OAuthState>>,
    Json(payload): Json<ConnectionCreatePayload>,
) -> (StatusCode, Json<APIResponse>) {
    match Connection::create(state.store.clone(), payload.provider, payload.metadata).await {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to create connection",
            Some(e),
        ),
        Ok(c) => (
            StatusCode::OK,
            Json(APIResponse {
                error: None,
                response: Some(json!({
                    "connection": {
                        "connection_id": c.connection_id(),
                        "created": c.created(),
                        "provider": c.provider(),
                        "status": c.status(),
                        "metadata": c.metadata(),
                    },
                })),
            }),
        ),
    }
}

#[derive(Deserialize)]
struct ConnectionFinalizePayload {
    provider: ConnectionProvider,
    code: String,
}

async fn connections_finalize(
    State(state): State<Arc<OAuthState>>,
    Path(connection_id): Path<String>,
    Json(payload): Json<ConnectionFinalizePayload>,
) -> (StatusCode, Json<APIResponse>) {
    match state
        .store
        .retrieve_connection(payload.provider, &connection_id)
        .await
    {
        Err(e) => error_response(
            StatusCode::NOT_FOUND,
            "connection_not_found",
            "Requested connection was not found",
            Some(e),
        ),
        Ok(mut c) => match c.finalize(state.clone().store.clone(), &payload.code).await {
            Err(e) => error_response(
                StatusCode::BAD_REQUEST,
                "connection_finalization_failed",
                "Requested to finalize connection failed",
                Some(e),
            ),
            Ok(_) => (
                StatusCode::OK,
                Json(APIResponse {
                    error: None,
                    response: Some(json!({
                        "connection": {
                            "connection_id": c.connection_id(),
                            "created": c.created(),
                            "provider": c.provider(),
                            "status": c.status(),
                            "metadata": c.metadata(),
                        },
                    })),
                }),
            ),
        },
    }
}

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
                    .skip_fields(vec!["file", "line", "target", "v", "pid"].into_iter())
                    .unwrap(),
            )
            .with(tracing_subscriber::EnvFilter::new("info"))
            .init();

        let store: Box<dyn store::OAuthStore + Sync + Send> =
            match std::env::var("OAUTH_DATABASE_URI") {
                Ok(db_uri) => {
                    let s = store::PostgresOAuthStore::new(&db_uri).await?;
                    s.init().await?;
                    Box::new(s)
                }
                Err(_) => Err(anyhow!("OAUTH_DATABASE_URI not set."))?,
            };

        let state = Arc::new(OAuthState::new(store));

        let app = Router::new()
            // Index
            .route("/", get(index))
            // Connections
            .route("/connections", post(connections_create))
            .route(
                "/connections/:connection_id/finalize",
                post(connections_finalize),
            )
            // .route(
            //     "/connections/:connection_id/access_token",
            //     get(connections_access_token),
            // )
            // Extensions
            .layer(
                TraceLayer::new_for_http()
                    .make_span_with(CoreRequestMakeSpan::new())
                    .on_response(trace::DefaultOnResponse::new().level(Level::INFO)),
            )
            .with_state(state.clone());

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
