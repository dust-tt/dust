use axum::{extract::State, response::Json};
use futures::future::try_join_all;
use hyper::http::StatusCode;
use serde_json::json;
use std::sync::Arc;

use crate::api::api_state::APIState;
use crate::{
    databases::database::{execute_query, get_tables_schema, QueryDatabaseError},
    project,
    utils::{error_response, APIResponse},
};

#[derive(serde::Deserialize)]
pub struct DatabasesSchemaPayload {
    tables: Vec<(i64, String, String)>,
}

fn collect_existing_tables<T>(tables: Vec<Option<T>>) -> Vec<T> {
    tables.into_iter().flatten().collect()
}

pub async fn databases_schema_retrieve(
    State(state): State<Arc<APIState>>,
    Json(payload): Json<DatabasesSchemaPayload>,
) -> (StatusCode, Json<APIResponse>) {
    match try_join_all(
        payload
            .tables
            .iter()
            .map(|(project_id, data_source_id, table_id)| {
                let project = project::Project::new_from_id(*project_id);
                let store = state.store.clone();
                async move {
                    store
                        .load_data_source_table(&project, data_source_id, table_id)
                        .await
                }
            }),
    )
    .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to retrieve tables",
            Some(e),
        ),
        Ok(tables) => {
            let tables = collect_existing_tables(tables);

            if tables.is_empty() {
                error_response(
                    StatusCode::NOT_FOUND,
                    "table_not_found",
                    "No table found",
                    None,
                )
            } else {
                match get_tables_schema(tables, state.store.clone(), state.databases_store.clone())
                    .await
                {
                    Err(e) => error_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "schema_retrieval_failed",
                        "Failed to retrieve table schemas",
                        Some(e),
                    ),
                    Ok((dialect, schemas)) => (
                        StatusCode::OK,
                        Json(APIResponse {
                            error: None,
                            response: Some(json!({
                                "dialect": dialect,
                                "schemas": schemas.iter().map(|s| {
                                    json!({
                                        "table_schema": s.schema,
                                        "dbml": s.dbml,
                                        "head": s.head,
                                    })
                                }).collect::<Vec<_>>(),
                            })),
                        }),
                    ),
                }
            }
        }
    }
}

#[derive(serde::Deserialize)]
pub struct DatabaseQueryRunPayload {
    query: String,
    tables: Vec<(i64, String, String)>,
}

pub async fn databases_query_run(
    State(state): State<Arc<APIState>>,
    Json(payload): Json<DatabaseQueryRunPayload>,
) -> (StatusCode, Json<APIResponse>) {
    match try_join_all(
        payload
            .tables
            .into_iter()
            .map(|(project_id, data_source_id, table_id)| {
                let project = project::Project::new_from_id(project_id);
                let store = state.store.clone();
                async move {
                    store
                        .load_data_source_table(&project, &data_source_id, &table_id)
                        .await
                }
            }),
    )
    .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to retrieve tables",
            Some(e),
        ),
        Ok(tables) => {
            let tables = collect_existing_tables(tables);

            if tables.is_empty() {
                error_response(
                    StatusCode::NOT_FOUND,
                    "table_not_found",
                    "No table found",
                    None,
                )
            } else {
                match execute_query(
                    tables,
                    &payload.query,
                    state.store.clone(),
                    state.databases_store.clone(),
                )
                .await
                {
                    Err(QueryDatabaseError::TooManyResultRows) => error_response(
                        StatusCode::BAD_REQUEST,
                        "too_many_result_rows",
                        "The query returned too many rows",
                        None,
                    ),
                    Err(QueryDatabaseError::ExecutionError(s, _)) => {
                        error_response(StatusCode::BAD_REQUEST, "query_execution_error", &s, None)
                    }
                    Err(e) => error_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "internal_server_error",
                        "Failed to run query",
                        Some(e.into()),
                    ),
                    Ok((results, schema, query)) => (
                        StatusCode::OK,
                        Json(APIResponse {
                            error: None,
                            response: Some(json!({
                                "schema": schema,
                                "results": results,
                                "query": query,
                            })),
                        }),
                    ),
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::collect_existing_tables;

    #[test]
    fn collect_existing_tables_filters_out_missing_tables() {
        let tables = vec![Some(1), None, Some(3)];
        assert_eq!(collect_existing_tables(tables), vec![1, 3]);
    }

    #[test]
    fn collect_existing_tables_returns_empty_when_all_missing() {
        let tables = vec![None::<i32>, None];
        assert!(collect_existing_tables(tables).is_empty());
    }
}
