use crate::api::api_state::APIState;
use crate::search_stores::search_store::{DatasourceViewFilter, TagsQueryType};
use crate::utils::{error_response, APIResponse};
use axum::extract::State;
use axum::Json;
use http::StatusCode;
use serde_json::json;
use std::sync::Arc;

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TagsSearchPayload {
    query: Option<String>,
    query_type: Option<TagsQueryType>,
    data_source_views: Vec<DatasourceViewFilter>,
    node_ids: Option<Vec<String>>,
    limit: Option<u64>,
}

pub async fn tags_search(
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
