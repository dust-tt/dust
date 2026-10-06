//! Filesystem operations over any ordered transactional `Store`. No network, no SDK.

pub mod auth;
pub mod records;

use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use dfs_proto::{
    Attr, BLOCK_BYTES, Change, Entry, Errno, File, Id, Kind, MAX_APPLY_OPS, MAX_FILE_BYTES, MAX_FLUSH_BLOCKS, MAX_IO_BYTES, MAX_NAME_BYTES, MAX_VALIDATE, Op, ROOT,
    Response, Right, Token,
};
use dfs_store::{Key, Store, StoreError, Txn, TxnOptions, Value};
use futures::FutureExt;
use futures::future::BoxFuture;
use parking_lot::Mutex;

use crate::auth::{Access, Principal, evaluate};
use crate::records::{EntryRecord, Node, Policy, SessionRecord, TokenRecord, decode, encode, le_u64};

/// A cached read version is reused for at most this long (FDB rejects versions older than 5 s).
const GRV_REUSE: Duration = Duration::from_millis(1000);
const MAX_DEPTH: usize = 4096;
/// Ids `alloc_ids` reserves at once; chunk `n` holds ids `n * ID_CHUNK..(n + 1) * ID_CHUNK`.
const ID_CHUNK: u64 = 1024;
/// Most entries one `readdir` page returns.
const MAX_LISTING: u32 = 16_384;
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

#[derive(Default)]
pub struct Stats {
    pub commits: AtomicU64,
    pub retries: AtomicU64,
    pub fresh_versions: AtomicU64,
    /// Ops applied and ops that failed inside `apply` batches.
    pub ops: AtomicU64,
    pub failed_ops: AtomicU64,
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

#[derive(Default)]
struct Shared {
    versions: Mutex<Versions>,
    auth: Mutex<AuthCache>,
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
    /// and every outcome it returns, per-op failures inside an `apply` batch included, is
    /// returned only after its transaction commits (a receipt write guarantees the commit
    /// validates). A whole-call error MUST be re-derived by a fresh attempt before it is returned
    /// (`run` enforces this for `Failure::Fs`).
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
    /// Nodes in `written` (changed by this uncommitted transaction) are never cached.
    async fn dir_chain(&self, txn: &S::Txn, dir: Id, known: Option<&Node>, epoch: u64, written: &HashSet<Id>) -> Step<Vec<Option<Policy>>> {
        let mut chain = Vec::new();
        let mut id = dir;
        let mut known = known.cloned();
        for _ in 0..MAX_DEPTH {
            let node = match known.take() {
                Some(node) => node,
                None => match self.cached(epoch, |c| c.dirs.get(&id).cloned()).filter(|_| !written.contains(&id)) {
                    Some(node) => node,
                    None => node_of(txn.get(&records::node(id)).await?)?.ok_or(Errno::ENOENT)?,
                },
            };
            if node.kind != Kind::Dir {
                return Err(Errno::ENOTDIR.into());
            }
            chain.push(self.policy_of(txn, id, &node, epoch).await?);
            let parent = node.parent;
            if !written.contains(&id) {
                self.cached(epoch, |c| c.dirs.insert(id, node));
            }
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

    async fn access(&self, txn: &S::Txn, principal: &Principal, id: Id, node: &Node, epoch: u64, written: &HashSet<Id>) -> Step<Access> {
        let chain = if node.kind == Kind::Dir {
            self.dir_chain(txn, id, Some(node), epoch, written).await?
        } else {
            let mut chain = self.dir_chain(txn, node.parent, None, epoch, written).await?;
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

    /// Write the receipt for `caller` and return the response.
    fn finish(txn: &mut S::Txn, caller: &Caller, response: Response) -> Response {
        txn.set(&records::receipt(caller.session, caller.seq), &encode(&response));
        response
    }

    /// After an uncertain commit, the receipt decides whether the earlier attempt applied.
    async fn replay(txn: &S::Txn, caller: &Caller, attempt: Attempt) -> Step<Option<Response>> {
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

    /// Commits an authorization-changing administrative mutation: bumps the authorization epoch.
    async fn administer(&self, mut txn: S::Txn, caller: &Caller, response: Response) -> Step<Response> {
        let epoch = le_u64(txn.get(records::TOPO).await?.as_ref());
        txn.set(records::TOPO, &(epoch + 1).to_le_bytes());
        let response = Self::finish(&mut txn, caller, response);
        self.commit(txn).await?;
        Ok(response)
    }

    pub async fn grant(&self, caller: &Caller, id: Id, subject: &str, right: Right, granted: bool) -> Result<Response, Errno> {
        Self::require_admin(caller)?;
        self.run(Attempt { fresh: true, uncertain: caller.resent }, |attempt| {
            async move {
                let mut txn = self.begin(attempt).await?;
                if let Some(response) = Self::replay(&txn, caller, attempt).await? {
                    return Ok(response);
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

    pub async fn set_boundary(&self, caller: &Caller, id: Id, boundary: bool) -> Result<Response, Errno> {
        Self::require_admin(caller)?;
        self.run(Attempt { fresh: true, uncertain: caller.resent }, |attempt| {
            async move {
                let mut txn = self.begin(attempt).await?;
                if let Some(response) = Self::replay(&txn, caller, attempt).await? {
                    return Ok(response);
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

    pub async fn set_members(&self, caller: &Caller, group: &str, members: &[String]) -> Result<Response, Errno> {
        Self::require_admin(caller)?;
        self.run(Attempt { fresh: true, uncertain: caller.resent }, |attempt| {
            async move {
                let mut txn = self.begin(attempt).await?;
                if let Some(response) = Self::replay(&txn, caller, attempt).await? {
                    return Ok(response);
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

    pub async fn create_token(&self, caller: &Caller, principal: &str, admin: bool) -> Result<Response, Errno> {
        Self::require_admin(caller)?;
        let token = &random_token();
        self.run(Attempt { fresh: true, uncertain: caller.resent }, |attempt| {
            async move {
                let mut txn = self.begin(attempt).await?;
                if let Some(response) = Self::replay(&txn, caller, attempt).await? {
                    return Ok(response);
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

    /// @cc [owner:fontanierh,label:product;concurrency] fresh-reads
    /// Every read MUST run at a read version obtained after the call arrived (`Attempt::READ`,
    /// never a reused one) and MUST return that version, so its reply includes every commit
    /// acknowledged before the mount sent the call. Only a `readdir` continuation (`at`) reads at
    /// the version its first page returned.
    pub async fn getattr(&self, principal: &Principal, id: Id) -> Result<(Attr, u64), Errno> {
        let none = &HashSet::new();
        self.run(Attempt::READ, |attempt| {
            async move {
                let txn = self.begin(attempt).await?;
                let values = txn.get_many(&[records::node(id), records::TOPO.to_vec(), records::dir_time(id)]).await?;
                let node = node_of(values[0].clone())?.ok_or(Errno::ESTALE)?;
                let access = self.access(&txn, principal, id, &node, le_u64(values[1].as_ref()), none).await?;
                if !access.read {
                    return Err(Errno::EACCES.into());
                }
                Ok((attr(id, &node, access.write, le_u64(values[2].as_ref())), txn.read_version()))
            }
            .boxed()
        })
        .await
    }

    pub async fn lookup(&self, principal: &Principal, parent: Id, name: &str) -> Result<(Option<Attr>, u64), Errno> {
        valid_name(name)?;
        let none = &HashSet::new();
        self.run(Attempt::READ, |attempt| {
            async move {
                let txn = self.begin(attempt).await?;
                let values = txn.get_many(&[records::node(parent), records::TOPO.to_vec(), records::entry(parent, name)]).await?;
                let dir = live(values[0].clone())?;
                let epoch = le_u64(values[1].as_ref());
                let chain = self.dir_chain(&txn, parent, Some(&dir), epoch, none).await?;
                let groups = self.groups(&txn, principal, epoch).await?;
                if !Self::inherited(principal, &groups, &chain, None).read {
                    return Err(Errno::EACCES.into());
                }
                let Some(entry) = values[2].as_ref().map(|v| decode::<EntryRecord>(v)).transpose()? else {
                    return Ok((None, txn.read_version()));
                };
                let child = txn.get_many(&[records::node(entry.id), records::dir_time(entry.id)]).await?;
                let node = live(child[0].clone())?;
                let own = self.policy_of(&txn, entry.id, &node, epoch).await?;
                let access = Self::inherited(principal, &groups, &chain, own.as_ref());
                Ok((Some(attr(entry.id, &node, access.write, le_u64(child[1].as_ref()))), txn.read_version()))
            }
            .boxed()
        })
        .await
    }

    /// Lists `dir` after `after`; `at` (the version an earlier page returned) continues a listing
    /// at that version, failing with `EAGAIN` once the store no longer serves it.
    pub async fn readdir(&self, principal: &Principal, dir: Id, after: Option<&str>, limit: u32, at: Option<u64>) -> Result<(Response, u64), Errno> {
        let limit = limit.clamp(1, MAX_LISTING) as usize;
        let none = &HashSet::new();
        self.run(Attempt::READ, |attempt| {
            async move {
                let txn = match at {
                    Some(version) => self.store.begin(TxnOptions { read_version: Some(version) }).await?,
                    None => self.begin(attempt).await?,
                };
                let listing = async {
                    let values = txn
                        .get_many(&[records::node(dir), records::TOPO.to_vec(), records::dir_time(dir), records::listing_version(dir)])
                        .await?;
                    let node = live(values[0].clone())?;
                    let epoch = le_u64(values[1].as_ref());
                    let token = Token { listing: le_u64(values[3].as_ref()), epoch };
                    let chain = self.dir_chain(&txn, dir, Some(&node), epoch, none).await?;
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
                        let Some(child) = node_of(children[2 * i].clone())?.filter(|n| !n.detached) else { continue };
                        let own = self.policy_of(&txn, id, &child, epoch).await?;
                        let write = if own.is_some() { Self::inherited(principal, &groups, &chain, own.as_ref()).write } else { access.write };
                        entries.push(Entry { name, attr: attr(id, &child, write, le_u64(children[2 * i + 1].as_ref())) });
                    }
                    Ok(Response::Listing { dir: attr(dir, &node, access.write, le_u64(values[2].as_ref())), entries, more, token })
                };
                match (at, listing.await) {
                    (Some(_), Err(Failure::Store(StoreError::TooOld))) => Err(Errno::EAGAIN.into()),
                    (_, listing) => Ok((listing?, txn.read_version())),
                }
            }
            .boxed()
        })
        .await
    }

    /// Whether each `(dir, token)` is still current at a fresh read version, which it returns:
    /// true only when `dir` is live, readable by `principal`, and its listing version and the
    /// policy epoch both equal the token's.
    pub async fn validate(&self, principal: &Principal, dirs: &[(Id, Token)]) -> Result<(Vec<bool>, u64), Errno> {
        if dirs.len() > MAX_VALIDATE {
            return Err(Errno::EINVAL);
        }
        let none = &HashSet::new();
        self.run(Attempt::READ, |attempt| {
            async move {
                let txn = self.begin(attempt).await?;
                let mut keys = vec![records::TOPO.to_vec()];
                for (dir, _) in dirs {
                    keys.push(records::node(*dir));
                    keys.push(records::listing_version(*dir));
                }
                let values = txn.get_many(&keys).await?;
                let epoch = le_u64(values[0].as_ref());
                let mut valid = Vec::with_capacity(dirs.len());
                for (i, (dir, token)) in dirs.iter().enumerate() {
                    let current = token.epoch == epoch && token.listing == le_u64(values[2 + 2 * i].as_ref());
                    let ok = match node_of(values[1 + 2 * i].clone())? {
                        Some(node) if current && !node.detached && node.kind == Kind::Dir => {
                            self.access(&txn, principal, *dir, &node, epoch, none).await?.read
                        }
                        _ => false,
                    };
                    valid.push(ok);
                }
                Ok((valid, txn.read_version()))
            }
            .boxed()
        })
        .await
    }

    pub async fn read(&self, principal: &Principal, id: Id, offset: u64, len: u32) -> Result<(Response, u64), Errno> {
        let len = len.min(MAX_IO_BYTES);
        let none = &HashSet::new();
        self.run(Attempt::READ, |attempt| {
            async move {
                let txn = self.begin(attempt).await?;
                let values = txn.get_many(&[records::node(id), records::TOPO.to_vec()]).await?;
                let node = node_of(values[0].clone())?.ok_or(Errno::ESTALE)?;
                if node.kind != Kind::File {
                    return Err(Errno::EISDIR.into());
                }
                if !self.access(&txn, principal, id, &node, le_u64(values[1].as_ref()), none).await?.read {
                    return Err(Errno::EACCES.into());
                }
                let end = node.size.min(offset.saturating_add(len as u64));
                let mut bytes = vec![0u8; end.saturating_sub(offset) as usize];
                if offset < end {
                    let (first, last) = ((offset / BLOCK_BYTES) as u32, ((end - 1) / BLOCK_BYTES) as u32);
                    for (key, block) in txn.scan(&records::blocks(id, first, last), (last - first + 1) as usize).await? {
                        copy_overlap(&mut bytes, offset, &block, records::block_index(&key)? as u64 * BLOCK_BYTES);
                    }
                }
                Ok((Response::Data { rev: node.rev, size: node.size, bytes }, txn.read_version()))
            }
            .boxed()
        })
        .await
    }

    /// Whole contents of the readable files among `ids` that fit, in order, in `budget` bytes, all
    /// at one read version; objects that are missing, not files, unreadable, or too large are left out.
    pub async fn read_files(&self, principal: &Principal, ids: &[Id], budget: u32) -> Result<(Vec<File>, u64), Errno> {
        let ids = &ids[..ids.len().min(MAX_READ_FILES)];
        let budget = u64::from(budget.min(MAX_IO_BYTES));
        let none = &HashSet::new();
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
                    match self.access(&txn, principal, *id, &node, epoch, none).await {
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
                Ok((files, txn.read_version()))
            }
            .boxed()
        })
        .await
    }

    pub async fn readlink(&self, principal: &Principal, id: Id) -> Result<(String, u64), Errno> {
        let none = &HashSet::new();
        self.run(Attempt::READ, |attempt| {
            async move {
                let txn = self.begin(attempt).await?;
                let values = txn.get_many(&[records::node(id), records::TOPO.to_vec()]).await?;
                let node = node_of(values[0].clone())?.ok_or(Errno::ESTALE)?;
                if !self.access(&txn, principal, id, &node, le_u64(values[1].as_ref()), none).await?.read {
                    return Err(Errno::EACCES.into());
                }
                Ok((node.target.ok_or(Errno::EINVAL)?, txn.read_version()))
            }
            .boxed()
        })
        .await
    }

    // ---------------------------------------------------------------- mutations

    /// Reserves `ID_CHUNK` object ids for `principal`'s `Create` ops.
    pub async fn alloc_ids(&self, principal: &Principal) -> Result<(Id, u32), Errno> {
        self.run(Attempt::READ, |attempt| {
            async move {
                let mut txn = self.begin(attempt).await?;
                let next = le_u64(txn.get(records::NEXT_ID).await?.as_ref()).max(ID_CHUNK);
                let first = next.div_ceil(ID_CHUNK) * ID_CHUNK;
                txn.set(records::NEXT_ID, &(first + ID_CHUNK).to_le_bytes());
                txn.set(&records::id_chunk(first / ID_CHUNK), principal.name.as_bytes());
                self.commit(txn).await?;
                Ok((first, ID_CHUNK as u32))
            }
            .boxed()
        })
        .await
    }

    /// @cc [owner:fontanierh,label:backend;concurrency] apply-batch
    /// `ops` MUST commit in order in one transaction. Each op MUST be fully validated before it
    /// writes anything: a failing op (`results[i]`) leaves no effect and later ops still apply
    /// over the effects of the earlier successful ones. A file's size and its blocks MUST change
    /// in the same op.
    pub async fn apply(&self, caller: &Caller, ops: &[Op]) -> Result<Response, Errno> {
        if ops.len() > MAX_APPLY_OPS {
            return Err(Errno::EINVAL);
        }
        self.run(Attempt::mutation(caller), |attempt| {
            async move {
                let mut txn = self.begin(attempt).await?;
                if let Some(response) = Self::replay(&txn, caller, attempt).await? {
                    // The original commit version is not stored; this later read version is a safe
                    // upper bound for it.
                    return Ok(match response {
                        Response::Applied { results, attrs, .. } => Response::Applied { version: txn.read_version(), results, attrs },
                        other => other,
                    });
                }
                txn.get_many(&prefetch_keys(ops)).await?;
                let epoch = le_u64(txn.get(records::TOPO).await?.as_ref());
                let mut batch = Batch { epoch, now: now_ns(), written: HashSet::new(), touched: BTreeMap::new(), moved_dir: false };
                let mut results = Vec::with_capacity(ops.len());
                for op in ops {
                    match self.apply_op(&mut txn, caller, &mut batch, op).await {
                        Ok(()) => results.push(None),
                        Err(Failure::Fs(errno)) => results.push(Some(errno)),
                        Err(failure) => return Err(failure),
                    }
                }
                if batch.moved_dir {
                    txn.set(records::TOPO, &(epoch + 1).to_le_bytes());
                }
                // @cc [owner:fontanierh,label:product] listing-version-bump
                // A transaction that changes an entry of directory D, the attributes of a child of
                // D (including a child directory's child-change time), or D's own attributes MUST
                // add to `listing_version(D)` in the same transaction. Access changes are covered
                // by the policy epoch instead.
                let own = |id: Id, node: &Node| (node.kind == Kind::Dir).then_some(id);
                let dirs: BTreeSet<Id> =
                    batch.touched.iter().flat_map(|(id, (node, _))| [own(*id, node), Some(node.parent)]).flatten().filter(|id| *id != 0).collect();
                for dir in dirs {
                    txn.add_u64(&records::listing_version(dir), 1);
                }
                // The receipt omits attributes to stay far below the store's value size limit.
                let receipt = Response::Applied { version: 0, results: results.clone(), attrs: Vec::new() };
                txn.set(&records::receipt(caller.session, caller.seq), &encode(&receipt));
                let version = self.commit(txn).await?;
                let failed = results.iter().filter(|r| r.is_some()).count() as u64;
                self.shared.stats.ops.fetch_add(ops.len() as u64 - failed, Ordering::Relaxed);
                self.shared.stats.failed_ops.fetch_add(failed, Ordering::Relaxed);
                let attrs = batch.touched.iter().filter(|(_, (node, _))| !node.detached).map(|(id, (node, time))| attr(*id, node, true, *time)).collect();
                Ok(Response::Applied { version, results, attrs })
            }
            .boxed()
        })
        .await
    }

    async fn apply_op(&self, txn: &mut S::Txn, caller: &Caller, b: &mut Batch, op: &Op) -> Step<()> {
        let who = &caller.principal;
        match op {
            Op::Create { parent, name, id, kind, mode, mtime_ns, target } => {
                let (parent, id) = (*parent, *id);
                valid_name(name)?;
                if (*kind == Kind::Symlink) != target.is_some() {
                    return Err(Errno::EINVAL.into());
                }
                let values = txn.get_many(&[records::node(parent), records::entry(parent, name), records::node(id), records::id_chunk(id / ID_CHUNK)]).await?;
                if values[3].as_deref() != Some(who.name.as_bytes()) {
                    return Err(Errno::EPERM.into());
                }
                if values[2].is_some() {
                    return Err(Errno::EEXIST.into());
                }
                let dir = live(values[0].clone())?;
                if dir.kind != Kind::Dir {
                    return Err(Errno::ENOTDIR.into());
                }
                if !self.access(txn, who, parent, &dir, b.epoch, &b.written).await?.write {
                    return Err(Errno::EACCES.into());
                }
                if values[1].is_some() {
                    return Err(Errno::EEXIST.into());
                }
                let node = Node {
                    parent,
                    name: name.clone(),
                    kind: *kind,
                    mode: mode & 0o7777,
                    size: target.as_ref().map_or(0, |t| t.len() as u64),
                    mtime_ns: *mtime_ns,
                    ctime_ns: b.now,
                    mtime_set_ns: b.now,
                    rev: 1,
                    target: target.clone(),
                    policy: false,
                    detached: false,
                };
                txn.set(&records::node(id), &encode(&node));
                txn.set(&records::entry(parent, name), &encode(&EntryRecord { id, kind: *kind }));
                txn.max_u64(&records::dir_time(parent), b.now as u64);
                txn.set(&records::index_job(id), b"");
                b.write(id, node);
                b.child_changed(parent, dir);
            }
            Op::Remove { parent, name, id } => {
                let (parent, id) = (*parent, *id);
                valid_name(name)?;
                let values = txn.get_many(&[records::node(parent), records::entry(parent, name), records::node(id)]).await?;
                let dir = live(values[0].clone())?;
                if decode::<EntryRecord>(values[1].as_ref().ok_or(Errno::ENOENT)?)?.id != id {
                    return Err(Errno::ENOENT.into());
                }
                let mut child = live(values[2].clone())?;
                if !self.access(txn, who, parent, &dir, b.epoch, &b.written).await?.write
                    || !self.access(txn, who, id, &child, b.epoch, &b.written).await?.write
                {
                    return Err(Errno::EACCES.into());
                }
                if child.kind == Kind::Dir && !txn.scan(&records::entries(id), 1).await?.is_empty() {
                    return Err(Errno::ENOTEMPTY.into());
                }
                child.detached = true;
                child.ctime_ns = b.now;
                txn.clear(&records::entry(parent, name));
                txn.set(&records::node(id), &encode(&child));
                txn.max_u64(&records::dir_time(parent), b.now as u64);
                txn.set(&records::index_job(id), b"");
                b.write(id, child);
                b.child_changed(parent, dir);
            }
            Op::Rename { parent, name, id, new_parent, new_name, no_replace } => {
                let (parent, id, new_parent) = (*parent, *id, *new_parent);
                valid_name(name)?;
                valid_name(new_name)?;
                let values = txn
                    .get_many(&[
                        records::node(parent),
                        records::node(new_parent),
                        records::entry(parent, name),
                        records::entry(new_parent, new_name),
                        records::node(id),
                    ])
                    .await?;
                let from_dir = live(values[0].clone())?;
                let to_dir = live(values[1].clone())?;
                let entry: EntryRecord = decode(values[2].as_ref().ok_or(Errno::ENOENT)?)?;
                if entry.id != id {
                    return Err(Errno::ENOENT.into());
                }
                let replaced = values[3].as_ref().map(|v| decode::<EntryRecord>(v)).transpose()?;
                if from_dir.kind != Kind::Dir || to_dir.kind != Kind::Dir {
                    return Err(Errno::ENOTDIR.into());
                }
                let mut child = live(values[4].clone())?;
                for (id, node) in [(parent, &from_dir), (new_parent, &to_dir), (id, &child)] {
                    if !self.access(txn, who, id, node, b.epoch, &b.written).await?.write {
                        return Err(Errno::EACCES.into());
                    }
                }
                if replaced.is_some_and(|r| r.id == id) {
                    return Ok(());
                }
                let moves_dir = child.kind == Kind::Dir && parent != new_parent;
                if moves_dir {
                    // No subtree policy marker yet: moving a directory that carries its own policy
                    // needs tenant administration; policies deeper below are a documented gap.
                    if child.policy && !who.admin {
                        return Err(Errno::EPERM.into());
                    }
                    let mut at = new_parent;
                    for _ in 0..MAX_DEPTH {
                        if at == id {
                            return Err(Errno::EINVAL.into());
                        }
                        if at == ROOT {
                            break;
                        }
                        at = live(txn.get(&records::node(at)).await?)?.parent;
                    }
                }
                let mut old = None;
                if let Some(replaced) = replaced {
                    if *no_replace {
                        return Err(Errno::EEXIST.into());
                    }
                    let node = live(txn.get(&records::node(replaced.id)).await?)?;
                    match (child.kind, node.kind) {
                        (Kind::Dir, Kind::Dir) => {
                            if !txn.scan(&records::entries(replaced.id), 1).await?.is_empty() {
                                return Err(Errno::ENOTEMPTY.into());
                            }
                        }
                        (Kind::Dir, _) => return Err(Errno::ENOTDIR.into()),
                        (_, Kind::Dir) => return Err(Errno::EISDIR.into()),
                        _ => {}
                    }
                    if !self.access(txn, who, replaced.id, &node, b.epoch, &b.written).await?.write {
                        return Err(Errno::EACCES.into());
                    }
                    old = Some((replaced.id, node));
                }
                if let Some((old_id, mut node)) = old {
                    node.detached = true;
                    node.ctime_ns = b.now;
                    txn.set(&records::node(old_id), &encode(&node));
                    b.write(old_id, node);
                }
                child.parent = new_parent;
                child.name = new_name.clone();
                child.ctime_ns = b.now;
                txn.clear(&records::entry(parent, name));
                txn.set(&records::entry(new_parent, new_name), &encode(&entry));
                txn.set(&records::node(id), &encode(&child));
                txn.max_u64(&records::dir_time(parent), b.now as u64);
                txn.max_u64(&records::dir_time(new_parent), b.now as u64);
                txn.set(&records::index_job(id), b"");
                // Its writability may differ under the new parent: the mount refetches it.
                b.written.insert(id);
                b.child_changed(parent, from_dir);
                b.child_changed(new_parent, to_dir);
                b.moved_dir |= moves_dir;
            }
            Op::Write { id, changes, mtime_ns } => {
                let id = *id;
                let mut node = node_of(txn.get(&records::node(id)).await?)?.ok_or(Errno::ESTALE)?;
                if node.kind != Kind::File {
                    return Err(Errno::EISDIR.into());
                }
                if !self.access(txn, who, id, &node, b.epoch, &b.written).await?.write {
                    return Err(Errno::EACCES.into());
                }
                let mut touched = BTreeSet::new();
                for change in changes {
                    let end = match change {
                        Change::Write { offset, bytes } if !bytes.is_empty() => {
                            let end = offset.checked_add(bytes.len() as u64).ok_or(Errno::EFBIG)?;
                            touched.extend((offset / BLOCK_BYTES) as u32..=((end - 1) / BLOCK_BYTES) as u32);
                            end
                        }
                        Change::Write { .. } => 0,
                        Change::Truncate(size) => *size,
                    };
                    if end > MAX_FILE_BYTES {
                        return Err(Errno::EFBIG.into());
                    }
                }
                if touched.len() > MAX_FLUSH_BLOCKS {
                    return Err(Errno::EFBIG.into());
                }
                let mut size = node.size;
                let mut changes = changes.iter().peekable();
                while let Some(change) = changes.next() {
                    match change {
                        Change::Truncate(to) => {
                            truncate(txn, id, size, *to).await?;
                            size = *to;
                        }
                        Change::Write { offset, bytes } => {
                            let mut writes = vec![(*offset, bytes.as_slice())];
                            while let Some(Change::Write { offset, bytes }) = changes.peek() {
                                writes.push((*offset, bytes.as_slice()));
                                changes.next();
                            }
                            writes.retain(|(_, bytes)| !bytes.is_empty());
                            let new_size = writes.iter().fold(size, |s, (offset, bytes)| s.max(offset + bytes.len() as u64));
                            for (index, block) in patch_blocks(txn, id, size, new_size, &writes).await? {
                                txn.set(&records::block(id, index), &block);
                            }
                            size = new_size;
                        }
                    }
                }
                node.size = size;
                node.rev += 1;
                node.mtime_ns = mtime_ns.unwrap_or(b.now);
                node.ctime_ns = b.now;
                txn.set(&records::node(id), &encode(&node));
                txn.set(&records::index_job(id), b"");
                b.write(id, node);
            }
            Op::SetAttr { id, mode, mtime_ns } => {
                let id = *id;
                let mut node = node_of(txn.get(&records::node(id)).await?)?.ok_or(Errno::ESTALE)?;
                if !self.access(txn, who, id, &node, b.epoch, &b.written).await?.write {
                    return Err(Errno::EACCES.into());
                }
                if let Some(mode) = mode {
                    node.mode = mode & 0o7777;
                }
                if let Some(mtime) = mtime_ns {
                    node.mtime_ns = *mtime;
                    node.mtime_set_ns = b.now;
                }
                node.ctime_ns = b.now;
                txn.set(&records::node(id), &encode(&node));
                b.write(id, node);
            }
        }
        Ok(())
    }

    // ---------------------------------------------------------------- consistency check

    /// Checks the durable invariants of a quiesced store: every entry names a live node whose
    /// parent, name and kind match it; every live node but the root has exactly that entry; every
    /// block lies below its file's size and does not extend past it. Returns the violations found.
    pub async fn fsck(&self) -> Result<Vec<String>, Errno> {
        let mut problems = Vec::new();
        let mut nodes: HashMap<Id, Node> = HashMap::new();
        for (key, value) in self.scan_all(records::all_nodes()).await? {
            nodes.insert(records::key_id(&key)?, decode(&value)?);
        }
        let mut named: HashMap<Id, (Id, String)> = HashMap::new();
        for (key, value) in self.scan_all(records::all_entries()).await? {
            let (dir, name) = (records::key_id(&key)?, records::entry_name(&key)?);
            let entry: EntryRecord = decode(&value)?;
            match nodes.get(&entry.id) {
                Some(node) if !node.detached && node.parent == dir && node.name == name && node.kind == entry.kind => {}
                other => problems.push(format!("entry {dir}/{name} -> {} does not match node {other:?}", entry.id)),
            }
            if !nodes.get(&dir).is_some_and(|d| d.kind == Kind::Dir && !d.detached) {
                problems.push(format!("entry {dir}/{name} is in a missing or non-directory parent"));
            }
            if named.insert(entry.id, (dir, name.clone())).is_some() {
                problems.push(format!("node {} has several entries", entry.id));
            }
        }
        for (id, node) in &nodes {
            if !node.detached && *id != ROOT && !named.contains_key(id) {
                problems.push(format!("live node {id} ({}/{}) has no entry", node.parent, node.name));
            }
            if node.kind == Kind::Symlink && node.target.as_ref().map(|t| t.len() as u64) != Some(node.size) {
                problems.push(format!("symlink {id} size does not match its target"));
            }
        }
        for (key, block) in self.scan_all(records::all_blocks()).await? {
            let (id, index) = (records::key_id(&key)?, records::block_index(&key)?);
            let start = index as u64 * BLOCK_BYTES;
            match nodes.get(&id) {
                Some(node) if node.kind == Kind::File => {
                    let bound = node.size.saturating_sub(start).min(BLOCK_BYTES);
                    if block.is_empty() || block.len() as u64 > bound {
                        problems.push(format!("file {id} block {index} holds {} bytes; size {} allows {bound}", block.len(), node.size));
                    }
                }
                other => problems.push(format!("block {index} of {id} belongs to no file ({other:?})")),
            }
        }
        Ok(problems)
    }

    /// Every pair in `range`, in pages of fresh transactions (not one snapshot).
    async fn scan_all(&self, mut range: dfs_store::KeyRange) -> Result<Vec<(Key, Value)>, Errno> {
        const PAGE: usize = 10_000;
        let mut out = Vec::new();
        loop {
            let page = self
                .run(Attempt::READ, |attempt| {
                    let range = range.clone();
                    async move { Ok(self.begin(attempt).await?.scan(&range, PAGE).await?) }.boxed()
                })
                .await?;
            let done = page.len() < PAGE;
            if let Some((last, _)) = page.last() {
                range.start = dfs_store::KeyRange::single(last).end;
            }
            out.extend(page);
            if done {
                return Ok(out);
            }
        }
    }
}

/// Mutable state of one `apply` transaction.
struct Batch {
    epoch: u64,
    now: i64,
    /// Nodes this uncommitted transaction wrote; never served from or added to the auth cache.
    written: HashSet<Id>,
    /// Committed-to-be node and child-change time of every object whose attributes the reply reports.
    touched: BTreeMap<Id, (Node, u64)>,
    moved_dir: bool,
}

impl Batch {
    fn write(&mut self, id: Id, node: Node) {
        self.written.insert(id);
        let time = self.touched.get(&id).map_or(0, |(_, time)| *time);
        self.touched.insert(id, (node, time));
    }

    /// `dir` (as read before this op unless written earlier in the batch) gained or lost a child.
    fn child_changed(&mut self, dir: Id, node: Node) {
        self.touched.entry(dir).or_insert((node, 0)).1 = self.now as u64;
    }
}

/// Keys `ops` read first, fetched together so the per-op reads hit the transaction's cache.
fn prefetch_keys(ops: &[Op]) -> Vec<Key> {
    let mut keys = BTreeSet::new();
    for op in ops {
        match op {
            Op::Create { parent, name, id, .. } => {
                keys.extend([records::node(*parent), records::entry(*parent, name), records::node(*id), records::id_chunk(id / ID_CHUNK)]);
            }
            Op::Remove { parent, name, id } => {
                keys.extend([records::node(*parent), records::entry(*parent, name), records::node(*id)]);
            }
            Op::Rename { parent, name, id, new_parent, new_name, .. } => {
                keys.extend([
                    records::node(*parent),
                    records::node(*new_parent),
                    records::entry(*parent, name),
                    records::entry(*new_parent, new_name),
                    records::node(*id),
                ]);
            }
            Op::Write { id, .. } | Op::SetAttr { id, .. } => {
                keys.insert(records::node(*id));
            }
        }
    }
    keys.into_iter().collect()
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
async fn patch_blocks<T: Txn>(txn: &T, id: Id, old_size: u64, new_size: u64, writes: &[(u64, &[u8])]) -> Step<BTreeMap<u32, Vec<u8>>> {
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
    if !size.is_multiple_of(BLOCK_BYTES) {
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
