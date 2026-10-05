use crate::keys::Keys;
use dfs_protocol::validate;
use std::collections::{HashMap, HashSet, VecDeque};
use tokio::sync::Mutex;

pub(crate) const WINDOW: usize = 16;
const MAX_ENTRIES: usize = 16_384;
const MAX_BYTES: usize = 8 * 1024 * 1024;

/// @cc [owner:spolu,label:security;performance] advisory-parent-edges
/// Store only tenant-scoped parent edges and name-to-object IDs, never grants or authorization.
/// Hints MAY be stale or originate from aborted transactions. Consumers MUST read and validate all
/// used parent links and grants in their current coherent view and validate publication dependencies.
/// Cache misses MUST preserve access.
/// The cache MUST bound total entries/bytes across tenants and each returned chain's length.
#[derive(Default)]
pub(crate) struct Ancestry(Mutex<Edges>);

#[derive(Default)]
struct Edges {
    targets: HashMap<Vec<u8>, String>,
    order: VecDeque<Vec<u8>>,
    bytes: usize,
}
impl Ancestry {
    pub async fn remember(&self, keys: &Keys, object: &str, parent: &str) {
        let (Ok(key), Ok(parent)) = (keys.object(object), validate::id(parent)) else {
            return;
        };
        self.0.lock().await.insert(key, parent);
    }

    pub async fn remember_child(&self, keys: &Keys, parent: &str, name: &str, object: &str) {
        let (Ok(key), Ok(()), Ok(object)) = (
            keys.child(parent, name),
            validate::name(name),
            validate::id(object),
        ) else {
            return;
        };
        self.0.lock().await.insert(key, object);
    }

    pub async fn child(&self, keys: &Keys, parent: &str, name: &str) -> Option<String> {
        let key = keys.child(parent, name).ok()?;
        self.0.lock().await.targets.get(&key).cloned()
    }

    pub async fn chain(&self, keys: &Keys, first: &str) -> Vec<String> {
        let edges = self.0.lock().await;
        let mut chain = Vec::new();
        let mut seen = HashSet::new();
        let mut next = first.to_owned();
        while chain.len() < WINDOW - 1 && seen.insert(next.clone()) {
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
    fn insert(&mut self, key: Vec<u8>, target: String) {
        if let Some(previous) = self.targets.get_mut(&key) {
            *previous = target;
            return;
        }
        let charge = Self::charge(&key, &target);
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
        self.targets.insert(key, target);
    }
}
