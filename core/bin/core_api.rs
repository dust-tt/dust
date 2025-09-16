use anyhow::{anyhow, Result};
use axum::{
    extract::{DefaultBodyLimit, Path, Query, State},
    http::header::HeaderMap,
    middleware::from_fn,
    response::{
        sse::{Event, KeepAlive, Sse},
        Json,
    },
    routing::{delete, get, patch, post},
    Router,
};
use axum_tracing_opentelemetry::middleware::{OtelAxumLayer, OtelInResponseLayer};
use futures::future::try_join_all;
use hyper::http::StatusCode;
use regex::Regex;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::convert::Infallible;
use std::sync::Arc;
use tikv_jemallocator::Jemalloc;
use tokio::{
    net::TcpListener,
    signal::unix::{signal, SignalKind},
    sync::mpsc::unbounded_channel,
};
use tokio_stream::Stream;
use tracing::{error, info};

use dust::api::api_state::APIState;
use dust::api::projects;
use dust::{
    api_keys::validate_api_key,
    app,
    blocks::block::BlockType,
    data_sources::{
        data_source::{self, Section},
        node::ProviderVisibility,
        qdrant::QdrantClients,
    },
    databases::{
        database::{execute_query, get_tables_schema, QueryDatabaseError},
        table::{LocalTable, Row, Table},
        table_upserts_background_worker::TableUpsertsBackgroundWorker,
    },
    databases_store::{self, gcs::GoogleCloudStorageDatabasesStore},
    dataset,
    deno::js_executor::JSExecutor,
    open_telemetry::init_subscribers,
    project,
    providers::provider::{provider, ProviderID},
    run,
    search_filter::{Filterable, SearchFilter},
    search_stores::search_store::{
        DatasourceViewFilter, ElasticsearchSearchStore, NodeItem, NodesSearchFilter,
        NodesSearchOptions, SearchStore, TagsQueryType,
    },
    sqlite_workers::client::HEARTBEAT_INTERVAL_MS,
    stores::{
        postgres,
        store::{self, FolderUpsertParams, TableUpsertParams},
    },
    utils::{self, error_response, APIError, APIResponse},
};

#[global_allocator]
static GLOBAL: Jemalloc = Jemalloc;

/// Index

async fn index() -> &'static str {
    "dust_api server ready"
}

/// Check a specification

#[derive(serde::Deserialize)]
struct SpecificationsCheckPayload {
    specification: String,
}

async fn specifications_check(
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

async fn specifications_retrieve(
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

async fn specifications_get(
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
struct SpecificationsPushPayload {
    specification: String,
}

async fn specifications_post(
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

/// Register a new dataset

#[derive(serde::Deserialize)]
struct DatasetsRegisterPayload {
    dataset_id: String,
    data: Vec<Value>,
}

async fn datasets_register(
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
async fn datasets_list(
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

async fn datasets_retrieve(
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

#[derive(Clone, serde::Deserialize)]
struct Secret {
    name: String,
    value: String,
}

#[derive(serde::Deserialize, Clone)]
struct RunsCreatePayload {
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

async fn run_helper(
    project_id: i64,
    payload: RunsCreatePayload,
    state: Arc<APIState>,
) -> Result<app::App, (StatusCode, Json<APIResponse>)> {
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

async fn runs_create(
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

async fn runs_create_stream(
    Path(project_id): Path<i64>,
    headers: HeaderMap,
    State(state): State<Arc<APIState>>,
    Json(payload): Json<RunsCreatePayload>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
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

async fn runs_delete(
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

async fn runs_cancel(
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
struct RunsListQuery {
    offset: usize,
    limit: usize,
    run_type: run::RunType,
}

async fn runs_list(
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
struct RunsRetrieveBatchPayload {
    run_ids: Vec<String>,
}

async fn runs_retrieve_batch(
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

async fn runs_retrieve(
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

async fn runs_retrieve_block(
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

async fn runs_retrieve_status(
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

/// Register a new data source.

#[derive(serde::Deserialize)]
struct DataSourcesRegisterPayload {
    config: data_source::DataSourceConfig,
    #[allow(dead_code)]
    credentials: run::Credentials,
    name: String,
}

async fn data_sources_register(
    Path(project_id): Path<i64>,
    State(state): State<Arc<APIState>>,
    Json(payload): Json<DataSourcesRegisterPayload>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);
    let ds = data_source::DataSource::new(&project, &payload.config, &payload.name);

    match ds
        .register(state.store.clone(), state.search_store.clone())
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to register data source",
            Some(e),
        ),
        Ok(()) => (
            StatusCode::OK,
            Json(APIResponse {
                error: None,
                response: Some(json!({
                    "data_source": {
                        "created": ds.created(),
                        "data_source_id": ds.data_source_id(),
                        "name": ds.name(),
                        "config": ds.config(),
                    },
                })),
            }),
        ),
    }
}

/// Update a data source.

#[derive(serde::Deserialize)]
struct DataSourcesUpdatePayload {
    name: String,
}

async fn data_sources_update(
    Path((project_id, data_source_id)): Path<(i64, String)>,
    State(state): State<Arc<APIState>>,
    Json(payload): Json<DataSourcesUpdatePayload>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);

    let mut ds = match state
        .store
        .load_data_source(&project, &data_source_id)
        .await
    {
        Err(e) => {
            return error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_server_error",
                "Failed to retrieve data source",
                Some(e),
            );
        }
        Ok(None) => {
            return error_response(
                StatusCode::NOT_FOUND,
                "data_source_not_found",
                &format!("No data source found for id `{}`", data_source_id),
                None,
            );
        }
        Ok(Some(ds)) => ds,
    };

    if let Err(e) = ds
        .update_name(
            state.store.clone(),
            state.search_store.clone(),
            &payload.name,
        )
        .await
    {
        return error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to update data source name",
            Some(e),
        );
    }

    (
        StatusCode::OK,
        Json(APIResponse {
            error: None,
            response: Some(json!({
                "data_source": {
                    "created": ds.created(),
                    "data_source_id": ds.data_source_id(),
                    "name": ds.name(),
                    "config": ds.config(),
                },
            })),
        }),
    )
}

#[derive(serde::Deserialize)]
struct DataSourcesTokenizePayload {
    text: String,
}
async fn data_sources_tokenize(
    Path((project_id, data_source_id)): Path<(i64, String)>,
    State(state): State<Arc<APIState>>,
    Json(payload): Json<DataSourcesTokenizePayload>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);
    match state
        .store
        .load_data_source(&project, &data_source_id)
        .await
    {
        Err(e) => {
            error!(
                error = %e,
                project_id = project_id,
                data_source_id = %data_source_id,
                "Failed to retrieve data source"
            );
            error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_server_error",
                "Failed to retrieve data source",
                Some(e),
            )
        }
        Ok(ds) => match ds {
            None => error_response(
                StatusCode::NOT_FOUND,
                "data_source_not_found",
                &format!("No data source found for id `{}`", data_source_id),
                None,
            ),
            Some(ds) => {
                let embedder_config = ds.embedder_config().clone();
                let provider_id = embedder_config.provider_id;
                let model_id = embedder_config.model_id.clone();
                let embedder =
                    provider(embedder_config.provider_id).embedder(embedder_config.model_id);
                match embedder.tokenize(vec![payload.text]).await {
                    Err(e) => {
                        error!(
                            error = %e,
                            project_id = project_id,
                            data_source_id = %data_source_id,
                            provider_id = %provider_id,
                            model_id = %model_id,
                            "Failed to tokenize text"
                        );
                        error_response(
                            StatusCode::INTERNAL_SERVER_ERROR,
                            "internal_server_error",
                            "Failed to tokenize text",
                            Some(e),
                        )
                    }
                    Ok(mut res) => match res.pop() {
                        None => {
                            error!(
                                project_id = project_id,
                                data_source_id = %data_source_id,
                                "Tokenizer returned empty result"
                            );
                            error_response(
                                StatusCode::INTERNAL_SERVER_ERROR,
                                "internal_server_error",
                                "Failed to tokenize text",
                                None,
                            )
                        }
                        Some(tokens) => (
                            StatusCode::OK,
                            Json(APIResponse {
                                error: None,
                                response: Some(json!({
                                    "tokens": tokens,
                                })),
                            }),
                        ),
                    },
                }
            }
        },
    }
}

async fn data_sources_retrieve(
    Path((project_id, data_source_id)): Path<(i64, String)>,
    State(state): State<Arc<APIState>>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);
    match state
        .store
        .load_data_source(&project, &data_source_id)
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to retrieve data source",
            Some(e),
        ),
        Ok(ds) => match ds {
            None => error_response(
                StatusCode::NOT_FOUND,
                "data_source_not_found",
                &format!("No data source found for id `{}`", data_source_id),
                None,
            ),
            Some(ds) => (
                StatusCode::OK,
                Json(APIResponse {
                    error: None,
                    response: Some(json!({
                        "data_source": {
                            "created": ds.created(),
                            "data_source_id": ds.data_source_id(),
                            "data_source_internal_id": ds.internal_id(),
                            "config": ds.config(),
                            "name": ds.name(),
                        },
                    })),
                }),
            ),
        },
    }
}

// Perform a search on a data source.

#[derive(serde::Deserialize)]
struct DatasourceSearchPayload {
    query: Option<String>,
    top_k: usize,
    filter: Option<SearchFilter>,
    view_filter: Option<SearchFilter>,
    full_text: bool,
    credentials: run::Credentials,
    target_document_tokens: Option<usize>,
}

async fn data_sources_search(
    Path((project_id, data_source_id)): Path<(i64, String)>,
    State(state): State<Arc<APIState>>,
    Json(payload): Json<DatasourceSearchPayload>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);
    match state
        .store
        .load_data_source(&project, &data_source_id)
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to retrieve data source",
            Some(e),
        ),
        Ok(ds) => match ds {
            None => error_response(
                StatusCode::NOT_FOUND,
                "data_source_not_found",
                &format!("No data source found for id `{}`", data_source_id),
                None,
            ),
            Some(ds) => match ds
                .search(
                    payload.credentials,
                    state.store.clone(),
                    state.qdrant_clients.clone(),
                    &payload.query,
                    payload.top_k,
                    match payload.filter {
                        Some(filter) => Some(filter.postprocess_for_data_source(&data_source_id)),
                        None => None,
                    },
                    match payload.view_filter {
                        Some(filter) => Some(filter.postprocess_for_data_source(&data_source_id)),
                        None => None,
                    },
                    payload.full_text,
                    payload.target_document_tokens,
                )
                .await
            {
                Ok(documents) => (
                    StatusCode::OK,
                    Json(APIResponse {
                        error: None,
                        response: Some(json!({
                            "documents": documents,
                        })),
                    }),
                ),
                Err(e) => error_response(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal_server_error",
                    "Failed to perform the search",
                    Some(e),
                ),
            },
        },
    }
}

/// Update tags of a document in a data source.

#[derive(serde::Deserialize)]
struct DataSourcesDocumentsUpdateTagsPayload {
    add_tags: Option<Vec<String>>,
    remove_tags: Option<Vec<String>>,
}

async fn data_sources_documents_update_tags(
    Path((project_id, data_source_id, document_id)): Path<(i64, String, String)>,
    State(state): State<Arc<APIState>>,
    Json(payload): Json<DataSourcesDocumentsUpdateTagsPayload>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);
    let add_tags = payload.add_tags.unwrap_or_else(|| vec![]);
    let remove_tags = payload.remove_tags.unwrap_or_else(|| vec![]);
    let add_tags_set: HashSet<String> = add_tags.iter().cloned().collect();
    let remove_tags_set: HashSet<String> = remove_tags.iter().cloned().collect();

    if add_tags_set.intersection(&remove_tags_set).count() > 0 {
        return error_response(
            StatusCode::BAD_REQUEST,
            "bad_request",
            "The `add_tags` and `remove_tags` lists have a non-empty intersection.",
            None,
        );
    }
    match state
        .store
        .load_data_source(&project, &data_source_id)
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to retrieve data source",
            Some(e),
        ),
        Ok(ds) => match ds {
            None => error_response(
                StatusCode::NOT_FOUND,
                "data_source_not_found",
                &format!("No data source found for id `{}`", data_source_id),
                None,
            ),
            Some(ds) => match ds
                .update_tags(
                    state.store.clone(),
                    state.qdrant_clients.clone(),
                    document_id,
                    add_tags_set.into_iter().collect(),
                    remove_tags_set.into_iter().collect(),
                )
                .await
            {
                Err(e) => error_response(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal_server_error",
                    "Failed to update document tags",
                    Some(e),
                ),
                Ok(_) => (
                    StatusCode::OK,
                    Json(APIResponse {
                        error: None,
                        response: Some(json!({
                            "data_source": {
                                "created": ds.created(),
                                "data_source_id": ds.data_source_id(),
                                "config": ds.config(),
                            },
                        })),
                    }),
                ),
            },
        },
    }
}

/// Update parents of a document in a data source.

#[derive(serde::Deserialize)]
struct DataSourcesDocumentsUpdateParentsPayload {
    parent_id: Option<String>,
    parents: Vec<String>,
}

async fn data_sources_documents_update_parents(
    Path((project_id, data_source_id, document_id)): Path<(i64, String, String)>,
    State(state): State<Arc<APIState>>,
    Json(payload): Json<DataSourcesDocumentsUpdateParentsPayload>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);

    if payload.parents.get(0) != Some(&document_id) {
        return error_response(
            StatusCode::BAD_REQUEST,
            "invalid_parents",
            "Failed to update document parents - parents[0] and document_id should be equal",
            None,
        );
    }

    match &payload.parent_id {
        Some(parent_id) => {
            if payload.parents.get(1) != Some(parent_id) {
                return error_response(
                    StatusCode::BAD_REQUEST,
                    "invalid_parent_id",
                    "Failed to update document parents - parents[1] and parent_id should be equal",
                    None,
                );
            }
        }
        None => {
            if payload.parents.len() > 1 {
                return error_response(
                    StatusCode::BAD_REQUEST,
                    "invalid_parent_id",
                    "Failed to update document parents - parent_id should not be null if parents[1] is defined",
                    None,
                );
            }
        }
    }

    match state
        .store
        .load_data_source(&project, &data_source_id)
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to retrieve data source",
            Some(e),
        ),
        Ok(ds) => match ds {
            None => error_response(
                StatusCode::NOT_FOUND,
                "data_source_not_found",
                &format!("No data source found for id `{}`", data_source_id),
                None,
            ),
            Some(ds) => match ds
                .update_parents(
                    state.store.clone(),
                    state.qdrant_clients.clone(),
                    state.search_store.clone(),
                    document_id,
                    payload.parents,
                )
                .await
            {
                Err(e) => error_response(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal_server_error",
                    "Failed to update document parents",
                    Some(e),
                ),
                Ok(_) => (
                    StatusCode::OK,
                    Json(APIResponse {
                        error: None,
                        response: Some(json!({
                            "data_source": {
                                "created": ds.created(),
                                "data_source_id": ds.data_source_id(),
                                "config": ds.config(),
                            },
                        })),
                    }),
                ),
            },
        },
    }
}

// List versions of a document in a data source.

#[derive(serde::Deserialize)]
struct DataSourcesDocumentsVersionsListQuery {
    offset: usize,
    limit: usize,
    latest_hash: Option<String>, // Hash of the latest version to retrieve.
    view_filter: Option<String>, // Parsed as JSON.
}

async fn data_sources_documents_versions_list(
    Path((project_id, data_source_id, document_id)): Path<(i64, String, String)>,
    State(state): State<Arc<APIState>>,
    Query(query): Query<DataSourcesDocumentsVersionsListQuery>,
) -> (StatusCode, Json<APIResponse>) {
    let view_filter: Option<SearchFilter> = match query
        .view_filter
        .as_ref()
        .and_then(|f| Some(serde_json::from_str(f)))
    {
        Some(Ok(f)) => Some(f),
        None => None,
        Some(Err(e)) => {
            return error_response(
                StatusCode::BAD_REQUEST,
                "invalid_view_filter",
                "Failed to parse view_filter query parameter",
                Some(e.into()),
            )
        }
    };

    let project = project::Project::new_from_id(project_id);
    match state
        .store
        .list_data_source_document_versions(
            &project,
            &data_source_id,
            &document_id,
            Some((query.limit, query.offset)),
            &match view_filter {
                Some(filter) => Some(filter.postprocess_for_data_source(&data_source_id)),
                None => None,
            },
            &query.latest_hash,
            true,
        )
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to list document versions",
            Some(e),
        ),
        Ok((versions, total)) => (
            StatusCode::OK,
            Json(APIResponse {
                error: None,
                response: Some(json!({
                    "offset": query.offset,
                    "limit": query.limit,
                    "total": total,
                    "versions": versions,
                })),
            }),
        ),
    }
}

/// Upsert a document in a data source.

#[derive(serde::Deserialize)]
struct DataSourcesDocumentsUpsertPayload {
    document_id: String,
    timestamp: Option<u64>,
    tags: Vec<String>,
    parent_id: Option<String>,
    parents: Vec<String>,
    source_url: Option<String>,
    section: Section,
    credentials: run::Credentials,
    light_document_output: Option<bool>,
    title: String,
    mime_type: String,
    provider_visibility: Option<ProviderVisibility>,
}

async fn data_sources_documents_upsert(
    Path((project_id, data_source_id)): Path<(i64, String)>,
    State(state): State<Arc<APIState>>,
    Json(payload): Json<DataSourcesDocumentsUpsertPayload>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);
    let light_document_output = payload.light_document_output.unwrap_or_else(|| false);

    // TODO(2025-03-17 aubin) - Add generic validation on node upserts instead of duplicating it for folders, tables, documents.
    if payload.parents.get(0) != Some(&payload.document_id) {
        return error_response(
            StatusCode::BAD_REQUEST,
            "invalid_parents",
            "Failed to upsert document - parents[0] and document_id should be equal",
            None,
        );
    }

    match &payload.parent_id {
        Some(parent_id) => {
            if payload.parents.get(1) != Some(parent_id) {
                return error_response(
                    StatusCode::BAD_REQUEST,
                    "invalid_parent_id",
                    "Failed to upsert document - parents[1] and parent_id should be equal",
                    None,
                );
            }
        }
        None => {
            if payload.parents.len() > 1 {
                return error_response(
                    StatusCode::BAD_REQUEST,
                    "invalid_parent_id",
                    "Failed to upsert document - parent_id should not be null if parents[1] is defined",
                    None,
                );
            }
        }
    }

    if payload.title.trim().is_empty() {
        return error_response(
            StatusCode::BAD_REQUEST,
            "title_is_empty",
            "Failed to upsert document - title is empty",
            None,
        );
    }

    match state
        .store
        .load_data_source(&project, &data_source_id)
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to retrieve data source",
            Some(e),
        ),
        Ok(ds) => match ds {
            None => error_response(
                StatusCode::NOT_FOUND,
                "data_source_not_found",
                &format!("No data source found for id `{}`", data_source_id),
                None,
            ),
            Some(ds) => {
                match ds
                    .upsert(
                        payload.credentials,
                        state.store.clone(),
                        state.qdrant_clients.clone(),
                        &payload.document_id,
                        payload.title,
                        payload.mime_type,
                        &payload.provider_visibility,
                        payload.timestamp,
                        &payload.tags,
                        &payload.parents,
                        &payload.source_url,
                        payload.section,
                        true, // preserve system tags
                        state.search_store.clone(),
                    )
                    .await
                {
                    Err(e) => error_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "internal_server_error",
                        "Failed to upsert document",
                        Some(e),
                    ),
                    Ok(d) => {
                        let mut response_data = json!({
                            "data_source": {
                                "created": ds.created(),
                                "data_source_id": ds.data_source_id(),
                                "config": ds.config(),
                            },
                        });
                        if light_document_output {
                            response_data["document"] = json!({
                                "hash": d.hash,
                                "text_size": d.text_size,
                                "chunk_count": d.chunk_count,
                                "token_count": d.token_count,
                                "created": d.created,
                            });
                        } else {
                            response_data["document"] = json!(d);
                        }
                        (
                            StatusCode::OK,
                            Json(APIResponse {
                                error: None,
                                response: Some(response_data),
                            }),
                        )
                    }
                }
            }
        },
    }
}

// Get a document blob from a data source.

async fn data_sources_documents_retrieve_blob(
    Path((project_id, data_source_id, document_id)): Path<(i64, String, String)>,
    State(state): State<Arc<APIState>>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);

    match state
        .store
        .load_data_source(&project, &data_source_id)
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to retrieve data source",
            Some(e),
        ),
        Ok(ds) => match ds {
            None => error_response(
                StatusCode::NOT_FOUND,
                "data_source_not_found",
                &format!("No data source found for id `{}`", data_source_id),
                None,
            ),
            Some(ds) => match ds
                .retrieve_api_blob(state.store.clone(), &document_id)
                .await
            {
                Err(e) => error_response(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal_server_error",
                    "Failed to retrieve document blob",
                    Some(e),
                ),
                Ok(None) => error_response(
                    StatusCode::NOT_FOUND,
                    "data_source_document_not_found",
                    &format!("No document found for id `{}`", document_id),
                    None,
                ),
                Ok(Some(blob)) => {
                    let blob_value = serde_json::to_value(blob).unwrap();
                    (
                        StatusCode::OK,
                        Json(APIResponse {
                            error: None,
                            response: Some(blob_value),
                        }),
                    )
                }
            },
        },
    }
}

/// List documents from a data source.

#[derive(serde::Deserialize)]
struct DataSourcesListQuery {
    document_ids: Option<String>, // Parse as JSON.
    limit: Option<usize>,
    offset: Option<usize>,
    view_filter: Option<String>, // Parsed as JSON.
}

async fn data_sources_documents_list(
    Path((project_id, data_source_id)): Path<(i64, String)>,
    State(state): State<Arc<APIState>>,
    Query(query): Query<DataSourcesListQuery>,
) -> (StatusCode, Json<APIResponse>) {
    let view_filter: Option<SearchFilter> = match query
        .view_filter
        .as_ref()
        .and_then(|f| Some(serde_json::from_str(f)))
    {
        Some(Ok(f)) => Some(f),
        None => None,
        Some(Err(e)) => {
            return error_response(
                StatusCode::BAD_REQUEST,
                "invalid_view_filter",
                "Failed to parse view_filter query parameter",
                Some(e.into()),
            )
        }
    };

    let limit_offset: Option<(usize, usize)> = match (query.limit, query.offset) {
        (Some(limit), Some(offset)) => Some((limit, offset)),
        _ => None,
    };

    let document_ids: Option<Vec<String>> = match query.document_ids {
        Some(ref ids) => match serde_json::from_str(ids) {
            Ok(parsed_ids) => Some(parsed_ids),
            Err(e) => {
                return error_response(
                    StatusCode::BAD_REQUEST,
                    "invalid_document_ids",
                    "Failed to parse document_ids query parameter",
                    Some(e.into()),
                )
            }
        },
        None => None,
    };

    let project = project::Project::new_from_id(project_id);
    match state
        .store
        .list_data_source_documents(
            &project,
            &data_source_id,
            &match view_filter {
                Some(filter) => Some(filter.postprocess_for_data_source(&data_source_id)),
                None => None,
            },
            &document_ids,
            limit_offset,
            true, // remove system tags
        )
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to list data source",
            Some(e),
        ),
        Ok(documents) => {
            let stats = state
                .search_store
                .get_data_source_stats(vec![data_source_id.clone()])
                .await;

            let total = match stats {
                Ok((data_source_stats, _)) => data_source_stats
                    .first()
                    .map(|ds| ds.document_count as usize)
                    .unwrap_or(0),
                Err(e) => {
                    error!(
                        error = %e,
                        data_source_id = data_source_id,
                        "Failed to get document count from Elasticsearch"
                    );
                    0
                }
            };

            return (
                StatusCode::OK,
                Json(APIResponse {
                    error: None,
                    response: Some(json!({
                        "documents": documents,
                        "limit": query.limit,
                        "offset": query.offset,
                        "total": total,
                    })),
                }),
            );
        }
    }
}

/// Retrieve document from a data source.
#[derive(serde::Deserialize)]
struct DataSourcesDocumentsRetrieveQuery {
    version_hash: Option<String>,
    view_filter: Option<String>, // Parsed as JSON.
}

async fn data_sources_documents_retrieve(
    Path((project_id, data_source_id, document_id)): Path<(i64, String, String)>,
    State(state): State<Arc<APIState>>,
    Query(query): Query<DataSourcesDocumentsRetrieveQuery>,
) -> (StatusCode, Json<APIResponse>) {
    let view_filter: Option<SearchFilter> = match query
        .view_filter
        .as_ref()
        .and_then(|f| Some(serde_json::from_str(f)))
    {
        Some(Ok(f)) => Some(f),
        None => None,
        Some(Err(e)) => {
            return error_response(
                StatusCode::BAD_REQUEST,
                "invalid_view_filter",
                "Failed to parse view_filter query parameter",
                Some(e.into()),
            )
        }
    };
    let project = project::Project::new_from_id(project_id);
    match state
        .store
        .load_data_source(&project, &data_source_id)
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to retrieve data source",
            Some(e),
        ),
        Ok(ds) => match ds {
            None => error_response(
                StatusCode::NOT_FOUND,
                "data_source_not_found",
                &format!("No data source found for id `{}`", data_source_id),
                None,
            ),
            Some(ds) => match ds
                .retrieve(
                    state.store.clone(),
                    &document_id,
                    &match view_filter {
                        Some(filter) => Some(filter.postprocess_for_data_source(&data_source_id)),
                        None => None,
                    },
                    true,
                    &query.version_hash,
                )
                .await
            {
                Err(e) => error_response(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal_server_error",
                    "Failed to retrieve document",
                    Some(e),
                ),
                Ok(None) => error_response(
                    StatusCode::NOT_FOUND,
                    "data_source_document_not_found",
                    &format!("No document found for id `{}`", document_id),
                    None,
                ),
                Ok(Some(d)) => (
                    StatusCode::OK,
                    Json(APIResponse {
                        error: None,
                        response: Some(json!({
                            "document": d,
                            "data_source": {
                                "created": ds.created(),
                                "data_source_id": ds.data_source_id(),
                                "config": ds.config(),
                                "name": ds.name(),
                            },
                        })),
                    }),
                ),
            },
        },
    }
}

/// Retrieve document text from a data source with offset and limit.
#[derive(serde::Deserialize)]
struct DataSourcesDocumentsRetrieveTextQuery {
    offset: Option<usize>,
    limit: Option<usize>,
    grep: Option<String>,
    version_hash: Option<String>,
    view_filter: Option<String>, // Parsed as JSON.
}

async fn data_sources_documents_retrieve_text(
    Path((project_id, data_source_id, document_id)): Path<(i64, String, String)>,
    State(state): State<Arc<APIState>>,
    Query(query): Query<DataSourcesDocumentsRetrieveTextQuery>,
) -> (StatusCode, Json<APIResponse>) {
    // Call the existing retrieve function
    let retrieve_query = DataSourcesDocumentsRetrieveQuery {
        version_hash: query.version_hash,
        view_filter: query.view_filter,
    };

    let (status, json_response) = data_sources_documents_retrieve(
        Path((project_id, data_source_id, document_id)),
        State(state),
        Query(retrieve_query),
    )
    .await;

    // If the request failed, return the error as-is
    if status != StatusCode::OK {
        return (status, json_response);
    }

    // Extract the document text from the response
    let text = json_response
        .response
        .as_ref()
        .and_then(|r| r.get("document"))
        .and_then(|d| d.get("text"))
        .and_then(|t| t.as_str());

    let text = match text {
        Some(t) => t,
        None => {
            return error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_server_error",
                "Failed to extract text from document response",
                None,
            )
        }
    };

    // First apply character-based offset and limit
    let offset = query.offset.unwrap_or(0);
    let limit = query.limit;

    let text_len = text.len();
    let start = offset.min(text_len);
    let end = match limit {
        Some(l) => (start + l).min(text_len),
        None => text_len,
    };

    let text_slice = &text[start..end];

    // Then apply grep filter if provided
    let filtered_text = match &query.grep {
        Some(pattern) => match Regex::new(pattern) {
            Ok(re) => {
                let lines: Vec<&str> = text_slice
                    .lines()
                    .filter(|line| re.is_match(line))
                    .collect();
                lines.join("\n")
            }
            Err(_) => {
                return error_response(
                    StatusCode::BAD_REQUEST,
                    "invalid_regex",
                    &format!("Invalid regular expression: {}", pattern),
                    None,
                )
            }
        },
        None => text_slice.to_string(),
    };

    (
        StatusCode::OK,
        Json(APIResponse {
            error: None,
            response: Some(json!({
                "text": filtered_text,
                "total_characters": text_len,
                "offset": start,
                "limit": limit,
            })),
        }),
    )
}

/// Delete document from a data source.

async fn data_sources_documents_delete(
    Path((project_id, data_source_id, document_id)): Path<(i64, String, String)>,
    State(state): State<Arc<APIState>>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);
    match state
        .store
        .load_data_source(&project, &data_source_id)
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to retrieve data source",
            Some(e),
        ),
        Ok(ds) => match ds {
            None => error_response(
                StatusCode::NOT_FOUND,
                "data_source_not_found",
                &format!("No data source found for id `{}`", data_source_id),
                None,
            ),
            Some(ds) => match ds
                .delete_document(
                    state.store.clone(),
                    state.qdrant_clients.clone(),
                    state.search_store.clone(),
                    &document_id,
                )
                .await
            {
                Err(e) => error_response(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal_server_error",
                    "Failed to delete document",
                    Some(e),
                ),
                Ok(_) => (
                    StatusCode::OK,
                    Json(APIResponse {
                        error: None,
                        response: Some(json!({
                            "data_source": {
                                "created": ds.created(),
                                "data_source_id": ds.data_source_id(),
                                "config": ds.config(),
                            },
                        })),
                    }),
                ),
            },
        },
    }
}

/// Scrub document deleted versions

async fn data_sources_documents_scrub_deleted_versions(
    Path((project_id, data_source_id, document_id)): Path<(i64, String, String)>,
    State(state): State<Arc<APIState>>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);
    match state
        .store
        .load_data_source(&project, &data_source_id)
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to retrieve data source",
            Some(e),
        ),
        Ok(ds) => match ds {
            None => error_response(
                StatusCode::NOT_FOUND,
                "data_source_not_found",
                &format!("No data source found for id `{}`", data_source_id),
                None,
            ),
            Some(ds) => match ds
                .scrub_document_deleted_versions(state.store.clone(), &document_id)
                .await
            {
                Err(e) => error_response(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal_server_error",
                    "Failed to scrub document deleted versions",
                    Some(e),
                ),
                Ok(versions) => (
                    StatusCode::OK,
                    Json(APIResponse {
                        error: None,
                        response: Some(json!({
                            "versions": versions,
                        })),
                    }),
                ),
            },
        },
    }
}

/// Delete a data source.

async fn data_sources_delete(
    Path((project_id, data_source_id)): Path<(i64, String)>,
    State(state): State<Arc<APIState>>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);
    match state
        .store
        .load_data_source(&project, &data_source_id)
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to retrieve data source",
            Some(e),
        ),
        Ok(ds) => match ds {
            None => error_response(
                StatusCode::NOT_FOUND,
                "data_source_not_found",
                &format!("No data source found for id `{}`", data_source_id),
                None,
            ),
            Some(ds) => match ds
                .delete(
                    state.store.clone(),
                    state.databases_store.clone(),
                    state.qdrant_clients.clone(),
                    state.search_store.clone(),
                )
                .await
            {
                Err(e) => error_response(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal_server_error",
                    "Failed to delete data source",
                    Some(e),
                ),
                Ok(_) => (
                    StatusCode::OK,
                    Json(APIResponse {
                        error: None,
                        response: Some(json!({
                            "data_source": {
                                "created": ds.created(),
                                "data_source_id": ds.data_source_id(),
                                "config": ds.config(),
                            }
                        })),
                    }),
                ),
            },
        },
    }
}

#[derive(serde::Deserialize)]
struct DatabasesTablesValidateCSVContentPayload {
    bucket: String,
    bucket_csv_path: String,
}

async fn tables_validate_csv_content(
    Json(payload): Json<DatabasesTablesValidateCSVContentPayload>,
) -> (StatusCode, Json<APIResponse>) {
    match LocalTable::validate_csv_content(&payload.bucket, &payload.bucket_csv_path).await {
        Ok(schema) => (
            StatusCode::OK,
            Json(APIResponse {
                error: None,
                response: Some(json!({
                    "schema": schema,
                })),
            }),
        ),
        Err(e) => error_response(
            StatusCode::BAD_REQUEST,
            "invalid_csv_content",
            "Failed to validate the CSV content",
            Some(e),
        ),
    }
}

#[derive(serde::Deserialize)]
struct DatabasesTablesUpsertPayload {
    table_id: String,
    name: String,
    description: String,
    timestamp: Option<u64>,
    tags: Vec<String>,
    parent_id: Option<String>,
    parents: Vec<String>,
    source_url: Option<String>,
    check_name_uniqueness: Option<bool>,

    // Remote DB specifics
    remote_database_table_id: Option<String>,
    remote_database_secret_id: Option<String>,

    // Node meta:
    title: String,
    mime_type: String,
    provider_visibility: Option<ProviderVisibility>,
}

async fn tables_upsert(
    Path((project_id, data_source_id)): Path<(i64, String)>,
    State(state): State<Arc<APIState>>,
    Json(payload): Json<DatabasesTablesUpsertPayload>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);

    if payload.parents.get(0) != Some(&payload.table_id) {
        return error_response(
            StatusCode::BAD_REQUEST,
            "invalid_parents",
            "Failed to upsert table - parents[0] and table_id should be equal",
            None,
        );
    }

    match &payload.parent_id {
        Some(parent_id) => {
            if payload.parents.get(1) != Some(parent_id) {
                return error_response(
                    StatusCode::BAD_REQUEST,
                    "invalid_parent_id",
                    "Failed to upsert table - parents[1] and parent_id should be equal",
                    None,
                );
            }
        }
        None => {
            if payload.parents.len() > 1 {
                return error_response(
                        StatusCode::BAD_REQUEST,
                        "invalid_parent_id",
                        "Failed to upsert table - parent_id should not be null if parents[1] is defined",
                        None,
                    );
            }
        }
    }

    if payload.title.trim().is_empty() {
        return error_response(
            StatusCode::BAD_REQUEST,
            "title_is_empty",
            "Failed to upsert table - title is empty",
            None,
        );
    }

    match state
        .store
        .upsert_data_source_table(
            project,
            data_source_id,
            TableUpsertParams {
                table_id: payload.table_id,
                name: payload.name,
                description: payload.description,
                timestamp: payload.timestamp.unwrap_or(utils::now()),
                tags: payload.tags,
                parents: payload.parents,
                source_url: payload.source_url,
                remote_database_table_id: payload.remote_database_table_id,
                remote_database_secret_id: payload.remote_database_secret_id,
                title: payload.title,
                mime_type: payload.mime_type,
                provider_visibility: payload.provider_visibility,
                check_name_uniqueness: payload.check_name_uniqueness,
            },
        )
        .await
    {
        Ok(table) => match state
            .search_store
            .index_node(NodeItem::Table(table.clone()))
            .await
        {
            Ok(_) => (
                StatusCode::OK,
                Json(APIResponse {
                    error: None,
                    response: Some(json!({ "table": table })),
                }),
            ),
            Err(e) => error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_server_error",
                "Failed to index table",
                Some(e),
            ),
        },
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to upsert table",
            Some(e),
        ),
    }
}

/// Retrieve table from a data source.
#[derive(serde::Deserialize)]
struct TableRetrieveQuery {
    view_filter: Option<String>, // Parsed as JSON.
}

async fn tables_retrieve(
    Path((project_id, data_source_id, table_id)): Path<(i64, String, String)>,
    State(state): State<Arc<APIState>>,
    Query(query): Query<TableRetrieveQuery>,
) -> (StatusCode, Json<APIResponse>) {
    let view_filter: Option<SearchFilter> = match query
        .view_filter
        .as_ref()
        .and_then(|f| Some(serde_json::from_str(f)))
    {
        Some(Ok(f)) => Some(f),
        None => None,
        Some(Err(e)) => {
            return error_response(
                StatusCode::BAD_REQUEST,
                "invalid_view_filter",
                "Failed to parse view_filter query parameter",
                Some(e.into()),
            )
        }
    };

    let project = project::Project::new_from_id(project_id);

    match state
        .store
        .load_data_source_table(&project, &data_source_id, &table_id)
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to retrieve table",
            Some(e),
        ),
        Ok(table) => match table.filter(|table| table.match_filter(&view_filter)) {
            None => error_response(
                StatusCode::NOT_FOUND,
                "table_not_found",
                &format!("No table found for id `{}`", table_id),
                None,
            ),
            Some(table) => (
                StatusCode::OK,
                Json(APIResponse {
                    error: None,
                    response: Some(json!({
                        "table": table
                    })),
                }),
            ),
        },
    }
}

#[derive(serde::Deserialize)]
struct TableListQuery {
    limit: Option<usize>,
    offset: Option<usize>,
    table_ids: Option<String>,   // Parsed as JSON.
    view_filter: Option<String>, // Parsed as JSON.
}

async fn tables_list(
    Path((project_id, data_source_id)): Path<(i64, String)>,
    State(state): State<Arc<APIState>>,
    Query(query): Query<TableListQuery>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);
    let view_filter: Option<SearchFilter> = match query
        .view_filter
        .as_ref()
        .and_then(|f| Some(serde_json::from_str(f)))
    {
        Some(Ok(f)) => Some(f),
        None => None,
        Some(Err(e)) => {
            return error_response(
                StatusCode::BAD_REQUEST,
                "invalid_view_filter",
                "Failed to parse view_filter query parameter",
                Some(e.into()),
            )
        }
    };

    let limit_offset: Option<(usize, usize)> = match (query.limit, query.offset) {
        (Some(limit), Some(offset)) => Some((limit, offset)),
        _ => None,
    };

    let table_ids: Option<Vec<String>> = match query.table_ids {
        Some(ref ids) => match serde_json::from_str(ids) {
            Ok(parsed_ids) => Some(parsed_ids),
            Err(e) => {
                return error_response(
                    StatusCode::BAD_REQUEST,
                    "invalid_table_ids",
                    "Failed to parse table_ids query parameter",
                    Some(e.into()),
                )
            }
        },
        None => None,
    };

    match state
        .store
        .list_data_source_tables(
            &project,
            &data_source_id,
            &view_filter,
            &table_ids,
            limit_offset,
        )
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to list tables",
            Some(e),
        ),
        Ok((tables, total)) => (
            StatusCode::OK,
            Json(APIResponse {
                error: None,
                response: Some(json!({
                    "limit": query.limit,
                    "offset": query.offset,
                    "tables": tables,
                    "total": total,
                })),
            }),
        ),
    }
}

async fn tables_delete(
    Path((project_id, data_source_id, table_id)): Path<(i64, String, String)>,
    State(state): State<Arc<APIState>>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);

    match state
        .store
        .load_data_source_table(&project, &data_source_id, &table_id)
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to load table",
            Some(e),
        ),
        Ok(None) => (
            StatusCode::OK,
            Json(APIResponse {
                error: None,
                response: Some(json!({
                    "success": true,
                })),
            }),
        ),
        Ok(Some(table)) => {
            match table
                .delete(
                    state.store.clone(),
                    state.databases_store.clone(),
                    Some(state.search_store.clone()),
                )
                .await
            {
                Err(e) => error_response(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal_server_error",
                    "Failed to delete table",
                    Some(e),
                ),
                Ok(_) => (
                    StatusCode::OK,
                    Json(APIResponse {
                        error: None,
                        response: Some(json!({
                            "success": true,
                        })),
                    }),
                ),
            }
        }
    }
}

async fn tables_retrieve_blob(
    Path((project_id, data_source_id, table_id)): Path<(i64, String, String)>,
    State(state): State<Arc<APIState>>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);

    match state
        .store
        .load_data_source_table(&project, &data_source_id, &table_id)
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to load table",
            Some(e),
        ),
        Ok(None) => error_response(
            StatusCode::NOT_FOUND,
            "table_not_found",
            &format!("No table found for id `{}`", table_id),
            None,
        ),
        Ok(Some(table)) => match table.retrieve_api_blob(state.databases_store.clone()).await {
            Err(e) => error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_server_error",
                "Failed to retrieve document blob",
                Some(e),
            ),
            Ok(blob) => {
                let blob_value = serde_json::to_value(blob).unwrap();
                (
                    StatusCode::OK,
                    Json(APIResponse {
                        error: None,
                        response: Some(blob_value),
                    }),
                )
            }
        },
    }
}

async fn tables_update_parents(
    Path((project_id, data_source_id, table_id)): Path<(i64, String, String)>,
    State(state): State<Arc<APIState>>,
    Json(payload): Json<DataSourcesDocumentsUpdateParentsPayload>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);

    if payload.parents.get(0) != Some(&table_id) {
        return error_response(
            StatusCode::BAD_REQUEST,
            "invalid_parents",
            "Failed to update table parents - parents[0] and table_id should be equal",
            None,
        );
    }

    match &payload.parent_id {
        Some(parent_id) => {
            if payload.parents.get(1) != Some(parent_id) {
                return error_response(
                    StatusCode::BAD_REQUEST,
                    "invalid_parent_id",
                    "Failed to update table parents - parents[1] and parent_id should be equal",
                    None,
                );
            }
        }
        None => {
            if payload.parents.len() > 1 {
                return error_response(
                        StatusCode::BAD_REQUEST,
                        "invalid_parent_id",
                        "Failed to update table parents - parent_id should not be null if parents[1] is defined",
                        None,
                    );
            }
        }
    }

    match state
        .store
        .load_data_source_table(&project, &data_source_id, &table_id)
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to load table",
            Some(e),
        ),
        Ok(None) => error_response(
            StatusCode::NOT_FOUND,
            "table_not_found",
            &format!("No table found for id `{}`", table_id),
            None,
        ),
        Ok(Some(table)) => match table
            .update_parents(
                state.store.clone(),
                state.search_store.clone(),
                payload.parents.clone(),
            )
            .await
        {
            Err(e) => error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_server_error",
                "Failed to update table parents",
                Some(e),
            ),
            Ok(_) => (
                StatusCode::OK,
                Json(APIResponse {
                    error: None,
                    response: Some(json!({
                        "success": true,
                    })),
                }),
            ),
        },
    }
}

#[derive(serde::Deserialize)]
struct DatabasesTablesUpsertCSVContentPayload {
    bucket: String,
    bucket_csv_path: String,
    truncate: Option<bool>,
}

async fn tables_csv_upsert(
    Path((project_id, data_source_id, table_id)): Path<(i64, String, String)>,
    State(state): State<Arc<APIState>>,
    Json(payload): Json<DatabasesTablesUpsertCSVContentPayload>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);

    match state
        .store
        .load_data_source_table(&project, &data_source_id, &table_id)
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to load table",
            Some(e),
        ),
        Ok(None) => error_response(
            StatusCode::NOT_FOUND,
            "table_not_found",
            &format!("No table found for id `{}`", table_id),
            None,
        ),
        Ok(Some(table)) => match LocalTable::from_table(table) {
            Err(e) => error_response(
                StatusCode::BAD_REQUEST,
                "invalid_table",
                "Table is not local",
                Some(e),
            ),
            Ok(table) => {
                match table
                    .upsert_csv_content(
                        state.store.clone(),
                        state.databases_store.clone(),
                        &payload.bucket,
                        &payload.bucket_csv_path,
                        payload.truncate.unwrap_or_else(|| false),
                    )
                    .await
                {
                    Err(e) => error_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "internal_server_error",
                        "Failed to upsert rows",
                        Some(e),
                    ),
                    Ok(_) => (
                        StatusCode::OK,
                        Json(APIResponse {
                            error: None,
                            response: Some(json!({
                                "success": true,
                            })),
                        }),
                    ),
                }
            }
        },
    }
}

#[derive(serde::Deserialize)]
struct TablesRowsUpsertPayload {
    rows: Vec<Row>,
    truncate: Option<bool>,
}

async fn tables_rows_upsert(
    Path((project_id, data_source_id, table_id)): Path<(i64, String, String)>,
    State(state): State<Arc<APIState>>,
    Json(payload): Json<TablesRowsUpsertPayload>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);

    match state
        .store
        .load_data_source_table(&project, &data_source_id, &table_id)
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to load table",
            Some(e),
        ),
        Ok(None) => error_response(
            StatusCode::NOT_FOUND,
            "table_not_found",
            &format!("No table found for id `{}`", table_id),
            None,
        ),
        Ok(Some(table)) => match LocalTable::from_table(table) {
            Err(e) => error_response(
                StatusCode::BAD_REQUEST,
                "invalid_table",
                "Table is not local",
                Some(e),
            ),
            Ok(table) => {
                match table
                    .upsert_rows(
                        state.store.clone(),
                        state.databases_store.clone(),
                        payload.rows,
                        payload.truncate.unwrap_or_else(|| false),
                    )
                    .await
                {
                    Err(e) => error_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "internal_server_error",
                        "Failed to upsert rows",
                        Some(e),
                    ),
                    Ok(_) => (
                        StatusCode::OK,
                        Json(APIResponse {
                            error: None,
                            response: Some(json!({
                                "success": true,
                            })),
                        }),
                    ),
                }
            }
        },
    }
}

async fn tables_rows_retrieve(
    Path((project_id, data_source_id, table_id, row_id)): Path<(i64, String, String, String)>,
    State(state): State<Arc<APIState>>,
    Query(query): Query<TableRetrieveQuery>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);
    let view_filter: Option<SearchFilter> = match query
        .view_filter
        .as_ref()
        .and_then(|f| Some(serde_json::from_str(f)))
    {
        Some(Ok(f)) => Some(f),
        None => None,
        Some(Err(e)) => {
            return error_response(
                StatusCode::BAD_REQUEST,
                "invalid_view_filter",
                "Failed to parse view_filter query parameter",
                Some(e.into()),
            )
        }
    };

    match state
        .store
        .load_data_source_table(&project, &data_source_id, &table_id)
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to load table",
            Some(e),
        ),
        Ok(table) => match table.filter(|table| table.match_filter(&view_filter)) {
            None => error_response(
                StatusCode::NOT_FOUND,
                "table_not_found",
                &format!("No table found for id `{}`", table_id),
                None,
            ),
            Some(table) => match LocalTable::from_table(table) {
                Err(e) => error_response(
                    StatusCode::BAD_REQUEST,
                    "invalid_table",
                    "Table is not local",
                    Some(e),
                ),
                Ok(table) => {
                    match table
                        .retrieve_row(state.databases_store.clone(), &row_id)
                        .await
                    {
                        Err(e) => error_response(
                            StatusCode::INTERNAL_SERVER_ERROR,
                            "internal_server_error",
                            "Failed to load row",
                            Some(e),
                        ),
                        Ok(None) => error_response(
                            StatusCode::NOT_FOUND,
                            "table_row_not_found",
                            &format!("No table row found for id `{}`", row_id),
                            None,
                        ),
                        Ok(Some(row)) => (
                            StatusCode::OK,
                            Json(APIResponse {
                                error: None,
                                response: Some(json!({
                                    "row": row,
                                })),
                            }),
                        ),
                    }
                }
            },
        },
    }
}

async fn tables_rows_delete(
    Path((project_id, data_source_id, table_id, row_id)): Path<(i64, String, String, String)>,
    State(state): State<Arc<APIState>>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);

    match state
        .store
        .load_data_source_table(&project, &data_source_id, &table_id)
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to load table",
            Some(e),
        ),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(APIResponse {
                error: Some(APIError {
                    code: "table_not_found".to_string(),
                    message: format!("No table found for id `{}`", table_id),
                }),
                response: None,
            }),
        ),
        Ok(Some(table)) => match LocalTable::from_table(table) {
            Err(e) => error_response(
                StatusCode::BAD_REQUEST,
                "invalid_table",
                "Table is not local",
                Some(e),
            ),
            Ok(table) => {
                match table
                    .delete_row(state.databases_store.clone(), &row_id)
                    .await
                {
                    Err(e) => error_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "internal_server_error",
                        "Failed to delete row",
                        Some(e),
                    ),
                    Ok(_) => (
                        StatusCode::OK,
                        Json(APIResponse {
                            error: None,
                            response: Some(json!({
                                "success": true,
                            })),
                        }),
                    ),
                }
            }
        },
    }
}

#[derive(serde::Deserialize)]
struct DatabasesRowsListQuery {
    offset: usize,
    limit: usize,
    view_filter: Option<String>,
}

async fn tables_rows_list(
    Path((project_id, data_source_id, table_id)): Path<(i64, String, String)>,
    State(state): State<Arc<APIState>>,
    Query(query): Query<DatabasesRowsListQuery>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);
    let view_filter: Option<SearchFilter> = match query
        .view_filter
        .as_ref()
        .and_then(|f| Some(serde_json::from_str(f)))
    {
        Some(Ok(f)) => Some(f),
        None => None,
        Some(Err(e)) => {
            return error_response(
                StatusCode::BAD_REQUEST,
                "invalid_view_filter",
                "Failed to parse view_filter query parameter",
                Some(e.into()),
            )
        }
    };

    match state
        .store
        .load_data_source_table(&project, &data_source_id, &table_id)
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to load table",
            Some(e),
        ),
        Ok(table) => match table.filter(|table| table.match_filter(&view_filter)) {
            None => error_response(
                StatusCode::NOT_FOUND,
                "table_not_found",
                &format!("No table found for id `{}`", table_id),
                None,
            ),
            Some(table) => match LocalTable::from_table(table) {
                Err(e) => error_response(
                    StatusCode::BAD_REQUEST,
                    "invalid_table",
                    "Table is not local",
                    Some(e),
                ),
                Ok(table) => match table
                    .list_rows(
                        state.databases_store.clone(),
                        Some((query.limit, query.offset)),
                    )
                    .await
                {
                    Err(e) => error_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "internal_server_error",
                        "Failed to list rows",
                        Some(e),
                    ),
                    Ok((rows, total)) => (
                        StatusCode::OK,
                        Json(APIResponse {
                            error: None,
                            response: Some(json!({
                                "offset": query.offset,
                                "limit": query.limit,
                                "total": total,
                                "rows": rows,
                            })),
                        }),
                    ),
                },
            },
        },
    }
}

#[derive(serde::Deserialize)]
struct FoldersUpsertPayload {
    folder_id: String,
    timestamp: Option<u64>,
    parent_id: Option<String>,
    parents: Vec<String>,
    title: String,
    mime_type: String,
    source_url: Option<String>,
    provider_visibility: Option<ProviderVisibility>,
}

async fn folders_upsert(
    Path((project_id, data_source_id)): Path<(i64, String)>,
    State(state): State<Arc<APIState>>,
    Json(payload): Json<FoldersUpsertPayload>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);

    if payload.parents.get(0) != Some(&payload.folder_id) {
        return error_response(
            StatusCode::BAD_REQUEST,
            "invalid_parents",
            "Failed to upsert folder - parents[0] and folder_id should be equal",
            None,
        );
    }

    match &payload.parent_id {
        Some(parent_id) => {
            if payload.parents.get(1) != Some(parent_id) {
                return error_response(
                    StatusCode::BAD_REQUEST,
                    "invalid_parent_id",
                    "Failed to upsert folder - parents[1] and parent_id should be equal",
                    None,
                );
            }
        }
        None => {
            if payload.parents.len() > 1 {
                return error_response(
                        StatusCode::BAD_REQUEST,
                        "invalid_parent_id",
                        "Failed to upsert folder - parent_id should not be null if parents[1] is defined",
                        None,
                    );
            }
        }
    }

    if payload.title.trim().is_empty() {
        return error_response(
            StatusCode::BAD_REQUEST,
            "title_is_empty",
            "Failed to upsert folder - title is empty",
            None,
        );
    }

    match state
        .store
        .upsert_data_source_folder(
            project,
            data_source_id,
            FolderUpsertParams {
                folder_id: payload.folder_id,
                timestamp: payload.timestamp.unwrap_or(utils::now()),
                parents: payload.parents,
                title: payload.title,
                mime_type: payload.mime_type,
                source_url: payload.source_url,
                provider_visibility: payload.provider_visibility,
            },
        )
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to upsert folder",
            Some(e),
        ),
        Ok(folder) => match state
            .search_store
            .index_node(NodeItem::Folder(folder.clone()))
            .await
        {
            Ok(_) => (
                StatusCode::OK,
                Json(APIResponse {
                    error: None,
                    response: Some(json!({
                        "folder": folder
                    })),
                }),
            ),
            Err(e) => error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_server_error",
                "Failed to index folder",
                Some(e),
            ),
        },
    }
}

async fn folders_retrieve(
    Path((project_id, data_source_id, folder_id)): Path<(i64, String, String)>,
    State(state): State<Arc<APIState>>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);

    match state
        .store
        .load_data_source_folder(&project, &data_source_id, &folder_id)
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to load folder",
            Some(e),
        ),
        Ok(folder) => (
            StatusCode::OK,
            Json(APIResponse {
                error: None,
                response: Some(json!({
                    "folder": folder
                })),
            }),
        ),
    }
}

#[derive(serde::Deserialize)]
struct FoldersListQuery {
    limit: Option<usize>,
    offset: Option<usize>,
    folder_ids: Option<String>,  // Parsed as JSON.
    view_filter: Option<String>, // Parsed as JSON.
}

async fn folders_list(
    Path((project_id, data_source_id)): Path<(i64, String)>,
    State(state): State<Arc<APIState>>,
    Query(query): Query<FoldersListQuery>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);
    let view_filter: Option<SearchFilter> = match query
        .view_filter
        .as_ref()
        .and_then(|f| Some(serde_json::from_str(f)))
    {
        Some(Ok(f)) => Some(f),
        None => None,
        Some(Err(e)) => {
            return error_response(
                StatusCode::BAD_REQUEST,
                "invalid_view_filter",
                "Failed to parse view_filter query parameter",
                Some(e.into()),
            )
        }
    };

    let limit_offset: Option<(usize, usize)> = match (query.limit, query.offset) {
        (Some(limit), Some(offset)) => Some((limit, offset)),
        _ => None,
    };

    let folder_ids: Option<Vec<String>> = match query.folder_ids {
        Some(ref ids) => match serde_json::from_str(ids) {
            Ok(parsed_ids) => Some(parsed_ids),
            Err(e) => {
                return error_response(
                    StatusCode::BAD_REQUEST,
                    "invalid_folder_ids",
                    "Failed to parse folder_ids query parameter",
                    Some(e.into()),
                )
            }
        },
        None => None,
    };

    match state
        .store
        .list_data_source_folders(
            &project,
            &data_source_id,
            &view_filter,
            &folder_ids,
            limit_offset,
        )
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to list folders",
            Some(e),
        ),
        Ok((folders, total)) => (
            StatusCode::OK,
            Json(APIResponse {
                error: None,
                response: Some(json!({
                    "limit": query.limit,
                    "offset": query.offset,
                    "folders": folders,
                    "total": total,
                })),
            }),
        ),
    }
}

async fn folders_delete(
    Path((project_id, data_source_id, folder_id)): Path<(i64, String, String)>,
    State(state): State<Arc<APIState>>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);

    let result = async {
        let folder = match state
            .store
            .load_data_source_folder(&project, &data_source_id, &folder_id)
            .await?
        {
            Some(folder) => folder,
            None => return Ok(()),
        };
        state
            .store
            .delete_data_source_folder(&project, &data_source_id, &folder_id)
            .await?;
        state
            .search_store
            .delete_node(NodeItem::Folder(folder))
            .await?;
        Ok(())
    }
    .await;

    match result {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to delete folder",
            Some(e),
        ),
        Ok(_) => (
            StatusCode::OK,
            Json(APIResponse {
                error: None,
                response: Some(json!({"success": true})),
            }),
        ),
    }
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct NodesSearchPayload {
    query: Option<String>,
    filter: NodesSearchFilter,
    options: Option<NodesSearchOptions>,
}

async fn nodes_search(
    State(state): State<Arc<APIState>>,
    Json(payload): Json<NodesSearchPayload>,
) -> (StatusCode, Json<APIResponse>) {
    let (nodes, hit_count, hit_count_is_accurate, next_cursor, warning_code) = match state
        .search_store
        .search_nodes(
            payload.query,
            payload.filter,
            payload.options,
            state.store.clone(),
        )
        .await
    {
        Ok((nodes, hit_count, hit_count_is_accurate, next_cursor, warning_code)) => (
            nodes,
            hit_count,
            hit_count_is_accurate,
            next_cursor,
            warning_code,
        ),
        Err(e) => {
            return error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_server_error",
                "Failed to search nodes",
                Some(e),
            );
        }
    };

    (
        StatusCode::OK,
        Json(APIResponse {
            error: None,
            response: Some(json!({
                "nodes": nodes,
                "hit_count": hit_count,
                "hit_count_is_accurate": hit_count_is_accurate,
                "next_page_cursor": next_cursor,
                "warning_code": warning_code,
            })),
        }),
    )
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct DataSourceAndProject {
    data_source_id: String,
    project_id: i64,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct StatsPayload {
    query: Vec<DataSourceAndProject>,
}

async fn data_sources_stats(
    State(state): State<Arc<APIState>>,
    Json(payload): Json<StatsPayload>,
) -> (StatusCode, Json<APIResponse>) {
    // Validate payload data sources
    if payload.query.is_empty() {
        return error_response(
            StatusCode::BAD_REQUEST,
            "invalid_parameter",
            "query array cannot be empty",
            None,
        );
    }

    // Convert payload data to project_data_sources format
    let project_data_sources: Vec<(i64, String)> = payload
        .query
        .into_iter()
        .map(|item| (item.project_id, item.data_source_id))
        .collect();

    match state
        .store
        .load_data_sources(project_data_sources.clone())
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to retrieve data sources",
            Some(e),
        ),
        Ok(data_sources) if data_sources.is_empty() => error_response(
            StatusCode::NOT_FOUND,
            "data_sources_not_found",
            "No data sources found",
            None,
        ),
        Ok(data_sources) => {
            let ds_ids: Vec<String> = data_sources
                .iter()
                .map(|ds| ds.data_source_id().to_string())
                .collect();

            match state.search_store.get_data_source_stats(ds_ids).await {
                Ok((stats, overall_total_size)) => (
                    StatusCode::OK,
                    Json(APIResponse {
                        error: None,
                        response: Some(json!({
                            "data_sources": stats,
                            "overall_total_size": overall_total_size,
                        })),
                    }),
                ),
                Err(e) => error_response(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal_server_error",
                    "Failed to get stats relative to data sources",
                    Some(e),
                ),
            }
        }
    }
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct TagsSearchPayload {
    query: Option<String>,
    query_type: Option<TagsQueryType>,
    data_source_views: Vec<DatasourceViewFilter>,
    node_ids: Option<Vec<String>>,
    limit: Option<u64>,
}

async fn tags_search(
    State(state): State<Arc<APIState>>,
    Json(payload): Json<TagsSearchPayload>,
) -> (StatusCode, Json<APIResponse>) {
    match state
        .search_store
        .search_tags(
            payload.query,
            payload.query_type,
            payload.data_source_views,
            payload.node_ids,
            payload.limit,
        )
        .await
    {
        Ok(tags) => (
            StatusCode::OK,
            Json(APIResponse {
                error: None,
                response: Some(json!({
                    "tags": tags
                        .into_iter()
                        .map(|(k, v, ds)| json!({
                            "tag": k,
                            "match_count": v,
                            "data_sources": ds.into_iter()
                                .map(|(k, _v)| k)
                                .collect::<Vec<_>>()
                        }))
                        .collect::<Vec<serde_json::Value>>()
                })),
            }),
        ),
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to list tags",
            Some(e),
        ),
    }
}

#[derive(serde::Deserialize)]
struct DatabasesSchemaPayload {
    tables: Vec<(i64, String, String)>,
}

async fn databases_schema_retrieve(
    State(state): State<Arc<APIState>>,
    Json(payload): Json<DatabasesSchemaPayload>,
) -> (StatusCode, Json<APIResponse>) {
    match try_join_all(
        payload
            .tables
            .iter()
            .map(|(project_id, data_source_id, table_id)| {
                let project = project::Project::new_from_id(*project_id);
                let store = state.store.clone();
                async move {
                    store
                        .load_data_source_table(&project, data_source_id, table_id)
                        .await
                }
            }),
    )
    .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to retrieve tables",
            Some(e),
        ),
        Ok(tables) => match tables.into_iter().collect::<Option<Vec<Table>>>() {
            None => error_response(
                StatusCode::NOT_FOUND,
                "table_not_found",
                "No table found",
                None,
            ),
            Some(tables) => {
                match get_tables_schema(tables, state.store.clone(), state.databases_store.clone())
                    .await
                {
                    Err(e) => error_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "schema_retrieval_failed",
                        "Failed to retrieve table schemas",
                        Some(e),
                    ),
                    Ok((dialect, schemas)) => (
                        StatusCode::OK,
                        Json(APIResponse {
                            error: None,
                            response: Some(json!({
                                "dialect": dialect,
                                "schemas": schemas.iter().map(|s| {
                                    json!({
                                        "table_schema": s.schema,
                                        "dbml": s.dbml,
                                        "head": s.head,
                                    })
                                }).collect::<Vec<_>>(),
                            })),
                        }),
                    ),
                }
            }
        },
    }
}

#[derive(serde::Deserialize)]
struct DatabaseQueryRunPayload {
    query: String,
    tables: Vec<(i64, String, String)>,
}

async fn databases_query_run(
    State(state): State<Arc<APIState>>,
    Json(payload): Json<DatabaseQueryRunPayload>,
) -> (StatusCode, Json<APIResponse>) {
    match try_join_all(
        payload
            .tables
            .into_iter()
            .map(|(project_id, data_source_id, table_id)| {
                let project = project::Project::new_from_id(project_id);
                let store = state.store.clone();
                async move {
                    store
                        .load_data_source_table(&project, &data_source_id, &table_id)
                        .await
                }
            }),
    )
    .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to retrieve tables",
            Some(e),
        ),
        Ok(tables) => {
            // Check that all tables exist.
            match tables.into_iter().collect::<Option<Vec<Table>>>() {
                None => error_response(
                    StatusCode::NOT_FOUND,
                    "table_not_found",
                    "No table found",
                    None,
                ),
                Some(tables) => match execute_query(tables, &payload.query, state.store.clone())
                    .await
                {
                    Err(QueryDatabaseError::TooManyResultRows) => error_response(
                        StatusCode::BAD_REQUEST,
                        "too_many_result_rows",
                        "The query returned too many rows",
                        None,
                    ),
                    Err(QueryDatabaseError::ExecutionError(s, _)) => {
                        error_response(StatusCode::BAD_REQUEST, "query_execution_error", &s, None)
                    }
                    Err(e) => error_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "internal_server_error",
                        "Failed to run query",
                        Some(e.into()),
                    ),
                    Ok((results, schema, query)) => (
                        StatusCode::OK,
                        Json(APIResponse {
                            error: None,
                            response: Some(json!({
                                "schema": schema,
                                "results": results,
                                "query": query,
                            })),
                        }),
                    ),
                },
            }
        }
    }
}

// SQLite Workers

#[derive(serde::Deserialize)]
struct SQLiteWorkersUpsertOrDeletePayload {
    url: String,
}

async fn sqlite_workers_heartbeat(
    State(state): State<Arc<APIState>>,
    Json(payload): Json<SQLiteWorkersUpsertOrDeletePayload>,
) -> (StatusCode, Json<APIResponse>) {
    match state
        .store
        .sqlite_workers_upsert(&payload.url, HEARTBEAT_INTERVAL_MS)
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to upsert SQLite worker",
            Some(e),
        ),
        Ok((worker, is_new)) => {
            if is_new {
                // The worker has just been created or is "coming back to life".
                // We have no guarantee that the worker's running databases are up-to-date, so we expire them all.
                match worker.expire_all().await {
                    Err(e) => {
                        return error_response(
                            StatusCode::INTERNAL_SERVER_ERROR,
                            "internal_server_error",
                            "Failed to expire SQLite worker databases",
                            Some(e.into()),
                        )
                    }
                    Ok(_) => (),
                }
            }

            (
                StatusCode::OK,
                Json(APIResponse {
                    error: None,
                    response: Some(json!({"success": true})),
                }),
            )
        }
    }
}

async fn sqlite_workers_delete(
    State(state): State<Arc<APIState>>,
    Json(payload): Json<SQLiteWorkersUpsertOrDeletePayload>,
) -> (StatusCode, Json<APIResponse>) {
    match state.store.sqlite_workers_delete(&payload.url).await {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to delete SQLite worker",
            Some(e),
        ),
        Ok(_) => (
            StatusCode::OK,
            Json(APIResponse {
                error: None,
                response: Some(json!({"success": true})),
            }),
        ),
    }
}

// Misc

#[derive(serde::Deserialize)]
struct TokenizePayload {
    text: String,
    provider_id: ProviderID,
    model_id: String,
    credentials: Option<run::Credentials>,
}

async fn tokenize(Json(payload): Json<TokenizePayload>) -> (StatusCode, Json<APIResponse>) {
    let mut llm = provider(payload.provider_id).llm(payload.model_id);

    // If we received credentials we initialize the llm with them.
    match payload.credentials {
        Some(c) => {
            match llm.initialize(c.clone()).await {
                Err(e) => {
                    return error_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "internal_server_error",
                        "Failed to initialize LLM",
                        Some(e),
                    );
                }
                Ok(()) => (),
            };
        }
        None => (),
    }

    match llm.tokenize(vec![payload.text]).await {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to tokenize text",
            Some(e),
        ),
        Ok(mut res) => match res.pop() {
            None => error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_server_error",
                "Failed to tokenize text",
                None,
            ),
            Some(tokens) => (
                StatusCode::OK,
                Json(APIResponse {
                    error: None,
                    response: Some(json!({
                        "tokens": tokens,
                    })),
                }),
            ),
        },
    }
}

#[derive(serde::Deserialize)]
struct TokenizeBatchPayload {
    texts: Vec<String>,
    provider_id: ProviderID,
    model_id: String,
    credentials: Option<run::Credentials>,
}

async fn tokenize_batch(
    Json(payload): Json<TokenizeBatchPayload>,
) -> (StatusCode, Json<APIResponse>) {
    let mut llm = provider(payload.provider_id).llm(payload.model_id);

    // If we received credentials we initialize the llm with them.
    match payload.credentials {
        Some(c) => {
            match llm.initialize(c.clone()).await {
                Err(e) => {
                    return error_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "internal_server_error",
                        "Failed to initialize LLM",
                        Some(e),
                    );
                }
                Ok(()) => (),
            };
        }
        None => (),
    }

    match llm.tokenize(payload.texts).await {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to tokenize text",
            Some(e),
        ),
        Ok(res) => (
            StatusCode::OK,
            Json(APIResponse {
                error: None,
                response: Some(json!({
                    "tokens": res,
                })),
            }),
        ),
    }
}

fn main() {
    JSExecutor::init();

    let rt = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(32)
        .enable_all()
        .build()
        .unwrap();

    let r = rt.block_on(async {
        // Start the background worker for table upserts
        tokio::task::spawn(async move {
            TableUpsertsBackgroundWorker::start_loop().await;
        });

        let _guard = init_subscribers()?;

        let store: Box<dyn store::Store + Sync + Send> = match std::env::var("CORE_DATABASE_URI") {
            Ok(db_uri) => {
                let store = postgres::PostgresStore::new(&db_uri).await?;
                Box::new(store)
            }
            Err(_) => Err(anyhow!("CORE_DATABASE_URI is required (postgres)"))?,
        };

        let databases_store: Box<dyn databases_store::store::DatabasesStore + Sync + Send> = {
            let store = GoogleCloudStorageDatabasesStore::new();
            Box::new(store)
        };

        let url = std::env::var("ELASTICSEARCH_URL").expect("ELASTICSEARCH_URL must be set");
        let username =
            std::env::var("ELASTICSEARCH_USERNAME").expect("ELASTICSEARCH_USERNAME must be set");
        let password =
            std::env::var("ELASTICSEARCH_PASSWORD").expect("ELASTICSEARCH_PASSWORD must be set");

        let search_store : Box<dyn SearchStore + Sync + Send> = Box::new(ElasticsearchSearchStore::new(&url, &username, &password).await?);

        let state = Arc::new(APIState::new(
            store,
            databases_store,
            QdrantClients::build().await?,
            search_store,
        ));

        let router = Router::new()
        // Projects
        .route("/projects", post(projects::projects_create))
        .route("/projects/{project_id}", delete(projects::projects_delete))
        .route("/projects/{project_id}/clone", post(projects::projects_clone))
        // Specifications
        .route(
            "/projects/{project_id}/specifications/check",
            post(specifications_check),
        )
        .route(
            "/projects/{project_id}/specifications/{hash}",
            get(specifications_retrieve),
        )
        .route(
            "/projects/{project_id}/specifications",
            get(specifications_get),
        )
        .route(
            "/projects/{project_id}/specifications",
            post(specifications_post),
        )

        // Datasets
        .route("/projects/{project_id}/datasets", post(datasets_register))
        .route("/projects/{project_id}/datasets", get(datasets_list))
        .route(
            "/projects/{project_id}/datasets/{dataset_id}/{hash}",
            get(datasets_retrieve),
        )
        // Runs
        .route("/projects/{project_id}/runs", post(runs_create))
        .route(
            "/projects/{project_id}/runs/stream",
            post(runs_create_stream),
        )
        .route("/projects/{project_id}/runs", get(runs_list))
        .route(
            "/projects/{project_id}/runs/batch",
            post(runs_retrieve_batch),
        )
        .route("/projects/{project_id}/runs/{run_id}", get(runs_retrieve))
        .route(
            "/projects/{project_id}/runs/{run_id}",
            delete(runs_delete),
        )
        .route(
            "/projects/{project_id}/runs/{run_id}/cancel",
            post(runs_cancel),
        )
        .route(
            "/projects/{project_id}/runs/{run_id}/blocks/{block_type}/{block_name}",
            get(runs_retrieve_block),
        )
        .route(
            "/projects/{project_id}/runs/{run_id}/status",
            get(runs_retrieve_status),
        )
        // DataSources
        .route(
            "/projects/{project_id}/data_sources",
            post(data_sources_register),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}",
            patch(data_sources_update),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}",
            get(data_sources_retrieve),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/tokenize",
            post(data_sources_tokenize),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/documents/{document_id}/versions",
            get(data_sources_documents_versions_list),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/documents",
            post(data_sources_documents_upsert),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/documents/{document_id}/blob",
            get(data_sources_documents_retrieve_blob),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/documents/{document_id}/tags",
            patch(data_sources_documents_update_tags),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/documents/{document_id}/parents",
            patch(data_sources_documents_update_parents),
        )
        // Provided by the data_source block.
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/search",
            post(data_sources_search),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/documents",
            get(data_sources_documents_list),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/documents/{document_id}",
            get(data_sources_documents_retrieve),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/documents/{document_id}/text",
            get(data_sources_documents_retrieve_text),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/documents/{document_id}",
            delete(data_sources_documents_delete),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/documents/{document_id}/scrub_deleted_versions",
            post(data_sources_documents_scrub_deleted_versions),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}",
            delete(data_sources_delete),
        )
        // Databases
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/tables/validate_csv_content",
            post(tables_validate_csv_content),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/tables",
            post(tables_upsert),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/tables/{table_id}/parents",
            patch(tables_update_parents),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/tables/{table_id}",
            get(tables_retrieve),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/tables",
            get(tables_list),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/tables/{table_id}",
            delete(tables_delete),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/tables/{table_id}/blob",
            get(tables_retrieve_blob),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/tables/{table_id}/rows",
            post(tables_rows_upsert),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/tables/{table_id}/csv",
            post(tables_csv_upsert),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/tables/{table_id}/rows/{row_id}",
            get(tables_rows_retrieve),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/tables/{table_id}/rows/{row_id}",
            delete(tables_rows_delete),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/tables/{table_id}/rows",
            get(tables_rows_list),
        )
        .route(
            "/query_database",
            post(databases_query_run),
        )
        .route(
            "/database_schema",
            post(databases_schema_retrieve),
        )
        .route("/sqlite_workers", delete(sqlite_workers_delete))

        // Folders
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/folders",
            post(folders_upsert),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/folders/{folder_id}",
            get(folders_retrieve),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/folders",
            get(folders_list),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/folders/{folder_id}",
            delete(folders_delete),
        )

        //Search
        .route("/nodes/search", post(nodes_search))
        .route("/stats", post(data_sources_stats))
        .route("/tags/search", post(tags_search))

        // Misc
        .route("/tokenize", post(tokenize))
        .route("/tokenize/batch", post(tokenize_batch))
        .layer(OtelInResponseLayer::default())
        // Start OpenTelemetry trace on incoming request.
        .layer(OtelAxumLayer::default())
        // Extensions
        .layer(DefaultBodyLimit::disable())
        .layer(from_fn(validate_api_key))
        .with_state(state.clone());

        let sqlite_heartbeat_router = Router::new()
            .route("/sqlite_workers", post(sqlite_workers_heartbeat))
            .layer(from_fn(validate_api_key))
            .with_state(state.clone());

        let health_check_router = Router::new().route("/", get(index));

        let app = Router::new()
            .merge(router)
            .merge(sqlite_heartbeat_router)
            .merge(health_check_router);

        // Start the APIState run loop.
        let runloop_state = state.clone();
        tokio::task::spawn(async move { runloop_state.run_loop().await });

        let (tx1, rx1) = tokio::sync::oneshot::channel::<()>();
        let (tx2, rx2) = tokio::sync::oneshot::channel::<()>();

        let srv = axum::serve(
            TcpListener::bind::<std::net::SocketAddr>("[::]:3001".parse().unwrap()).await?,
            app.into_make_service(),
        )
        .with_graceful_shutdown(async {
            rx1.await.ok();
        });

        tokio::spawn(async move {
            if let Err(e) = srv.await {
                error!(error = %e, "Server error");
            }
            info!("[GRACEFUL] Server stopped");
            tx2.send(()).ok();
        });

        info!(pid = std::process::id() as u64, "dust_api server started");

        let mut stream = signal(SignalKind::terminate()).unwrap();
        stream.recv().await;

        // Gracefully shut down the server
        info!("[GRACEFUL] SIGTERM received, stopping server...");
        tx1.send(()).ok();

        // Wait for the server to shutdown
        info!("[GRACEFUL] Awaiting server shutdown...");
        rx2.await.ok();

        // Wait for the run loop to finish.
        info!("[GRACEFUL] Awaiting stop loop...");
        state.stop_loop().await;

        info!("[GRACEFUL] Exiting");

        // sleep for 1 second to allow the logger to flush
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;

        Ok::<(), anyhow::Error>(())
    });

    match r {
        Ok(_) => (),
        Err(e) => {
            error!(error = %e, "dust_api server error");
            std::process::exit(1);
        }
    }
}
