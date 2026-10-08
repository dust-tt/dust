use crate::model::*;
use std::{
    collections::{BTreeMap, HashMap},
    sync::Arc,
};

type BlockKey = (Id, Id, u64);

struct Block {
    bytes: Arc<[u8]>,
    stamp: u64,
    speculative: bool,
}

pub struct ContentCache {
    chunks: HashMap<BlockKey, Block>,
    order: BTreeMap<u64, BlockKey>,
    speculative_order: BTreeMap<u64, BlockKey>,
    stamp: u64,
    pub speculative_budget: usize,
    pub speculative_bytes: usize,
    pub prefetch_used_bytes: u64,
    pub prefetch_evicted_bytes: u64,
    pub evicted_bytes: u64,
    pub bytes: usize,
    pub budget: usize,
}
impl ContentCache {
    pub fn new(budget: usize) -> Self {
        Self {
            chunks: HashMap::new(),
            order: BTreeMap::new(),
            speculative_order: BTreeMap::new(),
            stamp: 0,
            speculative_budget: 0,
            speculative_bytes: 0,
            prefetch_used_bytes: 0,
            prefetch_evicted_bytes: 0,
            evicted_bytes: 0,
            bytes: 0,
            budget,
        }
    }
    pub fn retain(&mut self, keep: impl Fn(&str, &str) -> bool) {
        self.chunks.retain(|(id, version, _), _| keep(id, version));
        self.order.retain(|_, key| self.chunks.contains_key(key));
        self.speculative_order
            .retain(|_, key| self.chunks.contains_key(key));
        self.bytes = self.chunks.values().map(|block| block.bytes.len()).sum();
        self.speculative_bytes = self
            .chunks
            .values()
            .filter(|block| block.speculative)
            .map(|block| block.bytes.len())
            .sum();
    }
    pub fn set_speculative_budget(&mut self, budget: usize) {
        self.speculative_budget = budget.min(self.budget / 4);
        self.trim(true, 0);
        self.trim(false, 0);
    }
    pub fn chunk(&self, node: &Node, index: u64) -> Option<&[u8]> {
        self.chunks
            .get(&(node.id.clone(), node.version.clone(), index))
            .map(|block| block.bytes.as_ref())
    }
    pub fn peek_shared_chunk(&self, node: &Node, index: u64) -> Option<Arc<[u8]>> {
        self.chunks
            .get(&(node.id.clone(), node.version.clone(), index))
            .map(|block| block.bytes.clone())
    }
    pub fn shared_chunk(&mut self, node: &Node, index: u64) -> Option<Arc<[u8]>> {
        let key = (node.id.clone(), node.version.clone(), index);
        let block = self.chunks.get_mut(&key)?;
        let bytes = block.bytes.clone();
        if block.speculative {
            self.speculative_bytes -= block.bytes.len();
            self.prefetch_used_bytes += block.bytes.len() as u64;
            self.speculative_order.remove(&block.stamp);
            block.speculative = false;
        } else {
            self.order.remove(&block.stamp);
        }
        self.stamp += 1;
        block.stamp = self.stamp;
        self.order.insert(self.stamp, key);
        self.trim(false, 0);
        Some(bytes)
    }
    fn evict(&mut self, speculative: bool) -> bool {
        let oldest = if speculative {
            self.speculative_order.pop_first()
        } else {
            self.order.pop_first()
        };
        let Some((_, key)) = oldest else {
            return false;
        };
        if let Some(block) = self.chunks.remove(&key) {
            self.bytes -= block.bytes.len();
            self.evicted_bytes += block.bytes.len() as u64;
            if block.speculative {
                self.speculative_bytes -= block.bytes.len();
                self.prefetch_evicted_bytes += block.bytes.len() as u64;
            }
        }
        true
    }
    fn trim(&mut self, speculative: bool, incoming: usize) {
        loop {
            let (used, limit) = if speculative {
                (self.speculative_bytes, self.speculative_budget)
            } else {
                (
                    self.bytes - self.speculative_bytes,
                    self.budget - self.speculative_budget,
                )
            };
            if used + incoming <= limit || !self.evict(speculative) {
                break;
            }
        }
    }
    pub fn insert(&mut self, node: &Node, index: u64, bytes: Vec<u8>) {
        self.insert_shared(node, index, bytes.into());
    }
    pub fn insert_shared(&mut self, node: &Node, index: u64, bytes: Arc<[u8]>) {
        self.insert_block(node, index, bytes, false);
    }
    pub fn insert_speculative(&mut self, node: &Node, index: u64, bytes: Vec<u8>) {
        self.insert_block(node, index, bytes.into(), true);
    }
    fn insert_block(&mut self, node: &Node, index: u64, bytes: Arc<[u8]>, speculative: bool) {
        let limit = if speculative {
            self.speculative_budget
        } else {
            self.budget - self.speculative_budget
        };
        if bytes.is_empty() || bytes.len() > limit {
            return;
        }
        let key = (node.id.clone(), node.version.clone(), index);
        if self.chunks.contains_key(&key) {
            return;
        }
        self.trim(speculative, bytes.len());
        self.stamp += 1;
        self.bytes += bytes.len();
        if speculative {
            self.speculative_bytes += bytes.len();
            self.speculative_order.insert(self.stamp, key.clone());
        } else {
            self.order.insert(self.stamp, key.clone());
        }
        self.chunks.insert(
            key,
            Block {
                bytes,
                stamp: self.stamp,
                speculative,
            },
        );
    }
}
