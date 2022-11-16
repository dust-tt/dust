use anyhow::{anyhow, Result};
use axum::{
    extract,
    response::Json,
    routing::{get, post},
    Router,
};
use dust::{
    app,
    blocks::block::BlockType,
    dataset, project, run,
    stores::store,
    stores::{postgres, sqlite},
    utils,
};
use hyper::http::StatusCode;
use parking_lot::Mutex;
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;

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
                    match app.0.run(app.1, store).await {
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

#[derive(serde::Deserialize)]
struct RunsCreatePayload {
    run_type: run::RunType,
    specification: String,
    dataset_id: Option<String>,
    inputs: Option<Vec<Value>>,
    config: run::RunConfig,
    credentials: run::Credentials,
}

async fn runs_create(
    extract::Path(project_id): extract::Path<i64>,
    extract::Json(payload): extract::Json<RunsCreatePayload>,
    extract::Extension(state): extract::Extension<Arc<APIState>>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);

    let mut app = match app::App::new(&payload.specification).await {
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(APIResponse {
                    error: Some(APIError {
                        code: String::from("invalid_specification_error"),
                        message: e.to_string(),
                    }),
                    response: None,
                }),
            )
        }
        Ok(app) => app,
    };

    let mut d = match payload.dataset_id.as_ref() {
        None => None,
        Some(dataset_id) => match state.store.latest_dataset_hash(&project, dataset_id).await {
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(APIResponse {
                        error: Some(APIError {
                            code: String::from("internal_server_error"),
                            message: format!("Failed to retrieve dataset: {}", e),
                        }),
                        response: None,
                    }),
                )
            }
            Ok(None) => {
                return (
                    StatusCode::NOT_FOUND,
                    Json(APIResponse {
                        error: Some(APIError {
                            code: String::from("dataset_not_found"),
                            message: format!("No dataset found for id `{}`", dataset_id),
                        }),
                        response: None,
                    }),
                )
            }
            Ok(Some(latest)) => match state
                .store
                .load_dataset(&project, dataset_id, &latest)
                .await
            {
                Err(e) => {
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(APIResponse {
                            error: Some(APIError {
                                code: String::from("internal_server_error"),
                                message: format!("Failed to retrieve dataset: {}", e),
                            }),
                            response: None,
                        }),
                    )
                }
                Ok(d) => match d {
                    None => unreachable!(),
                    Some(d) => Some(d),
                },
            },
        },
    };

    if d.is_some() {
        if payload.run_type != run::RunType::Local {
            return (
                StatusCode::BAD_REQUEST,
                Json(APIResponse {
                    error: Some(APIError {
                        code: String::from("invalid_run_type_error"),
                        message: String::from(
                            "RunType `local` is expected when a `dataset_id` is provided",
                        ),
                    }),
                    response: None,
                }),
            );
        }

        if d.as_ref().unwrap().len() == 0 {
            return (
                StatusCode::BAD_REQUEST,
                Json(APIResponse {
                    error: Some(APIError {
                        code: String::from("dataset_empty_error"),
                        message: format!(
                            "Dataset `{}` has 0 record",
                            payload.dataset_id.as_ref().unwrap()
                        ),
                    }),
                    response: None,
                }),
            );
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
        if payload.run_type != run::RunType::Deploy {
            return (
                StatusCode::BAD_REQUEST,
                Json(APIResponse {
                    error: Some(APIError {
                        code: String::from("invalid_run_type_error"),
                        message: String::from(
                            "RunType `deploy` is expected when `inputs` are provided",
                        ),
                    }),
                    response: None,
                }),
            );
        }

        d = match dataset::Dataset::new_from_jsonl("inputs", payload.inputs.unwrap()).await {
            Err(e) => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(APIResponse {
                        error: Some(APIError {
                            code: String::from("invalid_inputs_error"),
                            message: e.to_string(),
                        }),
                        response: None,
                    }),
                )
            }
            Ok(d) => Some(d),
        };

        utils::info(format!("Received {} inputs.", d.as_ref().unwrap().len(),).as_str());
    }

    match state
        .store
        .register_specification(&project, &app.hash(), &payload.specification)
        .await
    {
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(APIResponse {
                    error: Some(APIError {
                        code: String::from("internal_server_error"),
                        message: format!("Failed to register specification: {}", e),
                    }),
                    response: None,
                }),
            )
        }
        Ok(_) => (),
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
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(APIResponse {
                    error: Some(APIError {
                        code: String::from("internal_server_error"),
                        message: format!("Failed prepare run: {}", e),
                    }),
                    response: None,
                }),
            )
        }
        Ok(()) => (),
    }

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

#[tokio::main]
async fn main() -> Result<()> {
    let store: Box<dyn store::Store + Sync + Send> = match std::env::var("DATABASE_URI") {
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
