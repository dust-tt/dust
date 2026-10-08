use crate::block_cache::{BlockCache, Pending};
use crate::mount_publication::Publications;
use crate::{cache::CacheStats, freshness::Freshness, mount_files::FileHandle};
use crate::{client::Client, model::*};
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    time::{Duration, Instant},
};
use tokio::sync::{Mutex, Semaphore};

#[derive(Clone, Copy)]
pub struct Limits {
    pub metadata_nodes: usize,
    pub metadata_bytes: usize,
    pub directory_bytes: usize,
    pub content_bytes: usize,
    pub concurrent_reads: usize,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            metadata_nodes: 100_000,
            metadata_bytes: 128 << 20,
            directory_bytes: 32 << 20,
            content_bytes: 256 << 20,
            concurrent_reads: 8,
        }
    }
}

#[derive(Clone, Debug)]
pub struct ObjectSnapshot {
    pub item: ViewNode,
    pub freshness: Freshness,
    incarnation: Id,
    session: Id,
}

pub struct DirectorySnapshot {
    pub object: Option<ObjectSnapshot>,
    pub entries: Vec<ObjectSnapshot>,
    pub freshness: Freshness,
    pub head: u64,
}

pub struct Read {
    pub object: ObjectSnapshot,
    pub bytes: Vec<u8>,
}

pub struct FileRead {
    pub node: Node,
    pub freshness: Freshness,
    pub bytes: Vec<u8>,
}

type PendingChunks = Pending;

struct Projection {
    incarnation: Id,
    head: u64,
    auth_generation: u64,
    nodes: HashMap<Id, ViewNode>,
    entries: BTreeMap<(Option<Id>, String), Id>,
    bytes: usize,
    freshness: Option<Freshness>,
}

impl Projection {
    fn new(view: View, limits: Limits, freshness: Freshness) -> Result<Self> {
        if view.nodes.len() > limits.metadata_nodes {
            return Err(err(libc::EOVERFLOW, "mount metadata node capacity"));
        }
        let mut nodes = HashMap::new();
        let mut entries = BTreeMap::new();
        let mut bytes = 0usize;
        for item in view.nodes {
            let charge = item
                .namespace_bytes()
                .checked_mul(2)
                .ok_or_else(|| err(libc::EOVERFLOW, "mount metadata charge"))?;
            bytes = bytes
                .checked_add(charge)
                .filter(|bytes| *bytes <= limits.metadata_bytes)
                .ok_or_else(|| err(libc::EOVERFLOW, "mount metadata byte capacity"))?;
            if entries
                .insert(
                    (item.visible_parent.clone(), item.visible_name.clone()),
                    item.node.id.clone(),
                )
                .is_some()
                || nodes.insert(item.node.id.clone(), item).is_some()
            {
                return Err(err(libc::EIO, "duplicate view identity or name"));
            }
        }
        Ok(Self {
            incarnation: view.incarnation,
            head: view.head,
            auth_generation: view.auth_generation,
            nodes,
            entries,
            bytes,
            freshness: Some(freshness),
        })
    }

    fn overlay_directory(
        &mut self,
        parent: &str,
        name: &str,
        outcome: &Outcome,
        limits: Limits,
    ) -> bool {
        let Some(node) = &outcome.node else {
            return false;
        };
        let Some(parent_item) = self.nodes.get(parent) else {
            return false;
        };
        let entry = (Some(parent.to_owned()), name.to_owned());
        if node.kind != Kind::Directory
            || node.unlinked
            || node.parent.as_deref() != Some(parent)
            || node.name != name
            || self.head > outcome.head
            || self.nodes.contains_key(&node.id)
            || self.entries.contains_key(&entry)
            || self
                .freshness
                .is_none_or(|freshness| freshness.requires_refresh_at(Instant::now()))
        {
            return false;
        }
        let item = ViewNode {
            node: node.clone(),
            visible_parent: Some(parent.to_owned()),
            visible_name: name.to_owned(),
            verbs: parent_item.verbs,
        };
        let charge = item.namespace_bytes().saturating_mul(2);
        if self.nodes.len() >= limits.metadata_nodes
            || self.bytes.saturating_add(charge) > limits.metadata_bytes
        {
            return false;
        }
        self.bytes += charge;
        self.entries.insert(entry, node.id.clone());
        self.nodes.insert(node.id.clone(), item);
        true
    }

    fn apply(&mut self, delta: Delta, limits: Limits, freshness: Freshness) -> Result<()> {
        if delta.reset
            || delta.incarnation != self.incarnation
            || delta.from_head != self.head
            || delta.head < self.head
            || delta.auth_generation != self.auth_generation
        {
            return Err(err(libc::ESTALE, "projection delta boundary"));
        }
        let mut affected = HashSet::new();
        let mut names = HashSet::new();
        let mut bytes = self.bytes;
        let mut count = self.nodes.len();
        for id in delta
            .removed
            .iter()
            .chain(delta.upserts.iter().map(|item| &item.node.id))
        {
            if !affected.insert(id.clone()) {
                return Err(err(libc::EIO, "duplicate delta identity"));
            }
            if let Some(previous) = self.nodes.get(id) {
                bytes -= previous.namespace_bytes() * 2;
                count -= 1;
            }
        }
        for item in &delta.upserts {
            let name = (item.visible_parent.clone(), item.visible_name.clone());
            if !names.insert(name.clone())
                || self
                    .entries
                    .get(&name)
                    .is_some_and(|id| !affected.contains(id))
            {
                return Err(err(libc::EIO, "duplicate delta name"));
            }
            bytes = item
                .namespace_bytes()
                .checked_mul(2)
                .and_then(|charge| bytes.checked_add(charge))
                .filter(|bytes| *bytes <= limits.metadata_bytes)
                .ok_or_else(|| err(libc::EOVERFLOW, "mount metadata byte capacity"))?;
            count += 1;
            if count > limits.metadata_nodes {
                return Err(err(libc::EOVERFLOW, "mount metadata node capacity"));
            }
        }
        for id in affected {
            if let Some(previous) = self.nodes.remove(&id) {
                self.entries
                    .remove(&(previous.visible_parent, previous.visible_name));
            }
        }
        for item in delta.upserts {
            self.entries.insert(
                (item.visible_parent.clone(), item.visible_name.clone()),
                item.node.id.clone(),
            );
            self.nodes.insert(item.node.id.clone(), item);
        }
        self.bytes = bytes;
        self.head = delta.head;
        self.freshness = Some(freshness);
        Ok(())
    }

    fn object(&self, item: &ViewNode, session: &str) -> Result<ObjectSnapshot> {
        Ok(ObjectSnapshot {
            item: item.clone(),
            freshness: self
                .freshness
                .ok_or_else(|| err(libc::ESTALE, "unvalidated view"))?,
            incarnation: self.incarnation.clone(),
            session: session.to_owned(),
        })
    }
}

#[derive(Default)]
pub struct BufferCounters {
    pub batches: std::sync::atomic::AtomicU64,
    pub files: std::sync::atomic::AtomicU64,
    pub max_publication_age_us: std::sync::atomic::AtomicU64,
    pub publication_budget_misses: std::sync::atomic::AtomicU64,
}

impl BufferCounters {
    pub fn snapshot(&self) -> serde_json::Value {
        use std::sync::atomic::Ordering::Relaxed;
        serde_json::json!({ "batches": self.batches.load(Relaxed), "files": self.files.load(Relaxed),
            "max_publication_age_us": self.max_publication_age_us.load(Relaxed),
            "publication_budget_misses": self.publication_budget_misses.load(Relaxed),
            "metadata_ttl_ms": 500, "publication_budget_ms": 500 })
    }
}

#[derive(Default)]
struct BufferedWrites {
    files: BTreeMap<Id, FileUpdate>,
    accepted: BTreeMap<Id, Instant>,
    bytes: usize,
    started: Option<Instant>,
    identity: Option<PublicationId>,
    excluded: Option<Id>,
    failure: Option<Error>,
}

pub struct MountCache {
    client: Client,
    limits: Limits,
    projection: Mutex<Option<Projection>>,
    content: BlockCache,
    reads: Semaphore,
    publications: Mutex<Publications>,
    buffered: Mutex<BufferedWrites>,
    pub buffer_counters: std::sync::Arc<BufferCounters>,
}

impl MountCache {
    pub fn new(client: Client, limits: Limits) -> Result<Self> {
        if limits.metadata_nodes == 0
            || limits.metadata_nodes > 100_000
            || limits.metadata_bytes == 0
            || limits.metadata_bytes > 256 << 20
            || limits.directory_bytes == 0
            || limits.directory_bytes > 64 << 20
            || limits.concurrent_reads == 0
            || limits.concurrent_reads > 128
        {
            return Err(err(libc::EINVAL, "mount cache limits"));
        }
        Ok(Self {
            content: BlockCache::new(
                client.clone(),
                limits.content_bytes,
                limits.concurrent_reads,
            ),
            client,
            limits,
            projection: Mutex::new(None),
            publications: Mutex::new(Publications::default()),
            buffered: Mutex::new(BufferedWrites::default()),
            buffer_counters: std::sync::Arc::new(BufferCounters::default()),
            reads: Semaphore::new(limits.concurrent_reads),
        })
    }

    async fn publish_buffer_selected(
        &self,
        buffer: &mut BufferedWrites,
        keep: Option<&str>,
    ) -> Result<()> {
        if buffer.files.is_empty() {
            return Ok(());
        }
        if let Some(failure) = &buffer.failure {
            return Err(failure.clone());
        }
        if buffer.identity.is_none() {
            buffer.excluded = keep.map(str::to_owned);
        }
        let mut remaining = buffer
            .files
            .values()
            .filter(|file| buffer.excluded.as_ref() != Some(&file.node.id))
            .cloned()
            .collect::<Vec<_>>();
        let mut files = Vec::with_capacity(remaining.len());
        while !remaining.is_empty() {
            let index = remaining
                .iter()
                .position(|file| {
                    !remaining
                        .iter()
                        .any(|parent| file.node.parent.as_ref() == Some(&parent.node.id))
                })
                .ok_or_else(|| err(libc::EIO, "buffered namespace cycle"))?;
            files.push(remaining.remove(index));
        }
        if files.is_empty() {
            return Ok(());
        }
        let mutation = Mutation::PutFiles {
            files: files.clone(),
        };
        let identity = match &buffer.identity {
            Some(identity) => identity.clone(),
            None => {
                let identity = self.client.prepare_publication(&mutation)?;
                buffer.identity = Some(identity.clone());
                identity
            }
        };
        let mut publications = self.publications.lock().await;
        if !publications.batch_fits(files.len(), self.limits.metadata_nodes) {
            publications.persist(&self.client, None).await?;
            if !publications.batch_fits(files.len(), self.limits.metadata_nodes) {
                return Err(err(libc::EAGAIN, "publication tracking capacity"));
            }
        }
        match self.client.publish(identity, mutation).await {
            Ok(publication) => {
                use std::sync::atomic::Ordering::Relaxed;
                let age = files
                    .iter()
                    .map(|file| buffer.accepted[&file.node.id])
                    .min()
                    .unwrap()
                    .elapsed()
                    .as_micros()
                    .min(u64::MAX as u128) as u64;
                self.buffer_counters.batches.fetch_add(1, Relaxed);
                self.buffer_counters
                    .files
                    .fetch_add(files.len() as u64, Relaxed);
                self.buffer_counters
                    .max_publication_age_us
                    .fetch_max(age, Relaxed);
                if age > 500_000 {
                    self.buffer_counters
                        .publication_budget_misses
                        .fetch_add(1, Relaxed);
                }
                publications.record_batch(files.iter(), publication);
                for file in files {
                    buffer.bytes -= buffer.files.remove(&file.node.id).unwrap().data.len();
                    buffer.accepted.remove(&file.node.id);
                }
                buffer.started = buffer.accepted.values().copied().min();
                buffer.identity = None;
                buffer.excluded = None;
                if buffer.files.is_empty() {
                    *buffer = BufferedWrites::default();
                }
                Ok(())
            }
            Err(error) => {
                if !matches!(error.code, libc::ETIMEDOUT | libc::EIO) {
                    buffer.failure = Some(error.clone());
                }
                Err(error)
            }
        }
    }

    async fn publish_buffer(&self, buffer: &mut BufferedWrites) -> Result<()> {
        while !buffer.files.is_empty() {
            self.publish_buffer_selected(buffer, None).await?;
        }
        Ok(())
    }

    pub async fn flush_buffer(&self, force: bool) -> Result<()> {
        let mut buffer = self.buffered.lock().await;
        if force
            || buffer
                .started
                .is_some_and(|started| started.elapsed() >= Duration::from_millis(100))
        {
            self.publish_buffer(&mut buffer).await?;
        }
        Ok(())
    }

    pub async fn finish_buffer(&self) -> Result<()> {
        self.flush_buffer(true).await?;
        let mut publications = self.publications.lock().await;
        publications.resolve(&self.client, None).await?;
        publications.persist(&self.client, None).await
    }

    async fn current_projection(&self) -> Result<tokio::sync::MutexGuard<'_, Option<Projection>>> {
        let mut buffer = self.buffered.lock().await;
        if let Some(error) = &buffer.failure {
            return Err(error.clone());
        }
        let mut state = self.projection.lock().await;
        let expired = state
            .as_ref()
            .and_then(|view| view.freshness)
            .is_none_or(|freshness| freshness.requires_refresh_at(Instant::now()));
        if !expired {
            return Ok(state);
        }
        drop(state);
        self.publish_buffer(&mut buffer).await?;
        state = self.projection.lock().await;
        self.refresh(&mut state).await?;
        Ok(state)
    }

    async fn buffer_create(
        &self,
        parent: Id,
        name: String,
        kind: Kind,
        mode: u32,
    ) -> Result<Outcome> {
        if name.is_empty()
            || name == "."
            || name == ".."
            || name.len() > 255
            || name.contains('/')
            || name.contains('\0')
        {
            return Err(err(libc::EINVAL, "invalid filename"));
        }
        self.validation().await?;
        let mut buffer = self.buffered.lock().await;
        if buffer.files.len() >= MAX_BATCH_NODES || buffer.identity.is_some() {
            self.publish_buffer(&mut buffer).await?;
        }
        if let Some(error) = &buffer.failure {
            return Err(error.clone());
        }
        let mut state = self.projection.lock().await;
        let view = state
            .as_mut()
            .ok_or_else(|| err(libc::EIO, "missing projection"))?;
        let parent_item = view
            .nodes
            .get(&parent)
            .ok_or_else(|| err(libc::ENOENT, "parent absent"))?;
        if parent_item.node.kind != Kind::Directory || parent_item.verbs & CREATE == 0 {
            return Err(err(libc::EACCES, "create permission"));
        }
        let verbs = parent_item.verbs;
        if view
            .entries
            .contains_key(&(Some(parent.clone()), name.clone()))
        {
            return Err(err(libc::EEXIST, "entry exists"));
        }
        let node = Node {
            id: id(),
            parent: Some(parent.clone()),
            name: name.clone(),
            kind,
            version: id(),
            entry_token: id(),
            size: 0,
            mode: mode & 0o777,
            mtime_ms: now_ms(),
            unlinked: false,
        };
        let item = ViewNode {
            node: node.clone(),
            visible_parent: Some(parent.clone()),
            visible_name: name.clone(),
            verbs,
        };
        let charge = item.namespace_bytes().saturating_mul(2);
        if view.nodes.len() >= self.limits.metadata_nodes
            || view.bytes.saturating_add(charge) > self.limits.metadata_bytes
        {
            return Err(err(libc::EOVERFLOW, "metadata capacity"));
        }
        view.bytes += charge;
        view.entries.insert((Some(parent), name), node.id.clone());
        view.nodes.insert(node.id.clone(), item);
        let accepted = Instant::now();
        buffer.started.get_or_insert(accepted);
        buffer.accepted.insert(node.id.clone(), accepted);
        buffer.files.insert(
            node.id.clone(),
            FileUpdate {
                node: node.clone(),
                base: None,
                data: Vec::new(),
            },
        );
        Ok(Outcome {
            head: view.head,
            node: Some(node),
            written: 0,
        })
    }

    async fn buffer_edit(&self, mutation: &Mutation) -> Result<Option<Outcome>> {
        let (node, base) = match mutation {
            Mutation::Write { node, base, .. }
            | Mutation::Truncate { node, base, .. }
            | Mutation::SetAttr { node, base, .. } => (node, base),
            _ => return Ok(None),
        };
        if !self.buffered.lock().await.files.contains_key(node) {
            if !matches!(mutation, Mutation::SetAttr { .. })
                || !self.projection.lock().await.as_ref().is_some_and(|view| {
                    view.nodes.get(node).is_some_and(|item| {
                        item.node.kind == Kind::Directory && item.node.parent.is_some()
                    })
                })
            {
                return Ok(None);
            }
            self.validation().await?;
            let mut buffer = self.buffered.lock().await;
            if buffer.files.len() >= MAX_BATCH_NODES || buffer.identity.is_some() {
                self.publish_buffer(&mut buffer).await?;
            }
            let mut state = self.projection.lock().await;
            let view = state
                .as_mut()
                .ok_or_else(|| err(libc::EIO, "missing projection"))?;
            let item = view
                .nodes
                .get_mut(node)
                .ok_or_else(|| err(libc::ENOENT, "directory absent"))?;
            if item.verbs & WRITE == 0 {
                return Err(err(libc::EACCES, "directory attributes permission"));
            }
            if &item.node.version != base || item.node.kind != Kind::Directory {
                return Err(err(libc::ESTALE, "directory version changed"));
            }
            let Mutation::SetAttr { mode, mtime_ms, .. } = mutation else {
                unreachable!()
            };
            let mut updated = item.node.clone();
            if let Some(mode) = mode {
                updated.mode = mode & 0o777;
            }
            if let Some(time) = mtime_ms {
                updated.mtime_ms = *time;
            }
            updated.version = id();
            let accepted = Instant::now();
            buffer.started.get_or_insert(accepted);
            buffer.accepted.insert(node.clone(), accepted);
            buffer.files.insert(
                node.clone(),
                FileUpdate {
                    node: updated.clone(),
                    base: Some(base.clone()),
                    data: Vec::new(),
                },
            );
            item.node = updated.clone();
            return Ok(Some(Outcome {
                head: view.head,
                node: Some(updated),
                written: 0,
            }));
        }
        self.validation().await?;
        let mut buffer = self.buffered.lock().await;
        if let Some(error) = &buffer.failure {
            return Err(error.clone());
        }
        if buffer.identity.is_some() {
            self.publish_buffer(&mut buffer).await?;
        }
        let Some(file) = buffer.files.get(node) else {
            return Ok(None);
        };
        if &file.node.version != base {
            return Err(err(libc::ESTALE, "buffer version changed"));
        }
        if file.node.kind == Kind::Directory && !matches!(mutation, Mutation::SetAttr { .. }) {
            return Err(err(libc::EISDIR, "not a regular file"));
        }
        {
            let state = self.projection.lock().await;
            if state
                .as_ref()
                .and_then(|view| view.nodes.get(node))
                .is_none_or(|item| item.verbs & WRITE == 0)
            {
                return Err(err(libc::EACCES, "write permission"));
            }
        }
        let old_size = file.data.len();
        let size = match mutation {
            Mutation::Write {
                offset,
                data,
                append,
                ..
            } => {
                let offset = if *append { old_size as u64 } else { *offset };
                offset
                    .checked_add(data.len() as u64)
                    .unwrap_or(u64::MAX)
                    .max(old_size as u64)
            }
            Mutation::Truncate { size, .. } => *size,
            _ => old_size as u64,
        };
        if size > MAX_BATCH_BYTES as u64 {
            self.publish_buffer(&mut buffer).await?;
            return Ok(None);
        }
        if buffer.bytes - old_size + size as usize > MAX_BATCH_BYTES {
            self.publish_buffer_selected(&mut buffer, Some(node))
                .await?;
        }
        buffer.bytes = buffer.bytes - old_size + size as usize;
        let file = buffer.files.get_mut(node).unwrap();
        let mut written = 0;
        match mutation {
            Mutation::Write {
                offset,
                data,
                append,
                ..
            } => {
                let offset = if *append {
                    file.data.len()
                } else {
                    *offset as usize
                };
                file.data.resize(size as usize, 0);
                file.data[offset..offset + data.len()].copy_from_slice(data);
                file.node.mtime_ms = now_ms();
                written = data.len() as u32;
            }
            Mutation::Truncate { .. } => {
                file.data.resize(size as usize, 0);
                file.node.mtime_ms = now_ms();
            }
            Mutation::SetAttr { mode, mtime_ms, .. } => {
                if let Some(mode) = mode {
                    file.node.mode = mode & 0o777;
                }
                if let Some(time) = mtime_ms {
                    file.node.mtime_ms = *time;
                }
            }
            _ => unreachable!(),
        }
        file.node.size = size;
        file.node.version = id();
        let node = file.node.clone();
        let mut state = self.projection.lock().await;
        let view = state
            .as_mut()
            .ok_or_else(|| err(libc::EIO, "missing projection"))?;
        let item = view
            .nodes
            .get_mut(&node.id)
            .ok_or_else(|| err(libc::ENOENT, "buffered node absent"))?;
        item.node = node.clone();
        Ok(Some(Outcome {
            head: view.head,
            node: Some(node),
            written,
        }))
    }

    async fn refresh<'a>(&self, state: &'a mut Option<Projection>) -> Result<&'a Projection> {
        for _ in 0..3 {
            let started = Instant::now();
            if state
                .as_ref()
                .and_then(|view| view.freshness)
                .is_some_and(|freshness| !freshness.requires_refresh_at(started))
            {
                return Ok(state.as_ref().unwrap());
            }
            let freshness = Freshness::from_validation_started_at(started);
            let mut applied = false;
            if let Some(view) = state {
                view.freshness = None;
                match self
                    .client
                    .call(Call::Changes {
                        cursor: Cursor {
                            incarnation: view.incarnation.clone(),
                            head: view.head,
                        },
                    })
                    .await
                {
                    Ok(Reply::Delta(delta))
                        if !delta.reset
                            && delta.auth_generation == view.auth_generation
                            && delta.incarnation == view.incarnation =>
                    {
                        view.apply(delta, self.limits, freshness)?;
                        applied = true;
                    }
                    Ok(Reply::Delta(_)) => {}
                    Err(error) if error.code == libc::ESTALE => {}
                    Err(error) => return Err(error),
                    _ => return Err(err(libc::EIO, "mount delta reply")),
                }
            }
            if !applied {
                let view = tokio::time::timeout(
                    Duration::from_secs(120),
                    self.client
                        .view_with_limits(self.limits.metadata_nodes, self.limits.metadata_bytes),
                )
                .await
                .map_err(|_| err(libc::ETIMEDOUT, "mount view deadline"))??;
                *state = Some(Projection::new(view, self.limits, freshness)?);
            }
            if !freshness.requires_refresh_at(Instant::now()) {
                return Ok(state.as_ref().unwrap());
            }
        }
        Err(err(
            libc::ETIMEDOUT,
            "cache validation exceeded freshness deadline",
        ))
    }

    pub async fn invalidate(&self) {
        if let Some(view) = self.projection.lock().await.as_mut() {
            view.freshness = None;
        }
    }

    pub async fn validation(&self) -> Result<Freshness> {
        let state = self.current_projection().await?;
        Ok(state.as_ref().unwrap().freshness.unwrap())
    }

    pub async fn object(&self, id: &str) -> Result<ObjectSnapshot> {
        let state = self.current_projection().await?;
        let view = state.as_ref().unwrap();
        let item = view
            .nodes
            .get(id)
            .ok_or_else(|| err(libc::ENOENT, "object absent"))?;
        view.object(item, &self.client.session.id)
    }

    pub async fn lookup(&self, parent: Option<&str>, name: &str) -> Result<ObjectSnapshot> {
        self.lookup_entry(parent, name)
            .await?
            .0
            .ok_or_else(|| err(libc::ENOENT, "entry absent"))
    }

    pub async fn lookup_entry(
        &self,
        parent: Option<&str>,
        name: &str,
    ) -> Result<(Option<ObjectSnapshot>, Freshness)> {
        let state = self.current_projection().await?;
        let view = state.as_ref().unwrap();
        if let Some(parent) = parent {
            let item = view
                .nodes
                .get(parent)
                .ok_or_else(|| err(libc::ENOENT, "lookup parent absent"))?;
            if item.node.kind != Kind::Directory {
                return Err(err(libc::ENOTDIR, "lookup parent is not a directory"));
            }
            if item.verbs & TRAVERSE == 0 {
                return Err(err(libc::EACCES, "lookup traversal permission"));
            }
        }
        let object = view
            .entries
            .get(&(parent.map(str::to_owned), name.to_owned()))
            .map(|id| view.object(&view.nodes[id], &self.client.session.id))
            .transpose()?;
        Ok((object, view.freshness.unwrap()))
    }

    pub async fn directory(&self, parent: Option<&str>) -> Result<DirectorySnapshot> {
        let state = self.current_projection().await?;
        let view = state.as_ref().unwrap();
        let parent = parent.map(str::to_owned);
        let object = if let Some(id) = &parent {
            let item = view
                .nodes
                .get(id)
                .ok_or_else(|| err(libc::ENOENT, "directory absent"))?;
            if item.node.kind != Kind::Directory {
                return Err(err(libc::ENOTDIR, "not a directory"));
            }
            if item.verbs & (LIST | TRAVERSE) != LIST | TRAVERSE {
                return Err(err(libc::EACCES, "directory permission"));
            }
            Some(view.object(item, &self.client.session.id)?)
        } else {
            None
        };
        let mut entries = Vec::new();
        let mut bytes = 0usize;
        for ((entry_parent, _), id) in view.entries.range((parent.clone(), String::new())..) {
            if entry_parent != &parent {
                break;
            }
            let item = &view.nodes[id];
            bytes = bytes
                .checked_add(item.namespace_bytes() + 256)
                .filter(|bytes| *bytes <= self.limits.directory_bytes)
                .ok_or_else(|| err(libc::EOVERFLOW, "directory snapshot capacity"))?;
            entries.push(view.object(item, &self.client.session.id)?);
        }
        Ok(DirectorySnapshot {
            object,
            entries,
            freshness: view.freshness.unwrap(),
            head: view.head,
        })
    }

    pub async fn revalidate_directory(
        &self,
        parent: Option<&str>,
        previous: &DirectorySnapshot,
        minimum_lifetime: Duration,
    ) -> Result<DirectorySnapshot> {
        self.invalidate().await;
        let current = self.directory(parent).await?;
        let same = |a: &ObjectSnapshot, b: &ObjectSnapshot| {
            a.incarnation == b.incarnation
                && a.session == b.session
                && a.item.node == b.item.node
                && a.item.verbs == b.item.verbs
                && a.item.visible_parent == b.item.visible_parent
                && a.item.visible_name == b.item.visible_name
        };
        let object_matches = match (&previous.object, &current.object) {
            (Some(a), Some(b)) => same(a, b),
            (None, None) => true,
            _ => false,
        };
        if !object_matches
            || previous.entries.len() != current.entries.len()
            || !previous
                .entries
                .iter()
                .zip(&current.entries)
                .all(|(a, b)| same(a, b))
        {
            return Err(err(
                libc::ESTALE,
                "directory reply changed during validation",
            ));
        }
        if current.freshness.remaining_at(Instant::now()) <= minimum_lifetime {
            return Err(err(libc::ETIMEDOUT, "directory reply validation expired"));
        }
        Ok(current)
    }

    async fn validate_read(&self, object: &ObjectSnapshot) -> Result<ObjectSnapshot> {
        if object.session != self.client.session.id {
            return Err(err(libc::EACCES, "foreign cache snapshot"));
        }
        let current = self.object(&object.item.node.id).await?;
        if current.item.verbs & READ == 0 {
            return Err(err(libc::EACCES, "read permission"));
        }
        if current.incarnation != object.incarnation || current.item.node != object.item.node {
            return Err(err(libc::ESTALE, "object generation changed"));
        }
        Ok(current)
    }

    pub async fn read(&self, object: &ObjectSnapshot, offset: u64, size: u32) -> Result<Read> {
        let _permit = self
            .reads
            .try_acquire()
            .map_err(|_| err(libc::EAGAIN, "mount read admission"))?;
        if size as usize > MAX_IO_BYTES {
            return Err(err(libc::E2BIG, "mount read size"));
        }
        if object.item.node.kind != Kind::File {
            return Err(err(libc::EISDIR, "not a file"));
        }
        self.validate_read(object).await?;
        let (bytes, pending) = self
            .read_contents(&object.item.node, &object.incarnation, None, offset, size)
            .await?;
        let current = self.validate_read(object).await?;
        self.install_chunks(pending);
        Ok(Read {
            object: current,
            bytes,
        })
    }

    async fn read_contents(
        &self,
        node: &Node,
        incarnation: &str,
        handle: Option<&str>,
        offset: u64,
        size: u32,
    ) -> Result<(Vec<u8>, PendingChunks)> {
        if incarnation != self.client.session.incarnation {
            return Err(err(libc::ESTALE, "block cache incarnation"));
        }
        self.content.read(node, handle, offset, size).await
    }

    fn install_chunks(&self, pending: PendingChunks) {
        self.content.install(pending);
    }

    pub async fn open_file(&self, node: &str, flags: i32) -> Result<FileHandle> {
        let object = self.object(node).await?;
        if object.item.node.kind != Kind::File {
            return Err(err(libc::EISDIR, "directory open"));
        }
        let file = FileHandle::cached(&self.client, object.item.node, flags, object.freshness)?;
        let required = if file.readable { READ } else { 0 } | if file.writable { WRITE } else { 0 };
        if object.item.verbs & required != required {
            return Err(err(libc::EACCES, "open permission"));
        }
        Ok(file)
    }

    pub async fn refresh_file(&self, file: &mut FileHandle) -> Result<()> {
        file.owned(&self.client)?;
        match self.object(&file.node.id).await {
            Ok(object) => {
                let required =
                    if file.readable { READ } else { 0 } | if file.writable { WRITE } else { 0 };
                if object.item.verbs & required != required {
                    file.freshness = None;
                    return Err(err(libc::EACCES, "file permission"));
                }
                file.node = object.item.node;
                file.freshness = Some(object.freshness);
                Ok(())
            }
            Err(error) if error.code == libc::ENOENT => file.refresh(&self.client).await,
            Err(error) => {
                file.freshness = None;
                Err(error)
            }
        }
    }

    pub async fn file_metadata(&self, file: &FileHandle) -> Result<(Node, Freshness)> {
        file.owned(&self.client)?;
        match self.object(&file.node.id).await {
            Ok(object) => Ok((object.item.node, object.freshness)),
            Err(error) if error.code == libc::ENOENT => {
                let started = Instant::now();
                let Reply::Node(node) = self
                    .client
                    .call(Call::Stat {
                        node: file.node.id.clone(),
                        handle: Some(file.remote.clone()),
                    })
                    .await?
                else {
                    return Err(err(libc::EIO, "file metadata reply"));
                };
                let freshness = Freshness::from_validation_started_at(started);
                if freshness.requires_refresh_at(Instant::now()) {
                    return Err(err(libc::ETIMEDOUT, "file metadata validation expired"));
                }
                Ok((node, freshness))
            }
            Err(error) => Err(error),
        }
    }

    pub fn try_read_file(
        &self,
        file: &mut FileHandle,
        offset: u64,
        size: u32,
    ) -> Result<Option<Vec<u8>>> {
        file.owned(&self.client)?;
        if !file.readable {
            return Err(err(libc::EBADF, "write-only handle"));
        }
        if size as usize > MAX_IO_BYTES {
            return Err(err(libc::E2BIG, "mount read size"));
        }
        let Ok(buffer) = self.buffered.try_lock() else {
            return Ok(None);
        };
        if let Some(error) = &buffer.failure {
            return Err(error.clone());
        }
        let Ok(state) = self.projection.try_lock() else {
            return Ok(None);
        };
        let Some(view) = state.as_ref() else {
            return Ok(None);
        };
        let Some(freshness) = view
            .freshness
            .filter(|freshness| !freshness.requires_refresh_at(Instant::now()))
        else {
            return Ok(None);
        };
        let Some(item) = view.nodes.get(&file.node.id) else {
            return Ok(None);
        };
        let required = READ | if file.writable { WRITE } else { 0 };
        if item.verbs & required != required {
            return Err(err(libc::EACCES, "file permission"));
        }
        let node = &item.node;
        let bytes = if let Some(pending) = buffer.files.get(&node.id) {
            if pending.node.version != node.version {
                return Ok(None);
            }
            let start = (offset as usize).min(pending.data.len());
            let end = start.saturating_add(size as usize).min(pending.data.len());
            pending.data[start..end].to_vec()
        } else {
            let Some(bytes) = self.content.resident(node, offset, size)? else {
                return Ok(None);
            };
            bytes
        };
        if freshness.requires_refresh_at(Instant::now()) {
            return Ok(None);
        }
        file.node = node.clone();
        file.freshness = Some(freshness);
        Ok(Some(bytes))
    }

    pub async fn read_file(
        &self,
        file: &mut FileHandle,
        offset: u64,
        size: u32,
    ) -> Result<FileRead> {
        self.flush_buffer(true).await?;
        let _permit = self
            .reads
            .try_acquire()
            .map_err(|_| err(libc::EAGAIN, "mount read admission"))?;
        if !file.readable {
            return Err(err(libc::EBADF, "write-only handle"));
        }
        if size as usize > MAX_IO_BYTES {
            return Err(err(libc::E2BIG, "mount read size"));
        }
        self.refresh_file(file).await?;
        let node = file.node.clone();
        let (bytes, pending) = self
            .read_contents(
                &node,
                &self.client.session.incarnation,
                Some(&file.remote),
                offset,
                size,
            )
            .await?;
        self.refresh_file(file).await?;
        if file.node != node {
            return Err(err(libc::ESTALE, "file generation changed during read"));
        }
        self.install_chunks(pending);
        Ok(FileRead {
            node,
            freshness: file.freshness()?,
            bytes,
        })
    }

    async fn prepare_write(&self, file: &mut FileHandle) -> Result<()> {
        file.owned(&self.client)?;
        if !file.writable {
            return Err(err(libc::EBADF, "read-only handle"));
        }
        if let Some(view) = self.projection.lock().await.as_ref()
            && let Some(item) = view.nodes.get(&file.node.id)
        {
            file.node = item.node.clone();
        }
        Ok(())
    }

    pub async fn write_file(
        &self,
        file: &mut FileHandle,
        offset: u64,
        data: Vec<u8>,
    ) -> Result<Outcome> {
        if data.len() > MAX_IO_BYTES {
            return Err(err(libc::E2BIG, "mount write size"));
        }
        self.prepare_write(file).await?;
        let mutation = Mutation::Write {
            node: file.node.id.clone(),
            base: file.node.version.clone(),
            offset,
            data,
            append: file.append,
            handle: Some(file.remote.clone()),
        };
        self.publish_file(file, mutation).await
    }

    pub async fn truncate_file(&self, file: &mut FileHandle, size: u64) -> Result<Outcome> {
        self.prepare_write(file).await?;
        let mutation = Mutation::Truncate {
            node: file.node.id.clone(),
            base: file.node.version.clone(),
            size,
            handle: Some(file.remote.clone()),
        };
        self.publish_file(file, mutation).await
    }

    pub async fn setattr_file(
        &self,
        file: &mut FileHandle,
        mode: Option<u32>,
        mtime_ms: Option<u64>,
    ) -> Result<Outcome> {
        self.prepare_write(file).await?;
        let mutation = Mutation::SetAttr {
            node: file.node.id.clone(),
            base: file.node.version.clone(),
            mode,
            mtime_ms,
            handle: Some(file.remote.clone()),
        };
        self.publish_file(file, mutation).await
    }

    async fn publish_file(&self, file: &mut FileHandle, mutation: Mutation) -> Result<Outcome> {
        file.owned(&self.client)?;
        if !file.writable {
            return Err(err(libc::EBADF, "read-only handle"));
        }
        let outcome = self.mutate(mutation).await?;
        let node = outcome
            .node
            .as_ref()
            .ok_or_else(|| err(libc::EIO, "file publication node absent"))?;
        if node.id != file.node.id || node.kind != Kind::File {
            return Err(err(libc::EIO, "file publication identity"));
        }
        file.node = node.clone();
        Ok(outcome)
    }

    pub async fn flush_file(&self, file: &mut FileHandle) -> Result<()> {
        file.owned(&self.client)?;
        {
            let buffer = self.buffered.lock().await;
            if let Some(error) = &buffer.failure {
                return Err(error.clone());
            }
            if buffer.identity.is_some() {
                return Err(err(libc::ETIMEDOUT, "buffer publication unresolved"));
            }
        }
        let result: Result<bool> = async {
            let mut publications = self.publications.lock().await;
            let mut resolved = publications
                .resolve(&self.client, Some(&file.node.id))
                .await?;
            if let Some(parent) = &file.node.parent {
                resolved |= publications.resolve(&self.client, Some(parent)).await?;
            }
            Ok(resolved)
        }
        .await;
        if !matches!(result, Ok(false)) {
            self.invalidate().await;
        }
        result?;
        self.refresh_file(file).await
    }

    pub async fn sync_file(&self, file: &mut FileHandle) -> Result<()> {
        self.flush_buffer(true).await?;
        self.flush_file(file).await?;
        self.publications
            .lock()
            .await
            .persist(&self.client, Some(&file.node.id))
            .await
    }

    pub async fn close_file(&self, file: FileHandle) -> Result<()> {
        file.close(&self.client).await
    }

    pub async fn mutate(&self, mutation: Mutation) -> Result<Outcome> {
        if let Mutation::Create {
            parent,
            name,
            kind,
            mode,
        } = &mutation
        {
            if self.object(parent).await?.item.verbs & WRITE != 0 {
                return self
                    .buffer_create(parent.clone(), name.clone(), *kind, *mode)
                    .await;
            }
        }
        if let Some(outcome) = self.buffer_edit(&mutation).await? {
            return Ok(outcome);
        }
        self.flush_buffer(true).await?;
        let base = match &mutation {
            Mutation::Write { node, base, .. }
            | Mutation::Truncate { node, base, .. }
            | Mutation::SetAttr { node, base, .. } => Some((node.clone(), base.clone())),
            _ => None,
        };
        let created = match &mutation {
            Mutation::Create {
                parent,
                name,
                kind: Kind::Directory,
                ..
            } => Some((parent.clone(), name.clone())),
            _ => None,
        };
        let result = self
            .publications
            .lock()
            .await
            .publish(&self.client, mutation, self.limits.metadata_nodes)
            .await;
        let mut projection = self.projection.lock().await;
        if let Some(view) = projection.as_mut() {
            if let (Some((id, base)), Ok(outcome)) = (base, &result)
                && let Some(node) = &outcome.node
                && node.id == id
                && view.head <= outcome.head
                && let Some(item) = view.nodes.get_mut(&id)
                && item.node.version == base
            {
                item.node = node.clone();
            } else if let (Some((parent, name)), Ok(outcome)) = (created, &result) {
                if !view.overlay_directory(&parent, &name, outcome, self.limits) {
                    view.freshness = None;
                }
            } else {
                view.freshness = None;
            }
        }
        result
    }

    pub async fn sync_namespace(&self, node: Option<&str>) -> Result<()> {
        self.flush_buffer(true).await?;
        self.validation().await?;
        let mut publications = self.publications.lock().await;
        let result = publications.resolve(&self.client, node).await;
        if !matches!(result, Ok(false)) {
            self.invalidate().await;
        }
        result?;
        publications.persist(&self.client, node).await
    }

    pub fn content_stats(&self) -> CacheStats {
        self.content.stats()
    }
}
