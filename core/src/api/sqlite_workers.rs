use crate::api::api_state::APIState;
use crate::sqlite_workers::client::HEARTBEAT_INTERVAL_MS;
use crate::utils::{error_response, APIResponse};
use axum::{extract::State, response::Json};
use hyper::http::StatusCode;
use serde_json::json;
use std::sync::Arc;
// SQLite Workers

#[derive(serde::Deserialize)]
pub struct SQLiteWorkersUpsertOrDeletePayload {
    url: String,
}

pub async fn sqlite_workers_heartbeat(
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

pub async fn sqlite_workers_delete(
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
