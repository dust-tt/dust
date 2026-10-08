use crate::{client::Client, model::*};
use std::collections::{BTreeMap, HashMap};
#[path = "content_cache.rs"]
mod content_cache;
pub use content_cache::ContentCache;

#[derive(Clone, Copy)]
pub struct NamespaceLimits {
    pub nodes: usize,
    pub bytes: usize,
}
impl Default for NamespaceLimits {
    fn default() -> Self {
        Self {
            nodes: 100_000,
            bytes: 128 << 20,
        }
    }
}

pub struct Namespace {
    pub limits: NamespaceLimits,
    pub bytes: usize,
    pub incarnation: Id,
    pub head: u64,
    pub auth_generation: u64,
    pub nodes: HashMap<Id, ViewNode>,
    pub entries: BTreeMap<(Option<Id>, String), Id>,
}
impl Namespace {
    pub fn new(view: View, limits: NamespaceLimits) -> Result<Self> {
        let bytes = view.nodes.iter().try_fold(0usize, |bytes, item| {
            bytes
                .checked_add(item.namespace_bytes())
                .ok_or_else(|| err(libc::EOVERFLOW, "namespace byte overflow"))
        })?;
        Self::check_limits(limits, view.nodes.len(), bytes)?;
        let entries = view
            .nodes
            .iter()
            .map(|item| {
                (
                    (item.visible_parent.clone(), item.visible_name.clone()),
                    item.node.id.clone(),
                )
            })
            .collect();
        let nodes = view
            .nodes
            .into_iter()
            .map(|item| (item.node.id.clone(), item))
            .collect();
        Ok(Self {
            limits,
            bytes,
            incarnation: view.incarnation,
            head: view.head,
            auth_generation: view.auth_generation,
            nodes,
            entries,
        })
    }
    fn check_limits(limits: NamespaceLimits, nodes: usize, bytes: usize) -> Result<()> {
        if limits.nodes == 0 || limits.bytes == 0 || nodes > limits.nodes || bytes > limits.bytes {
            return Err(err(libc::EOVERFLOW, "namespace capacity"));
        }
        Ok(())
    }
    pub fn reserve(&self, nodes: usize, bytes: usize) -> Result<()> {
        Self::check_limits(
            self.limits,
            self.nodes.len().saturating_add(nodes),
            self.bytes.saturating_add(bytes),
        )
    }
    pub fn remove(&mut self, id: &str) -> Option<ViewNode> {
        let previous = self.nodes.remove(id)?;
        self.bytes -= previous.namespace_bytes();
        self.entries.remove(&(
            previous.visible_parent.clone(),
            previous.visible_name.clone(),
        ));
        Some(previous)
    }
    pub fn insert(&mut self, item: ViewNode) -> Result<()> {
        let previous = self.nodes.get(&item.node.id);
        let bytes =
            self.bytes - previous.map_or(0, ViewNode::namespace_bytes) + item.namespace_bytes();
        let nodes = self.nodes.len() + usize::from(previous.is_none());
        Self::check_limits(self.limits, nodes, bytes)?;
        self.remove(&item.node.id);
        self.entries.insert(
            (item.visible_parent.clone(), item.visible_name.clone()),
            item.node.id.clone(),
        );
        self.nodes.insert(item.node.id.clone(), item);
        self.bytes = bytes;
        Ok(())
    }
    pub fn apply_delta(&mut self, delta: Delta) -> Result<()> {
        if delta.reset || delta.incarnation != self.incarnation || delta.from_head != self.head {
            return Err(err(libc::ESTALE, "delta requires snapshot"));
        }
        let mut affected = std::collections::HashSet::new();
        let mut bytes = self.bytes;
        let mut nodes = self.nodes.len();
        for id in delta
            .removed
            .iter()
            .chain(delta.upserts.iter().map(|item| &item.node.id))
        {
            if !affected.insert(id) {
                return Err(err(libc::EIO, "duplicate delta identity"));
            }
            if let Some(previous) = self.nodes.get(id) {
                bytes -= previous.namespace_bytes();
                nodes -= 1;
            }
        }
        for item in &delta.upserts {
            bytes = bytes
                .checked_add(item.namespace_bytes())
                .ok_or_else(|| err(libc::EOVERFLOW, "namespace byte overflow"))?;
            nodes += 1;
        }
        Self::check_limits(self.limits, nodes, bytes)?;
        for id in delta
            .removed
            .iter()
            .chain(delta.upserts.iter().map(|item| &item.node.id))
        {
            self.remove(id);
        }
        for item in delta.upserts {
            self.insert(item)?;
        }
        self.head = delta.head;
        self.auth_generation = delta.auth_generation;
        Ok(())
    }
    pub fn update(&mut self, mut node: Node) -> Result<()> {
        if let Some(cached) = self.nodes.get(&node.id) {
            node.parent = cached.visible_parent.clone();
            node.name = cached.visible_name.clone();
            let mut item = cached.clone();
            item.node = node;
            self.insert(item)?;
        }
        Ok(())
    }
}

pub struct Cache {
    pub namespace: Namespace,
    pub content: ContentCache,
}
impl Cache {
    pub fn new(view: View, budget: usize) -> Result<Self> {
        Self::with_limits(view, budget, NamespaceLimits::default())
    }
    pub fn with_limits(view: View, budget: usize, limits: NamespaceLimits) -> Result<Self> {
        Ok(Self {
            namespace: Namespace::new(view, limits)?,
            content: ContentCache::new(budget),
        })
    }
    pub fn replace(&mut self, view: View) -> Result<Vec<ViewNode>> {
        let namespace = Namespace::new(view, self.namespace.limits)?;
        let same_incarnation = self.namespace.incarnation == namespace.incarnation;
        let changed = self
            .namespace
            .nodes
            .values()
            .filter(|item| !same_incarnation || namespace.nodes.get(&item.node.id) != Some(item))
            .chain(namespace.nodes.values().filter(|item| {
                !same_incarnation || self.namespace.nodes.get(&item.node.id) != Some(item)
            }))
            .cloned()
            .collect();
        self.content.retain(|id, version| {
            same_incarnation
                && self
                    .namespace
                    .nodes
                    .get(id)
                    .is_some_and(|item| item.verbs & READ != 0 && item.node.version == version)
                && namespace
                    .nodes
                    .get(id)
                    .is_some_and(|item| item.verbs & READ != 0 && item.node.version == version)
        });
        self.namespace = namespace;
        Ok(changed)
    }
    pub fn next_file(&self, previous: &str, current: &str) -> bool {
        let Some(previous) = self.namespace.nodes.get(previous) else {
            return false;
        };
        self.namespace
            .entries
            .range((
                std::ops::Bound::Excluded((
                    previous.visible_parent.clone(),
                    previous.visible_name.clone(),
                )),
                std::ops::Bound::Unbounded,
            ))
            .take(17)
            .take_while(|((parent, _), _)| parent == &previous.visible_parent)
            .find(|(_, id)| {
                self.namespace
                    .nodes
                    .get(*id)
                    .is_some_and(|n| n.node.kind == Kind::File && n.verbs & READ != 0)
            })
            .is_some_and(|(_, id)| id == current)
    }
    pub fn adjacent_ranges(
        &self,
        node: &Node,
        index: u64,
        budget: usize,
        siblings: bool,
    ) -> Vec<ReadRange> {
        let Some(item) = self.namespace.nodes.get(&node.id) else {
            return Vec::new();
        };
        if item.node.version != node.version {
            return Vec::new();
        }
        let mut remaining = budget.min(MAX_IO_BYTES);
        let mut ranges = Vec::new();
        for ((parent, _), id) in self
            .namespace
            .entries
            .range((item.visible_parent.clone(), item.visible_name.clone())..)
            .take(17)
        {
            if parent != &item.visible_parent || ranges.len() >= 16 || (!siblings && id != &node.id)
            {
                break;
            }
            let sibling = &self.namespace.nodes[id];
            if sibling.node.kind != Kind::File || sibling.verbs & READ == 0 {
                continue;
            }
            let first = if id == &node.id { index } else { 0 };
            let last = if id == &node.id {
                sibling.node.size.div_ceil(CHUNK_BYTES as u64)
            } else {
                1
            };
            for next in first..last {
                let offset = next * CHUNK_BYTES as u64;
                let size = sibling
                    .node
                    .size
                    .saturating_sub(offset)
                    .min(CHUNK_BYTES as u64) as usize;
                if size == 0 || self.content.chunk(&sibling.node, next).is_some() {
                    continue;
                }
                if size > remaining || ranges.len() >= 16 {
                    return ranges;
                }
                ranges.push(ReadRange {
                    node: id.clone(),
                    version: sibling.node.version.clone(),
                    offset,
                    size: size as u32,
                });
                remaining -= size;
            }
        }
        ranges
    }
    pub fn ranges_to_prefetch(&self, budget: usize) -> Vec<ReadRange> {
        let mut remaining = budget.min(self.content.budget.saturating_sub(self.content.bytes));
        let mut ranges = Vec::new();
        for entry in self.namespace.nodes.values() {
            let node = &entry.node;
            if node.kind != Kind::File || entry.verbs & READ == 0 {
                continue;
            }
            for offset in (0..node.size).step_by(CHUNK_BYTES) {
                let size = (node.size - offset).min(CHUNK_BYTES as u64) as usize;
                if size > remaining {
                    return ranges;
                }
                if self
                    .content
                    .chunk(node, offset / CHUNK_BYTES as u64)
                    .is_some()
                {
                    continue;
                }
                ranges.push(ReadRange {
                    node: node.id.clone(),
                    version: node.version.clone(),
                    offset,
                    size: size as u32,
                });
                remaining -= size;
            }
        }
        ranges
    }
    pub async fn prefetch(&mut self, client: &Client, budget: usize) -> Result<()> {
        let ranges = self.ranges_to_prefetch(budget);
        for pack in ranges.chunks(MAX_IO_BYTES / CHUNK_BYTES) {
            let reply = client
                .call(Call::ReadPack {
                    ranges: pack.to_vec(),
                })
                .await?;
            let Reply::Pack(bytes) = reply else {
                return Err(err(libc::EIO, "invalid pack reply"));
            };
            if bytes.len() != pack.len() {
                return Err(err(libc::EIO, "invalid pack length"));
            }
            for (range, bytes) in pack.iter().zip(bytes) {
                if let Some(node) = self
                    .namespace
                    .nodes
                    .get(&range.node)
                    .map(|n| n.node.clone())
                {
                    self.content
                        .insert(&node, range.offset / CHUNK_BYTES as u64, bytes);
                }
            }
        }
        Ok(())
    }
}
