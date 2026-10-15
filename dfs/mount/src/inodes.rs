use crate::fs::{Ino, ROOT_INO};
use dfs_protocol::ObjectId;
use std::collections::HashMap;

/// The inode numbers the kernel knows, with the number of lookups of each it has not forgotten.
///
/// The kernel counts one lookup for each reply that gives it an inode (`lookup`, and later
/// `create`, `mkdir` or `readdirplus`), never for plain `readdir` entries. The root is not in the
/// table, and pinned inodes stay whatever the kernel forgets.
pub(crate) struct Inodes {
    inodes: HashMap<Ino, Inode>,
    inos: HashMap<ObjectId, Ino>,
    next: Ino,
}

struct Inode {
    object: ObjectId,
    lookups: u64,
    pinned: bool,
}

impl Inodes {
    pub(crate) fn new() -> Self {
        Self {
            inodes: HashMap::new(),
            inos: HashMap::new(),
            next: ROOT_INO + 1,
        }
    }

    /// Gives `object` an inode number that `forget` never drops. `object` must not be in the table
    /// yet.
    pub(crate) fn pin(&mut self, object: ObjectId) -> Ino {
        let ino = self.next;
        self.next += 1;
        self.inos.insert(object, ino);
        self.inodes.insert(
            ino,
            Inode {
                object,
                lookups: 0,
                pinned: true,
            },
        );
        ino
    }

    /// Counts one lookup of `object` and returns its inode number, giving it a new one if the
    /// kernel does not know it.
    pub(crate) fn lookup(&mut self, object: ObjectId) -> Ino {
        let ino = *self.inos.entry(object).or_insert_with(|| {
            let ino = self.next;
            self.next += 1;
            ino
        });
        self.inodes
            .entry(ino)
            .or_insert(Inode {
                object,
                lookups: 0,
                pinned: false,
            })
            .lookups += 1;
        ino
    }

    pub(crate) fn object(&self, ino: Ino) -> Option<ObjectId> {
        self.inodes.get(&ino).map(|inode| inode.object)
    }

    /// Forgets `count` lookups of `ino`, and the inode itself once none is left, unless it is
    /// pinned. Ignores the root and unknown inodes.
    pub(crate) fn forget(&mut self, ino: Ino, count: u64) {
        let Some(inode) = self.inodes.get_mut(&ino) else {
            return;
        };
        inode.lookups = inode.lookups.saturating_sub(count);
        if inode.lookups == 0 && !inode.pinned {
            let object = inode.object;
            self.inodes.remove(&ino);
            self.inos.remove(&object);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_object_keeps_its_inode_until_every_lookup_is_forgotten() {
        let mut inodes = Inodes::new();
        let object = ObjectId::new_v7();
        let ino = inodes.lookup(object);
        assert_ne!(ino, ROOT_INO);
        assert_eq!(inodes.lookup(object), ino);
        assert_ne!(inodes.lookup(ObjectId::new_v7()), ino);

        inodes.forget(ino, 1);
        assert_eq!(inodes.object(ino), Some(object));
        inodes.forget(ino, 1);
        assert_eq!(inodes.object(ino), None);
    }

    #[test]
    fn a_forgotten_inode_number_is_never_reused() {
        let mut inodes = Inodes::new();
        let object = ObjectId::new_v7();
        let ino = inodes.lookup(object);
        inodes.forget(ino, 1);
        assert_ne!(inodes.lookup(object), ino);
        assert_ne!(inodes.lookup(ObjectId::new_v7()), ino);
    }

    #[test]
    fn forgetting_more_lookups_than_counted_drops_the_inode() {
        let mut inodes = Inodes::new();
        let ino = inodes.lookup(ObjectId::new_v7());
        inodes.forget(ino, 2);
        assert_eq!(inodes.object(ino), None);
    }

    #[test]
    fn a_pinned_inode_is_never_dropped() {
        let mut inodes = Inodes::new();
        let object = ObjectId::new_v7();
        let ino = inodes.pin(object);
        assert_ne!(ino, ROOT_INO);
        assert_eq!(inodes.lookup(object), ino);
        inodes.forget(ino, 2);
        assert_eq!(inodes.object(ino), Some(object));
        assert_eq!(inodes.lookup(object), ino);
    }

    #[test]
    fn forgetting_the_root_or_an_unknown_inode_does_nothing() {
        let mut inodes = Inodes::new();
        let object = ObjectId::new_v7();
        let ino = inodes.lookup(object);
        inodes.forget(ROOT_INO, 1);
        inodes.forget(ino + 1, 1);
        assert_eq!(inodes.object(ino), Some(object));
    }
}
