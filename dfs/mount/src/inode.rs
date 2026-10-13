use dfs_protocol::ObjectId;
use std::collections::HashMap;

/// A FUSE inode number. dfs object IDs are 128 bits, so the mount gives each object a 64-bit number.
pub type Ino = u64;

/**
 * @cc [owner:fontanierh,label:coding] root-inode
 * Inode 1 MUST always be the mount root, as FUSE requires.
 */
pub const ROOT_INO: Ino = 1;
const FIRST_LINK_INO: Ino = 2;

/// What an inode number stands for.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Node {
    Root,
    /// The link at this index in the mount's link list.
    Link(usize),
    Object(ObjectId),
}

#[derive(Debug)]
struct Remembered {
    id: ObjectId,
    lookups: u64,
}

/// Maps inode numbers to what they stand for. The root and the links have fixed numbers; objects
/// get one when the kernel first looks them up.
#[derive(Debug)]
pub struct Inodes {
    links: usize,
    next: Ino,
    by_id: HashMap<ObjectId, Ino>,
    objects: HashMap<Ino, Remembered>,
}

/**
 * @cc [owner:fontanierh,label:coding] one-inode-per-object
 * While the kernel remembers an object, the object MUST keep the same inode number, and that number
 * MUST NOT stand for anything else.
 */
/**
 * @cc [owner:fontanierh,label:coding] no-inode-reuse
 * An inode number MUST NOT be given to a different object during the life of the mount, even after
 * the kernel forgets it.
 */
/**
 * @cc [owner:fontanierh,label:coding] forget-counts
 * Each lookup reply adds one to an object's count and `forget` removes the count the kernel gives.
 * The object MUST be dropped when its count reaches zero, and not before. The root and the links are
 * never dropped.
 */
impl Inodes {
    pub fn new(links: usize) -> Self {
        Self {
            links,
            next: FIRST_LINK_INO + links as Ino,
            by_id: HashMap::new(),
            objects: HashMap::new(),
        }
    }

    pub fn link_ino(&self, index: usize) -> Option<Ino> {
        (index < self.links).then(|| FIRST_LINK_INO + index as Ino)
    }

    pub fn node(&self, ino: Ino) -> Option<Node> {
        if ino == ROOT_INO {
            return Some(Node::Root);
        }
        if let Some(index) = ino.checked_sub(FIRST_LINK_INO)
            && (index as usize) < self.links
        {
            return Some(Node::Link(index as usize));
        }
        self.objects
            .get(&ino)
            .map(|remembered| Node::Object(remembered.id))
    }

    /// Records one lookup of `id` and returns its inode number.
    pub fn remember(&mut self, id: ObjectId) -> Ino {
        if let Some(&ino) = self.by_id.get(&id)
            && let Some(remembered) = self.objects.get_mut(&ino)
        {
            remembered.lookups += 1;
            return ino;
        }
        let ino = self.next;
        self.next += 1;
        self.by_id.insert(id, ino);
        self.objects.insert(ino, Remembered { id, lookups: 1 });
        ino
    }

    pub fn forget(&mut self, ino: Ino, count: u64) {
        let Some(remembered) = self.objects.get_mut(&ino) else {
            return;
        };
        remembered.lookups = remembered.lookups.saturating_sub(count);
        if remembered.lookups == 0 {
            let id = remembered.id;
            self.objects.remove(&ino);
            self.by_id.remove(&id);
        }
    }
}

#[cfg(test)]
#[path = "../tests/unit/inode.rs"]
mod tests;
