use axum::{
    body::Bytes,
    extract::{self, DefaultBodyLimit},
    response::Json,
    routing::{get, post},
    Router,
};
use dust::utils::APIResponse;
use hyper::http::StatusCode;
use serde_json::{json, Value};
use tokio::signal::unix::{signal, SignalKind};
use tower_http::trace::{self, TraceLayer};
use tracing::{error, info, Level};

use cap::Cap;
use jemallocator::Jemalloc;
use std::alloc;
extern crate jemalloc_ctl;
use jemalloc_ctl::{Access, AsName};

#[global_allocator]
static GLOBAL: Jemalloc = Jemalloc;

#[derive(serde::Deserialize)]
struct BigTextPayload {
    text: String,
}

#[derive(serde::Deserialize)]
struct BigJsonArrayPayload {
    array: Vec<Value>,
}

/// Index

async fn index() -> &'static str {
    "Welcome to the Repro! This endpoint is probably kinda free."
}

async fn big_text(
    extract::Json(payload): extract::Json<BigTextPayload>,
) -> (StatusCode, Json<APIResponse>) {
    let text = payload.text.clone();
    println!("Text size: {}", text.len());

    (
        StatusCode::OK,
        Json(APIResponse {
            error: None,
            response: Some(json!("Thank you for the big text!")),
        }),
    )
}

async fn big_json_array(
    extract::Json(payload): extract::Json<BigJsonArrayPayload>,
    // Bytes { .. }: Bytes,
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

#[tokio::main]
async fn main() {
    let app = Router::new()
        // Index
        .route("/", get(index))
        // Big Text
        .route("/big-text", post(big_text))
        // Big JSON Array
        .route("/big-json-array", post(big_json_array))
        // Extensions
        .layer(DefaultBodyLimit::disable());

    // console_subscriber::init();

    let listener = tokio::net::TcpListener::bind("[::]:30042").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
