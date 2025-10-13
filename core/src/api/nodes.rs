use crate::api::api_state::APIState;
use crate::search_stores::search_store::{NodesSearchFilter, NodesSearchOptions};
use crate::utils::{error_response, APIResponse};
use axum::extract::State;
use axum::Json;
use http::StatusCode;
use serde_json::json;
use std::sync::Arc;

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NodesSearchPayload {
    query: Option<String>,
    filter: NodesSearchFilter,
    options: Option<NodesSearchOptions>,
}

pub async fn nodes_search(
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
