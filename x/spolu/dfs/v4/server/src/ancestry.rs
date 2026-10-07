use crate::keys::Keys;
use dfs_protocol::validate;
use parking_lot::RwLock;
use std::collections::{BTreeSet, HashMap, VecDeque};

pub(crate) const WINDOW: usize = 16;
const MAX_ENTRIES: usize = 16_384;
const MAX_BYTES: usize = 8 * 1024 * 1024;

/// @cc [owner:spolu,label:security;performance] advisory-parent-edges
/// Store tenant-scoped parent edges, name-to-object IDs, and previously matching grant names.
/// Hints MAY be stale or originate from aborted transactions. Consumers MUST read and validate all
/// used parent links and grant membership in their current FDB transaction. Hints MUST NOT establish
/// authority or denial by themselves. They require no TTL or proactive invalidation.
/// The cache MUST bound total entries/bytes across tenants and each returned chain's length.
#[derive(Default)]
pub(crate) struct Ancestry(RwLock<Edges>);

#[derive(Default)]
struct Edges {
    targets: HashMap<Vec<u8>, String>,
    order: VecDeque<Vec<u8>>,
    bytes: usize,
}
impl Ancestry {
    pub fn remember(&self, keys: &Keys, object: &str, parent: &str) {
        let (Ok(key), Ok(parent)) = (keys.object(object), validate::id_ref(parent)) else {
            return;
        };
        self.0.write().insert(key, parent);
    }

    pub fn remember_child(&self, keys: &Keys, parent: &str, name: &str, object: &str) {
        let (Ok(key), Ok(()), Ok(object)) = (
            keys.child(parent, name),
            validate::name(name),
            validate::id_ref(object),
        ) else {
            return;
        };
        self.0.write().insert(key, object);
    }

    pub fn child(&self, keys: &Keys, parent: &str, name: &str) -> Option<String> {
        let key = keys.child(parent, name).ok()?;
        self.0.read().targets.get(&key).cloned()
    }

    pub fn remember_grant(&self, keys: &Keys, object: &str, grant: &str) {
        let (Ok(key), Ok(())) = (keys.grants(object), validate::grant(grant)) else {
            return;
        };
        self.0.write().insert(key, grant);
    }

    pub fn grant(&self, keys: &Keys, object: &str, grants: &BTreeSet<String>) -> Option<String> {
        let key = keys.grants(object).ok()?;
        self.0
            .read()
            .targets
            .get(&key)
            .filter(|g| grants.contains(*g))
            .cloned()
    }

    pub fn chain(&self, keys: &Keys, first: &str) -> Vec<String> {
        let edges = self.0.read();
        let mut chain = Vec::with_capacity(WINDOW - 1);
        let mut next = first.to_owned();
        // The hint chain contains at most 15 IDs; avoid allocating a second set for cycle detection.
        while chain.len() < WINDOW - 1 && !chain.contains(&next) {
            let Ok(key) = keys.object(&next) else {
                break;
            };
            chain.push(next);
            let Some(parent) = edges.targets.get(&key) else {
                break;
            };
            next = parent.clone();
        }
        chain
    }
}
impl Edges {
    fn charge(key: &[u8], target: &str) -> usize {
        // Include both key copies, the target, and conservative container/allocation overhead.
        2 * key.len() + target.len() + 128
    }
    fn insert(&mut self, key: Vec<u8>, target: &str) {
        if let Some(previous) = self.targets.get(&key) {
            let next_bytes = self.bytes - previous.len() + target.len();
            if previous != target && next_bytes <= MAX_BYTES {
                self.targets.insert(key, target.to_owned());
                self.bytes = next_bytes;
            }
            return;
        }
        let charge = Self::charge(&key, target);
        while self.targets.len() >= MAX_ENTRIES || self.bytes + charge > MAX_BYTES {
            let Some(oldest) = self.order.pop_front() else {
                return;
            };
            if let Some(previous) = self.targets.remove(&oldest) {
                self.bytes -= Self::charge(&oldest, &previous);
            }
        }
        self.bytes += charge;
        self.order.push_back(key.clone());
        self.targets.insert(key, target.to_owned());
    }
}
