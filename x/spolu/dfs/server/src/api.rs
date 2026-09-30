mod access;
mod error;
mod objects;
mod sessions;

use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, FromRequest, Request},
    http::{HeaderValue, header},
    response::{IntoResponse, Response},
    routing::{delete, get, post},
};
use serde::{Serialize, de::DeserializeOwned};

use crate::storage::Storage;
pub use access::Access;
pub use error::ApiError;
#[cfg(test)]
pub(crate) use sessions::tests::exercise_sessions;

#[derive(Clone)]
pub struct ApiState {
    storage: Option<Arc<Storage>>,
    access: Arc<Access>,
}

impl ApiState {
    pub fn new(storage: Option<Arc<Storage>>, access: Access) -> Self {
        Self {
            storage,
            access: Arc::new(access),
        }
    }

    fn storage(&self) -> Result<&Storage, ApiError> {
        self.storage.as_deref().ok_or(ApiError::Unavailable)
    }
}

pub fn router(state: ApiState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/workspaces", post(sessions::create_workspace))
        .route("/sessions", post(sessions::create_session))
        .route("/sessions/current", get(sessions::current_session))
        .route("/sessions/{session_id}", delete(sessions::close_session))
        .route("/objects/stat", post(objects::stat))
        .route("/objects/lookup", post(objects::lookup))
        .route("/objects/list", post(objects::list))
        .layer(DefaultBodyLimit::max(64 * 1024))
        .fallback(|| async { ApiError::NotFound })
        .method_not_allowed_fallback(|| async { ApiError::MethodNotAllowed })
        .with_state(state)
}

async fn json_body<T: DeserializeOwned>(request: Request, state: &ApiState) -> Result<T, ApiError> {
    Json::<T>::from_request(request, state)
        .await
        .map(|Json(body)| body)
        .map_err(|_| ApiError::InvalidInput)
}

fn no_store(response: impl IntoResponse) -> Response {
    let mut response = response.into_response();
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response
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
            let response = router(ApiState::new(None, Access::new(None)?))
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
            let response = router(ApiState::new(None, Access::new(None)?))
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
