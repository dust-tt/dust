use anyhow::anyhow;
use axum::{
    extract::{DefaultBodyLimit, Path, Query, State},
    middleware::from_fn,
    response::{
        sse::{KeepAlive, Sse},
        Json,
    },
    routing::{delete, get, patch, post},
    Router,
};
use axum_tracing_opentelemetry::middleware::{OtelAxumLayer, OtelInResponseLayer};
use futures::future::try_join_all;
use hyper::http::StatusCode;
use regex::Regex;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::convert::Infallible;
use std::sync::Arc;
use tikv_jemallocator::Jemalloc;
use tokio::{
    net::TcpListener,
    signal::unix::{signal, SignalKind},
    sync::mpsc::unbounded_channel,
};
use tokio_stream::Stream;
use tracing::{error, info};

use dust::api::api_state::APIState;
use dust::api::data_sources::DataSourcesDocumentsUpdateParentsPayload;

use dust::api::{data_sources, databases, datasets, projects, runs, specifications, tables};
use dust::{
    api_keys::validate_api_key,
    app,
    blocks::block::BlockType,
    data_sources::{
        data_source::{self, Section},
        node::ProviderVisibility,
        qdrant::QdrantClients,
    },
    databases::{
        database::{execute_query, get_tables_schema, QueryDatabaseError},
        table::{LocalTable, Row, Table},
        table_upserts_background_worker::TableUpsertsBackgroundWorker,
    },
    databases_store::{self, gcs::GoogleCloudStorageDatabasesStore},
    dataset,
    deno::js_executor::JSExecutor,
    open_telemetry::init_subscribers,
    project,
    providers::provider::{provider, ProviderID},
    run,
    search_filter::{Filterable, SearchFilter},
    search_stores::search_store::{
        DatasourceViewFilter, ElasticsearchSearchStore, NodeItem, NodesSearchFilter,
        NodesSearchOptions, SearchStore, TagsQueryType,
    },
    sqlite_workers::client::HEARTBEAT_INTERVAL_MS,
    stores::{
        postgres,
        store::{self, FolderUpsertParams, TableUpsertParams},
    },
    utils::{self, error_response, APIError, APIResponse},
};

#[global_allocator]
static GLOBAL: Jemalloc = Jemalloc;

/// Index

async fn index() -> &'static str {
    "dust_api server ready"
}

#[derive(serde::Deserialize)]
struct FoldersUpsertPayload {
    folder_id: String,
    timestamp: Option<u64>,
    parent_id: Option<String>,
    parents: Vec<String>,
    title: String,
    mime_type: String,
    source_url: Option<String>,
    provider_visibility: Option<ProviderVisibility>,
}

async fn folders_upsert(
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

async fn folders_retrieve(
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
struct FoldersListQuery {
    limit: Option<usize>,
    offset: Option<usize>,
    folder_ids: Option<String>,  // Parsed as JSON.
    view_filter: Option<String>, // Parsed as JSON.
}

async fn folders_list(
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

async fn folders_delete(
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

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct NodesSearchPayload {
    query: Option<String>,
    filter: NodesSearchFilter,
    options: Option<NodesSearchOptions>,
}

async fn nodes_search(
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

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct DataSourceAndProject {
    data_source_id: String,
    project_id: i64,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct StatsPayload {
    query: Vec<DataSourceAndProject>,
}

async fn data_sources_stats(
    State(state): State<Arc<APIState>>,
    Json(payload): Json<StatsPayload>,
) -> (StatusCode, Json<APIResponse>) {
    // Validate payload data sources
    if payload.query.is_empty() {
        return error_response(
            StatusCode::BAD_REQUEST,
            "invalid_parameter",
            "query array cannot be empty",
            None,
        );
    }

    // Convert payload data to project_data_sources format
    let project_data_sources: Vec<(i64, String)> = payload
        .query
        .into_iter()
        .map(|item| (item.project_id, item.data_source_id))
        .collect();

    match state
        .store
        .load_data_sources(project_data_sources.clone())
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to retrieve data sources",
            Some(e),
        ),
        Ok(data_sources) if data_sources.is_empty() => error_response(
            StatusCode::NOT_FOUND,
            "data_sources_not_found",
            "No data sources found",
            None,
        ),
        Ok(data_sources) => {
            let ds_ids: Vec<String> = data_sources
                .iter()
                .map(|ds| ds.data_source_id().to_string())
                .collect();

            match state.search_store.get_data_source_stats(ds_ids).await {
                Ok((stats, overall_total_size)) => (
                    StatusCode::OK,
                    Json(APIResponse {
                        error: None,
                        response: Some(json!({
                            "data_sources": stats,
                            "overall_total_size": overall_total_size,
                        })),
                    }),
                ),
                Err(e) => error_response(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal_server_error",
                    "Failed to get stats relative to data sources",
                    Some(e),
                ),
            }
        }
    }
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct TagsSearchPayload {
    query: Option<String>,
    query_type: Option<TagsQueryType>,
    data_source_views: Vec<DatasourceViewFilter>,
    node_ids: Option<Vec<String>>,
    limit: Option<u64>,
}

async fn tags_search(
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

// SQLite Workers

#[derive(serde::Deserialize)]
struct SQLiteWorkersUpsertOrDeletePayload {
    url: String,
}

async fn sqlite_workers_heartbeat(
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

async fn sqlite_workers_delete(
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

// Misc

#[derive(serde::Deserialize)]
struct TokenizePayload {
    text: String,
    provider_id: ProviderID,
    model_id: String,
    credentials: Option<run::Credentials>,
}

async fn tokenize(Json(payload): Json<TokenizePayload>) -> (StatusCode, Json<APIResponse>) {
    let mut llm = provider(payload.provider_id).llm(payload.model_id);

    // If we received credentials we initialize the llm with them.
    match payload.credentials {
        Some(c) => {
            match llm.initialize(c.clone()).await {
                Err(e) => {
                    return error_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "internal_server_error",
                        "Failed to initialize LLM",
                        Some(e),
                    );
                }
                Ok(()) => (),
            };
        }
        None => (),
    }

    match llm.tokenize(vec![payload.text]).await {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to tokenize text",
            Some(e),
        ),
        Ok(mut res) => match res.pop() {
            None => error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_server_error",
                "Failed to tokenize text",
                None,
            ),
            Some(tokens) => (
                StatusCode::OK,
                Json(APIResponse {
                    error: None,
                    response: Some(json!({
                        "tokens": tokens,
                    })),
                }),
            ),
        },
    }
}

#[derive(serde::Deserialize)]
struct TokenizeBatchPayload {
    texts: Vec<String>,
    provider_id: ProviderID,
    model_id: String,
    credentials: Option<run::Credentials>,
}

async fn tokenize_batch(
    Json(payload): Json<TokenizeBatchPayload>,
) -> (StatusCode, Json<APIResponse>) {
    let mut llm = provider(payload.provider_id).llm(payload.model_id);

    // If we received credentials we initialize the llm with them.
    match payload.credentials {
        Some(c) => {
            match llm.initialize(c.clone()).await {
                Err(e) => {
                    return error_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "internal_server_error",
                        "Failed to initialize LLM",
                        Some(e),
                    );
                }
                Ok(()) => (),
            };
        }
        None => (),
    }

    match llm.tokenize(payload.texts).await {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to tokenize text",
            Some(e),
        ),
        Ok(res) => (
            StatusCode::OK,
            Json(APIResponse {
                error: None,
                response: Some(json!({
                    "tokens": res,
                })),
            }),
        ),
    }
}

fn main() {
    JSExecutor::init();

    let rt = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(32)
        .enable_all()
        .build()
        .unwrap();

    let r = rt.block_on(async {
        // Start the background worker for table upserts
        tokio::task::spawn(async move {
            TableUpsertsBackgroundWorker::start_loop().await;
        });

        let _guard = init_subscribers()?;

        let store: Box<dyn store::Store + Sync + Send> = match std::env::var("CORE_DATABASE_URI") {
            Ok(db_uri) => {
                let store = postgres::PostgresStore::new(&db_uri).await?;
                Box::new(store)
            }
            Err(_) => Err(anyhow!("CORE_DATABASE_URI is required (postgres)"))?,
        };

        let databases_store: Box<dyn databases_store::store::DatabasesStore + Sync + Send> = {
            let store = GoogleCloudStorageDatabasesStore::new();
            Box::new(store)
        };

        let url = std::env::var("ELASTICSEARCH_URL").expect("ELASTICSEARCH_URL must be set");
        let username =
            std::env::var("ELASTICSEARCH_USERNAME").expect("ELASTICSEARCH_USERNAME must be set");
        let password =
            std::env::var("ELASTICSEARCH_PASSWORD").expect("ELASTICSEARCH_PASSWORD must be set");

        let search_store : Box<dyn SearchStore + Sync + Send> = Box::new(ElasticsearchSearchStore::new(&url, &username, &password).await?);

        let state = Arc::new(APIState::new(
            store,
            databases_store,
            QdrantClients::build().await?,
            search_store,
        ));

        let router = Router::new()
        // Projects
        .route("/projects", post(projects::projects_create))
        .route("/projects/{project_id}", delete(projects::projects_delete))
        .route("/projects/{project_id}/clone", post(projects::projects_clone))
        // Specifications
        .route(
            "/projects/{project_id}/specifications/check",
            post(specifications::specifications_check),
        )
        .route(
            "/projects/{project_id}/specifications/{hash}",
            get(specifications::specifications_retrieve),
        )
        .route(
            "/projects/{project_id}/specifications",
            get(specifications::specifications_get),
        )
        .route(
            "/projects/{project_id}/specifications",
            post(specifications::specifications_post),
        )

        // Datasets
        .route("/projects/{project_id}/datasets", post(datasets::datasets_register))
        .route("/projects/{project_id}/datasets", get(datasets::datasets_list))
        .route(
            "/projects/{project_id}/datasets/{dataset_id}/{hash}",
            get(datasets::datasets_retrieve),
        )
        // Runs
        .route("/projects/{project_id}/runs", post(runs::runs_create))
        .route(
            "/projects/{project_id}/runs/stream",
            post(runs::runs_create_stream),
        )
        .route("/projects/{project_id}/runs", get(runs::runs_list))
        .route(
            "/projects/{project_id}/runs/batch",
            post(runs::runs_retrieve_batch),
        )
        .route("/projects/{project_id}/runs/{run_id}", get(runs::runs_retrieve))
        .route(
            "/projects/{project_id}/runs/{run_id}",
            delete(runs::runs_delete),
        )
        .route(
            "/projects/{project_id}/runs/{run_id}/cancel",
            post(runs::runs_cancel),
        )
        .route(
            "/projects/{project_id}/runs/{run_id}/blocks/{block_type}/{block_name}",
            get(runs::runs_retrieve_block),
        )
        .route(
            "/projects/{project_id}/runs/{run_id}/status",
            get(runs::runs_retrieve_status),
        )
        // DataSources
        .route(
            "/projects/{project_id}/data_sources",
            post(data_sources::data_sources_register),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}",
            patch(data_sources::data_sources_update),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}",
            get(data_sources::data_sources_retrieve),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/tokenize",
            post(data_sources::data_sources_tokenize),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/documents/{document_id}/versions",
            get(data_sources::data_sources_documents_versions_list),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/documents",
            post(data_sources::data_sources_documents_upsert),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/documents/{document_id}/blob",
            get(data_sources::data_sources_documents_retrieve_blob),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/documents/{document_id}/tags",
            patch(data_sources::data_sources_documents_update_tags),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/documents/{document_id}/parents",
            patch(data_sources::data_sources_documents_update_parents),
        )
        // Provided by the data_source block.
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/search",
            post(data_sources::data_sources_search),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/documents",
            get(data_sources::data_sources_documents_list),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/documents/{document_id}",
            get(data_sources::data_sources_documents_retrieve),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/documents/{document_id}/text",
            get(data_sources::data_sources_documents_retrieve_text),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/documents/{document_id}",
            delete(data_sources::data_sources_documents_delete),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/documents/{document_id}/scrub_deleted_versions",
            post(data_sources::data_sources_documents_scrub_deleted_versions),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}",
            delete(data_sources::data_sources_delete),
        )
        // Databases
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/tables/validate_csv_content",
            post(tables::tables_validate_csv_content),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/tables",
            post(tables::tables_upsert),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/tables/{table_id}/parents",
            patch(tables::tables_update_parents),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/tables/{table_id}",
            get(tables::tables_retrieve),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/tables",
            get(tables::tables_list),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/tables/{table_id}",
            delete(tables::tables_delete),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/tables/{table_id}/blob",
            get(tables::tables_retrieve_blob),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/tables/{table_id}/rows",
            post(tables::tables_rows_upsert),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/tables/{table_id}/csv",
            post(tables::tables_csv_upsert),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/tables/{table_id}/rows/{row_id}",
            get(tables::tables_rows_retrieve),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/tables/{table_id}/rows/{row_id}",
            delete(tables::tables_rows_delete),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/tables/{table_id}/rows",
            get(tables::tables_rows_list),
        )
        .route(
            "/query_database",
            post(databases::databases_query_run),
        )
        .route(
            "/database_schema",
            post(databases::databases_schema_retrieve),
        )
        .route("/sqlite_workers", delete(sqlite_workers_delete))

        // Folders
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/folders",
            post(folders_upsert),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/folders/{folder_id}",
            get(folders_retrieve),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/folders",
            get(folders_list),
        )
        .route(
            "/projects/{project_id}/data_sources/{data_source_id}/folders/{folder_id}",
            delete(folders_delete),
        )

        //Search
        .route("/nodes/search", post(nodes_search))
        .route("/stats", post(data_sources_stats))
        .route("/tags/search", post(tags_search))

        // Misc
        .route("/tokenize", post(tokenize))
        .route("/tokenize/batch", post(tokenize_batch))
        .layer(OtelInResponseLayer::default())
        // Start OpenTelemetry trace on incoming request.
        .layer(OtelAxumLayer::default())
        // Extensions
        .layer(DefaultBodyLimit::disable())
        .layer(from_fn(validate_api_key))
        .with_state(state.clone());

        let sqlite_heartbeat_router = Router::new()
            .route("/sqlite_workers", post(sqlite_workers_heartbeat))
            .layer(from_fn(validate_api_key))
            .with_state(state.clone());

        let health_check_router = Router::new().route("/", get(index));

        let app = Router::new()
            .merge(router)
            .merge(sqlite_heartbeat_router)
            .merge(health_check_router);

        // Start the APIState run loop.
        let runloop_state = state.clone();
        tokio::task::spawn(async move { runloop_state.run_loop().await });

        let (tx1, rx1) = tokio::sync::oneshot::channel::<()>();
        let (tx2, rx2) = tokio::sync::oneshot::channel::<()>();

        let srv = axum::serve(
            TcpListener::bind::<std::net::SocketAddr>("[::]:3001".parse().unwrap()).await?,
            app.into_make_service(),
        )
        .with_graceful_shutdown(async {
            rx1.await.ok();
        });

        tokio::spawn(async move {
            if let Err(e) = srv.await {
                error!(error = %e, "Server error");
            }
            info!("[GRACEFUL] Server stopped");
            tx2.send(()).ok();
        });

        info!(pid = std::process::id() as u64, "dust_api server started");

        let mut stream = signal(SignalKind::terminate()).unwrap();
        stream.recv().await;

        // Gracefully shut down the server
        info!("[GRACEFUL] SIGTERM received, stopping server...");
        tx1.send(()).ok();

        // Wait for the server to shutdown
        info!("[GRACEFUL] Awaiting server shutdown...");
        rx2.await.ok();

        // Wait for the run loop to finish.
        info!("[GRACEFUL] Awaiting stop loop...");
        state.stop_loop().await;

        info!("[GRACEFUL] Exiting");

        // sleep for 1 second to allow the logger to flush
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;

        Ok::<(), anyhow::Error>(())
    });

    match r {
        Ok(_) => (),
        Err(e) => {
            error!(error = %e, "dust_api server error");
            std::process::exit(1);
        }
    }
}
