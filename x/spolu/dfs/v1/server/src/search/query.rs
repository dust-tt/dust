use super::{Search, index::label};
use crate::{model::Record, read::View, storage::failed};
use arrow_array::{StringArray, UInt64Array};
use dfs_protocol::{MAX_IO, error::status, rpc::*};
use futures::TryStreamExt;
use lancedb::{
    datafusion::{functions::string::expr_fn::starts_with, functions_nested::expr_fn::array_has},
    expr::{DfExpr, col, lit},
    index::scalar::FullTextSearchQuery,
    query::{ExecutableQuery, QueryBase, Select},
};
use std::{
    collections::{HashMap, HashSet},
    sync::{Arc, atomic::Ordering},
    time::Duration,
};
use tokio::time::{Instant, timeout_at};
use tonic::{Code, Status};

fn predicate(filter: &SearchFilter) -> DfExpr {
    let mut value = lit(true);
    if let Some(name) = &filter.name {
        value = value.and(col("name").eq(lit(name.clone())));
    }
    if let Some(prefix) = &filter.name_prefix {
        value = value.and(starts_with(col("name"), lit(prefix.clone())));
    }
    if !filter.mime_types.is_empty() {
        value = value.and(col("mime_type").in_list(
            filter.mime_types.iter().map(|s| lit(s.clone())).collect(),
            false,
        ));
    }
    if let Some(min) = filter.min_size {
        value = value.and(col("size").gt_eq(lit(min)));
    }
    if let Some(max) = filter.max_size {
        value = value.and(col("size").lt_eq(lit(max)));
    }
    if let Some(time) = &filter.modified_after {
        value = value.and(
            col("mtime_seconds")
                .gt(lit(time.seconds))
                .or(col("mtime_seconds")
                    .eq(lit(time.seconds))
                    .and(col("mtime_nanos").gt_eq(lit(time.nanos)))),
        );
    }
    if let Some(time) = &filter.modified_before {
        value = value.and(
            col("mtime_seconds")
                .lt(lit(time.seconds))
                .or(col("mtime_seconds")
                    .eq(lit(time.seconds))
                    .and(col("mtime_nanos").lt_eq(lit(time.nanos)))),
        );
    }
    for xattr in &filter.xattrs {
        value = value.and(match &xattr.value {
            Some(bytes) => array_has(
                col("xattr_values"),
                lit(label(&[xattr.name.as_bytes(), bytes])),
            ),
            None => array_has(col("xattr_keys"), lit(label(&[xattr.name.as_bytes()]))),
        });
    }
    value
}

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
impl Search {
    pub(crate) async fn files(
        &self,
        view: View,
        workspace: &str,
        request: SearchFilesRequest,
    ) -> Result<SearchFilesResponse, Status> {
        let _permit = self
            .admission
            .try_acquire()
            .map_err(|_| status(ErrorCode::Capacity))?;
        let started = Instant::now();
        let cache_before = self.object_cache.as_ref().map(|c| {
            (
                c.hits.load(Ordering::Relaxed),
                c.remote_requests.load(Ordering::Relaxed),
                c.remote_bytes.load(Ordering::Relaxed),
            )
        });
        let deadline = started + Duration::from_secs(10);
        let table = timeout_at(deadline, self.table(workspace))
            .await
            .map_err(|_| status(ErrorCode::Unavailable))??;
        let table = timeout_at(deadline, table.query_snapshot())
            .await
            .map_err(|_| status(ErrorCode::Unavailable))?
            .map_err(failed)?;
        let limit = if request.limit == 0 {
            20
        } else {
            request.limit as usize
        };
        let filter = predicate(&request.filter.unwrap_or_default());
        let mut auth = Authorization {
            view,
            records: HashMap::new(),
            access: HashMap::new(),
            bytes: 0,
            grant_checks: 0,
        };
        let mut response = SearchFilesResponse::default();
        let mut seen = HashSet::new();
        let mut bytes = 0;
        let setup_ms = started.elapsed().as_millis() as u64;
        let mut lance_wait_us = 0;
        let mut authorization_us = 0;
        let work = async {
            let mut window = (limit * 4).max(64);
            loop {
                let mut query = table
                    .query()
                    .only_if_expr(filter.clone())
                    .limit(window)
                    .select(Select::Columns(vec![
                        "object_id".into(),
                        "object_version".into(),
                        "excerpt".into(),
                    ]));
                if !request.query.trim().is_empty() {
                    query = query.full_text_search(
                        FullTextSearchQuery::new(request.query.clone())
                            .with_column("text".into())
                            .map_err(failed)?,
                    );
                }
                let query_started = Instant::now();
                let mut stream = query.execute().await.map_err(failed)?;
                lance_wait_us += query_started.elapsed().as_micros() as u64;
                let mut count = 0;
                loop {
                    let batch_started = Instant::now();
                    let batch = stream.try_next().await.map_err(failed)?;
                    lance_wait_us += batch_started.elapsed().as_micros() as u64;
                    let Some(batch) = batch else { break };
                    let ids = batch
                        .column_by_name("object_id")
                        .and_then(|a| a.as_any().downcast_ref::<StringArray>())
                        .ok_or_else(|| status(ErrorCode::Unavailable))?;
                    let versions = batch
                        .column_by_name("object_version")
                        .and_then(|a| a.as_any().downcast_ref::<UInt64Array>())
                        .ok_or_else(|| status(ErrorCode::Unavailable))?;
                    let excerpts = batch
                        .column_by_name("excerpt")
                        .and_then(|a| a.as_any().downcast_ref::<StringArray>())
                        .ok_or_else(|| status(ErrorCode::Unavailable))?;
                    for row in 0..batch.num_rows() {
                        count += 1;
                        let id = ids.value(row);
                        if seen.len() >= 4096 && !seen.contains(id) {
                            response.partial = true;
                            return Ok(());
                        }
                        if !seen.insert(id.to_owned()) {
                            continue;
                        }
                        let auth_started = Instant::now();
                        let record = auth.record(id).await;
                        authorization_us += auth_started.elapsed().as_micros() as u64;
                        let record = match record {
                            Ok(record) => record,
                            Err(error) if error.code() == Code::NotFound => continue,
                            Err(error) => return Err(error),
                        };
                        if record.object.directory || record.object.version != versions.value(row) {
                            continue;
                        }
                        let auth_started = Instant::now();
                        let allowed = auth.allowed(record.clone()).await?;
                        authorization_us += auth_started.elapsed().as_micros() as u64;
                        if !allowed {
                            continue;
                        }
                        let Some(parent) = &record.parent else {
                            return Err(status(ErrorCode::Unavailable));
                        };
                        let size = object_size(&record.object)
                            + parent.name.len()
                            + excerpts.value(row).len()
                            + 256;
                        if bytes + size > MAX_IO {
                            response.partial = true;
                            return Ok(());
                        }
                        bytes += size;
                        response.hits.push(SearchHit {
                            uri: format!("dfs://{id}"),
                            object: Some(record.object.clone()),
                            name: parent.name.clone(),
                            excerpt: excerpts.value(row).into(),
                        });
                        if response.hits.len() == limit {
                            return Ok(());
                        }
                    }
                }
                if count < window {
                    return Ok(());
                }
                if window == 4096 {
                    response.partial = true;
                    return Ok(());
                }
                window = (window * 2).min(4096);
            }
        };
        match timeout_at(deadline, work).await {
            Err(_) => response.partial = true,
            Ok(Err(error)) if error.code() == Code::ResourceExhausted => response.partial = true,
            Ok(result) => result?,
        }
        // Cache deltas include concurrent process activity; phase timers belong to this request.
        let (object_cache_hits, object_remote_requests, object_remote_bytes) = self
            .object_cache
            .as_ref()
            .zip(cache_before)
            .map(|(c, (hits, requests, bytes))| {
                (
                    c.hits.load(Ordering::Relaxed) - hits,
                    c.remote_requests.load(Ordering::Relaxed) - requests,
                    c.remote_bytes.load(Ordering::Relaxed) - bytes,
                )
            })
            .unwrap_or_default();
        tracing::info!(
            setup_ms,
            lance_wait_us,
            authorization_us,
            object_cache_hits,
            object_remote_requests,
            object_remote_bytes,
            elapsed_ms = started.elapsed().as_millis() as u64,
            candidates = seen.len(),
            metadata_records = auth.records.len(),
            grant_checks = auth.grant_checks,
            hits = response.hits.len(),
            partial = response.partial,
            "search completed"
        );
        Ok(response)
    }
}
