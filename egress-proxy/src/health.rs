use crate::gcs::GcsPolicyProvider;
use crate::policy::Policy;
use anyhow::Result;
use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use tokio::net::TcpListener;
use tokio::sync::watch;
use tracing::{info, warn};

pub async fn serve(
    listener: TcpListener,
    policy_provider: GcsPolicyProvider,
    mut shutdown: watch::Receiver<bool>,
) -> Result<()> {
    let local_addr = listener.local_addr()?;
    let app = Router::new()
        .route("/healthz", get(healthz))
        .route("/debug/policy", get(debug_policy))
        .with_state(policy_provider);

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
    // TODO(sandbox-egress): Add readiness checks once the proxy listener and policy provider are
    // wired.
    "ok"
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DebugPolicyQuery {
    w_id: Option<String>,
    sb_id: String,
}

#[derive(Debug, Serialize)]
struct DebugPolicyResponse {
    workspace: DebugPolicyResult,
    sandbox: DebugPolicyResult,
}

#[derive(Debug, Serialize)]
struct DebugPolicyResult {
    policy: Option<Policy>,
    error: Option<String>,
}

// TODO(sandbox-egress): Remove this debug endpoint once PR 2b is deployed and verified.
async fn debug_policy(
    State(policy_provider): State<GcsPolicyProvider>,
    Query(query): Query<DebugPolicyQuery>,
) -> impl IntoResponse {
    let sb_id = query.sb_id.trim();
    if sb_id.is_empty() {
        return (StatusCode::BAD_REQUEST, "sbId must not be empty").into_response();
    }

    let workspace = match query
        .w_id
        .as_deref()
        .map(str::trim)
        .filter(|w_id| !w_id.is_empty())
    {
        Some(w_id) => fetch_workspace_policy(&policy_provider, w_id).await,
        None => DebugPolicyResult {
            policy: None,
            error: None,
        },
    };
    let sandbox = fetch_sandbox_policy(&policy_provider, sb_id).await;

    Json(DebugPolicyResponse { workspace, sandbox }).into_response()
}

async fn fetch_workspace_policy(
    policy_provider: &GcsPolicyProvider,
    w_id: &str,
) -> DebugPolicyResult {
    match policy_provider.get_workspace_policy(w_id).await {
        Ok(policy) => DebugPolicyResult {
            policy,
            error: None,
        },
        Err(error) => {
            warn!(error = %error, w_id, "workspace policy debug lookup failed");
            DebugPolicyResult {
                policy: None,
                error: Some(error.to_string()),
            }
        }
    }
}

async fn fetch_sandbox_policy(
    policy_provider: &GcsPolicyProvider,
    sb_id: &str,
) -> DebugPolicyResult {
    match policy_provider.get_sandbox_policy(sb_id).await {
        Ok(policy) => DebugPolicyResult {
            policy,
            error: None,
        },
        Err(error) => {
            warn!(error = %error, sb_id, "sandbox policy debug lookup failed");
            DebugPolicyResult {
                policy: None,
                error: Some(error.to_string()),
            }
        }
    }
}
