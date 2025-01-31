use std::collections::HashMap;

use anyhow::Result;
use async_trait::async_trait;
use base64::{engine::general_purpose::URL_SAFE, Engine};
use elasticsearch::{
    auth::Credentials,
    http::transport::{SingleNodeConnectionPool, TransportBuilder},
    DeleteByQueryParts, DeleteParts, Elasticsearch, IndexParts, SearchParts,
};
use elasticsearch_dsl::{Aggregation, BoolQuery, Query, Search};
use serde_json::json;
use tracing::{error, info};
use url::Url;

use crate::{
    data_sources::node::{CoreContentNode, Node, NodeType},
    stores::store::Store,
    utils,
};

const MAX_PAGE_SIZE: u64 = 1000;

#[derive(serde::Deserialize, Debug)]
#[serde(rename_all = "lowercase")]
pub enum SortDirection {
    Asc,
    Desc,
}

#[derive(serde::Deserialize, Clone, Copy, Debug)]
#[serde(rename_all = "lowercase")]
pub enum TagsQueryType {
    Exact,
    Prefix,
}

#[derive(serde::Deserialize, Debug)]
pub struct SortSpec {
    pub field: String,
    pub direction: SortDirection,
}

#[derive(serde::Deserialize)]
pub struct NodesSearchOptions {
    limit: Option<u64>,
    offset: Option<u64>,
    // sort example:
    // [{"field": "title.keyword", "direction": "desc"}, {"field": "updated_at", "direction": "asc"}]
    // It will sort by title desc, then by updated_at asc, as per
    // elasticsearch's sort syntax (although it's a small subset of it)
    sort: Option<Vec<SortSpec>>,
}

#[derive(serde::Deserialize)]
pub struct DatasourceViewFilter {
    data_source_id: String,
    view_filter: Vec<String>,
}

#[derive(serde::Deserialize)]
pub struct NodesSearchFilter {
    data_source_views: Vec<DatasourceViewFilter>,
    node_ids: Option<Vec<String>>,
    parent_id: Option<String>,
    node_types: Option<Vec<NodeType>>,
}

#[derive(serde::Deserialize)]
pub struct NodesSearchCursorRequest {
    cursor: Option<String>,
    limit: Option<u64>,
    // sort example:
    // [{"field": "title.keyword", "direction": "desc"}, {"field": "updated_at", "direction": "asc"}]
    // It will sort by title desc, then by updated_at asc, as per
    // elasticsearch's sort syntax (although it's a small subset of it)
    sort: Option<Vec<SortSpec>>,
}

impl Default for NodesSearchCursorRequest {
    fn default() -> Self {
        NodesSearchCursorRequest {
            cursor: None,
            limit: Some(MAX_PAGE_SIZE),
            sort: Some(vec![SortSpec {
                field: "title.keyword".to_string(),
                direction: SortDirection::Asc,
            }]),
        }
    }
}

#[derive(serde::Serialize)]
pub struct NodesSearchCursorResponse {
    nodes: Vec<CoreContentNode>,
    next_page_cursor: Option<String>,
}

#[async_trait]
pub trait SearchStore {
    async fn search_nodes(
        &self,
        query: Option<String>,
        filter: NodesSearchFilter,
        options: Option<NodesSearchOptions>,
        store: Box<dyn Store + Sync + Send>,
    ) -> Result<Vec<CoreContentNode>>;

    async fn search_nodes_with_cursor(
        &self,
        query: Option<String>,
        filter: NodesSearchFilter,
        cursor: Option<NodesSearchCursorRequest>,
        store: Box<dyn Store + Sync + Send>,
    ) -> Result<(Vec<CoreContentNode>, Option<String>)>;

    async fn index_node(&self, node: Node, tags: Option<Vec<String>>) -> Result<()>;
    async fn delete_node(&self, node: Node) -> Result<()>;
    async fn delete_data_source_nodes(&self, data_source_id: &str) -> Result<()>;

    async fn search_tags(
        &self,
        query: Option<String>,
        query_type: Option<TagsQueryType>,
        data_sources: Option<Vec<String>>,
        node_ids: Option<Vec<String>>,
        limit: Option<u64>,
    ) -> Result<(Vec<(String, u64)>, u64)>;

    fn clone_box(&self) -> Box<dyn SearchStore + Sync + Send>;
}

impl Default for NodesSearchOptions {
    fn default() -> Self {
        NodesSearchOptions {
            limit: Some(MAX_PAGE_SIZE),
            offset: Some(0),
            sort: Some(vec![SortSpec {
                field: "title.keyword".to_string(),
                direction: SortDirection::Asc,
            }]),
        }
    }
}

impl Clone for Box<dyn SearchStore + Sync + Send> {
    fn clone(&self) -> Self {
        self.clone_box()
    }
}

#[derive(Clone)]
pub struct ElasticsearchSearchStore {
    pub client: Elasticsearch,
}

impl ElasticsearchSearchStore {
    pub async fn new(es_uri: &str, username: &str, password: &str) -> Result<Self> {
        let credentials = Credentials::Basic(username.to_string(), password.to_string());
        let u = Url::parse(es_uri)?;
        let conn_pool = SingleNodeConnectionPool::new(u);
        let mut transport_builder = TransportBuilder::new(conn_pool);
        transport_builder = transport_builder
            .auth(credentials)
            .disable_proxy()
            .cert_validation(elasticsearch::cert::CertificateValidation::None);
        let transport = transport_builder.build()?;
        let client = Elasticsearch::new(transport);
        Ok(Self { client })
    }
}

const NODES_INDEX_NAME: &str = "core.data_sources_nodes";
const ROOT_PARENT_ID: &str = "root";

#[async_trait]
impl SearchStore for ElasticsearchSearchStore {
    // TODO(2025-01-30 nodes-core) Use the search_nodes_with_cursor method.
    async fn search_nodes(
        &self,
        query: Option<String>,
        filter: NodesSearchFilter,
        options: Option<NodesSearchOptions>,
        store: Box<dyn Store + Sync + Send>,
    ) -> Result<Vec<CoreContentNode>> {
        let options = options.unwrap_or_default();

        // TODO(20250128, nodes-core): remove this & corresponding timing logs
        let data_source_id = filter
            .data_source_views
            .first()
            .map(|v| v.data_source_id.clone());
        let data_source_filter = filter
            .data_source_views
            .first()
            .map(|v| v.view_filter.clone());

        let parent_id_log = filter.parent_id.clone();
        let node_ids_log = filter.node_ids.as_ref().map(|ids| ids.join(", "));

        // check that options.limit is not greater than MAX_PAGE_SIZE
        if options.limit.unwrap_or(MAX_PAGE_SIZE) > MAX_PAGE_SIZE {
            return Err(anyhow::anyhow!(
                "Limit is greater than MAX_PAGE_SIZE: {} (limit is {})",
                options.limit.unwrap_or(MAX_PAGE_SIZE),
                MAX_PAGE_SIZE
            ));
        }

        // sort and query are mutually exclusive
        if options.sort.is_some() && query.is_some() {
            return Err(anyhow::anyhow!(
                "Sort option and query string are mutually exclusive"
            ));
        }

        let bool_query = self.build_search_query(query.clone(), filter)?;

        // Build and run search (sort by title if no query)
        let search = Search::new()
            .from(options.offset.unwrap_or(0))
            .size(options.limit.unwrap_or(MAX_PAGE_SIZE))
            .query(bool_query)
            .sort(match query {
                None => options
                    .sort
                    .unwrap_or_default()
                    .into_iter()
                    .map(|s| {
                        elasticsearch_dsl::Sort::FieldSort(
                            elasticsearch_dsl::FieldSort::new(s.field).order(match s.direction {
                                SortDirection::Asc => elasticsearch_dsl::SortOrder::Asc,
                                SortDirection::Desc => elasticsearch_dsl::SortOrder::Desc,
                            }),
                        )
                    })
                    .collect(),
                Some(_) => vec![],
            });

        let search_start = utils::now();
        let response = self
            .client
            .search(SearchParts::Index(&[NODES_INDEX_NAME]))
            .body(search)
            .send()
            .await?;

        let search_duration = utils::now() - search_start;
        info!(
            duration = search_duration,
            data_source_id = data_source_id,
            data_source_filter = data_source_filter.as_ref().map(|v| v.join(", ")),
            parent_id = parent_id_log,
            node_ids = node_ids_log,
            "[ElasticsearchSearchStore] Search nodes duration"
        );

        // Parse response and return enriched nodes
        let nodes: Vec<Node> = match response.status_code().is_success() {
            true => {
                let response_body = response.json::<serde_json::Value>().await?;
                response_body["hits"]["hits"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|h| Node::from(h.get("_source").unwrap().clone()))
                    .collect()
            }
            false => {
                let error = response.json::<serde_json::Value>().await?;
                return Err(anyhow::anyhow!("Failed to search nodes: {}", error));
            }
        };

        let compute_node_start = utils::now();
        let result = self.compute_core_content_nodes(nodes, store).await;
        info!(
            duration = utils::now() - compute_node_start,
            data_source_id = data_source_id,
            data_source_filter = data_source_filter.as_ref().map(|v| v.join(", ")),
            parent_id = parent_id_log,
            node_ids = node_ids_log,
            "[ElasticsearchSearchStore] Compute core content nodes duration"
        );
        result
    }

    async fn search_nodes_with_cursor(
        &self,
        query: Option<String>,
        filter: NodesSearchFilter,
        request: Option<NodesSearchCursorRequest>,
        store: Box<dyn Store + Sync + Send>,
    ) -> Result<(Vec<CoreContentNode>, Option<String>)> {
        let params = request.unwrap_or_default();
        let limit = params.limit.unwrap_or(MAX_PAGE_SIZE);

        // TODO(20250128, nodes-core): remove this & corresponding timing logs
        let data_source_id = filter
            .data_source_views
            .first()
            .map(|v| v.data_source_id.clone());
        let data_source_filter = filter
            .data_source_views
            .first()
            .map(|v| v.view_filter.clone());

        let parent_id_log = filter.parent_id.clone();
        let node_ids_log = filter.node_ids.as_ref().map(|ids| ids.join(", "));

        // Validate limit.
        if limit == 0 {
            return Err(anyhow::anyhow!("Limit cannot be zero"));
        }
        if limit > MAX_PAGE_SIZE {
            return Err(anyhow::anyhow!(
                "Limit is greater than MAX_PAGE_SIZE: {} (limit is {})",
                limit,
                MAX_PAGE_SIZE
            ));
        }

        // Build the base query.
        let bool_query = self.build_search_query(query, filter)?;

        // Get user-specified sort or default.
        let mut sort_spec = params.sort.unwrap_or_default();

        // Always append id as tie-breaker.
        sort_spec.push(SortSpec {
            field: "node_id".to_string(),
            direction: SortDirection::Asc,
        });

        // Build the search.
        let mut search = Search::new().size(limit).query(bool_query).sort(
            sort_spec
                .into_iter()
                .map(|s| {
                    elasticsearch_dsl::Sort::FieldSort(
                        elasticsearch_dsl::FieldSort::new(s.field).order(match s.direction {
                            SortDirection::Asc => elasticsearch_dsl::SortOrder::Asc,
                            SortDirection::Desc => elasticsearch_dsl::SortOrder::Desc,
                        }),
                    )
                })
                .collect::<Vec<elasticsearch_dsl::Sort>>(),
        );

        // Add search_after if cursor is provided.
        if let Some(cursor) = params.cursor {
            let decoded = URL_SAFE.decode(cursor)?;
            let json_str = String::from_utf8(decoded)?;
            let search_after: Vec<serde_json::Value> = serde_json::from_str(&json_str)?;
            search = search.search_after(search_after);
        }

        let search_start = utils::now();

        // Execute search.
        let response = self
            .client
            .search(SearchParts::Index(&[NODES_INDEX_NAME]))
            .body(search)
            .send()
            .await?;

        let search_duration = utils::now() - search_start;
        info!(
            duration = search_duration,
            data_source_id = data_source_id,
            data_source_filter = data_source_filter.as_ref().map(|v| v.join(", ")),
            parent_id = parent_id_log,
            node_ids = node_ids_log,
            "[ElasticsearchSearchStore] Search nodes with cursor duration"
        );

        // Parse response and handle errors.
        let (nodes, next_page_cursor) = match response.status_code().is_success() {
            true => {
                let response_body = response.json::<serde_json::Value>().await?;
                let hits = response_body["hits"]["hits"].as_array().unwrap();

                let next_cursor = if hits.len() == limit as usize {
                    hits.last()
                        .and_then(|hit| hit.get("sort"))
                        .map(|sort_values| {
                            // Encode the raw JSON sort values.
                            URL_SAFE.encode(serde_json::to_string(sort_values).unwrap().as_bytes())
                        })
                } else {
                    None
                };

                let nodes = hits
                    .iter()
                    .map(|h| Node::from(h.get("_source").unwrap().clone()))
                    .collect();

                (nodes, next_cursor)
            }
            false => {
                let error = response.json::<serde_json::Value>().await?;
                return Err(anyhow::anyhow!("Failed to search nodes: {}", error));
            }
        };

        let compute_node_start = utils::now();
        // Compute core content nodes with additional metadata.
        let result = self.compute_core_content_nodes(nodes, store).await?;
        info!(
            duration = utils::now() - compute_node_start,
            data_source_id = data_source_id,
            data_source_filter = data_source_filter.as_ref().map(|v| v.join(", ")),
            parent_id = parent_id_log,
            node_ids = node_ids_log,
            "[ElasticsearchSearchStore] Compute core content nodes duration"
        );

        Ok((result, next_page_cursor))
    }

    async fn index_node(&self, node: Node, tags: Option<Vec<String>>) -> Result<()> {
        println!("index_node {:?}", tags);
        let now = utils::now();

        let doc = json!({
            "data_source_id": node.data_source_id,
            "data_source_internal_id": node.data_source_internal_id,
            "node_id": node.node_id,
            "node_type": node.node_type,
            "timestamp": node.timestamp,
            "title": node.title,
            "mime_type": node.mime_type,
            "provider_visibility": node.provider_visibility,
            "parent_id": node.parent_id,
            "parents": node.parents,
            "source_url": node.source_url,
            "tags": tags
        });

        // Note: in elasticsearch, the index API updates the document if it
        // already exists.
        let response = self
            .client
            .index(IndexParts::IndexId(NODES_INDEX_NAME, &node.unique_id()))
            .timeout("200ms")
            .body(doc)
            .send()
            .await?;

        match response.status_code().is_success() {
            true => {
                info!(
                    duration = utils::now() - now,
                    globally_unique_id = node.unique_id(),
                    "[ElasticsearchSearchStore] Indexed {}",
                    node.node_type.to_string()
                );
                Ok(())
            }
            false => {
                let error = response.json::<serde_json::Value>().await?;
                error!(
                    error = %error,
                    duration = utils::now() - now,
                    globally_unique_id = node.unique_id(),
                    "[ElasticsearchSearchStore] Failed to index {}",
                    node.node_type.to_string()
                );
                Err(anyhow::anyhow!("Failed to index node {}", error))
            }
        }
    }

    async fn delete_node(&self, node: Node) -> Result<()> {
        let response = self
            .client
            .delete(DeleteParts::IndexId(NODES_INDEX_NAME, &node.unique_id()))
            .send()
            .await?;
        match response.status_code().is_success() {
            true => Ok(()),
            false => {
                let error = response.json::<serde_json::Value>().await?;
                if error["result"] == "not_found" {
                    info!(
                        globally_unique_id = node.unique_id(),
                        "[ElasticsearchSearchStore] Delete node on non-existent document"
                    );
                    Ok(())
                } else {
                    Err(anyhow::anyhow!("Failed to delete node {}", error))
                }
            }
        }
    }

    async fn delete_data_source_nodes(&self, data_source_id: &str) -> Result<()> {
        let response = self
            .client
            .delete_by_query(DeleteByQueryParts::Index(&[NODES_INDEX_NAME]))
            .body(json!({
                "query": {
                    "term": { "data_source_id": data_source_id }
                }
            }))
            .send()
            .await?;
        match response.status_code().is_success() {
            true => Ok(()),
            false => {
                let error = response.json::<serde_json::Value>().await?;
                Err(anyhow::anyhow!(
                    "Failed to delete data source nodes {}",
                    error
                ))
            }
        }
    }

    async fn search_tags(
        &self,
        query: Option<String>,
        query_type: Option<TagsQueryType>,
        data_sources: Option<Vec<String>>,
        node_ids: Option<Vec<String>>,
        limit: Option<u64>,
    ) -> Result<(Vec<(String, u64)>, u64)> {
        let query_type = query_type.unwrap_or(TagsQueryType::Exact);
        let bool_query = Query::bool();
        let bool_query = match data_sources {
            None => bool_query,
            Some(data_sources) => bool_query.must(Query::terms("data_source_id", data_sources)),
        };
        let bool_query = match node_ids {
            None => bool_query,
            Some(node_ids) => bool_query.must(Query::terms("node_id", node_ids)),
        };
        let bool_query = match query.clone() {
            None => bool_query,
            Some(p) => match query_type {
                TagsQueryType::Exact => bool_query.must(Query::term("tags.keyword", p)),
                TagsQueryType::Prefix => bool_query.must(Query::prefix("tags.edge", p)),
            },
        };
        let aggregate = Aggregation::terms("tags.keyword");
        let aggregate = match query.clone() {
            None => aggregate,
            Some(p) => match query_type {
                TagsQueryType::Exact => aggregate.include(p),
                TagsQueryType::Prefix => aggregate.include(format!("{}.*", p).as_str()),
            },
        };
        let search = Search::new()
            .size(0)
            .query(bool_query)
            .aggregate("unique_tags", aggregate.size(limit.unwrap_or(100)));

        let response = self
            .client
            .search(SearchParts::Index(&[NODES_INDEX_NAME]))
            .body(search)
            .send()
            .await?;

        // Parse response and return tags
        match response.status_code().is_success() {
            true => {
                let response_body = response.json::<serde_json::Value>().await?;
                Ok((
                    response_body["aggregations"]["unique_tags"]["buckets"]
                        .as_array()
                        .unwrap_or(&vec![])
                        .iter()
                        .filter_map(|bucket| {
                            bucket["key"].as_str().map(|key| {
                                (key.to_string(), bucket["doc_count"].as_u64().unwrap_or(0))
                            })
                        })
                        .collect(),
                    response_body["hits"]["total"]["value"]
                        .as_u64()
                        .unwrap_or(0),
                ))
            }
            false => {
                let error = response.json::<serde_json::Value>().await?;
                Err(anyhow::anyhow!("Failed to list tags: {}", error))
            }
        }
    }

    fn clone_box(&self) -> Box<dyn SearchStore + Sync + Send> {
        Box::new(self.clone())
    }
}

impl ElasticsearchSearchStore {
    fn build_search_query(
        &self,
        query: Option<String>,
        filter: NodesSearchFilter,
    ) -> Result<BoolQuery> {
        // check there is at least one data source view filter
        // !! do not remove; without data source view filter this endpoint is
        // dangerous as any data from any workspace can be retrieved
        if filter.data_source_views.is_empty() {
            return Err(anyhow::anyhow!("No data source views provided"));
        }

        // Build filter conditions using elasticsearch-dsl
        let filter_conditions: Vec<Query> = filter
            .data_source_views
            .into_iter()
            .map(|f| {
                let mut bool_query = Query::bool();

                bool_query = bool_query.filter(Query::term("data_source_id", f.data_source_id));

                if !f.view_filter.is_empty() {
                    bool_query = bool_query.filter(Query::terms("parents", f.view_filter));
                }

                Query::Bool(bool_query)
            })
            .collect();

        let mut bool_query = Query::bool()
            .should(filter_conditions)
            .minimum_should_match(1);

        if let Some(node_ids) = filter.node_ids {
            bool_query = bool_query.filter(Query::terms("node_id", node_ids));
        }

        if let Some(node_types) = filter.node_types {
            bool_query = bool_query.filter(Query::terms("node_type", node_types));
        }

        if let Some(parent_id) = filter.parent_id {
            // if parent_id is root, we filter on all nodes whose parent_id is null
            // otherwise, we filter on all nodes whose parent_id is the given parent_id
            if parent_id == ROOT_PARENT_ID {
                bool_query = bool_query.filter(Query::bool().must_not(Query::exists("parent_id")));
            } else {
                bool_query = bool_query.filter(Query::term("parent_id", parent_id));
            }
        }

        if let Some(query_string) = query.clone() {
            bool_query = bool_query.must(Query::r#match("title.edge", query_string));
        }

        Ok(bool_query)
    }

    /// Compute core content nodes from a list of nodes.
    ///
    /// This function performs two queries to Elasticsearch:
    /// 1. Get has_children information for each node.
    /// 2. Get parent titles for each node.
    ///
    /// It then creates CoreContentNodes from the nodes, using the results of these queries
    /// to populate the `has_children` and `parent_title` fields
    async fn compute_core_content_nodes(
        &self,
        nodes: Vec<Node>,
        store: Box<dyn Store + Sync + Send>,
    ) -> Result<Vec<CoreContentNode>> {
        if nodes.len() as u64 > MAX_PAGE_SIZE {
            return Err(anyhow::anyhow!(
                "Too many nodes to compute core content nodes: {} (limit is {})",
                nodes.len(),
                MAX_PAGE_SIZE
            ));
        }

        // count children using store
        let count_start = utils::now();
        let children_count_map = store.count_nodes_children(&nodes).await?;
        let count_duration = utils::now() - count_start;
        info!(
            duration = count_duration,
            "[ElasticsearchSearchStore] Count children duration"
        );

        // Build parent titles query
        let parent_ids: Vec<_> = nodes.iter().filter_map(|n| n.parent_id.as_ref()).collect();
        let parent_titles_search = Search::new()
            .size(parent_ids.len() as u64)
            .query(Query::bool().filter(Query::terms("node_id", parent_ids)))
            .source(vec!["node_id", "title"]);

        let parent_titles_response = self
            .client
            .search(SearchParts::Index(&[NODES_INDEX_NAME]))
            .body(parent_titles_search)
            .send()
            .await?;

        // Process parent titles results
        let parent_titles_map = if parent_titles_response.status_code().is_success() {
            let response_body = parent_titles_response.json::<serde_json::Value>().await?;
            response_body["hits"]["hits"]
                .as_array()
                .map(|hits| {
                    hits.iter()
                        .filter_map(|hit| {
                            Some((
                                hit["_source"]["node_id"].as_str()?.to_string(),
                                hit["_source"]["title"].as_str()?.to_string(),
                            ))
                        })
                        .collect::<HashMap<_, _>>()
                })
                .unwrap_or_default()
        } else {
            let error = parent_titles_response.json::<serde_json::Value>().await?;
            return Err(anyhow::anyhow!("Failed to fetch parent titles: {}", error));
        };

        // Create CoreContentNodes using the above results
        let core_content_nodes = nodes
            .into_iter()
            .map(|node| {
                let children_count = children_count_map.get(&node.node_id).copied().unwrap_or(0);
                let parent_title = node
                    .parent_id
                    .as_ref()
                    .and_then(|pid| parent_titles_map.get(pid))
                    .cloned();

                CoreContentNode::new(node, children_count, parent_title)
            })
            .collect();

        Ok(core_content_nodes)
    }
}
