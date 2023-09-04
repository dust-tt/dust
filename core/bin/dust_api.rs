use anyhow::{anyhow, Result};
use axum::{
    extract,
    extract::DefaultBodyLimit,
    http::header::HeaderMap,
    response::{
        sse::{Event, KeepAlive, Sse},
        Json,
    },
    routing::{delete, get, patch, post},
    Router,
};
use dust::{
    app,
    blocks::block::BlockType,
    data_sources::data_source::{self, SearchFilter},
    dataset,
    project::{self},
    providers::provider::{provider, ProviderID},
    run,
    stores::postgres,
    stores::store,
    utils,
};
use hyper::http::StatusCode;
use parking_lot::Mutex;
use qdrant_client::prelude::{QdrantClient, QdrantClientConfig};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::convert::Infallible;
use std::sync::Arc;
use tokio::sync::mpsc::unbounded_channel;
use tokio_stream::Stream;
use tower_http::trace::{self, TraceLayer};
use tracing::Level;

#[derive(Serialize)]
struct APIError {
    code: String,
    message: String,
}

#[derive(Serialize)]
struct APIResponse {
    error: Option<APIError>,
    response: Option<Value>,
}

/// API State

struct RunManager {
    pending_apps: Vec<(app::App, run::Credentials)>,
    pending_runs: Vec<String>,
}

struct APIState {
    store: Box<dyn store::Store + Sync + Send>,
    qdrant_client: Arc<QdrantClient>,

    run_manager: Arc<Mutex<RunManager>>,
}

impl APIState {
    fn new(store: Box<dyn store::Store + Sync + Send>, qdrant_client: Arc<QdrantClient>) -> Self {
        APIState {
            store,
            qdrant_client,
            run_manager: Arc::new(Mutex::new(RunManager {
                pending_apps: vec![],
                pending_runs: vec![],
            })),
        }
    }

    fn run_app(&self, app: app::App, credentials: run::Credentials) {
        let mut run_manager = self.run_manager.lock();
        run_manager.pending_apps.push((app, credentials));
    }

    async fn run_loop(&self) -> Result<()> {
        let mut loop_count = 0;
        loop {
            let apps: Vec<(app::App, run::Credentials)> = {
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
                let qdrant_client = self.qdrant_client.clone();
                let manager = self.run_manager.clone();

                // Start a task that will run the app in the background.
                tokio::task::spawn(async move {
                    let now = std::time::Instant::now();
                    match app.0.run(app.1, store, qdrant_client, None).await {
                        Ok(()) => {
                            utils::done(&format!(
                                "Run finished: run=`{}` app_version=`{}` elapsed=`{} ms`",
                                app.0.run_ref().unwrap().run_id(),
                                app.0.hash(),
                                now.elapsed().as_millis(),
                            ));
                        }
                        Err(e) => {
                            utils::error(&format!("Run error: {}", e));
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
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            if loop_count % (10 * 10) == 0 {
                let manager = self.run_manager.lock();
                utils::info(&format!("{} pending runs", manager.pending_runs.len()));
            }
        }
    }
}

/// Index

async fn index() -> &'static str {
    "Welcome to the Dust API!"
}

/// Create a new project (simply generates an id)

async fn projects_create(
    extract::Extension(state): extract::Extension<Arc<APIState>>,
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

/// Clones a project.
/// Simply consists in cloning the latest dataset versions, as we don't copy runs and hence specs.

async fn projects_clone(
    extract::Extension(state): extract::Extension<Arc<APIState>>,
    extract::Path(project_id): extract::Path<i64>,
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
    extract::Path(project_id): extract::Path<i64>,
    extract::Json(payload): extract::Json<SpecificationsCheckPayload>,
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
    extract::Path((project_id, hash)): extract::Path<(i64, String)>,
    extract::Extension(state): extract::Extension<Arc<APIState>>,
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
    extract::Path(project_id): extract::Path<i64>,
    extract::Json(payload): extract::Json<DatasetsRegisterPayload>,
    extract::Extension(state): extract::Extension<Arc<APIState>>,
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
    extract::Path(project_id): extract::Path<i64>,
    extract::Extension(state): extract::Extension<Arc<APIState>>,
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
    extract::Path((project_id, dataset_id, hash)): extract::Path<(i64, String, String)>,
    extract::Extension(state): extract::Extension<Arc<APIState>>,
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

#[derive(serde::Deserialize, Clone)]
struct RunsCreatePayload {
    run_type: run::RunType,
    specification: Option<String>,
    specification_hash: Option<String>,
    dataset_id: Option<String>,
    inputs: Option<Vec<Value>>,
    config: run::RunConfig,
    credentials: run::Credentials,
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
            Some(hash) => match state.store.load_specification(&project, &hash).await {
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
            },
            None => Err(error_response(
                StatusCode::BAD_REQUEST,
                "missing_specification_error",
                "No specification provided, either `specification` or 
                `specification_hash` must be provided",
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

        utils::info(
            format!(
                "Retrieved {} records from latest data version for `{}`.",
                d.as_ref().unwrap().len(),
                payload.dataset_id.as_ref().unwrap(),
            )
            .as_str(),
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

        utils::info(format!("Received {} inputs.", d.as_ref().unwrap().len(),).as_str());
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
    extract::Path(project_id): extract::Path<i64>,
    extract::Json(payload): extract::Json<RunsCreatePayload>,
    headers: HeaderMap,
    extract::Extension(state): extract::Extension<Arc<APIState>>,
) -> (StatusCode, Json<APIResponse>) {
    let mut credentials = payload.credentials.clone();

    match headers.get("X-Dust-Workspace-Id") {
        Some(v) => match v.to_str() {
            Ok(v) => {
                credentials.insert("DUST_WORKSPACE_ID".to_string(), v.to_string());
            }
            _ => (),
        },
        None => (),
    };

    match run_helper(project_id, payload.clone(), state.clone()).await {
        Ok(app) => {
            // The run is empty for now, we can clone it for the response.
            let run = app.run_ref().unwrap().clone();
            state.run_app(app, credentials);
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
    extract::Path(project_id): extract::Path<i64>,
    extract::Json(payload): extract::Json<RunsCreatePayload>,
    headers: HeaderMap,
    extract::Extension(state): extract::Extension<Arc<APIState>>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let mut credentials = payload.credentials.clone();

    match headers.get("X-Dust-Workspace-Id") {
        Some(v) => match v.to_str() {
            Ok(v) => {
                credentials.insert("DUST_WORKSPACE_ID".to_string(), v.to_string());
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
            let qdrant_client = state.qdrant_client.clone();

            // Start a task that will run the app in the background.
            tokio::task::spawn(async move {
                let now = std::time::Instant::now();
                match app
                    .run(credentials, store, qdrant_client, Some(tx.clone()))
                    .await
                {
                    Ok(()) => {
                        utils::done(&format!(
                            "Run finished: run=`{}` app_version=`{}` elapsed=`{} ms`",
                            app.run_ref().unwrap().run_id(),
                            app.hash(),
                            now.elapsed().as_millis(),
                        ));
                    }
                    Err(e) => {
                        utils::error(&format!("Run error: {}", e));
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
                    utils::error(&format!("Failed to create SSE event: {}", e));
                }
            };
        }
        match Event::default().json_data(json!({
            "type": "final",
            "content": null,
        })) {
            Ok(event) => yield Ok(event),
            Err(e) => {
                utils::error(&format!("Failed to create SSE event: {}", e));
            }
        };
    };

    Sse::new(stream).keep_alive(KeepAlive::default())
}

#[derive(serde::Deserialize)]
struct RunsListQuery {
    offset: usize,
    limit: usize,
    run_type: run::RunType,
}

async fn runs_list(
    extract::Path(project_id): extract::Path<i64>,
    extract::Query(query): extract::Query<RunsListQuery>,
    extract::Extension(state): extract::Extension<Arc<APIState>>,
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
    extract::Path(project_id): extract::Path<i64>,
    extract::Json(payload): extract::Json<RunsRetrieveBatchPayload>,
    extract::Extension(state): extract::Extension<Arc<APIState>>,
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
    extract::Path((project_id, run_id)): extract::Path<(i64, String)>,
    extract::Extension(state): extract::Extension<Arc<APIState>>,
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
    extract::Path((project_id, run_id, block_type, block_name)): extract::Path<(
        i64,
        String,
        BlockType,
        String,
    )>,
    extract::Extension(state): extract::Extension<Arc<APIState>>,
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
    extract::Path((project_id, run_id)): extract::Path<(i64, String)>,
    extract::Extension(state): extract::Extension<Arc<APIState>>,
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
    data_source_id: String,
    config: data_source::DataSourceConfig,
    credentials: run::Credentials,
}

async fn data_sources_register(
    extract::Path(project_id): extract::Path<i64>,
    extract::Json(payload): extract::Json<DataSourcesRegisterPayload>,
    extract::Extension(state): extract::Extension<Arc<APIState>>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);
    let ds = data_source::DataSource::new(&project, &payload.data_source_id, &payload.config);
    match ds
        .setup(payload.credentials, state.qdrant_client.clone())
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to register data source",
            Some(e),
        ),
        Ok(()) => match state.store.register_data_source(&project, &ds).await {
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
        },
    }
}

// Perform a search on a data source.

#[derive(serde::Deserialize)]
struct DatasourceSearchPayload {
    query: Option<String>,
    top_k: usize,
    filter: Option<SearchFilter>,
    full_text: bool,
    credentials: run::Credentials,
    target_document_tokens: Option<usize>,
}

async fn data_sources_search(
    extract::Path((project_id, data_source_id)): extract::Path<(i64, String)>,
    extract::Json(payload): extract::Json<DatasourceSearchPayload>,
    extract::Extension(state): extract::Extension<Arc<APIState>>,
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
                    state.qdrant_client.clone(),
                    &payload.query,
                    payload.top_k,
                    payload.filter,
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
    extract::Path((project_id, data_source_id, document_id)): extract::Path<(i64, String, String)>,
    extract::Json(payload): extract::Json<DataSourcesDocumentsUpdateTagsPayload>,
    extract::Extension(state): extract::Extension<Arc<APIState>>,
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
                    state.qdrant_client.clone(),
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
    extract::Path((project_id, data_source_id, document_id)): extract::Path<(i64, String, String)>,
    extract::Json(payload): extract::Json<DataSourcesDocumentsUpdateParentsPayload>,
    extract::Extension(state): extract::Extension<Arc<APIState>>,
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
                    state.qdrant_client.clone(),
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

fn error_response(
    status: StatusCode,
    code: &str,
    message: &str,
    error: Option<anyhow::Error>,
) -> (StatusCode, Json<APIResponse>) {
    utils::error(&format!("{}: {}\nError: {:?}", code, message, error));
    (
        status,
        Json(APIResponse {
            error: Some(APIError {
                code: code.to_string(),
                message: match error {
                    Some(err) => format!("{} (error: {:?})", message, err),
                    None => message.to_string(),
                },
            }),
            response: None,
        }),
    )
}

// List versions of a document in a data source.

#[derive(serde::Deserialize)]
struct DataSourcesDocumentsVersionsListQuery {
    offset: usize,
    limit: usize,
    // hash of the latest version to retrieve
    latest_hash: Option<String>,
}

async fn data_sources_documents_versions_list(
    extract::Path((project_id, data_source_id, document_id)): extract::Path<(i64, String, String)>,
    extract::Query(query): extract::Query<DataSourcesDocumentsVersionsListQuery>,
    extract::Extension(state): extract::Extension<Arc<APIState>>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);
    match state
        .store
        .list_data_source_document_versions(
            &project,
            &data_source_id,
            &document_id,
            Some((query.limit, query.offset)),
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
    text: String,
    credentials: run::Credentials,
    light_document_output: Option<bool>,
}

async fn data_sources_documents_upsert(
    extract::Path((project_id, data_source_id)): extract::Path<(i64, String)>,
    extract::Json(payload): extract::Json<DataSourcesDocumentsUpsertPayload>,
    extract::Extension(state): extract::Extension<Arc<APIState>>,
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
                        state.qdrant_client.clone(),
                        &payload.document_id,
                        payload.timestamp,
                        &payload.tags,
                        &payload.parents,
                        &payload.source_url,
                        &payload.text,
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
    offset: usize,
    limit: usize,
}

async fn data_sources_documents_list(
    extract::Path((project_id, data_source_id)): extract::Path<(i64, String)>,
    extract::Query(query): extract::Query<DataSourcesListQuery>,
    extract::Extension(state): extract::Extension<Arc<APIState>>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);
    match state
        .store
        .list_data_source_documents(
            &project,
            &data_source_id,
            Some((query.limit, query.offset)),
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
                    "offset": query.offset,
                    "limit": query.limit,
                    "total": total,
                    "documents": documents,
                })),
            }),
        ),
    }
}

/// Retrieve document from a data source.
#[derive(serde::Deserialize)]
struct DataSourcesDocumentsRetrieveQuery {
    version_hash: Option<String>,
}

async fn data_sources_documents_retrieve(
    extract::Path((project_id, data_source_id, document_id)): extract::Path<(i64, String, String)>,
    extract::Query(query): extract::Query<DataSourcesDocumentsRetrieveQuery>,
    extract::Extension(state): extract::Extension<Arc<APIState>>,
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
                .retrieve(state.store.clone(), &document_id, true, &query.version_hash)
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
    extract::Path((project_id, data_source_id, document_id)): extract::Path<(i64, String, String)>,
    extract::Extension(state): extract::Extension<Arc<APIState>>,
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
                    state.qdrant_client.clone(),
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
    extract::Path((project_id, data_source_id)): extract::Path<(i64, String)>,
    extract::Extension(state): extract::Extension<Arc<APIState>>,
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
                .delete(state.store.clone(), state.qdrant_client.clone())
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

// Misc

#[derive(serde::Deserialize)]
struct TokenizePayload {
    text: String,
    provider_id: ProviderID,
    model_id: String,
}

async fn tokenize(
    extract::Json(payload): extract::Json<TokenizePayload>,
) -> (StatusCode, Json<APIResponse>) {
    let embedder = provider(payload.provider_id).embedder(payload.model_id);
    match embedder.custom_tokenize(payload.text).await {
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to tokenize text",
            Some(e),
        ),
        Ok((tokens, strings)) => (
            StatusCode::OK,
            Json(APIResponse {
                error: None,
                response: Some(json!({
                    "tokens": tokens,
                    "strings": strings,
                })),
            }),
        ),
    }
}

async fn qdrant_client() -> Result<QdrantClient> {
    match std::env::var("QDRANT_URL") {
        Ok(url) => {
            let mut config = QdrantClientConfig::from_url(&url);
            match std::env::var("QDRANT_API_KEY") {
                Ok(api_key) => {
                    config.set_api_key(&api_key);
                    QdrantClient::new(Some(config))
                }
                Err(_) => Err(anyhow!("QDRANT_API_KEY is not set"))?,
            }
        }
        Err(_) => Err(anyhow!("QDRANT_URL is not set"))?,
    }
}

fn main() {
    let rt = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(32)
        //.thread_name("dust-api-server")
        //.thread_stack_size(32 * 1024 * 1024)
        .enable_all()
        .build()
        .unwrap();

    let _ = rt.block_on(async {
        tracing_subscriber::fmt()
            .with_target(false)
            .compact()
            .init();

        let store: Box<dyn store::Store + Sync + Send> = match std::env::var("CORE_DATABASE_URI") {
            Ok(db_uri) => {
                let store = postgres::PostgresStore::new(&db_uri).await?;
                store.init().await?;
                Box::new(store)
            }
            Err(_) => Err(anyhow!("CORE_DATABASE_URI is required (postgres)"))?,
        };
        let qdrant_client = Arc::new(qdrant_client().await?);

        let state = Arc::new(APIState::new(store, qdrant_client));

        let app = Router::new()
        // Index
        .route("/", get(index))
        // Projects
        .route("/projects", post(projects_create))
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
        // Misc
        .route("/tokenize", post(tokenize))

        // Extensions
        .layer(DefaultBodyLimit::disable())
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(trace::DefaultMakeSpan::new().level(Level::INFO))
                .on_response(trace::DefaultOnResponse::new().level(Level::INFO)),
        )
        .layer(extract::Extension(state.clone()));

        // Start the APIState run loop.
        let state = state.clone();
        tokio::task::spawn(async move { state.run_loop().await });

        let (tx, rx) = tokio::sync::oneshot::channel();
        let srv = axum::Server::bind(&"[::]:3001".parse().unwrap())
            .serve(app.into_make_service())
            .with_graceful_shutdown(async {
                rx.await.ok();
            });

        tokio::spawn(async move {
            if let Err(e) = srv.await {
                eprintln!("server error: {}", e);
            }
        });

        // Wait for `ctrl+c` and stop the server
        tokio::signal::ctrl_c().await.unwrap();
        println!("Ctrl+C received, stopping server...");
        let _ = tx.send(());

        // Wait for another `ctrl+c` and exit
        tokio::signal::ctrl_c().await.unwrap();

        Ok::<(), anyhow::Error>(())
    });
}
