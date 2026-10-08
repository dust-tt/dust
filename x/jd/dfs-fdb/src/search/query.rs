use super::{elastic::Elastic, index_name};
use crate::{
    engine::{Engine, indexing::Document, search::SearchSnapshot},
    model::{READ, ViewNode},
};
use anyhow::{Context, Result, ensure};
use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{collections::BTreeMap, sync::Arc, time::Duration};
use tokio::sync::Semaphore;

pub use crate::engine::search::Authority;

#[derive(Clone, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum Query {
    All,
    Node { id: String },
    Exact { value: String },
    Prefix { value: String },
    Substring { value: String },
    Match { terms: String },
    Phrase { terms: String },
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Request {
    pub query: Query,
    #[serde(default = "default_k")]
    pub k: usize,
    #[serde(default)]
    pub offset: usize,
    #[serde(default)]
    pub include_text: bool,
    #[serde(default)]
    pub kind: Option<String>,
}

fn default_k() -> usize {
    20
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Response {
    pub rows: Vec<Value>,
    pub dfs: Value,
}

impl Request {
    pub fn validate(&self, table: &str) -> Result<()> {
        ensure!(matches!(table, "nodes" | "documents"), "unknown table");
        ensure!(
            self.k > 0 && self.k <= 100 && self.offset <= 10_000,
            "query bounds"
        );
        ensure!(
            self.kind
                .as_deref()
                .is_none_or(|k| matches!(k, "file" | "directory")),
            "invalid kind"
        );
        ensure!(
            !self.include_text || table == "documents",
            "text requires documents"
        );
        let value = match &self.query {
            Query::All => "",
            Query::Node { id } => id,
            Query::Exact { value } | Query::Prefix { value } | Query::Substring { value } => value,
            Query::Match { terms } | Query::Phrase { terms } => terms,
        };
        ensure!(
            value.len() <= 4096 && (matches!(self.query, Query::All) || !value.is_empty()),
            "query length"
        );
        ensure!(
            if table == "documents" {
                !matches!(self.query, Query::Exact { .. } | Query::Prefix { .. })
            } else {
                !matches!(self.query, Query::Match { .. } | Query::Phrase { .. })
            },
            "unsupported query for table"
        );
        Ok(())
    }

    fn predicate(&self, table: &str) -> Value {
        let predicate = match &self.query {
            Query::All => json!({"match_all":{}}),
            Query::Substring { value } => {
                let mut pattern = String::from("*");
                for character in value.chars() {
                    if matches!(character, '*' | '?' | '\\') {
                        pattern.push('\\');
                    }
                    pattern.push(character);
                }
                pattern.push('*');
                let field = if table == "documents" {
                    "text.literal"
                } else {
                    "basename"
                };
                json!({"wildcard":{(field):{"value":pattern,"case_insensitive":false}}})
            }
            Query::Node { id } => json!({"term":{"node_id":id}}),
            Query::Exact { value } => json!({"term":{"basename":value}}),
            Query::Prefix { value } => json!({"prefix":{"basename":value}}),
            Query::Match { terms } => json!({"match":{"text":{"query":terms,"operator":"and"}}}),
            Query::Phrase { terms } => json!({"match_phrase":{"text":terms}}),
        };
        let mut filters = vec![json!({"term":{"deleted":false}})];
        if table == "documents" {
            filters.push(json!({"term":{"content_status":"indexed"}}));
        }
        if let Some(kind) = &self.kind {
            filters.push(json!({"term":{"kind":kind}}));
        }
        json!({"bool":{"must":[predicate],"filter":filters}})
    }
}

pub struct Search {
    engine: Arc<Engine>,
    elastic: Elastic,
    admission: Semaphore,
}

impl Search {
    pub fn new(engine: Arc<Engine>, endpoints: Vec<String>) -> Result<Self> {
        Ok(Self {
            engine,
            elastic: Elastic::new(endpoints)?,
            admission: Semaphore::new(8),
        })
    }

    pub async fn query(
        &self,
        authority: Authority<'_>,
        workspace: &str,
        table: &str,
        request: &Request,
    ) -> Result<Response> {
        request.validate(table)?;
        let _permit = self
            .admission
            .try_acquire()
            .map_err(|_| crate::model::err(libc::EAGAIN, "search admission"))?;
        tokio::time::timeout(
            Duration::from_secs(30),
            self.run(authority, workspace, table, request),
        )
        .await?
    }

    async fn run(
        &self,
        authority: Authority<'_>,
        workspace: &str,
        table: &str,
        request: &Request,
    ) -> Result<Response> {
        let source = self.engine.search_snapshot(authority).await?;
        if source.session().tenant != workspace {
            return Err(crate::model::err(libc::ENOENT, "workspace absent").into());
        }
        let index = index_name(&self.engine.incarnation, workspace)?;
        let uuid = self.elastic.index_uuid(&index).await?;
        let checkpoint = source.checkpoint.as_ref().filter(|c| c.uuid == uuid);
        let Some(checkpoint) = checkpoint else {
            return Ok(response(Vec::new(), None, source.head(), true));
        };
        ensure!(
            checkpoint.head <= source.head(),
            "invalid search checkpoint"
        );
        let (status, opened) = self
            .elastic
            .request(
                Method::POST,
                &format!("{index}/_pit?keep_alive=1m&allow_partial_search_results=false"),
                Vec::new(),
            )
            .await?;
        ensure!(status.is_success(), "search snapshot unavailable");
        let mut pit = opened["id"]
            .as_str()
            .context("missing search snapshot")?
            .to_owned();
        let result = self
            .scan(authority, table, request, &source, &index, &uuid, &mut pit)
            .await;
        let _ = tokio::time::timeout(
            Duration::from_secs(2),
            self.elastic.request(
                Method::DELETE,
                "_pit",
                serde_json::to_vec(&json!({"id":pit}))?,
            ),
        )
        .await;
        result
    }

    async fn page(&self, pit: &mut String, mut body: Value) -> Result<Vec<Value>> {
        body["pit"] = json!({"id":pit,"keep_alive":"1m"});
        body["timeout"] = json!("5s");
        body["track_total_hits"] = json!(false);
        let (status, result) = self
            .elastic
            .request(
                Method::POST,
                "_search?allow_partial_search_results=false",
                serde_json::to_vec(&body)?,
            )
            .await?;
        ensure!(
            status.is_success()
                && result["timed_out"] == false
                && result["_shards"]["failed"].as_u64() == Some(0),
            "incomplete Elasticsearch search"
        );
        if let Some(next) = result["pit_id"].as_str() {
            *pit = next.to_owned();
        }
        Ok(result["hits"]["hits"]
            .as_array()
            .context("missing search hits")?
            .clone())
    }

    #[allow(clippy::too_many_arguments)]
    async fn scan(
        &self,
        authority: Authority<'_>,
        table: &str,
        request: &Request,
        source: &SearchSnapshot,
        index: &str,
        uuid: &str,
        pit: &mut String,
    ) -> Result<Response> {
        let body_query = table == "documents";
        let mut rows = Vec::new();
        let through = source.checkpoint.as_ref().map(|c| c.head);
        let mut incomplete = through != Some(source.head());
        let mut after: Option<Value> = None;
        let mut visited = 0;
        let mut accepted = 0;
        let mut bytes: usize = 0;
        loop {
            let mut query = json!({"size":100,"query":request.predicate(table),
                "sort":[{"_score":"desc"},{"node_id":"asc"}],"_source":{"excludes":["text"]}});
            if let Some(after) = &after {
                query["search_after"] = after.clone();
            }
            let hits = self.page(pit, query).await?;
            ensure!(hits.len() <= 100, "search page capacity");
            if hits.is_empty() {
                break;
            }
            after = Some(hits.last().context("missing search hit")?["sort"].clone());
            let documents: Vec<Document> = hits
                .iter()
                .map(|hit| serde_json::from_value(hit["_source"].clone()))
                .collect::<std::result::Result<_, _>>()?;
            let ids = documents
                .iter()
                .map(|d| d.node_id.clone())
                .collect::<Vec<_>>();
            let visible = self.engine.search_candidates(source, &ids).await?;
            let visible: BTreeMap<_, _> = visible
                .nodes
                .into_iter()
                .map(|n| (n.node.id.clone(), n))
                .collect();
            for (document, hit) in documents.iter().zip(&hits) {
                visited += 1;
                let Some(current) = visible.get(&document.node_id) else {
                    continue;
                };
                if body_query && current.verbs & READ == 0 {
                    continue;
                }
                if !matches_current(document, current) {
                    incomplete = true;
                    continue;
                }
                if let Query::Substring { value } = &request.query
                    && !body_query
                    && !document.basename.contains(value)
                {
                    continue;
                }
                let needs_text = body_query
                    && (request.include_text || matches!(request.query, Query::Substring { .. }));
                let text = if needs_text {
                    let hits = self
                        .page(
                            pit,
                            json!({"size":1,
                        "query":{"term":{"node_id":document.node_id}},"_source":["text"]}),
                        )
                        .await?;
                    ensure!(hits.len() == 1, "search content absent");
                    let text = hits[0]["_source"]["text"]
                        .as_str()
                        .context("search text absent")?;
                    ensure!(
                        text.len() <= super::super::engine::indexing::MAX_TEXT_BYTES as usize,
                        "search text capacity"
                    );
                    if let Query::Substring { value } = &request.query
                        && !text.contains(value)
                    {
                        continue;
                    }
                    Some(text.to_owned())
                } else {
                    None
                };
                accepted += 1;
                if accepted <= request.offset {
                    continue;
                }
                let mut row = if body_query {
                    json!({"node_id":document.node_id,"source_version":document.source_version,"_score":hit["_score"]})
                } else {
                    json!({"node_id":document.node_id,"source_version":document.source_version,
                        "basename":current.visible_name,"kind":document.kind,"size":document.size,
                        "mtime_ms":document.mtime_ms,"content_status":document.content_status})
                };
                if request.include_text {
                    row["text"] = json!(text);
                }
                bytes = bytes.saturating_add(serde_json::to_vec(&row)?.len());
                ensure!(bytes <= (16 << 20) - 4096, "search response capacity");
                rows.push(row);
                if rows.len() == request.k {
                    break;
                }
            }
            if rows.len() == request.k || hits.len() < 100 {
                break;
            }
            if visited >= 10_100 {
                incomplete = true;
                break;
            }
        }
        ensure!(
            self.elastic.index_uuid(index).await? == uuid,
            "search index replaced"
        );
        let current = self.engine.search_snapshot(authority).await?;
        if current.head() != source.head()
            || current.auth_generation() != source.auth_generation()
            || current.session().principal != source.session().principal
            || current.session().scope != source.session().scope
            || current.session().admin != source.session().admin
        {
            rows.clear();
            incomplete = true;
        }
        Ok(response(rows, through, source.head(), incomplete))
    }
}

fn matches_current(document: &Document, current: &ViewNode) -> bool {
    !document.deleted
        && document.source_version == current.node.version
        && document.entry_token == current.node.entry_token
        && document.size == current.node.size
        && document.mtime_ms == current.node.mtime_ms
}

fn response(rows: Vec<Value>, through: Option<u64>, head: u64, incomplete: bool) -> Response {
    Response {
        rows,
        dfs: json!({"engine":"elasticsearch","indexed_through":through,
        "source_head":head,"incomplete":incomplete}),
    }
}
