use axum::{
    extract::{Path, Query, State},
    response::Json,
};
use hyper::http::StatusCode;
use serde_json::json;
use std::sync::Arc;

use crate::api::api_state::APIState;
use crate::api::data_sources::DataSourcesDocumentsUpdateParentsPayload;
use crate::{
    data_sources::node::ProviderVisibility,
    databases::table::{LocalTable, Row},
    project,
    search_filter::{Filterable, SearchFilter},
    search_stores::search_store::NodeItem,
    stores::store::TableUpsertParams,
    utils::{self, error_response, APIError, APIResponse},
};

#[derive(serde::Deserialize)]
pub struct DatabasesTablesValidateCSVContentPayload {
    bucket: String,
    bucket_csv_path: String,
}

pub async fn tables_validate_csv_content(
    Json(payload): Json<DatabasesTablesValidateCSVContentPayload>,
) -> (StatusCode, Json<APIResponse>) {
    match LocalTable::validate_csv_content(&payload.bucket, &payload.bucket_csv_path).await {
        Ok(schema) => (
            StatusCode::OK,
            Json(APIResponse {
                error: None,
                response: Some(json!({
                    "schema": schema,
                })),
            }),
        ),
        Err(e) => error_response(
            StatusCode::BAD_REQUEST,
            "invalid_csv_content",
            "Failed to validate the CSV content",
            Some(e),
        ),
    }
}

#[derive(serde::Deserialize)]
pub struct DatabasesTablesUpsertPayload {
    table_id: String,
    name: String,
    description: String,
    timestamp: Option<u64>,
    tags: Vec<String>,
    parent_id: Option<String>,
    parents: Vec<String>,
    source_url: Option<String>,
    check_name_uniqueness: Option<bool>,

    // Remote DB specifics
    remote_database_table_id: Option<String>,
    remote_database_secret_id: Option<String>,

    // Node meta:
    title: String,
    mime_type: String,
    provider_visibility: Option<ProviderVisibility>,
}

pub async fn tables_upsert(
    Path((project_id, data_source_id)): Path<(i64, String)>,
    State(state): State<Arc<APIState>>,
    Json(payload): Json<DatabasesTablesUpsertPayload>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);

    if payload.parents.get(0) != Some(&payload.table_id) {
        return error_response(
            StatusCode::BAD_REQUEST,
            "invalid_parents",
            "Failed to upsert table - parents[0] and table_id should be equal",
            None,
        );
    }

    match &payload.parent_id {
        Some(parent_id) => {
            if payload.parents.get(1) != Some(parent_id) {
                return error_response(
                    StatusCode::BAD_REQUEST,
                    "invalid_parent_id",
                    "Failed to upsert table - parents[1] and parent_id should be equal",
                    None,
                );
            }
        }
        None => {
            if payload.parents.len() > 1 {
                return error_response(
                    StatusCode::BAD_REQUEST,
                    "invalid_parent_id",
                    "Failed to upsert table - parent_id should not be null if parents[1] is defined",
                    None,
                );
            }
        }
    }

    if payload.title.trim().is_empty() {
        return error_response(
            StatusCode::BAD_REQUEST,
            "title_is_empty",
            "Failed to upsert table - title is empty",
            None,
        );
    }

    match state
        .store
        .upsert_data_source_table(
            project,
            data_source_id,
            TableUpsertParams {
                table_id: payload.table_id,
                name: payload.name,
                description: payload.description,
                timestamp: payload.timestamp.unwrap_or(utils::now()),
                tags: payload.tags,
                parents: payload.parents,
                source_url: payload.source_url,
                remote_database_table_id: payload.remote_database_table_id,
                remote_database_secret_id: payload.remote_database_secret_id,
                title: payload.title,
                mime_type: payload.mime_type,
                provider_visibility: payload.provider_visibility,
                check_name_uniqueness: payload.check_name_uniqueness,
            },
        )
        .await
    {
        Ok(table) => match state
            .search_store
            .index_node(NodeItem::Table(table.clone()))
            .await
        {
            Ok(_) => (
                StatusCode::OK,
                Json(APIResponse {
                    error: None,
                    response: Some(json!({ "table": table })),
                }),
            ),
            Err(e) => error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_server_error",
                "Failed to index table",
                Some(e),
            ),
        },
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to upsert table",
            Some(e),
        ),
    }
}

/// Retrieve table from a data source.
#[derive(serde::Deserialize)]
pub struct TableRetrieveQuery {
    view_filter: Option<String>, // Parsed as JSON.
}

pub async fn tables_retrieve(
    Path((project_id, data_source_id, table_id)): Path<(i64, String, String)>,
    State(state): State<Arc<APIState>>,
    Query(query): Query<TableRetrieveQuery>,
) -> (StatusCode, Json<APIResponse>) {
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

    let project = project::Project::new_from_id(project_id);

    match state
        .store
        .load_data_source_table(&project, &data_source_id, &table_id)
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to retrieve table",
            Some(e),
        ),
        Ok(table) => match table.filter(|table| table.match_filter(&view_filter)) {
            None => error_response(
                StatusCode::NOT_FOUND,
                "table_not_found",
                &format!("No table found for id `{}`", table_id),
                None,
            ),
            Some(table) => (
                StatusCode::OK,
                Json(APIResponse {
                    error: None,
                    response: Some(json!({
                        "table": table
                    })),
                }),
            ),
        },
    }
}

#[derive(serde::Deserialize)]
pub struct TableListQuery {
    limit: Option<usize>,
    offset: Option<usize>,
    table_ids: Option<String>,   // Parsed as JSON.
    view_filter: Option<String>, // Parsed as JSON.
}

pub async fn tables_list(
    Path((project_id, data_source_id)): Path<(i64, String)>,
    State(state): State<Arc<APIState>>,
    Query(query): Query<TableListQuery>,
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

    let table_ids: Option<Vec<String>> = match query.table_ids {
        Some(ref ids) => match serde_json::from_str(ids) {
            Ok(parsed_ids) => Some(parsed_ids),
            Err(e) => {
                return error_response(
                    StatusCode::BAD_REQUEST,
                    "invalid_table_ids",
                    "Failed to parse table_ids query parameter",
                    Some(e.into()),
                )
            }
        },
        None => None,
    };

    match state
        .store
        .list_data_source_tables(
            &project,
            &data_source_id,
            &view_filter,
            &table_ids,
            limit_offset,
        )
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to list tables",
            Some(e),
        ),
        Ok((tables, total)) => (
            StatusCode::OK,
            Json(APIResponse {
                error: None,
                response: Some(json!({
                    "limit": query.limit,
                    "offset": query.offset,
                    "tables": tables,
                    "total": total,
                })),
            }),
        ),
    }
}

pub async fn tables_delete(
    Path((project_id, data_source_id, table_id)): Path<(i64, String, String)>,
    State(state): State<Arc<APIState>>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);

    match state
        .store
        .load_data_source_table(&project, &data_source_id, &table_id)
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to load table",
            Some(e),
        ),
        Ok(None) => (
            StatusCode::OK,
            Json(APIResponse {
                error: None,
                response: Some(json!({
                    "success": true,
                })),
            }),
        ),
        Ok(Some(table)) => {
            match table
                .delete(
                    state.store.clone(),
                    state.databases_store.clone(),
                    Some(state.search_store.clone()),
                )
                .await
            {
                Err(e) => error_response(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal_server_error",
                    "Failed to delete table",
                    Some(e),
                ),
                Ok(_) => (
                    StatusCode::OK,
                    Json(APIResponse {
                        error: None,
                        response: Some(json!({
                            "success": true,
                        })),
                    }),
                ),
            }
        }
    }
}

pub async fn tables_retrieve_blob(
    Path((project_id, data_source_id, table_id)): Path<(i64, String, String)>,
    State(state): State<Arc<APIState>>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);

    match state
        .store
        .load_data_source_table(&project, &data_source_id, &table_id)
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to load table",
            Some(e),
        ),
        Ok(None) => error_response(
            StatusCode::NOT_FOUND,
            "table_not_found",
            &format!("No table found for id `{}`", table_id),
            None,
        ),
        Ok(Some(table)) => match table.retrieve_api_blob(state.databases_store.clone()).await {
            Err(e) => error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_server_error",
                "Failed to retrieve document blob",
                Some(e),
            ),
            Ok(blob) => {
                let blob_value = serde_json::to_value(blob).unwrap();
                (
                    StatusCode::OK,
                    Json(APIResponse {
                        error: None,
                        response: Some(blob_value),
                    }),
                )
            }
        },
    }
}

pub async fn tables_update_parents(
    Path((project_id, data_source_id, table_id)): Path<(i64, String, String)>,
    State(state): State<Arc<APIState>>,
    Json(payload): Json<DataSourcesDocumentsUpdateParentsPayload>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);

    if payload.parents.get(0) != Some(&table_id) {
        return error_response(
            StatusCode::BAD_REQUEST,
            "invalid_parents",
            "Failed to update table parents - parents[0] and table_id should be equal",
            None,
        );
    }

    match &payload.parent_id {
        Some(parent_id) => {
            if payload.parents.get(1) != Some(parent_id) {
                return error_response(
                    StatusCode::BAD_REQUEST,
                    "invalid_parent_id",
                    "Failed to update table parents - parents[1] and parent_id should be equal",
                    None,
                );
            }
        }
        None => {
            if payload.parents.len() > 1 {
                return error_response(
                    StatusCode::BAD_REQUEST,
                    "invalid_parent_id",
                    "Failed to update table parents - parent_id should not be null if parents[1] is defined",
                    None,
                );
            }
        }
    }

    match state
        .store
        .load_data_source_table(&project, &data_source_id, &table_id)
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to load table",
            Some(e),
        ),
        Ok(None) => error_response(
            StatusCode::NOT_FOUND,
            "table_not_found",
            &format!("No table found for id `{}`", table_id),
            None,
        ),
        Ok(Some(table)) => match table
            .update_parents(
                state.store.clone(),
                state.search_store.clone(),
                payload.parents.clone(),
            )
            .await
        {
            Err(e) => error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_server_error",
                "Failed to update table parents",
                Some(e),
            ),
            Ok(_) => (
                StatusCode::OK,
                Json(APIResponse {
                    error: None,
                    response: Some(json!({
                        "success": true,
                    })),
                }),
            ),
        },
    }
}

#[derive(serde::Deserialize)]
pub struct DatabasesTablesUpsertCSVContentPayload {
    bucket: String,
    bucket_csv_path: String,
    truncate: Option<bool>,
}

pub async fn tables_csv_upsert(
    Path((project_id, data_source_id, table_id)): Path<(i64, String, String)>,
    State(state): State<Arc<APIState>>,
    Json(payload): Json<DatabasesTablesUpsertCSVContentPayload>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);

    match state
        .store
        .load_data_source_table(&project, &data_source_id, &table_id)
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to load table",
            Some(e),
        ),
        Ok(None) => error_response(
            StatusCode::NOT_FOUND,
            "table_not_found",
            &format!("No table found for id `{}`", table_id),
            None,
        ),
        Ok(Some(table)) => match LocalTable::from_table(table) {
            Err(e) => error_response(
                StatusCode::BAD_REQUEST,
                "invalid_table",
                "Table is not local",
                Some(e),
            ),
            Ok(table) => {
                match table
                    .upsert_csv_content(
                        state.store.clone(),
                        state.databases_store.clone(),
                        &payload.bucket,
                        &payload.bucket_csv_path,
                        payload.truncate.unwrap_or_else(|| false),
                    )
                    .await
                {
                    Err(e) => error_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "internal_server_error",
                        "Failed to upsert rows",
                        Some(e),
                    ),
                    Ok(_) => (
                        StatusCode::OK,
                        Json(APIResponse {
                            error: None,
                            response: Some(json!({
                                "success": true,
                            })),
                        }),
                    ),
                }
            }
        },
    }
}

#[derive(serde::Deserialize)]
pub struct TablesRowsUpsertPayload {
    rows: Vec<Row>,
    truncate: Option<bool>,
}

pub async fn tables_rows_upsert(
    Path((project_id, data_source_id, table_id)): Path<(i64, String, String)>,
    State(state): State<Arc<APIState>>,
    Json(payload): Json<TablesRowsUpsertPayload>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);

    match state
        .store
        .load_data_source_table(&project, &data_source_id, &table_id)
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to load table",
            Some(e),
        ),
        Ok(None) => error_response(
            StatusCode::NOT_FOUND,
            "table_not_found",
            &format!("No table found for id `{}`", table_id),
            None,
        ),
        Ok(Some(table)) => match LocalTable::from_table(table) {
            Err(e) => error_response(
                StatusCode::BAD_REQUEST,
                "invalid_table",
                "Table is not local",
                Some(e),
            ),
            Ok(table) => {
                match table
                    .upsert_rows(
                        state.store.clone(),
                        state.databases_store.clone(),
                        payload.rows,
                        payload.truncate.unwrap_or_else(|| false),
                    )
                    .await
                {
                    Err(e) => error_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "internal_server_error",
                        "Failed to upsert rows",
                        Some(e),
                    ),
                    Ok(_) => (
                        StatusCode::OK,
                        Json(APIResponse {
                            error: None,
                            response: Some(json!({
                                "success": true,
                            })),
                        }),
                    ),
                }
            }
        },
    }
}

pub async fn tables_rows_retrieve(
    Path((project_id, data_source_id, table_id, row_id)): Path<(i64, String, String, String)>,
    State(state): State<Arc<APIState>>,
    Query(query): Query<TableRetrieveQuery>,
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

    match state
        .store
        .load_data_source_table(&project, &data_source_id, &table_id)
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to load table",
            Some(e),
        ),
        Ok(table) => match table.filter(|table| table.match_filter(&view_filter)) {
            None => error_response(
                StatusCode::NOT_FOUND,
                "table_not_found",
                &format!("No table found for id `{}`", table_id),
                None,
            ),
            Some(table) => match LocalTable::from_table(table) {
                Err(e) => error_response(
                    StatusCode::BAD_REQUEST,
                    "invalid_table",
                    "Table is not local",
                    Some(e),
                ),
                Ok(table) => {
                    match table
                        .retrieve_row(state.databases_store.clone(), &row_id)
                        .await
                    {
                        Err(e) => error_response(
                            StatusCode::INTERNAL_SERVER_ERROR,
                            "internal_server_error",
                            "Failed to load row",
                            Some(e),
                        ),
                        Ok(None) => error_response(
                            StatusCode::NOT_FOUND,
                            "table_row_not_found",
                            &format!("No table row found for id `{}`", row_id),
                            None,
                        ),
                        Ok(Some(row)) => (
                            StatusCode::OK,
                            Json(APIResponse {
                                error: None,
                                response: Some(json!({
                                    "row": row,
                                })),
                            }),
                        ),
                    }
                }
            },
        },
    }
}

pub async fn tables_rows_delete(
    Path((project_id, data_source_id, table_id, row_id)): Path<(i64, String, String, String)>,
    State(state): State<Arc<APIState>>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);

    match state
        .store
        .load_data_source_table(&project, &data_source_id, &table_id)
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to load table",
            Some(e),
        ),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(APIResponse {
                error: Some(APIError {
                    code: "table_not_found".to_string(),
                    message: format!("No table found for id `{}`", table_id),
                }),
                response: None,
            }),
        ),
        Ok(Some(table)) => match LocalTable::from_table(table) {
            Err(e) => error_response(
                StatusCode::BAD_REQUEST,
                "invalid_table",
                "Table is not local",
                Some(e),
            ),
            Ok(table) => {
                match table
                    .delete_row(state.databases_store.clone(), &row_id)
                    .await
                {
                    Err(e) => error_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "internal_server_error",
                        "Failed to delete row",
                        Some(e),
                    ),
                    Ok(_) => (
                        StatusCode::OK,
                        Json(APIResponse {
                            error: None,
                            response: Some(json!({
                                "success": true,
                            })),
                        }),
                    ),
                }
            }
        },
    }
}

#[derive(serde::Deserialize)]
pub struct DatabasesRowsListQuery {
    offset: usize,
    limit: usize,
    view_filter: Option<String>,
}

pub async fn tables_rows_list(
    Path((project_id, data_source_id, table_id)): Path<(i64, String, String)>,
    State(state): State<Arc<APIState>>,
    Query(query): Query<DatabasesRowsListQuery>,
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

    match state
        .store
        .load_data_source_table(&project, &data_source_id, &table_id)
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to load table",
            Some(e),
        ),
        Ok(table) => match table.filter(|table| table.match_filter(&view_filter)) {
            None => error_response(
                StatusCode::NOT_FOUND,
                "table_not_found",
                &format!("No table found for id `{}`", table_id),
                None,
            ),
            Some(table) => match LocalTable::from_table(table) {
                Err(e) => error_response(
                    StatusCode::BAD_REQUEST,
                    "invalid_table",
                    "Table is not local",
                    Some(e),
                ),
                Ok(table) => match table
                    .list_rows(
                        state.databases_store.clone(),
                        Some((query.limit, query.offset)),
                    )
                    .await
                {
                    Err(e) => error_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "internal_server_error",
                        "Failed to list rows",
                        Some(e),
                    ),
                    Ok((rows, total)) => (
                        StatusCode::OK,
                        Json(APIResponse {
                            error: None,
                            response: Some(json!({
                                "offset": query.offset,
                                "limit": query.limit,
                                "total": total,
                                "rows": rows,
                            })),
                        }),
                    ),
                },
            },
        },
    }
}
