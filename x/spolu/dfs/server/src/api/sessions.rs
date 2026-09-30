use std::{
    collections::{BTreeMap, BTreeSet},
    sync::Arc,
};

use axum::{
    Json,
    extract::{FromRequestParts, Path, Request, State},
    http::{HeaderMap, StatusCode, request::Parts},
    response::Response,
};
use serde::{Deserialize, Serialize};

use super::{
    ApiError, ApiState,
    access::{self, Session},
    json_body, no_store,
};
use crate::model::WorkspaceId;

/// @swaggerschema CreateWorkspaceRequest in server/openapi.yaml.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct CreateWorkspaceRequest {
    workspace_id: String,
    #[serde(default)]
    root_grants: Vec<String>,
}

/// @swaggerschema CreateWorkspaceResponse in server/openapi.yaml.
#[derive(Serialize)]
struct CreateWorkspaceResponse {
    workspace_id: String,
    root_id: String,
    workspace_key: String,
}

/// @swaggerschema CreateSessionRequest in server/openapi.yaml.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct CreateSessionRequest {
    workspace_id: String,
    grants: Vec<String>,
    #[serde(default)]
    mounts: BTreeMap<String, String>,
}

/// @swaggerschema SessionResponse in server/openapi.yaml.
#[derive(Serialize)]
struct SessionResponse {
    session_id: String,
    workspace_id: String,
    grants: BTreeSet<String>,
    expires_at: u64,
}

impl From<&Session> for SessionResponse {
    fn from(session: &Session) -> Self {
        Self {
            session_id: session.id.clone(),
            workspace_id: session.workspace.to_string(),
            grants: session.grants.clone(),
            expires_at: session.expires_at,
        }
    }
}

/// @swaggerschema CreateSessionResponse in server/openapi.yaml.
#[derive(Serialize)]
struct CreateSessionResponse {
    #[serde(flatten)]
    session: SessionResponse,
    session_key: String,
}

/// @swagger See POST /workspaces in server/openapi.yaml.
pub(super) async fn create_workspace(
    State(state): State<ApiState>,
    headers: HeaderMap,
    request: Request,
) -> Result<Response, ApiError> {
    state.access.authorize_creation(access::bearer(&headers)?)?;
    let body: CreateWorkspaceRequest = json_body(request, &state).await?;
    let workspace = WorkspaceId::new(body.workspace_id).map_err(|_| ApiError::InvalidInput)?;
    let grants = grants(body.root_grants)?;
    let key = access::issue_key("dfsw_")?;
    let root = state
        .storage()?
        .create_workspace(&workspace, access::fingerprint(&key), &grants)
        .await
        .map_err(|_| ApiError::Unavailable)?
        .ok_or(ApiError::Conflict)?;
    Ok(no_store((
        StatusCode::CREATED,
        Json(CreateWorkspaceResponse {
            workspace_id: workspace.to_string(),
            root_id: root.to_string(),
            workspace_key: key,
        }),
    )))
}

/// @swagger See POST /sessions in server/openapi.yaml.
pub(super) async fn create_session(
    State(state): State<ApiState>,
    headers: HeaderMap,
    request: Request,
) -> Result<Response, ApiError> {
    let key = access::bearer(&headers)?;
    access::require_key_kind(key, "dfsw_")?;
    let body: CreateSessionRequest = json_body(request, &state).await?;
    let workspace = WorkspaceId::new(body.workspace_id).map_err(|_| ApiError::InvalidInput)?;
    access::authorize_workspace(state.storage()?, &workspace, key).await?;
    if !body.mounts.is_empty() {
        return Err(ApiError::Unsupported);
    }
    let (session, session_key) = state
        .access
        .create_session(workspace, grants(body.grants)?)
        .await?;
    Ok(no_store((
        StatusCode::CREATED,
        Json(CreateSessionResponse {
            session: SessionResponse::from(session.as_ref()),
            session_key,
        }),
    )))
}

/**
 * @cc [owner:spolu,label:security] session-request-scope
 * Session-authenticated handlers MUST derive workspace and grants from this verified session,
 * never request overrides. Verification MUST reject workspace keys and expired/closed sessions.
 * Authenticating a session MUST NOT bypass subsequent live object-grant checks.
 */
pub(super) struct AuthenticatedSession(pub Arc<Session>);

impl FromRequestParts<ApiState> for AuthenticatedSession {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &ApiState,
    ) -> Result<Self, Self::Rejection> {
        Ok(Self(
            state
                .access
                .session(access::bearer(&parts.headers)?)
                .await?,
        ))
    }
}

/// @swagger See GET /sessions/current in server/openapi.yaml.
pub(super) async fn current_session(
    AuthenticatedSession(session): AuthenticatedSession,
) -> Response {
    no_store(Json(SessionResponse::from(session.as_ref())))
}

/// @swagger See DELETE /sessions/{session_id} in server/openapi.yaml.
pub(super) async fn close_session(
    State(state): State<ApiState>,
    headers: HeaderMap,
    path: Result<Path<String>, axum::extract::rejection::PathRejection>,
) -> Result<Response, ApiError> {
    let Path(id) = path.map_err(|_| ApiError::InvalidInput)?;
    state
        .access
        .close_session(access::bearer(&headers)?, &id)
        .await?;
    Ok(no_store(StatusCode::NO_CONTENT))
}

fn grants(values: Vec<String>) -> Result<BTreeSet<String>, ApiError> {
    let grants: BTreeSet<_> = values.into_iter().collect();
    if grants.len() > 512 {
        return Err(ApiError::InvalidInput);
    }
    Ok(grants)
}

#[cfg(test)]
pub(crate) mod tests;
