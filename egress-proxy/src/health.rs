use crate::gcs::GcsPolicyProvider;
use crate::jwt::JwtValidator;
use anyhow::Result;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use tokio::net::TcpListener;
use tokio::sync::watch;
use tracing::{info, warn};

const BEARER_PREFIX: &str = "Bearer ";

#[derive(Clone)]
struct HealthState {
    policy_provider: GcsPolicyProvider,
    jwt_validator: JwtValidator,
}

#[derive(Deserialize)]
struct InvalidateRequest {
    keys: Vec<String>,
}

#[derive(Serialize)]
struct InvalidateResponse {
    invalidated: usize,
}

pub async fn serve(
    listener: TcpListener,
    mut shutdown: watch::Receiver<bool>,
    policy_provider: GcsPolicyProvider,
    jwt_validator: JwtValidator,
) -> Result<()> {
    let local_addr = listener.local_addr()?;
    let state = HealthState {
        policy_provider,
        jwt_validator,
    };
    let app = Router::new()
        .route("/healthz", get(healthz))
        .route("/invalidate-policy", post(invalidate_policy))
        .with_state(state);

    info!(addr = %local_addr, "health server started");

    axum::serve(listener, app)
        .with_graceful_shutdown(async move {
            while shutdown.changed().await.is_ok() {
                if *shutdown.borrow() {
                    break;
                }
            }
        })
        .await?;

    Ok(())
}

async fn healthz() -> &'static str {
    "ok"
}

async fn invalidate_policy(
    State(state): State<HealthState>,
    headers: HeaderMap,
    Json(body): Json<InvalidateRequest>,
) -> Result<Json<InvalidateResponse>, StatusCode> {
    let token = extract_bearer_token(&headers).ok_or_else(|| {
        warn!("invalidate-policy: missing or malformed authorization header");
        StatusCode::UNAUTHORIZED
    })?;

    state.jwt_validator.validate(token).map_err(|error| {
        warn!(error = %error, "invalidate-policy: jwt validation failed");
        StatusCode::UNAUTHORIZED
    })?;

    if body.keys.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let count = body.keys.len();
    for key in &body.keys {
        state.policy_provider.invalidate(key).await;
    }

    info!(keys = ?body.keys, "invalidated policy cache entries");

    Ok(Json(InvalidateResponse {
        invalidated: count,
    }))
}

fn extract_bearer_token(headers: &HeaderMap) -> Option<&str> {
    let value = headers.get("authorization")?.to_str().ok()?;
    value.strip_prefix(BEARER_PREFIX)
}
