use std::collections::HashMap;

use anyhow::Result;
use async_trait::async_trait;
use elasticsearch::{
    auth::Credentials,
    http::transport::{SingleNodeConnectionPool, TransportBuilder},
    DeleteByQueryParts, DeleteParts, Elasticsearch, IndexParts, SearchParts,
};
use elasticsearch_dsl::{Aggregation, Query, Search};
use serde_json::json;
use tracing::{error, info};
use url::Url;

use crate::{
    data_sources::node::{CoreContentNode, Node},
    utils,
};

const MAX_PAGE_SIZE: u64 = 250;
#[derive(serde::Deserialize)]
pub struct NodesSearchOptions {
    limit: Option<u64>,
    offset: Option<u64>,
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
}

#[async_trait]
pub trait SearchStore {
    async fn search_nodes(
        &self,
        query: Option<String>,
        filter: NodesSearchFilter,
        options: Option<NodesSearchOptions>,
    ) -> Result<Vec<CoreContentNode>>;

    async fn index_node(&self, node: Node) -> Result<()>;
    async fn delete_node(&self, node: Node) -> Result<()>;
    async fn delete_data_source_nodes(&self, data_source_id: &str) -> Result<()>;

    fn clone_box(&self) -> Box<dyn SearchStore + Sync + Send>;
}

impl Default for NodesSearchOptions {
    fn default() -> Self {
        NodesSearchOptions {
            limit: Some(10),
            offset: Some(0),
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

#[async_trait]
impl SearchStore for ElasticsearchSearchStore {
    async fn search_nodes(
        &self,
        query: Option<String>,
        filter: NodesSearchFilter,
        options: Option<NodesSearchOptions>,
    ) -> Result<Vec<CoreContentNode>> {
        let options = options.unwrap_or_default();

        // check that options.limit is not greater than MAX_PAGE_SIZE
        if options.limit.unwrap_or(100) > MAX_PAGE_SIZE {
            return Err(anyhow::anyhow!(
                "Limit is greater than MAX_PAGE_SIZE: {} (limit is {})",
                options.limit.unwrap_or(100),
                MAX_PAGE_SIZE
            ));
        }

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

                bool_query = bool_query.must(Query::term("data_source_id", f.data_source_id));

                if !f.view_filter.is_empty() {
                    bool_query = bool_query.must(Query::terms("parents", f.view_filter));
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

        if let Some(parent_id) = filter.parent_id {
            bool_query = bool_query.filter(Query::term("parent_id", parent_id));
        }

        if let Some(query) = query {
            bool_query = bool_query.must(Query::r#match("title.edge", query));
        }

        // Build and run search
        let search = Search::new()
            .from(options.offset.unwrap_or(0))
            .size(options.limit.unwrap_or(100))
            .query(bool_query);

        let response = self
            .client
            .search(SearchParts::Index(&[NODES_INDEX_NAME]))
            .body(search)
            .send()
            .await?;

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

        self.compute_core_content_nodes(nodes).await
    }

    async fn index_node(&self, node: Node) -> Result<()> {
        let now = utils::now();
        // Note: in elasticsearch, the index API updates the document if it
        // already exists.
        let response = self
            .client
            .index(IndexParts::IndexId(NODES_INDEX_NAME, &node.unique_id()))
            .timeout("200ms")
            .body(node.clone())
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

    fn clone_box(&self) -> Box<dyn SearchStore + Sync + Send> {
        Box::new(self.clone())
    }
}

impl ElasticsearchSearchStore {
    /// Compute core content nodes from a list of nodes.
    ///
    /// This function performs two queries to Elasticsearch:
    /// 1. Get has_children information for each node.
    /// 2. Get parent titles for each node.
    ///
    /// It then creates CoreContentNodes from the nodes, using the results of these queries
    /// to populate the `has_children` and `parent_title` fields
    async fn compute_core_content_nodes(&self, nodes: Vec<Node>) -> Result<Vec<CoreContentNode>> {
        if nodes.len() as u64 > MAX_PAGE_SIZE {
            return Err(anyhow::anyhow!(
                "Too many nodes to compute core content nodes: {} (limit is {})",
                nodes.len(),
                MAX_PAGE_SIZE
            ));
        }

        // Build has_children query
        let has_children_search = Search::new()
            .size(0)
            .query(Query::bool().filter(Query::terms(
                "parent_id",
                nodes.iter().map(|n| &n.node_id).collect::<Vec<_>>(),
            )))
            .aggregate(
                "parent_nodes",
                Aggregation::terms("parent_id").size(MAX_PAGE_SIZE),
            );

        // Build parent titles query
        let parent_ids: Vec<_> = nodes.iter().filter_map(|n| n.parent_id.as_ref()).collect();
        let parent_titles_search = Search::new()
            .size(parent_ids.len() as u64)
            .query(Query::bool().filter(Query::terms("node_id", parent_ids)))
            .source(vec!["node_id", "title"]);

        // Execute both futures concurrently
        let (has_children_response, parent_titles_response) = tokio::join!(
            self.client
                .search(SearchParts::Index(&[NODES_INDEX_NAME]))
                .body(has_children_search)
                .send(),
            self.client
                .search(SearchParts::Index(&[NODES_INDEX_NAME]))
                .body(parent_titles_search)
                .send()
        );

        let has_children_response = has_children_response?;
        let parent_titles_response = parent_titles_response?;

        // Process has_children results
        let has_children_map = if has_children_response.status_code().is_success() {
            let response_body = has_children_response.json::<serde_json::Value>().await?;
            response_body["aggregations"]["parent_nodes"]["buckets"]
                .as_array()
                .map(|buckets| {
                    buckets
                        .iter()
                        .filter_map(|bucket| {
                            Some((
                                bucket["key"].as_str()?.to_string(),
                                bucket["doc_count"].as_u64()? > 0,
                            ))
                        })
                        .collect::<HashMap<_, _>>()
                })
                .unwrap_or_default()
        } else {
            let error = has_children_response.json::<serde_json::Value>().await?;
            return Err(anyhow::anyhow!(
                "Failed to fetch has_children data: {}",
                error
            ));
        };

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
                let has_children = has_children_map
                    .get(&node.node_id)
                    .copied()
                    .unwrap_or(false);
                let parent_title = node
                    .parent_id
                    .as_ref()
                    .and_then(|pid| parent_titles_map.get(pid))
                    .cloned()
                    .unwrap_or_default();

                CoreContentNode::new(node, has_children, parent_title)
            })
            .collect();

        Ok(core_content_nodes)
    }
}
