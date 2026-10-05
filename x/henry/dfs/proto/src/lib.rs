//! Wire protocol between dfs-mount and dfs-server: one TCP connection per mount session carrying
//! length-prefixed postcard frames. Calls are multiplexed by id; the server pushes invalidations.

use serde::{Deserialize, Serialize};

pub mod client;
pub mod frame;

pub const PROTOCOL_VERSION: u32 = 1;
pub const BLOCK_BYTES: u64 = 64 << 10;
/// Largest read the server answers in one call and largest write batch in one flush frame.
pub const MAX_IO_BYTES: u32 = 4 << 20;
pub const MAX_NAME_BYTES: usize = 255;
/// Keeps every block index inside `u32`.
pub const MAX_FILE_BYTES: u64 = 1 << 40;
/// Most distinct blocks one flush may touch (8 MiB once expanded); the mount flushes earlier.
pub const MAX_FLUSH_BLOCKS: usize = 128;

pub type Id = u64;
pub const ROOT: Id = 1;

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    File,
    Dir,
    Symlink,
}

/// POSIX errno value; the mount hands it to the kernel unchanged.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct Errno(pub i32);

impl Errno {
    pub const EPERM: Errno = Errno(1);
    pub const ENOENT: Errno = Errno(2);
    pub const EIO: Errno = Errno(5);
    pub const EAGAIN: Errno = Errno(11);
    pub const EACCES: Errno = Errno(13);
    pub const EEXIST: Errno = Errno(17);
    pub const EXDEV: Errno = Errno(18);
    pub const ENOTDIR: Errno = Errno(20);
    pub const EISDIR: Errno = Errno(21);
    pub const EINVAL: Errno = Errno(22);
    pub const EFBIG: Errno = Errno(27);
    pub const ENOSPC: Errno = Errno(28);
    pub const ENAMETOOLONG: Errno = Errno(36);
    pub const ENOTEMPTY: Errno = Errno(39);
    pub const ELOOP: Errno = Errno(40);
    pub const EOPNOTSUPP: Errno = Errno(95);
    pub const ESTALE: Errno = Errno(116);
}

/// Attributes of one object as seen by the calling session.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Attr {
    pub id: Id,
    pub kind: Kind,
    pub mode: u32,
    pub size: u64,
    pub mtime_ns: i64,
    pub ctime_ns: i64,
    /// Content revision; changes whenever bytes change.
    pub rev: u64,
    /// Whether the calling session may write this object (grants + boundaries).
    pub writable: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Entry {
    pub name: String,
    pub attr: Attr,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum Right {
    Read,
    Write,
    Manage,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum Request {
    /// First call on a connection. Authenticates the token and opens a lease session.
    Hello { version: u32, token: String, root: Option<Id> },
    Renew,
    /// The mount has dropped every cache: release the session's leases now.
    Close,
    Lookup { parent: Id, name: String },
    GetAttr { id: Id },
    /// Lists `dir` after `after` (exclusive) with attributes of every child.
    ReadDir { dir: Id, after: Option<String>, limit: u32 },
    Read { id: Id, offset: u64, len: u32 },
    ReadLink { id: Id },
    Create { parent: Id, name: String, kind: Kind, mode: u32, exclusive: bool, target: Option<String> },
    /// Publishes buffered writes and buffered times of one file in one durable transaction.
    Flush { id: Id, writes: Vec<(u64, Vec<u8>)>, mtime_ns: Option<i64> },
    SetAttr { id: Id, mode: Option<u32>, size: Option<u64>, mtime_ns: Option<i64> },
    Remove { parent: Id, name: String, dir: bool },
    Rename { parent: Id, name: String, new_parent: Id, new_name: String, no_replace: bool },
    /// Tenant administration; requires a tenant-administrator session.
    Grant { id: Id, principal: String, right: Right, granted: bool },
    SetBoundary { id: Id, boundary: bool },
    SetMembers { group: String, members: Vec<String> },
    CreateToken { principal: String, admin: bool },
}

impl Request {
    /// Mutations carry a session sequence number and write a durable receipt.
    pub fn is_mutation(&self) -> bool {
        matches!(
            self,
            Request::Create { .. }
                | Request::Flush { .. }
                | Request::SetAttr { .. }
                | Request::Remove { .. }
                | Request::Rename { .. }
                | Request::Grant { .. }
                | Request::SetBoundary { .. }
                | Request::SetMembers { .. }
                | Request::CreateToken { .. }
        )
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum Response {
    /// `root` is absent for tenant-administrator sessions, which have no data access.
    Session { session: u128, lease_ms: u64, root: Option<Attr> },
    Renewed { lease_ms: u64 },
    /// `None` is a negative entry, covered by the directory lease like a positive one.
    Entry(Option<Attr>),
    Attr(Attr),
    Listing { dir: Attr, entries: Vec<Entry>, more: bool },
    Data { rev: u64, size: u64, bytes: Vec<u8> },
    Link(String),
    /// `existed` is set when a non-exclusive create found a file already bound to the name.
    Created { attr: Attr, parent_mtime_ns: i64, existed: bool },
    Done,
    Token(String),
}

/// What a holder must stop trusting.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum Invalidation {
    /// Attributes and content of an object.
    Node(Id),
    /// One name in a directory (positive or negative), plus the directory's attributes.
    Name { parent: Id, name: String },
    /// Everything: authorization-shaping change (grant, boundary, membership, directory move).
    All,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum ClientFrame {
    Call { id: u64, seq: u64, request: Request },
    Ack { invalidation: u64 },
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum ServerFrame {
    /// `invalidations` lists what the call changed, for the caller's own caches. `cacheable` is
    /// false when the returned state may already be stale and must not be cached.
    Reply { id: u64, result: Result<Response, Errno>, invalidations: Vec<Invalidation>, cacheable: bool },
    Invalidate { invalidation: u64, items: Vec<Invalidation> },
}
