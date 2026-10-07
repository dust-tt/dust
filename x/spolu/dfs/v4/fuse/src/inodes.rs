use std::collections::{BTreeSet, HashMap};

pub const ROOT: u64 = 1;
const MAX_INODES: usize = 1_000_000;

#[derive(Clone)]
pub struct Node<T = ()> {
    pub object: String,
    pub parent: u64,
    anchor: String,
    lookups: u64,
    pins: u64,
    pub value: T,
}

/// @cc [owner:spolu,label:security] mount-inode-identity
/// Directory inodes MUST retain their visible projection, never a canonical hidden parent.
/// Regular-file aliases MUST share one inode identity within the mount.
/// Keep parents alive while children or handles reference them, reclaim forgotten nodes, and never
/// recycle inode numbers during a mount. This table stores identity, not cached authorization.
pub struct Inodes<T = ()> {
    nodes: HashMap<u64, Node<T>>,
    identities: HashMap<(String, String), u64>,
    aliases: HashMap<String, BTreeSet<u64>>,
    next: u64,
}

impl Default for Inodes {
    fn default() -> Self {
        Self::new(())
    }
}

impl<T: Clone> Inodes<T> {
    pub fn new(root: T) -> Self {
        Self {
            nodes: HashMap::from([(
                ROOT,
                Node {
                    object: "root".into(),
                    parent: ROOT,
                    anchor: "root".into(),
                    lookups: 1,
                    pins: 0,
                    value: root,
                },
            )]),
            identities: HashMap::from([(("root".into(), "root".into()), ROOT)]),
            aliases: HashMap::from([("root".into(), BTreeSet::from([ROOT]))]),
            next: 2,
        }
    }
    pub fn node(&self, ino: u64) -> Option<Node<T>> {
        self.nodes.get(&ino).cloned()
    }

    fn identity(&self, parent: u64, object: &str, file: bool) -> Option<(String, String)> {
        let parent = self.nodes.get(&parent)?;
        let anchor = if file {
            "file"
        } else if parent.object == "shared" {
            object
        } else {
            &parent.anchor
        };
        Some((object.into(), anchor.into()))
    }

    pub fn existing(&self, parent: u64, object: &str, file: bool) -> Option<u64> {
        self.identities
            .get(&self.identity(parent, object, file)?)
            .copied()
    }

    pub fn aliases(&self, object: &str) -> Vec<u64> {
        self.aliases
            .get(object)
            .map_or_else(Vec::new, |ids| ids.iter().copied().collect())
    }

    pub fn value(&self, object: &str) -> Option<T> {
        let ino = self.aliases.get(object)?.first()?;
        Some(self.nodes.get(ino)?.value.clone())
    }

    pub fn lookup(&mut self, parent: u64, object: &str, file: bool, value: T) -> Option<u64> {
        let identity = self.identity(parent, object, file)?;
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
                value,
            },
        );
        self.identities.insert(identity, ino);
        self.aliases.entry(object.into()).or_default().insert(ino);
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
            self.identities.remove(&(node.object.clone(), node.anchor));
            if let Some(ids) = self.aliases.get_mut(&node.object) {
                ids.remove(&ino);
                if ids.is_empty() {
                    self.aliases.remove(&node.object);
                }
            }
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
    fn file_aliases_share_identity_while_directories_keep_visible_parents() -> anyhow::Result<()> {
        let mut t = Inodes::default();
        let shared = t
            .lookup(ROOT, "shared", false, ())
            .ok_or_else(|| anyhow::anyhow!("shared"))?;
        let a = t
            .lookup(ROOT, "directory", false, ())
            .ok_or_else(|| anyhow::anyhow!("directory"))?;
        let b = t
            .lookup(shared, "directory", false, ())
            .ok_or_else(|| anyhow::anyhow!("alias"))?;
        assert_ne!(a, b);
        let file = t
            .lookup(a, "file", true, ())
            .ok_or_else(|| anyhow::anyhow!("file"))?;
        assert_eq!(t.lookup(b, "file", true, ()), Some(file));
        assert_eq!(t.aliases("file"), vec![file]);
        t.forget(file, 1);
        assert!(t.node(file).is_some());
        t.forget(file, 1);
        assert!(t.node(file).is_none());
        assert!(t.aliases("file").is_empty());
        assert_eq!(t.node(b).map(|n| n.parent), Some(shared));
        Ok(())
    }
    #[test]
    fn aliases_keep_virtual_parents_and_reclaim_ancestry() -> anyhow::Result<()> {
        let mut t = Inodes::default();
        let shared = t
            .lookup(ROOT, "shared", false, ())
            .ok_or_else(|| anyhow::anyhow!("shared"))?;
        let alias = t
            .lookup(shared, "a", false, ())
            .ok_or_else(|| anyhow::anyhow!("alias"))?;
        let canonical = t
            .lookup(ROOT, "a", false, ())
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
            .lookup(ROOT, "a", false, ())
            .ok_or_else(|| anyhow::anyhow!("fresh"))?;
        assert!(fresh > canonical);
        Ok(())
    }
    #[test]
    fn move_preserves_live_inode_and_rejects_parent_cycles() -> anyhow::Result<()> {
        let mut t = Inodes::default();
        let a = t
            .lookup(ROOT, "a", false, ())
            .ok_or_else(|| anyhow::anyhow!("a"))?;
        let b = t
            .lookup(ROOT, "b", false, ())
            .ok_or_else(|| anyhow::anyhow!("b"))?;
        let c = t
            .lookup(a, "c", false, ())
            .ok_or_else(|| anyhow::anyhow!("c"))?;
        assert_eq!(t.lookup(b, "c", false, ()), Some(c));
        assert_eq!(t.node(c).map(|n| n.parent), Some(b));
        assert!(t.reparent(b, c).is_none());
        Ok(())
    }
}
