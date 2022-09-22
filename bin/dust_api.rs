use anyhow::Result;
use axum::{
    extract,
    response::Json,
    routing::{get, post},
    Router,
};
use dust::{app, dataset, project, run, stores::sqlite, stores::store, utils};
use futures::Future;
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
    pending_apps: Vec<app::App>,
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

    async fn run_loop(&self) -> Result<()> {
        loop {
            let mut apps: Vec<app::App> = vec![];
            {
                let mut manager = self.run_manager.lock();
                apps = manager.pending_apps.drain(..).collect::<Vec<_>>();
                apps.iter().for_each(|app| {
                    manager.pending_runs.push(app.run_id().unwrap().to_string());
                });
            }
            apps.into_iter().for_each(|mut app| {
                let store = self.store.clone();
                let manager = self.run_manager.clone();
                // Start a task that will run the app
                tokio::task::spawn(async move {
                    match app.run(store).await {
                        Ok(()) => {
                            utils::done(&format!(
                                "Run `{}` for app version `{}` finished",
                                app.run_id().unwrap(),
                                app.hash(),
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
                            .retain(|run_id| run_id != app.run_id().unwrap());
                    }
                });
            });
            std::thread::sleep(std::time::Duration::from_millis(100));
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
        Ok(d) => match state.store.register_dataset(&project, &d).await {
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
        },
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
                StatusCode::BAD_REQUEST,
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
    specification: String,
    dataset_id: String,
    config: run::RunConfig,
}

async fn runs_create(
    extract::Path(project_id): extract::Path<i64>,
    extract::Json(payload): extract::Json<RunsCreatePayload>,
    extract::Extension(state): extract::Extension<Arc<APIState>>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);

    let app: Box<dyn Future<Output = Result<app::App, anyhow::Error>>> =
        Box::new(app::App::new(&payload.specification));

    // let d = match store.latest_dataset_hash(&project, dataset_id).await? {
    //     Some(latest) => store
    //         .load_dataset(&project, dataset_id, &latest)
    //         .await?
    //         .unwrap(),
    //     None => Err(anyhow!("No dataset found for id `{}`", dataset_id))?,
    // };

    // if d.len() == 0 {
    //     Err(anyhow!("Retrieved 0 records from `{dataset_id}`"))?
    // }
    // utils::info(
    //     format!(
    //         "Retrieved {} records from latest data version for `{}`.",
    //         d.len(),
    //         dataset_id
    //     )
    //     .as_str(),
    // );

    // store
    //     .register_specification(&project, &app.hash, &spec_data)
    //     .await?;

    // app.create_run(&run_config, project.clone(), Box::new(store.clone()))
    //     .await?;

    // app.run(
    //     &d,
    //     &run_config,
    //     concurrency,
    //     project.clone(),
    //     Box::new(store),
    // )
    // .await

    (
        StatusCode::OK,
        Json(APIResponse {
            error: None,
            response: None,
        }),
    )
}

#[tokio::main]
async fn main() -> Result<()> {
    let store = sqlite::SQLiteStore::new("api_store.sqlite")?;
    store.init().await?;

    let state = Arc::new(APIState::new(Box::new(store)));

    // Start the APIState run loop.
    tokio::task::spawn(state.run_loop());

    let app = Router::new()
        // Index
        .route("/", get(index))
        // Projects
        .route("/v1/projects", post(projects_create))
        // Specifications
        .route(
            "/v1/projects/:project_id/specifications/check",
            post(specifications_check),
        )
        // Datasets
        .route("/v1/projects/:project_id/datasets", post(datasets_register))
        .route("/v1/projects/:project_id/datasets", get(datasets_list))
        .route(
            "/v1/projects/:project_id/datasets/:dataset_id/:hash",
            get(datasets_retrieve),
        )
        // Runs
        .route("/v1/projects/:project_id/runs", post(runs_create))
        .route(
            "/v1/projects/:project_id/runs/:run_id/status",
            get(runs_status),
        )
        .route("/v1/projects/:project_id/runs/:run_id", get(runs_get))
        // Extensions
        .layer(extract::Extension(state));

    axum::Server::bind(&"0.0.0.0:3000".parse().unwrap())
        .serve(app.into_make_service())
        .await?;

    Ok(())
}
