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
    storage::{decode, encode, failed},
};
use dfs_protocol::{
    error::status,
    rpc::{ErrorCode, IndexStatus, Timestamp},
};
use futures::{StreamExt, stream};
use lancedb::table::OptimizeAction;
use slatedb::config::ScanOptions;
use std::{
    collections::{BTreeSet, HashMap, HashSet},
    sync::{Arc, Weak},
    time::{Duration, Instant},
};
use tonic::Status;

const BATCH: usize = 1024;
const EXTRACT_CONCURRENCY: usize = 8;
async fn meta(view: &View) -> Result<Meta, Status> {
    view.get(&view.keys.search_meta())
        .await?
        .map(|b| decode(&b))
        .transpose()
        .map(|v| v.unwrap_or_default())
}
fn id(key: &[u8]) -> Result<String, Status> {
    let suffix = key
        .get(key.len().saturating_sub(16)..)
        .ok_or_else(|| status(ErrorCode::Unavailable))?;
    Ok(uuid::Uuid::from_slice(suffix)
        .map_err(failed)?
        .simple()
        .to_string())
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
            let work =
                tokio::time::timeout(Duration::from_secs(120), self.next(&state, &mut cursor))
                    .await;
            let busy = match work {
                Ok(Ok(busy)) => busy,
                Ok(Err(_)) => {
                    tracing::warn!("search indexing failed; work retained for retry");
                    false
                }
                Err(_) => {
                    tracing::warn!("search indexing timed out; work retained for retry");
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
        let snapshot = state.storage.snapshot().await?;
        let mut scan = snapshot
            .scan_with_options(
                cursor.clone()..vec![2],
                &ScanOptions {
                    read_ahead_bytes: 4096,
                    max_fetch_tasks: 1,
                    ..Default::default()
                },
            )
            .await
            .map_err(failed)?;
        let Some(row) = scan.next().await.map_err(failed)? else {
            *cursor = vec![1];
            return Ok(false);
        };
        let workspace = Keys::workspace_from_key(&row.key)?;
        *cursor = Keys::new(&workspace)?.end();
        drop(scan);
        drop(snapshot);
        self.process(state, &workspace).await
    }
    async fn ensure_table(&self, state: &State, workspace: &str) -> Result<lancedb::Table, Status> {
        if let Ok(table) = self.table(workspace).await {
            return Ok(table);
        }
        match self
            .connection
            .open_table(Self::name(workspace))
            .execute()
            .await
        {
            Ok(table) => Ok(table),
            Err(lancedb::Error::TableNotFound { .. }) => {
                // Persist the rebuild marker before creating anything, including across a crash.
                let locks = state.locks(workspace).await;
                {
                    let _guard = locks.topology.write().await;
                    let keys = Keys::new(workspace)?;
                    let mut edit = Edit::new();
                    edit.put(keys.search_meta(), encode(&Meta::default())?)?;
                    state.storage.publish(edit.batch).await?;
                }
                state.storage.flush().await.map_err(failed)?;
                let table = self.create_table(workspace).await?;
                index::indexes(&table).await?;
                Ok(table)
            }
            Err(error) => Err(failed(error)),
        }
    }
    /// @cc [owner:spolu,label:performance] finish-backfill-before-consumption
    /// A workspace MUST finish its backfill before queued jobs are consumed, so the backfill cannot
    /// re-enqueue files completed by this worker during the same rebuild.
    async fn backfill(&self, state: &State, workspace: &str) -> Result<bool, Status> {
        let locks = state.locks(workspace).await;
        let _guard = locks.topology.write().await;
        let view = View::new(&state.storage, workspace, BTreeSet::new()).await?;
        let mut meta = meta(&view).await?;
        if meta.backfilled {
            return Ok(false);
        }
        let prefix = view.keys.objects();
        let rows = view
            .rows(prefix.clone(), meta.backfill_after.as_deref(), BATCH)
            .await?;
        let mut edit = Edit::new();
        for (_, bytes) in &rows {
            let record: model::Record = decode(bytes)?;
            if !record.object.directory
                && view
                    .get(&view.keys.pending_file(&record.object.id)?)
                    .await?
                    .is_none()
            {
                edit.search_pending(&view.keys, &record.object.id, Some(record.object.version))?;
            }
        }
        meta.backfill_after = rows.last().map(|(key, _)| key[prefix.len()..].to_vec());
        meta.backfilled = rows.len() < BATCH;
        edit.put(view.keys.search_meta(), encode(&meta)?)?;
        state.storage.publish(edit.batch).await?;
        Ok(true)
    }
    /// @cc [owner:spolu,label:backend;concurrency] durable-source-snapshot
    /// LanceDB MUST only receive blocks/metadata from the captured snapshot after its sequence is
    /// durable. Completion MUST compare tokens under the publication gate; partial commits replay.
    pub(crate) async fn process(&self, state: &State, workspace: &str) -> Result<bool, Status> {
        let started = Instant::now();
        let table = self.ensure_table(state, workspace).await?;
        let backfilled = self.backfill(state, workspace).await?;
        let view = View::new(&state.storage, workspace, BTreeSet::new()).await?;
        let metadata = meta(&view).await?;
        // Finish backfill before consuming its queue, so completed files cannot be re-enqueued.
        if !metadata.backfilled {
            return Ok(true);
        }
        let prefix = view.keys.pending();
        let rows = view
            .rows(prefix.clone(), metadata.pending_after.as_deref(), BATCH + 1)
            .await?;
        if rows.is_empty() && metadata.pending_after.is_none() {
            return Ok(backfilled);
        }
        let durable_started = Instant::now();
        let mut durable = state.storage.db.subscribe();
        durable
            .wait_for(|s| s.durable_seq >= view.snapshot.seq())
            .await
            .map_err(failed)?;
        let durable_ms = durable_started.elapsed().as_millis() as u64;
        let extract_started = Instant::now();
        let now = model::now()?.seconds;
        let mut jobs = Vec::new();
        let mut documents = Vec::new();
        let mut deleted = Vec::new();
        let mut failed_jobs = HashSet::new();
        let mut bytes = 0;
        let mut last = None;
        // Buffered extraction preserves cursor order and bounds speculative reads to eight files.
        let snapshot = &view;
        let mut extraction = stream::iter(
            rows.iter()
                .take(BATCH)
                .cloned()
                .collect::<Vec<_>>()
                .into_iter()
                .map(|(key, value)| async move {
                    let pending: Pending = decode(&value)?;
                    let id = id(&key)?;
                    let document = match pending.version {
                        Some(version) if pending.retry_after_seconds <= now => Some(
                            async {
                                let record = snapshot.object(&id).await?;
                                if record.object.version != version {
                                    return Err(status(ErrorCode::Unavailable));
                                }
                                index::extract(snapshot, record).await
                            }
                            .await,
                        ),
                        _ => None,
                    };
                    Ok::<_, Status>((key, id, pending, document))
                }),
        )
        .buffered(EXTRACT_CONCURRENCY);
        while bytes < 32 * 1024 * 1024 {
            let Some(extracted) = extraction.next().await else {
                break;
            };
            let (key, id, pending, document) = extracted?;
            last = Some(key[prefix.len()..].to_vec());
            if pending.retry_after_seconds > now {
                continue;
            }
            match document {
                Some(Ok(document)) => {
                    bytes += document.text.len();
                    documents.push(document);
                }
                Some(Err(_)) => {
                    failed_jobs.insert(id.clone());
                }
                None => deleted.push(id.clone()),
            }
            jobs.push((id, pending));
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
        let committed = !documents.is_empty() || !deleted.is_empty();
        let optimize = (committed || metadata.pending_after.is_some())
            && (next.is_none()
                || (metadata.last_optimized_seconds != 0
                    && now - metadata.last_optimized_seconds >= 300));
        let mut commit_ms = 0;
        let mut maintenance_ms = 0;
        let result = async {
            let commit_started = Instant::now();
            index::commit(&table, &documents, &deleted).await?;
            commit_ms = commit_started.elapsed().as_millis() as u64;
            let maintenance_started = Instant::now();
            index::indexes(&table).await?;
            if optimize {
                table.optimize(OptimizeAction::All).await.map_err(failed)?;
            }
            maintenance_ms = maintenance_started.elapsed().as_millis() as u64;
            self.publish_table(workspace, table.clone()).await;
            Ok::<(), Status>(())
        }
        .await;
        let locks = state.locks(workspace).await;
        let _guard = locks.topology.write().await;
        let current = View::new(&state.storage, workspace, BTreeSet::new()).await?;
        let mut edit = Edit::new();
        let indexed: HashMap<_, _> = documents
            .iter()
            .map(|d| {
                (
                    d.record.object.id.as_str(),
                    Indexed {
                        version: d.record.object.version,
                        skipped: d.skipped,
                        failed: false,
                    },
                )
            })
            .collect();
        for (id, pending) in &jobs {
            if result.is_ok() && !failed_jobs.contains(id) {
                queue::complete(
                    &current,
                    &mut edit,
                    id,
                    &pending.token,
                    indexed.get(id.as_str()),
                )
                .await?;
            } else if let Some(bytes) = current.get(&current.keys.pending_file(id)?).await? {
                let mut present: Pending = decode(&bytes)?;
                if present.token == pending.token {
                    present.attempts = present.attempts.saturating_add(1);
                    present.retry_after_seconds = now + (1_i64 << present.attempts.min(8));
                    edit.put(current.keys.pending_file(id)?, encode(&present)?)?;
                }
            }
        }
        let mut meta = meta(&current).await?;
        meta.pending_after = next;
        if (optimize || meta.last_optimized_seconds == 0) && result.is_ok() {
            meta.last_optimized_seconds = model::now()?.seconds;
        }
        if result.is_ok() && committed {
            meta.last_commit_seconds = model::now()?.seconds;
        }
        edit.put(current.keys.search_meta(), encode(&meta)?)?;
        state.storage.publish(edit.batch).await?;
        result?;
        if !jobs.is_empty() {
            tracing::info!(
                elapsed_ms = started.elapsed().as_millis() as u64,
                durable_ms,
                extract_ms,
                commit_ms,
                maintenance_ms,
                optimize,
                files = jobs.len(),
                text_bytes = bytes,
                "search batch indexed"
            );
        }
        Ok(backfilled || !jobs.is_empty() || rows.len() == BATCH)
    }
    pub(crate) async fn status(
        &self,
        state: &State,
        workspace: &str,
    ) -> Result<IndexStatus, Status> {
        let view = View::new(&state.storage, workspace, BTreeSet::new()).await?;
        let meta = meta(&view).await?;
        let now = model::now()?.seconds;
        let mut status = IndexStatus {
            backfilling: !meta.backfilled,
            last_commit: (meta.last_commit_seconds != 0).then_some(Timestamp {
                seconds: meta.last_commit_seconds,
                nanos: 0,
            }),
            ..Default::default()
        };
        let mut pending = view.scan(view.keys.pending(), None).await?;
        while let Some(row) = pending.next().await.map_err(failed)? {
            let work: Pending = decode(&row.value)?;
            status.pending += 1;
            status.failed += u64::from(work.attempts > 0);
            status.oldest_pending_seconds = status
                .oldest_pending_seconds
                .max(now.saturating_sub(work.enqueued_seconds) as u64);
        }
        let mut indexed = view.scan(view.keys.search_statuses(), None).await?;
        while let Some(row) = indexed.next().await.map_err(failed)? {
            let work: Indexed = decode(&row.value)?;
            status.skipped += u64::from(work.skipped);
        }
        Ok(status)
    }
}
