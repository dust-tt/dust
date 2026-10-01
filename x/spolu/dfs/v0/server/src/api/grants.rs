use std::collections::BTreeMap;

use axum::{
    Json,
    extract::{Request, State},
    http::HeaderMap,
    response::Response,
};
use serde::{Deserialize, Serialize};

use super::{
    ApiError, ApiState, access, json_body, no_store,
    objects::{default_limit, object_id},
};
use crate::{model::WorkspaceId, namespace};

/// @swaggerschema ListGrantsRequest in server/openapi.yaml.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ListGrantsRequest {
    workspace_id: String,
    object_id: String,
    after: Option<String>,
    #[serde(default = "default_limit")]
    limit: usize,
}

/// @swaggerschema UpdateGrantsRequest in server/openapi.yaml.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct UpdateGrantsRequest {
    workspace_id: String,
    object_id: String,
    expected_metadata_revision: u64,
    grants: BTreeMap<String, bool>,
}

/// @swaggerschema ListGrantsResponse in server/openapi.yaml.
#[derive(Serialize)]
struct ListGrantsResponse {
    object_id: String,
    metadata_revision: u64,
    grants: Vec<String>,
    next_after: Option<String>,
}

/// @swaggerschema UpdateGrantsResponse in server/openapi.yaml.
#[derive(Serialize)]
struct UpdateGrantsResponse {
    object_id: String,
    metadata_revision: u64,
}

/// @swagger See POST /objects/grants/list in server/openapi.yaml.
pub(super) async fn list(
    State(state): State<ApiState>,
    headers: HeaderMap,
    request: Request,
) -> Result<Response, ApiError> {
    let key = access::bearer(&headers)?;
    access::require_key_kind(key, "dfsw_")?;
    let body: ListGrantsRequest = json_body(request, &state).await?;
    let workspace = WorkspaceId::new(body.workspace_id).map_err(|_| ApiError::InvalidInput)?;
    access::authorize_workspace(state.storage()?, &workspace, key).await?;
    let id = object_id(&body.object_id)?;
    let page = namespace::list_grants(
        state.storage()?,
        &workspace,
        id,
        body.after.as_deref(),
        body.limit,
    )
    .await?;
    Ok(no_store(Json(ListGrantsResponse {
        object_id: id.to_string(),
        metadata_revision: page.metadata_revision.get(),
        grants: page.grants,
        next_after: page.next_after,
    })))
}

/// @swagger See POST /objects/grants/update in server/openapi.yaml.
pub(super) async fn update(
    State(state): State<ApiState>,
    headers: HeaderMap,
    request: Request,
) -> Result<Response, ApiError> {
    let key = access::bearer(&headers)?;
    access::require_key_kind(key, "dfsw_")?;
    let body: UpdateGrantsRequest = json_body(request, &state).await?;
    let workspace = WorkspaceId::new(body.workspace_id).map_err(|_| ApiError::InvalidInput)?;
    access::authorize_workspace(state.storage()?, &workspace, key).await?;
    let id = object_id(&body.object_id)?;
    let revision = namespace::update_grants(
        state.storage()?,
        &workspace,
        id,
        body.expected_metadata_revision,
        body.grants,
    )
    .await?;
    Ok(no_store(Json(UpdateGrantsResponse {
        object_id: id.to_string(),
        metadata_revision: revision.get(),
    })))
}
