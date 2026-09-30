use axum::{Json, Router, routing::get};
use serde::Serialize;

pub fn router() -> Router {
    Router::new().route("/health", get(health))
}

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
}

/// @swagger See GET /health in server/openapi.yaml.
async fn health() -> Json<HealthResponse> {
    Json(HealthResponse { status: "ok" })
}
