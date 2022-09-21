use anyhow::Result;
use axum::{
    body::Body,
    extract,
    response::Json,
    routing::{get, post},
    Router,
};
use dust::{app, dataset, project, stores::sqlite, stores::store};
use hyper::http::StatusCode;
use serde::Serialize;
use serde_json::{json, Value};
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
struct DatasetsCreatePayload {
    dataset_id: String,
    data: Vec<Value>,
}

async fn datasets_create(
    extract::Path(project_id): extract::Path<i64>,
    extract::Json(payload): extract::Json<DatasetsCreatePayload>,
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

async fn datasets_get(
    extract::Path(project_id): extract::Path<i64>,
) -> (StatusCode, Json<APIResponse>) {
    let _project = project::Project::new_from_id(project_id);
    unimplemented!()
}

#[tokio::main]
async fn main() -> Result<()> {
    let state = Arc::new(APIState {
        store: Box::new(sqlite::SQLiteStore::new("api.db")?),
    });

    let app = Router::new()
        .route("/", get(index))
        .route("/v1/projects", post(projects_create))
        .route(
            "/v1/projects/:project_id/specifications/check",
            post(specifications_check),
        )
        .route("/v1/projects/:project_id/datasets", post(datasets_create))
        .route("/v1/projects/:project_id/datasets", get(datasets_get))
        .layer(extract::Extension(state));

    axum::Server::bind(&"0.0.0.0:3000".parse().unwrap())
        .serve(app.into_make_service())
        .await?;

    Ok(())
}
