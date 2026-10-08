use super::{
    Search, index,
    queue::{self, Meta, Pending},
};
use crate::{
    State,
    keys::Keys,
    model,
    mutation::Edit,
    read::View,
    storage::{decode, encode},
};
use dfs_protocol::{ObjectId, ObjectRef, error::status, rpc::ErrorCode};
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
fn id(key: &[u8]) -> Result<ObjectRef, Status> {
    let suffix = key
        .get(key.len().saturating_sub(16)..)
        .ok_or_else(|| status(ErrorCode::Unavailable))?;
    Ok(ObjectRef::Object(
        ObjectId::try_from(suffix).map_err(|_| status(ErrorCode::Unavailable))?,
    ))
}
struct Job {
    id: ObjectRef,
    pending: Pending,
    succeeded: bool,
}

impl Search {
    pub(super) async fn run(self: Arc<Self>, weak: Weak<State>) {
        let mut stop = self.stop.subscribe();
        let mut cursor = vec![2];
        let mut sweep_busy = false;
        loop {
            if *stop.borrow() {
                return;
            }
            let Some(state) = weak.upgrade() else {
                return;
            };
            let result = tokio::select! {
                _ = stop.changed() => return,
                result = tokio::time::timeout(Duration::from_secs(60), self.next(&state, &mut cursor, &mut sweep_busy)) => result,
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
    async fn next(
        &self,
        state: &State,
        cursor: &mut Vec<u8>,
        sweep_busy: &mut bool,
    ) -> Result<bool, Status> {
        let tenant = {
            let snapshot = state.storage.snapshot().await?;
            let mut scan = snapshot
                .scan((
                    std::ops::Bound::Included(cursor.clone()),
                    std::ops::Bound::Excluded(vec![3]),
                ))
                .await?;
            let Some(row) = scan.next().await? else {
                *cursor = vec![2];
                return Ok(std::mem::take(sweep_busy));
            };
            String::from_utf8(row.key[1..].to_vec()).map_err(|_| status(ErrorCode::Unavailable))?
        };
        *cursor = Keys::registered_tenant(&tenant)?;
        cursor.push(0);
        *sweep_busy |= self.process(state, &tenant).await?;
        // Back off only when the entire completed sweep had no work.
        Ok(true)
    }
    /// @cc [owner:spolu,label:performance;backend] resumable-index-backfill
    /// A changed ES index generation MUST reset the tenant backfill in FDB. Backfill MUST enqueue
    /// current-state obligations with its cursor in the same transaction and finish before consuming
    /// jobs. Replacing an existing token MUST NOT discard state: extraction always reads current FDB.
    async fn backfill(
        &self,
        state: &State,
        tenant: &str,
        generation: &str,
    ) -> Result<bool, Status> {
        state
            .storage
            .transact(|snapshot| async move {
                let view = View::from_snapshot(snapshot, tenant, BTreeSet::new()).await?;
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
                    .rows(prefix.clone(), meta.backfill_after.as_deref(), BATCH)
                    .await?;
                for (_, bytes) in &rows {
                    let record: model::Record = decode(bytes)?;
                    if record.parent.is_some() {
                        edit.search_pending(&view.keys, &record.object.id)?;
                    }
                }
                meta.backfill_after = rows.last().map(|(key, _)| key[prefix.len()..].to_vec());
                meta.backfilled = rows.len() < BATCH;
                edit.put(view.keys.search_meta(), encode(&meta)?)?;
                Ok((edit.batch, true))
            })
            .await
    }
    /// @cc [owner:spolu,label:backend;concurrency] conditional-es-publication
    /// Capture each ES condition before extracting FDB state. Submit conditional replacements or
    /// create-if-absent, retain deletion tombstones, inspect every bulk result, and wait for refresh.
    /// Failed or ambiguous writes MUST retain their FDB jobs. A retry MUST read a new condition/source.
    pub(crate) async fn process(&self, state: &State, tenant: &str) -> Result<bool, Status> {
        let started = Instant::now();
        let (generation, write_alias) = self.ensure_index().await?;
        let backfilled = self.backfill(state, tenant, &generation).await?;
        let (prefix, rows, previous_cursor) = {
            let view =
                View::from_snapshot(state.storage.snapshot().await?, tenant, BTreeSet::new())
                    .await?;
            let metadata = meta(&view).await?;
            if !metadata.backfilled {
                return Ok(true);
            }
            let prefix = view.keys.search_pending();
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
                json!({"_id": index::document_id(tenant, id),
            "routing": index::routing(tenant), "_source": false})
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
        let write_alias = write_alias.as_str();
        let mut extraction = stream::iter(ready.into_iter().zip(conditions)).map(|((key, id, pending), condition)| async move {
            let result = if pending.retry_after_seconds > now { None } else {
                Some(async {
                    let mut header = json!({"_index": write_alias, "_id": index::document_id(tenant, &id),
                        "routing": index::routing(tenant)});
                    let action = if condition["found"] == true {
                        header["if_seq_no"] = json!(condition["_seq_no"].as_u64().ok_or_else(|| status(ErrorCode::Unavailable))?);
                        header["if_primary_term"] = json!(condition["_primary_term"].as_u64().ok_or_else(|| status(ErrorCode::Unavailable))?);
                        "index"
                    } else if condition["found"] == false { "create" }
                    else { return Err(status(ErrorCode::Unavailable)); };
                    let document = index::extract(state, tenant, &id, &pending).await?;
                    let mut bytes = serde_json::to_vec(&json!({action: header})).map_err(|_| status(ErrorCode::Internal))?;
                    bytes.push(b'\n');
                    serde_json::to_writer(&mut bytes, &document).map_err(|_| status(ErrorCode::Internal))?;
                    bytes.push(b'\n');
                    Ok::<_, Status>(bytes)
                }.await)
            };
            (key, id, pending, result)
        }).buffered(8);
        let mut jobs = Vec::new();
        let mut payload = Vec::new();
        let mut submitted = Vec::new();
        let mut last = None;
        while let Some((key, id, pending, result)) = extraction.next().await {
            if let Some(Ok(bytes)) = &result
                && !payload.is_empty()
                && payload.len() + bytes.len() > 32 * 1024 * 1024
            {
                break;
            }
            last = Some(key[prefix.len()..].to_vec());
            let Some(result) = result else {
                continue;
            };
            let job = Job {
                id,
                pending,
                succeeded: false,
            };
            if let Ok(bytes) = result {
                if bytes.len() > 64 * 1024 * 1024 {
                    return Err(status(ErrorCode::Capacity));
                }
                payload.extend_from_slice(&bytes);
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
                self.request(Method::POST, "/_bulk?refresh=wait_for&require_alias=true")
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
                let generation = generation.as_str();
                let next = next.clone();
                async move {
                    let view = View::from_snapshot(snapshot, tenant, BTreeSet::new()).await?;
                    let mut meta = meta(&view).await?;
                    if meta.index_generation != generation {
                        return Ok((Edit::new().batch, ()));
                    }
                    let mut edit = Edit::new();
                    for job in jobs {
                        if job.succeeded {
                            queue::complete(&view, &mut edit, &job.id, &job.pending.token).await?;
                        } else if let Some(bytes) =
                            view.get(&view.keys.pending_object(&job.id)?).await?
                        {
                            let mut current: Pending = decode(&bytes)?;
                            if current.token == job.pending.token {
                                current.attempts = current.attempts.saturating_add(1);
                                current.retry_after_seconds =
                                    now + (1_i64 << current.attempts.min(8));
                                edit.put(view.keys.pending_object(&job.id)?, encode(&current)?)?;
                            }
                        }
                    }
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
                objects = jobs.len(),
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
}
