use super::*;
use crate::tree_log::Stamp;

/// @cc [owner:spolu,label:security;performance] private-reconciled-bootstrap
/// Builders MUST remain unavailable to authorization until finish validates the entire graph.
/// Each node, including a tombstone, MUST retain its latest update stamp during construction so
/// delayed base rows cannot overwrite newer feed images. Missing parents MAY have private slots;
/// unresolved parents, cycles and invalid roots MUST prevent publication. Budget overflow MUST fail.
pub struct Builder {
    tree: Tree,
    stamps: Vec<[u8; 10]>,
    max_bytes: usize,
}
impl Builder {
    pub fn new(root: ObjectId, max_bytes: usize) -> Self {
        Self {
            tree: Tree::empty(root),
            stamps: Vec::new(),
            max_bytes,
        }
    }
    pub fn memory_bytes(&self) -> usize {
        self.tree.memory_bytes() + self.stamps.capacity() * 10
    }
    fn slot(&mut self, id: ObjectId) -> Result<u32, Error> {
        if let Some(slot) = self.tree.index.get(&id) {
            return Ok(*slot);
        }
        let slot = u32::try_from(self.tree.parents.len()).map_err(|_| Error::Capacity)?;
        if slot == NONE {
            return Err(Error::Capacity);
        }
        self.tree
            .index
            .try_reserve(1)
            .map_err(|_| Error::Capacity)?;
        self.tree
            .parents
            .try_reserve(1)
            .map_err(|_| Error::Capacity)?;
        self.tree
            .policies
            .try_reserve(1)
            .map_err(|_| Error::Capacity)?;
        self.tree
            .kinds
            .try_reserve(1)
            .map_err(|_| Error::Capacity)?;
        self.tree
            .children
            .try_reserve(1)
            .map_err(|_| Error::Capacity)?;
        self.stamps.try_reserve(1).map_err(|_| Error::Capacity)?;
        self.tree.index.insert(id, slot);
        self.tree.parents.push(NONE);
        self.tree.policies.push(NONE);
        self.tree.kinds.push(DEAD);
        self.tree.children.push(0);
        self.stamps.push([0; 10]);
        Ok(slot)
    }
    pub fn merge(&mut self, stamp: Stamp, update: Update) -> Result<(), Error> {
        if stamp.version() <= 0 {
            return Err(Error::InvalidTree);
        }
        if let Some(&slot) = self.tree.index.get(&update.id())
            && self.stamps[slot as usize] >= stamp.0
        {
            return Ok(());
        }
        let grant_bytes = match &update {
            Update::Live(image) => image.grants.len() * 4,
            _ => 0,
        };
        // Reserve conservative reallocation headroom before growing any table or array. The builder
        // is discarded on failure; its configured peak includes both old and new allocator buffers.
        let peak = self
            .memory_bytes()
            .saturating_mul(3)
            .saturating_add(grant_bytes.saturating_mul(3))
            .saturating_add(4096);
        if peak > self.max_bytes {
            return Err(Error::Capacity);
        }
        let slot = self.slot(update.id())? as usize;
        let (parent, kind, grants) = match update {
            Update::Live(mut image) => {
                image.grants.sort_unstable();
                image.grants.dedup();
                if image.grants.first() == Some(&GrantId(0)) {
                    return Err(Error::InvalidTree);
                }
                let parent = match image.parent {
                    Some(id) => self.slot(id)?,
                    None => NONE,
                };
                (
                    parent,
                    if image.directory { DIRECTORY } else { FILE },
                    Arc::from(image.grants),
                )
            }
            Update::Deleted(_) => (NONE, DEAD, Arc::from([])),
        };
        self.tree
            .grants
            .index
            .try_reserve(1)
            .map_err(|_| Error::Capacity)?;
        self.tree
            .grants
            .values
            .try_reserve(1)
            .map_err(|_| Error::Capacity)?;
        self.tree
            .grants
            .free
            .try_reserve(1)
            .map_err(|_| Error::Capacity)?;
        if self.tree.grants.values.len() >= NONE as usize {
            return Err(Error::Capacity);
        }
        let policy = self.tree.grants.acquire(grants);
        self.tree.grants.release(self.tree.policies[slot]);
        self.tree.policies[slot] = policy;
        self.tree.parents[slot] = parent;
        self.tree.kinds[slot] = kind;
        self.stamps[slot] = stamp.0;
        Ok(())
    }

    /// The caller must first finish reconciliation through T >= every base page's read version and
    /// validate incarnation/resume floor at a fresh version. Graph validation alone proves no cursor.
    pub fn finish(mut self) -> Result<Tree, Error> {
        let Some(&root) = self.tree.index.get(&self.tree.root) else {
            return Err(Error::InvalidTree);
        };
        if self.tree.kinds[root as usize] != DIRECTORY || self.tree.parents[root as usize] != NONE {
            return Err(Error::InvalidTree);
        }
        let length = self.tree.parents.len();
        if self
            .memory_bytes()
            .saturating_add(length.saturating_mul(8))
            .saturating_add(MAX_DEPTH * size_of::<usize>())
            > self.max_bytes
        {
            return Err(Error::Capacity);
        }
        let mut depths = vec![0u16; length];
        depths[root as usize] = 1;
        let mut path = Vec::with_capacity(MAX_DEPTH);
        // Memoized depths validate each live edge once, independent of UUID scan order.
        for start in 0..length {
            if self.tree.kinds[start] == DEAD || depths[start] != 0 {
                continue;
            }
            let mut slot = start;
            while depths[slot] == 0 {
                if self.tree.kinds[slot] == DEAD || path.len() >= MAX_DEPTH {
                    return Err(Error::InvalidTree);
                }
                depths[slot] = u16::MAX;
                path.push(slot);
                let parent = self.tree.parents[slot];
                if parent == NONE || self.tree.kinds[parent as usize] != DIRECTORY {
                    return Err(Error::InvalidTree);
                }
                slot = parent as usize;
            }
            let mut depth = depths[slot];
            if depth == u16::MAX {
                return Err(Error::InvalidTree);
            }
            while let Some(slot) = path.pop() {
                depth += 1;
                if usize::from(depth) > MAX_DEPTH {
                    return Err(Error::InvalidTree);
                }
                depths[slot] = depth;
            }
        }
        self.tree
            .free
            .try_reserve(length)
            .map_err(|_| Error::Capacity)?;
        self.tree
            .index
            .retain(|_, slot| self.tree.kinds[*slot as usize] != DEAD);
        for slot in 0..length {
            if self.tree.kinds[slot] == DEAD {
                self.tree.free.push(slot as u32);
            } else {
                let parent = self.tree.parents[slot];
                if parent != NONE {
                    self.tree.children[parent as usize] = self.tree.children[parent as usize]
                        .checked_add(1)
                        .ok_or(Error::Capacity)?;
                }
            }
        }
        Ok(self.tree)
    }
}
