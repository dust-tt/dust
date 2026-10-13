use super::{Inodes, Node, ROOT_INO};
use dfs_protocol::ObjectId;

#[test]
fn root_and_links_have_fixed_inodes() {
    let mut inodes = Inodes::new(2);
    assert_eq!(inodes.node(ROOT_INO), Some(Node::Root));
    assert_eq!(inodes.link_ino(0), Some(2));
    assert_eq!(inodes.link_ino(1), Some(3));
    assert_eq!(inodes.link_ino(2), None);
    assert_eq!(inodes.node(2), Some(Node::Link(0)));
    assert_eq!(inodes.node(3), Some(Node::Link(1)));

    inodes.forget(ROOT_INO, 1);
    inodes.forget(2, 1);
    assert_eq!(inodes.node(ROOT_INO), Some(Node::Root));
    assert_eq!(inodes.node(2), Some(Node::Link(0)));
}

#[test]
fn objects_keep_one_inode_until_every_lookup_is_forgotten() {
    let mut inodes = Inodes::new(1);
    let id = ObjectId::new_v7();
    let other = ObjectId::new_v7();

    let ino = inodes.remember(id);
    assert_eq!(ino, 3);
    assert_eq!(inodes.remember(id), ino);
    assert_ne!(inodes.remember(other), ino);
    assert_eq!(inodes.node(ino), Some(Node::Object(id)));

    inodes.forget(ino, 1);
    assert_eq!(inodes.node(ino), Some(Node::Object(id)));
    inodes.forget(ino, 1);
    assert_eq!(inodes.node(ino), None);
}

#[test]
fn forgotten_inodes_are_never_reused() {
    let mut inodes = Inodes::new(0);
    let id = ObjectId::new_v7();
    let first = inodes.remember(id);
    inodes.forget(first, 1);

    let again = inodes.remember(id);
    let other = inodes.remember(ObjectId::new_v7());
    assert_ne!(again, first);
    assert_ne!(other, first);
    assert_eq!(inodes.node(first), None);
}

#[test]
fn unknown_inodes_and_extra_forgets_are_ignored() {
    let mut inodes = Inodes::new(0);
    assert_eq!(inodes.node(42), None);
    inodes.forget(42, 1);

    let ino = inodes.remember(ObjectId::new_v7());
    inodes.forget(ino, 5);
    assert_eq!(inodes.node(ino), None);
}
