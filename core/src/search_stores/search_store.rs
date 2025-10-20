use std::collections::{HashMap, HashSet};

use anyhow::Result;
use async_trait::async_trait;
use base64::{engine::general_purpose::URL_SAFE, Engine};
use elasticsearch::{
    auth::Credentials,
    http::transport::{SingleNodeConnectionPool, TransportBuilder},
    DeleteByQueryParts, DeleteParts, Elasticsearch, IndexParts, SearchParts,
};
use elasticsearch_dsl::{
    Aggregation, BoolQuery, FieldSort, Operator, Query, Script, ScriptSort, ScriptSortType, Search,
    Sort, SortMissing, SortOrder,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tracing::{error, info};
use url::Url;

use crate::data_sources::data_source::{DataSourceESDocumentWithStats, Document};
use crate::data_sources::folder::Folder;
use crate::data_sources::node::NodeESDocument;
use crate::databases::table::Table;
use crate::{
    data_sources::{
        data_source::{DataSource, DATA_SOURCE_INDEX_NAME},
        node::{CoreContentNode, NodeType, DATA_SOURCE_NODE_INDEX_NAME},
    },
    search_stores::search_types::SearchItem,
    stores::store::Store,
    utils,
};

const MAX_PAGE_SIZE: u64 = 1000;
// Number of hits that is tracked exactly, above this value we only get a lower bound on the hit count.
// Note: this is the default value.
const MAX_TOTAL_HITS_TRACKED: i64 = 10000;
const MAX_ES_QUERY_CLAUSES: usize = 1024; // Default Elasticsearch limit.

const DEFAULT_TAG_AGGREGATION_SIZE_LIMIT: u64 = 200;

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
    Match,
}

// For each data source view, the scope of search can be:
// - DataSourceName: only check if the datasource name matches the query;
// - NodesTitles: check if any of the datasource's nodes titles match the query;
// - Both: check if either the datasource name or any of its nodes titles match the query;
#[derive(serde::Deserialize, Clone, Copy, Debug)]
#[serde(rename_all = "snake_case")]
pub enum SearchScopeType {
    DataSourceName,
    NodesTitles,
    Both,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MimeTypeFilter {
    #[serde(rename = "in")]
    pub is_in: Option<Vec<String>>,
    #[serde(rename = "not")]
    pub is_not: Option<Vec<String>>,
}

#[derive(serde::Deserialize, Debug)]
pub struct SortSpec {
    pub field: String,
    pub direction: SortDirection,
}

#[derive(serde::Deserialize)]
pub struct NodesSearchOptions {
    limit: Option<u64>,
    cursor: Option<String>,
    // sort example:
    // [{"field": "title.keyword", "direction": "desc"}, {"field": "updated_at", "direction": "asc"}]
    // It will sort by title desc, then by updated_at asc, as per
    // elasticsearch's sort syntax (although it's a small subset of it)
    sort: Option<Vec<SortSpec>>,
    // Whether to search within source URLs when matching the query.
    search_source_urls: Option<bool>,
}

#[derive(serde::Deserialize, Clone, Debug)]
pub struct DatasourceViewFilter {
    data_source_id: String,
    view_filter: Vec<String>,
    #[serde(default = "default_search_scope")]
    search_scope: SearchScopeType,
    #[serde(default)]
    filter: Option<Vec<String>>,
}

fn default_search_scope() -> SearchScopeType {
    SearchScopeType::NodesTitles
}

#[derive(serde::Deserialize, Debug)]
pub struct NodesSearchFilter {
    data_source_views: Vec<DatasourceViewFilter>,
    mime_types: Option<MimeTypeFilter>,
    node_ids: Option<Vec<String>>,
    node_types: Option<Vec<NodeType>>,
    parent_id: Option<String>,
}

#[derive(Debug, Clone)]
pub enum NodeItem {
    Document(Document),
    Table(Table),
    Folder(Folder),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum SearchWarningCode {
    TruncatedQueryClauses,
}

#[async_trait]
pub trait SearchStore {
    async fn search_nodes(
        &self,
        query: Option<String>,
        filter: NodesSearchFilter,
        options: Option<NodesSearchOptions>,
        store: Box<dyn Store + Sync + Send>,
    ) -> Result<(
        Vec<CoreContentNode>,
        u64,
        bool,
        Option<String>,
        Option<SearchWarningCode>,
    )>;

    // Data source nodes
    async fn index_node(&self, node: NodeItem) -> Result<()>;
    async fn delete_node(&self, node: NodeItem) -> Result<()>;

    // Data sources.
    async fn get_data_source_stats(
        &self,
        data_source_ids: Vec<String>,
    ) -> Result<(Vec<DataSourceESDocumentWithStats>, i64)>;
    async fn index_data_source(&self, data_source: &DataSource) -> Result<()>;
    async fn delete_data_source(&self, data_source: &DataSource) -> Result<()>;

    async fn search_tags(
        &self,
        query: Option<String>,
        query_type: Option<TagsQueryType>,
        data_source_views: Vec<DatasourceViewFilter>,
        node_ids: Option<Vec<String>>,
        limit: Option<u64>,
    ) -> Result<Vec<(String, u64, Vec<(String, u64)>)>>;

    fn clone_box(&self) -> Box<dyn SearchStore + Sync + Send>;
}

impl Default for NodesSearchOptions {
    fn default() -> Self {
        NodesSearchOptions {
            limit: Some(MAX_PAGE_SIZE),
            cursor: None,
            sort: None,
            search_source_urls: Some(false),
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

fn map_sort_field(field: &str) -> &str {
    match field {
        "title" => "title.keyword",
        other => other,
    }
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

const ROOT_PARENT_ID: &str = "root";

// Add a helper struct to track clause counts.
// This is a best-effort counter to avoid exceeding the max number of clauses.
struct QueryClauseCounter {
    max_clauses: usize,
    used_clauses: usize,
}

impl QueryClauseCounter {
    fn new(max_clauses: usize) -> Self {
        Self {
            max_clauses,
            used_clauses: 0,
        }
    }

    // Returns how many items can be added without exceeding the limit.
    fn can_add(&self, count: usize) -> usize {
        let remaining = self.max_clauses.saturating_sub(self.used_clauses);
        remaining.min(count)
    }

    // Adds the specified number of clauses and returns how many were actually added.
    // On purpose, we don't check if we've reached the limit here, as we want to
    // be able to add more clauses than the limit.
    fn add(&mut self, count: usize) -> usize {
        let to_add = self.can_add(count);
        self.used_clauses += to_add;
        to_add
    }

    // Returns true if we've used all available clauses.
    fn is_full(&self) -> bool {
        self.used_clauses >= self.max_clauses
    }
}

/// Boost factor applied to exact matches to increase their relevance in search results.
const EXACT_MATCH_BOOST: f32 = 10.0;

/// Boost factor applied to phrase prefix matches (for better prefix matching with punctuation).
const PHRASE_PREFIX_BOOST: f32 = 5.0;

/// Boost factor applied to data sources to increase their relevance in search results.
const DATA_SOURCE_BOOST: f32 = 2.0;

/// Boost factor applied to data source nodes to increase their relevance in search results.
const DATA_SOURCE_NODE_BOOST: f32 = 1.0;

/// Boost factor applied to standard text matches for better relevance calculation.
const STANDARD_TEXT_MATCH_BOOST: f32 = 2.0;

/// Multiplier for exact keyword match boost (applied to EXACT_MATCH_BOOST).
const EXACT_KEYWORD_MATCH_MULTIPLIER: f32 = 2.0;

#[async_trait]
impl SearchStore for ElasticsearchSearchStore {
    async fn search_nodes(
        &self,
        query: Option<String>,
        filter: NodesSearchFilter,
        options: Option<NodesSearchOptions>,
        store: Box<dyn Store + Sync + Send>,
    ) -> Result<(
        Vec<CoreContentNode>,
        u64,
        bool,
        Option<String>,
        Option<SearchWarningCode>,
    )> {
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

        // Validate and build arguments
        let limit = match options.limit {
            Some(0) => return Err(anyhow::anyhow!("Limit cannot be zero")),
            Some(limit) if limit > MAX_PAGE_SIZE => {
                return Err(anyhow::anyhow!(
                    "Limit is greater than MAX_PAGE_SIZE: {} (limit is {})",
                    limit,
                    MAX_PAGE_SIZE
                ))
            }
            Some(limit) => limit,
            None => MAX_PAGE_SIZE,
        };

        // Build search query with potential truncation.
        let (bool_query, indices_to_query, warning_code) =
            self.build_search_node_query(query.clone(), filter, &options)?;

        let sort = match options.sort {
            Some(_) => self.build_search_nodes_sort(options.sort)?,
            None => self.build_relevance_sort(),
        };

        // Build and run search
        let mut search = Search::new()
            .size(options.limit.unwrap_or(MAX_PAGE_SIZE))
            .query(bool_query)
            .track_total_hits(MAX_TOTAL_HITS_TRACKED)
            .indices_boost(DATA_SOURCE_NODE_INDEX_NAME, DATA_SOURCE_NODE_BOOST)
            .indices_boost(DATA_SOURCE_INDEX_NAME, DATA_SOURCE_BOOST)
            .sort(sort);

        if let Some(cursor) = options.cursor {
            let decoded = URL_SAFE.decode(cursor)?;
            let json_str = String::from_utf8(decoded)?;
            let search_after: Vec<serde_json::Value> = serde_json::from_str(&json_str)?;

            // We replace empty strings with a "high sort" sentinel so that documents with
            // an originally empty title will appear at the end of ascending sort order.
            //
            // Elasticsearch's Rust client (or DSL) has trouble when search_after contains "".
            // By substituting a high-Unicode character ("\u{10FFFF}"), we ensure those items
            // sort last without breaking the library's internal validation.
            //
            // Will be removed once we don't have empty strings titles anymore.
            let fixed_sort = search_after
                .iter()
                .map(|v| {
                    if v.as_str() == Some("") {
                        serde_json::Value::String("\u{10FFFF}".to_string())
                    } else {
                        v.clone()
                    }
                })
                .collect::<Vec<_>>();

            search = search.search_after(fixed_sort);
        }

        let search_start = utils::now();
        let response = self
            .client
            .search(SearchParts::Index(&indices_to_query))
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
            warning = warning_code.is_some(),
            "[ElasticsearchSearchStore] Search nodes duration"
        );

        // Parse response and return enriched nodes
        let (items, hit_count, hit_count_is_accurate, next_cursor): (
            Vec<SearchItem>,
            u64,
            bool,
            Option<String>,
        ) = match response.status_code().is_success() {
            true => {
                let response_body = response.json::<serde_json::Value>().await?;
                let hits = response_body["hits"]["hits"].as_array().unwrap();
                // Safe to unwrap because it's always set as per the official documentation.
                let hit_count = response_body["hits"]["total"]["value"].as_u64().unwrap();
                // hits.total.relation can be "eq" or "gte".
                // It indicates whether the count above is an exact count or a lower bound.
                // https://www.elastic.co/guide/en/elasticsearch/reference/current/search-search.html#search-api-response-body
                let hit_count_is_accurate =
                    response_body["hits"]["total"]["relation"].as_str() == Some("eq");

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

                let items: Vec<SearchItem> = hits
                    .iter()
                    .map(|h| SearchItem::from_hit(h))
                    .collect::<Result<Vec<_>>>()?;

                (items, hit_count, hit_count_is_accurate, next_cursor)
            }
            false => {
                let error = response.json::<serde_json::Value>().await?;
                return Err(anyhow::anyhow!("Failed to search nodes: {}", error));
            }
        };

        let compute_node_start = utils::now();
        let result = self.process_search_nodes_results(items, store).await?;
        info!(
            duration = utils::now() - compute_node_start,
            data_source_id = data_source_id,
            data_source_filter = data_source_filter.as_ref().map(|v| v.join(", ")),
            parent_id = parent_id_log,
            node_ids = node_ids_log,
            "[ElasticsearchSearchStore] Compute core content nodes duration"
        );
        Ok((
            result,
            hit_count,
            hit_count_is_accurate,
            next_cursor,
            warning_code,
        ))
    }

    // Data source nodes.
    async fn index_node(&self, node: NodeItem) -> Result<()> {
        match node {
            NodeItem::Document(node) => self.index_document(&node).await,
            NodeItem::Folder(node) => self.index_document(&node).await,
            NodeItem::Table(node) => self.index_document(&node).await,
        }
    }

    async fn delete_node(&self, node: NodeItem) -> Result<()> {
        match node {
            NodeItem::Document(node) => self.delete_document(&node).await,
            NodeItem::Folder(node) => self.delete_document(&node).await,
            NodeItem::Table(node) => self.delete_document(&node).await,
        }
    }

    // Data sources.

    async fn get_data_source_stats(
        &self,
        data_source_ids: Vec<String>,
    ) -> Result<(Vec<DataSourceESDocumentWithStats>, i64)> {
        if data_source_ids.is_empty() {
            return Ok((vec![], 0));
        }

        // Search for data sources first to get their metadata
        let response = self
            .client
            .search(SearchParts::Index(&[DATA_SOURCE_INDEX_NAME]))
            .body(
                Search::new()
                    .query(Query::bool().filter(Query::terms("data_source_id", &data_source_ids)))
                    .size(data_source_ids.len() as u64),
            )
            .send()
            .await?;

        let items: Vec<SearchItem> = match response.status_code().is_success() {
            true => response.json::<serde_json::Value>().await?["hits"]["hits"]
                .as_array()
                .unwrap()
                .iter()
                .map(|h| SearchItem::from_hit(h))
                .collect::<Result<Vec<_>>>()?,
            false => {
                return Err(anyhow::anyhow!(
                    "Failed to search data sources: {}",
                    response.json::<serde_json::Value>().await?
                ));
            }
        };

        // Consistency check: we should find exactly the number of data sources we requested
        // (unless some don't exist, which is valid)
        if items.len() != data_source_ids.len() {
            return Err(anyhow::anyhow!(
                "Found inconsistency between returned data sources ({}) vs requested data sources ({}). This should never happen.",
                items.len(),
                data_source_ids.len()
            ));
        }

        let (stats_map, overall_total_size) = self
            .compute_multiple_data_sources_stats(&data_source_ids)
            .await?;

        // Combine data sources with their stats
        let mut results = Vec::new();
        for item in items {
            if let SearchItem::DataSource(data_source) = item {
                let (total_size, doc_count) = stats_map
                    .get(&data_source.data_source_id)
                    .copied()
                    .unwrap_or((0, 0));

                results.push(DataSourceESDocumentWithStats::from((
                    data_source,
                    total_size,
                    doc_count,
                )));
            }
        }

        Ok((results, overall_total_size))
    }

    async fn index_data_source(&self, data_source: &DataSource) -> Result<()> {
        self.index_document(data_source).await
    }

    async fn delete_data_source(&self, data_source: &DataSource) -> Result<()> {
        // First, delete the data source nodes.
        let response = self
            .client
            .delete_by_query(DeleteByQueryParts::Index(&[DATA_SOURCE_NODE_INDEX_NAME]))
            .body(json!({
                "query": {
                    "term": { "data_source_id": data_source.data_source_id() }
                }
            }))
            .send()
            .await?;

        if !response.status_code().is_success() {
            let error = response.json::<serde_json::Value>().await?;
            return Err(anyhow::anyhow!(
                "Failed to delete data source nodes {}",
                error
            ));
        }

        // Then, delete the data source document.
        self.delete_document(data_source).await
    }

    async fn search_tags(
        &self,
        query: Option<String>,
        query_type: Option<TagsQueryType>,
        data_source_views: Vec<DatasourceViewFilter>,
        node_ids: Option<Vec<String>>,
        limit: Option<u64>,
    ) -> Result<Vec<(String, u64, Vec<(String, u64)>)>> {
        let query_type = query_type.unwrap_or(TagsQueryType::Exact);

        // check there is at least one data source view filter
        // !! do not remove; without data source view filter this endpoint is
        // dangerous as any data from any workspace can be retrieved
        if data_source_views.is_empty() {
            return Err(anyhow::anyhow!("No data source views provided"));
        }

        let bool_query = Query::bool().filter(
            Query::bool()
                .should(
                    data_source_views
                        .into_iter()
                        .map(|f| {
                            let mut bool_query = Query::bool();

                            bool_query =
                                bool_query.filter(Query::term("data_source_id", f.data_source_id));

                            if !f.view_filter.is_empty() {
                                bool_query =
                                    bool_query.filter(Query::terms("parents", f.view_filter));
                            }

                            Query::Bool(bool_query)
                        })
                        .collect::<Vec<_>>(),
                )
                .minimum_should_match(1),
        );

        let bool_query = match node_ids {
            None => bool_query,
            Some(node_ids) => bool_query.filter(Query::terms("node_id", node_ids)),
        };
        let bool_query = match query.clone() {
            None => bool_query,
            Some(query) => match query_type {
                TagsQueryType::Exact => bool_query.filter(Query::term("tags.keyword", query)),
                TagsQueryType::Prefix => bool_query.must(Query::match_phrase("tags.edge", query)),
                TagsQueryType::Match => bool_query.must(Query::r#match("tags.edge", query)),
            },
        };
        let aggregate = Aggregation::terms("tags.keyword");
        let aggregate = match query.clone() {
            None => aggregate,
            Some(p) => match query_type {
                TagsQueryType::Exact => aggregate.include(p),
                // Prefix/match will be filtered in the code, as it needs to be filtered case insensitive
                TagsQueryType::Prefix => aggregate,
                TagsQueryType::Match => aggregate,
            },
        };
        let aggregate =
            aggregate.aggregate("tags_in_datasource", Aggregation::terms("data_source_id"));
        let search = Search::new().size(0).query(bool_query).aggregate(
            "unique_tags",
            aggregate.size(limit.unwrap_or(DEFAULT_TAG_AGGREGATION_SIZE_LIMIT)),
        );

        let response = self
            .client
            .search(SearchParts::Index(&[DATA_SOURCE_NODE_INDEX_NAME]))
            .body(search)
            .send()
            .await?;

        // Parse response and return tags
        match response.status_code().is_success() {
            true => {
                let response_body = response.json::<serde_json::Value>().await?;
                Ok(response_body["aggregations"]["unique_tags"]["buckets"]
                    .as_array()
                    .unwrap_or(&vec![])
                    .iter()
                    .filter_map(|bucket| {
                        bucket["key"]
                            .as_str()
                            .map(|key| {
                                match query_type {
                                    // For prefix/match query - only include if key matches query (case insensitive)
                                    TagsQueryType::Prefix => {
                                        if let Some(q) = query.as_ref() {
                                            if !key.to_lowercase().starts_with(&q.to_lowercase()) {
                                                return None;
                                            }
                                        }
                                    }
                                    TagsQueryType::Match => {
                                        if let Some(q) = query.as_ref() {
                                            if !key.to_lowercase().contains(&q.to_lowercase()) {
                                                return None;
                                            }
                                        }
                                    }

                                    // Exact query is already filtered in the aggregation
                                    TagsQueryType::Exact => {}
                                }

                                Some((
                                    key.to_string(),
                                    bucket["doc_count"].as_u64().unwrap_or(0),
                                    bucket["tags_in_datasource"]["buckets"]
                                        .as_array()
                                        .unwrap_or(&vec![])
                                        .iter()
                                        .filter_map(|bucket| {
                                            bucket["key"].as_str().map(|key| {
                                                (
                                                    key.to_string(),
                                                    bucket["doc_count"].as_u64().unwrap_or(0),
                                                )
                                            })
                                        })
                                        .collect::<Vec<(String, u64)>>(),
                                ))
                            })
                            .flatten()
                    })
                    .collect())
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
    fn build_search_node_query(
        &self,
        query: Option<String>,
        filter: NodesSearchFilter,
        options: &NodesSearchOptions,
    ) -> Result<(BoolQuery, Vec<&str>, Option<SearchWarningCode>)> {
        let mut indices_to_query = vec![];

        // Check there is at least one data source view filter
        // !! do not remove; without data source view filter this endpoint is
        // dangerous as any data from any workspace can be retrieved.
        if filter.data_source_views.is_empty() {
            return Err(anyhow::anyhow!("No data source views provided"));
        }

        let mut should_queries = vec![];

        // Best-effort counter to avoid exceeding the max number of clauses.
        let mut counter = QueryClauseCounter::new(MAX_ES_QUERY_CLAUSES);
        let mut warning_code = None;

        // Add the outer bool query with should clause.
        counter.add(1);

        // Queries on DATA_SOURCE_INDEX_NAME are prioritized over queries on
        // DATA_SOURCE_NODE_INDEX_NAME, if we run out of clauses.
        if filter.data_source_views.iter().any(|f| {
            matches!(
                f.search_scope,
                SearchScopeType::DataSourceName | SearchScopeType::Both
            )
        }) {
            let data_sources_query = Query::bool()
                .filter(Query::term("_index", DATA_SOURCE_INDEX_NAME))
                .must(self.build_data_sources_content_query(&query, &filter, &mut counter)?);

            should_queries.push(data_sources_query);
            indices_to_query.push(DATA_SOURCE_INDEX_NAME);
        }

        // Build nodes query only if we have clauses left and the scope is NodesTitles or Both.
        if !counter.is_full()
            && filter.data_source_views.iter().any(|f| {
                matches!(
                    f.search_scope,
                    SearchScopeType::NodesTitles | SearchScopeType::Both
                )
            })
        {
            let nodes_query = Query::bool()
                .filter(Query::term("_index", DATA_SOURCE_NODE_INDEX_NAME))
                .filter(self.build_nodes_content_query(&query, &filter, options, &mut counter)?);

            should_queries.push(nodes_query);
            indices_to_query.push(DATA_SOURCE_NODE_INDEX_NAME);
        }

        // If we've used all available clauses or had to skip any queries, set the warning code.
        if counter.is_full() {
            warning_code = Some(SearchWarningCode::TruncatedQueryClauses);
        }

        let bool_query = Query::bool().should(should_queries).minimum_should_match(1);

        Ok((bool_query, indices_to_query, warning_code))
    }

    /// On the data source index, we only want to add a clause if the search scope is
    /// DataSourceName or Both. On the data source node index, we only want to add a clause
    /// if the search scope is NodesTitles or Both.
    fn should_add_data_source_clause(
        &self,
        filter: &DatasourceViewFilter,
        index_name: &str,
    ) -> bool {
        match (filter.search_scope, index_name) {
            (SearchScopeType::DataSourceName | SearchScopeType::Both, DATA_SOURCE_INDEX_NAME) => {
                true
            }
            (SearchScopeType::NodesTitles | SearchScopeType::Both, DATA_SOURCE_NODE_INDEX_NAME) => {
                true
            }
            _ => false,
        }
    }

    fn build_shared_permission_filter(
        &self,
        filter: &NodesSearchFilter,
        index_name: &str,
        counter: &mut QueryClauseCounter,
    ) -> BoolQuery {
        let filter_conditions: Vec<Query> = filter
            .data_source_views
            .clone()
            .into_iter()
            .filter_map(|f| {
                // Skip adding this data source view to the filter when we've reached the clause limit.
                // This effectively truncates the query without adding any new clauses.
                if counter.is_full() || !self.should_add_data_source_clause(&f, index_name) {
                    return None;
                }

                counter.add(1);
                let mut bool_query =
                    Query::bool().filter(Query::term("data_source_id", f.data_source_id.clone()));

                // Only add parents filter if the index supports it.
                if index_name == DATA_SOURCE_NODE_INDEX_NAME && !f.view_filter.is_empty() {
                    counter.add(1);
                    bool_query = bool_query.filter(Query::terms("parents", f.view_filter.clone()));
                }

                // Apply additional filter if present (in addition to view_filter).
                if let Some(ref filter) = f.filter {
                    if index_name == DATA_SOURCE_NODE_INDEX_NAME && !filter.is_empty() && !counter.is_full() {
                        counter.add(1);
                        bool_query = bool_query.filter(Query::terms("parents", filter.clone()));
                    }
                }

                Some(Query::Bool(bool_query))
            })
            .collect();

        counter.add(1);
        Query::bool()
            .should(filter_conditions)
            .minimum_should_match(1)
    }

    fn build_match_query(
        &self,
        field: &str,
        query: &str,
        counter: &mut QueryClauseCounter,
    ) -> Result<BoolQuery> {
        let edge_field = format!("{}.edge", field);
        let keyword_field = format!("{}.keyword", field);

        // Check if the query contains punctuation that might be split by word_delimiter
        let contains_punctuation = query
            .chars()
            .any(|c| !c.is_alphanumeric() && !c.is_whitespace());

        let mut should_queries = vec![
            // Primary match using edge n-grams for partial matching.
            // - Uses the `.edge` analyzer for prefix matching on terms.
            // - All terms must be present when operator is AND.
            // - Terms can appear in any order.
            // - Enables search-as-you-type behavior.
            Query::from(Query::r#match(edge_field.clone(), query).operator(Operator::And)),
            // Standard text match for better relevance calculation
            // - Uses standard analyzer without edge n-grams
            // - Helps with scoring when terms are complete words
            Query::from(
                Query::r#match(field, query)
                    .operator(Operator::And)
                    .boost(STANDARD_TEXT_MATCH_BOOST),
            ),
            // Exact phrase match for higher relevance.
            // - Requires terms to appear in exact order
            // - Gives higher score (EXACT_MATCH_BOOST) for exact matches
            // - Stricter matching than regular match query
            // - Perfect for catching exact title matches.
            Query::from(Query::r#match_phrase(field, query).boost(EXACT_MATCH_BOOST)),
            // Exact keyword match for perfect exact matches (case insensitive)
            // - Uses term query on keyword field with lowercase
            // - Highest boost for exact title matches
            Query::from(
                Query::term(keyword_field, query.to_lowercase())
                    .boost(EXACT_MATCH_BOOST * EXACT_KEYWORD_MATCH_MULTIPLIER),
            ),
        ];

        // If query contains punctuation, also try matching as a phrase on edge field
        // This helps "hello.w" match "hello.world" by treating it as a phrase prefix
        if contains_punctuation {
            counter.add(1);
            should_queries.push(Query::from(
                Query::r#match_phrase(edge_field, query).boost(PHRASE_PREFIX_BOOST),
            ));
        }

        counter.add(4);

        Ok(Query::bool().should(should_queries).minimum_should_match(1))
    }

    fn build_data_sources_content_query(
        &self,
        query: &Option<String>,
        filter: &NodesSearchFilter,
        counter: &mut QueryClauseCounter,
    ) -> Result<BoolQuery> {
        if let Some(_) = &filter.node_ids {
            return Err(anyhow::anyhow!(
                "The `node_ids` filter should not be used in conjunction with search in the datasources index, since datasources do not have nodeIds. Use `nodes_title` search scope to avoid searching this index, or remove the `node_ids` filter."
            ));
        }

        let mut bool_query = Query::bool()
            // Data sources don't support parents.
            .filter(self.build_shared_permission_filter(filter, DATA_SOURCE_INDEX_NAME, counter));

        // Add search term if present.
        if let Some(query_string) = query {
            // A match query counts as 1 clause.
            counter.add(1);

            bool_query = bool_query.must(self.build_match_query("name", &query_string, counter)?);
        }

        Ok(bool_query)
    }

    fn build_nodes_content_query(
        &self,
        query: &Option<String>,
        filter: &NodesSearchFilter,
        options: &NodesSearchOptions,
        counter: &mut QueryClauseCounter,
    ) -> Result<BoolQuery> {
        let mut bool_query = Query::bool().filter(self.build_shared_permission_filter(
            filter,
            DATA_SOURCE_NODE_INDEX_NAME,
            counter,
        ));

        if let Some(node_ids) = &filter.node_ids {
            counter.add(1);
            bool_query = bool_query.filter(Query::terms("node_id", node_ids));
        }

        if let Some(node_types) = &filter.node_types {
            let terms: Vec<String> = node_types
                .iter()
                .flat_map(|nt| vec![nt.to_string(), nt.to_string().to_lowercase()])
                .collect();
            counter.add(1);
            bool_query = bool_query.filter(Query::terms("node_type", terms));
        }

        if let Some(mime_type_filter) = &filter.mime_types {
            if let Some(included_mime_types) = &mime_type_filter.is_in {
                counter.add(1);
                bool_query = bool_query.filter(Query::terms("mime_type", included_mime_types))
            }
            if let Some(excluded_mime_types) = &mime_type_filter.is_not {
                counter.add(1);
                bool_query = bool_query.must_not(Query::terms("mime_type", excluded_mime_types))
            }
        }

        if let Some(parent_id) = &filter.parent_id {
            // if parent_id is root, we filter on all nodes whose parent_id is null
            // otherwise, we filter on all nodes whose parent_id is the given parent_id.
            counter.add(1);
            if parent_id == ROOT_PARENT_ID {
                bool_query = bool_query.filter(Query::bool().must_not(Query::exists("parent_id")));
            } else {
                bool_query = bool_query.filter(Query::term("parent_id", parent_id));
            }
        }

        // Add search term if present.
        if let Some(query_string) = query.clone() {
            counter.add(1);
            let mut search_bool =
                Query::bool().should(self.build_match_query("title", &query_string, counter)?);

            // Only add source_url filter if search_source_urls is true
            // This creates an OR between title and source_url matches.
            if options.search_source_urls.unwrap_or(false) {
                counter.add(1);
                search_bool = search_bool.should(Query::term("source_url", query_string));
            }

            bool_query = bool_query.must(search_bool.minimum_should_match(1));
        }

        Ok(bool_query)
    }

    // Enrich search results with children counts and parent titles.

    async fn process_search_nodes_results(
        &self,
        items: Vec<SearchItem>,
        store: Box<dyn Store + Sync + Send>,
    ) -> Result<Vec<CoreContentNode>> {
        if items.len() as u64 > MAX_PAGE_SIZE {
            return Err(anyhow::anyhow!(
                "Too many items to process: {} (limit is {})",
                items.len(),
                MAX_PAGE_SIZE
            ));
        }

        // Split items while preserving order.
        let mut result = Vec::with_capacity(items.len());
        let mut nodes_to_process = Vec::new();
        let mut position_map = HashMap::new();

        // Separate data sources and nodes.
        for (pos, item) in items.into_iter().enumerate() {
            match item {
                SearchItem::DataSource(data_source) => {
                    result.push((
                        pos,
                        CoreContentNode::from_es_data_source_document(data_source),
                    ));
                }
                SearchItem::Node(node) => {
                    position_map.insert(node.node_id.clone(), pos);
                    nodes_to_process.push(node);
                }
            }
        }

        // Process regular nodes if any exist.
        if !nodes_to_process.is_empty() {
            let processed_nodes = self
                .compute_core_content_nodes(nodes_to_process, store)
                .await?;

            // Add processed nodes with their original positions
            for node in processed_nodes {
                let pos = position_map[&node.base.node_id];
                result.push((pos, node));
            }
        }

        // Restore original order.
        result.sort_by_key(|(pos, _)| *pos);
        Ok(result.into_iter().map(|(_, node)| node).collect())
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
        nodes: Vec<NodeESDocument>,
        store: Box<dyn Store + Sync + Send>,
    ) -> Result<Vec<CoreContentNode>> {
        // Count children using store.
        let count_start = utils::now();
        let children_count_map = store.count_nodes_children(&nodes).await?;
        let count_duration = utils::now() - count_start;
        info!(
            duration = count_duration,
            "[ElasticsearchSearchStore] Count children duration"
        );

        // Build parent titles query.
        let mut parent_ids = HashSet::new();
        let mut data_source_ids = HashSet::new();

        // Collect distinct parent IDs and data source internal IDs.
        for node in nodes.iter() {
            if let Some(parent_id) = &node.parent_id {
                parent_ids.insert(parent_id);
                data_source_ids.insert(&node.data_source_internal_id);
            }
        }

        // Convert to vectors.
        let parent_ids: Vec<_> = parent_ids.into_iter().collect();
        let data_source_ids: Vec<_> = data_source_ids.into_iter().collect();

        // Scope the query to the internal data source ids of the nodes to avoid leaking data
        // from other data sources.
        let parent_titles_search = Search::new()
            .query(Query::bool().filter(vec![
                Query::terms("node_id", parent_ids),
                Query::terms("data_source_internal_id", data_source_ids),
            ]))
            .source(vec!["data_source_internal_id", "node_id", "title"]);

        let parent_titles_response = self
            .client
            .search(SearchParts::Index(&[DATA_SOURCE_NODE_INDEX_NAME]))
            .body(parent_titles_search)
            .send()
            .await?;

        // Process parent titles results
        let parent_titles_map: HashMap<(String, String), String> =
            if parent_titles_response.status_code().is_success() {
                let response_body = parent_titles_response.json::<serde_json::Value>().await?;
                response_body["hits"]["hits"]
                    .as_array()
                    .map(|hits| {
                        hits.iter()
                            .filter_map(|hit| {
                                let node_id = hit["_source"]["node_id"].as_str()?;
                                let ds_id = hit["_source"]["data_source_internal_id"].as_str()?;
                                let title = hit["_source"]["title"].as_str()?;
                                Some(((node_id.to_string(), ds_id.to_string()), title.to_string()))
                            })
                            .collect()
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
                    .map(|pid| (pid.clone(), node.data_source_internal_id.clone()))
                    .and_then(|key| parent_titles_map.get(&key))
                    .cloned();

                CoreContentNode::new(node, children_count, parent_title)
            })
            .collect();

        Ok(core_content_nodes)
    }

    // Always add node_id as a tie-breaker
    fn build_search_nodes_sort(&self, sort: Option<Vec<SortSpec>>) -> Result<Vec<Sort>> {
        let mut base_sort = match sort {
            Some(sort) => {
                if sort.iter().any(|s| s.field == "node_id") {
                    return Err(anyhow::anyhow!(
                        "Explicit sort on node_id is not allowed, it is used as a tie-breaker"
                    ));
                }

                sort.into_iter()
                    .map(|s| {
                        Sort::FieldSort(
                            FieldSort::new(map_sort_field(&s.field))
                                .order(match s.direction {
                                    SortDirection::Asc => SortOrder::Asc,
                                    SortDirection::Desc => SortOrder::Desc,
                                })
                                .missing(SortMissing::Last)
                                .unmapped_type("keyword"),
                        )
                    })
                    .collect()
            }
            // Default to sorting folders first, then both documents and tables
            // and alphabetically by title (or data source name )
            None => vec![
                Sort::ScriptSort(
                    ScriptSort::ascending(Script::source(
                        "doc.containsKey('node_type') && doc['node_type'].size() > 0 && doc['node_type'].value == 'Folder' ? 0 : 1",
                    ))
                    .r#type(ScriptSortType::Number),
                ),
                Sort::FieldSort(
                    FieldSort::new("title.keyword")
                        .order(SortOrder::Asc)
                        .missing(SortMissing::Last)
                        .unmapped_type("keyword")
                ),
            ],
        };

        base_sort.push(Sort::FieldSort(
            FieldSort::new("node_id")
                .order(SortOrder::Asc)
                .missing(SortMissing::Last)
                .unmapped_type("keyword"),
        ));

        base_sort.push(Sort::FieldSort(
            FieldSort::new("data_source_internal_id").order(SortOrder::Asc),
        ));

        Ok(base_sort)
    }

    fn build_relevance_sort(&self) -> Vec<Sort> {
        vec![
            Sort::FieldSort(FieldSort::new("_score").order(SortOrder::Desc)),
            Sort::ScriptSort(
                ScriptSort::ascending(Script::source(
                    format!("doc['_index'].value.startsWith('{}') ? doc['node_id'].value : doc['data_source_id'].value",
                            DATA_SOURCE_NODE_INDEX_NAME)
                ))
                .r#type(ScriptSortType::String)
            ),
        ]
    }

    async fn compute_multiple_data_sources_stats(
        &self,
        data_source_ids: &[String],
    ) -> Result<(HashMap<String, (i64, i64)>, i64)> {
        let stats_response = self
            .client
            .search(SearchParts::Index(&[DATA_SOURCE_NODE_INDEX_NAME]))
            .body(
                Search::new()
                    .size(0)
                    .query(Query::terms("data_source_id", data_source_ids))
                    .aggregate(
                        "data_sources",
                        Aggregation::terms("data_source_id")
                            .size(data_source_ids.len() as u64)
                            .aggregate("total_size", Aggregation::sum("text_size")),
                    )
                    .aggregate("total_size", Aggregation::sum("text_size")),
            )
            .send()
            .await?;

        let stats_body = match stats_response.status_code().is_success() {
            true => stats_response.json::<serde_json::Value>().await?,
            false => {
                return Err(anyhow::anyhow!(
                    "Failed to get data source stats: {}",
                    stats_response.json::<serde_json::Value>().await?
                ));
            }
        };

        // Build a map of data_source_id -> (total_size, doc_count)
        let mut stats_map = HashMap::new();
        if let Some(buckets) = stats_body["aggregations"]["data_sources"]["buckets"].as_array() {
            for bucket in buckets {
                if let Some(data_source_id) = bucket["key"].as_str() {
                    let doc_count = bucket["doc_count"].as_i64().unwrap_or(0);
                    let total_size = bucket["total_size"]["value"]
                        .as_f64()
                        .unwrap_or(0.0)
                        .round() as i64;
                    stats_map.insert(data_source_id.to_string(), (total_size, doc_count));
                }
            }
        }

        // Extract the overall total_size from aggregations
        let overall_total_size = stats_body["aggregations"]["total_size"]["value"]
            .as_f64()
            .unwrap_or(0.0)
            .round() as i64;

        Ok((stats_map, overall_total_size))
    }

    // Generic document methods.

    pub async fn index_document<T>(&self, doc: &T) -> Result<()>
    where
        T: Indexable,
    {
        let now = utils::now();
        let r = doc.to_document();

        let response = self
            .client
            .index(IndexParts::IndexId(doc.index_name(), &doc.unique_id()))
            .timeout("200ms")
            .body(r)
            .send()
            .await?;

        match response.status_code().is_success() {
            true => {
                info!(
                    duration = utils::now() - now,
                    document_id = doc.unique_id(),
                    "[ElasticsearchSearchStore] Indexed {}",
                    doc.document_type()
                );
                Ok(())
            }
            false => {
                let error = response.json::<serde_json::Value>().await?;
                error!(
                    error = %error,
                    duration = utils::now() - now,
                    document_id = doc.unique_id(),
                    "[ElasticsearchSearchStore] Failed to index {}",
                    doc.document_type()
                );
                Err(anyhow::anyhow!(
                    "Failed to index {} {}",
                    doc.document_type(),
                    error
                ))
            }
        }
    }

    pub async fn delete_document<T>(&self, doc: &T) -> Result<()>
    where
        T: Indexable,
    {
        let response = self
            .client
            .delete(DeleteParts::IndexId(doc.index_name(), &doc.unique_id()))
            .send()
            .await?;

        match response.status_code().is_success() {
            true => Ok(()),
            false => {
                let error = response.json::<serde_json::Value>().await?;
                if error["result"] == "not_found" {
                    info!(
                        globally_unique_id = doc.unique_id(),
                        "[ElasticsearchSearchStore] Delete {} on non-existent document",
                        doc.document_type()
                    );
                    Ok(())
                } else {
                    Err(anyhow::anyhow!(
                        "Failed to delete {} {}",
                        doc.document_type(),
                        error
                    ))
                }
            }
        }
    }
}

pub trait Indexable {
    // Associated type that the Indexable will serialize into for ES.
    type Doc: Serialize;

    // The index name to use in ES for this type.
    fn index_name(&self) -> &'static str;

    // The unique doc ID in ES.
    fn unique_id(&self) -> String;

    // How to log the type in error messages, logs, etc.
    fn document_type(&self) -> &'static str;

    // Produce the actual document that will be serialized to ES.
    fn to_document(&self) -> Self::Doc;
}
