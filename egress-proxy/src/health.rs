use crate::gcs::GcsPolicyProvider;
use crate::jwt::JwtValidator;
use anyhow::Result;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Serialize;
use tokio::net::TcpListener;
use tokio::sync::watch;
use tracing::{info, warn};

const BEARER_PREFIX: &str = "Bearer ";

#[derive(Clone)]
struct HealthState {
    policy_provider: GcsPolicyProvider,
    jwt_validator: JwtValidator,
}

#[derive(Serialize)]
struct InvalidateResponse {
    invalidated: String,
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
) -> Result<Json<InvalidateResponse>, StatusCode> {
    let token = extract_bearer_token(&headers).ok_or_else(|| {
        warn!("invalidate-policy: missing or malformed authorization header");
        StatusCode::UNAUTHORIZED
    })?;

    let validated = state.jwt_validator.validate(token).map_err(|error| {
        warn!(error = %error, "invalidate-policy: jwt validation failed");
        StatusCode::UNAUTHORIZED
    })?;

    if validated.action.as_deref() != Some("invalidate-policy") {
        warn!("invalidate-policy: token missing required action claim");
        return Err(StatusCode::FORBIDDEN);
    }

    // Derive the cache key from claims: exactly one of wId or sbId must be set.
    let cache_key = match (validated.w_id.as_deref(), validated.sb_id.as_deref()) {
        (Some(w_id), None) => format!("w:{w_id}"),
        (None, Some(sb_id)) => format!("s:{sb_id}"),
        _ => {
            warn!("invalidate-policy: token must have exactly one of wId or sbId");
            return Err(StatusCode::BAD_REQUEST);
        }
    };

    state.policy_provider.invalidate(&cache_key).await;

    info!(cache_key = %cache_key, "invalidated policy cache entry");

    Ok(Json(InvalidateResponse {
        invalidated: cache_key,
    }))
}

fn extract_bearer_token(headers: &HeaderMap) -> Option<&str> {
    let value = headers.get("authorization")?.to_str().ok()?;
    value.strip_prefix(BEARER_PREFIX)
}
