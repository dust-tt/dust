use super::{Authority, Request, Search};
use anyhow::{Result, ensure};
use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Path, State, rejection::JsonRejection},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde_json::json;
use std::{net::SocketAddr, path::PathBuf, sync::Arc};

struct ApiError(StatusCode);

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (
            self.0,
            Json(json!({"error":self.0.canonical_reason().unwrap_or("request failed")})),
        )
            .into_response()
    }
}

fn classify(error: anyhow::Error) -> ApiError {
    let status = error
        .downcast_ref::<crate::model::Error>()
        .map(|error| match error.code {
            libc::EACCES | libc::ESTALE => StatusCode::UNAUTHORIZED,
            libc::ENOENT => StatusCode::NOT_FOUND,
            libc::EAGAIN => StatusCode::TOO_MANY_REQUESTS,
            _ => StatusCode::SERVICE_UNAVAILABLE,
        })
        .unwrap_or(StatusCode::SERVICE_UNAVAILABLE);
    ApiError(status)
}

async fn query(
    State(search): State<Arc<Search>>,
    Path((workspace, table)): Path<(String, String)>,
    headers: HeaderMap,
    request: std::result::Result<Json<Request>, JsonRejection>,
) -> std::result::Result<Response, ApiError> {
    let token = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .filter(|v| !v.is_empty() && v.len() <= 4096)
        .ok_or(ApiError(StatusCode::UNAUTHORIZED))?;
    if !matches!(table.as_str(), "nodes" | "documents") {
        return Err(ApiError(StatusCode::NOT_FOUND));
    }
    let Json(request) = request.map_err(|error| {
        ApiError(if error.status() == StatusCode::PAYLOAD_TOO_LARGE {
            error.status()
        } else {
            StatusCode::BAD_REQUEST
        })
    })?;
    request
        .validate(&table)
        .map_err(|_| ApiError(StatusCode::BAD_REQUEST))?;
    let response = search
        .query(Authority::Token(token), &workspace, &table, &request)
        .await
        .map_err(classify)?;
    Ok(([("cache-control", "no-store")], Json(response)).into_response())
}

pub fn router(search: Arc<Search>) -> Router {
    Router::new()
        .route(
            "/v1/workspaces/{workspace}/lexical/{table}/query",
            post(query),
        )
        .route(
            "/lexical/openapi.json",
            get(|| async {
                (
                    [("content-type", "application/json")],
                    include_str!("../../search/openapi.json"),
                )
            }),
        )
        .layer(DefaultBodyLimit::max(16 * 1024))
        .with_state(search)
}

pub async fn start(
    search: Arc<Search>,
    address: SocketAddr,
    tls: Option<(PathBuf, PathBuf)>,
) -> Result<tokio::task::JoinHandle<std::io::Result<()>>> {
    ensure!(
        address.ip().is_loopback() || tls.is_some(),
        "non-loopback search requires TLS"
    );
    let listener = std::net::TcpListener::bind(address)?;
    listener.set_nonblocking(true)?;
    let app = router(search);
    if let Some((cert, key)) = tls {
        let config = axum_server::tls_rustls::RustlsConfig::from_pem_file(cert, key).await?;
        Ok(tokio::spawn(
            axum_server::from_tcp_rustls(listener, config).serve(app.into_make_service()),
        ))
    } else {
        Ok(tokio::spawn(
            axum_server::from_tcp(listener).serve(app.into_make_service()),
        ))
    }
}
