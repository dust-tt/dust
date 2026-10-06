use super::{Search, index};
use crate::{State, model::Record, read::View};
use dfs_protocol::{MAX_IO, error::status, rpc::*};
use reqwest::Method;
use serde_json::{Value, json};
use std::{
    collections::{BTreeSet, HashMap, HashSet},
    sync::Arc,
    time::Duration,
};
use tokio::time::{Instant, timeout, timeout_at};
use tonic::{Code, Status};

/// @cc [owner:spolu,label:security;performance] request-local-authorization
/// This cache MUST belong to one search with one immutable View. It MUST NOT survive the request or
/// be reused with other grants/snapshots. Exceeding its byte/entry budget MUST stop candidate evaluation.
struct Authorization {
    view: View,
    records: HashMap<String, Arc<Record>>,
    access: HashMap<String, bool>,
    bytes: usize,
    grant_checks: usize,
}
impl Authorization {
    async fn record(&mut self, id: &str) -> Result<Arc<Record>, Status> {
        if let Some(record) = self.records.get(id) {
            return Ok(record.clone());
        }
        let record = Arc::new(self.view.object(id).await?);
        let size = object_size(&record.object) + 512;
        if self.records.len() >= 8192 || self.bytes + size > 16 * 1024 * 1024 {
            return Err(status(ErrorCode::Capacity));
        }
        self.bytes += size;
        self.records.insert(id.to_owned(), record.clone());
        Ok(record)
    }
    async fn allowed(&mut self, mut record: Arc<Record>) -> Result<bool, Status> {
        let mut path = Vec::new();
        let mut visited = HashSet::new();
        let allowed = loop {
            let id = &record.object.id;
            if !visited.insert(id.clone()) || visited.len() > 4096 {
                return Err(status(ErrorCode::Unavailable));
            }
            if let Some(allowed) = self.access.get(id) {
                break *allowed;
            }
            path.push(id.clone());
            if record
                .parent
                .as_ref()
                .is_some_and(|parent| self.access.get(&parent.id) == Some(&true))
            {
                break true;
            }
            self.grant_checks += 1;
            if self.view.attached(id).await? {
                break true;
            }
            let Some(parent) = &record.parent else {
                break false;
            };
            record = self.record(&parent.id).await?;
            if !record.object.directory {
                return Err(status(ErrorCode::Unavailable));
            }
        };
        for id in path {
            self.access.insert(id, allowed);
        }
        Ok(allowed)
    }
}
fn object_size(object: &Object) -> usize {
    256 + object.mime_type.len()
        + object
            .xattrs
            .iter()
            .map(|(k, v)| k.len() + v.len() + 16)
            .sum::<usize>()
}

fn predicate(workspace: &str, filter: &SearchFilter) -> Vec<Value> {
    let mut filters = vec![
        json!({"term": {"workspace": workspace}}),
        json!({"term": {"deleted": false}}),
    ];
    if let Some(name) = &filter.name {
        filters.push(json!({"term": {"name": name}}));
    }
    if let Some(prefix) = &filter.name_prefix {
        filters.push(json!({"prefix": {"name": prefix}}));
    }
    if !filter.mime_types.is_empty() {
        filters.push(json!({"terms": {"mime_type": filter.mime_types}}));
    }
    if let Some(min) = filter.min_size {
        filters.push(json!({"range": {"size": {"gte": min}}}));
    }
    if let Some(max) = filter.max_size {
        filters.push(json!({"range": {"size": {"lte": max}}}));
    }
    for (time, seconds, nanos) in [
        (&filter.modified_after, "gt", "gte"),
        (&filter.modified_before, "lt", "lte"),
    ] {
        if let Some(time) = time {
            filters.push(json!({"bool": {"minimum_should_match": 1, "should": [
                {"range": {"mtime_seconds": {seconds: time.seconds}}},
                {"bool": {"filter": [{"term": {"mtime_seconds": time.seconds}},
                    {"range": {"mtime_nanos": {nanos: time.nanos}}}]}}
            ]}}));
        }
    }
    for attr in &filter.xattrs {
        filters.push(match &attr.value {
            Some(value) => json!({"term": {"xattr_values": index::label(&attr.name, value)}}),
            None => json!({"term": {"xattr_keys": attr.name}}),
        });
    }
    filters
}
fn new_auth(view: View) -> Authorization {
    Authorization {
        view,
        records: HashMap::new(),
        access: HashMap::new(),
        bytes: 0,
        grant_checks: 0,
    }
}

impl Search {
    /// @cc [owner:spolu,label:security;performance] scoped-pit-and-authority
    /// Every PIT query MUST filter workspace and live documents. Authoritative checks MUST use one
    /// FDB snapshot per response; on expiry, discard hits and replay retained candidates with a fresh
    /// cache. Candidate, time, response, and memo budgets MUST be bounded. Errors MUST fail closed.
    pub(crate) async fn files(
        &self,
        state: &State,
        workspace: &str,
        grants: BTreeSet<String>,
        request: SearchFilesRequest,
    ) -> Result<SearchFilesResponse, Status> {
        let _permit = self
            .admission
            .try_acquire()
            .map_err(|_| status(ErrorCode::Capacity))?;
        let started = Instant::now();
        let deadline = started + Duration::from_secs(10);
        let opened = timeout_at(
            deadline,
            self.json(
                Method::POST,
                &format!(
                    "/{}/_pit?keep_alive=30s&routing={}",
                    self.config.es_index,
                    index::routing(workspace)
                ),
                &json!({}),
            ),
        )
        .await
        .map_err(|_| status(ErrorCode::Unavailable))??;
        let mut pit = opened["id"]
            .as_str()
            .ok_or_else(|| status(ErrorCode::Unavailable))?
            .to_owned();
        let limit = if request.limit == 0 {
            20
        } else {
            request.limit as usize
        };
        let filter = request.filter.unwrap_or_default();
        let filters = predicate(workspace, &filter);
        let text = if request.query.trim().is_empty() {
            json!({"match_all": {}})
        } else {
            json!({"match": {"text": {"query": index::tokens(&request.query), "operator": "or"}}})
        };
        let mut response = SearchFilesResponse::default();
        let mut candidates = Vec::<Value>::new();
        let mut auth: Option<Authorization> = None;
        let mut position = 0;
        let mut bytes = 0;
        let mut es_us = 0;
        let mut auth_us = 0;
        let mut exhausted = false;
        let work = async {
            loop {
                if position == candidates.len() && !exhausted {
                    if candidates.len() == 4096 {
                        response.partial = true;
                        return Ok(());
                    }
                    let window = (limit * 4).max(64).min(4096 - candidates.len());
                    let mut body = json!({"pit": {"id": pit, "keep_alive": "30s"}, "size": window,
                        "query": {"bool": {"filter": filters, "must": [text]}}, "track_total_hits": false,
                        "sort": [{"_score": "desc"}, {"object_id": "asc"}],
                        "_source": ["object_id", "object_version", "excerpt"]});
                    if let Some(last) = candidates.last() {
                        body["search_after"] = last["sort"].clone();
                    }
                    let query_started = Instant::now();
                    let result = self.json(Method::POST, "/_search", &body).await?;
                    es_us += query_started.elapsed().as_micros() as u64;
                    if let Some(id) = result["pit_id"].as_str() {
                        pit = id.to_owned();
                    }
                    if result["timed_out"] == true
                        || result["_shards"]["failed"].as_u64().unwrap_or(0) > 0
                    {
                        return Err(status(ErrorCode::Unavailable));
                    }
                    let hits = result["hits"]["hits"]
                        .as_array()
                        .ok_or_else(|| status(ErrorCode::Unavailable))?;
                    if hits.len() > window {
                        return Err(status(ErrorCode::Unavailable));
                    }
                    exhausted = hits.len() < window;
                    candidates.extend(hits.iter().cloned());
                }
                if auth.as_ref().is_some_and(|a| a.view.snapshot.expiring()) {
                    auth = None;
                    response.hits.clear();
                    position = 0;
                    bytes = 0;
                }
                if position == candidates.len() {
                    return Ok(());
                }
                if auth.is_none() {
                    auth = Some(new_auth(
                        View::new(&state.storage, workspace, grants.clone()).await?,
                    ));
                }
                let cache = auth.as_mut().ok_or_else(|| status(ErrorCode::Internal))?;
                let source = &candidates[position]["_source"];
                let id = source["object_id"]
                    .as_str()
                    .ok_or_else(|| status(ErrorCode::Unavailable))?;
                let version = source["object_version"]
                    .as_u64()
                    .ok_or_else(|| status(ErrorCode::Unavailable))?;
                let auth_started = Instant::now();
                let evaluated = async {
                    let record = match cache.record(id).await {
                        Ok(record) => record,
                        Err(error) if error.code() == Code::NotFound => return Ok(None),
                        Err(error) => return Err(error),
                    };
                    if record.object.directory
                        || record.object.version != version
                        || state.writeback.dirty(workspace, id).await
                        || !cache.allowed(record.clone()).await?
                    {
                        return Ok(None);
                    }
                    if !filter.xattrs.iter().all(|a| {
                        match (&a.value, record.object.xattrs.get(&a.name)) {
                            (None, Some(_)) => true,
                            (Some(a), Some(b)) => a == b,
                            _ => false,
                        }
                    }) {
                        return Ok(None);
                    }
                    Ok::<_, Status>(Some(record))
                }
                .await;
                auth_us += auth_started.elapsed().as_micros() as u64;
                let record = match evaluated {
                    Err(_) if cache.view.snapshot.expiring() => continue,
                    result => result?,
                };
                position += 1;
                let Some(record) = record else {
                    continue;
                };
                let name = &record
                    .parent
                    .as_ref()
                    .ok_or_else(|| status(ErrorCode::Unavailable))?
                    .name;
                let excerpt = source["excerpt"]
                    .as_str()
                    .ok_or_else(|| status(ErrorCode::Unavailable))?;
                let size = object_size(&record.object) + name.len() + excerpt.len() + 256;
                if bytes + size > MAX_IO {
                    response.partial = true;
                    return Ok(());
                }
                bytes += size;
                response.hits.push(SearchHit {
                    uri: format!("dfs://{id}"),
                    object: Some(record.object.clone()),
                    name: name.clone(),
                    excerpt: excerpt.to_owned(),
                });
                if response.hits.len() == limit {
                    return Ok(());
                }
            }
        };
        let result = timeout_at(deadline, work).await;
        let _ = timeout(
            Duration::from_secs(2),
            self.json(Method::DELETE, "/_pit", &json!({"id": pit})),
        )
        .await;
        match result {
            Err(_) => response.partial = true,
            Ok(Err(error)) if error.code() == Code::ResourceExhausted => response.partial = true,
            Ok(result) => result?,
        }
        tracing::info!(
            elapsed_ms = started.elapsed().as_millis() as u64,
            es_us,
            auth_us,
            candidates = candidates.len(),
            hits = response.hits.len(),
            partial = response.partial,
            "search completed"
        );
        Ok(response)
    }
}
