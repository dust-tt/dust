mod error;

use axum::{Json, Router, routing::get};
use serde::Serialize;

pub use error::ApiError;

pub fn router() -> Router {
    Router::new()
        .route("/health", get(health))
        .fallback(|| async { ApiError::NotFound })
        .method_not_allowed_fallback(|| async { ApiError::MethodNotAllowed })
}

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
}

/// @swagger See GET /health in server/openapi.yaml.
async fn health() -> Json<HealthResponse> {
    Json(HealthResponse { status: "ok" })
}

#[cfg(test)]
mod tests {
    use axum::{
        body::{Body, to_bytes},
        http::{Request, StatusCode, header},
    };
    use serde_json::json;
    use tower::ServiceExt;

    use super::*;

    #[tokio::test]
    async fn routing_errors_use_the_shared_envelope() -> anyhow::Result<()> {
        for (method, path, status, code) in [
            ("GET", "/private-name", StatusCode::NOT_FOUND, "not_found"),
            (
                "POST",
                "/health",
                StatusCode::METHOD_NOT_ALLOWED,
                "method_not_allowed",
            ),
        ] {
            let response = router()
                .oneshot(
                    Request::builder()
                        .method(method)
                        .uri(path)
                        .body(Body::empty())?,
                )
                .await?;
            assert_eq!(response.status(), status);
            assert_eq!(response.headers()[header::CONTENT_TYPE], "application/json");
            assert_eq!(response.headers()[header::CACHE_CONTROL], "no-store");
            if status == StatusCode::METHOD_NOT_ALLOWED {
                assert_eq!(response.headers()[header::ALLOW], "GET,HEAD");
            }
            let bytes = to_bytes(response.into_body(), 1024).await?;
            let body: serde_json::Value = serde_json::from_slice(&bytes)?;
            assert_eq!(body["error"]["code"], code);
            assert!(!String::from_utf8(bytes.to_vec())?.contains(path));
        }
        Ok(())
    }

    #[tokio::test]
    async fn health_and_head_remain_available() -> anyhow::Result<()> {
        for method in ["GET", "HEAD"] {
            let response = router()
                .oneshot(
                    Request::builder()
                        .method(method)
                        .uri("/health")
                        .body(Body::empty())?,
                )
                .await?;
            assert_eq!(response.status(), StatusCode::OK);
            let body = to_bytes(response.into_body(), 1024).await?;
            if method == "HEAD" {
                assert!(body.is_empty());
            } else {
                assert_eq!(
                    serde_json::from_slice::<serde_json::Value>(&body)?,
                    json!({"status": "ok"})
                );
            }
        }
        Ok(())
    }
}
