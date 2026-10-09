use crate::model::*;
use crate::objects::{decode, encode, hash, hex};
use crate::store::{Commit, PublicationBatch, Store};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::time::Duration;

mod content;
pub mod import;
pub(crate) mod indexing;
mod mutations;
pub(crate) mod search;
mod views;

const RETRIES: usize = 64;
const VALUE_LIMIT: usize = 1 << 20;

#[derive(Clone)]
pub struct Limits {
    pub max_nodes: usize,
    pub max_sessions: usize,
    pub max_handles: usize,
    pub max_groups: usize,
    pub snapshot_bytes: usize,
    pub retained_bytes: u64,
    pub session_ms: u64,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            max_nodes: 100_000,
            max_sessions: 256,
            max_handles: 4096,
            max_groups: 256,
            snapshot_bytes: 256 << 20,
            retained_bytes: 8 << 30,
            session_ms: 3_600_000,
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
struct SessionRecord {
    session: Session,
    credential: String,
    handles: usize,
}

#[derive(Clone, Serialize, Deserialize)]
struct Handle {
    session: Id,
    node: Id,
    write: bool,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct IndexEvent {
    pub head: u64,
    pub nodes: Vec<Id>,
    pub subtree_roots: Vec<Id>,
    pub policy_changed: bool,
}

struct SessionContext {
    batch: PublicationBatch,
    record: SessionRecord,
}

struct Context {
    batch: PublicationBatch,
    record: SessionRecord,
    state: State,
}

#[derive(Clone)]
struct SessionKeys {
    credential: String,
    principal: Id,
}

#[derive(Default)]
struct SessionKeyHints {
    entries: HashMap<Id, SessionKeys>,
    bytes: usize,
}

impl SessionKeyHints {
    fn remember(&mut self, record: &SessionRecord) {
        let key = &record.session.id;
        if self.entries.get(key).is_some_and(|hint| {
            hint.credential == record.credential && hint.principal == record.session.principal
        }) {
            return;
        }
        let charge = key.len() + record.credential.len() + record.session.principal.len() + 128;
        if charge > 256 << 10 {
            return;
        }
        if self.entries.contains_key(key)
            || self.entries.len() >= 256
            || self.bytes + charge > 256 << 10
        {
            self.entries.clear();
            self.bytes = 0;
        }
        self.entries.insert(
            key.clone(),
            SessionKeys {
                credential: record.credential.clone(),
                principal: record.session.principal.clone(),
            },
        );
        self.bytes += charge;
    }
}

pub struct Engine {
    pub store: Store,
    pub incarnation: Id,
    limits: Limits,
    credentials: HashMap<String, Credential>,
    session_keys: parking_lot::Mutex<SessionKeyHints>,
}

impl From<crate::store::Error> for Error {
    fn from(error: crate::store::Error) -> Self {
        let code = match &error {
            crate::store::Error::Invalid(_) => libc::EINVAL,
            crate::store::Error::Capacity(_) => libc::E2BIG,
            crate::store::Error::Deadline | crate::store::Error::Ambiguous(_) => libc::ETIMEDOUT,
            _ => libc::EIO,
        };
        err(code, error.to_string())
    }
}

pub fn token_hash(token: &str) -> String {
    hex(&hash(token.as_bytes()))
}

fn key(parts: &[&str]) -> Vec<u8> {
    let mut bytes = Vec::new();
    for part in parts {
        for byte in part.bytes() {
            if byte == 0 {
                bytes.extend([0, 255]);
            } else {
                bytes.push(byte);
            }
        }
        bytes.extend([0, 0]);
    }
    bytes
}

impl PublicationBatch {
    async fn load<T: DeserializeOwned>(&self, parts: &[&str]) -> Result<Option<T>> {
        self.get(&key(parts))
            .await?
            .map(|bytes| decode(&bytes, VALUE_LIMIT).map_err(Error::from))
            .transpose()
    }

    async fn save<T: Serialize>(&mut self, parts: &[&str], value: &T) -> Result<()> {
        self.put(&key(parts), &encode(value, VALUE_LIMIT)?).await?;
        Ok(())
    }

    async fn remove(&mut self, parts: &[&str]) -> Result<()> {
        self.delete(&key(parts)).await?;
        Ok(())
    }

    async fn node(&self, node: &str) -> Result<Node> {
        self.load(&["node", node])
            .await?
            .ok_or_else(|| err(libc::ENOENT, "node absent"))
    }

    async fn entry(&self, parent: &str, name: &str) -> Result<Option<Entry>> {
        self.load(&["entry", parent, name]).await
    }
}

async fn backoff(attempt: usize) {
    tokio::time::sleep(Duration::from_millis(1u64 << attempt.min(5))).await;
}

pub(crate) fn session_tenant(session: &str) -> Result<String> {
    let (tenant, nonce) = session
        .split_once(':')
        .ok_or_else(|| err(libc::EACCES, "invalid session"))?;
    if tenant.is_empty()
        || tenant.len() > 1024
        || tenant.len() % 2 != 0
        || nonce.len() != 32
        || !nonce.bytes().all(|b| b.is_ascii_hexdigit())
    {
        return Err(err(libc::EACCES, "invalid session"));
    }
    let bytes = tenant
        .as_bytes()
        .as_chunks::<2>()
        .0
        .iter()
        .map(|pair| {
            let digit = |b: u8| {
                char::from(b)
                    .to_digit(16)
                    .ok_or_else(|| err(libc::EACCES, "invalid session"))
            };
            Ok((digit(pair[0])? * 16 + digit(pair[1])?) as u8)
        })
        .collect::<Result<Vec<_>>>()?;
    String::from_utf8(bytes).map_err(|_| err(libc::EACCES, "invalid session tenant"))
}

impl Engine {
    pub(crate) fn tenants(&self) -> Vec<Id> {
        self.credentials
            .values()
            .map(|credential| credential.tenant.clone())
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect()
    }

    pub(crate) fn tenant_for_token(&self, token: &str) -> Result<Id> {
        self.credentials
            .get(&token_hash(token))
            .map(|credential| credential.tenant.clone())
            .ok_or_else(|| err(libc::EACCES, "credential rejected"))
    }

    pub async fn open(store: Store, credentials: Vec<Credential>, limits: Limits) -> Result<Self> {
        if credentials.is_empty()
            || credentials.len() > 4096
            || limits.max_nodes == 0
            || limits.max_nodes > 1_000_000
            || limits.max_sessions == 0
            || limits.max_sessions > 256
            || limits.max_handles == 0
            || limits.max_handles > 4096
            || limits.max_groups == 0
            || limits.max_groups > 256
            || limits.session_ms == 0
            || limits.session_ms > 3_600_000
            || limits.snapshot_bytes == 0
            || limits.snapshot_bytes > 512 << 20
        {
            return Err(err(libc::EINVAL, "invalid engine limits"));
        }
        let mut mapped = HashMap::new();
        for credential in credentials {
            if credential.tenant.is_empty()
                || credential.tenant.len() > 512
                || credential.tenant.contains('\0')
                || credential.principal.is_empty()
                || credential.principal.len() > 512
                || credential.token_hash.len() != 64
                || !credential.token_hash.bytes().all(|b| b.is_ascii_hexdigit())
                || credential.issuer.len() > 512
                || credential.subject.len() > 512
            {
                return Err(err(libc::EINVAL, "invalid credential identity"));
            }
            if mapped
                .insert(credential.token_hash.clone(), credential)
                .is_some()
            {
                return Err(err(libc::EINVAL, "duplicate credential"));
            }
        }
        let mut incarnation = None;
        for attempt in 0..RETRIES {
            let mut batch = store.snapshot("\0control").await?.batch();
            if let Some(existing) = batch.load::<Id>(&["incarnation"]).await? {
                incarnation = Some(existing);
                break;
            }
            let candidate = id();
            batch.save(&["incarnation"], &candidate).await?;
            if matches!(batch.commit().await?, Commit::Published { .. }) {
                incarnation = Some(candidate);
                break;
            }
            backoff(attempt).await;
        }
        let engine = Self {
            store,
            credentials: mapped,
            session_keys: parking_lot::Mutex::new(SessionKeyHints::default()),
            limits,
            incarnation: incarnation.ok_or_else(|| err(libc::EAGAIN, "bootstrap contention"))?,
        };
        for credential in engine.credentials.values() {
            engine.provision(credential).await?;
        }
        Ok(engine)
    }

    async fn provision(&self, credential: &Credential) -> Result<()> {
        for attempt in 0..RETRIES {
            let mut batch = self.store.snapshot(&credential.tenant).await?.batch();
            if let Some(existing) = batch
                .load::<Credential>(&["credential", &credential.token_hash])
                .await?
            {
                if encode(&existing, VALUE_LIMIT)? != encode(credential, VALUE_LIMIT)? {
                    return Err(err(
                        libc::EINVAL,
                        "credential configuration differs from shared authority",
                    ));
                }
                return Ok(());
            }
            if batch.load::<State>(&["state"]).await?.is_none() {
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
                batch.save(&["node", &node.id], &node).await?;
                batch
                    .save(
                        &["state"],
                        &State {
                            schema: 1,
                            root: node.id,
                            head: 0,
                            auth_generation: 0,
                            journal_floor: 0,
                            retained_bytes: 0,
                            node_count: 1,
                        },
                    )
                    .await?;
            }
            let identity = ["identity", &credential.issuer, &credential.subject];
            if let Some(existing) = batch.load::<Id>(&identity).await?
                && existing != credential.principal
            {
                return Err(err(libc::EINVAL, "identity remapping"));
            }
            batch.save(&identity, &credential.principal).await?;
            batch
                .save(&["principal", &credential.principal], &true)
                .await?;
            batch
                .save(&["credential", &credential.token_hash], credential)
                .await?;
            if matches!(batch.commit().await?, Commit::Published { .. }) {
                return Ok(());
            }
            backoff(attempt).await;
        }
        Err(err(libc::EAGAIN, "provisioning contention"))
    }

    pub async fn login(&self, token: &str) -> Result<Session> {
        let credential_hash = token_hash(token);
        let configured = self
            .credentials
            .get(&credential_hash)
            .ok_or_else(|| err(libc::EACCES, "credential rejected"))?;
        for attempt in 0..RETRIES {
            let mut batch = self.store.snapshot(&configured.tenant).await?.batch();
            let credential: Credential = batch
                .load(&["credential", &credential_hash])
                .await?
                .ok_or_else(|| err(libc::EACCES, "credential revoked"))?;
            let time_ms = now_ms();
            if credential.expires_ms <= time_ms {
                return Err(err(libc::EACCES, "credential expired"));
            }
            let rows = batch
                .scan(&key(&["session"]), None, self.limits.max_sessions + 1)
                .await?;
            let mut active = 0;
            for (key, value) in rows {
                let record: SessionRecord = decode(&value, VALUE_LIMIT)?;
                if record.session.expires_ms <= time_ms {
                    batch.delete(&key).await?;
                } else {
                    active += 1;
                }
            }
            if active >= self.limits.max_sessions {
                return Err(err(libc::EAGAIN, "session capacity"));
            }
            let expiry = credential
                .expires_ms
                .min(time_ms.saturating_add(self.limits.session_ms));
            let session = Session {
                id: format!("{}:{}", hex(credential.tenant.as_bytes()), id()),
                tenant: credential.tenant,
                principal: credential.principal,
                admin: credential.admin,
                scope: credential.scope,
                incarnation: self.incarnation.clone(),
                expires_ms: expiry,
                retry_epoch: id(),
                retry_expires_ms: expiry,
            };
            let record = SessionRecord {
                session: session.clone(),
                credential: credential_hash.clone(),
                handles: 0,
            };
            batch.save(&["session", &session.id], &record).await?;
            if matches!(batch.commit().await?, Commit::Published { .. }) {
                return Ok(session);
            }
            backoff(attempt).await;
        }
        Err(err(libc::EAGAIN, "login contention"))
    }

    async fn session_context(&self, session_id: &str) -> Result<SessionContext> {
        self.session_context_with(session_id, Vec::new(), None)
            .await
    }

    async fn session_context_with(
        &self,
        session_id: &str,
        mut keys: Vec<Vec<u8>>,
        request: Option<&RequestId>,
    ) -> Result<SessionContext> {
        let tenant = session_tenant(session_id)?;
        let mut batch = self.store.snapshot(&tenant).await?.batch();
        keys.push(key(&["session", session_id]));
        let hint = self.session_keys.lock().entries.get(session_id).cloned();
        if let Some(hint) = hint {
            keys.push(key(&["credential", &hint.credential]));
            if let Some(request) = request {
                keys.push(key(&[
                    "request",
                    &hint.principal,
                    &request.epoch,
                    &request.id,
                ]));
            }
        }
        batch.prefetch(&keys).await?;
        let record: SessionRecord = batch
            .load(&["session", session_id])
            .await?
            .ok_or_else(|| err(libc::ESTALE, "session absent"))?;
        let session = &record.session;
        let credential: Credential = batch
            .load(&["credential", &record.credential])
            .await?
            .ok_or_else(|| err(libc::EACCES, "credential revoked"))?;
        if session.id != session_id
            || session.tenant != tenant
            || session.incarnation != self.incarnation
            || session.expires_ms <= now_ms()
            || credential.expires_ms <= now_ms()
            || credential.principal != session.principal
            || credential.tenant != session.tenant
            || credential.scope != session.scope
            || credential.admin != session.admin
        {
            return Err(err(libc::EACCES, "session authority expired or changed"));
        }
        self.session_keys.lock().remember(&record);
        Ok(SessionContext { batch, record })
    }

    async fn context(&self, session_id: &str) -> Result<Context> {
        self.context_with(session_id, Vec::new(), None).await
    }

    async fn context_with(
        &self,
        session_id: &str,
        mut keys: Vec<Vec<u8>>,
        request: Option<&RequestId>,
    ) -> Result<Context> {
        keys.push(key(&["state"]));
        let SessionContext { batch, record } =
            self.session_context_with(session_id, keys, request).await?;
        let state = batch
            .load(&["state"])
            .await?
            .ok_or_else(|| err(libc::EIO, "tenant state missing"))?;
        Ok(Context {
            batch,
            record,
            state,
        })
    }

    pub async fn session(&self, session: &str) -> Result<Session> {
        Ok(self.session_context(session).await?.record.session)
    }

    pub async fn logout(&self, session: &str) -> Result<()> {
        let tenant = session_tenant(session)?;
        for attempt in 0..RETRIES {
            let mut batch = self.store.snapshot(&tenant).await?.batch();
            if batch
                .load::<SessionRecord>(&["session", session])
                .await?
                .is_none()
            {
                return Ok(());
            }
            batch.remove(&["session", session]).await?;
            if matches!(batch.commit().await?, Commit::Published { .. }) {
                return Ok(());
            }
            backoff(attempt).await;
        }
        Err(err(libc::EAGAIN, "logout contention"))
    }

    async fn ancestry(&self, batch: &PublicationBatch, node: &str) -> Result<Vec<Node>> {
        let mut nodes = Vec::new();
        let mut seen = BTreeSet::new();
        let mut next = Some(node.to_owned());
        let mut bytes = 0;
        while let Some(id) = next {
            if !seen.insert(id.clone()) {
                return Err(err(libc::ELOOP, "namespace cycle"));
            }
            let node = batch.node(&id).await?;
            bytes += node.retained_bytes() + 128;
            if nodes.len() >= self.limits.max_nodes || bytes > self.limits.snapshot_bytes {
                return Err(err(libc::E2BIG, "ancestry capacity"));
            }
            next = node.parent.clone();
            nodes.push(node);
        }
        Ok(nodes)
    }

    async fn subjects(&self, batch: &PublicationBatch, session: &Session) -> Result<Vec<Id>> {
        let rows = batch
            .scan(
                &key(&["groups", &session.principal]),
                None,
                self.limits.max_groups + 1,
            )
            .await?;
        if rows.len() > self.limits.max_groups {
            return Err(err(libc::E2BIG, "group capacity"));
        }
        let mut subjects = vec![session.principal.clone()];
        for (_, value) in rows {
            subjects.push(decode(&value, VALUE_LIMIT)?);
        }
        Ok(subjects)
    }

    async fn verbs(&self, batch: &PublicationBatch, session: &Session, node: &str) -> Result<u16> {
        if session.admin && session.scope.is_none() {
            return Ok(ALL);
        }
        let chain = self.ancestry(batch, node).await?;
        if session
            .scope
            .as_ref()
            .is_some_and(|scope| !chain.iter().any(|n| &n.id == scope))
        {
            return Ok(0);
        }
        if session.admin {
            return Ok(ALL);
        }
        let subjects = self.subjects(batch, session).await?;
        let mut verbs = 0;
        for node in chain {
            for subject in &subjects {
                verbs |= batch
                    .load::<u16>(&["grant", &node.id, subject])
                    .await?
                    .unwrap_or(0);
            }
        }
        Ok(verbs)
    }

    async fn require(
        &self,
        batch: &PublicationBatch,
        session: &Session,
        node: &str,
        required: u16,
    ) -> Result<()> {
        if self.verbs(batch, session, node).await? & required != required {
            return Err(err(libc::EACCES, "permission denied"));
        }
        Ok(())
    }

    async fn live_node(
        &self,
        batch: &PublicationBatch,
        session: &Session,
        node: &str,
        handle: Option<&str>,
        write: bool,
    ) -> Result<Node> {
        let node = batch.node(node).await?;
        if let Some(handle) = handle {
            if let Some(pin) = handle.strip_prefix("view:") {
                if pin != node.id
                    || !batch
                        .load::<bool>(&["pin", &session.id, pin])
                        .await?
                        .unwrap_or(false)
                {
                    return Err(err(libc::EACCES, "view pin mismatch"));
                }
            } else {
                let handle: Handle = batch
                    .load(&["handle", &session.id, handle])
                    .await?
                    .ok_or_else(|| err(libc::ESTALE, "handle absent"))?;
                if handle.session != session.id
                    || handle.node != node.id
                    || (write && !handle.write)
                {
                    return Err(err(libc::EACCES, "handle mismatch"));
                }
            }
        } else if node.unlinked {
            return Err(err(libc::ENOENT, "unlinked node"));
        }
        Ok(node)
    }

    async fn public_node(
        &self,
        batch: &PublicationBatch,
        session: &Session,
        mut node: Node,
    ) -> Result<Node> {
        if let Some(parent) = &node.parent
            && self.verbs(batch, session, parent).await? & TRAVERSE == 0
        {
            node.parent = None;
        }
        Ok(node)
    }

    pub async fn root(&self, session: &str) -> Result<Id> {
        Ok(self.context(session).await?.state.root)
    }

    pub async fn head(&self, session: &str) -> Result<(u64, u64)> {
        let state = self.context(session).await?.state;
        Ok((state.head, state.auth_generation))
    }

    pub async fn stat(&self, session: &str, node: &str, handle: Option<&str>) -> Result<Node> {
        let context = self.context(session).await?;
        let session = &context.record.session;
        let node = self
            .live_node(&context.batch, session, node, handle, false)
            .await?;
        if self.verbs(&context.batch, session, &node.id).await? == 0 {
            return Err(err(libc::EACCES, "permission denied"));
        }
        self.public_node(&context.batch, session, node).await
    }

    pub async fn lookup(&self, session: &str, parent: &str, name: &str) -> Result<(Node, Entry)> {
        check_name(name)?;
        let context = self.context(session).await?;
        let session = &context.record.session;
        self.parent(&context.batch, session, parent, TRAVERSE)
            .await?;
        let entry = context
            .batch
            .entry(parent, name)
            .await?
            .ok_or_else(|| err(libc::ENOENT, "entry absent"))?;
        let node = context.batch.node(&entry.node).await?;
        if self.verbs(&context.batch, session, &node.id).await? == 0 {
            return Err(err(libc::EACCES, "permission denied"));
        }
        Ok((
            self.public_node(&context.batch, session, node).await?,
            entry,
        ))
    }

    pub async fn open_handle(
        &self,
        session_id: &str,
        node: &str,
        write: bool,
    ) -> Result<(Id, Node)> {
        let handle_id = id();
        for attempt in 0..RETRIES {
            let mut context = self.context(session_id).await?;
            let session = context.record.session.clone();
            let node = self
                .live_node(&context.batch, &session, node, None, write)
                .await?;
            self.require(
                &context.batch,
                &session,
                &node.id,
                if write { WRITE } else { READ },
            )
            .await?;
            if node.kind != Kind::File {
                return Err(err(libc::EISDIR, "not a regular file"));
            }
            if context.record.handles >= self.limits.max_handles {
                return Err(err(libc::EMFILE, "handle capacity"));
            }
            context.record.handles += 1;
            context
                .batch
                .save(&["session", session_id], &context.record)
                .await?;
            context
                .batch
                .save(
                    &["handle", session_id, &handle_id],
                    &Handle {
                        session: session_id.to_owned(),
                        node: node.id.clone(),
                        write,
                    },
                )
                .await?;
            let public = self.public_node(&context.batch, &session, node).await?;
            if matches!(context.batch.commit().await?, Commit::Published { .. }) {
                return Ok((handle_id, public));
            }
            backoff(attempt).await;
        }
        Err(err(libc::EAGAIN, "open contention"))
    }

    pub async fn close_handle(&self, session_id: &str, handle: &str) -> Result<()> {
        for attempt in 0..RETRIES {
            let mut context = self.context(session_id).await?;
            if context
                .batch
                .load::<Handle>(&["handle", session_id, handle])
                .await?
                .is_none()
            {
                return Ok(());
            }
            context.record.handles = context
                .record
                .handles
                .checked_sub(1)
                .ok_or_else(|| err(libc::EIO, "handle accounting"))?;
            context
                .batch
                .remove(&["handle", session_id, handle])
                .await?;
            context
                .batch
                .save(&["session", session_id], &context.record)
                .await?;
            if matches!(context.batch.commit().await?, Commit::Published { .. }) {
                return Ok(());
            }
            backoff(attempt).await;
        }
        Err(err(libc::EAGAIN, "close contention"))
    }

    async fn parent(
        &self,
        batch: &PublicationBatch,
        session: &Session,
        node: &str,
        verbs: u16,
    ) -> Result<Node> {
        let parent = self.live_node(batch, session, node, None, false).await?;
        if parent.kind != Kind::Directory {
            return Err(err(libc::ENOTDIR, "parent is not a directory"));
        }
        self.require(batch, session, node, verbs | TRAVERSE).await?;
        Ok(parent)
    }
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
