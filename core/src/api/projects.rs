use crate::api::api_state::APIState;
use crate::project;
use crate::utils::{error_response, APIResponse};
use anyhow::anyhow;
use axum::extract::{Path, State};
use axum::Json;
use http::StatusCode;
use serde_json::json;
use std::sync::Arc;

/// Create a new project (simply generates an id)

pub async fn projects_create(
    State(state): State<Arc<APIState>>,
) -> (StatusCode, Json<APIResponse>) {
    match state.store.create_project().await {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to create a new project",
            Some(e),
        ),
        Ok(project) => (
            StatusCode::OK,
            Json(APIResponse {
                error: None,
                response: Some(json!({
                    "project": project,
                })),
            }),
        ),
    }
}

pub async fn projects_delete(
    State(state): State<Arc<APIState>>,
    Path(project_id): Path<i64>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);

    // Check if the project has data sources and raise if it does.
    match state.store.has_data_sources(&project).await {
        Err(e) => {
            return error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_server_error",
                "Failed to check project has data sources before deletion",
                Some(e),
            )
        }
        Ok(has_data_sources) => {
            if has_data_sources {
                return error_response(
                    StatusCode::BAD_REQUEST,
                    "bad_request",
                    "Cannot delete a project with data sources",
                    None,
                );
            }
        }
    }

    // Delete the project
    match state.store.delete_project(&project).await {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to delete project",
            Some(e),
        ),
        Ok(()) => (
            StatusCode::OK,
            Json(APIResponse {
                error: None,
                response: Some(json!({
                    "success": true
                })),
            }),
        ),
    }
}

/// Clones a project.
/// Simply consists in cloning the latest dataset versions, as we don't copy runs and hence specs.

pub async fn projects_clone(
    State(state): State<Arc<APIState>>,
    Path(project_id): Path<i64>,
) -> (StatusCode, Json<APIResponse>) {
    let cloned = project::Project::new_from_id(project_id);

    // Create cloned project
    let project = match state.store.create_project().await {
        Err(e) => {
            return error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_server_error",
                "Failed to create cloned project",
                Some(e),
            )
        }
        Ok(project) => project,
    };

    // Retrieve datasets
    let datasets = match state.store.list_datasets(&cloned).await {
        Err(e) => {
            return error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_server_error",
                "Failed to list cloned project datasets",
                Some(e),
            )
        }
        Ok(datasets) => datasets,
    };

    // Load and register datasets
    let store = state.store.clone();
    match futures::future::join_all(datasets.iter().map(|(d, v)| async {
        let dataset = match store
            .load_dataset(&cloned, &d.clone(), &v[0].clone().0)
            .await?
        {
            Some(dataset) => dataset,
            None => Err(anyhow!(
                "Could not find latest version of dataset {}",
                d.clone()
            ))?,
        };
        store.register_dataset(&project, &dataset).await?;
        Ok::<(), anyhow::Error>(())
    }))
    .await
    .into_iter()
    .collect::<anyhow::Result<Vec<_>>>()
    {
        Err(e) => {
            return error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_server_error",
                "Failed to clone project datasets",
                Some(e),
            )
        }
        Ok(_) => (),
    }

    (
        StatusCode::OK,
        Json(APIResponse {
            error: None,
            response: Some(json!({
                "project": project,
            })),
        }),
    )
}
