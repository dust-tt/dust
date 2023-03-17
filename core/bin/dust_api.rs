use anyhow::{anyhow, Result};
use axum::{
    extract,
    response::{
        sse::{Event, KeepAlive, Sse},
        Json,
    },
    routing::{delete, get, post},
    Router,
};
use dust::{
    app,
    blocks::block::BlockType,
    data_sources::data_source,
    dataset, project, run,
    stores::store,
    stores::{postgres, sqlite},
    utils,
};
use futures::stream::Stream;
use hyper::http::StatusCode;
use parking_lot::Mutex;
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::convert::Infallible;
use std::sync::Arc;
use tokio::sync::mpsc::unbounded_channel;

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
    run_manager: Arc<Mutex<RunManager>>,
}

impl APIState {
    fn new(store: Box<dyn store::Store + Sync + Send>) -> Self {
        APIState {
            store,
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
                let manager = self.run_manager.clone();

                // Start a task that will run the app in the background.
                tokio::task::spawn(async move {
                    match app.0.run(app.1, store, None).await {
                        Ok(()) => {
                            utils::done(&format!(
                                "Run `{}` for app version `{}` finished",
                                app.0.run_ref().unwrap().run_id(),
                                app.0.hash(),
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
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(APIResponse {
                error: Some(APIError {
                    code: String::from("internal_server_error"),
                    message: format!("Failed to create a new project: {}", e),
                }),
                response: None,
            }),
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
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(APIResponse {
                    error: Some(APIError {
                        code: String::from("internal_server_error"),
                        message: format!("Failed to create cloned project: {}", e),
                    }),
                    response: None,
                }),
            )
        }
        Ok(project) => project,
    };

    // Retrieve datasets
    let datasets = match state.store.list_datasets(&cloned).await {
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(APIResponse {
                    error: Some(APIError {
                        code: String::from("internal_server_error"),
                        message: format!("Failed to list cloned project datasets: {}", e),
                    }),
                    response: None,
                }),
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
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(APIResponse {
                    error: Some(APIError {
                        code: String::from("internal_server_error"),
                        message: format!("Failed to clone project datasets: {}", e),
                    }),
                    response: None,
                }),
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
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(APIResponse {
                error: Some(APIError {
                    code: String::from("invalid_specification_error"),
                    message: e.to_string(),
                }),
                response: None,
            }),
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
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(APIResponse {
                error: Some(APIError {
                    code: String::from("internal_server_error"),
                    message: format!("Failed to retrieve specification: {}", e),
                }),
                response: None,
            }),
        ),
        Ok(s) => match s {
            None => (
                StatusCode::NOT_FOUND,
                Json(APIResponse {
                    error: Some(APIError {
                        code: String::from("specification_not_found"),
                        message: format!("No specification found with hash `{}`", hash),
                    }),
                    response: None,
                }),
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
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(APIResponse {
                error: Some(APIError {
                    code: String::from("invalid_dataset_error"),
                    message: e.to_string(),
                }),
                response: None,
            }),
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
                    Err(e) => (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(APIResponse {
                            error: Some(APIError {
                                code: String::from("internal_server_error"),
                                message: format!("Failed to store dataset: {}", e),
                            }),
                            response: None,
                        }),
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
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(APIResponse {
                error: Some(APIError {
                    code: String::from("internal_server_error"),
                    message: format!("Failed to list datasets: {}", e),
                }),
                response: None,
            }),
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
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(APIResponse {
                error: Some(APIError {
                    code: String::from("internal_server_error"),
                    message: format!("Failed to retrieve dataset: {}", e),
                }),
                response: None,
            }),
        ),
        Ok(dataset) => match dataset {
            None => (
                StatusCode::NOT_FOUND,
                Json(APIResponse {
                    error: Some(APIError {
                        code: String::from("dataset_not_found"),
                        message: format!(
                            "No dataset found for id `{}` and hash `{}`",
                            dataset_id, hash
                        ),
                    }),
                    response: None,
                }),
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
) -> Result<app::App, (StatusCode, APIError)> {
    let project = project::Project::new_from_id(project_id);

    let mut register_spec = true;
    let specification = match payload.specification {
        Some(spec) => spec,
        None => match payload.specification_hash {
            Some(hash) => match state.store.load_specification(&project, &hash).await {
                Err(e) => Err((
                    StatusCode::INTERNAL_SERVER_ERROR,
                    APIError {
                        code: String::from("internal_server_error"),
                        message: format!("Failed to retrieve specification: {}", e),
                    },
                ))?,
                Ok(spec) => match spec {
                    None => Err((
                        StatusCode::NOT_FOUND,
                        APIError {
                            code: String::from("specification_not_found"),
                            message: format!("No specification found for hash `{}`", hash),
                        },
                    ))?,
                    Some((_, s)) => {
                        register_spec = false;
                        s
                    }
                },
            },
            None => Err((
                StatusCode::BAD_REQUEST,
                APIError {
                    code: String::from("missing_specification_error"),
                    message: String::from(
                        "No specification provided, \
                                 either `specification` or `specification_hash` must be provided",
                    ),
                },
            ))?,
        },
    };

    let mut app = match app::App::new(&specification).await {
        Err(e) => Err((
            StatusCode::BAD_REQUEST,
            APIError {
                code: String::from("invalid_specification_error"),
                message: e.to_string(),
            },
        ))?,
        Ok(app) => app,
    };

    let mut d = match payload.dataset_id.as_ref() {
        None => None,
        Some(dataset_id) => match state.store.latest_dataset_hash(&project, dataset_id).await {
            Err(e) => Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                APIError {
                    code: String::from("internal_server_error"),
                    message: format!("Failed to retrieve dataset: {}", e),
                },
            ))?,
            Ok(None) => Err((
                StatusCode::NOT_FOUND,
                APIError {
                    code: String::from("dataset_not_found"),
                    message: format!("No dataset found for id `{}`", dataset_id),
                },
            ))?,
            Ok(Some(latest)) => match state
                .store
                .load_dataset(&project, dataset_id, &latest)
                .await
            {
                Err(e) => Err((
                    StatusCode::INTERNAL_SERVER_ERROR,
                    APIError {
                        code: String::from("internal_server_error"),
                        message: format!("Failed to retrieve dataset: {}", e),
                    },
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
            Err((
                StatusCode::BAD_REQUEST,
                APIError {
                    code: String::from("invalid_run_type_error"),
                    message: String::from(
                        "RunType `local` is expected when a `dataset_id` is provided",
                    ),
                },
            ))?
        }

        if d.as_ref().unwrap().len() == 0 {
            Err((
                StatusCode::BAD_REQUEST,
                APIError {
                    code: String::from("dataset_empty_error"),
                    message: format!(
                        "Dataset `{}` has 0 record",
                        payload.dataset_id.as_ref().unwrap()
                    ),
                },
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
            Err(e) => Err((
                StatusCode::BAD_REQUEST,
                APIError {
                    code: String::from("invalid_inputs_error"),
                    message: e.to_string(),
                },
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
            Err(e) => Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                APIError {
                    code: String::from("internal_server_error"),
                    message: format!("Failed to register specification: {}", e),
                },
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
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            APIError {
                code: String::from("internal_server_error"),
                message: format!("Failed prepare run: {}", e),
            },
        ))?,
        Ok(()) => (),
    }

    Ok(app)
}

async fn runs_create(
    extract::Path(project_id): extract::Path<i64>,
    extract::Json(payload): extract::Json<RunsCreatePayload>,
    extract::Extension(state): extract::Extension<Arc<APIState>>,
) -> (StatusCode, Json<APIResponse>) {
    match run_helper(project_id, payload.clone(), state.clone()).await {
        Ok(app) => {
            // The run is empty for now, we can clone it for the response.
            let run = app.run_ref().unwrap().clone();
            state.run_app(app, payload.credentials.clone());
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
        Err((status_code, api_error)) => (
            status_code,
            Json(APIResponse {
                error: Some(api_error),
                response: None,
            }),
        ),
    }
}

async fn runs_create_stream(
    extract::Path(project_id): extract::Path<i64>,
    extract::Json(payload): extract::Json<RunsCreatePayload>,
    extract::Extension(state): extract::Extension<Arc<APIState>>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    // create unbounded channel to pass as stream to Sse::new
    let (tx, mut rx) = unbounded_channel::<Value>();

    match run_helper(project_id, payload.clone(), state.clone()).await {
        Ok(mut app) => {
            // The run is empty for now, we can clone it for the response.
            // let run = app.run_ref().unwrap().clone();
            let credentials = payload.credentials.clone();
            let store = state.store.clone();

            // Start a task that will run the app in the background.
            tokio::task::spawn(async move {
                match app.run(credentials, store, Some(tx.clone())).await {
                    Ok(()) => {
                        utils::done(&format!(
                            "Run `{}` for app version `{}` finished",
                            app.run_ref().unwrap().run_id(),
                            app.hash(),
                        ));
                    }
                    Err(e) => {
                        utils::error(&format!("Run error: {}", e));
                    }
                }
            });
        }
        Err((_, api_error)) => {
            let _ = tx.send(json!({
                "type": "error",
                "content": {
                    "code": api_error.code,
                    "message": api_error.message,
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
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(APIResponse {
                error: Some(APIError {
                    code: String::from("internal_server_error"),
                    message: format!("Failed to list runs: {}", e),
                }),
                response: None,
            }),
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

async fn runs_retrieve(
    extract::Path((project_id, run_id)): extract::Path<(i64, String)>,
    extract::Extension(state): extract::Extension<Arc<APIState>>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);
    match state.store.load_run(&project, &run_id, None).await {
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(APIResponse {
                error: Some(APIError {
                    code: String::from("internal_server_error"),
                    message: format!("Failed to retrieve run: {}", e),
                }),
                response: None,
            }),
        ),
        Ok(run) => match run {
            None => (
                StatusCode::NOT_FOUND,
                Json(APIResponse {
                    error: Some(APIError {
                        code: String::from("run_not_found"),
                        message: format!("No run found for id `{}`", run_id),
                    }),
                    response: None,
                }),
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
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(APIResponse {
                error: Some(APIError {
                    code: String::from("internal_server_error"),
                    message: format!("Failed to retrieve run: {}", e),
                }),
                response: None,
            }),
        ),
        Ok(run) => match run {
            None => (
                StatusCode::NOT_FOUND,
                Json(APIResponse {
                    error: Some(APIError {
                        code: String::from("run_not_found"),
                        message: format!("No run found for id `{}`", run_id),
                    }),
                    response: None,
                }),
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
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(APIResponse {
                error: Some(APIError {
                    code: String::from("internal_server_error"),
                    message: format!("Failed to retrieve run: {}", e),
                }),
                response: None,
            }),
        ),
        Ok(run) => match run {
            None => (
                StatusCode::NOT_FOUND,
                Json(APIResponse {
                    error: Some(APIError {
                        code: String::from("run_not_found"),
                        message: format!("No run found for id `{}`", run_id),
                    }),
                    response: None,
                }),
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
}

async fn data_sources_register(
    extract::Path(project_id): extract::Path<i64>,
    extract::Json(payload): extract::Json<DataSourcesRegisterPayload>,
    extract::Extension(state): extract::Extension<Arc<APIState>>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);
    let ds = data_source::DataSource::new(&project, &payload.data_source_id, &payload.config);
    match ds.setup().await {
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(APIResponse {
                error: Some(APIError {
                    code: String::from("internal_server_error"),
                    message: format!("Failed to register data source: {}", e),
                }),
                response: None,
            }),
        ),
        Ok(()) => match state.store.register_data_source(&project, &ds).await {
            Err(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(APIResponse {
                    error: Some(APIError {
                        code: String::from("internal_server_error"),
                        message: format!("Failed to register data source: {}", e),
                    }),
                    response: None,
                }),
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

/// Upsert a document in a data source.

#[derive(serde::Deserialize)]
struct DataSourcesDocumentsUpsertPayload {
    document_id: String,
    timestamp: Option<u64>,
    tags: Vec<String>,
    text: String,
    credentials: run::Credentials,
}

async fn data_sources_documents_upsert(
    extract::Path((project_id, data_source_id)): extract::Path<(i64, String)>,
    extract::Json(payload): extract::Json<DataSourcesDocumentsUpsertPayload>,
    extract::Extension(state): extract::Extension<Arc<APIState>>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);
    match state
        .store
        .load_data_source(&project, &data_source_id)
        .await
    {
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(APIResponse {
                error: Some(APIError {
                    code: String::from("internal_server_error"),
                    message: format!("Failed to retrieve data source: {}", e),
                }),
                response: None,
            }),
        ),
        Ok(ds) => match ds {
            None => (
                StatusCode::NOT_FOUND,
                Json(APIResponse {
                    error: Some(APIError {
                        code: String::from("data_source_not_found"),
                        message: format!("No data source found for id `{}`", data_source_id),
                    }),
                    response: None,
                }),
            ),
            Some(ds) => {
                match ds
                    .upsert(
                        payload.credentials,
                        state.store.clone(),
                        &payload.document_id,
                        payload.timestamp,
                        &payload.tags,
                        &payload.text,
                    )
                    .await
                {
                    Err(e) => (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(APIResponse {
                            error: Some(APIError {
                                code: String::from("internal_server_error"),
                                message: format!("Failed to upsert document: {}", e),
                            }),
                            response: None,
                        }),
                    ),
                    Ok(d) => (
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
        .list_data_source_documents(&project, &data_source_id, Some((query.limit, query.offset)))
        .await
    {
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(APIResponse {
                error: Some(APIError {
                    code: String::from("internal_server_error"),
                    message: format!("Failed to list data source: {}", e),
                }),
                response: None,
            }),
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

async fn data_sources_documents_retrieve(
    extract::Path((project_id, data_source_id, document_id)): extract::Path<(i64, String, String)>,
    extract::Extension(state): extract::Extension<Arc<APIState>>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);
    match state
        .store
        .load_data_source(&project, &data_source_id)
        .await
    {
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(APIResponse {
                error: Some(APIError {
                    code: String::from("internal_server_error"),
                    message: format!("Failed to retrieve data source: {}", e),
                }),
                response: None,
            }),
        ),
        Ok(ds) => match ds {
            None => (
                StatusCode::NOT_FOUND,
                Json(APIResponse {
                    error: Some(APIError {
                        code: String::from("data_source_not_found"),
                        message: format!("No data source found for id `{}`", data_source_id),
                    }),
                    response: None,
                }),
            ),
            Some(ds) => match ds.retrieve(state.store.clone(), &document_id).await {
                Err(e) => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(APIResponse {
                        error: Some(APIError {
                            code: String::from("internal_server_error"),
                            message: format!("Failed to retrieve document: {}", e),
                        }),
                        response: None,
                    }),
                ),
                Ok(None) => (
                    StatusCode::NOT_FOUND,
                    Json(APIResponse {
                        error: Some(APIError {
                            code: String::from("data_source_document_not_found"),
                            message: format!("No document found for id `{}`", document_id),
                        }),
                        response: None,
                    }),
                ),
                Ok(Some((d, text))) => (
                    StatusCode::OK,
                    Json(APIResponse {
                        error: None,
                        response: Some(json!({
                            "document": d,
                            "text": text,
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
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(APIResponse {
                error: Some(APIError {
                    code: String::from("internal_server_error"),
                    message: format!("Failed to retrieve data source: {}", e),
                }),
                response: None,
            }),
        ),
        Ok(ds) => match ds {
            None => (
                StatusCode::NOT_FOUND,
                Json(APIResponse {
                    error: Some(APIError {
                        code: String::from("data_source_not_found"),
                        message: format!("No data source found for id `{}`", data_source_id),
                    }),
                    response: None,
                }),
            ),
            Some(ds) => match ds.delete_document(state.store.clone(), &document_id).await {
                Err(e) => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(APIResponse {
                        error: Some(APIError {
                            code: String::from("internal_server_error"),
                            message: format!("Failed to delete document: {}", e),
                        }),
                        response: None,
                    }),
                ),
                Ok(_) => (
                    StatusCode::OK,
                    Json(APIResponse {
                        error: None,
                        response: Some(json!({
                            "data_source": {
                                "created": ds.created(),
                                "data_source_id": ds.data_source_id(),
                                "internal_id": ds.internal_id(),
                                "config": ds.config(),
                            }
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
    println!("IN DELETE");
    match state
        .store
        .load_data_source(&project, &data_source_id)
        .await
    {
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(APIResponse {
                error: Some(APIError {
                    code: String::from("internal_server_error"),
                    message: format!("Failed to retrieve data source: {}", e),
                }),
                response: None,
            }),
        ),
        Ok(ds) => match ds {
            None => (
                StatusCode::NOT_FOUND,
                Json(APIResponse {
                    error: Some(APIError {
                        code: String::from("data_source_not_found"),
                        message: format!("No data source found for id `{}`", data_source_id),
                    }),
                    response: None,
                }),
            ),
            Some(ds) => match ds.delete(state.store.clone()).await {
                Err(e) => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(APIResponse {
                        error: Some(APIError {
                            code: String::from("internal_server_error"),
                            message: format!("Failed to delete data source: {}", e),
                        }),
                        response: None,
                    }),
                ),
                Ok(_) => (
                    StatusCode::OK,
                    Json(APIResponse {
                        error: None,
                        response: Some(json!({
                            "data_source": {
                                "created": ds.created(),
                                "data_source_id": ds.data_source_id(),
                                "internal_id": ds.internal_id(),
                                "config": ds.config(),
                            }
                        })),
                    }),
                ),
            },
        },
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    let store: Box<dyn store::Store + Sync + Send> = match std::env::var("CORE_DATABASE_URI") {
        Ok(db_uri) => {
            let store = postgres::PostgresStore::new(&db_uri).await?;
            store.init().await?;
            Box::new(store)
        }
        Err(_) => {
            let store = sqlite::SQLiteStore::new("api_store.sqlite")?;
            store.init().await?;
            Box::new(store)
        }
    };

    let state = Arc::new(APIState::new(store));

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
            "/projects/:project_id/data_sources/:data_source_id/documents",
            post(data_sources_documents_upsert),
        )
        // Provided by the data_source block.
        // .route(
        //     "/projects/:project_id/data_sources/:data_source_id/search",
        //     get(data_sources_search),
        // )
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
        // Extensions
        .layer(extract::Extension(state.clone()));

    // Start the APIState run loop.
    let state = state.clone();
    tokio::task::spawn(async move { state.run_loop().await });

    axum::Server::bind(&"0.0.0.0:3001".parse().unwrap())
        .serve(app.into_make_service())
        .await?;

    Ok(())
}
