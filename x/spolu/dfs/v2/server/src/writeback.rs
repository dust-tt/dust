use crate::{
    State,
    auth::SessionState,
    model,
    mutation::{Change, Edit},
    patch,
    read::View,
    storage::{Snapshot, WriteBatch, encode},
};
use anyhow::ensure;
use clap::Args;
use dfs_protocol::{
    error::{code, status},
    rpc::*,
    validate,
};
use futures::{StreamExt, stream};
use std::{
    collections::{BTreeMap, BTreeSet},
    sync::{Arc, Weak},
    time::{Duration, Instant},
};
use tokio::sync::{Mutex, OnceCell, watch};
use tonic::Status;

type Result<T> = std::result::Result<T, Status>;
type FileKey = (String, String);
const MAX_FILES: usize = 16_384;
const MAX_RECEIPTS: usize = 32_768;
const MAX_OPS: usize = 64;

#[derive(Args, Clone, Debug)]
pub struct WritebackConfig {
    /// Zero retains synchronous durable writes and strict expected-version checks.
    #[arg(long, env = "DFS_WRITEBACK_MIB", default_value_t = 256)]
    pub writeback_mib: usize,
    #[arg(long, env = "DFS_WRITEBACK_DEBOUNCE_MS", default_value_t = 50)]
    pub writeback_debounce_ms: u64,
    #[arg(long, env = "DFS_WRITEBACK_MAX_AGE_MS", default_value_t = 500)]
    pub writeback_max_age_ms: u64,
    #[arg(long, env = "DFS_WRITEBACK_CONCURRENCY", default_value_t = 8)]
    pub writeback_concurrency: usize,
    #[arg(long, env = "DFS_WRITEBACK_BATCH_KIB", default_value_t = 4096)]
    pub writeback_batch_kib: usize,
    #[arg(long, env = "DFS_WRITEBACK_BATCH_FILES", default_value_t = 64)]
    pub writeback_batch_files: usize,
}

impl Default for WritebackConfig {
    fn default() -> Self {
        Self {
            writeback_mib: 256,
            writeback_debounce_ms: 50,
            writeback_max_age_ms: 500,
            writeback_concurrency: 8,
            writeback_batch_kib: 4096,
            writeback_batch_files: 64,
        }
    }
}
impl WritebackConfig {
    pub fn disabled() -> Self {
        Self {
            writeback_mib: 0,
            ..Self::default()
        }
    }
}

struct Operation {
    change: Change,
    time: Timestamp,
    session: Arc<SessionState>,
}
impl Operation {
    fn project(&self, object: Object, version: u64) -> Result<Object> {
        match &self.change {
            Change::Write(r) => patch::write(object, r, self.time, version),
            Change::Update(r) => patch::update(object, r, self.time, version),
            _ => Err(status(ErrorCode::Internal)),
        }
    }
}

#[derive(Clone)]
struct Pending {
    base: u64,
    version: u64,
    operations: Vec<Arc<Operation>>,
    bytes: usize,
    first: Instant,
    last: Instant,
}
impl Pending {
    fn due(&self, config: &WritebackConfig, now: Instant) -> bool {
        now.duration_since(self.last).as_millis() >= config.writeback_debounce_ms as u128
            || now.duration_since(self.first).as_millis() >= config.writeback_max_age_ms as u128
    }
    fn project(&self, mut object: Object) -> Result<Object> {
        for operation in &self.operations {
            object = operation.project(object, self.version)?;
        }
        Ok(object)
    }
}
struct Receipt {
    session: Weak<SessionState>,
    pending: usize,
    error: Option<Status>,
}
#[derive(Default)]
struct Queue {
    files: BTreeMap<FileKey, Pending>,
    receipts: BTreeMap<(String, String), Receipt>,
    bytes: usize,
    peak_bytes: usize,
    accepted: u64,
    committed: u64,
    commits: u64,
    failures: u64,
}
impl Queue {
    fn reap(&mut self) {
        self.receipts
            .retain(|_, r| r.session.upgrade().is_some_and(|s| s.active().is_ok()));
    }
    fn ready(&self, config: &WritebackConfig) -> BTreeSet<String> {
        let now = Instant::now();
        let mut workspaces = BTreeMap::<String, (usize, usize, bool)>::new();
        for ((workspace, _), pending) in &self.files {
            let entry = workspaces.entry(workspace.clone()).or_default();
            entry.0 += pending.bytes;
            entry.1 += 1;
            entry.2 |= pending.due(config, now);
        }
        workspaces
            .into_iter()
            .filter_map(|(workspace, (bytes, count, due))| {
                (due || bytes >= config.writeback_batch_kib * 1024
                    || count >= config.writeback_batch_files)
                    .then_some(workspace)
            })
            .collect()
    }
}

/// @cc [owner:spolu,label:concurrency;performance] bounded-memory-publication
/// Retain only bounded semantic edits; never stale whole-object replacements. Local acceptance and
/// reads MUST hold the workspace read gate; publication MUST hold its write gate through commit and
/// queue removal. No queue mutex may span I/O. Independent processes require no shared ownership.
pub(crate) struct Writeback {
    config: WritebackConfig,
    queue: Mutex<Queue>,
    stop: watch::Sender<bool>,
    task: OnceCell<Mutex<Option<tokio::task::JoinHandle<()>>>>,
}
impl Writeback {
    pub fn new(config: WritebackConfig) -> anyhow::Result<Self> {
        ensure!(
            config.writeback_mib <= 16_384,
            "writeback memory exceeds 16 GiB"
        );
        ensure!(
            (1..=64).contains(&config.writeback_concurrency),
            "invalid writeback concurrency"
        );
        ensure!(
            (2048..=4096).contains(&config.writeback_batch_kib),
            "writeback batch must be 2..4 MiB"
        );
        ensure!(
            (1..=128).contains(&config.writeback_batch_files),
            "invalid writeback file count"
        );
        ensure!(
            config.writeback_debounce_ms <= config.writeback_max_age_ms
                && (1..=60_000).contains(&config.writeback_max_age_ms),
            "invalid writeback delays"
        );
        let (stop, _) = watch::channel(false);
        Ok(Self {
            config,
            queue: Mutex::new(Queue::default()),
            stop,
            task: OnceCell::new(),
        })
    }
    pub fn enabled(&self) -> bool {
        self.config.writeback_mib != 0
    }
    fn batch_bytes(&self) -> usize {
        self.config.writeback_batch_kib * 1024
    }
    pub fn start(self: &Arc<Self>, state: Weak<State>) -> anyhow::Result<()> {
        if self.enabled() {
            let writer = self.clone();
            self.task
                .set(Mutex::new(Some(
                    tokio::runtime::Handle::try_current()?
                        .spawn(async move { writer.run(state).await }),
                )))
                .map_err(|_| anyhow::anyhow!("writeback already started"))?;
        }
        Ok(())
    }
    pub async fn error(&self, session: &SessionState, id: &str) -> Result<()> {
        let queue = self.queue.lock().await;
        match queue
            .receipts
            .get(&(session.info.id.clone(), id.to_owned()))
            .and_then(|r| r.error.clone())
        {
            Some(error) => Err(error),
            None => Ok(()),
        }
    }
    pub async fn dirty(&self, workspace: &str, id: &str) -> bool {
        self.queue
            .lock()
            .await
            .files
            .contains_key(&(workspace.into(), id.into()))
    }
    pub async fn pending_ids(&self, workspace: &str) -> BTreeSet<String> {
        self.queue
            .lock()
            .await
            .files
            .keys()
            .filter(|(w, _)| w == workspace)
            .map(|(_, id)| id.clone())
            .collect()
    }

    /// The caller holds the workspace read gate. Metadata projection never reads content blocks.
    pub async fn project(&self, state: &State, workspace: &str, object: Object) -> Result<Object> {
        if !self.enabled() || object.directory || matches!(object.id.as_str(), "root" | "shared") {
            return Ok(object);
        }
        let locks = state.locks(workspace).await;
        let file = locks.file(&object.id).await;
        let _guard = file.lock().await;
        self.project_locked(state, workspace, object).await
    }
    async fn project_locked(
        &self,
        state: &State,
        workspace: &str,
        object: Object,
    ) -> Result<Object> {
        let key = (workspace.to_owned(), object.id.clone());
        let pending = self.queue.lock().await.files.get(&key).cloned();
        let Some(mut pending) = pending else {
            return Ok(object);
        };
        if pending.base != object.version {
            pending.base = object.version;
            pending.version = state.storage.version().await?;
            self.queue.lock().await.files.insert(key, pending.clone());
        }
        pending.project(object)
    }

    /// @cc [owner:spolu,label:backend;security] file-memory-acceptance
    /// Validate live existence, authority, and the resulting metadata before acknowledging RAM.
    /// Positioned file writes/updates MAY overwrite stale expected versions. A capacity rejection
    /// MUST NOT accept the operation. Pressure flushing MUST happen after releasing read/file gates.
    pub async fn accept(
        &self,
        state: &State,
        session: &Arc<SessionState>,
        change: &Change,
    ) -> Result<Option<Mutation>> {
        if !self.enabled()
            || !matches!(
                change,
                Change::Update(_) | Change::Write(WriteRequest { append: false, .. })
            )
        {
            return Ok(None);
        }
        let id = validate::id(change.primary_id())?;
        let workspace = &session.info.workspace_id;
        let started = Instant::now();
        loop {
            let locks = state.locks(workspace).await;
            let gate = locks.topology.read().await;
            let file = locks.file(&id).await;
            let guard = file.lock().await;
            session.active()?;
            let view = View::prefetch(
                state.storage.snapshot().await?,
                workspace,
                session.grants.clone(),
                &id,
                None,
                state.ancestry.clone(),
            )
            .await?;
            let current = view.stat(&id).await?.object;
            if current.directory {
                return Ok(None);
            }
            self.error(session, &id).await?;
            let base = current.version;
            let visible = self.project_locked(state, workspace, current).await?;
            let operation = Arc::new(Operation {
                change: change.clone(),
                time: model::now()?,
                session: session.clone(),
            });
            let object = operation.project(visible.clone(), state.storage.version().await?)?;
            if object == visible {
                return Ok(Some(Mutation {
                    object: Some(object),
                    related: vec![],
                }));
            }
            let payload = match change {
                Change::Write(r) => encode(r)?.len(),
                Change::Update(r) => encode(r)?.len(),
                _ => return Err(status(ErrorCode::Internal)),
            };
            let attribute_slots = match change {
                Change::Update(r) => r.xattrs.len(),
                _ => 0,
            };
            let charge = payload
                + 3 * encode(&object)?.len()
                + 3 * encode(&session.info)?.len()
                + session.grants.len() * 128
                + attribute_slots * 80
                + 2048;
            if charge > self.batch_bytes() {
                return Err(status(ErrorCode::Capacity));
            }
            let key = (workspace.clone(), id.clone());
            let receipt_key = (session.info.id.clone(), id.clone());
            let mut queue = self.queue.lock().await;
            queue.reap();
            let file_full = queue.files.get(&key).is_some_and(|p| {
                p.bytes + charge > self.batch_bytes() || p.operations.len() >= MAX_OPS
            });
            let full = file_full
                || queue.bytes + charge > self.config.writeback_mib * 1024 * 1024
                || (!queue.files.contains_key(&key) && queue.files.len() >= MAX_FILES)
                || (!queue.receipts.contains_key(&receipt_key)
                    && queue.receipts.len() >= MAX_RECEIPTS);
            if !full {
                session.active()?;
                let now = Instant::now();
                let pending = queue.files.entry(key).or_insert_with(|| Pending {
                    base,
                    version: object.version,
                    operations: Vec::new(),
                    bytes: 0,
                    first: now,
                    last: now,
                });
                pending.base = base;
                pending.version = object.version;
                pending.operations.push(operation);
                pending.bytes += charge;
                pending.last = now;
                queue.bytes += charge;
                queue.peak_bytes = queue.peak_bytes.max(queue.bytes);
                queue.accepted += 1;
                queue
                    .receipts
                    .entry(receipt_key)
                    .or_insert_with(|| Receipt {
                        session: Arc::downgrade(session),
                        pending: 0,
                        error: None,
                    })
                    .pending += 1;
                return Ok(Some(Mutation {
                    object: Some(object),
                    related: vec![],
                }));
            }
            let pressure_workspace = if file_full {
                Some(workspace.clone())
            } else {
                queue
                    .files
                    .iter()
                    .min_by_key(|(_, p)| p.first)
                    .map(|((w, _), _)| w.clone())
            };
            drop(queue);
            drop(guard);
            drop(gate);
            if started.elapsed() >= Duration::from_secs(10) {
                return Err(status(ErrorCode::Capacity));
            }
            let Some(pressure_workspace) = pressure_workspace else {
                return Err(status(ErrorCode::Capacity));
            };
            let locks = state.locks(&pressure_workspace).await;
            let _gate = locks.topology.write().await;
            self.flush_locked(state, &pressure_workspace, None, true)
                .await;
        }
    }

    /// Stage one file in a short transaction. Intermediate records never escape that transaction.
    async fn replay(
        &self,
        state: &State,
        snapshot: Arc<Snapshot>,
        workspace: &str,
        id: &str,
        pending: &Pending,
        reader: Option<&BTreeSet<String>>,
    ) -> Result<Object> {
        let first = pending
            .operations
            .first()
            .ok_or_else(|| status(ErrorCode::Internal))?;
        let grants = reader.unwrap_or(&first.session.grants).clone();
        let initial = View::prefetch(
            snapshot.clone(),
            workspace,
            grants,
            id,
            None,
            state.ancestry.clone(),
        )
        .await?;
        let base = initial.stat(id).await?.object.version;
        let version = if base == pending.base {
            pending.version
        } else {
            state.storage.version().await?
        };
        let mut result = None;
        for operation in &pending.operations {
            let grants = reader.unwrap_or(&operation.session.grants).clone();
            let view = View::from_snapshot(snapshot.clone(), workspace, grants).await?;
            let before = view.stat(id).await?;
            let object = operation.project(before.object.clone(), version)?;
            let change = match &operation.change {
                Change::Write(r) => Change::Write(WriteRequest {
                    expected_version: before.object.version,
                    ..r.clone()
                }),
                Change::Update(r) => Change::Update(UpdateRequest {
                    expected_version: before.object.version,
                    ..r.clone()
                }),
                _ => return Err(status(ErrorCode::Internal)),
            };
            let (edit, _) = change.prepare(&view, None).await?;
            edit.batch.apply(&snapshot)?;
            let mut final_record = Edit::new();
            final_record.record(
                &view.keys,
                &model::Record {
                    object: object.clone(),
                    parent: before.parent,
                },
            )?;
            final_record.batch.apply(&snapshot)?;
            result = Some(object);
        }
        result.ok_or_else(|| status(ErrorCode::Internal))
    }

    /// The caller holds the workspace read gate. Only the requesting session authorizes RAM reads.
    pub async fn read(
        &self,
        state: &State,
        session: &SessionState,
        request: ReadRequest,
    ) -> Result<ReadResponse> {
        if request.length as usize > dfs_protocol::MAX_IO {
            return Err(status(ErrorCode::InvalidInput));
        }
        let id = validate::id(&request.object_id)?;
        let workspace = &session.info.workspace_id;
        let locks = state.locks(workspace).await;
        let file = locks.file(&id).await;
        let _guard = file.lock().await;
        let snapshot = state.storage.snapshot().await?;
        if !self.dirty(workspace, &id).await {
            let (view, ahead) = tokio::join!(
                View::prefetch(
                    snapshot.clone(),
                    workspace,
                    session.grants.clone(),
                    &id,
                    None,
                    state.ancestry.clone()
                ),
                crate::mutation::prefetch_read(&snapshot, workspace, &request),
            );
            return view?.read(request, ahead).await;
        }
        let view = View::prefetch(
            snapshot.clone(),
            workspace,
            session.grants.clone(),
            &id,
            None,
            state.ancestry.clone(),
        )
        .await?;
        let object = view.stat(&id).await?.object;
        let object = self.project_locked(state, workspace, object).await?;
        if object.directory {
            return Err(status(ErrorCode::IsDirectory));
        }
        if let Some(version) = request.version {
            model::check(&object, version)?;
        }
        if request.length == 0 || request.offset >= object.size {
            return Ok(ReadResponse {
                data: vec![],
                size: object.size,
                version: object.version,
            });
        }
        let pending = self
            .queue
            .lock()
            .await
            .files
            .get(&(workspace.clone(), id.clone()))
            .cloned();
        if let Some(pending) = pending {
            self.replay(
                state,
                snapshot.clone(),
                workspace,
                &id,
                &pending,
                Some(&session.grants),
            )
            .await?;
            View::from_snapshot(snapshot, workspace, session.grants.clone())
                .await?
                .read(request, None)
                .await
        } else {
            view.read(request, None).await
        }
    }

    /// @cc [owner:spolu,label:concurrency;error-handling] publication-outcomes
    /// Flush MUST retain the workspace write gate until queued payloads and receipts reflect the
    /// commit result. Every terminal failure MUST reach all affected sessions. Ambiguous results
    /// MUST NOT replay; definitive application failures MAY split an uncommitted multi-file batch.
    pub async fn flush_locked(
        &self,
        state: &State,
        workspace: &str,
        ids: Option<&BTreeSet<String>>,
        all: bool,
    ) {
        loop {
            let batch = {
                let queue = self.queue.lock().await;
                let now = Instant::now();
                let mut bytes = 0;
                let mut batch = Vec::new();
                let mut candidates: Vec<_> = queue
                    .files
                    .iter()
                    .filter(|((w, id), _)| w == workspace && ids.is_none_or(|ids| ids.contains(id)))
                    .collect();
                let pressure = candidates.len() >= self.config.writeback_batch_files
                    || candidates.iter().map(|(_, p)| p.bytes).sum::<usize>() >= self.batch_bytes();
                candidates.sort_by_key(|(_, p)| p.first);
                for ((_, id), pending) in candidates {
                    if !all && !pressure && !pending.due(&self.config, now) {
                        continue;
                    }
                    if batch.len() >= self.config.writeback_batch_files
                        || bytes + pending.bytes > self.batch_bytes()
                    {
                        break;
                    }
                    bytes += pending.bytes;
                    batch.push((id.clone(), pending.clone()));
                }
                batch
            };
            if batch.is_empty() {
                break;
            }
            self.publish(state, workspace, batch).await;
            if !all {
                break;
            }
        }
    }
    async fn publish(&self, state: &State, workspace: &str, batch: Vec<(String, Pending)>) {
        let mut attempts = vec![batch];
        while let Some(batch) = attempts.pop() {
            let started = Instant::now();
            let result = state
                .storage
                .transact(|snapshot| {
                    let batch = &batch;
                    async move {
                        for (id, pending) in batch {
                            self.replay(state, snapshot.clone(), workspace, id, pending, None)
                                .await?;
                        }
                        Ok((WriteBatch::new(), ()))
                    }
                })
                .await;
            if let Err(error) = &result {
                // Unavailable includes exhausted/ambiguous FDB outcomes: never retry those here.
                if !matches!(code(error), ErrorCode::Unavailable | ErrorCode::Internal)
                    && batch.len() > 1
                {
                    let mut left = batch;
                    let right = left.split_off(left.len() / 2);
                    attempts.push(right);
                    attempts.push(left);
                    continue;
                }
            }
            let operations: usize = batch.iter().map(|(_, p)| p.operations.len()).sum();
            let bytes: usize = batch.iter().map(|(_, p)| p.bytes).sum();
            tracing::info!(
                files = batch.len(),
                operations,
                bytes,
                elapsed_us = started.elapsed().as_micros() as u64,
                success = result.is_ok(),
                "writeback publication"
            );
            let mut queue = self.queue.lock().await;
            if result.is_ok() {
                queue.commits += 1;
                queue.committed += operations as u64;
            } else {
                queue.failures += operations as u64;
            }
            for (id, pending) in batch {
                queue.files.remove(&(workspace.into(), id.clone()));
                queue.bytes -= pending.bytes;
                for op in &pending.operations {
                    let key = (op.session.info.id.clone(), id.clone());
                    if let Some(receipt) = queue.receipts.get_mut(&key) {
                        receipt.pending -= 1;
                        if let Err(error) = &result {
                            receipt.error.get_or_insert_with(|| error.clone());
                        }
                        if receipt.pending == 0 && receipt.error.is_none() {
                            queue.receipts.remove(&key);
                        }
                    }
                }
            }
            queue.reap();
        }
    }
    async fn run(self: Arc<Self>, weak: Weak<State>) {
        let mut stop = self.stop.subscribe();
        let mut cursor = String::new();
        loop {
            tokio::select! { _ = stop.changed() => return, _ = tokio::time::sleep(Duration::from_millis(10)) => {} }
            if *stop.borrow() {
                return;
            }
            let Some(state) = weak.upgrade() else {
                return;
            };
            let workspaces = {
                let queue = self.queue.lock().await;
                let mut workspaces: Vec<_> = queue.ready(&self.config).into_iter().collect();
                let split = workspaces.partition_point(|w| w <= &cursor);
                workspaces.rotate_left(split);
                workspaces.truncate(self.config.writeback_concurrency);
                workspaces
            };
            if let Some(last) = workspaces.last() {
                cursor = last.clone();
            }
            stream::iter(workspaces)
                .for_each_concurrent(self.config.writeback_concurrency, |workspace| {
                    let state = &state;
                    let writer = &self;
                    async move {
                        let locks = state.locks(&workspace).await;
                        let _guard = locks.topology.write().await;
                        writer.flush_locked(state, &workspace, None, false).await;
                    }
                })
                .await;
        }
    }
    pub async fn session_ids(&self, session: &SessionState) -> BTreeSet<String> {
        self.queue
            .lock()
            .await
            .files
            .iter()
            .filter(|((w, _), p)| {
                w == &session.info.workspace_id
                    && p.operations
                        .iter()
                        .any(|op| op.session.info.id == session.info.id)
            })
            .map(|((_, id), _)| id.clone())
            .collect()
    }
    pub async fn forget_session(&self, session: &SessionState) -> Result<()> {
        let mut queue = self.queue.lock().await;
        let error = queue
            .receipts
            .iter()
            .find_map(|((s, _), r)| (s == &session.info.id).then(|| r.error.clone()).flatten());
        queue.receipts.retain(|(s, _), _| s != &session.info.id);
        error.map_or(Ok(()), Err)
    }
    pub async fn drain(&self, state: &State) -> Result<()> {
        let started = Instant::now();
        let (initial_files, initial_bytes) = {
            let queue = self.queue.lock().await;
            (queue.files.len(), queue.bytes)
        };
        self.stop.send_replace(true);
        if let Some(task) = self.task.get()
            && let Some(task) = task.lock().await.take()
        {
            task.await.map_err(|_| status(ErrorCode::Internal))?;
        }
        let workspaces = {
            let queue = self.queue.lock().await;
            queue
                .files
                .keys()
                .map(|(w, _)| w.clone())
                .collect::<BTreeSet<_>>()
        };
        for workspace in workspaces {
            let locks = state.locks(&workspace).await;
            let _guard = locks.topology.write().await;
            self.flush_locked(state, &workspace, None, true).await;
        }
        let (peak_bytes, accepted, committed, commits, failures, failed) = {
            let mut queue = self.queue.lock().await;
            queue.reap();
            (
                queue.peak_bytes,
                queue.accepted,
                queue.committed,
                queue.commits,
                queue.failures,
                queue.receipts.values().any(|r| r.error.is_some()),
            )
        };
        tracing::info!(
            drain_us = started.elapsed().as_micros() as u64,
            initial_files,
            initial_bytes,
            peak_bytes,
            accepted,
            committed,
            commits,
            failures,
            "writeback drained"
        );
        if failed {
            return Err(status(ErrorCode::Unavailable));
        }
        Ok(())
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::{
        api::Api,
        storage::{Storage, StorageConfig},
    };
    use anyhow::Context;
    use dfs_protocol::rpc::dfs_server::Dfs;
    use tonic::Request;

    fn request<T>(key: &str, value: T) -> anyhow::Result<Request<T>> {
        let mut request = Request::new(value);
        request
            .metadata_mut()
            .insert("authorization", format!("Bearer {key}").parse()?);
        Ok(request)
    }

    pub async fn ambiguous_publication_is_not_replayed() -> anyhow::Result<()> {
        let storage = Storage::open(&StorageConfig {
            fdb_cluster_file: std::env::var("DFS_FDB_CLUSTER_FILE")?,
            fdb_prefix: format!("dfs-v2-unknown-writeback-{}", uuid::Uuid::new_v4().simple()),
        })
        .await?;
        let key = "ab".repeat(32);
        let state = State::with_writeback(
            storage,
            &key,
            WritebackConfig {
                writeback_debounce_ms: 60_000,
                writeback_max_age_ms: 60_000,
                ..Default::default()
            },
        )?;
        let api = Api(state.clone());
        let workspace = api
            .create_workspace(request(
                &key,
                CreateWorkspaceRequest {
                    workspace_id: "unknown".into(),
                    root_grants: vec!["owner".into()],
                },
            )?)
            .await?
            .into_inner();
        let session = api
            .create_session(request(
                &workspace.workspace_key,
                CreateSessionRequest {
                    workspace_id: workspace.workspace_id.clone(),
                    grants: vec!["owner".into()],
                },
            )?)
            .await?
            .into_inner();
        let file = api
            .create(request(
                &session.session_key,
                CreateRequest {
                    parent_id: workspace.root_id,
                    expected_parent_version: 1,
                    name: "file".into(),
                    mode: 0o600,
                    ..Default::default()
                },
            )?)
            .await?
            .into_inner()
            .object
            .context("created file")?;
        let accepted = api
            .write(request(
                &session.session_key,
                WriteRequest {
                    object_id: file.id.clone(),
                    expected_version: file.version,
                    data: b"committed once".to_vec(),
                    ..Default::default()
                },
            )?)
            .await?
            .into_inner()
            .object
            .context("accepted write")?;
        state.storage.lose_next_commit_reply();
        for _ in 0..2 {
            let result = api
                .fsync(request(
                    &session.session_key,
                    ObjectRequest {
                        object_id: file.id.clone(),
                    },
                )?)
                .await;
            assert_eq!(
                code(&result.err().context("ambiguous commit reported success")?),
                ErrorCode::Unavailable
            );
        }
        let published = api
            .stat(request(
                &session.session_key,
                ObjectRequest {
                    object_id: file.id.clone(),
                },
            )?)
            .await?
            .into_inner();
        assert_eq!(
            published.version, accepted.version,
            "replay would assign a rebased token"
        );
        let bytes = api
            .read(request(
                &session.session_key,
                ReadRequest {
                    object_id: file.id.clone(),
                    length: 100,
                    version: Some(accepted.version),
                    ..Default::default()
                },
            )?)
            .await?
            .into_inner();
        assert_eq!(bytes.data, b"committed once");
        let result = api
            .close_session(request(&session.session_key, Empty {})?)
            .await;
        assert_eq!(
            code(&result.err().context("close hid deferred error")?),
            ErrorCode::Unavailable
        );
        state.drain().await?;
        state
            .storage
            .transact(|_| async {
                let mut batch = WriteBatch::new();
                batch.clear(Vec::new(), vec![255]);
                Ok((batch, ()))
            })
            .await?;
        Ok(())
    }
}
