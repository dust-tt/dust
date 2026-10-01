use std::collections::HashMap;

pub const ROOT: u64 = 1;
const MAX_INODES: usize = 100_000;

#[derive(Clone)]
pub struct Node {
    pub object: String,
    pub parent: u64,
    anchor: String,
    lookups: u64,
    pins: u64,
}

/// @cc [owner:spolu,label:security] mount-inode-identity
/// Inodes MUST identify an object within its visible projection, never a canonical hidden parent.
/// Keep parents alive while children or handles reference them, reclaim forgotten nodes, and never
/// recycle inode numbers during a mount. This table stores identity, not cached authorization.
pub struct Inodes {
    nodes: HashMap<u64, Node>,
    identities: HashMap<(String, String), u64>,
    next: u64,
}

impl Default for Inodes {
    fn default() -> Self {
        Self {
            nodes: HashMap::from([(
                ROOT,
                Node {
                    object: "root".into(),
                    parent: ROOT,
                    anchor: "root".into(),
                    lookups: 1,
                    pins: 0,
                },
            )]),
            identities: HashMap::from([(("root".into(), "root".into()), ROOT)]),
            next: 2,
        }
    }
}

impl Inodes {
    pub fn node(&self, ino: u64) -> Option<Node> {
        self.nodes.get(&ino).cloned()
    }

    fn identity(&self, parent: u64, object: &str) -> Option<(String, String)> {
        let parent = self.nodes.get(&parent)?;
        let anchor = if parent.object == "shared" {
            object
        } else {
            &parent.anchor
        };
        Some((object.into(), anchor.into()))
    }

    pub fn existing(&self, parent: u64, object: &str) -> Option<u64> {
        self.identities
            .get(&self.identity(parent, object)?)
            .copied()
    }

    pub fn lookup(&mut self, parent: u64, object: &str) -> Option<u64> {
        let identity = self.identity(parent, object)?;
        if let Some(ino) = self.identities.get(&identity).copied() {
            self.reparent(ino, parent)?;
            let node = self.nodes.get_mut(&ino)?;
            node.lookups = node.lookups.checked_add(1)?;
            return Some(ino);
        }
        if self.nodes.len() >= MAX_INODES {
            return None;
        }
        let ino = self.next;
        self.next = self.next.checked_add(1)?;
        self.pin(parent)?;
        self.nodes.insert(
            ino,
            Node {
                object: object.into(),
                parent,
                anchor: identity.1.clone(),
                lookups: 1,
                pins: 0,
            },
        );
        self.identities.insert(identity, ino);
        Some(ino)
    }

    pub fn reparent(&mut self, ino: u64, parent: u64) -> Option<()> {
        let old = self.nodes.get(&ino)?.parent;
        if old != parent && ino != ROOT {
            // Refuse cycles caused by stale remote traversal or raced lookups.
            let mut ancestor = parent;
            loop {
                if ancestor == ino {
                    return None;
                }
                if ancestor == ROOT {
                    break;
                }
                ancestor = self.nodes.get(&ancestor)?.parent;
            }
            self.pin(parent)?;
            self.nodes.get_mut(&ino)?.parent = parent;
            self.unpin(old);
        }
        Some(())
    }

    pub fn pin(&mut self, ino: u64) -> Option<()> {
        let node = self.nodes.get_mut(&ino)?;
        node.pins = node.pins.checked_add(1)?;
        Some(())
    }
    pub fn unpin(&mut self, ino: u64) {
        if let Some(node) = self.nodes.get_mut(&ino) {
            node.pins = node.pins.saturating_sub(1);
        }
        self.collect(ino);
    }
    pub fn forget(&mut self, ino: u64, count: u64) {
        if let Some(node) = self.nodes.get_mut(&ino) {
            node.lookups = node.lookups.saturating_sub(count);
        }
        self.collect(ino);
    }
    fn collect(&mut self, mut ino: u64) {
        while ino != ROOT
            && self
                .nodes
                .get(&ino)
                .is_some_and(|n| n.lookups == 0 && n.pins == 0)
        {
            let Some(node) = self.nodes.remove(&ino) else {
                break;
            };
            self.identities.remove(&(node.object, node.anchor));
            ino = node.parent;
            if let Some(parent) = self.nodes.get_mut(&ino) {
                parent.pins = parent.pins.saturating_sub(1);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn aliases_keep_virtual_parents_and_reclaim_ancestry() -> anyhow::Result<()> {
        let mut t = Inodes::default();
        let shared = t
            .lookup(ROOT, "shared")
            .ok_or_else(|| anyhow::anyhow!("shared"))?;
        let alias = t
            .lookup(shared, "a")
            .ok_or_else(|| anyhow::anyhow!("alias"))?;
        let canonical = t
            .lookup(ROOT, "a")
            .ok_or_else(|| anyhow::anyhow!("canonical"))?;
        assert_ne!(alias, canonical);
        assert_eq!(t.node(alias).map(|n| n.parent), Some(shared));
        t.pin(alias);
        t.forget(shared, 1);
        t.forget(alias, 1);
        assert!(t.node(shared).is_some());
        t.unpin(alias);
        assert!(t.node(alias).is_none());
        assert!(t.node(shared).is_none());
        t.forget(canonical, 1);
        assert_eq!(t.nodes.len(), 1);
        let fresh = t
            .lookup(ROOT, "a")
            .ok_or_else(|| anyhow::anyhow!("fresh"))?;
        assert!(fresh > canonical);
        Ok(())
    }
    #[test]
    fn move_preserves_live_inode_and_rejects_parent_cycles() -> anyhow::Result<()> {
        let mut t = Inodes::default();
        let a = t.lookup(ROOT, "a").ok_or_else(|| anyhow::anyhow!("a"))?;
        let b = t.lookup(ROOT, "b").ok_or_else(|| anyhow::anyhow!("b"))?;
        let c = t.lookup(a, "c").ok_or_else(|| anyhow::anyhow!("c"))?;
        assert_eq!(t.lookup(b, "c"), Some(c));
        assert_eq!(t.node(c).map(|n| n.parent), Some(b));
        assert!(t.reparent(b, c).is_none());
        Ok(())
    }
}
