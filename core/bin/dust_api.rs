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
use futures::future::try_join_all;
use hyper::http::StatusCode;
use parking_lot::Mutex;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::convert::Infallible;
use std::sync::Arc;
use tokio::{
    net::TcpListener,
    signal::unix::{signal, SignalKind},
    sync::mpsc::unbounded_channel,
};
use tokio_stream::Stream;
use tower_http::trace::{self, TraceLayer};
use tracing::{error, info, Level};
use tracing_bunyan_formatter::{BunyanFormattingLayer, JsonStorageLayer};
use tracing_subscriber::prelude::*;

use dust::{
    api_keys::validate_api_key,
    app,
    blocks::block::BlockType,
    data_sources::{
        data_source::{self, Section},
        qdrant::QdrantClients,
    },
    databases::{
        database::{execute_query, QueryDatabaseError},
        table::{LocalTable, Row, Table},
    },
    databases_store::store::{self as databases_store, DatabasesStore},
    dataset,
    deno::js_executor::JSExecutor,
    project,
    providers::provider::{provider, ProviderID},
    run,
    search_filter::{Filterable, SearchFilter},
    sqlite_workers::client::{self, HEARTBEAT_INTERVAL_MS},
    stores::{postgres, store},
    utils::{self, error_response, APIError, APIResponse, CoreRequestMakeSpan},
};

/// API State

struct RunManager {
    pending_apps: Vec<(app::App, run::Credentials, run::Secrets)>,
    pending_runs: Vec<String>,
}

struct APIState {
    store: Box<dyn store::Store + Sync + Send>,
    databases_store: Box<dyn databases_store::DatabasesStore + Sync + Send>,
    qdrant_clients: QdrantClients,

    run_manager: Arc<Mutex<RunManager>>,
}

impl APIState {
    fn new(
        store: Box<dyn store::Store + Sync + Send>,
        databases_store: Box<dyn databases_store::DatabasesStore + Sync + Send>,
        qdrant_clients: QdrantClients,
    ) -> Self {
        APIState {
            store,
            qdrant_clients,
            databases_store,
            run_manager: Arc::new(Mutex::new(RunManager {
                pending_apps: vec![],
                pending_runs: vec![],
            })),
        }
    }

    fn run_app(&self, app: app::App, credentials: run::Credentials, secrets: run::Secrets) {
        let mut run_manager = self.run_manager.lock();
        run_manager.pending_apps.push((app, credentials, secrets));
    }

    async fn stop_loop(&self) {
        loop {
            let pending_runs = {
                let manager = self.run_manager.lock();
                info!(
                    pending_runs = manager.pending_runs.len(),
                    "[GRACEFUL] stop_loop pending runs",
                );
                manager.pending_runs.len()
            };
            if pending_runs == 0 {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(1024)).await;
        }
    }

    async fn run_loop(&self) -> Result<()> {
        let mut loop_count = 0;

        loop {
            let apps: Vec<(app::App, run::Credentials, run::Secrets)> = {
                let mut manager = self.run_manager.lock();
                let apps = manager.pending_apps.drain(..).collect::<Vec<_>>();
                apps.iter().for_each(|app| {
                    manager
                        .pending_runs
                        .push(app.0.run_ref().unwrap().run_id().to_string());
                });
                apps
            };
            apps.into_iter().for_each(|mut app| {
                let store = self.store.clone();
                let databases_store = self.databases_store.clone();
                let qdrant_clients = self.qdrant_clients.clone();
                let manager = self.run_manager.clone();

                // Start a task that will run the app in the background.
                tokio::task::spawn(async move {
                    let now = std::time::Instant::now();

                    match app
                        .0
                        .run(app.1, app.2, store, databases_store, qdrant_clients, None)
                        .await
                    {
                        Ok(()) => {
                            info!(
                                run = app.0.run_ref().unwrap().run_id(),
                                app_version = app.0.hash(),
                                elapsed = now.elapsed().as_millis(),
                                "Run finished"
                            );
                        }
                        Err(e) => {
                            error!(error = %e, "Run error");
                        }
                    }
                    {
                        let mut manager = manager.lock();
                        manager
                            .pending_runs
                            .retain(|run_id| run_id != app.0.run_ref().unwrap().run_id());
                    }
                });
            });
            loop_count += 1;
            tokio::time::sleep(std::time::Duration::from_millis(4)).await;
            if loop_count % 1024 == 0 {
                let manager = self.run_manager.lock();
                info!(pending_runs = manager.pending_runs.len(), "Pending runs");
            }
            // Roughly every 4 minutes, cleanup dead SQLite workers if any.
            if loop_count % 65536 == 0 {
                let store = self.store.clone();
                tokio::task::spawn(async move {
                    match store
                        .sqlite_workers_cleanup(client::HEARTBEAT_INTERVAL_MS)
                        .await
                    {
                        Err(e) => {
                            error!(error = %e, "Failed to cleanup SQLite workers");
                        }
                        Ok(_) => (),
                    }
                });
            }
        }
    }
}

/// Index

async fn index() -> &'static str {
    "dust_api server ready"
}

/// Create a new project (simply generates an id)

async fn projects_create(State(state): State<Arc<APIState>>) -> (StatusCode, Json<APIResponse>) {
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

async fn projects_delete(
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
        Err(e) => {
            return error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_server_error",
                "Failed to delete project",
                Some(e),
            )
        }
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

async fn projects_clone(
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
    .collect::<Result<Vec<_>>>()
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

    return (
        StatusCode::OK,
        Json(APIResponse {
            error: None,
            response: Some(json!({
                "project": project,
            })),
        }),
    );
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
            let current_hash = match state
                .store
                .latest_dataset_hash(&project, &d.dataset_id())
                .await
            {
                Err(_) => None,
                Ok(hash) => hash,
            };
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
    match headers.get("X-Dust-Group-Ids") {
        Some(v) => match v.to_str() {
            Ok(v) => {
                credentials.insert("DUST_GROUP_IDS".to_string(), v.to_string());
            }
            _ => (),
        },
        None => (),
    };

    match run_helper(project_id, payload.clone(), state.clone()).await {
        Ok(app) => {
            // The run is empty for now, we can clone it for the response.
            let run = app.run_ref().unwrap().clone();
            state.run_app(app, credentials, secrets);
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
    match headers.get("X-Dust-Group-Ids") {
        Some(v) => match v.to_str() {
            Ok(v) => {
                credentials.insert("DUST_GROUP_IDS".to_string(), v.to_string());
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
            let error = match api_error.0.error {
                Some(error) => error,
                None => APIError {
                    code: "internal_server_error".to_string(),
                    message: "The app execution failed unexpectedly".to_string(),
                },
            };
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
}

async fn data_sources_register(
    Path(project_id): Path<i64>,
    State(state): State<Arc<APIState>>,
    Json(payload): Json<DataSourcesRegisterPayload>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);
    let ds = data_source::DataSource::new(&project, &payload.config);
    match state.store.register_data_source(&project, &ds).await {
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
                        "config": ds.config(),
                    },
                })),
            }),
        ),
    }
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
                let embedder_config = ds.embedder_config().clone();
                let embedder =
                    provider(embedder_config.provider_id).embedder(embedder_config.model_id);
                match embedder.tokenize(vec![payload.text]).await {
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
    let add_tags = match payload.add_tags {
        Some(tags) => tags,
        None => vec![],
    };
    let remove_tags = match payload.remove_tags {
        Some(tags) => tags,
        None => vec![],
    };
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
    parents: Vec<String>,
}

async fn data_sources_documents_update_parents(
    Path((project_id, data_source_id, document_id)): Path<(i64, String, String)>,
    State(state): State<Arc<APIState>>,
    Json(payload): Json<DataSourcesDocumentsUpdateParentsPayload>,
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
                .update_parents(
                    state.store.clone(),
                    state.qdrant_clients.clone(),
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
    parents: Vec<String>,
    source_url: Option<String>,
    section: Section,
    credentials: run::Credentials,
    light_document_output: Option<bool>,
}

async fn data_sources_documents_upsert(
    Path((project_id, data_source_id)): Path<(i64, String)>,
    State(state): State<Arc<APIState>>,
    Json(payload): Json<DataSourcesDocumentsUpsertPayload>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);
    let light_document_output = match payload.light_document_output {
        Some(v) => v,
        None => false,
    };

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
                        payload.timestamp,
                        &payload.tags,
                        &payload.parents,
                        &payload.source_url,
                        payload.section,
                        true, // preserve system tags
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
        Ok((documents, total)) => (
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
        ),
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
                            },
                        })),
                    }),
                ),
            },
        },
    }
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
struct DatabasesTablesUpsertPayload {
    table_id: String,
    name: String,
    description: String,
    timestamp: Option<u64>,
    tags: Vec<String>,
    parents: Vec<String>,
    remote_database_table_id: Option<String>,
    remote_database_secret_id: Option<String>,
}

async fn tables_upsert(
    Path((project_id, data_source_id)): Path<(i64, String)>,
    State(state): State<Arc<APIState>>,
    Json(payload): Json<DatabasesTablesUpsertPayload>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);

    match state
        .store
        .upsert_table(
            &project,
            &data_source_id,
            &payload.table_id,
            &payload.name,
            &payload.description,
            match payload.timestamp {
                Some(timestamp) => timestamp,
                None => utils::now(),
            },
            &payload.tags,
            &payload.parents,
            payload.remote_database_table_id,
            payload.remote_database_secret_id,
        )
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to upsert table",
            Some(e),
        ),
        Ok(table) => (
            StatusCode::OK,
            Json(APIResponse {
                error: None,
                response: Some(json!({
                    "table": table
                })),
            }),
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
        .load_table(&project, &data_source_id, &table_id)
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
        .list_tables(
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
        .load_table(&project, &data_source_id, &table_id)
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
            .delete(state.store.clone(), state.databases_store.clone())
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
        },
    }
}

async fn tables_update_parents(
    Path((project_id, data_source_id, table_id)): Path<(i64, String, String)>,
    State(state): State<Arc<APIState>>,
    Json(payload): Json<DataSourcesDocumentsUpdateParentsPayload>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);

    match state
        .store
        .load_table(&project, &data_source_id, &table_id)
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
            .update_parents(state.store.clone(), payload.parents.clone())
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
        .load_table(&project, &data_source_id, &table_id)
        .await
    {
        Err(e) => {
            return error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_server_error",
                "Failed to load table",
                Some(e),
            )
        }
        Ok(None) => {
            return error_response(
                StatusCode::NOT_FOUND,
                "table_not_found",
                &format!("No table found for id `{}`", table_id),
                None,
            )
        }
        Ok(Some(table)) => match LocalTable::from_table(table) {
            Err(e) => {
                return error_response(
                    StatusCode::BAD_REQUEST,
                    "invalid_table",
                    "Table is not local",
                    Some(e),
                )
            }
            Ok(table) => {
                match table
                    .upsert_rows(
                        state.store.clone(),
                        state.databases_store.clone(),
                        payload.rows,
                        match payload.truncate {
                            Some(v) => v,
                            None => false,
                        },
                    )
                    .await
                {
                    Err(e) => {
                        return error_response(
                            StatusCode::INTERNAL_SERVER_ERROR,
                            "internal_server_error",
                            "Failed to upsert rows",
                            Some(e),
                        )
                    }
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
        .load_table(&project, &data_source_id, &table_id)
        .await
    {
        Err(e) => {
            return error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_server_error",
                "Failed to load table",
                Some(e),
            )
        }
        Ok(table) => match table.filter(|table| table.match_filter(&view_filter)) {
            None => {
                return error_response(
                    StatusCode::NOT_FOUND,
                    "table_not_found",
                    &format!("No table found for id `{}`", table_id),
                    None,
                )
            }
            Some(table) => match LocalTable::from_table(table) {
                Err(e) => {
                    return error_response(
                        StatusCode::BAD_REQUEST,
                        "invalid_table",
                        "Table is not local",
                        Some(e),
                    )
                }
                Ok(table) => {
                    match table
                        .retrieve_row(state.databases_store.clone(), &row_id)
                        .await
                    {
                        Err(e) => {
                            return error_response(
                                StatusCode::INTERNAL_SERVER_ERROR,
                                "internal_server_error",
                                "Failed to load row",
                                Some(e),
                            )
                        }
                        Ok(None) => {
                            return error_response(
                                StatusCode::NOT_FOUND,
                                "table_row_not_found",
                                &format!("No table row found for id `{}`", row_id),
                                None,
                            )
                        }
                        Ok(Some(row)) => {
                            return (
                                StatusCode::OK,
                                Json(APIResponse {
                                    error: None,
                                    response: Some(json!({
                                        "row": row,
                                    })),
                                }),
                            )
                        }
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
        .load_table(&project, &data_source_id, &table_id)
        .await
    {
        Err(e) => {
            return error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_server_error",
                "Failed to load table",
                Some(e),
            )
        }
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(APIResponse {
                    error: Some(APIError {
                        code: "table_not_found".to_string(),
                        message: format!("No table found for id `{}`", table_id),
                    }),
                    response: None,
                }),
            )
        }
        Ok(Some(table)) => match LocalTable::from_table(table) {
            Err(e) => {
                return error_response(
                    StatusCode::BAD_REQUEST,
                    "invalid_table",
                    "Table is not local",
                    Some(e),
                )
            }
            Ok(table) => {
                match table
                    .delete_row(state.databases_store.clone(), &row_id)
                    .await
                {
                    Err(e) => {
                        return error_response(
                            StatusCode::INTERNAL_SERVER_ERROR,
                            "internal_server_error",
                            "Failed to delete row",
                            Some(e),
                        )
                    }
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
        .load_table(&project, &data_source_id, &table_id)
        .await
    {
        Err(e) => {
            return error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_server_error",
                "Failed to load table",
                Some(e),
            )
        }
        Ok(table) => match table.filter(|table| table.match_filter(&view_filter)) {
            None => {
                return error_response(
                    StatusCode::NOT_FOUND,
                    "table_not_found",
                    &format!("No table found for id `{}`", table_id),
                    None,
                )
            }
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
struct DatabaseQueryRunPayload {
    query: String,
    tables: Vec<(i64, String, String)>,
    view_filter: Option<SearchFilter>,
}

// use axum_macros::debug_handler;

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
                async move { store.load_table(&project, &data_source_id, &table_id).await }
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
            match tables
                .into_iter()
                .filter(|table| {
                    table
                        .as_ref()
                        .map_or(true, |t| t.match_filter(&payload.view_filter))
                })
                .collect::<Option<Vec<Table>>>()
            {
                None => {
                    return error_response(
                        StatusCode::NOT_FOUND,
                        "table_not_found",
                        "No table found",
                        None,
                    )
                }
                Some(tables) => match execute_query(tables, &payload.query, state.store.clone())
                    .await
                {
                    Err(QueryDatabaseError::TooManyResultRows) => error_response(
                        StatusCode::BAD_REQUEST,
                        "too_many_result_rows",
                        "The query returned too many rows",
                        None,
                    ),
                    Err(QueryDatabaseError::ExecutionError(s)) => {
                        error_response(StatusCode::BAD_REQUEST, "query_execution_error", &s, None)
                    }
                    Err(e) => error_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "internal_server_error",
                        "Failed to run query",
                        Some(e.into()),
                    ),
                    Ok((results, schema)) => (
                        StatusCode::OK,
                        Json(APIResponse {
                            error: None,
                            response: Some(json!({
                                "schema": schema,
                                "results": results,
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
        //.thread_name("dust-api-server")
        //.thread_stack_size(32 * 1024 * 1024)
        .enable_all()
        .build()
        .unwrap();

    let r = rt.block_on(async {
        tracing_subscriber::registry()
            .with(JsonStorageLayer)
            .with(
                BunyanFormattingLayer::new("dust_api".into(), std::io::stdout)
                    .skip_fields(vec!["file", "line", "target"].into_iter())
                    .unwrap(),
            )
            .with(tracing_subscriber::EnvFilter::new("info"))
            .init();

        let store: Box<dyn store::Store + Sync + Send> = match std::env::var("CORE_DATABASE_URI") {
            Ok(db_uri) => {
                let store = postgres::PostgresStore::new(&db_uri).await?;
                store.init().await?;
                Box::new(store)
            }
            Err(_) => Err(anyhow!("CORE_DATABASE_URI is required (postgres)"))?,
        };
        let databases_store: Box<dyn databases_store::DatabasesStore + Sync + Send> =
            match std::env::var("DATABASES_STORE_DATABASE_URI") {
                Ok(db_uri) => {
                    let s = databases_store::PostgresDatabasesStore::new(&db_uri).await?;
                    s.init().await?;
                    Box::new(s)
                }
                Err(_) => Err(anyhow!("DATABASES_STORE_DATABASE_URI not set."))?,
            };

        let state = Arc::new(APIState::new(
            store,
            databases_store,
            QdrantClients::build().await?,
        ));

        let router = Router::new()
        // Projects
        .route("/projects", post(projects_create))
        .route("/projects/:project_id", delete(projects_delete))
        .route("/projects/:project_id/clone", post(projects_clone))
        // Specifications
        .route(
            "/projects/:project_id/specifications/check",
            post(specifications_check),
        )
        .route(
            "/projects/:project_id/specifications/:hash",
            get(specifications_retrieve),
        )
        // Datasets
        .route("/projects/:project_id/datasets", post(datasets_register))
        .route("/projects/:project_id/datasets", get(datasets_list))
        .route(
            "/projects/:project_id/datasets/:dataset_id/:hash",
            get(datasets_retrieve),
        )
        // Runs
        .route("/projects/:project_id/runs", post(runs_create))
        .route(
            "/projects/:project_id/runs/stream",
            post(runs_create_stream),
        )
        .route("/projects/:project_id/runs", get(runs_list))
        .route(
            "/projects/:project_id/runs/batch",
            post(runs_retrieve_batch),
        )
        .route("/projects/:project_id/runs/:run_id", get(runs_retrieve))
        .route(
            "/projects/:project_id/runs/:run_id",
            delete(runs_delete),
        )
        .route(
            "/projects/:project_id/runs/:run_id/blocks/:block_type/:block_name",
            get(runs_retrieve_block),
        )
        .route(
            "/projects/:project_id/runs/:run_id/status",
            get(runs_retrieve_status),
        )
        // DataSources
        .route(
            "/projects/:project_id/data_sources",
            post(data_sources_register),
        )
        .route(
            "/projects/:project_id/data_sources/:data_source_id",
            get(data_sources_retrieve),
        )
        .route(
            "/projects/:project_id/data_sources/:data_source_id/tokenize",
            post(data_sources_tokenize),
        )
        .route(
            "/projects/:project_id/data_sources/:data_source_id/documents/:document_id/versions",
            get(data_sources_documents_versions_list),
        )
        .route(
            "/projects/:project_id/data_sources/:data_source_id/documents",
            post(data_sources_documents_upsert),
        )
        .route(
            "/projects/:project_id/data_sources/:data_source_id/documents/:document_id/tags",
            patch(data_sources_documents_update_tags),
        )
        .route(
            "/projects/:project_id/data_sources/:data_source_id/documents/:document_id/parents",
            patch(data_sources_documents_update_parents),
        )
        // Provided by the data_source block.
        .route(
            "/projects/:project_id/data_sources/:data_source_id/search",
            post(data_sources_search),
        )
        .route(
            "/projects/:project_id/data_sources/:data_source_id/documents",
            get(data_sources_documents_list),
        )
        .route(
            "/projects/:project_id/data_sources/:data_source_id/documents/:document_id",
            get(data_sources_documents_retrieve),
        )
        .route(
            "/projects/:project_id/data_sources/:data_source_id/documents/:document_id",
            delete(data_sources_documents_delete),
        )
        .route(
            "/projects/:project_id/data_sources/:data_source_id",
            delete(data_sources_delete),
        )
        // Databases
        .route(
            "/projects/:project_id/data_sources/:data_source_id/tables",
            post(tables_upsert),
        )
        .route(
            "/projects/:project_id/data_sources/:data_source_id/tables/:table_id/parents",
            patch(tables_update_parents),
        )
        .route(
            "/projects/:project_id/data_sources/:data_source_id/tables/:table_id",
            get(tables_retrieve),
        )
        .route(
            "/projects/:project_id/data_sources/:data_source_id/tables",
            get(tables_list),
        )
        .route(
            "/projects/:project_id/data_sources/:data_source_id/tables/:table_id",
            delete(tables_delete),
        )
        .route(
            "/projects/:project_id/data_sources/:data_source_id/tables/:table_id/rows",
            post(tables_rows_upsert),
        )
        .route(
            "/projects/:project_id/data_sources/:data_source_id/tables/:table_id/rows/:row_id",
            get(tables_rows_retrieve),
        )
        .route(
            "/projects/:project_id/data_sources/:data_source_id/tables/:table_id/rows/:row_id",
            delete(tables_rows_delete),
        )
        .route(
            "/projects/:project_id/data_sources/:data_source_id/tables/:table_id/rows",
            get(tables_rows_list),
        )
        .route(
            "/query_database",
            post(databases_query_run),
        )
        .route("/sqlite_workers", delete(sqlite_workers_delete))
        // Misc
        .route("/tokenize", post(tokenize))
        .route("/tokenize/batch", post(tokenize_batch))

        // Extensions
        .layer(DefaultBodyLimit::disable())
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(CoreRequestMakeSpan::new())
                .on_response(trace::DefaultOnResponse::new().level(Level::INFO)),
        )
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
