use super::{Search, index};
use crate::{State, auth::SessionState, read::View};
use dfs_protocol::{ObjectId, ObjectRef, error::status, rpc::*, validate};
use futures::{StreamExt, TryStreamExt, stream};
use reqwest::Method;
use serde_json::{Value, json};
use std::{
    collections::HashSet,
    time::{Duration, Instant},
};
use tonic::Status;

const CANDIDATES: usize = 4096;
const REPLY_BYTES: usize = 1024 * 1024;

pub(super) fn validate_request(request: &SearchRequest) -> Result<(), Status> {
    if prost::Message::encoded_len(request) > dfs_protocol::MAX_XATTRS + 8192 {
        return Err(status(ErrorCode::Capacity));
    }
    if request.query.len() > 4096
        || !(1..=100).contains(&request.limit.unwrap_or(20))
        || request.fields.len() > 2
        || request
            .fields
            .iter()
            .any(|f| SearchField::try_from(*f).is_err())
    {
        return Err(status(ErrorCode::InvalidInput));
    }
    if let Some(scope) = &request.scope {
        validate::id(&scope.directory_id)?;
    }
    if let Some(filter) = &request.filter {
        if filter
            .kind
            .is_some_and(|kind| SearchKind::try_from(kind).is_err())
            || filter.mime_types.len() > 32
            || filter.xattrs.len() > 64
            || filter
                .min_size
                .zip(filter.max_size)
                .is_some_and(|(a, b)| a > b)
            || (filter.kind == Some(SearchKind::Directory as i32)
                && (!filter.mime_types.is_empty()
                    || filter.min_size.is_some()
                    || filter.max_size.is_some()))
        {
            return Err(status(ErrorCode::InvalidInput));
        }
        if let Some(name) = &filter.name {
            validate::name(name)?;
        }
        if let Some(prefix) = &filter.name_prefix
            && (prefix.len() > 255 || prefix.contains(['/', '\0']))
        {
            return Err(status(ErrorCode::InvalidInput));
        }
        for mime in &filter.mime_types {
            validate::attributes(mime, &Default::default(), 0)?;
        }
        for t in filter.modified_after.iter().chain(&filter.modified_before) {
            validate::timestamp(t)?;
        }
        if filter
            .modified_after
            .as_ref()
            .zip(filter.modified_before.as_ref())
            .is_some_and(|(a, b)| (a.seconds, a.nanos) > (b.seconds, b.nanos))
        {
            return Err(status(ErrorCode::InvalidInput));
        }
        let attrs = filter
            .xattrs
            .iter()
            .map(|x| (x.name.clone(), x.value.clone().unwrap_or_default()))
            .collect();
        validate::attributes("application/octet-stream", &attrs, 0)?;
    }
    Ok(())
}

fn predicate(tenant: &str, filter: &SearchFilter) -> Vec<Value> {
    let mut filters = vec![
        json!({"term": {"workspace": tenant}}),
        json!({"term": {"deleted": false}}),
    ];
    if let Some(kind) = filter.kind {
        filters.push(json!({"term": {"directory": kind == SearchKind::Directory as i32}}));
    }
    if !filter.mime_types.is_empty() || filter.min_size.is_some() || filter.max_size.is_some() {
        filters.push(json!({"term": {"directory": false}}));
    }
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

impl Search {
    /// @cc [owner:spolu,label:security;performance] object-search-authority
    /// Every ES query MUST filter tenant and live objects. Names and excerpts MUST remain private
    /// until matching FDB revisions and one fresh authority/scope generation have been checked.
    /// ES requests MUST NOT hold FDB snapshots. Candidate and response memory MUST remain bounded.
    pub(crate) async fn objects(
        &self,
        state: &State,
        session: &SessionState,
        request: SearchRequest,
    ) -> Result<SearchResponse, Status> {
        validate_request(&request)?;
        let _permit = self
            .admission
            .try_acquire()
            .map_err(|_| status(ErrorCode::Capacity))?;
        let started = Instant::now();
        let tenant = &session.info.tenant_id;
        let opened = self
            .json(
                Method::POST,
                &format!(
                    "/{}/_pit?keep_alive=30s&routing={}",
                    self.config.es_index,
                    index::routing(tenant)
                ),
                &json!({}),
            )
            .await?;
        let mut pit = opened["id"]
            .as_str()
            .ok_or_else(|| status(ErrorCode::Unavailable))?
            .to_owned();
        let mut candidates: Vec<Value> = Vec::new();
        let limit = request.limit.unwrap_or(20) as usize;
        let filter = request.filter.clone().unwrap_or_default();
        let fields = if request.fields.is_empty() {
            vec![SearchField::Name as i32, SearchField::Content as i32]
        } else {
            request.fields.clone()
        };
        let text = if request.query.trim().is_empty() {
            json!({"match_all": {}})
        } else {
            let matches: Vec<_> = fields.iter().map(|field| {
                let field = if *field == SearchField::Name as i32 { "name_text" } else { "text" };
                json!({"match": {field: {"query": index::tokens(&request.query), "operator": "or"}}})
            }).collect();
            json!({"bool": {"should": matches, "minimum_should_match": 1}})
        };
        let mut filters = predicate(tenant, &filter);
        if fields.iter().all(|f| *f == SearchField::Content as i32) {
            filters.push(json!({"term": {"directory": false}}));
        }
        let mut es_us = 0u64;
        let mut validation_us = 0u64;
        let work = async {
            loop {
                let remaining = Duration::from_secs(10).saturating_sub(started.elapsed());
                if remaining.is_zero() || candidates.len() == CANDIDATES {
                    return self
                        .evaluate(state, session, &request, &candidates, true)
                        .await;
                }
                let window = (limit * 4).max(64).min(CANDIDATES - candidates.len());
                let mut body = json!({"size": window, "track_total_hits": false,
                    "pit": {"id": pit, "keep_alive": "30s"},
                    "query": {"bool": {"must": [text], "filter": filters}},
                    "sort": [{"_score": "desc"}, {"object_id": "asc"}],
                    "_source": ["object_id", "object_revision", "excerpt"]});
                if let Some(last) = candidates.last() {
                    body["search_after"] = last["sort"].clone();
                }
                let query_started = Instant::now();
                let result = match tokio::time::timeout(
                    remaining,
                    self.json(Method::POST, "/_search", &body),
                )
                .await
                {
                    Ok(result) => result?,
                    Err(_) => {
                        return self
                            .evaluate(state, session, &request, &candidates, true)
                            .await;
                    }
                };
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
                    .filter(|h| h.len() <= window)
                    .ok_or_else(|| status(ErrorCode::Unavailable))?;
                let exhausted = hits.len() < window;
                candidates.extend(hits.iter().cloned());
                let validate_started = Instant::now();
                let response = self
                    .evaluate(state, session, &request, &candidates, false)
                    .await?;
                validation_us += validate_started.elapsed().as_micros() as u64;
                if response.hits.len() == limit || exhausted || response.partial {
                    return Ok(response);
                }
            }
        }
        .await;
        let cleanup = self
            .request(Method::DELETE, "/_pit")
            .json(&json!({"id": pit}));
        tokio::spawn(async move {
            let _ = tokio::time::timeout(Duration::from_secs(2), Self::response(cleanup)).await;
        });
        let response = work?;
        session.active()?;
        tracing::info!(
            elapsed_ms = started.elapsed().as_millis() as u64,
            es_us,
            validation_us,
            candidates = candidates.len(),
            hits = response.hits.len(),
            partial = response.partial,
            "search completed"
        );
        Ok(response)
    }

    async fn evaluate(
        &self,
        state: &State,
        session: &SessionState,
        request: &SearchRequest,
        candidates: &[Value],
        partial: bool,
    ) -> Result<SearchResponse, Status> {
        for use_ram in [true, false] {
            let mut view = View::for_grants(
                state.storage.snapshot().await?,
                &session.info.tenant_id,
                session.grants.clone(),
            )
            .await?;
            if let Some(authority) = use_ram
                .then(|| state.permissions.pin(&session.info.tenant_id))
                .flatten()
            {
                if view.bind_ram_authority(authority).is_err() {
                    continue;
                }
            } else {
                view.bind_fdb_authority(state.incarnation).await?;
            }
            let result = tokio::time::timeout(
                Duration::from_secs(3),
                evaluate_view(&view, request, candidates, partial),
            )
            .await;
            if view.check_authority().is_err() {
                continue;
            }
            match result {
                Ok(Err(error)) if dfs_protocol::error::code(&error) == ErrorCode::StaleView => {
                    continue;
                }
                Ok(result) => return result,
                Err(_) => return Err(status(ErrorCode::Unavailable)),
            }
        }
        Err(status(ErrorCode::Unavailable))
    }
}

async fn evaluate_view(
    view: &View,
    request: &SearchRequest,
    candidates: &[Value],
    partial: bool,
) -> Result<SearchResponse, Status> {
    let scope = if let Some(scope) = &request.scope {
        let directory = view.stat(&scope.directory_id).await?;
        if !directory.object.directory {
            return Err(status(ErrorCode::NotDirectory));
        }
        Some((
            scope
                .directory_id
                .real()
                .map_err(|_| status(ErrorCode::InvalidInput))?,
            scope.recursive.unwrap_or(true),
        ))
    } else {
        None
    };
    let ids: Vec<ObjectId> = candidates
        .iter()
        .map(|hit| {
            hit["_source"]["object_id"]
                .as_str()
                .ok_or_else(|| status(ErrorCode::Unavailable))?
                .parse()
                .map_err(|_| status(ErrorCode::Unavailable))
        })
        .collect::<Result<_, _>>()?;
    let allowed: HashSet<_> = view
        .filter_scoped_search_candidates(ids.clone(), scope)
        .await?
        .into_iter()
        .collect();
    let mut responses = stream::iter(candidates.iter().cloned().zip(ids).collect::<Vec<_>>())
        .map(|(hit, id)| {
            let allowed = &allowed;
            async move {
                if !allowed.contains(&id) {
                    return Ok(None);
                }
                let record = match view.object(&ObjectRef::Object(id)).await {
                    Ok(record) => record,
                    Err(error) if dfs_protocol::error::code(&error) == ErrorCode::NotFound => {
                        return Ok(None);
                    }
                    Err(error) => return Err(error),
                };
                let source = &hit["_source"];
                if source["object_revision"].as_str()
                    != Some(hex::encode(record.object.revision.as_slice()).as_str())
                    || !view.authorized(&record).await?
                {
                    return Ok(None);
                }
                let Some(parent) = record.parent.as_ref() else {
                    return Ok(None);
                };
                if let Some(filter) = &request.filter {
                    let metadata = view.extended(&record).await?;
                    if !filter.xattrs.iter().all(|x| {
                        match (&x.value, metadata.xattrs.get(&x.name)) {
                            (None, Some(_)) => true,
                            (Some(a), Some(b)) => a == b,
                            _ => false,
                        }
                    }) {
                        return Ok(None);
                    }
                }
                let excerpt = if record.object.directory {
                    None
                } else {
                    Some(
                        source["excerpt"]
                            .as_str()
                            .filter(|v| v.len() <= 2048)
                            .ok_or_else(|| status(ErrorCode::Unavailable))?
                            .to_owned(),
                    )
                };
                Ok::<_, Status>(Some(SearchHit {
                    object: record.object,
                    name: parent.name.clone(),
                    excerpt,
                }))
            }
        })
        .buffered(16);
    let mut response = SearchResponse {
        hits: Vec::new(),
        partial,
        view: view.read_view(),
    };
    let mut bytes = 128;
    while let Some(hit) = responses.try_next().await? {
        let Some(hit) = hit else {
            continue;
        };
        let size = prost::Message::encoded_len(&hit) + 8;
        if bytes + size > REPLY_BYTES {
            response.partial = true;
            break;
        }
        bytes += size;
        response.hits.push(hit);
        if response.hits.len() == request.limit.unwrap_or(20) as usize {
            break;
        }
    }
    view.check_authority()?;
    Ok(response)
}
