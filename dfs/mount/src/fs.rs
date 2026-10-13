use crate::{
    errno::Errno,
    inode::{Ino, Inodes, Node, ROOT_INO},
    remote::Remote,
};
use dfs_protocol::{
    ObjectId, ObjectRef,
    rpc::{Attr, ObjectKind},
};
use std::{
    sync::Mutex,
    time::{Duration, SystemTime},
};

/// Owner read and traverse: the root is read-only.
const ROOT_PERMISSIONS: u16 = 0o500;
/// Symlink permissions are not checked by Linux; this is the conventional value.
const LINK_PERMISSIONS: u16 = 0o777;
/// The permission bits of a dfs mode.
const PERMISSION_BITS: u32 = 0o777;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Directory,
    File,
    Symlink,
}

/// Attributes of an inode, independent of the FUSE library.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Attributes {
    pub ino: Ino,
    pub kind: Kind,
    pub size: u64,
    pub permissions: u16,
    pub atime: SystemTime,
    pub mtime: SystemTime,
    pub ctime: SystemTime,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DirEntry {
    pub ino: Ino,
    pub kind: Kind,
    pub name: String,
}

/// An entry of the mount root: a symlink named `name` pointing to `target`, a
/// `<label>--<object-id>` anchor such as `conv-abc--0190c3a0b1c27d4e8f0a1b2c3d4e5f60`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Link {
    pub name: String,
    pub target: String,
}

/// The filesystem served by the mount, independent of the FUSE library. Inode numbers come from
/// and go back to the kernel; everything else is fetched from the dfs server.
pub struct Fs {
    remote: Remote,
    links: Vec<Link>,
    inodes: Mutex<Inodes>,
}

impl Fs {
    /// Fails with `EINVAL` if a link name is not a valid basename, appears twice, or if a target
    /// is not an anchor.
    pub fn new(remote: Remote, links: Vec<Link>) -> Result<Self, Errno> {
        for (index, link) in links.iter().enumerate() {
            let valid_name = !link.name.is_empty()
                && link.name != "."
                && link.name != ".."
                && !link.name.contains(['/', '\0']);
            let unique = links[..index].iter().all(|other| other.name != link.name);
            if !valid_name || !unique || anchor(&link.target).is_none() {
                return Err(Errno::EINVAL);
            }
        }
        Ok(Self {
            remote,
            inodes: Mutex::new(Inodes::new(links.len())),
            links,
        })
    }

    fn node(&self, ino: Ino) -> Result<Node, Errno> {
        self.inodes
            .lock()
            .map_err(|_| Errno::EIO)?
            .node(ino)
            .ok_or(Errno::ENOENT)
    }

    pub async fn getattr(&self, ino: Ino) -> Result<Attributes, Errno> {
        match self.node(ino)? {
            Node::Root => Ok(root_attributes()),
            Node::Link(index) => self.link_attributes(index),
            Node::Object(id) => self.stat(id).await.and_then(|attr| attributes(ino, &attr)),
        }
    }

    /**
     * @cc [owner:fontanierh,label:product;security] anchor-lookup
     * At the root, a name that is not a link and reads as `<label>--<object-id>` or a bare object
     * ID MUST resolve to that object, ignoring the label. The session's grants are the only access
     * check: an object the session cannot read MUST look missing (`ENOENT`).
     */
    /// Each successful lookup of an object counts as one kernel reference, released by `forget`.
    pub async fn lookup(&self, parent: Ino, name: &str) -> Result<Attributes, Errno> {
        match self.node(parent)? {
            Node::Root => {}
            Node::Link(_) => return Err(Errno(libc::ENOTDIR)),
            // Lookups inside dfs directories need the `Lookup` RPC.
            Node::Object(_) => return Err(Errno::EOPNOTSUPP),
        }
        if let Some(index) = self.links.iter().position(|link| link.name == name) {
            return self.link_attributes(index);
        }
        let id = anchor(name).ok_or(Errno::ENOENT)?;
        let attr = self.stat(id).await?;
        let ino = self.inodes.lock().map_err(|_| Errno::EIO)?.remember(id);
        attributes(ino, &attr)
    }

    pub fn readlink(&self, ino: Ino) -> Result<String, Errno> {
        match self.node(ino)? {
            Node::Link(index) => self
                .links
                .get(index)
                .map(|link| link.target.clone())
                .ok_or(Errno::EIO),
            Node::Root | Node::Object(_) => Err(Errno::EINVAL),
        }
    }

    /**
     * @cc [owner:fontanierh,label:product] synthetic-root
     * The root MUST list only the configured links. It is read-only and stores nothing on the
     * server. Anchors reached by `anchor-lookup` stay unlisted.
     */
    pub async fn readdir(&self, ino: Ino) -> Result<Vec<DirEntry>, Errno> {
        match self.node(ino)? {
            Node::Root => self
                .links
                .iter()
                .enumerate()
                .map(|(index, link)| {
                    Ok(DirEntry {
                        ino: self.link_ino(index)?,
                        kind: Kind::Symlink,
                        name: link.name.clone(),
                    })
                })
                .collect(),
            Node::Link(_) => Err(Errno(libc::ENOTDIR)),
            // Listing dfs directories needs the `List` RPC.
            Node::Object(_) => Err(Errno::EOPNOTSUPP),
        }
    }

    pub fn forget(&self, ino: Ino, count: u64) {
        if let Ok(mut inodes) = self.inodes.lock() {
            inodes.forget(ino, count);
        }
    }

    async fn stat(&self, id: ObjectId) -> Result<Attr, Errno> {
        self.remote
            .stat(&[ObjectRef::Object(id)])
            .await?
            .pop()
            .ok_or(Errno::EIO)?
    }

    fn link_ino(&self, index: usize) -> Result<Ino, Errno> {
        self.inodes
            .lock()
            .map_err(|_| Errno::EIO)?
            .link_ino(index)
            .ok_or(Errno::EIO)
    }

    /**
     * @cc [owner:fontanierh,label:coding] link-inodes
     * A link MUST have its own inode, never the inode of the object it points to. Linux would
     * otherwise move a directory between its two names.
     */
    fn link_attributes(&self, index: usize) -> Result<Attributes, Errno> {
        let link = self.links.get(index).ok_or(Errno::EIO)?;
        Ok(Attributes {
            ino: self.link_ino(index)?,
            kind: Kind::Symlink,
            size: link.target.len() as u64,
            permissions: LINK_PERMISSIONS,
            atime: SystemTime::UNIX_EPOCH,
            mtime: SystemTime::UNIX_EPOCH,
            ctime: SystemTime::UNIX_EPOCH,
        })
    }
}

/// Reads an anchor name, `<label>--<object-id>` or a bare object ID, as in `dfs://` URIs.
fn anchor(name: &str) -> Option<ObjectId> {
    format!("dfs://{name}").parse().ok()
}

fn root_attributes() -> Attributes {
    Attributes {
        ino: ROOT_INO,
        kind: Kind::Directory,
        size: 0,
        permissions: ROOT_PERMISSIONS,
        atime: SystemTime::UNIX_EPOCH,
        mtime: SystemTime::UNIX_EPOCH,
        ctime: SystemTime::UNIX_EPOCH,
    }
}

fn attributes(ino: Ino, attr: &Attr) -> Result<Attributes, Errno> {
    let kind = match attr.kind() {
        ObjectKind::Directory => Kind::Directory,
        ObjectKind::File => Kind::File,
        // The server never reports symlinks (`dfs-object-kind-symlink-reserved`).
        ObjectKind::Symlink => return Err(Errno::EIO),
    };
    let time = |milliseconds: Option<u64>| {
        SystemTime::UNIX_EPOCH + Duration::from_millis(milliseconds.unwrap_or_default())
    };
    Ok(Attributes {
        ino,
        kind,
        size: attr.size,
        permissions: (attr.mode & PERMISSION_BITS) as u16,
        atime: time(attr.atime),
        mtime: time(attr.mtime),
        ctime: time(attr.ctime),
    })
}
