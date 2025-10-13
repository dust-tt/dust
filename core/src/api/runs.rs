use axum::{
    extract::{Path, Query, State},
    http::header::HeaderMap,
    response::{
        sse::{Event, KeepAlive, Sse},
        Json,
    },
};
use hyper::http::StatusCode;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::convert::Infallible;
use std::sync::Arc;
use tokio::sync::mpsc::unbounded_channel;
use tokio_stream::Stream;
use tracing::{error, info};

use crate::api::api_state::APIState;
use crate::{
    app,
    blocks::block::BlockType,
    dataset, project, run,
    utils::{self, error_response, APIError, APIResponse},
};

#[derive(Clone, serde::Deserialize)]
struct Secret {
    name: String,
    value: String,
}

#[derive(serde::Deserialize, Clone)]
pub struct RunsCreatePayload {
    run_type: run::RunType,
    specification: Option<String>,
    specification_hash: Option<String>,
    dataset_id: Option<String>,
    inputs: Option<Vec<Value>>,
    config: run::RunConfig,
    credentials: run::Credentials,
    secrets: Vec<Secret>,
    store_blocks_results: Option<bool>,
}

pub async fn run_helper(
    project_id: i64,
    payload: RunsCreatePayload,
    state: Arc<APIState>,
) -> anyhow::Result<app::App, (StatusCode, Json<APIResponse>)> {
    let project = project::Project::new_from_id(project_id);

    let mut register_spec = true;
    let specification = match payload.specification {
        Some(spec) => spec,
        None => match payload.specification_hash {
            Some(hash) => {
                let hash = match hash.as_str() {
                    "latest" => match state.store.latest_specification_hash(&project).await {
                        Err(e) => Err(error_response(
                            StatusCode::INTERNAL_SERVER_ERROR,
                            "internal_server_error",
                            "Failed to retrieve latest specification",
                            Some(e),
                        ))?,
                        Ok(h) => match h {
                            None => Err(error_response(
                                StatusCode::NOT_FOUND,
                                "specification_not_found",
                                "Latest specification not found",
                                None,
                            ))?,
                            Some(h) => h,
                        },
                    },
                    _ => hash,
                };

                match state.store.load_specification(&project, &hash).await {
                    Err(e) => Err(error_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "internal_server_error",
                        "Failed to retrieve specification",
                        Some(e),
                    ))?,
                    Ok(spec) => match spec {
                        None => Err(error_response(
                            StatusCode::NOT_FOUND,
                            "specification_not_found",
                            &format!("No specification found for hash `{}`", hash),
                            None,
                        ))?,
                        Some((_, s)) => {
                            register_spec = false;
                            s
                        }
                    },
                }
            }
            None => Err(error_response(
                StatusCode::BAD_REQUEST,
                "missing_specification_error",
                "No specification provided, either `specification` \
                 or `specification_hash` must be provided",
                None,
            ))?,
        },
    };

    let mut app = match app::App::new(&specification).await {
        Err(e) => Err(error_response(
            StatusCode::BAD_REQUEST,
            "invalid_specification_error",
            "Invalid specification",
            Some(e),
        ))?,
        Ok(app) => app,
    };

    let mut d = match payload.dataset_id.as_ref() {
        None => None,
        Some(dataset_id) => match state.store.latest_dataset_hash(&project, dataset_id).await {
            Err(e) => Err(error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_server_error",
                "Failed to retrieve dataset",
                Some(e),
            ))?,
            Ok(None) => Err(error_response(
                StatusCode::NOT_FOUND,
                "dataset_not_found",
                &format!("No dataset found for id `{}`", dataset_id),
                None,
            ))?,
            Ok(Some(latest)) => match state
                .store
                .load_dataset(&project, dataset_id, &latest)
                .await
            {
                Err(e) => Err(error_response(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal_server_error",
                    "Failed to retrieve dataset",
                    Some(e),
                ))?,
                Ok(d) => match d {
                    None => unreachable!(),
                    Some(d) => Some(d),
                },
            },
        },
    };

    if d.is_some() {
        if payload.run_type != run::RunType::Local {
            Err(error_response(
                StatusCode::BAD_REQUEST,
                "invalid_run_type_error",
                "RunType `local` is expected when a `dataset_id` is provided",
                None,
            ))?
        }

        if d.as_ref().unwrap().len() == 0 {
            Err(error_response(
                StatusCode::BAD_REQUEST,
                "dataset_empty_error",
                &format!(
                    "Dataset `{}` has 0 record",
                    payload.dataset_id.as_ref().unwrap()
                ),
                None,
            ))?
        }

        info!(
            dataset_id = payload.dataset_id.as_ref().unwrap(),
            records = d.as_ref().unwrap().len(),
            "Retrieved latest version of dataset"
        );
    }

    if payload.inputs.is_some() {
        d = match dataset::Dataset::new_from_jsonl("inputs", payload.inputs.unwrap()).await {
            Err(e) => Err(error_response(
                StatusCode::BAD_REQUEST,
                "invalid_inputs_error",
                "Invalid inputs",
                Some(e),
            ))?,
            Ok(d) => Some(d),
        };
        info!(records = d.as_ref().unwrap().len(), "Received inputs");
    }

    // Only register the specification if it was not passed by hash.
    if register_spec {
        match state
            .store
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
    }

    match app
        .prepare_run(
            payload.run_type,
            payload.config,
            project.clone(),
            d,
            state.store.clone(),
        )
        .await
    {
        Err(e) => Err(error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed prepare run",
            Some(e),
        ))?,
        Ok(()) => (),
    }

    Ok(app)
}

pub async fn runs_create(
    Path(project_id): Path<i64>,
    headers: HeaderMap,
    State(state): State<Arc<APIState>>,
    Json(payload): Json<RunsCreatePayload>,
) -> (StatusCode, Json<APIResponse>) {
    let mut credentials = payload.credentials.clone();

    // Convert payload secrets vector to hash map to use them with {secrets.SECRET_NAME}.
    let secrets = run::Secrets {
        redacted: true,
        secrets: payload
            .secrets
            .iter()
            .map(|secret| (secret.name.clone(), secret.value.clone()))
            .collect::<HashMap<_, _>>(),
    };

    match headers.get("X-Dust-Workspace-Id") {
        Some(v) => match v.to_str() {
            Ok(v) => {
                credentials.insert("DUST_WORKSPACE_ID".to_string(), v.to_string());
            }
            _ => (),
        },
        None => (),
    };

    match headers.get("X-Dust-Feature-Flags") {
        Some(v) => match v.to_str() {
            Ok(v) => {
                credentials.insert("DUST_FEATURE_FLAGS".to_string(), v.to_string());
            }
            _ => (),
        },
        None => (),
    };

    match headers.get("X-Dust-Group-Ids") {
        Some(v) => match v.to_str() {
            Ok(v) => {
                credentials.insert("DUST_GROUP_IDS".to_string(), v.to_string());
            }
            _ => (),
        },
        None => (),
    };

    // If the run is made by a system key, it's a system run
    match headers.get("X-Dust-IsSystemRun") {
        Some(v) => match v.to_str() {
            Ok(v) => {
                credentials.insert("DUST_IS_SYSTEM_RUN".to_string(), v.to_string());
            }
            _ => (),
        },
        None => (),
    };

    match run_helper(project_id, payload.clone(), state.clone()).await {
        Ok(app) => {
            // The run is empty for now, we can clone it for the response.
            let run = app.run_ref().unwrap().clone();
            state.run_app(
                app,
                credentials,
                secrets,
                payload.store_blocks_results.unwrap_or(true),
            );
            (
                StatusCode::OK,
                Json(APIResponse {
                    error: None,
                    response: Some(json!({
                        "run": run,
                    })),
                }),
            )
        }
        Err(err) => err,
    }
}

pub async fn runs_create_stream(
    Path(project_id): Path<i64>,
    headers: HeaderMap,
    State(state): State<Arc<APIState>>,
    Json(payload): Json<RunsCreatePayload>,
) -> Sse<impl Stream<Item = anyhow::Result<Event, Infallible>>> {
    let mut credentials = payload.credentials.clone();

    // Convert payload secrets vector to hash map to use them with {secrets.SECRET_NAME}.
    let secrets = run::Secrets {
        redacted: true,
        secrets: payload
            .secrets
            .iter()
            .map(|secret| (secret.name.clone(), secret.value.clone()))
            .collect::<HashMap<_, _>>(),
    };

    match headers.get("X-Dust-Workspace-Id") {
        Some(v) => match v.to_str() {
            Ok(v) => {
                credentials.insert("DUST_WORKSPACE_ID".to_string(), v.to_string());
            }
            _ => (),
        },
        None => (),
    };

    match headers.get("X-Dust-Feature-Flags") {
        Some(v) => match v.to_str() {
            Ok(v) => {
                credentials.insert("DUST_FEATURE_FLAGS".to_string(), v.to_string());
            }
            _ => (),
        },
        None => (),
    };

    match headers.get("X-Dust-Group-Ids") {
        Some(v) => match v.to_str() {
            Ok(v) => {
                credentials.insert("DUST_GROUP_IDS".to_string(), v.to_string());
            }
            _ => (),
        },
        None => (),
    };

    // If the run is made by a system key, it's a system run
    match headers.get("X-Dust-IsSystemRun") {
        Some(v) => match v.to_str() {
            Ok(v) => {
                credentials.insert("DUST_IS_SYSTEM_RUN".to_string(), v.to_string());
            }
            _ => (),
        },
        None => (),
    };

    // create unbounded channel to pass as stream to Sse::new
    let (tx, mut rx) = unbounded_channel::<Value>();

    match run_helper(project_id, payload.clone(), state.clone()).await {
        Ok(mut app) => {
            // The run is empty for now, we can clone it for the response.
            // let run = app.run_ref().unwrap().clone();
            let store = state.store.clone();
            let databases_store = state.databases_store.clone();
            let qdrant_clients = state.qdrant_clients.clone();

            // Start a task that will run the app in the background.
            tokio::task::spawn(async move {
                let now = std::time::Instant::now();
                match app
                    .run(
                        credentials,
                        secrets,
                        store,
                        databases_store,
                        qdrant_clients,
                        Some(tx.clone()),
                        payload.store_blocks_results.unwrap_or(true),
                    )
                    .await
                {
                    Ok(()) => {
                        info!(
                            run = app.run_ref().unwrap().run_id(),
                            app_version = app.hash(),
                            elapsed = now.elapsed().as_millis(),
                            "Run finished"
                        );
                    }
                    Err(e) => {
                        error!(error = %e, "Run error");
                    }
                }
            });
        }
        Err((_, api_error)) => {
            let error = api_error.0.error.unwrap_or_else(|| APIError {
                code: "internal_server_error".to_string(),
                message: "The app execution failed unexpectedly".to_string(),
            });
            let _ = tx.send(json!({
                "type": "error",
                "content": {
                    "code": error.code,
                    "message": error.message,
                },
            }));
        }
    }

    let stream = async_stream::stream! {
        while let Some(v) = rx.recv().await {
            match Event::default().json_data(v) {
                Ok(event) => yield Ok(event),
                Err(e) => {
                    error!(error = %e, "Failed to create SSE event");
                }
            };
        }
        match Event::default().json_data(json!({
            "type": "final",
            "content": null,
        })) {
            Ok(event) => yield Ok(event),
            Err(e) => {
                error!(error = %e, "Failed to create SSE event");
            }
        };
    };

    Sse::new(stream).keep_alive(KeepAlive::default())
}

pub async fn runs_delete(
    Path((project_id, run_id)): Path<(i64, String)>,
    State(state): State<Arc<APIState>>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);
    match state.store.delete_run(&project, &run_id).await {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to delete run",
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

pub async fn runs_cancel(
    Path((project_id, run_id)): Path<(i64, String)>,
    State(state): State<Arc<APIState>>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);

    // Load the run and update its status to cancelled (errored)
    match state.store.load_run(&project, &run_id, None).await {
        Ok(Some(mut run)) => {
            // Check if the run is at least 1 hour old before allowing cancellation
            let current_time = utils::now();
            let run_age_ms = current_time - run.created();
            const ONE_HOUR_MS: u64 = 60 * 60 * 1000; // 1 hour in milliseconds

            if run_age_ms < ONE_HOUR_MS {
                info!(
                    run = run_id,
                    age_ms = run_age_ms,
                    "Run is too recent to cancel (must be at least 1 hour old)"
                );
                return error_response(
                    StatusCode::BAD_REQUEST,
                    "run_too_recent",
                    "Run must be at least 1 hour old before it can be cancelled",
                    None,
                );
            }

            // Cancel the run (marks run and all running blocks as errored)
            run.cancel();

            // Update the run status in the database
            match state
                .store
                .update_run_status(&project, &run_id, run.status())
                .await
            {
                Err(e) => {
                    error!(error = %e, run = run_id, "Failed to update run status to cancelled");
                    error_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "internal_server_error",
                        "Failed to cancel run",
                        Some(e),
                    )
                }
                Ok(_) => {
                    info!(run = run_id, "Run cancelled successfully");
                    (
                        StatusCode::OK,
                        Json(APIResponse {
                            error: None,
                            response: Some(json!({
                                "success": true
                            })),
                        }),
                    )
                }
            }
        }
        Ok(None) => {
            // Run not found in database
            info!(run = run_id, "Run not found for cancellation");
            (
                StatusCode::OK,
                Json(APIResponse {
                    error: None,
                    response: Some(json!({
                        "success": true
                    })),
                }),
            )
        }
        Err(e) => {
            error!(error = %e, run = run_id, "Failed to load run for cancellation");
            error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_server_error",
                "Failed to load run",
                Some(e),
            )
        }
    }
}

#[derive(serde::Deserialize)]
pub struct RunsListQuery {
    offset: usize,
    limit: usize,
    run_type: run::RunType,
}

pub async fn runs_list(
    Path(project_id): Path<i64>,
    State(state): State<Arc<APIState>>,
    Query(query): Query<RunsListQuery>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);
    match state
        .store
        .list_runs(&project, query.run_type, Some((query.limit, query.offset)))
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to list runs",
            Some(e),
        ),
        Ok((runs, total)) => (
            StatusCode::OK,
            Json(APIResponse {
                error: None,
                response: Some(json!({
                    "offset": query.offset,
                    "limit": query.limit,
                    "total": total,
                    "runs": runs,
                })),
            }),
        ),
    }
}

#[derive(serde::Deserialize)]
pub struct RunsRetrieveBatchPayload {
    run_ids: Vec<String>,
}

pub async fn runs_retrieve_batch(
    Path(project_id): Path<i64>,
    State(state): State<Arc<APIState>>,
    Json(payload): Json<RunsRetrieveBatchPayload>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);
    match state.store.load_runs(&project, payload.run_ids).await {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to retrieve runs",
            Some(e),
        ),
        Ok(runs) => (
            StatusCode::OK,
            Json(APIResponse {
                error: None,
                response: Some(json!({
                    "runs": runs,
                })),
            }),
        ),
    }
}

pub async fn runs_retrieve(
    Path((project_id, run_id)): Path<(i64, String)>,
    State(state): State<Arc<APIState>>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);
    match state.store.load_run(&project, &run_id, None).await {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to retrieve run",
            Some(e),
        ),
        Ok(run) => match run {
            None => error_response(
                StatusCode::NOT_FOUND,
                "run_not_found",
                &format!("No run found for id `{}`", run_id),
                None,
            ),
            Some(run) => (
                StatusCode::OK,
                Json(APIResponse {
                    error: None,
                    response: Some(json!({
                        "run": run,
                    })),
                }),
            ),
        },
    }
}

pub async fn runs_retrieve_block(
    Path((project_id, run_id, block_type, block_name)): Path<(i64, String, BlockType, String)>,
    State(state): State<Arc<APIState>>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);
    match state
        .store
        .load_run(&project, &run_id, Some(Some((block_type, block_name))))
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to retrieve run",
            Some(e),
        ),
        Ok(run) => match run {
            None => error_response(
                StatusCode::NOT_FOUND,
                "run_not_found",
                &format!("No run found for id `{}`", run_id),
                None,
            ),
            Some(run) => (
                StatusCode::OK,
                Json(APIResponse {
                    error: None,
                    response: Some(json!({
                        "run": run,
                    })),
                }),
            ),
        },
    }
}

pub async fn runs_retrieve_status(
    Path((project_id, run_id)): Path<(i64, String)>,
    State(state): State<Arc<APIState>>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);
    match state.store.load_run(&project, &run_id, Some(None)).await {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to retrieve run",
            Some(e),
        ),
        Ok(run) => match run {
            None => error_response(
                StatusCode::NOT_FOUND,
                "run_not_found",
                &format!("No run found for id `{}`", run_id),
                None,
            ),
            Some(run) => (
                StatusCode::OK,
                Json(APIResponse {
                    error: None,
                    response: Some(json!({
                        "run": run,
                    })),
                }),
            ),
        },
    }
}
