//! Wire protocol between dfs-mount and dfs-server: one TCP connection per mount session carrying
//! length-prefixed postcard frames. Calls are multiplexed by id.

use serde::{Deserialize, Serialize};

pub mod client;
pub mod frame;

pub const PROTOCOL_VERSION: u32 = 3;
pub const BLOCK_BYTES: u64 = 64 << 10;
/// Largest read the server answers in one call.
pub const MAX_IO_BYTES: u32 = 4 << 20;
pub const MAX_NAME_BYTES: usize = 255;
/// Keeps every block index inside `u32`.
pub const MAX_FILE_BYTES: u64 = 1 << 40;
/// Most distinct blocks one `Write` op may touch (8 MiB once expanded); the mount seals earlier.
pub const MAX_FLUSH_BLOCKS: usize = 128;
/// Most ops one `Apply` call carries.
pub const MAX_APPLY_OPS: usize = 4096;

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

/// The whole content of a file at content revision `rev`.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct File {
    pub id: Id,
    pub rev: u64,
    pub bytes: Vec<u8>,
}

/// One change to a file's content, applied in order.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum Change {
    Write { offset: u64, bytes: Vec<u8> },
    Truncate(u64),
}

/// One buffered mutation. `Apply` applies a batch in order in one transaction; an op whose
/// precondition no longer holds (another client won) fails alone and the rest still apply.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum Op {
    /// Binds the free name `name` in `parent` to new object `id`, allocated to this session.
    Create { parent: Id, name: String, id: Id, kind: Kind, mode: u32, mtime_ns: i64, target: Option<String> },
    /// Unbinds `name` from `parent` if it still names `id` (a directory must be empty).
    Remove { parent: Id, name: String, id: Id },
    /// Moves `id`, still named `name` in `parent`, to `new_name` in `new_parent`, replacing a
    /// compatible object there unless `no_replace`.
    Rename { parent: Id, name: String, id: Id, new_parent: Id, new_name: String, no_replace: bool },
    /// Content changes of file `id`, then its mtime (`None`: commit time).
    Write { id: Id, changes: Vec<Change>, mtime_ns: Option<i64> },
    SetAttr { id: Id, mode: Option<u32>, mtime_ns: Option<i64> },
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum Right {
    Read,
    Write,
    Manage,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum Request {
    /// First call on a connection. Authenticates the token and opens a session.
    Hello { version: u32, token: String, root: Option<Id> },
    Close,
    Lookup { parent: Id, name: String },
    GetAttr { id: Id },
    /// Lists `dir` after `after` (exclusive) with attributes of every child; `at` continues a
    /// listing at the version its first page was read at (`EAGAIN` once too old).
    ReadDir { dir: Id, after: Option<String>, limit: u32, at: Option<u64> },
    Read { id: Id, offset: u64, len: u32 },
    /// Whole contents of the files among `ids` that are readable and fit, in order, in `budget`
    /// bytes (at most `MAX_IO_BYTES`); the others are left out.
    ReadFiles { ids: Vec<Id>, budget: u32 },
    ReadLink { id: Id },
    /// Reserves a chunk of object ids for this principal's `Create` ops.
    AllocIds,
    /// Applies buffered mutations in order in one durable transaction.
    Apply { ops: Vec<Op> },
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
            Request::Apply { .. }
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
    Session { session: u128, root: Option<Attr> },
    /// `None`: no such name.
    Entry(Option<Attr>),
    Attr(Attr),
    Listing { dir: Attr, entries: Vec<Entry>, more: bool },
    Data { rev: u64, size: u64, bytes: Vec<u8> },
    Files(Vec<File>),
    Link(String),
    Ids { first: Id, count: u32 },
    /// Committed at `version`. `results[i]` is the failure of `ops[i]`, if it failed; `attrs` are
    /// the committed attributes of the objects the applied ops changed (removed ones excepted).
    Applied { version: u64, results: Vec<Option<Errno>>, attrs: Vec<Attr> },
    Done,
    Token(String),
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum ClientFrame {
    Call { id: u64, seq: u64, request: Request },
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum ServerFrame {
    /// `version` is the read version a read was served at (0 for other calls).
    Reply { id: u64, result: Result<Response, Errno>, version: u64 },
}
