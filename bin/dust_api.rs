use anyhow::Result;
use axum::{
    extract,
    response::Json,
    routing::{get, post},
    Router,
};
use dust::{app, dataset, project, stores::sqlite, stores::store, run};
use hyper::http::StatusCode;
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

struct APIState {
    store: Box<dyn store::Store + Sync + Send>,
    // TODO(spolu): add running promises?
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
    specification_id: String,
    dataset_id: String,
    config: run::RunConfig,
}

async fn runs_create(
    extract::Path((project_id)): extract::Path<(i64, String, String)>,
    extract::Json(payload): extract::Json<DatasetsRegisterPayload>,
    extract::Extension(state): extract::Extension<Arc<APIState>>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);
    let app = App::new(&spec_data).await?;
}


#[tokio::main]
async fn main() -> Result<()> {
    let store = sqlite::SQLiteStore::new("api_store.sqlite")?;
    store.init().await?;

    let state = Arc::new(APIState {
        store: Box::new(store),
    });

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
        .route("/v1/projects/:project_id/runs/:run_id", get(runs_get))
        // Extensions
        .layer(extract::Extension(state));

    axum::Server::bind(&"0.0.0.0:3000".parse().unwrap())
        .serve(app.into_make_service())
        .await?;

    Ok(())
}
