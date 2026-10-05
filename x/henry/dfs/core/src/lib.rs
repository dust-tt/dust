//! Filesystem operations over any ordered transactional `Store`. No network, no SDK.

pub mod auth;
pub mod records;

use std::collections::{BTreeMap, HashMap};
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use dfs_proto::{
    Attr, BLOCK_BYTES, Entry, Errno, File, Id, Invalidation, Kind, MAX_FILE_BYTES, MAX_FLUSH_BLOCKS, MAX_IO_BYTES, MAX_NAME_BYTES, ROOT, Response, Right,
};
use dfs_store::{Key, Store, StoreError, Txn, TxnOptions, Value};
use futures::FutureExt;
use futures::future::BoxFuture;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};

use crate::auth::{Access, Principal, evaluate};
use crate::records::{EntryRecord, Node, Policy, SessionRecord, TokenRecord, decode, encode, le_u64};

/// A cached read version is reused for at most this long (FDB rejects versions older than 5 s).
const GRV_REUSE: Duration = Duration::from_millis(1000);
/// A node written by this server can seed a zero-read flush for this long.
const RECENT_REUSE: Duration = Duration::from_millis(4000);
const RECENT_LIMIT: usize = 65_536;
const MAX_DEPTH: usize = 4096;
const ATTEMPTS: usize = 64;
/// Most files one `read_files` call considers.
const MAX_READ_FILES: usize = 1024;

enum Failure {
    Store(StoreError),
    Fs(Errno),
}

impl From<StoreError> for Failure {
    fn from(error: StoreError) -> Self {
        Failure::Store(error)
    }
}

impl From<Errno> for Failure {
    fn from(errno: Errno) -> Self {
        Failure::Fs(errno)
    }
}

type Step<T> = Result<T, Failure>;

#[derive(Clone, Copy, Debug)]
struct Attempt {
    fresh: bool,
    /// An earlier attempt's commit outcome is unknown: consult the receipt first.
    uncertain: bool,
}

impl Attempt {
    const READ: Attempt = Attempt { fresh: true, uncertain: false };

    fn mutation(caller: &Caller) -> Attempt {
        Attempt { fresh: false, uncertain: caller.resent }
    }
}

/// Identity and receipt slot of one mutation call.
#[derive(Clone, Debug)]
pub struct Caller {
    pub principal: Principal,
    pub session: u128,
    pub seq: u64,
    /// The call may be a retransmission of one that already committed: every attempt consults
    /// the receipt. The server MUST NOT run two calls with the same `(session, seq)` concurrently.
    pub resent: bool,
}

/// Result of a committed mutation and what other lease holders must drop before it is
/// acknowledged.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Mutation {
    pub response: Response,
    pub invalidations: Vec<Invalidation>,
}

#[derive(Default)]
pub struct Stats {
    pub commits: AtomicU64,
    pub retries: AtomicU64,
    pub fresh_versions: AtomicU64,
    pub zero_read_flushes: AtomicU64,
}

#[derive(Default)]
struct Versions {
    grv: Option<(u64, Instant)>,
    last_commit: u64,
}

/// Directory nodes, policies and memberships valid for exactly one authorization epoch.
#[derive(Default)]
struct AuthCache {
    epoch: u64,
    dirs: HashMap<Id, Node>,
    policies: HashMap<Id, Policy>,
    groups: HashMap<String, Vec<String>>,
}

#[derive(Clone)]
struct Recent {
    node: Node,
    version: u64,
    epoch: u64,
    at: Instant,
}

#[derive(Default)]
struct Shared {
    versions: Mutex<Versions>,
    auth: Mutex<AuthCache>,
    recent: Mutex<HashMap<Id, Recent>>,
    ids: Mutex<(u64, u64)>,
    refill: tokio::sync::Mutex<()>,
    stats: Stats,
}

#[derive(Clone)]
pub struct Fs<S: Store> {
    store: S,
    shared: Arc<Shared>,
}

pub fn now_ns() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_nanos() as i64)
}

fn valid_name(name: &str) -> Result<(), Errno> {
    if name.len() > MAX_NAME_BYTES {
        return Err(Errno::ENAMETOOLONG);
    }
    if name.is_empty() || name == "." || name == ".." || name.contains(['/', '\0']) {
        return Err(Errno::EINVAL);
    }
    Ok(())
}

fn attr(id: Id, node: &Node, writable: bool, dir_time: u64) -> Attr {
    let dir = node.kind == Kind::Dir;
    let child_change = dir_time as i64;
    Attr {
        id,
        kind: node.kind,
        mode: node.mode,
        size: if dir { 4096 } else { node.size },
        mtime_ns: if dir && child_change > node.mtime_set_ns { child_change } else { node.mtime_ns },
        ctime_ns: if dir { node.ctime_ns.max(child_change) } else { node.ctime_ns },
        rev: node.rev,
        writable,
    }
}

fn node_of(value: Option<Value>) -> Result<Option<Node>, Errno> {
    value.map(|v| decode(&v)).transpose()
}

fn live(value: Option<Value>) -> Result<Node, Errno> {
    match node_of(value)? {
        Some(node) if !node.detached => Ok(node),
        _ => Err(Errno::ENOENT),
    }
}

impl<S: Store> Fs<S> {
    pub fn new(store: S) -> Self {
        Self { store, shared: Arc::default() }
    }

    pub fn stats(&self) -> &Stats {
        &self.shared.stats
    }

    /// @cc [owner:fontanierh,label:backend;concurrency] read-version-reuse
    /// A non-fresh attempt MAY start from `max(cached GRV younger than GRV_REUSE, this server's
    /// last commit version)` only if every read that influences its outcome is conflict-tracked
    /// and every successful outcome is returned only after its transaction commits (a receipt
    /// write guarantees the commit validates). Error outcomes MUST be re-derived by a fresh
    /// attempt before they are returned (`run` enforces this for `Failure::Fs`).
    async fn begin(&self, attempt: Attempt) -> Step<S::Txn> {
        if !attempt.fresh {
            let reuse = {
                let versions = self.shared.versions.lock();
                versions
                    .grv
                    .filter(|(_, at)| at.elapsed() < GRV_REUSE)
                    .map(|(grv, _)| grv.max(versions.last_commit))
            };
            if let Some(version) = reuse {
                return Ok(self.store.begin(TxnOptions { read_version: Some(version) }).await?);
            }
        }
        self.shared.stats.fresh_versions.fetch_add(1, Ordering::Relaxed);
        let txn = self.store.begin(TxnOptions::default()).await?;
        self.shared.versions.lock().grv = Some((txn.read_version(), Instant::now()));
        Ok(txn)
    }

    async fn commit(&self, txn: S::Txn) -> Step<u64> {
        let version = txn.commit().await?;
        self.shared.stats.commits.fetch_add(1, Ordering::Relaxed);
        let mut versions = self.shared.versions.lock();
        versions.last_commit = versions.last_commit.max(version);
        Ok(version)
    }

    async fn run<'a, T>(
        &'a self,
        start: Attempt,
        mut op: impl FnMut(Attempt) -> BoxFuture<'a, Step<T>> + Send + 'a,
    ) -> Result<T, Errno> {
        let mut attempt = start;
        for round in 0..ATTEMPTS {
            match op(attempt).await {
                Ok(value) => return Ok(value),
                Err(Failure::Fs(errno)) if attempt.fresh => return Err(errno),
                Err(Failure::Fs(_)) => attempt.fresh = true,
                Err(Failure::Store(StoreError::Conflict | StoreError::TooOld)) => {
                    self.shared.stats.retries.fetch_add(1, Ordering::Relaxed);
                    attempt.fresh = true;
                    if round >= 4 {
                        tokio::time::sleep(Duration::from_millis(round as u64)).await;
                    }
                }
                Err(Failure::Store(StoreError::Uncertain)) => {
                    attempt.fresh = true;
                    attempt.uncertain = true;
                }
                Err(Failure::Store(StoreError::Limit(_))) => return Err(Errno::EFBIG),
                Err(Failure::Store(StoreError::Unavailable(_))) => return Err(Errno::EIO),
            }
        }
        Err(Errno::EAGAIN)
    }

    /// @cc [owner:fontanierh,label:security;concurrency] auth-cache-epoch
    /// Cached authorization state (directory nodes, policies, memberships) MUST be read and
    /// written only under the cache lock while `cache.epoch` equals the `m/topo` value that the
    /// using transaction read (conflict-tracked). A cache entry MUST never serve a transaction
    /// that read a different epoch.
    fn cached<T>(&self, epoch: u64, get: impl FnOnce(&mut AuthCache) -> Option<T>) -> Option<T> {
        let mut cache = self.shared.auth.lock();
        if cache.epoch < epoch {
            *cache = AuthCache { epoch, ..AuthCache::default() };
        }
        if cache.epoch == epoch { get(&mut cache) } else { None }
    }

    async fn policy_of(&self, txn: &S::Txn, id: Id, node: &Node, epoch: u64) -> Step<Option<Policy>> {
        if !node.policy {
            return Ok(None);
        }
        if let Some(policy) = self.cached(epoch, |c| c.policies.get(&id).cloned()) {
            return Ok(Some(policy));
        }
        let policy: Policy = txn.get(&records::policy(id)).await?.map(|v| decode(&v)).transpose()?.unwrap_or_default();
        self.cached(epoch, |c| c.policies.insert(id, policy.clone()));
        Ok(Some(policy))
    }

    /// Policies from the root down to directory `dir` (inclusive). `known` is `dir`'s node when
    /// already read in this transaction. Uncached ancestors are read (conflict-tracked) in `txn`.
    async fn dir_chain(&self, txn: &S::Txn, dir: Id, known: Option<&Node>, epoch: u64) -> Step<Vec<Option<Policy>>> {
        let mut chain = Vec::new();
        let mut id = dir;
        let mut known = known.cloned();
        for _ in 0..MAX_DEPTH {
            let node = match known.take() {
                Some(node) => node,
                None => match self.cached(epoch, |c| c.dirs.get(&id).cloned()) {
                    Some(node) => node,
                    None => node_of(txn.get(&records::node(id)).await?)?.ok_or(Errno::ENOENT)?,
                },
            };
            if node.kind != Kind::Dir {
                return Err(Errno::ENOTDIR.into());
            }
            chain.push(self.policy_of(txn, id, &node, epoch).await?);
            let parent = node.parent;
            self.cached(epoch, |c| c.dirs.insert(id, node));
            if id == ROOT {
                chain.reverse();
                return Ok(chain);
            }
            id = parent;
        }
        Err(Errno::ELOOP.into())
    }

    async fn groups(&self, txn: &S::Txn, principal: &Principal, epoch: u64) -> Step<Vec<String>> {
        if let Some(groups) = self.cached(epoch, |c| c.groups.get(&principal.name).cloned()) {
            return Ok(groups);
        }
        let rows = txn.scan(&records::memberships(&principal.name), 100_000).await?;
        let groups = rows.iter().map(|(key, _)| records::membership_group(key, &principal.name)).collect::<Result<Vec<_>, _>>()?;
        self.cached(epoch, |c| c.groups.insert(principal.name.clone(), groups.clone()));
        Ok(groups)
    }

    async fn access(&self, txn: &S::Txn, principal: &Principal, id: Id, node: &Node, epoch: u64) -> Step<Access> {
        let chain = if node.kind == Kind::Dir {
            self.dir_chain(txn, id, Some(node), epoch).await?
        } else {
            let mut chain = self.dir_chain(txn, node.parent, None, epoch).await?;
            chain.push(self.policy_of(txn, id, node, epoch).await?);
            chain
        };
        let groups = self.groups(txn, principal, epoch).await?;
        Ok(evaluate(principal, &groups, &chain.iter().map(Option::as_ref).collect::<Vec<_>>()))
    }

    /// Access of a child of `dir` that has no policy of its own, given `dir`'s chain.
    fn inherited(principal: &Principal, groups: &[String], chain: &[Option<Policy>], own: Option<&Policy>) -> Access {
        let mut refs: Vec<Option<&Policy>> = chain.iter().map(Option::as_ref).collect();
        refs.push(own);
        evaluate(principal, groups, &refs)
    }

    async fn next_id(&self) -> Step<Id> {
        loop {
            {
                let mut ids = self.shared.ids.lock();
                if ids.0 < ids.1 {
                    ids.0 += 1;
                    return Ok(ids.0 - 1);
                }
            }
            let _refill = self.shared.refill.lock().await;
            {
                let ids = self.shared.ids.lock();
                if ids.0 < ids.1 {
                    continue;
                }
            }
            let block = 4096;
            let first = self
                .run(Attempt::READ, |_| {
                    async move {
                        let mut txn = self.store.begin(TxnOptions::default()).await?;
                        let next = le_u64(txn.get(records::NEXT_ID).await?.as_ref()).max(1024);
                        txn.set(records::NEXT_ID, &(next + block).to_le_bytes());
                        txn.commit().await?;
                        Ok(next)
                    }
                    .boxed()
                })
                .await
                .map_err(Failure::Fs)?;
            *self.shared.ids.lock() = (first, first + block);
        }
    }

    fn remember(&self, id: Id, node: &Node, version: u64, epoch: u64) {
        let mut recent = self.shared.recent.lock();
        if recent.len() >= RECENT_LIMIT {
            recent.retain(|_, r| r.at.elapsed() < RECENT_REUSE);
        }
        recent.insert(id, Recent { node: node.clone(), version, epoch, at: Instant::now() });
    }

    /// Write the receipt for `caller` and return the mutation.
    fn finish(txn: &mut S::Txn, caller: &Caller, response: Response, invalidations: Vec<Invalidation>) -> Mutation {
        let mutation = Mutation { response, invalidations };
        txn.set(&records::receipt(caller.session, caller.seq), &encode(&mutation));
        mutation
    }

    /// After an uncertain commit, the receipt decides whether the earlier attempt applied.
    async fn replay(txn: &S::Txn, caller: &Caller, attempt: Attempt) -> Step<Option<Mutation>> {
        if !attempt.uncertain {
            return Ok(None);
        }
        Ok(txn.get(&records::receipt(caller.session, caller.seq)).await?.map(|v| decode(&v)).transpose()?)
    }

    // ---------------------------------------------------------------- tenant administration

    /// Creates the tenant root (id 1) with `grants` and an administrator token. Idempotent for
    /// the root; always returns a new token.
    pub async fn provision(&self, grants: Vec<(String, Right)>, admin: &str) -> Result<String, Errno> {
        let token = random_token();
        self.run(Attempt::READ, |_| {
            let grants = grants.clone();
            let token = token.clone();
            async move {
                let mut txn = self.store.begin(TxnOptions::default()).await?;
                if txn.get(&records::node(ROOT)).await?.is_none() {
                    let now = now_ns();
                    let root = Node {
                        parent: 0,
                        name: String::new(),
                        kind: Kind::Dir,
                        mode: 0o755,
                        size: 0,
                        mtime_ns: now,
                        ctime_ns: now,
                        mtime_set_ns: now,
                        rev: 1,
                        target: None,
                        policy: true,
                        detached: false,
                    };
                    txn.set(&records::node(ROOT), &encode(&root));
                    txn.set(&records::policy(ROOT), &encode(&Policy { grants, boundary: false }));
                    let epoch = le_u64(txn.get(records::TOPO).await?.as_ref());
                    txn.set(records::TOPO, &(epoch + 1).to_le_bytes());
                }
                let record = TokenRecord { principal: admin.to_string(), admin: true };
                txn.set(&records::token(&token_hash(&token)), &encode(&record));
                txn.commit().await?;
                Ok(())
            }
            .boxed()
        })
        .await?;
        Ok(token)
    }

    pub async fn authenticate(&self, token: &str) -> Result<Principal, Errno> {
        self.run(Attempt::READ, |attempt| {
            async move {
                let txn = self.begin(attempt).await?;
                let record: TokenRecord = decode(&txn.get(&records::token(&token_hash(token))).await?.ok_or(Errno::EACCES)?)?;
                Ok(Principal { name: record.principal, admin: record.admin })
            }
            .boxed()
        })
        .await
    }

    /// Durably records a new session id for `principal`.
    pub async fn open_session(&self, principal: &Principal) -> Result<u128, Errno> {
        let session: u128 = rand::random();
        let record = SessionRecord { principal: principal.name.clone(), created_ns: now_ns() };
        self.run(Attempt::READ, |attempt| {
            let record = record.clone();
            async move {
                let mut txn = self.begin(attempt).await?;
                txn.set(&records::session(session), &encode(&record));
                self.commit(txn).await?;
                Ok(())
            }
            .boxed()
        })
        .await?;
        Ok(session)
    }

    fn require_admin(caller: &Caller) -> Result<(), Errno> {
        if caller.principal.admin { Ok(()) } else { Err(Errno::EPERM) }
    }

    /// Commits an authorization-changing administrative mutation: bumps the authorization epoch
    /// and invalidates every lease.
    async fn administer(&self, mut txn: S::Txn, caller: &Caller, response: Response) -> Step<Mutation> {
        let epoch = le_u64(txn.get(records::TOPO).await?.as_ref());
        txn.set(records::TOPO, &(epoch + 1).to_le_bytes());
        let mutation = Self::finish(&mut txn, caller, response, vec![Invalidation::All]);
        self.commit(txn).await?;
        Ok(mutation)
    }

    pub async fn grant(&self, caller: &Caller, id: Id, subject: &str, right: Right, granted: bool) -> Result<Mutation, Errno> {
        Self::require_admin(caller)?;
        self.run(Attempt { fresh: true, uncertain: caller.resent }, |attempt| {
            async move {
                let mut txn = self.begin(attempt).await?;
                if let Some(mutation) = Self::replay(&txn, caller, attempt).await? {
                    return Ok(mutation);
                }
                let mut node = live(txn.get(&records::node(id)).await?)?;
                let mut policy: Policy = txn.get(&records::policy(id)).await?.map(|v| decode(&v)).transpose()?.unwrap_or_default();
                policy.grants.retain(|(s, r)| !(s == subject && *r == right));
                if granted {
                    policy.grants.push((subject.to_string(), right));
                }
                node.policy = true;
                txn.set(&records::policy(id), &encode(&policy));
                txn.set(&records::node(id), &encode(&node));
                self.administer(txn, caller, Response::Done).await
            }
            .boxed()
        })
        .await
    }

    pub async fn set_boundary(&self, caller: &Caller, id: Id, boundary: bool) -> Result<Mutation, Errno> {
        Self::require_admin(caller)?;
        self.run(Attempt { fresh: true, uncertain: caller.resent }, |attempt| {
            async move {
                let mut txn = self.begin(attempt).await?;
                if let Some(mutation) = Self::replay(&txn, caller, attempt).await? {
                    return Ok(mutation);
                }
                let mut node = live(txn.get(&records::node(id)).await?)?;
                let mut policy: Policy = txn.get(&records::policy(id)).await?.map(|v| decode(&v)).transpose()?.unwrap_or_default();
                policy.boundary = boundary;
                node.policy = true;
                txn.set(&records::policy(id), &encode(&policy));
                txn.set(&records::node(id), &encode(&node));
                self.administer(txn, caller, Response::Done).await
            }
            .boxed()
        })
        .await
    }

    pub async fn set_members(&self, caller: &Caller, group: &str, members: &[String]) -> Result<Mutation, Errno> {
        Self::require_admin(caller)?;
        self.run(Attempt { fresh: true, uncertain: caller.resent }, |attempt| {
            async move {
                let mut txn = self.begin(attempt).await?;
                if let Some(mutation) = Self::replay(&txn, caller, attempt).await? {
                    return Ok(mutation);
                }
                let old: Vec<String> = txn.get(&records::group(group)).await?.map(|v| decode(&v)).transpose()?.unwrap_or_default();
                for member in &old {
                    txn.clear(&records::membership(member, group));
                }
                for member in members {
                    txn.set(&records::membership(member, group), b"");
                }
                txn.set(&records::group(group), &encode(&members.to_vec()));
                self.administer(txn, caller, Response::Done).await
            }
            .boxed()
        })
        .await
    }

    pub async fn create_token(&self, caller: &Caller, principal: &str, admin: bool) -> Result<Mutation, Errno> {
        Self::require_admin(caller)?;
        let token = &random_token();
        self.run(Attempt { fresh: true, uncertain: caller.resent }, |attempt| {
            async move {
                let mut txn = self.begin(attempt).await?;
                if let Some(mutation) = Self::replay(&txn, caller, attempt).await? {
                    return Ok(mutation);
                }
                let record = TokenRecord { principal: principal.to_string(), admin };
                txn.set(&records::token(&token_hash(token)), &encode(&record));
                self.administer(txn, caller, Response::Token(token.clone())).await
            }
            .boxed()
        })
        .await
    }

    // ---------------------------------------------------------------- reads (fresh versions)

    pub async fn getattr(&self, principal: &Principal, id: Id) -> Result<Attr, Errno> {
        self.run(Attempt::READ, |attempt| {
            async move {
                let txn = self.begin(attempt).await?;
                let values = txn.get_many(&[records::node(id), records::TOPO.to_vec(), records::dir_time(id)]).await?;
                let node = node_of(values[0].clone())?.ok_or(Errno::ESTALE)?;
                let access = self.access(&txn, principal, id, &node, le_u64(values[1].as_ref())).await?;
                if !access.read {
                    return Err(Errno::EACCES.into());
                }
                Ok(attr(id, &node, access.write, le_u64(values[2].as_ref())))
            }
            .boxed()
        })
        .await
    }

    pub async fn lookup(&self, principal: &Principal, parent: Id, name: &str) -> Result<Option<Attr>, Errno> {
        valid_name(name)?;
        self.run(Attempt::READ, |attempt| {
            async move {
                let txn = self.begin(attempt).await?;
                let values = txn.get_many(&[records::node(parent), records::TOPO.to_vec(), records::entry(parent, name)]).await?;
                let dir = live(values[0].clone())?;
                let epoch = le_u64(values[1].as_ref());
                let chain = self.dir_chain(&txn, parent, Some(&dir), epoch).await?;
                let groups = self.groups(&txn, principal, epoch).await?;
                if !Self::inherited(principal, &groups, &chain, None).read {
                    return Err(Errno::EACCES.into());
                }
                let Some(entry) = values[2].as_ref().map(|v| decode::<EntryRecord>(v)).transpose()? else {
                    return Ok(None);
                };
                let child = txn.get_many(&[records::node(entry.id), records::dir_time(entry.id)]).await?;
                let node = live(child[0].clone())?;
                let own = self.policy_of(&txn, entry.id, &node, epoch).await?;
                let access = Self::inherited(principal, &groups, &chain, own.as_ref());
                Ok(Some(attr(entry.id, &node, access.write, le_u64(child[1].as_ref()))))
            }
            .boxed()
        })
        .await
    }

    pub async fn readdir(&self, principal: &Principal, dir: Id, after: Option<&str>, limit: u32) -> Result<Response, Errno> {
        let limit = limit.clamp(1, 4096) as usize;
        self.run(Attempt::READ, |attempt| {
            async move {
                let txn = self.begin(attempt).await?;
                let values = txn.get_many(&[records::node(dir), records::TOPO.to_vec(), records::dir_time(dir)]).await?;
                let node = live(values[0].clone())?;
                let epoch = le_u64(values[1].as_ref());
                let chain = self.dir_chain(&txn, dir, Some(&node), epoch).await?;
                let groups = self.groups(&txn, principal, epoch).await?;
                let access = Self::inherited(principal, &groups, &chain, None);
                if !access.read {
                    return Err(Errno::EACCES.into());
                }
                let mut range = records::entries(dir);
                if let Some(after) = after {
                    range.start = dfs_store::KeyRange::single(&records::entry(dir, after)).end;
                }
                let rows = txn.scan(&range, limit).await?;
                let more = rows.len() == limit;
                let mut keys: Vec<Key> = Vec::with_capacity(rows.len() * 2);
                let mut names = Vec::with_capacity(rows.len());
                for (key, value) in &rows {
                    let entry: EntryRecord = decode(value)?;
                    names.push((records::entry_name(key)?, entry.id));
                    keys.push(records::node(entry.id));
                    keys.push(records::dir_time(entry.id));
                }
                let children = txn.get_many(&keys).await?;
                let mut entries = Vec::with_capacity(names.len());
                for (i, (name, id)) in names.into_iter().enumerate() {
                    // A concurrently removed child is simply absent from this listing.
                    let Some(child) = node_of(children[2 * i].clone())?.filter(|n| !n.detached) else { continue };
                    let own = self.policy_of(&txn, id, &child, epoch).await?;
                    let write = if own.is_some() { Self::inherited(principal, &groups, &chain, own.as_ref()).write } else { access.write };
                    entries.push(Entry { name, attr: attr(id, &child, write, le_u64(children[2 * i + 1].as_ref())) });
                }
                Ok(Response::Listing { dir: attr(dir, &node, access.write, le_u64(values[2].as_ref())), entries, more })
            }
            .boxed()
        })
        .await
    }

    pub async fn read(&self, principal: &Principal, id: Id, offset: u64, len: u32) -> Result<Response, Errno> {
        let len = len.min(MAX_IO_BYTES);
        self.run(Attempt::READ, |attempt| {
            async move {
                let txn = self.begin(attempt).await?;
                let values = txn.get_many(&[records::node(id), records::TOPO.to_vec()]).await?;
                let node = node_of(values[0].clone())?.ok_or(Errno::ESTALE)?;
                if node.kind != Kind::File {
                    return Err(Errno::EISDIR.into());
                }
                if !self.access(&txn, principal, id, &node, le_u64(values[1].as_ref())).await?.read {
                    return Err(Errno::EACCES.into());
                }
                let end = node.size.min(offset.saturating_add(len as u64));
                if offset >= end {
                    return Ok(Response::Data { rev: node.rev, size: node.size, bytes: Vec::new() });
                }
                let (first, last) = ((offset / BLOCK_BYTES) as u32, ((end - 1) / BLOCK_BYTES) as u32);
                let rows = txn.scan(&records::blocks(id, first, last), (last - first + 1) as usize).await?;
                let mut bytes = vec![0u8; (end - offset) as usize];
                for (key, block) in rows {
                    let start = records::block_index(&key)? as u64 * BLOCK_BYTES;
                    copy_overlap(&mut bytes, offset, &block, start);
                }
                Ok(Response::Data { rev: node.rev, size: node.size, bytes })
            }
            .boxed()
        })
        .await
    }

    /// Whole contents of the readable files among `ids` that fit, in order, in `budget` bytes, all
    /// at one read version; objects that are missing, not files, unreadable, or too large are left out.
    pub async fn read_files(&self, principal: &Principal, ids: &[Id], budget: u32) -> Result<Vec<File>, Errno> {
        let ids = &ids[..ids.len().min(MAX_READ_FILES)];
        let budget = u64::from(budget.min(MAX_IO_BYTES));
        self.run(Attempt::READ, |attempt| {
            async move {
                let txn = self.begin(attempt).await?;
                let mut keys: Vec<Key> = ids.iter().map(|id| records::node(*id)).collect();
                keys.push(records::TOPO.to_vec());
                let values = txn.get_many(&keys).await?;
                let epoch = le_u64(values[ids.len()].as_ref());
                let mut left = budget;
                let mut chosen = Vec::new();
                for (id, value) in ids.iter().zip(&values) {
                    let Some(node) = node_of(value.clone())? else { continue };
                    if node.kind != Kind::File || node.size > left {
                        continue;
                    }
                    match self.access(&txn, principal, *id, &node, epoch).await {
                        Ok(access) if access.read => {}
                        Ok(_) | Err(Failure::Fs(_)) => continue,
                        Err(failure) => return Err(failure),
                    }
                    left -= node.size;
                    chosen.push((*id, node));
                }
                let ranges: Vec<_> = chosen
                    .iter()
                    .filter(|(_, node)| node.size > 0)
                    .map(|(id, node)| {
                        let last = ((node.size - 1) / BLOCK_BYTES) as u32;
                        (records::blocks(*id, 0, last), last as usize + 1)
                    })
                    .collect();
                let scans = ranges.iter().map(|(range, blocks)| txn.scan(range, *blocks));
                let mut rows = futures::future::try_join_all(scans).await?.into_iter();
                let mut files = Vec::with_capacity(chosen.len());
                for (id, node) in chosen {
                    let mut bytes = vec![0u8; node.size as usize];
                    if node.size > 0 {
                        for (key, block) in rows.next().unwrap_or_default() {
                            copy_overlap(&mut bytes, 0, &block, records::block_index(&key)? as u64 * BLOCK_BYTES);
                        }
                    }
                    files.push(File { id, rev: node.rev, bytes });
                }
                Ok(files)
            }
            .boxed()
        })
        .await
    }

    pub async fn readlink(&self, principal: &Principal, id: Id) -> Result<String, Errno> {
        self.run(Attempt::READ, |attempt| {
            async move {
                let txn = self.begin(attempt).await?;
                let values = txn.get_many(&[records::node(id), records::TOPO.to_vec()]).await?;
                let node = node_of(values[0].clone())?.ok_or(Errno::ESTALE)?;
                if !self.access(&txn, principal, id, &node, le_u64(values[1].as_ref())).await?.read {
                    return Err(Errno::EACCES.into());
                }
                node.target.ok_or(Errno::EINVAL.into())
            }
            .boxed()
        })
        .await
    }

    // ---------------------------------------------------------------- mutations

    pub async fn create(
        &self,
        caller: &Caller,
        parent: Id,
        name: &str,
        kind: Kind,
        mode: u32,
        exclusive: bool,
        target: Option<&str>,
    ) -> Result<Mutation, Errno> {
        valid_name(name)?;
        self.run(Attempt::mutation(caller), |attempt| {
            async move {
                let mut txn = self.begin(attempt).await?;
                if let Some(mutation) = Self::replay(&txn, caller, attempt).await? {
                    return Ok(mutation);
                }
                let values = txn.get_many(&[records::node(parent), records::TOPO.to_vec(), records::entry(parent, name)]).await?;
                let dir = live(values[0].clone()).map_err(|_| Errno::ENOENT)?;
                let epoch = le_u64(values[1].as_ref());
                let chain = self.dir_chain(&txn, parent, Some(&dir), epoch).await?;
                let groups = self.groups(&txn, &caller.principal, epoch).await?;
                let access = Self::inherited(&caller.principal, &groups, &chain, None);
                if let Some(existing) = values[2].as_ref().map(|v| decode::<EntryRecord>(v)).transpose()? {
                    if exclusive || kind != Kind::File || existing.kind != Kind::File {
                        return Err(Errno::EEXIST.into());
                    }
                    let node = live(txn.get(&records::node(existing.id)).await?)?;
                    let own = self.policy_of(&txn, existing.id, &node, epoch).await?;
                    let access = Self::inherited(&caller.principal, &groups, &chain, own.as_ref());
                    if !access.read {
                        return Err(Errno::EACCES.into());
                    }
                    let response = Response::Created { attr: attr(existing.id, &node, access.write, 0), parent_mtime_ns: 0, existed: true };
                    let mutation = Self::finish(&mut txn, caller, response, Vec::new());
                    self.commit(txn).await?;
                    return Ok(mutation);
                }
                if !access.write {
                    return Err(Errno::EACCES.into());
                }
                let id = self.next_id().await?;
                let now = now_ns();
                let node = Node {
                    parent,
                    name: name.to_string(),
                    kind,
                    mode: mode & 0o7777,
                    size: target.map_or(0, |t| t.len() as u64),
                    mtime_ns: now,
                    ctime_ns: now,
                    mtime_set_ns: now,
                    rev: 1,
                    target: target.map(str::to_string),
                    policy: false,
                    detached: false,
                };
                txn.set(&records::node(id), &encode(&node));
                txn.set(&records::entry(parent, name), &encode(&EntryRecord { id, kind }));
                txn.max_u64(&records::dir_time(parent), now as u64);
                txn.set(&records::index_job(id), b"");
                let response = Response::Created { attr: attr(id, &node, true, 0), parent_mtime_ns: now, existed: false };
                let mutation = Self::finish(&mut txn, caller, response, vec![Invalidation::Name { parent, name: name.to_string() }]);
                let version = self.commit(txn).await?;
                self.remember(id, &node, version, epoch);
                if kind == Kind::Dir {
                    self.cached(epoch, |c| c.dirs.insert(id, node));
                }
                Ok(mutation)
            }
            .boxed()
        })
        .await
    }

    /// @cc [owner:fontanierh,label:backend;concurrency] zero-read-flush
    /// A flush MAY skip all reads only when this server committed the file's node at version `v`
    /// less than RECENT_REUSE ago under the current authorization epoch: it then reads at `v` and
    /// MUST add read conflicts on the node and the epoch, so the commit fails if either changed
    /// after `v`. The node it assumes MUST be exactly the value committed at `v`.
    pub async fn flush(&self, caller: &Caller, id: Id, writes: &[(u64, Vec<u8>)], mtime_ns: Option<i64>) -> Result<Mutation, Errno> {
        self.run(Attempt::mutation(caller), |attempt| {
            async move {
                let recent = if attempt.fresh || attempt.uncertain {
                    None
                } else {
                    let recent = self.shared.recent.lock().get(&id).cloned();
                    let epoch = self.shared.auth.lock().epoch;
                    recent.filter(|r| r.at.elapsed() < RECENT_REUSE && r.epoch == epoch)
                };
                let (mut txn, node, epoch) = match recent {
                    Some(recent) => {
                        let mut txn = self.store.begin(TxnOptions { read_version: Some(recent.version) }).await?;
                        txn.add_read_conflict_range(&dfs_store::KeyRange::single(&records::node(id)));
                        txn.add_read_conflict_range(&dfs_store::KeyRange::single(records::TOPO));
                        self.shared.stats.zero_read_flushes.fetch_add(1, Ordering::Relaxed);
                        (txn, recent.node, recent.epoch)
                    }
                    None => {
                        let txn = self.begin(attempt).await?;
                        if let Some(mutation) = Self::replay(&txn, caller, attempt).await? {
                            return Ok(mutation);
                        }
                        let values = txn.get_many(&[records::node(id), records::TOPO.to_vec()]).await?;
                        let node = node_of(values[0].clone())?.ok_or(Errno::ESTALE)?;
                        (txn, node, le_u64(values[1].as_ref()))
                    }
                };
                if node.kind != Kind::File {
                    return Err(Errno::EISDIR.into());
                }
                if !self.access(&txn, &caller.principal, id, &node, epoch).await?.write {
                    return Err(Errno::EACCES.into());
                }
                let mut node = node;
                let mut new_size = node.size;
                for (offset, data) in writes.iter().filter(|(_, data)| !data.is_empty()) {
                    match offset.checked_add(data.len() as u64) {
                        Some(end) if end <= MAX_FILE_BYTES => new_size = new_size.max(end),
                        _ => return Err(Errno::EFBIG.into()),
                    }
                }
                let blocks = patch_blocks(&txn, id, node.size, new_size, writes).await?;
                for (index, block) in &blocks {
                    txn.set(&records::block(id, *index), block);
                }
                let now = now_ns();
                node.size = new_size;
                node.rev += 1;
                node.mtime_ns = mtime_ns.unwrap_or(if writes.is_empty() { node.mtime_ns } else { now });
                node.ctime_ns = now;
                txn.set(&records::node(id), &encode(&node));
                txn.set(&records::index_job(id), b"");
                let response = Response::Attr(attr(id, &node, true, 0));
                let mutation = Self::finish(&mut txn, caller, response, vec![Invalidation::Node(id)]);
                let version = self.commit(txn).await?;
                self.remember(id, &node, version, epoch);
                Ok(mutation)
            }
            .boxed()
        })
        .await
    }

    pub async fn setattr(&self, caller: &Caller, id: Id, mode: Option<u32>, size: Option<u64>, mtime_ns: Option<i64>) -> Result<Mutation, Errno> {
        self.run(Attempt::mutation(caller), |attempt| {
            async move {
                let mut txn = self.begin(attempt).await?;
                if let Some(mutation) = Self::replay(&txn, caller, attempt).await? {
                    return Ok(mutation);
                }
                let values = txn.get_many(&[records::node(id), records::TOPO.to_vec(), records::dir_time(id)]).await?;
                let mut node = node_of(values[0].clone())?.ok_or(Errno::ESTALE)?;
                let epoch = le_u64(values[1].as_ref());
                if !self.access(&txn, &caller.principal, id, &node, epoch).await?.write {
                    return Err(Errno::EACCES.into());
                }
                let now = now_ns();
                if let Some(size) = size {
                    if node.kind != Kind::File {
                        return Err(Errno::EISDIR.into());
                    }
                    if size > MAX_FILE_BYTES {
                        return Err(Errno::EFBIG.into());
                    }
                    truncate(&mut txn, id, node.size, size).await?;
                    node.size = size;
                    node.rev += 1;
                    node.mtime_ns = now;
                }
                if let Some(mode) = mode {
                    node.mode = mode & 0o7777;
                }
                if let Some(mtime) = mtime_ns {
                    node.mtime_ns = mtime;
                    node.mtime_set_ns = now;
                }
                node.ctime_ns = now;
                txn.set(&records::node(id), &encode(&node));
                let response = Response::Attr(attr(id, &node, true, le_u64(values[2].as_ref())));
                let mutation = Self::finish(&mut txn, caller, response, vec![Invalidation::Node(id)]);
                let version = self.commit(txn).await?;
                self.remember(id, &node, version, epoch);
                Ok(mutation)
            }
            .boxed()
        })
        .await
    }

    pub async fn remove(&self, caller: &Caller, parent: Id, name: &str, dir: bool) -> Result<Mutation, Errno> {
        valid_name(name)?;
        self.run(Attempt::mutation(caller), |attempt| {
            async move {
                let mut txn = self.begin(attempt).await?;
                if let Some(mutation) = Self::replay(&txn, caller, attempt).await? {
                    return Ok(mutation);
                }
                let values = txn.get_many(&[records::node(parent), records::TOPO.to_vec(), records::entry(parent, name)]).await?;
                let parent_node = live(values[0].clone())?;
                let epoch = le_u64(values[1].as_ref());
                let entry: EntryRecord = decode(values[2].as_ref().ok_or(Errno::ENOENT)?)?;
                let mut child = live(txn.get(&records::node(entry.id)).await?)?;
                match (dir, child.kind) {
                    (true, Kind::Dir) | (false, Kind::File | Kind::Symlink) => {}
                    (true, _) => return Err(Errno::ENOTDIR.into()),
                    (false, _) => return Err(Errno::EISDIR.into()),
                }
                let parent_access = self.access(&txn, &caller.principal, parent, &parent_node, epoch).await?;
                let child_access = self.access(&txn, &caller.principal, entry.id, &child, epoch).await?;
                if !parent_access.write || !child_access.write {
                    return Err(Errno::EACCES.into());
                }
                if dir && !txn.scan(&records::entries(entry.id), 1).await?.is_empty() {
                    return Err(Errno::ENOTEMPTY.into());
                }
                let now = now_ns();
                child.detached = true;
                child.ctime_ns = now;
                txn.clear(&records::entry(parent, name));
                txn.set(&records::node(entry.id), &encode(&child));
                txn.max_u64(&records::dir_time(parent), now as u64);
                txn.set(&records::index_job(entry.id), b"");
                let invalidations = vec![Invalidation::Name { parent, name: name.to_string() }, Invalidation::Node(entry.id)];
                let mutation = Self::finish(&mut txn, caller, Response::Done, invalidations);
                let version = self.commit(txn).await?;
                self.remember(entry.id, &child, version, epoch);
                Ok(mutation)
            }
            .boxed()
        })
        .await
    }

    pub async fn rename(&self, caller: &Caller, parent: Id, name: &str, new_parent: Id, new_name: &str, no_replace: bool) -> Result<Mutation, Errno> {
        valid_name(name)?;
        valid_name(new_name)?;
        self.run(Attempt::mutation(caller), |attempt| {
            async move {
                let mut txn = self.begin(attempt).await?;
                if let Some(mutation) = Self::replay(&txn, caller, attempt).await? {
                    return Ok(mutation);
                }
                let values = txn
                    .get_many(&[
                        records::node(parent),
                        records::node(new_parent),
                        records::TOPO.to_vec(),
                        records::entry(parent, name),
                        records::entry(new_parent, new_name),
                    ])
                    .await?;
                let from_dir = live(values[0].clone())?;
                let to_dir = live(values[1].clone())?;
                let epoch = le_u64(values[2].as_ref());
                let entry: EntryRecord = decode(values[3].as_ref().ok_or(Errno::ENOENT)?)?;
                let replaced = values[4].as_ref().map(|v| decode::<EntryRecord>(v)).transpose()?;
                if from_dir.kind != Kind::Dir || to_dir.kind != Kind::Dir {
                    return Err(Errno::ENOTDIR.into());
                }
                let mut child = live(txn.get(&records::node(entry.id)).await?)?;
                for (id, node) in [(parent, &from_dir), (new_parent, &to_dir), (entry.id, &child)] {
                    if !self.access(&txn, &caller.principal, id, node, epoch).await?.write {
                        return Err(Errno::EACCES.into());
                    }
                }
                if replaced.is_some_and(|r| r.id == entry.id) {
                    let mutation = Self::finish(&mut txn, caller, Response::Done, Vec::new());
                    self.commit(txn).await?;
                    return Ok(mutation);
                }
                let moves_dir = child.kind == Kind::Dir && parent != new_parent;
                if moves_dir {
                    // No subtree policy marker yet: moving a directory that carries its own policy
                    // needs tenant administration; policies deeper below are a documented gap.
                    if child.policy && !caller.principal.admin {
                        return Err(Errno::EPERM.into());
                    }
                    let mut id = new_parent;
                    for _ in 0..MAX_DEPTH {
                        if id == entry.id {
                            return Err(Errno::EINVAL.into());
                        }
                        if id == ROOT {
                            break;
                        }
                        id = live(txn.get(&records::node(id)).await?)?.parent;
                    }
                }
                let now = now_ns();
                let mut invalidations = vec![
                    Invalidation::Name { parent, name: name.to_string() },
                    Invalidation::Name { parent: new_parent, name: new_name.to_string() },
                    Invalidation::Node(entry.id),
                ];
                if let Some(replaced) = replaced {
                    if no_replace {
                        return Err(Errno::EEXIST.into());
                    }
                    let mut old = live(txn.get(&records::node(replaced.id)).await?)?;
                    match (child.kind, old.kind) {
                        (Kind::Dir, Kind::Dir) => {
                            if !txn.scan(&records::entries(replaced.id), 1).await?.is_empty() {
                                return Err(Errno::ENOTEMPTY.into());
                            }
                        }
                        (Kind::Dir, _) => return Err(Errno::ENOTDIR.into()),
                        (_, Kind::Dir) => return Err(Errno::EISDIR.into()),
                        _ => {}
                    }
                    if !self.access(&txn, &caller.principal, replaced.id, &old, epoch).await?.write {
                        return Err(Errno::EACCES.into());
                    }
                    old.detached = true;
                    old.ctime_ns = now;
                    txn.set(&records::node(replaced.id), &encode(&old));
                    invalidations.push(Invalidation::Node(replaced.id));
                }
                child.parent = new_parent;
                child.name = new_name.to_string();
                child.ctime_ns = now;
                txn.clear(&records::entry(parent, name));
                txn.set(&records::entry(new_parent, new_name), &encode(&entry));
                txn.set(&records::node(entry.id), &encode(&child));
                txn.max_u64(&records::dir_time(parent), now as u64);
                txn.max_u64(&records::dir_time(new_parent), now as u64);
                txn.set(&records::index_job(entry.id), b"");
                if moves_dir {
                    txn.set(records::TOPO, &(epoch + 1).to_le_bytes());
                    invalidations.push(Invalidation::All);
                }
                let mutation = Self::finish(&mut txn, caller, Response::Done, invalidations);
                let version = self.commit(txn).await?;
                if !moves_dir {
                    self.remember(entry.id, &child, version, epoch);
                }
                Ok(mutation)
            }
            .boxed()
        })
        .await
    }
}

/// Copies the part of `block` (starting at file offset `start`) that overlaps `out` (starting at
/// file offset `offset`).
fn copy_overlap(out: &mut [u8], offset: u64, block: &[u8], start: u64) {
    let from = offset.max(start);
    let to = (offset + out.len() as u64).min(start + block.len() as u64);
    if from < to {
        out[(from - offset) as usize..(to - offset) as usize].copy_from_slice(&block[(from - start) as usize..(to - start) as usize]);
    }
}

/// New contents of every block touched by `writes`, applied in order. Blocks that existed before
/// (start below `old_size`) and are not fully overwritten are read and patched.
async fn patch_blocks<T: Txn>(txn: &T, id: Id, old_size: u64, new_size: u64, writes: &[(u64, Vec<u8>)]) -> Step<BTreeMap<u32, Vec<u8>>> {
    let mut covered: BTreeMap<u32, Vec<(u64, u64)>> = BTreeMap::new();
    for (offset, data) in writes {
        if data.is_empty() {
            continue;
        }
        let end = offset + data.len() as u64;
        for index in (offset / BLOCK_BYTES) as u32..=((end - 1) / BLOCK_BYTES) as u32 {
            let start = index as u64 * BLOCK_BYTES;
            covered.entry(index).or_default().push(((*offset).max(start), end.min(start + BLOCK_BYTES)));
        }
    }
    if covered.len() > MAX_FLUSH_BLOCKS {
        return Err(Errno::EFBIG.into());
    }
    let mut needed = Vec::new();
    for (index, ranges) in &covered {
        let start = *index as u64 * BLOCK_BYTES;
        let old_end = old_size.min(start + BLOCK_BYTES);
        if start < old_size && !covers(ranges, start, old_end) {
            needed.push(*index);
        }
    }
    let old = txn.get_many(&needed.iter().map(|i| records::block(id, *i)).collect::<Vec<_>>()).await?;
    let old: HashMap<u32, Vec<u8>> = needed.into_iter().zip(old).filter_map(|(i, v)| v.map(|v| (i, v))).collect();
    let mut blocks = BTreeMap::new();
    for index in covered.keys() {
        let start = *index as u64 * BLOCK_BYTES;
        let len = (new_size.min(start + BLOCK_BYTES) - start) as usize;
        let mut block = vec![0u8; len];
        if let Some(base) = old.get(index) {
            let keep = base.len().min(len).min(old_size.saturating_sub(start) as usize);
            block[..keep].copy_from_slice(&base[..keep]);
        }
        blocks.insert(*index, block);
    }
    for (offset, data) in writes {
        for (index, block) in blocks.iter_mut() {
            copy_into(block, *index as u64 * BLOCK_BYTES, data, *offset);
        }
    }
    Ok(blocks)
}

fn copy_into(block: &mut [u8], start: u64, data: &[u8], offset: u64) {
    let from = offset.max(start);
    let to = (offset + data.len() as u64).min(start + block.len() as u64);
    if from < to {
        block[(from - start) as usize..(to - start) as usize].copy_from_slice(&data[(from - offset) as usize..(to - offset) as usize]);
    }
}

fn covers(ranges: &[(u64, u64)], start: u64, end: u64) -> bool {
    let mut sorted = ranges.to_vec();
    sorted.sort();
    let mut reached = start;
    for (from, to) in sorted {
        if reached >= end {
            return true;
        }
        if from > reached {
            return false;
        }
        reached = reached.max(to);
    }
    reached >= end
}

async fn truncate<T: Txn>(txn: &mut T, id: Id, old_size: u64, size: u64) -> Step<()> {
    if size >= old_size {
        return Ok(());
    }
    let keep = size.div_ceil(BLOCK_BYTES) as u32;
    txn.clear_range(&records::blocks(id, keep, u32::MAX));
    if size % BLOCK_BYTES != 0 {
        let index = (size / BLOCK_BYTES) as u32;
        if let Some(mut block) = txn.get(&records::block(id, index)).await? {
            block.truncate((size % BLOCK_BYTES) as usize);
            txn.set(&records::block(id, index), &block);
        }
    }
    Ok(())
}

fn random_token() -> String {
    let bytes: [u8; 24] = rand::random();
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn token_hash(token: &str) -> Vec<u8> {
    use sha2::Digest;
    sha2::Sha256::digest(token.as_bytes()).to_vec()
}

#[cfg(test)]
mod tests;
