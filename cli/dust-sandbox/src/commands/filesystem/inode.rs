use std::io;

use super::errno;

#[cfg(target_os = "linux")]
pub(super) use fuser::INodeNo;

// The store also compiles on developer Macs, where fuser requires macFUSE.
// Keep the same tiny value type there so the mapping tests need no host mount.
#[cfg(not(target_os = "linux"))]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub(super) struct INodeNo(pub u64);

#[cfg(not(target_os = "linux"))]
impl INodeNo {
    pub const ROOT: Self = Self(1);
}

// FUSE owns inode 1 for the mounted root. PostgreSQL can also allocate row 1,
// so expose that one row under an otherwise-invalid signed BIGINT value.
const DATABASE_NODE_ONE_INODE: INodeNo = INodeNo(0x8000_0000_0000_0001);
const MAX_DATABASE_NODE_ID: u64 = i64::MAX as u64;

// The `conversation` and `pod` links exist only in this daemon, so they take
// numbers above every valid database ID. Linux needs a separate inode for each
// name it sees: giving a link the number of the directory it points to would
// make the kernel move that directory between the two names.
pub(super) const CONVERSATION_LINK_INODE: INodeNo = INodeNo(0x8000_0000_0000_0002);
pub(super) const POD_LINK_INODE: INodeNo = INodeNo(0x8000_0000_0000_0003);

pub(super) fn inode_for_node_id(node_id: u64) -> io::Result<INodeNo> {
    match node_id {
        1 => Ok(DATABASE_NODE_ONE_INODE),
        2..=MAX_DATABASE_NODE_ID => Ok(INodeNo(node_id)),
        _ => Err(errno(libc::EIO)),
    }
}

pub(super) fn node_id_for_inode(inode: INodeNo) -> io::Result<u64> {
    match inode {
        DATABASE_NODE_ONE_INODE => Ok(1),
        INodeNo(2..=MAX_DATABASE_NODE_ID) => Ok(inode.0),
        _ => Err(errno(libc::EINVAL)),
    }
}

#[cfg(test)]
mod tests {
    use super::{inode_for_node_id, node_id_for_inode, INodeNo, DATABASE_NODE_ONE_INODE};

    #[test]
    fn database_node_one_uses_the_reserved_inode() {
        assert_eq!(inode_for_node_id(1).ok(), Some(DATABASE_NODE_ONE_INODE));
        assert_eq!(node_id_for_inode(DATABASE_NODE_ONE_INODE).ok(), Some(1));
    }

    #[test]
    fn ordinary_database_ids_are_unchanged() {
        for node_id in [2, 1_u64 << 32, i64::MAX as u64] {
            let inode = inode_for_node_id(node_id).expect("valid database node ID");
            assert_eq!(inode, INodeNo(node_id));
            assert_eq!(node_id_for_inode(inode).ok(), Some(node_id));
        }
    }

    #[test]
    fn invalid_database_ids_are_rejected() {
        assert!(inode_for_node_id(0).is_err());
        assert!(inode_for_node_id(i64::MAX as u64 + 1).is_err());
    }

    #[test]
    fn fuse_only_and_unknown_high_inodes_are_rejected() {
        for inode in [
            INodeNo(0),
            INodeNo::ROOT,
            INodeNo(0x8000_0000_0000_0000),
            INodeNo(u64::MAX),
        ] {
            assert!(node_id_for_inode(inode).is_err());
        }
    }

    #[test]
    fn root_link_inodes_belong_to_no_database_row() {
        for inode in [
            super::CONVERSATION_LINK_INODE,
            super::POD_LINK_INODE,
            DATABASE_NODE_ONE_INODE,
        ] {
            assert_ne!(inode, INodeNo::ROOT);
        }
        assert_ne!(super::CONVERSATION_LINK_INODE, super::POD_LINK_INODE);
        assert!(node_id_for_inode(super::CONVERSATION_LINK_INODE).is_err());
        assert!(node_id_for_inode(super::POD_LINK_INODE).is_err());
    }
}
