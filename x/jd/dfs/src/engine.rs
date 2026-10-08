use crate::model::*;
use crate::store::WriteBatch;
use crate::store::{Reader, Store, decode_key, key};
use parking_lot::{Mutex, RwLock};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use tokio::sync::broadcast;

#[derive(Clone)]
pub struct Limits {
    pub tenant_bytes: u64,
    pub pending_bytes: u64,
    pub max_nodes: usize,
    pub snapshot_bytes: usize,
    pub max_sessions: usize,
    pub max_handles: usize,
    pub session_ms: u64,
    pub retry_ms: u64,
    pub writer_lease_ms: u64,
}
impl Default for Limits {
    fn default() -> Self {
        Self {
            tenant_bytes: 8 << 30,
            pending_bytes: 256 << 20,
            max_nodes: 100_000,
            snapshot_bytes: 256 << 20,
            max_sessions: 256,
            max_handles: 100_000,
            session_ms: 3_600_000,
            retry_ms: 3_600_000,
            writer_lease_ms: 30_000,
        }
    }
}
#[derive(Clone)]
struct Handle {
    session: Id,
    node: Id,
    write: bool,
    fence: Option<Id>,
}
#[path = "export.rs"]
mod export;
#[path = "search.rs"]
mod search;
#[path = "writer_leases.rs"]
mod writer_leases;
pub use search::node_label;
#[cfg(test)]
#[path = "persistence_tests.rs"]
mod persistence_tests;

pub struct Engine {
    index_leases: Mutex<HashMap<Id, export::IndexLease>>,
    pub store: Store,
    pub incarnation: Id,
    pub limits: Limits,
    writer: Mutex<()>,
    persistence: Mutex<()>,
    sessions: RwLock<HashMap<Id, Session>>,
    handles: Mutex<HashMap<Id, Handle>>,
    writers: Mutex<HashMap<(Id, Id), writer_leases::Owner>>,
    view_pins: Mutex<HashMap<Id, BTreeSet<Id>>>,
    credentials: HashMap<String, Credential>,
    pub notifications: broadcast::Sender<Id>,
    published: AtomicU64,
    persisted: AtomicU64,
    pending_bytes: AtomicU64,
    last_sync_ms: AtomicU64,
    storage_error: Mutex<Option<String>>,
    pub fail_sync: AtomicBool,
    draining: AtomicBool,
    pub fault: Mutex<Option<(String, u64)>>,
}
pub fn token_hash(token: &str) -> String {
    format!("{:x}", Sha256::digest(token.as_bytes()))
}
impl Engine {
    pub fn open(
        path: impl AsRef<std::path::Path>,
        credentials: Vec<Credential>,
        limits: Limits,
    ) -> Result<Self> {
        if limits.writer_lease_ms == 0 || limits.writer_lease_ms > 60_000 {
            return Err(err(
                libc::EINVAL,
                "writer lease must be between 1 and 60000 ms",
            ));
        }
        let store = Store::open(path)?;
        let mut tenants = BTreeSet::new();
        for credential in &credentials {
            if credential.tenant.is_empty() || credential.principal.is_empty() {
                return Err(err(libc::EINVAL, "empty identity"));
            }
            tenants.insert(credential.tenant.clone());
            let reader = store.reader();
            let mut batch = WriteBatch::default();
            let identity_key = key(
                &credential.tenant,
                &["principal", &credential.issuer, &credential.subject],
            );
            if let Some(existing) = reader.get::<Id>("metadata", identity_key.clone())? {
                if existing != credential.principal {
                    return Err(err(libc::EINVAL, "identity remapping"));
                }
            } else {
                store.put(&mut batch, "metadata", identity_key, &credential.principal)?;
            }
            if reader
                .get::<State>("metadata", key(&credential.tenant, &["state"]))?
                .is_none()
            {
                let node = Node {
                    id: id(),
                    parent: None,
                    name: String::new(),
                    kind: Kind::Directory,
                    version: id(),
                    entry_token: id(),
                    size: 0,
                    mode: 0o755,
                    mtime_ms: now_ms(),
                    unlinked: false,
                };
                store.put(
                    &mut batch,
                    "metadata",
                    key(&credential.tenant, &["state"]),
                    &State {
                        schema: 1,
                        root: node.id.clone(),
                        head: 0,
                        auth_generation: 0,
                        journal_floor: 0,
                        retained_bytes: 0,
                        node_count: 1,
                    },
                )?;
                store.put(
                    &mut batch,
                    "metadata",
                    key(&credential.tenant, &["node", &node.id]),
                    &node,
                )?;
            }
            store.publish(batch)?;
        }
        let published = tenants
            .iter()
            .map(|tenant| store.reader().state(tenant).map(|state| state.head))
            .collect::<Result<Vec<_>>>()?
            .iter()
            .sum();
        store.persist()?;
        let (notifications, _) = broadcast::channel(128);
        let engine = Self {
            store,
            index_leases: Mutex::new(HashMap::new()),
            incarnation: id(),
            limits,
            writer: Mutex::new(()),
            persistence: Mutex::new(()),
            sessions: RwLock::new(HashMap::new()),
            handles: Mutex::new(HashMap::new()),
            writers: Mutex::new(HashMap::new()),
            view_pins: Mutex::new(HashMap::new()),
            credentials: credentials
                .into_iter()
                .map(|c| (c.token_hash.clone(), c))
                .collect(),
            notifications,
            published: AtomicU64::new(published),
            persisted: AtomicU64::new(published),
            pending_bytes: AtomicU64::new(0),
            last_sync_ms: AtomicU64::new(now_ms()),
            storage_error: Mutex::new(None),
            fail_sync: AtomicBool::new(false),
            draining: AtomicBool::new(false),
            fault: Mutex::new(None),
        };
        for tenant in tenants {
            engine.validate(&tenant)?;
        }
        Ok(engine)
    }
    pub fn login(&self, token: &str) -> Result<Session> {
        let _guard = self.writer.lock();
        if self.draining.load(Ordering::SeqCst) {
            return Err(err(libc::EIO, "server draining"));
        }
        let credential = self
            .credentials
            .get(&token_hash(token))
            .ok_or_else(|| err(libc::EACCES, "credential rejected"))?;
        let time_ms = now_ms();
        if credential.expires_ms <= time_ms {
            return Err(err(libc::EACCES, "credential expired"));
        }
        let mut sessions = self.sessions.write();
        sessions.retain(|_, session| session.expires_ms > time_ms);
        self.view_pins
            .lock()
            .retain(|session, _| sessions.contains_key(session));
        let mut handles = self.handles.lock();
        handles.retain(|_, handle| sessions.contains_key(&handle.session));
        self.writers.lock().retain(|_, owner| {
            sessions.contains_key(&owner.session) && owner.lease.expires_ms > time_ms
        });
        if sessions.len() >= self.limits.max_sessions {
            return Err(err(libc::EAGAIN, "session capacity"));
        }
        let session = Session {
            id: id(),
            tenant: credential.tenant.clone(),
            principal: credential.principal.clone(),
            admin: credential.admin,
            scope: credential.scope.clone(),
            incarnation: self.incarnation.clone(),
            expires_ms: credential.expires_ms.min(time_ms + self.limits.session_ms),
            retry_epoch: id(),
            retry_expires_ms: credential.expires_ms.min(time_ms + self.limits.retry_ms),
        };
        sessions.insert(session.id.clone(), session.clone());
        Ok(session)
    }
    pub fn session(&self, session: &str) -> Result<Session> {
        if self.draining.load(Ordering::SeqCst) {
            return Err(err(libc::EIO, "server draining"));
        }
        let session = self
            .sessions
            .read()
            .get(session)
            .cloned()
            .ok_or_else(|| err(libc::ESTALE, "session absent or incarnation changed"))?;
        if session.expires_ms <= now_ms() {
            return Err(err(libc::EACCES, "session expired"));
        }
        Ok(session)
    }
    pub fn logout(&self, session: &str) {
        let mut leases = self.index_leases.lock();
        let _guard = self.writer.lock();
        self.sessions.write().remove(session);
        leases.retain(|_, lease| lease.session != session);
        self.view_pins.lock().remove(session);
        self.writers
            .lock()
            .retain(|_, owner| owner.session != session);
        self.handles
            .lock()
            .retain(|_, handle| handle.session != session);
    }
    fn subjects(&self, reader: &Reader<'_>, session: &Session) -> Result<Vec<Id>> {
        let mut subjects = vec![session.principal.clone()];
        subjects.extend(
            reader
                .scan::<Id>(
                    "metadata",
                    key(&session.tenant, &["groups", &session.principal]),
                )?
                .into_iter()
                .map(|(_, group)| group),
        );
        Ok(subjects)
    }
    fn ancestry(&self, reader: &Reader<'_>, tenant: &str, node: &str) -> Result<Vec<Node>> {
        let mut chain = Vec::new();
        let mut next = Some(node.to_owned());
        let mut seen = BTreeSet::new();
        while let Some(current) = next {
            if !seen.insert(current.clone()) {
                return Err(err(libc::ELOOP, "invalid ancestry"));
            }
            let node = reader.node(tenant, &current)?;
            next = node.parent.clone();
            chain.push(node);
        }
        Ok(chain)
    }
    fn verbs(&self, reader: &Reader<'_>, session: &Session, node: &str) -> Result<u16> {
        let chain = self.ancestry(reader, &session.tenant, node)?;
        if session
            .scope
            .as_ref()
            .is_some_and(|scope| !chain.iter().any(|node| &node.id == scope))
        {
            return Ok(0);
        }
        if session.admin {
            return Ok(ALL);
        }
        let subjects = self.subjects(reader, session)?;
        let mut verbs = 0;
        for node in chain {
            for subject in &subjects {
                verbs |= reader
                    .get::<u16>(
                        "metadata",
                        key(&session.tenant, &["grant_by_node", &node.id, subject]),
                    )?
                    .unwrap_or(0);
            }
        }
        Ok(verbs)
    }
    fn require(
        &self,
        reader: &Reader<'_>,
        session: &Session,
        node: &str,
        required: u16,
    ) -> Result<()> {
        if self.verbs(reader, session, node)? & required != required {
            return Err(err(libc::EACCES, "permission denied"));
        }
        Ok(())
    }
    fn live_node(
        &self,
        reader: &Reader<'_>,
        session: &Session,
        node: &str,
        handle: Option<&str>,
        write: bool,
    ) -> Result<Node> {
        let node = reader.node(&session.tenant, node)?;
        if let Some(handle) = handle {
            if let Some(pin) = handle.strip_prefix("view:") {
                if pin != node.id
                    || !self
                        .view_pins
                        .lock()
                        .get(&session.id)
                        .is_some_and(|pins| pins.contains(pin))
                {
                    return Err(err(libc::EACCES, "view pin mismatch"));
                }
                return Ok(node);
            }
            let handles = self.handles.lock();
            let handle = handles
                .get(handle)
                .ok_or_else(|| err(libc::ESTALE, "handle absent"))?;
            if handle.session != session.id || handle.node != node.id || (write && !handle.write) {
                return Err(err(libc::EACCES, "handle mismatch"));
            }
        } else if node.unlinked {
            return Err(err(libc::ENOENT, "unlinked node"));
        }
        Ok(node)
    }
    pub fn open_handle(&self, session: &str, node: &str, write: bool) -> Result<(Id, Node)> {
        let _guard = self.writer.lock();
        let session = self.session(session)?;
        let reader = self.store.reader();
        let node = self.live_node(&reader, &session, node, None, write)?;
        self.require(
            &reader,
            &session,
            &node.id,
            if write { WRITE } else { READ },
        )?;
        if node.kind != Kind::File {
            return Err(err(libc::EISDIR, "not a regular file"));
        }
        if write {
            self.check_writer(&reader, &session, &node.id, None)?;
        }
        let mut handles = self.handles.lock();
        if handles.len() >= self.limits.max_handles {
            return Err(err(libc::EMFILE, "handle capacity"));
        }
        let handle = id();
        handles.insert(
            handle.clone(),
            Handle {
                session: session.id.clone(),
                node: node.id.clone(),
                write,
                fence: None,
            },
        );
        Ok((handle, self.public_node(&reader, &session, node)?))
    }
    pub fn close_handle(&self, session: &str, handle: &str) -> Result<()> {
        let _guard = self.writer.lock();
        let session = self.session(session)?;
        let mut handles = self.handles.lock();
        if handles.get(handle).is_some_and(|h| h.session != session.id) {
            return Err(err(libc::EACCES, "handle mismatch"));
        }
        if let Some(closed) = handles.remove(handle)
            && let Some(fence) = closed.fence
        {
            let mut writers = self.writers.lock();
            let key = (session.tenant.clone(), closed.node);
            if let Some(owner) = writers.get_mut(&key)
                && owner.lease.generation == fence
            {
                owner.opens.retain(|_, current| current != handle);
                if owner.opens.is_empty() {
                    writers.remove(&key);
                }
            }
        }
        Ok(())
    }
    fn public_node(&self, reader: &Reader<'_>, session: &Session, mut node: Node) -> Result<Node> {
        if let Some(parent) = &node.parent
            && self.verbs(reader, session, parent)? & TRAVERSE == 0
        {
            node.parent = None;
        }
        Ok(node)
    }
    pub fn stat(&self, session: &str, node: &str, handle: Option<&str>) -> Result<Node> {
        let session = self.session(session)?;
        let reader = self.store.reader();
        let node = self.live_node(&reader, &session, node, handle, false)?;
        if self.verbs(&reader, &session, &node.id)? == 0 {
            return Err(err(libc::EACCES, "permission denied"));
        }
        self.public_node(&reader, &session, node)
    }
    pub fn lookup(&self, session: &str, parent: &str, name: &str) -> Result<(Node, Entry)> {
        let session = self.session(session)?;
        let reader = self.store.reader();
        self.require(&reader, &session, parent, TRAVERSE)?;
        let entry = reader
            .entry(&session.tenant, parent, name)?
            .ok_or_else(|| err(libc::ENOENT, "entry absent"))?;
        if self.verbs(&reader, &session, &entry.node)? == 0 {
            return Err(err(libc::EACCES, "permission denied"));
        }
        Ok((
            self.public_node(
                &reader,
                &session,
                reader.node(&session.tenant, &entry.node)?,
            )?,
            entry,
        ))
    }
    fn manifest(
        &self,
        reader: &Reader<'_>,
        tenant: &str,
        node: &Node,
        version: &str,
    ) -> Result<Manifest> {
        if node.kind != Kind::File {
            return Err(err(libc::EISDIR, "not a regular file"));
        }
        reader
            .get("metadata", key(tenant, &["version", &node.id, version]))?
            .ok_or_else(|| err(libc::ESTALE, "version absent"))
    }
    fn chunk(&self, reader: &Reader<'_>, tenant: &str, chunk: &str) -> Result<Vec<u8>> {
        let chunk: Chunk = reader
            .get("content", key(tenant, &["chunk", chunk]))?
            .ok_or_else(|| err(libc::EIO, "missing chunk"))?;
        if Sha256::digest(&chunk.bytes).as_slice() != chunk.checksum {
            return Err(err(libc::EIO, "chunk checksum mismatch"));
        }
        Ok(chunk.bytes)
    }
    pub fn read_blocks(
        &self,
        session: &str,
        ranges: &[BlockRead],
    ) -> Result<Vec<Result<BlockPage>>> {
        validate_block_reads(ranges)?;
        let session = self.session(session)?;
        let reader = self.store.reader();
        let mut result = Vec::with_capacity(ranges.len());
        for range in ranges {
            result.push(self.block_page(&reader, &session, range));
        }
        Ok(result)
    }

    fn block_page(
        &self,
        reader: &Reader<'_>,
        session: &Session,
        range: &BlockRead,
    ) -> Result<BlockPage> {
        let node = self.live_node(reader, session, &range.node, range.handle.as_deref(), false)?;
        self.require(reader, session, &node.id, READ)?;
        let manifest = self.manifest(reader, &session.tenant, &node, &range.version)?;
        let end = range
            .offset
            .saturating_add(u64::from(range.size))
            .min(manifest.size);
        let first = range.offset / CHUNK_BYTES as u64;
        let mut page = BlockPage {
            node: range.node.clone(),
            version: range.version.clone(),
            size: manifest.size,
            first,
            hashes: Vec::new(),
            chunks: Vec::new(),
        };
        if end <= range.offset {
            return Ok(page);
        }
        let mut sent = std::collections::BTreeSet::new();
        for index in first..=(end - 1) / CHUNK_BYTES as u64 {
            let hash = if let Some(chunk) = manifest.chunks.get(&index) {
                let bytes = self.chunk(reader, &session.tenant, chunk)?;
                if bytes.len() > CHUNK_BYTES {
                    return Err(err(libc::EIO, "oversized block"));
                }
                let hash = format!("{:x}", Sha256::digest(&bytes));
                if !range.known.contains(&hash) && sent.insert(hash.clone()) {
                    page.chunks.push((hash.clone(), bytes));
                }
                Some(hash)
            } else {
                None
            };
            page.hashes.push(hash);
        }
        Ok(page)
    }

    pub fn read(
        &self,
        session: &str,
        node: &str,
        version: Option<&str>,
        offset: u64,
        size: u32,
        handle: Option<&str>,
    ) -> Result<Vec<u8>> {
        if size as usize > MAX_IO_BYTES {
            return Err(err(libc::E2BIG, "read size"));
        }
        let session = self.session(session)?;
        let reader = self.store.reader();
        let node = self.live_node(&reader, &session, node, handle, false)?;
        self.require(&reader, &session, &node.id, READ)?;
        let manifest = self.manifest(
            &reader,
            &session.tenant,
            &node,
            version.unwrap_or(&node.version),
        )?;
        self.read_manifest(&reader, &session.tenant, &manifest, offset, size)
    }
    fn read_manifest(
        &self,
        reader: &Reader<'_>,
        tenant: &str,
        manifest: &Manifest,
        offset: u64,
        size: u32,
    ) -> Result<Vec<u8>> {
        let end = offset.saturating_add(u64::from(size)).min(manifest.size);
        if offset >= end {
            return Ok(Vec::new());
        }
        let mut bytes = vec![0; (end - offset) as usize];
        let first = offset / CHUNK_BYTES as u64;
        let last = (end - 1) / CHUNK_BYTES as u64;
        for index in first..=last {
            if let Some(chunk) = manifest.chunks.get(&index) {
                let content = self.chunk(reader, tenant, chunk)?;
                let chunk_start = index * CHUNK_BYTES as u64;
                let start = offset.max(chunk_start);
                let stop = end.min(chunk_start + content.len() as u64);
                if start < stop {
                    bytes[(start - offset) as usize..(stop - offset) as usize].copy_from_slice(
                        &content[(start - chunk_start) as usize..(stop - chunk_start) as usize],
                    );
                }
            }
        }
        Ok(bytes)
    }
    pub fn view(&self, session: &str) -> Result<View> {
        let session = self.session(session)?;
        let reader = self.store.reader();
        let state = reader.state(&session.tenant)?;
        let mut remaining = self.limits.snapshot_bytes;
        let mut reserve = |bytes: usize| -> Result<()> {
            remaining = remaining
                .checked_sub(bytes)
                .ok_or_else(|| err(libc::EOVERFLOW, "snapshot working byte capacity"))?;
            Ok(())
        };
        let mut nodes = BTreeMap::new();
        reader.scan_each(
            "metadata",
            key(&session.tenant, &["node"]),
            |_, node: Node| {
                if !node.unlinked {
                    if nodes.len() == self.limits.max_nodes {
                        return Err(err(libc::EOVERFLOW, "view node capacity"));
                    }
                    reserve(node.retained_bytes().saturating_mul(4).saturating_add(2048))?;
                    nodes.insert(node.id.clone(), node);
                }
                Ok(())
            },
        )?;
        reserve(session.principal.capacity().saturating_add(256))?;
        let mut subjects = vec![session.principal.clone()];
        reader.scan_each(
            "metadata",
            key(&session.tenant, &["groups", &session.principal]),
            |_, group: Id| {
                reserve(group.capacity().saturating_add(256))?;
                subjects.push(group);
                Ok(())
            },
        )?;
        let mut grants: HashMap<Id, u16> = HashMap::new();
        for subject in subjects {
            reader.scan_each(
                "metadata",
                key(&session.tenant, &["grant_by_subject", &subject]),
                |_, grant: (Id, u16)| {
                    if !grants.contains_key(&grant.0) {
                        reserve(grant.0.capacity().saturating_add(256))?;
                    }
                    *grants.entry(grant.0).or_default() |= grant.1;
                    Ok(())
                },
            )?;
        }
        let mut resolved: HashMap<Id, (u16, bool, usize)> = HashMap::new();
        for node in nodes.values() {
            let mut inherited = (
                if session.admin { ALL } else { 0 },
                session.scope.is_none(),
                0,
            );
            let mut chain = Vec::new();
            let mut next = Some(node.id.as_str());
            let mut seen = BTreeSet::new();
            while let Some(current) = next {
                if let Some(previous) = resolved.get(current) {
                    inherited = *previous;
                    break;
                }
                if !seen.insert(current) {
                    return Err(err(libc::ELOOP, "view ancestry"));
                }
                let ancestor = nodes
                    .get(current)
                    .ok_or_else(|| err(libc::EIO, "missing ancestor"))?;
                chain.push(ancestor);
                next = ancestor.parent.as_deref();
            }
            for ancestor in chain.into_iter().rev() {
                inherited.0 |= grants.get(&ancestor.id).copied().unwrap_or(0);
                inherited.1 |= session.scope.as_ref() == Some(&ancestor.id);
                inherited.2 += 1;
                resolved.insert(ancestor.id.clone(), inherited);
            }
        }
        let root = session.scope.as_ref().unwrap_or(&state.root);
        let mut reachable = BTreeSet::new();
        let mut ordered: Vec<_> = nodes.values().collect();
        ordered.sort_by_key(|n| resolved[&n.id].2);
        let mut output = Vec::new();
        for node in ordered {
            let (verbs, in_scope, _) = resolved[&node.id];
            if verbs == 0 || !in_scope {
                continue;
            }
            let parent_reachable = node.parent.as_ref().is_some_and(|parent| {
                reachable.contains(parent)
                    && resolved[parent].0 & (LIST | TRAVERSE) == LIST | TRAVERSE
            });
            let (visible_parent, visible_name) = if &node.id == root {
                (None, "files".to_owned())
            } else if parent_reachable {
                (node.parent.clone(), node.name.clone())
            } else {
                (None, format!("{}~{}", node.name, node.id))
            };
            reachable.insert(node.id.clone());
            let mut public_node = node.clone();
            public_node.parent = visible_parent.clone();
            public_node.name = visible_name.clone();
            output.push(ViewNode {
                node: public_node,
                visible_parent,
                visible_name,
                verbs,
            });
        }
        self.pin_nodes(&session, output.iter().map(|n| n.node.id.clone()));
        Ok(View {
            incarnation: self.incarnation.clone(),
            head: state.head,
            auth_generation: state.auth_generation,
            nodes: output,
        })
    }
    pub fn changes(&self, session: &str, cursor: Cursor) -> Result<Delta> {
        let session = self.session(session)?;
        let reader = self.store.reader();
        let state = reader.state(&session.tenant)?;
        if cursor.incarnation != self.incarnation || cursor.head > state.head {
            return Err(err(libc::ESTALE, "cursor incarnation or head invalid"));
        }
        let mut delta = Delta {
            incarnation: self.incarnation.clone(),
            from_head: cursor.head,
            head: state.head,
            auth_generation: state.auth_generation,
            reset: cursor.head < state.journal_floor || state.head - cursor.head > 4096,
            upserts: Vec::new(),
            removed: Vec::new(),
        };
        if delta.reset {
            return Ok(delta);
        }
        let mut changed = BTreeSet::new();
        for sequence in cursor.head + 1..=state.head {
            let change: Change = reader
                .get(
                    "changes",
                    key(&session.tenant, &["sequence", &format!("{sequence:020}")]),
                )?
                .ok_or_else(|| err(libc::EIO, "journal gap"))?;
            if change.reset {
                delta.reset = true;
                return Ok(delta);
            }
            changed.extend(change.node);
            changed.extend(change.old_parent);
            changed.extend(change.new_parent);
        }
        let root = session.scope.as_ref().unwrap_or(&state.root);
        for id in changed {
            let mut node = reader.node(&session.tenant, &id)?;
            let verbs = self.verbs(&reader, &session, &id)?;
            if verbs == 0 {
                continue;
            }
            if node.unlinked {
                delta.removed.push(id);
                continue;
            }
            let parent_visible = match &node.parent {
                Some(parent) => {
                    self.verbs(&reader, &session, parent)? & (LIST | TRAVERSE) == LIST | TRAVERSE
                }
                None => false,
            };
            let (visible_parent, visible_name) = if &id == root {
                (None, "files".to_owned())
            } else if parent_visible {
                (node.parent.clone(), node.name.clone())
            } else {
                (None, format!("{}~{}", node.name, id))
            };
            node.parent = visible_parent.clone();
            node.name = visible_name.clone();
            delta.upserts.push(ViewNode {
                node,
                visible_parent,
                visible_name,
                verbs,
            });
        }
        self.pin_nodes(
            &session,
            delta.upserts.iter().map(|node| node.node.id.clone()),
        );
        Ok(delta)
    }
    pub fn head(&self, session: &str) -> Result<(u64, u64)> {
        let session = self.session(session)?;
        let state = self.store.reader().state(&session.tenant)?;
        Ok((state.head, state.auth_generation))
    }
    fn check_name(name: &str) -> Result<()> {
        if name.is_empty() || name == "." || name == ".." || name.contains(['/', '\0']) {
            return Err(err(libc::EINVAL, "invalid filename"));
        }
        if name.len() > 255 {
            return Err(err(libc::ENAMETOOLONG, "filename too long"));
        }
        Ok(())
    }
    fn parent(
        &self,
        reader: &Reader<'_>,
        session: &Session,
        parent: &str,
        verbs: u16,
    ) -> Result<Node> {
        let node = self.live_node(reader, session, parent, None, false)?;
        if node.kind != Kind::Directory {
            return Err(err(libc::ENOTDIR, "parent is not directory"));
        }
        self.require(reader, session, parent, verbs | TRAVERSE)?;
        Ok(node)
    }
    fn checked_entry(
        &self,
        reader: &Reader<'_>,
        tenant: &str,
        parent: &str,
        name: &str,
        expected: &str,
    ) -> Result<Entry> {
        let entry = reader
            .entry(tenant, parent, name)?
            .ok_or_else(|| err(libc::ENOENT, "entry absent"))?;
        if entry.token != expected {
            return Err(err(libc::ESTALE, "entry changed"));
        }
        Ok(entry)
    }
    fn checked_file(
        &self,
        reader: &Reader<'_>,
        session: &Session,
        node: &str,
        base: &str,
        handle: Option<&str>,
    ) -> Result<Node> {
        let node = self.live_node(reader, session, node, handle, true)?;
        self.require(reader, session, &node.id, WRITE)?;
        self.check_writer(reader, session, &node.id, handle)?;
        if node.kind != Kind::File {
            return Err(err(libc::EISDIR, "not a regular file"));
        }
        if node.version != base {
            return Err(err(libc::ESTALE, "version changed"));
        }
        Ok(node)
    }
    fn put_node(&self, batch: &mut WriteBatch, tenant: &str, node: &Node) -> Result<()> {
        self.store
            .put(batch, "metadata", key(tenant, &["node", &node.id]), node)
    }
    fn put_entry(
        &self,
        batch: &mut WriteBatch,
        tenant: &str,
        parent: &str,
        name: &str,
        node: &str,
        token: &str,
    ) -> Result<()> {
        self.store.put(
            batch,
            "metadata",
            key(tenant, &["entry", parent, name]),
            &Entry {
                node: node.to_owned(),
                token: token.to_owned(),
            },
        )
    }
    fn next_version(&self) -> Id {
        format!("{}:{}", self.incarnation, id())
    }
    fn put_chunk(&self, batch: &mut WriteBatch, tenant: &str, bytes: Vec<u8>) -> Result<Id> {
        let chunk_id = id();
        let checksum = Sha256::digest(&bytes).to_vec();
        self.store.put(
            batch,
            "content",
            key(tenant, &["chunk", &chunk_id]),
            &Chunk { bytes, checksum },
        )?;
        Ok(chunk_id)
    }
    fn put_manifest(
        &self,
        batch: &mut WriteBatch,
        tenant: &str,
        node: &Node,
        manifest: &Manifest,
    ) -> Result<()> {
        self.store.put(
            batch,
            "metadata",
            key(tenant, &["version", &node.id, &node.version]),
            manifest,
        )
    }
    pub fn mutate(&self, session: &str, request: RequestId, mutation: Mutation) -> Result<Outcome> {
        let rename_started = (matches!(&mutation, Mutation::Rename { .. })
            && tracing::enabled!(target: "dfs_rename_bench", tracing::Level::INFO))
        .then(std::time::Instant::now);
        let _guard = self.writer.lock();
        let rename_locked = rename_started.map(|_| std::time::Instant::now());
        let session = self.session(session)?;
        let tenant = &session.tenant;
        let reader = self.store.reader();
        let request_key = key(
            tenant,
            &["request", &session.principal, &request.epoch, &request.id],
        );
        let digest: [u8; 32] =
            Sha256::digest(bincode::serialize(&(request.clone(), &mutation))?).into();
        let hash = digest.to_vec();
        if request.expires_ms <= now_ms() {
            return Err(err(libc::ESTALE, "retry epoch expired"));
        }
        if let Some(record) = reader.get::<RetryRecord>("metadata", request_key.clone())? {
            if record.principal != session.principal
                || record.hash != hash
                || record.expires_ms != request.expires_ms
            {
                return Err(err(libc::EINVAL, "retry payload mismatch"));
            }
            for node in &record.targets {
                if self.verbs(&reader, &session, node)? == 0 {
                    return Err(err(libc::EACCES, "retry no longer authorized"));
                }
            }
            let mut outcome = record.outcome;
            outcome.node = outcome
                .node
                .map(|node| self.public_node(&reader, &session, node))
                .transpose()?;
            self.pin_outcome(&session, &outcome);
            return Ok(outcome);
        }
        if request.incarnation != self.incarnation {
            return Err(err(
                libc::ESTALE,
                "unknown outcome from old incarnation; reconcile",
            ));
        }
        if request.epoch != session.retry_epoch || request.expires_ms != session.retry_expires_ms {
            return Err(err(libc::ESTALE, "retry epoch not issued to session"));
        }
        if self.draining.load(Ordering::SeqCst) {
            return Err(err(libc::EIO, "server draining"));
        }
        if let Some(error) = self.storage_error.lock().clone() {
            return Err(err(libc::EIO, error));
        }
        if self.pending_bytes.load(Ordering::SeqCst) >= self.limits.pending_bytes {
            return Err(err(libc::EAGAIN, "persistence backlog"));
        }
        let mut state = reader.state(tenant)?;
        let mut batch = WriteBatch::default();
        let mut targets = Vec::new();
        let mut output = None;
        let mut extra_nodes = Vec::new();
        let mut written = 0;
        let mut reset = false;
        let mut namespace_roots = Vec::new();
        let namespace_changed =
            matches!(&mutation, Mutation::Rename { .. } | Mutation::Unlink { .. });
        match mutation {
            Mutation::PutFiles { files } => {
                validate_file_updates(&files)?;
                let mut parents = std::collections::BTreeSet::new();
                let mut directories = std::collections::BTreeSet::new();
                for file in files {
                    let node = file.node;
                    let parent = node.parent.as_ref().unwrap();
                    Self::check_name(&node.name)?;
                    if let Some(base) = &file.base {
                        let previous = if node.kind == Kind::Directory {
                            let previous = reader.node(tenant, &node.id)?;
                            self.require(&reader, &session, &node.id, WRITE)?;
                            if previous.kind != Kind::Directory || &previous.version != base {
                                return Err(err(libc::ESTALE, "directory version changed"));
                            }
                            previous
                        } else {
                            self.checked_file(
                                &reader,
                                &session,
                                &node.id,
                                base,
                                Some(&format!("view:{}", node.id)),
                            )?
                        };
                        if previous.parent != node.parent
                            || previous.name != node.name
                            || previous.entry_token != node.entry_token
                            || previous.unlinked
                        {
                            return Err(err(libc::ESTALE, "file identity changed"));
                        }
                    } else {
                        if !directories.contains(parent) && parents.insert(parent.clone()) {
                            self.parent(&reader, &session, parent, CREATE | WRITE)?;
                        }
                        if reader.entry(tenant, parent, &node.name)?.is_some()
                            || reader
                                .get::<Node>("metadata", key(tenant, &["node", &node.id]))?
                                .is_some()
                        {
                            return Err(err(libc::EEXIST, "file identity exists"));
                        }
                        if state.node_count >= self.limits.max_nodes as u64 {
                            return Err(err(libc::EDQUOT, "node quota"));
                        }
                        state.node_count += 1;
                        self.put_entry(
                            &mut batch,
                            tenant,
                            parent,
                            &node.name,
                            &node.id,
                            &node.entry_token,
                        )?;
                    }
                    if reader
                        .get::<Manifest>(
                            "metadata",
                            key(tenant, &["version", &node.id, &node.version]),
                        )?
                        .is_some()
                    {
                        return Err(err(libc::EEXIST, "file generation exists"));
                    }
                    let mut manifest = Manifest {
                        size: node.size,
                        chunks: BTreeMap::new(),
                    };
                    for (index, bytes) in file.data.chunks(CHUNK_BYTES).enumerate() {
                        manifest.chunks.insert(
                            index as u64,
                            self.put_chunk(&mut batch, tenant, bytes.to_vec())?,
                        );
                    }
                    if node.kind == Kind::File {
                        self.put_manifest(&mut batch, tenant, &node, &manifest)?;
                    } else if file.base.is_none() {
                        directories.insert(node.id.clone());
                    }
                    self.put_node(&mut batch, tenant, &node)?;
                    targets.push(node.id.clone());
                    targets.push(parent.clone());
                    extra_nodes.push(node);
                }
                output = extra_nodes.pop();
            }
            Mutation::Create {
                parent,
                name,
                kind,
                mode,
            } => {
                Self::check_name(&name)?;
                let mut parent_node = self.parent(&reader, &session, &parent, CREATE)?;
                if reader.entry(tenant, &parent, &name)?.is_some() {
                    return Err(err(libc::EEXIST, "entry exists"));
                }
                if state.node_count >= self.limits.max_nodes as u64 {
                    return Err(err(libc::EDQUOT, "node quota"));
                }
                state.node_count += 1;
                let node = Node {
                    id: id(),
                    parent: Some(parent.clone()),
                    name: name.clone(),
                    kind,
                    version: self.next_version(),
                    entry_token: self.next_version(),
                    size: 0,
                    mode: mode & 0o777,
                    mtime_ms: now_ms(),
                    unlinked: false,
                };
                self.put_node(&mut batch, tenant, &node)?;
                self.put_entry(
                    &mut batch,
                    tenant,
                    &parent,
                    &name,
                    &node.id,
                    &node.entry_token,
                )?;
                if kind == Kind::File {
                    self.put_manifest(&mut batch, tenant, &node, &Manifest::default())?;
                }
                parent_node.mtime_ms = now_ms();
                self.put_node(&mut batch, tenant, &parent_node)?;
                targets.push(parent);
                output = Some(node);
            }
            Mutation::Write {
                node,
                base,
                offset,
                data,
                append,
                handle,
            } => {
                if data.len() > MAX_IO_BYTES {
                    return Err(err(libc::E2BIG, "write size"));
                }
                let mut node =
                    self.checked_file(&reader, &session, &node, &base, handle.as_deref())?;
                let mut manifest = self.manifest(&reader, tenant, &node, &node.version)?;
                let offset = if append { manifest.size } else { offset };
                let end = offset
                    .checked_add(data.len() as u64)
                    .filter(|end| *end <= i64::MAX as u64)
                    .ok_or_else(|| err(libc::EFBIG, "file size"))?;
                let mut consumed = 0;
                while consumed < data.len() {
                    let position = offset + consumed as u64;
                    let index = position / CHUNK_BYTES as u64;
                    let start = (position % CHUNK_BYTES as u64) as usize;
                    let count = (CHUNK_BYTES - start).min(data.len() - consumed);
                    let mut bytes = match manifest.chunks.get(&index) {
                        Some(chunk) => self.chunk(&reader, tenant, chunk)?,
                        None => Vec::new(),
                    };
                    bytes.resize(bytes.len().max(start + count), 0);
                    bytes[start..start + count].copy_from_slice(&data[consumed..consumed + count]);
                    manifest
                        .chunks
                        .insert(index, self.put_chunk(&mut batch, tenant, bytes)?);
                    consumed += count;
                }
                if !data.is_empty() {
                    manifest.size = manifest.size.max(end);
                }
                node.size = manifest.size;
                node.version = self.next_version();
                node.mtime_ms = now_ms();
                self.put_manifest(&mut batch, tenant, &node, &manifest)?;
                self.put_node(&mut batch, tenant, &node)?;
                written = data.len() as u32;
                targets.push(node.id.clone());
                output = Some(node);
            }
            Mutation::Truncate {
                node,
                base,
                size,
                handle,
            } => {
                if size > i64::MAX as u64 {
                    return Err(err(libc::EFBIG, "file size"));
                }
                let mut node =
                    self.checked_file(&reader, &session, &node, &base, handle.as_deref())?;
                let mut manifest = self.manifest(&reader, tenant, &node, &node.version)?;
                if size < manifest.size {
                    manifest
                        .chunks
                        .retain(|index, _| *index * (CHUNK_BYTES as u64) < size);
                    let tail = (size % CHUNK_BYTES as u64) as usize;
                    if tail != 0
                        && let Some(chunk) = manifest.chunks.get(&(size / CHUNK_BYTES as u64))
                    {
                        let mut bytes = self.chunk(&reader, tenant, chunk)?;
                        bytes.truncate(tail);
                        manifest.chunks.insert(
                            size / CHUNK_BYTES as u64,
                            self.put_chunk(&mut batch, tenant, bytes)?,
                        );
                    }
                }
                manifest.size = size;
                node.size = size;
                node.version = self.next_version();
                node.mtime_ms = now_ms();
                self.put_manifest(&mut batch, tenant, &node, &manifest)?;
                self.put_node(&mut batch, tenant, &node)?;
                targets.push(node.id.clone());
                output = Some(node);
            }
            Mutation::SetAttr {
                node,
                base,
                mode,
                mtime_ms,
                handle,
            } => {
                let mut node = self.live_node(&reader, &session, &node, handle.as_deref(), true)?;
                self.require(&reader, &session, &node.id, WRITE)?;
                self.check_writer(&reader, &session, &node.id, handle.as_deref())?;
                if node.version != base {
                    return Err(err(libc::ESTALE, "version changed"));
                }
                if let Some(mode) = mode {
                    node.mode = mode & 0o777;
                }
                if let Some(mtime_ms) = mtime_ms {
                    node.mtime_ms = mtime_ms;
                }
                let old_version = node.version.clone();
                node.version = self.next_version();
                if node.kind == Kind::File {
                    self.put_manifest(
                        &mut batch,
                        tenant,
                        &node,
                        &self.manifest(&reader, tenant, &node, &old_version)?,
                    )?;
                }
                self.put_node(&mut batch, tenant, &node)?;
                targets.push(node.id.clone());
                output = Some(node);
            }
            Mutation::Unlink {
                parent,
                name,
                expected,
                directory,
            } => {
                self.parent(&reader, &session, &parent, DELETE)?;
                let entry = self.checked_entry(&reader, tenant, &parent, &name, &expected)?;
                let mut node = reader.node(tenant, &entry.node)?;
                if directory != (node.kind == Kind::Directory) {
                    return Err(err(
                        if directory {
                            libc::ENOTDIR
                        } else {
                            libc::EISDIR
                        },
                        "unlink kind",
                    ));
                }
                if directory
                    && !reader
                        .scan::<Entry>("metadata", key(tenant, &["entry", &node.id]))?
                        .is_empty()
                {
                    return Err(err(libc::ENOTEMPTY, "directory not empty"));
                }
                namespace_roots.push(search::node_label(tenant, &node.id));
                node.unlinked = true;
                self.put_node(&mut batch, tenant, &node)?;
                self.store.delete(
                    &mut batch,
                    "metadata",
                    key(tenant, &["entry", &parent, &name]),
                )?;
                targets.push(parent);
                output = Some(node);
            }
            Mutation::Rename {
                parent,
                name,
                expected,
                new_parent,
                new_name,
                destination,
            } => {
                Self::check_name(&new_name)?;
                self.parent(&reader, &session, &parent, RENAME | DELETE)?;
                self.parent(&reader, &session, &new_parent, RENAME | CREATE)?;
                let source = self.checked_entry(&reader, tenant, &parent, &name, &expected)?;
                let mut node = reader.node(tenant, &source.node)?;
                namespace_roots.push(search::node_label(tenant, &node.id));
                self.require(&reader, &session, &node.id, GRANT)?;
                let dest = reader.entry(tenant, &new_parent, &new_name)?;
                if dest.as_ref().map(|entry| &entry.token) != destination.as_ref() {
                    return Err(err(libc::ESTALE, "destination changed"));
                }
                if parent != new_parent {
                    let ancestors = self.ancestry(&reader, tenant, &new_parent)?;
                    if ancestors.iter().any(|ancestor| ancestor.id == node.id) {
                        return Err(err(libc::EINVAL, "rename cycle"));
                    }
                }
                if let Some(dest) = dest
                    && dest.node != node.id
                {
                    self.require(&reader, &session, &dest.node, DELETE)?;
                    let mut old = reader.node(tenant, &dest.node)?;
                    if old.kind != node.kind {
                        return Err(err(
                            if old.kind == Kind::Directory {
                                libc::EISDIR
                            } else {
                                libc::ENOTDIR
                            },
                            "replacement kind",
                        ));
                    }
                    if old.kind == Kind::Directory
                        && !reader
                            .scan::<Entry>("metadata", key(tenant, &["entry", &old.id]))?
                            .is_empty()
                    {
                        return Err(err(libc::ENOTEMPTY, "replacement directory not empty"));
                    }
                    namespace_roots.push(search::node_label(tenant, &old.id));
                    old.unlinked = true;
                    self.put_node(&mut batch, tenant, &old)?;
                }
                self.store.delete(
                    &mut batch,
                    "metadata",
                    key(tenant, &["entry", &parent, &name]),
                )?;
                node.entry_token = self.next_version();
                node.parent = Some(new_parent.clone());
                node.name = new_name.clone();
                self.put_node(&mut batch, tenant, &node)?;
                self.put_entry(
                    &mut batch,
                    tenant,
                    &new_parent,
                    &new_name,
                    &node.id,
                    &node.entry_token,
                )?;
                targets.extend([parent, new_parent]);
                output = Some(node);
                reset = true;
            }
            Mutation::Grant {
                node,
                subject,
                verbs,
            } => {
                self.live_node(&reader, &session, &node, None, false)?;
                self.require(&reader, &session, &node, GRANT | verbs)?;
                if verbs & !ALL != 0 || subject.is_empty() {
                    return Err(err(libc::EINVAL, "invalid grant"));
                }
                let forward = key(tenant, &["grant_by_node", &node, &subject]);
                let reverse = key(tenant, &["grant_by_subject", &subject, &node]);
                let label = search::grant_token(&node, &subject);
                self.store.put(
                    &mut batch,
                    "metadata",
                    key(tenant, &["search_grant", &node, &label]),
                    &IndexGrant {
                        node: node.clone(),
                        token: label,
                    },
                )?;
                if verbs == 0 {
                    self.store.delete(&mut batch, "metadata", forward)?;
                    self.store.delete(&mut batch, "metadata", reverse)?;
                } else {
                    self.store.put(&mut batch, "metadata", forward, &verbs)?;
                    self.store
                        .put(&mut batch, "metadata", reverse, &(node.clone(), verbs))?;
                }
                targets.push(node);
                reset = true;
            }
            Mutation::Member {
                group,
                principal,
                present,
            } => {
                if !session.admin || session.scope.is_some() {
                    return Err(err(libc::EACCES, "tenant administrator required"));
                }
                if group == principal
                    || group.is_empty()
                    || principal.is_empty()
                    || !self.credentials.values().any(|credential| {
                        credential.tenant == *tenant && credential.principal == principal
                    })
                    || self.credentials.values().any(|credential| {
                        credential.tenant == *tenant && credential.principal == group
                    })
                {
                    return Err(err(
                        libc::EINVAL,
                        "groups must contain provisioned principals, not groups",
                    ));
                }
                let forward = key(tenant, &["member", &group, &principal]);
                let reverse = key(tenant, &["groups", &principal, &group]);
                if present {
                    self.store
                        .put(&mut batch, "metadata", forward, &principal)?;
                    self.store.put(&mut batch, "metadata", reverse, &group)?;
                } else {
                    self.store.delete(&mut batch, "metadata", forward)?;
                    self.store.delete(&mut batch, "metadata", reverse)?;
                }
                targets.push(state.root.clone());
                reset = true;
            }
        }
        for node in &extra_nodes {
            state.head += 1;
            self.store.put(
                &mut batch,
                "changes",
                key(tenant, &["sequence", &format!("{:020}", state.head)]),
                &Change {
                    head: state.head,
                    node: Some(node.id.clone()),
                    reset: false,
                    time_ms: now_ms(),
                    old_parent: node.parent.clone(),
                    old_name: Some(node.name.clone()),
                    new_parent: node.parent.clone(),
                    new_name: Some(node.name.clone()),
                },
            )?;
        }
        state.head += 1;
        if namespace_changed {
            let previous = reader
                .get("metadata", key(tenant, &["search_namespace_head"]))?
                .unwrap_or(0);
            self.store.put(
                &mut batch,
                "metadata",
                key(
                    tenant,
                    &["search_namespace_change", &format!("{:020}", state.head)],
                ),
                &SearchNamespaceChange {
                    previous,
                    roots: namespace_roots,
                },
            )?;
            self.store.put(
                &mut batch,
                "metadata",
                key(tenant, &["search_namespace_head"]),
                &state.head,
            )?;
        }
        if reset {
            state.auth_generation += 1;
        }
        let outcome = Outcome {
            head: state.head,
            node: output,
            written,
        };
        self.store.put(
            &mut batch,
            "metadata",
            request_key,
            &RetryRecord {
                principal: session.principal.clone(),
                hash,
                expires_ms: request.expires_ms,
                outcome: outcome.clone(),
                targets,
            },
        )?;
        self.store.put(
            &mut batch,
            "metadata",
            key(
                tenant,
                &[
                    "publication",
                    &session.principal,
                    &request.epoch,
                    &request.id,
                ],
            ),
            &PublicationId {
                tenant: tenant.clone(),
                request: request.clone(),
                digest,
            },
        )?;
        let previous_node = match outcome.node.as_ref() {
            Some(node) => match reader.node(tenant, &node.id) {
                Ok(previous) => Some(previous),
                Err(error) if error.code == libc::ENOENT => None,
                Err(error) => return Err(error),
            },
            None => None,
        };
        self.store.put(
            &mut batch,
            "changes",
            key(tenant, &["sequence", &format!("{:020}", state.head)]),
            &Change {
                head: state.head,
                node: outcome.node.as_ref().map(|node| node.id.clone()),
                reset,
                time_ms: now_ms(),
                old_parent: previous_node.as_ref().and_then(|node| node.parent.clone()),
                old_name: previous_node.as_ref().map(|node| node.name.clone()),
                new_parent: outcome
                    .node
                    .as_ref()
                    .filter(|node| !node.unlinked)
                    .and_then(|node| node.parent.clone()),
                new_name: outcome
                    .node
                    .as_ref()
                    .filter(|node| !node.unlinked)
                    .map(|node| node.name.clone()),
            },
        )?;
        let batch_bytes = batch.size_in_bytes() as u64 + 256;
        state.retained_bytes += batch_bytes;
        if state.retained_bytes > self.limits.tenant_bytes {
            return Err(err(libc::EDQUOT, "retained storage quota"));
        }
        self.store
            .put(&mut batch, "metadata", key(tenant, &["state"]), &state)?;
        self.fault_point("before_publish", self.published.load(Ordering::SeqCst) + 1);
        let rename_publish_started = rename_started.map(|_| std::time::Instant::now());
        if let Err(error) = self.store.publish(batch) {
            *self.storage_error.lock() = Some(error.to_string());
            return Err(error);
        }
        let rename_publish_us =
            rename_publish_started.map(|started| started.elapsed().as_micros() as u64);
        self.published.fetch_add(1, Ordering::SeqCst);
        self.pending_bytes.fetch_add(batch_bytes, Ordering::SeqCst);
        self.fault_point("after_publish", self.published.load(Ordering::SeqCst));
        let _ = self.notifications.send(tenant.clone());
        let mut outcome = outcome;
        outcome.node = outcome
            .node
            .map(|node| self.public_node(&self.store.reader(), &session, node))
            .transpose()?;
        self.pin_nodes(&session, extra_nodes.iter().map(|node| node.id.clone()));
        self.pin_outcome(&session, &outcome);
        if let (Some(started), Some(locked)) = (rename_started, rename_locked) {
            let writer_held_us = locked.elapsed().as_micros() as u64;
            drop(_guard);
            tracing::info!(
                target: "dfs_rename_bench",
                request_id = %request.id,
                total_us = started.elapsed().as_micros() as u64,
                writer_wait_us = locked.duration_since(started).as_micros() as u64,
                writer_held_us,
                subtree_check_us = 0_u64,
                subtree_nodes = 0_u64,
                publish_us = rename_publish_us.unwrap_or_default(),
                "rename timing"
            );
        }
        Ok(outcome)
    }
    fn pin_outcome(&self, session: &Session, outcome: &Outcome) {
        if let Some(node) = &outcome.node {
            self.pin_nodes(session, std::iter::once(node.id.clone()));
        }
    }
    fn pin_nodes(&self, session: &Session, nodes: impl IntoIterator<Item = Id>) {
        let sessions = self.sessions.read();
        if sessions
            .get(&session.id)
            .is_some_and(|current| current.expires_ms > now_ms())
        {
            self.view_pins
                .lock()
                .entry(session.id.clone())
                .or_default()
                .extend(nodes);
        }
    }
    fn fault_point(&self, phase: &str, head: u64) {
        if self
            .fault
            .lock()
            .as_ref()
            .is_some_and(|(selected, after)| selected == phase && head >= *after)
        {
            tracing::error!(phase, head, "injected process crash");
            unsafe {
                libc::kill(libc::getpid(), libc::SIGKILL);
            }
            std::process::abort();
        }
    }
    pub fn resolve_publication(
        &self,
        session: &str,
        publication: PublicationId,
    ) -> Result<Option<Publication>> {
        let _writer = self.writer.lock();
        self.publication_record(session, publication)
    }
    fn publication_record(
        &self,
        session: &str,
        publication: PublicationId,
    ) -> Result<Option<Publication>> {
        let session = self.session(session)?;
        if publication.tenant != session.tenant {
            return Err(err(libc::EACCES, "publication tenant mismatch"));
        }
        let reader = self.store.reader();
        let request = &publication.request;
        let record = reader.get::<RetryRecord>(
            "metadata",
            key(
                &session.tenant,
                &["request", &session.principal, &request.epoch, &request.id],
            ),
        )?;
        let Some(record) = record else {
            return Ok(None);
        };
        let identity = reader
            .get::<PublicationId>(
                "metadata",
                key(
                    &session.tenant,
                    &[
                        "publication",
                        &session.principal,
                        &request.epoch,
                        &request.id,
                    ],
                ),
            )?
            .ok_or_else(|| err(libc::ESTALE, "legacy publication has no verifiable receipt"))?;
        if identity != publication
            || record.principal != session.principal
            || record.hash.as_slice() != publication.digest
            || record.expires_ms != request.expires_ms
        {
            return Err(err(libc::EINVAL, "publication receipt mismatch"));
        }
        for node in &record.targets {
            if self.verbs(&reader, &session, node)? == 0 {
                return Err(err(libc::EACCES, "publication no longer authorized"));
            }
        }
        let mut outcome = record.outcome;
        outcome.node = outcome
            .node
            .map(|node| self.public_node(&reader, &session, node))
            .transpose()?;
        self.pin_outcome(&session, &outcome);
        Ok(Some(Publication {
            receipt: PublicationReceipt {
                publication,
                tenant_head: outcome.head,
            },
            outcome,
        }))
    }
    pub fn persist_through(
        &self,
        session: &str,
        receipt: PublicationReceipt,
        level: DurabilityLevel,
    ) -> Result<PersistenceConfirmation> {
        if level != DurabilityLevel::Local {
            return Err(err(
                libc::EOPNOTSUPP,
                "quorum persistence is not implemented",
            ));
        }
        let target = {
            let _writer = self.writer.lock();
            let published = self
                .publication_record(session, receipt.publication.clone())?
                .ok_or_else(|| {
                    err(
                        libc::ESTALE,
                        "publication outcome is unknown in recovered lineage",
                    )
                })?;
            if published.receipt != receipt {
                return Err(err(libc::EINVAL, "publication head mismatch"));
            }
            self.published.load(Ordering::SeqCst)
        };
        let persistence = self.persistence.lock();
        if let Some(error) = self.storage_error.lock().clone() {
            return Err(err(libc::EIO, error));
        }
        if self.persisted.load(Ordering::SeqCst) < target {
            self.persistence_barrier_locked(&persistence, || (), || self.store.persist())?;
        }
        Ok(PersistenceConfirmation {
            incarnation: self.incarnation.clone(),
            engine_prefix: self.persisted.load(Ordering::SeqCst),
            level,
        })
    }
    pub fn persist(&self) -> Result<u64> {
        self.persistence_barrier(|| (), || self.store.persist())
            .map(|(head, ())| head)
    }
    fn persistence_barrier<T>(
        &self,
        capture: impl FnOnce() -> T,
        flush: impl FnOnce() -> Result<()>,
    ) -> Result<(u64, T)> {
        let persistence = self.persistence.lock();
        self.persistence_barrier_locked(&persistence, capture, flush)
    }
    fn persistence_barrier_locked<T>(
        &self,
        _persistence: &parking_lot::MutexGuard<'_, ()>,
        capture: impl FnOnce() -> T,
        flush: impl FnOnce() -> Result<()>,
    ) -> Result<(u64, T)> {
        let (head, bytes, captured) = {
            let _writer = self.writer.lock();
            (
                self.published.load(Ordering::SeqCst),
                self.pending_bytes.load(Ordering::SeqCst),
                capture(),
            )
        };
        self.fault_point("before_persist", head);
        let result = if self.fail_sync.load(Ordering::SeqCst) {
            Err(err(libc::EIO, "injected WAL sync failure"))
        } else {
            flush()
        };
        let _writer = self.writer.lock();
        if let Err(error) = result {
            *self.storage_error.lock() = Some(error.to_string());
            return Err(error);
        }
        self.fault_point("after_persist", head);
        self.persisted.store(head, Ordering::SeqCst);
        self.pending_bytes.fetch_sub(bytes, Ordering::SeqCst);
        self.last_sync_ms.store(now_ms(), Ordering::SeqCst);
        Ok((head, captured))
    }
    pub fn drain(&self) -> Result<u64> {
        self.draining.store(true, Ordering::SeqCst);
        self.persist()
    }
    pub fn metrics(&self, session: &str) -> Result<Metrics> {
        let session = self.session(session)?;
        if !session.admin {
            return Err(err(libc::EACCES, "administrator required"));
        }
        Ok(Metrics {
            published: self.published.load(Ordering::SeqCst),
            persisted: self.persisted.load(Ordering::SeqCst),
            pending_bytes: self.pending_bytes.load(Ordering::SeqCst),
            persistence_age_ms: now_ms().saturating_sub(self.last_sync_ms.load(Ordering::SeqCst)),
            retained_bytes: self.store.reader().state(&session.tenant)?.retained_bytes,
            storage_error: self.storage_error.lock().clone(),
            live_sst_bytes: self.store.property("rocksdb.live-sst-files-size"),
            pending_compaction_bytes: self
                .store
                .property("rocksdb.estimate-pending-compaction-bytes"),
        })
    }
    pub fn validate(&self, tenant: &str) -> Result<()> {
        let reader = self.store.reader();
        let state = reader.state(tenant)?;
        if state.schema != 1 {
            return Err(err(libc::EIO, "unsupported schema"));
        }
        let nodes = reader.scan::<Node>("metadata", key(tenant, &["node"]))?;
        if state.node_count != nodes.len() as u64 {
            return Err(err(libc::EIO, "node count mismatch"));
        }
        let root = reader.node(tenant, &state.root)?;
        if root.kind != Kind::Directory || root.parent.is_some() || root.unlinked {
            return Err(err(libc::EIO, "invalid root"));
        }
        for (entry_key, entry) in reader.scan::<Entry>("metadata", key(tenant, &["entry"]))? {
            let parts = decode_key(&entry_key)?;
            if parts.len() != 5 {
                return Err(err(libc::EIO, "invalid entry key"));
            }
            let node = reader.node(tenant, &entry.node)?;
            let parent = reader.node(tenant, &parts[3])?;
            if node.parent.as_ref() != Some(&parts[3])
                || node.name != parts[4]
                || node.unlinked
                || node.entry_token != entry.token
                || parent.kind != Kind::Directory
                || parent.unlinked
            {
                return Err(err(libc::EIO, "entry does not match live namespace"));
            }
        }
        for (reverse_key, (node, verbs)) in
            reader.scan::<(Id, u16)>("metadata", key(tenant, &["grant_by_subject"]))?
        {
            let parts = decode_key(&reverse_key)?;
            if parts.len() != 5 || parts[4] != node || verbs == 0 || verbs & !ALL != 0 {
                return Err(err(libc::EIO, "invalid grant reverse index"));
            }
            reader.node(tenant, &node)?;
            if reader.get::<u16>(
                "metadata",
                key(tenant, &["grant_by_node", &node, &parts[3]]),
            )? != Some(verbs)
            {
                return Err(err(libc::EIO, "grant forward index mismatch"));
            }
        }
        for (index_key, principal) in reader.scan::<Id>("metadata", key(tenant, &["member"]))? {
            let parts = decode_key(&index_key)?;
            if parts.len() != 5
                || parts[4] != principal
                || reader.get::<Id>("metadata", key(tenant, &["groups", &principal, &parts[3]]))?
                    != Some(parts[3].clone())
            {
                return Err(err(libc::EIO, "membership reverse index mismatch"));
            }
        }
        for (index_key, group) in reader.scan::<Id>("metadata", key(tenant, &["groups"]))? {
            let parts = decode_key(&index_key)?;
            if parts.len() != 5
                || parts[4] != group
                || reader.get::<Id>("metadata", key(tenant, &["member", &group, &parts[3]]))?
                    != Some(parts[3].clone())
            {
                return Err(err(libc::EIO, "membership forward index mismatch"));
            }
        }
        for (_, node) in &nodes {
            self.ancestry(&reader, tenant, &node.id)?;
            if !node.unlinked
                && let Some(parent) = &node.parent
            {
                let entry = reader
                    .entry(tenant, parent, &node.name)?
                    .ok_or_else(|| err(libc::EIO, "missing namespace entry"))?;
                if entry.node != node.id {
                    return Err(err(libc::EIO, "namespace identity mismatch"));
                }
            }
            if node.kind == Kind::File {
                let manifest = self.manifest(&reader, tenant, node, &node.version)?;
                if manifest.size != node.size {
                    return Err(err(libc::EIO, "manifest size mismatch"));
                }
            }
        }
        for (_, manifest) in reader.scan::<Manifest>("metadata", key(tenant, &["version"]))? {
            for chunk in manifest.chunks.values() {
                self.chunk(&reader, tenant, chunk)?;
            }
        }
        let changes = reader.scan::<Change>("changes", key(tenant, &["sequence"]))?;
        let mut expected = state.journal_floor + 1;
        for (_, change) in changes {
            if change.head != expected {
                return Err(err(libc::EIO, "journal gap"));
            }
            expected += 1;
        }
        if expected != state.head + 1 {
            return Err(err(libc::EIO, "journal head mismatch"));
        }
        let retries = reader.scan::<RetryRecord>("metadata", key(tenant, &["request"]))?;
        let mut retry_heads = BTreeSet::new();
        for (retry_key, record) in retries {
            let parts = decode_key(&retry_key)?;
            if parts.len() != 6
                || parts[3] != record.principal
                || record.outcome.head > state.head
                || record.outcome.head == 0
                || !retry_heads.insert(record.outcome.head)
            {
                return Err(err(libc::EIO, "invalid retry index"));
            }
            for target in record.targets {
                reader.node(tenant, &target)?;
            }
        }
        if retry_heads.len() as u64 != state.head {
            return Err(err(libc::EIO, "missing retry outcome"));
        }
        for (_, node) in nodes {
            for (grant_key, verbs) in
                reader.scan::<u16>("metadata", key(tenant, &["grant_by_node", &node.id]))?
            {
                let parts = decode_key(&grant_key)?;
                let subject = parts
                    .get(4)
                    .ok_or_else(|| err(libc::EIO, "invalid grant key"))?;
                let reverse: Option<(Id, u16)> = reader.get(
                    "metadata",
                    key(tenant, &["grant_by_subject", subject, &node.id]),
                )?;
                if reverse != Some((node.id.clone(), verbs)) {
                    return Err(err(libc::EIO, "grant index mismatch"));
                }
            }
        }
        Ok(())
    }
}
