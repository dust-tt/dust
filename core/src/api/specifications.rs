use crate::{
    app, project,
    stores::store::{self},
    utils::{error_response, APIResponse},
};
use anyhow::Result;
use axum::{
    extract::{Path, State},
    response::Json,
};
use hyper::http::StatusCode;
use serde_json::json;
use std::sync::Arc;

use crate::api::api_state::APIState;

/// Check a specification

#[derive(serde::Deserialize)]
pub struct SpecificationsCheckPayload {
    specification: String,
}

pub async fn specifications_check(
    Path(project_id): Path<i64>,
    Json(payload): Json<SpecificationsCheckPayload>,
) -> (StatusCode, Json<APIResponse>) {
    let _project = project::Project::new_from_id(project_id);
    match app::App::new(&payload.specification).await {
        Err(e) => error_response(
            StatusCode::BAD_REQUEST,
            "invalid_specification_error",
            "Invalid specification",
            Some(e),
        ),
        Ok(app) => (
            StatusCode::OK,
            Json(APIResponse {
                error: None,
                response: Some(json!({
                    "app": {
                        "hash": app.hash(),
                        "blocks": app.blocks(),
                    }
                })),
            }),
        ),
    }
}

/// Retrieve a specification

pub async fn specifications_retrieve(
    Path((project_id, hash)): Path<(i64, String)>,
    State(state): State<Arc<APIState>>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);
    match state.store.load_specification(&project, &hash).await {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to retrieve specification",
            Some(e),
        ),
        Ok(s) => match s {
            None => error_response(
                StatusCode::NOT_FOUND,
                "specification_not_found",
                &format!("No specification found with hash `{}`", hash),
                None,
            ),
            Some((created, spec)) => (
                StatusCode::OK,
                Json(APIResponse {
                    error: None,
                    response: Some(json!({
                        "specification": {
                            "created": created,
                            "data": spec,
                        },
                    })),
                }),
            ),
        },
    }
}

pub async fn specifications_get(
    Path(project_id): Path<i64>,
    State(state): State<Arc<APIState>>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);

    match state.store.list_specification_hashes(&project).await {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to list specifications",
            Some(e),
        ),
        Ok(hashes) => (
            StatusCode::OK,
            Json(APIResponse {
                error: None,
                response: Some(json!({ "hashes": hashes })),
            }),
        ),
    }
}

/// Push a specification

#[derive(serde::Deserialize)]
pub struct SpecificationsPushPayload {
    specification: String,
}

pub async fn specifications_post(
    Path(project_id): Path<i64>,
    State(state): State<Arc<APIState>>,
    Json(payload): Json<SpecificationsPushPayload>,
) -> (StatusCode, Json<APIResponse>) {
    match save_specification(project_id, &state.store, payload.specification).await {
        Err(err) => err,
        Ok(app) => (
            StatusCode::OK,
            Json(APIResponse {
                error: None,
                response: Some(json!({
                    "app":{
                        "hash": app.hash()
                     },
                })),
            }),
        ),
    }
}

async fn save_specification(
    project_id: i64,
    store: &Box<dyn store::Store + Sync + Send>,
    specification: String,
) -> Result<app::App, (StatusCode, Json<APIResponse>)> {
    let project = project::Project::new_from_id(project_id);

    let app = match app::App::new(&specification).await {
        Err(e) => Err(error_response(
            StatusCode::BAD_REQUEST,
            "invalid_specification_error",
            "Invalid specification",
            Some(e),
        ))?,
        Ok(app) => app,
    };

    match store
        .register_specification(&project, &app.hash(), &specification)
        .await
    {
        Err(e) => Err(error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to register specification",
            Some(e),
        ))?,
        Ok(_) => (),
    }
    Ok(app)
}
