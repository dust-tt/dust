use dfs_protocol::ObjectId;
use parking_lot::RwLock;
mod builder;
mod growth;
pub use builder::Builder;
use growth::Growth;
use std::{
    collections::{HashMap, HashSet},
    fmt,
    sync::Arc,
    time::{Duration, Instant},
};

const NONE: u32 = u32::MAX;
const DEAD: u8 = 0;
const FILE: u8 = 1;
const DIRECTORY: u8 = 2;
pub const MAX_DEPTH: usize = 4096;
pub const MAX_AUTH_BATCH: usize = 4096;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct GrantId(pub u32);

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Image {
    pub id: ObjectId,
    pub parent: Option<ObjectId>,
    pub directory: bool,
    pub grants: Vec<GrantId>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Update {
    Live(Image),
    Deleted(ObjectId),
}
impl Update {
    pub fn id(&self) -> ObjectId {
        match self {
            Self::Live(image) => image.id,
            Self::Deleted(id) => *id,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Error {
    InvalidTree,
    Capacity,
    Stale,
    ConcurrentPublication,
}
impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "permission tree: {self:?}")
    }
}
impl std::error::Error for Error {}

#[derive(Clone)]
struct Policy {
    grants: Arc<[GrantId]>,
    references: usize,
}

#[derive(Default)]
struct Policies {
    index: HashMap<Arc<[GrantId]>, u32>,
    values: Vec<Option<Policy>>,
    free: Vec<u32>,
    bytes: usize,
}
impl Policies {
    fn get(&self, index: u32) -> &[GrantId] {
        if index == NONE {
            &[]
        } else {
            self.values[index as usize]
                .as_ref()
                .map_or(&[], |policy| policy.grants.as_ref())
        }
    }

    fn acquire(&mut self, grants: Arc<[GrantId]>) -> u32 {
        if grants.is_empty() {
            return NONE;
        }
        if let Some(&index) = self.index.get(&grants) {
            if let Some(policy) = &mut self.values[index as usize] {
                policy.references += 1;
            }
            return index;
        }
        let policy = Policy {
            grants: grants.clone(),
            references: 1,
        };
        self.bytes += grants.len() * size_of::<GrantId>() + 16;
        let index = if let Some(index) = self.free.pop() {
            self.values[index as usize] = Some(policy);
            index
        } else {
            let index = self.values.len() as u32;
            self.values.push(Some(policy));
            index
        };
        self.index.insert(grants, index);
        index
    }

    fn release(&mut self, index: u32) {
        if index == NONE {
            return;
        }
        if let Some(policy) = &mut self.values[index as usize] {
            policy.references -= 1;
            if policy.references == 0 {
                self.bytes -= policy.grants.len() * size_of::<GrantId>() + 16;
                self.index.remove(&policy.grants);
                self.values[index as usize] = None;
                self.free.push(index);
            }
        }
    }
}

/// @cc [owner:spolu,label:performance;security] dense-authority-topology
/// The UUID index MUST own the sole resident UUID per object. Parent/grant references MUST use u32
/// arrays; empty slots MUST never authorize. Explicit grant sets MUST be interned and reclaimed when
/// their final node reference is released. No names, content or inherited-grant copies belong here.
pub struct Tree {
    root: ObjectId,
    index: HashMap<ObjectId, u32>,
    parents: Vec<u32>,
    policies: Vec<u32>,
    kinds: Vec<u8>,
    children: Vec<u32>,
    free: Vec<u32>,
    grants: Policies,
}

struct PreparedBatch {
    prepared: HashMap<u32, Prepared>,
    child_deltas: HashMap<u32, i64>,
    length: usize,
    reused: usize,
    growth: Growth,
}

struct Prepared {
    id: ObjectId,
    slot: u32,
    parent: u32,
    kind: u8,
    grants: Arc<[GrantId]>,
}

impl Tree {
    fn empty(root: ObjectId) -> Self {
        Self {
            root,
            index: HashMap::new(),
            parents: Vec::new(),
            policies: Vec::new(),
            kinds: Vec::new(),
            children: Vec::new(),
            free: Vec::new(),
            grants: Policies::default(),
        }
    }
    pub fn from_images(root: ObjectId, images: Vec<Image>) -> Result<Self, Error> {
        let mut tree = Self::empty(root);
        tree.apply(images.into_iter().map(Update::Live).collect())?;
        Ok(tree)
    }

    pub fn len(&self) -> usize {
        self.index.len()
    }

    pub fn is_empty(&self) -> bool {
        self.index.is_empty()
    }

    /// Usable hash-table capacity, for measuring occupancy without exposing IDs or permissions.
    pub fn index_capacity(&self) -> usize {
        self.index.capacity()
    }
    /// Conservative accounting includes table control bytes, spare capacity and unique grant arrays.
    pub fn memory_bytes(&self) -> usize {
        size_of::<Self>()
            + self.index.capacity() * 40
            + (self.parents.capacity()
                + self.policies.capacity()
                + self.children.capacity()
                + self.free.capacity()
                + self.grants.free.capacity())
                * size_of::<u32>()
            + self.kinds.capacity()
            + self.grants.index.capacity() * 40
            + self.grants.values.capacity() * size_of::<Option<Policy>>()
            + self.grants.bytes
    }

    pub fn contains(&self, id: ObjectId) -> bool {
        self.index.contains_key(&id)
    }

    pub fn parent_matches(&self, id: ObjectId, parent: Option<ObjectId>) -> bool {
        let Some(&slot) = self.index.get(&id) else {
            return false;
        };
        match parent {
            Some(parent) => self.index.get(&parent) == Some(&self.parents[slot as usize]),
            None => id == self.root && self.parents[slot as usize] == NONE,
        }
    }

    /// Session grant IDs MUST be sorted and deduplicated by session establishment.
    pub fn allows(&self, id: ObjectId, session_grants: &[GrantId]) -> bool {
        let Some(&start) = self.index.get(&id) else {
            return false;
        };
        let mut slot = start;
        let mut allowed = false;
        for depth in 0..MAX_DEPTH {
            let index = slot as usize;
            let Some(&kind) = self.kinds.get(index) else {
                return false;
            };
            if kind == DEAD || (depth > 0 && kind != DIRECTORY) {
                return false;
            }
            allowed |= self
                .grants
                .get(self.policies[index])
                .iter()
                .any(|grant| session_grants.binary_search(grant).is_ok());
            let parent = self.parents[index];
            if parent == NONE {
                return allowed && self.index.get(&self.root) == Some(&slot);
            }
            slot = parent;
        }
        false
    }

    /// @cc [owner:spolu,label:concurrency;security] atomic-tree-edit-validation
    /// Invalid, cyclic or disconnected updates MUST leave the previous permission decisions intact.
    /// All new slots and grant sets MUST be prepared before changing visible topology. This method
    /// requires exclusive ownership; callers publishing to readers MUST hold their tenant write lock.
    pub fn apply(&mut self, updates: Vec<Update>) -> Result<bool, Error> {
        let prepared = self.prepare(updates)?;
        Ok(self.apply_prepared(prepared).0)
    }
    fn prepare(&self, updates: Vec<Update>) -> Result<PreparedBatch, Error> {
        let mut seen = HashSet::with_capacity(updates.len());
        let mut new_slots = HashMap::new();
        let mut reused = 0;
        let mut length = self.parents.len();
        for update in &updates {
            let id = update.id();
            if !seen.insert(id) {
                return Err(Error::InvalidTree);
            }
            if matches!(update, Update::Live(_)) && !self.index.contains_key(&id) {
                let slot = if reused < self.free.len() {
                    reused += 1;
                    self.free[self.free.len() - reused]
                } else {
                    if length >= NONE as usize {
                        return Err(Error::Capacity);
                    }
                    let slot = length as u32;
                    length += 1;
                    slot
                };
                new_slots.insert(id, slot);
            }
        }
        let slot_for = |id: &ObjectId| new_slots.get(id).or_else(|| self.index.get(id)).copied();
        let mut prepared = HashMap::with_capacity(updates.len());
        for update in updates {
            let id = update.id();
            let Some(slot) = slot_for(&id) else {
                continue;
            };
            let value = match update {
                Update::Live(mut image) => {
                    let parent = match image.parent {
                        Some(id) => slot_for(&id).ok_or(Error::InvalidTree)?,
                        None if image.id == self.root && image.directory => NONE,
                        None => return Err(Error::InvalidTree),
                    };
                    if image.id == self.root && parent != NONE {
                        return Err(Error::InvalidTree);
                    }
                    image.grants.sort_unstable();
                    image.grants.dedup();
                    if image.grants.first() == Some(&GrantId(0)) {
                        return Err(Error::InvalidTree);
                    }
                    Prepared {
                        id,
                        slot,
                        parent,
                        kind: if image.directory { DIRECTORY } else { FILE },
                        grants: image.grants.into(),
                    }
                }
                Update::Deleted(_) => {
                    if id == self.root {
                        return Err(Error::InvalidTree);
                    }
                    Prepared {
                        id,
                        slot,
                        parent: NONE,
                        kind: DEAD,
                        grants: Arc::from([]),
                    }
                }
            };
            prepared.insert(slot, value);
        }
        let root_slot = slot_for(&self.root).ok_or(Error::InvalidTree)?;
        for update in prepared.values().filter(|update| update.kind != DEAD) {
            let mut slot = update.slot;
            let mut reached_root = false;
            for depth in 0..MAX_DEPTH {
                let (kind, parent) = match prepared.get(&slot) {
                    Some(value) => (value.kind, value.parent),
                    None => (self.kinds[slot as usize], self.parents[slot as usize]),
                };
                if kind == DEAD || (depth > 0 && kind != DIRECTORY) {
                    return Err(Error::InvalidTree);
                }
                if parent == NONE {
                    reached_root = slot == root_slot && kind == DIRECTORY;
                    break;
                }
                slot = parent;
            }
            if !reached_root {
                return Err(Error::InvalidTree);
            }
        }
        // Count edges so deleting an empty directory never scans the whole tenant.
        let mut child_deltas: HashMap<u32, i64> = HashMap::new();
        for value in prepared.values() {
            if let Some(&kind) = self.kinds.get(value.slot as usize)
                && kind != DEAD
            {
                if value.kind != DEAD && value.kind != kind {
                    return Err(Error::InvalidTree);
                }
                let parent = self.parents[value.slot as usize];
                if parent != NONE {
                    *child_deltas.entry(parent).or_default() -= 1;
                }
            }
            if value.kind != DEAD && value.parent != NONE {
                *child_deltas.entry(value.parent).or_default() += 1;
            }
        }
        let child_count = |slot: u32| {
            i64::from(self.children.get(slot as usize).copied().unwrap_or(0))
                + child_deltas.get(&slot).copied().unwrap_or(0)
        };
        for value in prepared.values() {
            let count = child_count(value.slot);
            if !(0..=i64::from(u32::MAX)).contains(&count)
                || (value.kind != DIRECTORY && count != 0)
            {
                return Err(Error::InvalidTree);
            }
        }
        for &slot in child_deltas.keys() {
            if !(0..=i64::from(u32::MAX)).contains(&child_count(slot)) {
                return Err(Error::InvalidTree);
            }
        }
        if self.grants.values.len().saturating_add(prepared.len()) >= NONE as usize {
            return Err(Error::Capacity);
        }
        let growth = Growth::prepare(self, length, new_slots.len(), prepared.len())?;
        Ok(PreparedBatch {
            prepared,
            child_deltas,
            length,
            reused,
            growth,
        })
    }
    fn apply_prepared(&mut self, batch: PreparedBatch) -> (bool, Growth) {
        let PreparedBatch {
            prepared,
            child_deltas,
            length,
            reused,
            mut growth,
        } = batch;
        growth.install(self);
        self.free.truncate(self.free.len() - reused);
        self.parents.resize(length, NONE);
        self.policies.resize(length, NONE);
        self.kinds.resize(length, DEAD);
        self.children.resize(length, 0);
        for (slot, delta) in child_deltas {
            self.children[slot as usize] = (i64::from(self.children[slot as usize]) + delta) as u32;
        }
        let mut changed = false;
        for value in prepared.into_values() {
            let slot = value.slot as usize;
            if self.kinds[slot] == value.kind
                && self.parents[slot] == value.parent
                && self.grants.get(self.policies[slot]) == value.grants.as_ref()
            {
                continue;
            }
            changed = true;
            let policy = self.grants.acquire(value.grants);
            self.grants.release(self.policies[slot]);
            self.policies[slot] = policy;
            self.parents[slot] = value.parent;
            self.kinds[slot] = value.kind;
            if value.kind == DEAD {
                self.index.remove(&value.id);
                self.free.push(value.slot);
            } else {
                self.index.insert(value.id, value.slot);
            }
        }
        (changed, growth)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Proof {
    pub incarnation: ObjectId,
    pub generation: u64,
    pub read_version: i64,
    pub poll_started: Instant,
}

struct Published {
    tree: Tree,
    proof: Proof,
}

pub struct TenantTree {
    state: RwLock<Published>,
    max_age: Duration,
    _reservation: Arc<dyn Send + Sync>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Access {
    Allowed,
    Denied,
    Fallback,
}

impl TenantTree {
    pub fn new(tree: Tree, proof: Proof, max_age: Duration) -> Result<Self, Error> {
        Self::new_reserved(tree, proof, max_age, Arc::new(()))
    }
    pub fn new_reserved(
        tree: Tree,
        proof: Proof,
        max_age: Duration,
        reservation: Arc<dyn Send + Sync>,
    ) -> Result<Self, Error> {
        if tree.is_empty() || max_age.is_zero() || proof.read_version < 0 {
            return Err(Error::InvalidTree);
        }
        Ok(Self {
            state: RwLock::new(Published { tree, proof }),
            max_age,
            _reservation: reservation,
        })
    }

    fn fresh(&self, proof: Proof, now: Instant) -> Result<(), Error> {
        if now
            .checked_duration_since(proof.poll_started)
            .is_none_or(|age| age >= self.max_age)
        {
            return Err(Error::Stale);
        }
        Ok(())
    }

    /// A missing node or a parent differing from current FDB metadata requires a complete FDB proof.
    pub fn authorize_object(
        &self,
        id: ObjectId,
        current_parent: Option<ObjectId>,
        session_grants: &[GrantId],
        now: Instant,
    ) -> Result<(Proof, Access), Error> {
        if session_grants.len() > dfs_protocol::MAX_GRANTS
            || !session_grants.windows(2).all(|v| v[0] < v[1])
        {
            return Err(Error::Capacity);
        }
        let state = self.state.read();
        self.fresh(state.proof, now)?;
        let access = if !state.tree.parent_matches(id, current_parent) {
            Access::Fallback
        } else if state.tree.allows(id, session_grants) {
            Access::Allowed
        } else {
            Access::Denied
        };
        Ok((state.proof, access))
    }

    pub fn authorize(
        &self,
        ids: &[ObjectId],
        session_grants: &[GrantId],
        now: Instant,
    ) -> Result<(Proof, Vec<bool>), Error> {
        if ids.len() > MAX_AUTH_BATCH
            || session_grants.len() > dfs_protocol::MAX_GRANTS
            || !session_grants.windows(2).all(|v| v[0] < v[1])
        {
            return Err(Error::Capacity);
        }
        let state = self.state.read();
        self.fresh(state.proof, now)?;
        let decisions = ids
            .iter()
            .map(|id| state.tree.allows(*id, session_grants))
            .collect();
        Ok((state.proof, decisions))
    }

    pub fn check_proof(&self, proof: Proof, now: Instant) -> Result<(), Error> {
        let state = self.state.read();
        if state.proof.incarnation != proof.incarnation
            || state.proof.generation != proof.generation
        {
            return Err(Error::ConcurrentPublication);
        }
        self.fresh(state.proof, now)
    }

    /// @cc [owner:spolu,label:security;concurrency] complete-interval-publication
    /// Callers MUST supply every update in a completed fixed-version interval, including deletions.
    /// Cursor/incarnation mismatches, invalid topology or an expired poll MUST leave the old proof
    /// untouched. Empty completed intervals MAY advance freshness without changing authorization
    /// generation. Poll start, never completion time, MUST establish the new age proof.
    pub fn publish_complete(
        &self,
        expected: Proof,
        read_version: i64,
        poll_started: Instant,
        updates: Vec<Update>,
        now: Instant,
    ) -> Result<Proof, Error> {
        self.publish_bounded(
            expected,
            read_version,
            poll_started,
            updates,
            now,
            usize::MAX,
        )
    }
    pub fn memory_bytes(&self) -> usize {
        self.state.read().tree.memory_bytes()
    }
    pub fn proof(&self) -> Proof {
        self.state.read().proof
    }
    pub fn root(&self) -> ObjectId {
        self.state.read().tree.root
    }
    /// @cc [owner:spolu,label:concurrency;performance] allocation-before-publication
    /// Graph validation, grant preparation and capacity growth MUST finish before the write guard.
    /// Installation MUST recheck the exact expected proof and poll age, then publish all changes
    /// without allocating or awaiting. Replaced capacity buffers MUST be released after the guard.
    pub fn publish_bounded(
        &self,
        expected: Proof,
        read_version: i64,
        poll_started: Instant,
        updates: Vec<Update>,
        now: Instant,
        max_bytes: usize,
    ) -> Result<Proof, Error> {
        let preparation_started = Instant::now();
        let state = self.state.read();
        if state.proof != expected
            || read_version < expected.read_version
            || (read_version == expected.read_version && !updates.is_empty())
        {
            return Err(Error::ConcurrentPublication);
        }
        let mut proof = Proof {
            read_version,
            poll_started,
            ..expected
        };
        self.fresh(proof, now)?;
        if state.proof.generation == u64::MAX {
            return Err(Error::Capacity);
        }
        let staging = updates
            .iter()
            .fold(updates.len().saturating_mul(512), |bytes, update| {
                let grants = match update {
                    Update::Live(image) => image.grants.len(),
                    _ => 0,
                };
                bytes.saturating_add(grants.saturating_mul(16))
            });
        if state
            .tree
            .memory_bytes()
            .saturating_mul(3)
            .saturating_add(staging)
            > max_bytes
        {
            return Err(Error::Capacity);
        }
        let prepared = state.tree.prepare(updates)?;
        drop(state);
        let mut state = self.state.write();
        if state.proof != expected {
            return Err(Error::ConcurrentPublication);
        }
        let publication_time = now
            .checked_add(preparation_started.elapsed())
            .ok_or(Error::Stale)?;
        self.fresh(proof, publication_time)?;
        let (changed, old_buffers) = state.tree.apply_prepared(prepared);
        if changed {
            proof.generation += 1;
        }
        state.proof = proof;
        drop(state);
        drop(old_buffers);
        Ok(proof)
    }
}

#[cfg(test)]
mod tests;
