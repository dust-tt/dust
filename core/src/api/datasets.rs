use axum::{
    extract::{Path, State},
    response::Json,
};
use hyper::http::StatusCode;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;

use crate::api::api_state::APIState;
use crate::{
    dataset, project,
    utils::{error_response, APIResponse},
};

/// Register a new dataset

#[derive(serde::Deserialize)]
pub struct DatasetsRegisterPayload {
    dataset_id: String,
    data: Vec<Value>,
}

pub async fn datasets_register(
    Path(project_id): Path<i64>,
    State(state): State<Arc<APIState>>,
    Json(payload): Json<DatasetsRegisterPayload>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);
    match dataset::Dataset::new_from_jsonl(&payload.dataset_id, payload.data).await {
        Err(e) => error_response(
            StatusCode::BAD_REQUEST,
            "invalid_dataset_error",
            "Invalid dataset",
            Some(e),
        ),
        Ok(d) => {
            // First retrieve the latest hash of the dataset to avoid registering if it matches the
            // current hash.
            let current_hash = state
                .store
                .latest_dataset_hash(&project, &d.dataset_id())
                .await
                .unwrap_or_else(|_| None);
            if !(current_hash.is_some() && current_hash.unwrap() == d.hash()) {
                match state.store.register_dataset(&project, &d).await {
                    Err(e) => error_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "internal_server_error",
                        "Failed to store dataset",
                        Some(e),
                    ),
                    Ok(()) => (
                        StatusCode::OK,
                        Json(APIResponse {
                            error: None,
                            response: Some(json!({
                                "dataset": {
                                    "created": d.created(),
                                    "dataset_id": d.dataset_id(),
                                    "hash": d.hash(),
                                    "keys": d.keys(),
                                }
                            })),
                        }),
                    ),
                }
            } else {
                (
                    StatusCode::OK,
                    Json(APIResponse {
                        error: None,
                        response: Some(json!({
                            "dataset": {
                                "created": d.created(),
                                "dataset_id": d.dataset_id(),
                                "hash": d.hash(),
                                "keys": d.keys(),
                            }
                        })),
                    }),
                )
            }
        }
    }
}

#[tracing::instrument(level = "info", skip_all)]
pub async fn datasets_list(
    Path(project_id): Path<i64>,
    State(state): State<Arc<APIState>>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);

    match state.store.list_datasets(&project).await {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to list datasets",
            Some(e),
        ),
        Ok(datasets) => {
            let datasets = datasets
                .into_iter()
                .map(|(d, v)| {
                    (
                        d,
                        v.into_iter()
                            .map(|(h, c)| {
                                json!({
                                    "hash": h,
                                    "created": c,
                                })
                            })
                            .collect::<Vec<_>>(),
                    )
                })
                .collect::<HashMap<_, _>>();
            (
                StatusCode::OK,
                Json(APIResponse {
                    error: None,
                    response: Some(json!({
                        "datasets": datasets,
                    })),
                }),
            )
        }
    }
}

pub async fn datasets_retrieve(
    Path((project_id, dataset_id, hash)): Path<(i64, String, String)>,
    State(state): State<Arc<APIState>>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);
    match state.store.load_dataset(&project, &dataset_id, &hash).await {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to retrieve dataset",
            Some(e),
        ),
        Ok(dataset) => match dataset {
            None => error_response(
                StatusCode::NOT_FOUND,
                "dataset_not_found",
                &format!(
                    "No dataset found for id `{}` and hash `{}`",
                    dataset_id, hash,
                ),
                None,
            ),
            Some(d) => (
                StatusCode::OK,
                Json(APIResponse {
                    error: None,
                    response: Some(json!({
                        "dataset": d,
                    })),
                }),
            ),
        },
    }
}
