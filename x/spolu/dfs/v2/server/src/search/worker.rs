use super::{
    Search, index,
    queue::{self, Indexed, Meta, Pending},
};
use crate::{
    State,
    keys::Keys,
    model,
    mutation::Edit,
    read::View,
    storage::{decode, encode},
};
use dfs_protocol::{
    error::status,
    rpc::{ErrorCode, IndexStatus, Timestamp},
};
use futures::{StreamExt, stream};
use reqwest::Method;
use serde_json::{Value, json};
use std::{
    collections::BTreeSet,
    sync::{Arc, Weak},
    time::{Duration, Instant},
};
use tonic::Status;

const BATCH: usize = 1024;
async fn meta(view: &View) -> Result<Meta, Status> {
    Ok(view
        .get(&view.keys.search_meta())
        .await?
        .map(|v| decode(&v))
        .transpose()?
        .unwrap_or_default())
}
fn id(key: &[u8]) -> Result<String, Status> {
    let suffix = key
        .get(key.len().saturating_sub(16)..)
        .ok_or_else(|| status(ErrorCode::Unavailable))?;
    Ok(uuid::Uuid::from_slice(suffix)
        .map_err(|_| status(ErrorCode::Unavailable))?
        .simple()
        .to_string())
}
struct Job {
    id: String,
    pending: Pending,
    indexed: Option<Indexed>,
    succeeded: bool,
}

impl Search {
    pub(super) async fn run(self: Arc<Self>, weak: Weak<State>) {
        let mut stop = self.stop.subscribe();
        let mut cursor = vec![1];
        loop {
            if *stop.borrow() {
                return;
            }
            let Some(state) = weak.upgrade() else {
                return;
            };
            let result = tokio::select! {
                _ = stop.changed() => return,
                result = tokio::time::timeout(Duration::from_secs(60), self.next(&state, &mut cursor)) => result,
            };
            let busy = match result {
                Ok(Ok(busy)) => busy,
                _ => {
                    tracing::warn!("search indexing failed; pending work retained");
                    false
                }
            };
            drop(state);
            tokio::select! {
                _ = stop.changed() => {},
                _ = tokio::time::sleep(Duration::from_millis(if busy { 1 } else { 200 })) => {},
            }
        }
    }
    async fn next(&self, state: &State, cursor: &mut Vec<u8>) -> Result<bool, Status> {
        let workspace = {
            let snapshot = state.storage.snapshot().await?;
            let mut scan = snapshot.scan(cursor.clone()..vec![2]).await?;
            let Some(row) = scan.next().await? else {
                *cursor = vec![1];
                return Ok(false);
            };
            Keys::workspace_from_key(&row.key)?
        };
        *cursor = Keys::new(&workspace)?.end();
        self.process(state, &workspace).await?;
        // Sleep on an exhausted sweep, not once per idle workspace.
        Ok(true)
    }
    /// @cc [owner:spolu,label:performance;backend] resumable-index-backfill
    /// A changed ES index generation MUST reset the workspace backfill in FDB. Backfill MUST enqueue
    /// only absent jobs, with the cursor in that same transaction, and finish before consuming jobs.
    async fn backfill(
        &self,
        state: &State,
        workspace: &str,
        generation: &str,
    ) -> Result<bool, Status> {
        state
            .storage
            .transact(|snapshot| async move {
                let view = View::from_snapshot(snapshot, workspace, BTreeSet::new()).await?;
                let mut meta = meta(&view).await?;
                if meta.index_generation != generation {
                    meta = Meta {
                        index_generation: generation.to_owned(),
                        ..Default::default()
                    };
                }
                let mut edit = Edit::new();
                if meta.backfilled {
                    return Ok((edit.batch, false));
                }
                let prefix = view.keys.objects();
                let rows = view
                    .rows(prefix.clone(), meta.backfill_after.as_deref(), 128)
                    .await?;
                for (_, bytes) in &rows {
                    let record: model::Record = decode(bytes)?;
                    if !record.object.directory
                        && view
                            .get(&view.keys.pending_file(&record.object.id)?)
                            .await?
                            .is_none()
                    {
                        edit.search_pending(
                            &view.keys,
                            &record.object.id,
                            Some(record.object.version),
                        )?;
                    }
                }
                meta.backfill_after = rows.last().map(|(key, _)| key[prefix.len()..].to_vec());
                meta.backfilled = rows.len() < 128;
                edit.put(view.keys.search_meta(), encode(&meta)?)?;
                Ok((edit.batch, true))
            })
            .await
    }
    /// @cc [owner:spolu,label:backend;concurrency] conditional-es-publication
    /// Capture each ES condition before extracting FDB state. Submit conditional replacements or
    /// create-if-absent, retain deletion tombstones, inspect every bulk result, and wait for refresh.
    /// Failed or ambiguous writes MUST retain their FDB jobs. A retry MUST read a new condition/source.
    pub(crate) async fn process(&self, state: &State, workspace: &str) -> Result<bool, Status> {
        let started = Instant::now();
        let generation = self.ensure_index().await?;
        let backfilled = self.backfill(state, workspace, &generation).await?;
        let (prefix, rows, previous_cursor) = {
            let view = View::new(&state.storage, workspace, BTreeSet::new()).await?;
            let metadata = meta(&view).await?;
            if !metadata.backfilled {
                return Ok(true);
            }
            let prefix = view.keys.pending();
            let rows = view
                .rows(prefix.clone(), metadata.pending_after.as_deref(), BATCH + 1)
                .await?;
            (prefix, rows, metadata.pending_after)
        };
        if rows.is_empty() && previous_cursor.is_none() {
            return Ok(backfilled);
        }
        let now = model::now()?.seconds;
        let mut ready = Vec::new();
        for (key, value) in rows.iter().take(BATCH) {
            let pending: Pending = decode(value)?;
            ready.push((key.clone(), id(key)?, pending));
        }
        let docs: Vec<_> = ready
            .iter()
            .map(|(_, id, _)| {
                json!({"_id": index::document_id(workspace, id),
            "routing": index::routing(workspace), "_source": false})
            })
            .collect();
        let conditions = if ready.is_empty() {
            Vec::new()
        } else {
            let response = self
                .json(
                    Method::POST,
                    &format!("/{}/_mget", self.config.es_index),
                    &json!({"docs": docs}),
                )
                .await?;
            response["docs"]
                .as_array()
                .filter(|v| v.len() == ready.len())
                .cloned()
                .ok_or_else(|| status(ErrorCode::Unavailable))?
        };
        let extract_started = Instant::now();
        let mut extraction = stream::iter(ready.into_iter().zip(conditions)).map(|((key, id, pending), condition)| async move {
            let result = if pending.retry_after_seconds > now { None } else {
                Some(async {
                    let mut header = json!({"_index": self.config.es_index, "_id": index::document_id(workspace, &id),
                        "routing": index::routing(workspace)});
                    let action = if condition["found"] == true {
                        header["if_seq_no"] = json!(condition["_seq_no"].as_u64().ok_or_else(|| status(ErrorCode::Unavailable))?);
                        header["if_primary_term"] = json!(condition["_primary_term"].as_u64().ok_or_else(|| status(ErrorCode::Unavailable))?);
                        "index"
                    } else if condition["found"] == false { "create" }
                    else { return Err(status(ErrorCode::Unavailable)); };
                    let document = index::extract(state, workspace, &id, &pending).await?;
                    let mut bytes = serde_json::to_vec(&json!({action: header})).map_err(|_| status(ErrorCode::Internal))?;
                    bytes.push(b'\n');
                    serde_json::to_writer(&mut bytes, &document.body).map_err(|_| status(ErrorCode::Internal))?;
                    bytes.push(b'\n');
                    let indexed = pending.version.map(|_| Indexed { version: document.version,
                        skipped: document.skipped, failed: false });
                    Ok::<_, Status>((bytes, indexed))
                }.await)
            };
            (key, id, pending, result)
        }).buffered(8);
        let mut jobs = Vec::new();
        let mut payload = Vec::new();
        let mut submitted = Vec::new();
        let mut last = None;
        while let Some((key, id, pending, result)) = extraction.next().await {
            if let Some(Ok((bytes, _))) = &result
                && !payload.is_empty()
                && payload.len() + bytes.len() > 32 * 1024 * 1024
            {
                break;
            }
            last = Some(key[prefix.len()..].to_vec());
            let Some(result) = result else {
                continue;
            };
            let mut job = Job {
                id,
                pending,
                indexed: None,
                succeeded: false,
            };
            if let Ok((bytes, indexed)) = result {
                if bytes.len() > 64 * 1024 * 1024 {
                    return Err(status(ErrorCode::Capacity));
                }
                payload.extend_from_slice(&bytes);
                job.indexed = indexed;
                submitted.push(jobs.len());
            }
            jobs.push(job);
        }
        drop(extraction);
        let extract_ms = extract_started.elapsed().as_millis() as u64;
        let next = if rows.len() <= BATCH
            && last == rows.last().map(|(k, _)| k[prefix.len()..].to_vec())
        {
            None
        } else {
            last
        };
        let serialized_bytes = payload.len();
        let commit_started = Instant::now();
        if !payload.is_empty() {
            let result = Self::response(
                self.request(Method::POST, "/_bulk?refresh=wait_for")
                    .header("content-type", "application/x-ndjson")
                    .body(payload),
            )
            .await;
            if let Ok((200, result)) = result
                && let Some(items) = result["items"]
                    .as_array()
                    .filter(|v| v.len() == submitted.len())
            {
                for (job, item) in submitted.iter().zip(items) {
                    let operation: Option<&Value> =
                        item.get("index").or_else(|| item.get("create"));
                    jobs[*job].succeeded = operation
                        .and_then(|v| v["status"].as_u64())
                        .is_some_and(|s| (200..300).contains(&s));
                }
            }
        }
        let commit_ms = commit_started.elapsed().as_millis() as u64;
        let complete_started = Instant::now();
        state
            .storage
            .transact(|snapshot| {
                let jobs = &jobs;
                let next = next.clone();
                async move {
                    let view = View::from_snapshot(snapshot, workspace, BTreeSet::new()).await?;
                    let mut edit = Edit::new();
                    for job in jobs {
                        if job.succeeded {
                            queue::complete(
                                &view,
                                &mut edit,
                                &job.id,
                                &job.pending.token,
                                job.indexed.as_ref(),
                            )
                            .await?;
                        } else if let Some(bytes) =
                            view.get(&view.keys.pending_file(&job.id)?).await?
                        {
                            let mut current: Pending = decode(&bytes)?;
                            if current.token == job.pending.token {
                                current.attempts = current.attempts.saturating_add(1);
                                current.retry_after_seconds =
                                    now + (1_i64 << current.attempts.min(8));
                                edit.put(view.keys.pending_file(&job.id)?, encode(&current)?)?;
                            }
                        }
                    }
                    let mut meta = meta(&view).await?;
                    meta.pending_after = next;
                    if jobs.iter().any(|j| j.succeeded) {
                        meta.last_commit_seconds = model::now()?.seconds;
                    }
                    edit.put(view.keys.search_meta(), encode(&meta)?)?;
                    Ok((edit.batch, ()))
                }
            })
            .await?;
        if !jobs.is_empty() {
            tracing::info!(
                elapsed_ms = started.elapsed().as_millis() as u64,
                extract_ms,
                commit_ms,
                files = jobs.len(),
                failed = jobs.iter().filter(|j| !j.succeeded).count(),
                serialized_bytes,
                complete_ms = complete_started.elapsed().as_millis() as u64,
                retries = jobs
                    .iter()
                    .map(|job| job.pending.attempts)
                    .max()
                    .unwrap_or(0),
                queue_age_seconds = jobs
                    .iter()
                    .map(|job| now.saturating_sub(job.pending.enqueued_seconds))
                    .max()
                    .unwrap_or(0),
                "search batch indexed"
            );
        }
        Ok(backfilled || !jobs.is_empty() || rows.len() >= BATCH)
    }
    pub(crate) async fn status(
        &self,
        state: &State,
        workspace: &str,
    ) -> Result<IndexStatus, Status> {
        let view = View::new(&state.storage, workspace, BTreeSet::new()).await?;
        let meta = meta(&view).await?;
        let now = model::now()?.seconds;
        let mut response = IndexStatus {
            backfilling: !meta.backfilled,
            last_commit: (meta.last_commit_seconds != 0).then_some(Timestamp {
                seconds: meta.last_commit_seconds,
                nanos: 0,
            }),
            ..Default::default()
        };
        let mut pending = view.scan(view.keys.pending(), None).await?;
        while let Some(row) = pending.next().await? {
            let work: Pending = decode(&row.value)?;
            response.pending += 1;
            response.failed += u64::from(work.attempts > 0);
            response.oldest_pending_seconds = response
                .oldest_pending_seconds
                .max(now.saturating_sub(work.enqueued_seconds).max(0) as u64);
        }
        let mut indexed = view.scan(view.keys.search_statuses(), None).await?;
        while let Some(row) = indexed.next().await? {
            let work: Indexed = decode(&row.value)?;
            response.skipped += u64::from(work.skipped);
        }
        Ok(response)
    }
}
