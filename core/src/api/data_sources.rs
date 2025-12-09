use axum::{
    extract::{Path, Query, State},
    response::Json,
};
use futures::stream::{iter, StreamExt};
use hyper::http::StatusCode;
use regex::Regex;
use serde_json::json;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tracing::{error, info};

use crate::{
    api::api_state::APIState,
    data_sources::data_source::{Chunk, DataSource, Document},
    providers::embedder::EmbedderRequest,
};
use crate::{
    data_sources::{
        data_source::{self, Section},
        node::ProviderVisibility,
    },
    project,
    providers::provider::provider,
    run,
    search_filter::SearchFilter,
    utils::{self, error_response, APIResponse},
};

struct ChunkWithDocument {
    document_id: String,
    timestamp: u64,
    chunk: Chunk,
}

/// Apply global top-k sorting to documents from multiple data sources.
/// Works at the chunk level: takes top K chunks across all documents, then reassembles documents.
fn apply_global_top_k(
    query: &str,
    top_k: usize,
    results: &[DataSourceSearchResultItem],
) -> Vec<Document> {
    let mut all_chunks: Vec<ChunkWithDocument> = Vec::new();

    // Extract all chunks with their document metadata.
    for result in results {
        if result.error.is_none() {
            for document in &result.documents {
                for chunk in &document.chunks {
                    all_chunks.push(ChunkWithDocument {
                        document_id: document.document_id.clone(),
                        timestamp: document.timestamp,
                        chunk: chunk.clone(),
                    });
                }
            }
        }
    }

    // Sort chunks by score or timestamp (if no query) and truncate.
    if !query.is_empty() {
        all_chunks.sort_by(|a, b| {
            let score_a = a.chunk.score.unwrap_or(0.0);
            let score_b = b.chunk.score.unwrap_or(0.0);
            score_b
                .partial_cmp(&score_a)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
    } else {
        all_chunks.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    }
    all_chunks.truncate(top_k);

    // Create document_id -> chunks mapping from top_k chunks.
    let mut doc_chunks: HashMap<String, Vec<Chunk>> = HashMap::new();
    for chunk_with_doc in all_chunks {
        doc_chunks
            .entry(chunk_with_doc.document_id)
            .or_insert_with(Vec::new)
            .push(chunk_with_doc.chunk);
    }

    // Build final documents using references and the chunk mapping.
    let relevant_docs: Vec<&Document> = results
        .iter()
        .filter(|result| result.error.is_none())
        .flat_map(|result| &result.documents)
        .filter(|doc| doc_chunks.contains_key(&doc.document_id))
        .collect();

    let mut result: Vec<Document> = relevant_docs
        .into_iter()
        .map(|doc| {
            let chunks = doc_chunks.remove(&doc.document_id).unwrap_or_default();
            let chunk_count = chunks.len();

            Document {
                data_source_id: doc.data_source_id.clone(),
                data_source_internal_id: doc.data_source_internal_id.clone(),
                created: doc.created,
                document_id: doc.document_id.clone(),
                timestamp: doc.timestamp,
                title: doc.title.clone(),
                mime_type: doc.mime_type.clone(),
                provider_visibility: doc.provider_visibility.clone(),
                tags: doc.tags.clone(),
                parent_id: doc.parent_id.clone(),
                parents: doc.parents.clone(),
                source_url: doc.source_url.clone(),
                hash: doc.hash.clone(),
                text_size: doc.text_size,
                chunk_count,
                chunks,
                text: doc.text.clone(),
                token_count: doc.token_count,
            }
        })
        .collect();

    // Sort by top chunk score or timestamp.
    if !query.is_empty() {
        result.sort_by(|a, b| {
            let score_a = a.chunks.first().and_then(|c| c.score).unwrap_or(0.0);
            let score_b = b.chunks.first().and_then(|c| c.score).unwrap_or(0.0);
            score_b
                .partial_cmp(&score_a)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
    } else {
        result.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    }
    result.truncate(top_k);

    result
}

/// Register a new data source.

#[derive(serde::Deserialize)]
pub struct DataSourcesRegisterPayload {
    config: data_source::DataSourceConfig,
    #[allow(dead_code)]
    credentials: run::Credentials,
    name: String,
}

pub async fn data_sources_register(
    Path(project_id): Path<i64>,
    State(state): State<Arc<APIState>>,
    Json(payload): Json<DataSourcesRegisterPayload>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);
    let ds = data_source::DataSource::new(&project, &payload.config, &payload.name);

    match ds
        .register(state.store.clone(), state.search_store.clone())
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to register data source",
            Some(e),
        ),
        Ok(()) => (
            StatusCode::OK,
            Json(APIResponse {
                error: None,
                response: Some(json!({
                    "data_source": {
                        "created": ds.created(),
                        "data_source_id": ds.data_source_id(),
                        "name": ds.name(),
                        "config": ds.config(),
                    },
                })),
            }),
        ),
    }
}

/// Update a data source.

#[derive(serde::Deserialize)]
pub struct DataSourcesUpdatePayload {
    name: String,
}

pub async fn data_sources_update(
    Path((project_id, data_source_id)): Path<(i64, String)>,
    State(state): State<Arc<APIState>>,
    Json(payload): Json<DataSourcesUpdatePayload>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);

    let mut ds = match state
        .store
        .load_data_source(&project, &data_source_id)
        .await
    {
        Err(e) => {
            return error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_server_error",
                "Failed to retrieve data source",
                Some(e),
            );
        }
        Ok(None) => {
            return error_response(
                StatusCode::NOT_FOUND,
                "data_source_not_found",
                &format!("No data source found for id `{}`", data_source_id),
                None,
            );
        }
        Ok(Some(ds)) => ds,
    };

    if let Err(e) = ds
        .update_name(
            state.store.clone(),
            state.search_store.clone(),
            &payload.name,
        )
        .await
    {
        return error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to update data source name",
            Some(e),
        );
    }

    (
        StatusCode::OK,
        Json(APIResponse {
            error: None,
            response: Some(json!({
                "data_source": {
                    "created": ds.created(),
                    "data_source_id": ds.data_source_id(),
                    "name": ds.name(),
                    "config": ds.config(),
                },
            })),
        }),
    )
}

#[derive(serde::Deserialize)]
pub struct DataSourcesTokenizePayload {
    text: String,
}
pub async fn data_sources_tokenize(
    Path((project_id, data_source_id)): Path<(i64, String)>,
    State(state): State<Arc<APIState>>,
    Json(payload): Json<DataSourcesTokenizePayload>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);
    match state
        .store
        .load_data_source(&project, &data_source_id)
        .await
    {
        Err(e) => {
            error!(
                error = %e,
                project_id = project_id,
                data_source_id = %data_source_id,
                "Failed to retrieve data source"
            );
            error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_server_error",
                "Failed to retrieve data source",
                Some(e),
            )
        }
        Ok(ds) => match ds {
            None => error_response(
                StatusCode::NOT_FOUND,
                "data_source_not_found",
                &format!("No data source found for id `{}`", data_source_id),
                None,
            ),
            Some(ds) => {
                let embedder_config = ds.embedder_config().clone();
                let provider_id = embedder_config.provider_id;
                let model_id = embedder_config.model_id.clone();
                let embedder =
                    provider(embedder_config.provider_id).embedder(embedder_config.model_id);
                match embedder.tokenize(vec![payload.text]).await {
                    Err(e) => {
                        error!(
                            error = %e,
                            project_id = project_id,
                            data_source_id = %data_source_id,
                            provider_id = %provider_id,
                            model_id = %model_id,
                            "Failed to tokenize text"
                        );
                        error_response(
                            StatusCode::INTERNAL_SERVER_ERROR,
                            "internal_server_error",
                            "Failed to tokenize text",
                            Some(e),
                        )
                    }
                    Ok(mut res) => match res.pop() {
                        None => {
                            error!(
                                project_id = project_id,
                                data_source_id = %data_source_id,
                                "Tokenizer returned empty result"
                            );
                            error_response(
                                StatusCode::INTERNAL_SERVER_ERROR,
                                "internal_server_error",
                                "Failed to tokenize text",
                                None,
                            )
                        }
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
        },
    }
}

pub async fn data_sources_retrieve(
    Path((project_id, data_source_id)): Path<(i64, String)>,
    State(state): State<Arc<APIState>>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);
    match state
        .store
        .load_data_source(&project, &data_source_id)
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to retrieve data source",
            Some(e),
        ),
        Ok(ds) => match ds {
            None => error_response(
                StatusCode::NOT_FOUND,
                "data_source_not_found",
                &format!("No data source found for id `{}`", data_source_id),
                None,
            ),
            Some(ds) => (
                StatusCode::OK,
                Json(APIResponse {
                    error: None,
                    response: Some(json!({
                        "data_source": {
                            "created": ds.created(),
                            "data_source_id": ds.data_source_id(),
                            "data_source_internal_id": ds.internal_id(),
                            "config": ds.config(),
                            "name": ds.name(),
                        },
                    })),
                }),
            ),
        },
    }
}

// Perform a search on a data source.

#[derive(serde::Deserialize)]
pub struct DatasourceSearchPayload {
    query: Option<String>,
    top_k: usize,
    filter: Option<SearchFilter>,
    view_filter: Option<SearchFilter>,
    full_text: bool,
    credentials: run::Credentials,
    target_document_tokens: Option<usize>,
}

pub async fn data_sources_search(
    Path((project_id, data_source_id)): Path<(i64, String)>,
    State(state): State<Arc<APIState>>,
    Json(payload): Json<DatasourceSearchPayload>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);
    match state
        .store
        .load_data_source(&project, &data_source_id)
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to retrieve data source",
            Some(e),
        ),
        Ok(ds) => match ds {
            None => error_response(
                StatusCode::NOT_FOUND,
                "data_source_not_found",
                &format!("No data source found for id `{}`", data_source_id),
                None,
            ),
            Some(ds) => match ds
                .search(
                    payload.credentials,
                    state.store.clone(),
                    state.qdrant_clients.clone(),
                    &payload.query,
                    payload.top_k,
                    match payload.filter {
                        Some(filter) => Some(filter.postprocess_for_data_source(&data_source_id)),
                        None => None,
                    },
                    match payload.view_filter {
                        Some(filter) => Some(filter.postprocess_for_data_source(&data_source_id)),
                        None => None,
                    },
                    payload.full_text,
                    payload.target_document_tokens,
                )
                .await
            {
                Ok(documents) => (
                    StatusCode::OK,
                    Json(APIResponse {
                        error: None,
                        response: Some(json!({
                            "documents": documents,
                        })),
                    }),
                ),
                Err(e) => error_response(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal_server_error",
                    "Failed to perform the search",
                    Some(e),
                ),
            },
        },
    }
}

// Perform a bulk search on several data sources.

#[derive(serde::Deserialize)]
pub struct DataSourceSearchRequest {
    pub project_id: i64,
    pub data_source_id: String,
    pub top_k: usize,
    pub filter: Option<SearchFilter>,
    pub view_filter: Option<SearchFilter>,
    pub target_document_tokens: Option<usize>,
}

#[derive(serde::Deserialize)]
pub struct DataSourcesSearchBulkPayload {
    pub credentials: run::Credentials,
    pub full_text: bool,
    pub query: String,
    pub searches: Vec<DataSourceSearchRequest>,
    pub top_k: usize,
}

#[derive(serde::Serialize)]
pub struct DataSourceSearchResultItem {
    pub data_source_id: String,
    pub documents: Vec<Document>,
    pub error: Option<String>,
    pub project_id: i64,
}

const MAX_BULK_SEARCHES_PER_EMBEDDER: usize = 50;

pub async fn data_sources_search_bulk(
    State(state): State<Arc<APIState>>,
    Json(payload): Json<DataSourcesSearchBulkPayload>,
) -> (StatusCode, Json<APIResponse>) {
    // Load all data sources.
    let project_data_sources: Vec<(i64, String)> = payload
        .searches
        .iter()
        .map(|s| (s.project_id, s.data_source_id.clone()))
        .collect();

    let data_sources = match state.store.load_data_sources(project_data_sources).await {
        Ok(ds) => ds,
        Err(e) => {
            return error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_server_error",
                "Failed to load data sources",
                Some(e),
            );
        }
    };

    // Create a HashMap of data sources by (project_id, data_source_id) for unique pairing.
    let ds_map: HashMap<(i64, String), DataSource> = data_sources
        .into_iter()
        .map(|ds| {
            (
                (ds.project().project_id(), ds.data_source_id().to_string()),
                ds,
            )
        })
        .collect();

    // Group by embedder model_id with correct search_req <-> data_source pairing.
    let mut groups: HashMap<String, Vec<(DataSourceSearchRequest, DataSource)>> = HashMap::new();

    for search_req in payload.searches.into_iter() {
        if let Some(ds) = ds_map.get(&(search_req.project_id, search_req.data_source_id.clone())) {
            let model_id = ds.embedder_config().model_id.clone();
            groups
                .entry(model_id)
                .or_insert_with(Vec::new)
                .push((search_req, ds.clone()));
        } else {
            // Handle missing data source.
            return error_response(
                StatusCode::NOT_FOUND,
                "data_source_not_found",
                &format!(
                    "Data source {} not found after loading",
                    search_req.data_source_id
                ),
                None,
            );
        }
    }

    // Embed and search for each group concurrently.
    let group_futures: Vec<_> = groups
        .into_iter()
        .map(|(model_id, group)| {
            let credentials = payload.credentials.clone();
            let query = payload.query.clone();
            let full_text = payload.full_text;
            let state = state.clone();

            async move {
                // Get embedder from first data source in group.
                let first_ds = &group[0].1;
                let embedder_config = first_ds.embedder_config();

                // Embed query once per group.
                let embedder_request = EmbedderRequest::new(
                    embedder_config.provider_id,
                    &model_id,
                    vec![&query],
                    first_ds.config().extras.clone(),
                );

                // If any embedding fails, return error for this group.
                let query_vector = match embedder_request.execute(credentials).await {
                    Ok(v) => {
                        if v.len() != 1 {
                            return Err(format!(
                                "Expected exactly one embedding vector, got {}",
                                v.len()
                            ));
                        }
                        Some(v[0].vector.iter().map(|v| *v as f32).collect::<Vec<f32>>())
                    }
                    Err(e) => {
                        return Err(format!(
                            "Failed to embed query with model {}: {}",
                            model_id, e
                        ));
                    }
                };

                // Search all data sources in this group with the same vector.
                let search_futures: Vec<_> = group
                    .into_iter()
                    .map(|(search_req, ds)| {
                        let vector = query_vector.clone();
                        let store = state.store.clone();
                        let qdrant_clients = state.qdrant_clients.clone();

                        async move {
                            let filter = match search_req.filter {
                                Some(f) => {
                                    Some(f.postprocess_for_data_source(&search_req.data_source_id))
                                }
                                None => None,
                            };

                            let view_filter = match search_req.view_filter {
                                Some(f) => {
                                    Some(f.postprocess_for_data_source(&search_req.data_source_id))
                                }
                                None => None,
                            };

                            match ds
                                .search_with_vector(
                                    store,
                                    qdrant_clients,
                                    vector,
                                    search_req.top_k,
                                    filter,
                                    view_filter,
                                    full_text,
                                    search_req.target_document_tokens,
                                )
                                .await
                            {
                                Ok(documents) => DataSourceSearchResultItem {
                                    project_id: search_req.project_id,
                                    data_source_id: search_req.data_source_id.clone(),
                                    documents,
                                    error: None,
                                },
                                Err(e) => DataSourceSearchResultItem {
                                    project_id: search_req.project_id,
                                    data_source_id: search_req.data_source_id.clone(),
                                    documents: vec![],
                                    error: Some(format!("{}", e)),
                                },
                            }
                        }
                    })
                    .collect();

                // Limit concurrency to avoid overwhelming Qdrant.
                let results: Vec<_> = iter(search_futures)
                    .buffer_unordered(MAX_BULK_SEARCHES_PER_EMBEDDER)
                    .collect()
                    .await;
                Ok(results)
            }
        })
        .collect();

    // Execute all group operations concurrently.
    let group_results = futures::future::join_all(group_futures).await;

    // Handle results and errors.
    let mut all_results: Vec<DataSourceSearchResultItem> = Vec::new();
    for group_result in group_results {
        match group_result {
            Ok(results) => all_results.extend(results),
            Err(e) => {
                return error_response(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "embedding_error",
                    &e,
                    None,
                );
            }
        }
    }

    // Check for errors in individual search results. If any search failed, fail the entire request.
    let errors: Vec<&DataSourceSearchResultItem> =
        all_results.iter().filter(|r| r.error.is_some()).collect();
    if !errors.is_empty() {
        let first_error = &errors[0];
        return error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "search_failed",
            &format!(
                "Search failed for data source {}:{}: {}",
                first_error.project_id,
                first_error.data_source_id,
                first_error.error.as_ref().unwrap()
            ),
            None,
        );
    }

    // Apply global top_k and return documents.
    let documents = apply_global_top_k(&payload.query, payload.top_k, &all_results);

    (
        StatusCode::OK,
        Json(APIResponse {
            error: None,
            response: Some(json!({
                "documents": documents,
            })),
        }),
    )
}
/// Update tags of a document in a data source.

#[derive(serde::Deserialize)]
pub struct DataSourcesDocumentsUpdateTagsPayload {
    add_tags: Option<Vec<String>>,
    remove_tags: Option<Vec<String>>,
}

pub async fn data_sources_documents_update_tags(
    Path((project_id, data_source_id, document_id)): Path<(i64, String, String)>,
    State(state): State<Arc<APIState>>,
    Json(payload): Json<DataSourcesDocumentsUpdateTagsPayload>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);
    let add_tags = payload.add_tags.unwrap_or_else(|| vec![]);
    let remove_tags = payload.remove_tags.unwrap_or_else(|| vec![]);
    let add_tags_set: HashSet<String> = add_tags.iter().cloned().collect();
    let remove_tags_set: HashSet<String> = remove_tags.iter().cloned().collect();

    if add_tags_set.intersection(&remove_tags_set).count() > 0 {
        return error_response(
            StatusCode::BAD_REQUEST,
            "bad_request",
            "The `add_tags` and `remove_tags` lists have a non-empty intersection.",
            None,
        );
    }
    match state
        .store
        .load_data_source(&project, &data_source_id)
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to retrieve data source",
            Some(e),
        ),
        Ok(ds) => match ds {
            None => error_response(
                StatusCode::NOT_FOUND,
                "data_source_not_found",
                &format!("No data source found for id `{}`", data_source_id),
                None,
            ),
            Some(ds) => match ds
                .update_tags(
                    state.store.clone(),
                    state.qdrant_clients.clone(),
                    document_id,
                    add_tags_set.into_iter().collect(),
                    remove_tags_set.into_iter().collect(),
                )
                .await
            {
                Err(e) => error_response(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal_server_error",
                    "Failed to update document tags",
                    Some(e),
                ),
                Ok(_) => (
                    StatusCode::OK,
                    Json(APIResponse {
                        error: None,
                        response: Some(json!({
                            "data_source": {
                                "created": ds.created(),
                                "data_source_id": ds.data_source_id(),
                                "config": ds.config(),
                            },
                        })),
                    }),
                ),
            },
        },
    }
}

/// Update parents of a document in a data source.

#[derive(serde::Deserialize)]
pub struct DataSourcesDocumentsUpdateParentsPayload {
    pub parent_id: Option<String>,
    pub parents: Vec<String>,
}

pub async fn data_sources_documents_update_parents(
    Path((project_id, data_source_id, document_id)): Path<(i64, String, String)>,
    State(state): State<Arc<APIState>>,
    Json(payload): Json<DataSourcesDocumentsUpdateParentsPayload>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);

    if payload.parents.get(0) != Some(&document_id) {
        return error_response(
            StatusCode::BAD_REQUEST,
            "invalid_parents",
            "Failed to update document parents - parents[0] and document_id should be equal",
            None,
        );
    }

    match &payload.parent_id {
        Some(parent_id) => {
            if payload.parents.get(1) != Some(parent_id) {
                return error_response(
                    StatusCode::BAD_REQUEST,
                    "invalid_parent_id",
                    "Failed to update document parents - parents[1] and parent_id should be equal",
                    None,
                );
            }
        }
        None => {
            if payload.parents.len() > 1 {
                return error_response(
                    StatusCode::BAD_REQUEST,
                    "invalid_parent_id",
                    "Failed to update document parents - parent_id should not be null if parents[1] is defined",
                    None,
                );
            }
        }
    }

    match state
        .store
        .load_data_source(&project, &data_source_id)
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to retrieve data source",
            Some(e),
        ),
        Ok(ds) => match ds {
            None => error_response(
                StatusCode::NOT_FOUND,
                "data_source_not_found",
                &format!("No data source found for id `{}`", data_source_id),
                None,
            ),
            Some(ds) => match ds
                .update_parents(
                    state.store.clone(),
                    state.qdrant_clients.clone(),
                    state.search_store.clone(),
                    document_id,
                    payload.parents,
                )
                .await
            {
                Err(e) => error_response(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal_server_error",
                    "Failed to update document parents",
                    Some(e),
                ),
                Ok(_) => (
                    StatusCode::OK,
                    Json(APIResponse {
                        error: None,
                        response: Some(json!({
                            "data_source": {
                                "created": ds.created(),
                                "data_source_id": ds.data_source_id(),
                                "config": ds.config(),
                            },
                        })),
                    }),
                ),
            },
        },
    }
}

// List versions of a document in a data source.

#[derive(serde::Deserialize)]
pub struct DataSourcesDocumentsVersionsListQuery {
    offset: usize,
    limit: usize,
    latest_hash: Option<String>, // Hash of the latest version to retrieve.
    view_filter: Option<String>, // Parsed as JSON.
}

pub async fn data_sources_documents_versions_list(
    Path((project_id, data_source_id, document_id)): Path<(i64, String, String)>,
    State(state): State<Arc<APIState>>,
    Query(query): Query<DataSourcesDocumentsVersionsListQuery>,
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
        .list_data_source_document_versions(
            &project,
            &data_source_id,
            &document_id,
            Some((query.limit, query.offset)),
            &match view_filter {
                Some(filter) => Some(filter.postprocess_for_data_source(&data_source_id)),
                None => None,
            },
            &query.latest_hash,
            true,
        )
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to list document versions",
            Some(e),
        ),
        Ok((versions, total)) => (
            StatusCode::OK,
            Json(APIResponse {
                error: None,
                response: Some(json!({
                    "offset": query.offset,
                    "limit": query.limit,
                    "total": total,
                    "versions": versions,
                })),
            }),
        ),
    }
}

/// Upsert a document in a data source.

#[derive(serde::Deserialize)]
pub struct DataSourcesDocumentsUpsertPayload {
    document_id: String,
    timestamp: Option<u64>,
    tags: Vec<String>,
    parent_id: Option<String>,
    parents: Vec<String>,
    source_url: Option<String>,
    section: Section,
    credentials: run::Credentials,
    light_document_output: Option<bool>,
    title: String,
    mime_type: String,
    provider_visibility: Option<ProviderVisibility>,
}

pub async fn data_sources_documents_upsert(
    Path((project_id, data_source_id)): Path<(i64, String)>,
    State(state): State<Arc<APIState>>,
    Json(payload): Json<DataSourcesDocumentsUpsertPayload>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);
    let light_document_output = payload.light_document_output.unwrap_or_else(|| false);

    // TODO(2025-03-17 aubin) - Add generic validation on node upserts instead of duplicating it for folders, tables, documents.
    if payload.parents.get(0) != Some(&payload.document_id) {
        return error_response(
            StatusCode::BAD_REQUEST,
            "invalid_parents",
            "Failed to upsert document - parents[0] and document_id should be equal",
            None,
        );
    }

    match &payload.parent_id {
        Some(parent_id) => {
            if payload.parents.get(1) != Some(parent_id) {
                return error_response(
                    StatusCode::BAD_REQUEST,
                    "invalid_parent_id",
                    "Failed to upsert document - parents[1] and parent_id should be equal",
                    None,
                );
            }
        }
        None => {
            if payload.parents.len() > 1 {
                return error_response(
                    StatusCode::BAD_REQUEST,
                    "invalid_parent_id",
                    "Failed to upsert document - parent_id should not be null if parents[1] is defined",
                    None,
                );
            }
        }
    }

    if payload.title.trim().is_empty() {
        return error_response(
            StatusCode::BAD_REQUEST,
            "title_is_empty",
            "Failed to upsert document - title is empty",
            None,
        );
    }

    match state
        .store
        .load_data_source(&project, &data_source_id)
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to retrieve data source",
            Some(e),
        ),
        Ok(ds) => match ds {
            None => error_response(
                StatusCode::NOT_FOUND,
                "data_source_not_found",
                &format!("No data source found for id `{}`", data_source_id),
                None,
            ),
            Some(ds) => {
                match ds
                    .upsert(
                        payload.credentials,
                        state.store.clone(),
                        state.qdrant_clients.clone(),
                        &payload.document_id,
                        payload.title,
                        payload.mime_type,
                        &payload.provider_visibility,
                        payload.timestamp,
                        &payload.tags,
                        &payload.parents,
                        &payload.source_url,
                        payload.section,
                        true, // preserve system tags
                        state.search_store.clone(),
                    )
                    .await
                {
                    Err(e) => error_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "internal_server_error",
                        "Failed to upsert document",
                        Some(e),
                    ),
                    Ok(d) => {
                        let mut response_data = json!({
                            "data_source": {
                                "created": ds.created(),
                                "data_source_id": ds.data_source_id(),
                                "config": ds.config(),
                            },
                        });
                        if light_document_output {
                            response_data["document"] = json!({
                                "hash": d.hash,
                                "text_size": d.text_size,
                                "chunk_count": d.chunk_count,
                                "token_count": d.token_count,
                                "created": d.created,
                            });
                        } else {
                            response_data["document"] = json!(d);
                        }
                        (
                            StatusCode::OK,
                            Json(APIResponse {
                                error: None,
                                response: Some(response_data),
                            }),
                        )
                    }
                }
            }
        },
    }
}

// Get a document blob from a data source.

pub async fn data_sources_documents_retrieve_blob(
    Path((project_id, data_source_id, document_id)): Path<(i64, String, String)>,
    State(state): State<Arc<APIState>>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);

    match state
        .store
        .load_data_source(&project, &data_source_id)
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to retrieve data source",
            Some(e),
        ),
        Ok(ds) => match ds {
            None => error_response(
                StatusCode::NOT_FOUND,
                "data_source_not_found",
                &format!("No data source found for id `{}`", data_source_id),
                None,
            ),
            Some(ds) => match ds
                .retrieve_api_blob(state.store.clone(), &document_id)
                .await
            {
                Err(e) => error_response(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal_server_error",
                    "Failed to retrieve document blob",
                    Some(e),
                ),
                Ok(None) => error_response(
                    StatusCode::NOT_FOUND,
                    "data_source_document_not_found",
                    &format!("No document found for id `{}`", document_id),
                    None,
                ),
                Ok(Some(blob)) => {
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
        },
    }
}

/// List documents from a data source.

#[derive(serde::Deserialize)]
pub struct DataSourcesListQuery {
    document_ids: Option<String>, // Parse as JSON.
    limit: Option<usize>,
    offset: Option<usize>,
    view_filter: Option<String>, // Parsed as JSON.
}

pub async fn data_sources_documents_list(
    Path((project_id, data_source_id)): Path<(i64, String)>,
    State(state): State<Arc<APIState>>,
    Query(query): Query<DataSourcesListQuery>,
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

    let limit_offset: Option<(usize, usize)> = match (query.limit, query.offset) {
        (Some(limit), Some(offset)) => Some((limit, offset)),
        _ => None,
    };

    let document_ids: Option<Vec<String>> = match query.document_ids {
        Some(ref ids) => match serde_json::from_str(ids) {
            Ok(parsed_ids) => Some(parsed_ids),
            Err(e) => {
                return error_response(
                    StatusCode::BAD_REQUEST,
                    "invalid_document_ids",
                    "Failed to parse document_ids query parameter",
                    Some(e.into()),
                )
            }
        },
        None => None,
    };

    let project = project::Project::new_from_id(project_id);
    match state
        .store
        .list_data_source_documents(
            &project,
            &data_source_id,
            &match view_filter {
                Some(filter) => Some(filter.postprocess_for_data_source(&data_source_id)),
                None => None,
            },
            &document_ids,
            limit_offset,
            true, // remove system tags
        )
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to list data source",
            Some(e),
        ),
        Ok(documents) => {
            let stats = state
                .search_store
                .get_data_source_stats(vec![data_source_id.clone()])
                .await;

            let total = match stats {
                Ok((data_source_stats, _)) => data_source_stats
                    .first()
                    .map(|ds| ds.document_count as usize)
                    .unwrap_or(0),
                Err(e) => {
                    error!(
                        error = %e,
                        data_source_id = data_source_id,
                        "Failed to get document count from Elasticsearch"
                    );
                    0
                }
            };

            (
                StatusCode::OK,
                Json(APIResponse {
                    error: None,
                    response: Some(json!({
                        "documents": documents,
                        "limit": query.limit,
                        "offset": query.offset,
                        "total": total,
                    })),
                }),
            )
        }
    }
}

/// Retrieve document from a data source.
#[derive(serde::Deserialize)]
pub struct DataSourcesDocumentsRetrieveQuery {
    version_hash: Option<String>,
    view_filter: Option<String>, // Parsed as JSON.
}

pub async fn data_sources_documents_retrieve(
    Path((project_id, data_source_id, document_id)): Path<(i64, String, String)>,
    State(state): State<Arc<APIState>>,
    Query(query): Query<DataSourcesDocumentsRetrieveQuery>,
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
        .load_data_source(&project, &data_source_id)
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to retrieve data source",
            Some(e),
        ),
        Ok(ds) => match ds {
            None => error_response(
                StatusCode::NOT_FOUND,
                "data_source_not_found",
                &format!("No data source found for id `{}`", data_source_id),
                None,
            ),
            Some(ds) => match ds
                .retrieve(
                    state.store.clone(),
                    &document_id,
                    &match view_filter {
                        Some(filter) => Some(filter.postprocess_for_data_source(&data_source_id)),
                        None => None,
                    },
                    true,
                    &query.version_hash,
                )
                .await
            {
                Err(e) => error_response(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal_server_error",
                    "Failed to retrieve document",
                    Some(e),
                ),
                Ok(None) => error_response(
                    StatusCode::NOT_FOUND,
                    "data_source_document_not_found",
                    &format!("No document found for id `{}`", document_id),
                    None,
                ),
                Ok(Some(d)) => (
                    StatusCode::OK,
                    Json(APIResponse {
                        error: None,
                        response: Some(json!({
                            "document": d,
                            "data_source": {
                                "created": ds.created(),
                                "data_source_id": ds.data_source_id(),
                                "config": ds.config(),
                                "name": ds.name(),
                            },
                        })),
                    }),
                ),
            },
        },
    }
}

/// Retrieve document text from a data source with offset and limit.
#[derive(serde::Deserialize)]
pub struct DataSourcesDocumentsRetrieveTextQuery {
    offset: Option<usize>,
    limit: Option<usize>,
    grep: Option<String>,
    version_hash: Option<String>,
    view_filter: Option<String>, // Parsed as JSON.
}

pub async fn data_sources_documents_retrieve_text(
    Path((project_id, data_source_id, document_id)): Path<(i64, String, String)>,
    State(state): State<Arc<APIState>>,
    Query(query): Query<DataSourcesDocumentsRetrieveTextQuery>,
) -> (StatusCode, Json<APIResponse>) {
    // Call the existing retrieve function
    let now = utils::now();
    let retrieve_query = DataSourcesDocumentsRetrieveQuery {
        version_hash: query.version_hash,
        view_filter: query.view_filter,
    };

    let (status, json_response) = data_sources_documents_retrieve(
        Path((project_id, data_source_id.clone(), document_id.clone())),
        State(state),
        Query(retrieve_query),
    )
    .await;

    let retrieve_duration = utils::now() - now;
    info!(
        document_id = document_id,
        retrieve_duration = retrieve_duration,
        status = status.as_u16(),
        "[RETRIEVE_TEXT] Retrieved document"
    );

    // If the request failed, return the error as-is
    if status != StatusCode::OK {
        return (status, json_response);
    }

    // Extract the document text from the response
    let text = json_response
        .response
        .as_ref()
        .and_then(|r| r.get("document"))
        .and_then(|d| d.get("text"))
        .and_then(|t| t.as_str());

    let text = match text {
        Some(t) => t,
        None => {
            return error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_server_error",
                "Failed to extract text from document response",
                None,
            )
        }
    };

    let char_count = text.chars().count();
    info!(
        document_id = document_id,
        char_count = char_count,
        "[RETRIEVE_TEXT] Extracted text"
    );

    // First apply character-based offset and limit
    let offset_limit_start = utils::now();

    let text_slice: String = match (query.offset, query.limit) {
        (Some(o), Some(l)) => text.chars().skip(o).take(l).collect(),
        (Some(o), None) => text.chars().skip(o).collect(),
        (None, Some(l)) => text.chars().take(l).collect(),
        (None, None) => text.to_string(),
    };

    let offset_limit_duration = utils::now() - offset_limit_start;
    let slice_char_count = text_slice.chars().count();
    info!(
        document_id = document_id,
        offset_limit_duration = offset_limit_duration,
        total_char_count = char_count,
        slice_char_count = slice_char_count,
        "[RETRIEVE_TEXT] Applied offset/limit"
    );

    // Then apply grep filter if provided
    let grep_start = utils::now();
    let filtered_text = match &query.grep {
        Some(pattern) => match Regex::new(pattern) {
            Ok(re) => {
                let lines: Vec<&str> = text_slice
                    .lines()
                    .filter(|line| re.is_match(line))
                    .collect();
                lines.join("\n")
            }
            Err(_) => {
                return error_response(
                    StatusCode::BAD_REQUEST,
                    "invalid_regex",
                    &format!("Invalid regular expression: {}", pattern),
                    None,
                )
            }
        },
        None => text_slice,
    };

    let grep_duration = utils::now() - grep_start;
    let total_duration = utils::now() - now;
    info!(
        document_id = document_id,
        grep_duration = grep_duration,
        has_grep = query.grep.is_some(),
        filtered_len = filtered_text.len(),
        total_duration = total_duration,
        "[RETRIEVE_TEXT] Applied grep"
    );

    (
        StatusCode::OK,
        Json(APIResponse {
            error: None,
            response: Some(json!({
                "text": filtered_text,
                "total_characters": char_count,
                "offset": query.offset,
                "limit": query.limit,
            })),
        }),
    )
}

/// Delete document from a data source.

pub async fn data_sources_documents_delete(
    Path((project_id, data_source_id, document_id)): Path<(i64, String, String)>,
    State(state): State<Arc<APIState>>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);
    match state
        .store
        .load_data_source(&project, &data_source_id)
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to retrieve data source",
            Some(e),
        ),
        Ok(ds) => match ds {
            None => error_response(
                StatusCode::NOT_FOUND,
                "data_source_not_found",
                &format!("No data source found for id `{}`", data_source_id),
                None,
            ),
            Some(ds) => match ds
                .delete_document(
                    state.store.clone(),
                    state.qdrant_clients.clone(),
                    state.search_store.clone(),
                    &document_id,
                )
                .await
            {
                Err(e) => error_response(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal_server_error",
                    "Failed to delete document",
                    Some(e),
                ),
                Ok(_) => (
                    StatusCode::OK,
                    Json(APIResponse {
                        error: None,
                        response: Some(json!({
                            "data_source": {
                                "created": ds.created(),
                                "data_source_id": ds.data_source_id(),
                                "config": ds.config(),
                            },
                        })),
                    }),
                ),
            },
        },
    }
}

/// Scrub document deleted versions

pub async fn data_sources_documents_scrub_deleted_versions(
    Path((project_id, data_source_id, document_id)): Path<(i64, String, String)>,
    State(state): State<Arc<APIState>>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);
    match state
        .store
        .load_data_source(&project, &data_source_id)
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to retrieve data source",
            Some(e),
        ),
        Ok(ds) => match ds {
            None => error_response(
                StatusCode::NOT_FOUND,
                "data_source_not_found",
                &format!("No data source found for id `{}`", data_source_id),
                None,
            ),
            Some(ds) => match ds
                .scrub_document_deleted_versions(state.store.clone(), &document_id)
                .await
            {
                Err(e) => error_response(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal_server_error",
                    "Failed to scrub document deleted versions",
                    Some(e),
                ),
                Ok(versions) => (
                    StatusCode::OK,
                    Json(APIResponse {
                        error: None,
                        response: Some(json!({
                            "versions": versions,
                        })),
                    }),
                ),
            },
        },
    }
}

/// Delete a data source.

pub async fn data_sources_delete(
    Path((project_id, data_source_id)): Path<(i64, String)>,
    State(state): State<Arc<APIState>>,
) -> (StatusCode, Json<APIResponse>) {
    let project = project::Project::new_from_id(project_id);
    match state
        .store
        .load_data_source(&project, &data_source_id)
        .await
    {
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_server_error",
            "Failed to retrieve data source",
            Some(e),
        ),
        Ok(ds) => match ds {
            None => error_response(
                StatusCode::NOT_FOUND,
                "data_source_not_found",
                &format!("No data source found for id `{}`", data_source_id),
                None,
            ),
            Some(ds) => match ds
                .delete(
                    state.store.clone(),
                    state.databases_store.clone(),
                    state.qdrant_clients.clone(),
                    state.search_store.clone(),
                )
                .await
            {
                Err(e) => error_response(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal_server_error",
                    "Failed to delete data source",
                    Some(e),
                ),
                Ok(_) => (
                    StatusCode::OK,
                    Json(APIResponse {
                        error: None,
                        response: Some(json!({
                            "data_source": {
                                "created": ds.created(),
                                "data_source_id": ds.data_source_id(),
                                "config": ds.config(),
                            }
                        })),
                    }),
                ),
            },
        },
    }
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DataSourceAndProject {
    data_source_id: String,
    project_id: i64,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StatsPayload {
    query: Vec<DataSourceAndProject>,
}

pub async fn data_sources_stats(
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
