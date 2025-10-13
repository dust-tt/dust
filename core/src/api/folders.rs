use crate::api::api_state::APIState;
use crate::data_sources::node::ProviderVisibility;
use crate::search_filter::SearchFilter;
use crate::search_stores::search_store::NodeItem;
use crate::stores::store::FolderUpsertParams;
use crate::utils::{error_response, APIResponse};
use crate::{project, utils};
use axum::extract::{Path, Query, State};
use axum::Json;
use http::StatusCode;
use serde_json::json;
use std::sync::Arc;

#[derive(serde::Deserialize)]
pub struct FoldersUpsertPayload {
    folder_id: String,
    timestamp: Option<u64>,
    parent_id: Option<String>,
    parents: Vec<String>,
    title: String,
    mime_type: String,
    source_url: Option<String>,
    provider_visibility: Option<ProviderVisibility>,
}

pub async fn folders_upsert(
    Path((project_id, data_source_id)): Path<(i64, String)>,
    State(state): State<Arc<APIState>>,
    Json(payload): Json<FoldersUpsertPayload>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);

    if payload.parents.get(0) != Some(&payload.folder_id) {
        return error_response(
            StatusCode::BAD_REQUEST,
            "invalid_parents",
            "Failed to upsert folder - parents[0] and folder_id should be equal",
            None,
        );
    }

    match &payload.parent_id {
        Some(parent_id) => {
            if payload.parents.get(1) != Some(parent_id) {
                return error_response(
                    StatusCode::BAD_REQUEST,
                    "invalid_parent_id",
                    "Failed to upsert folder - parents[1] and parent_id should be equal",
                    None,
                );
            }
        }
        None => {
            if payload.parents.len() > 1 {
                return error_response(
                    StatusCode::BAD_REQUEST,
                    "invalid_parent_id",
                    "Failed to upsert folder - parent_id should not be null if parents[1] is defined",
                    None,
                );
            }
        }
    }

    if payload.title.trim().is_empty() {
        return error_response(
            StatusCode::BAD_REQUEST,
            "title_is_empty",
            "Failed to upsert folder - title is empty",
            None,
        );
    }

    match state
        .store
        .upsert_data_source_folder(
            project,
            data_source_id,
            FolderUpsertParams {
                folder_id: payload.folder_id,
                timestamp: payload.timestamp.unwrap_or(utils::now()),
                parents: payload.parents,
                title: payload.title,
                mime_type: payload.mime_type,
                source_url: payload.source_url,
                provider_visibility: payload.provider_visibility,
            },
        )
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to upsert folder",
            Some(e),
        ),
        Ok(folder) => match state
            .search_store
            .index_node(NodeItem::Folder(folder.clone()))
            .await
        {
            Ok(_) => (
                StatusCode::OK,
                Json(APIResponse {
                    error: None,
                    response: Some(json!({
                        "folder": folder
                    })),
                }),
            ),
            Err(e) => error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_server_error",
                "Failed to index folder",
                Some(e),
            ),
        },
    }
}

pub async fn folders_retrieve(
    Path((project_id, data_source_id, folder_id)): Path<(i64, String, String)>,
    State(state): State<Arc<APIState>>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);

    match state
        .store
        .load_data_source_folder(&project, &data_source_id, &folder_id)
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to load folder",
            Some(e),
        ),
        Ok(folder) => (
            StatusCode::OK,
            Json(APIResponse {
                error: None,
                response: Some(json!({
                    "folder": folder
                })),
            }),
        ),
    }
}

#[derive(serde::Deserialize)]
pub struct FoldersListQuery {
    limit: Option<usize>,
    offset: Option<usize>,
    folder_ids: Option<String>,  // Parsed as JSON.
    view_filter: Option<String>, // Parsed as JSON.
}

pub async fn folders_list(
    Path((project_id, data_source_id)): Path<(i64, String)>,
    State(state): State<Arc<APIState>>,
    Query(query): Query<FoldersListQuery>,
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

    let folder_ids: Option<Vec<String>> = match query.folder_ids {
        Some(ref ids) => match serde_json::from_str(ids) {
            Ok(parsed_ids) => Some(parsed_ids),
            Err(e) => {
                return error_response(
                    StatusCode::BAD_REQUEST,
                    "invalid_folder_ids",
                    "Failed to parse folder_ids query parameter",
                    Some(e.into()),
                )
            }
        },
        None => None,
    };

    match state
        .store
        .list_data_source_folders(
            &project,
            &data_source_id,
            &view_filter,
            &folder_ids,
            limit_offset,
        )
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to list folders",
            Some(e),
        ),
        Ok((folders, total)) => (
            StatusCode::OK,
            Json(APIResponse {
                error: None,
                response: Some(json!({
                    "limit": query.limit,
                    "offset": query.offset,
                    "folders": folders,
                    "total": total,
                })),
            }),
        ),
    }
}

pub async fn folders_delete(
    Path((project_id, data_source_id, folder_id)): Path<(i64, String, String)>,
    State(state): State<Arc<APIState>>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);

    let result = async {
        let folder = match state
            .store
            .load_data_source_folder(&project, &data_source_id, &folder_id)
            .await?
        {
            Some(folder) => folder,
            None => return Ok(()),
        };
        state
            .store
            .delete_data_source_folder(&project, &data_source_id, &folder_id)
            .await?;
        state
            .search_store
            .delete_node(NodeItem::Folder(folder))
            .await?;
        Ok(())
    }
    .await;

    match result {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to delete folder",
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
