use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::time::{SystemTime, UNIX_EPOCH};

pub type Id = String;
pub const READ: u16 = 1;
pub const WRITE: u16 = 2;
pub const LIST: u16 = 4;
pub const TRAVERSE: u16 = 8;
pub const CREATE: u16 = 16;
pub const DELETE: u16 = 32;
pub const RENAME: u16 = 64;
pub const GRANT: u16 = 128;
pub const ALL: u16 = 255;
pub const CHUNK_BYTES: usize = 64 * 1024;
pub const MAX_IO_BYTES: usize = 1024 * 1024;
pub const MAX_BATCH_BYTES: usize = 2 * 1024 * 1024;
pub const MAX_BATCH_NODES: usize = 128;
pub const MAX_MESSAGE_BYTES: usize = 4 * 1024 * 1024;

pub fn id() -> Id {
    uuid::Uuid::new_v4().simple().to_string()
}
pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[derive(Debug, Clone, Serialize, Deserialize, thiserror::Error, PartialEq, Eq)]
#[error("{code}: {message}")]
pub struct Error {
    pub code: i32,
    pub message: String,
}
pub type Result<T> = std::result::Result<T, Error>;
pub fn err(code: i32, message: impl Into<String>) -> Error {
    Error {
        code,
        message: message.into(),
    }
}
impl From<bincode::Error> for Error {
    fn from(value: bincode::Error) -> Self {
        err(libc::EIO, value.to_string())
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum Kind {
    File,
    Directory,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Node {
    pub id: Id,
    pub parent: Option<Id>,
    pub name: String,
    pub kind: Kind,
    pub version: Id,
    pub entry_token: Id,
    pub size: u64,
    pub mode: u32,
    pub mtime_ms: u64,
    pub unlinked: bool,
}
impl Node {
    pub fn retained_bytes(&self) -> usize {
        std::mem::size_of::<Self>()
            + self.id.capacity()
            + self.parent.as_ref().map_or(0, String::capacity)
            + self.name.capacity()
            + self.version.capacity()
            + self.entry_token.capacity()
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Entry {
    pub node: Id,
    pub token: Id,
}
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Manifest {
    pub size: u64,
    pub chunks: BTreeMap<u64, Id>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chunk {
    #[serde(with = "serde_bytes")]
    pub bytes: Vec<u8>,
    #[serde(with = "serde_bytes")]
    pub checksum: Vec<u8>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct State {
    pub schema: u32,
    pub root: Id,
    pub head: u64,
    pub auth_generation: u64,
    pub journal_floor: u64,
    pub retained_bytes: u64,
    pub node_count: u64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Credential {
    pub token_hash: String,
    pub tenant: Id,
    pub issuer: String,
    pub subject: String,
    pub principal: Id,
    pub admin: bool,
    pub scope: Option<Id>,
    pub expires_ms: u64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: Id,
    pub tenant: Id,
    pub principal: Id,
    pub admin: bool,
    pub scope: Option<Id>,
    pub incarnation: Id,
    pub expires_ms: u64,
    pub retry_epoch: Id,
    pub retry_expires_ms: u64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Mutation {
    Create {
        parent: Id,
        name: String,
        kind: Kind,
        mode: u32,
    },
    Write {
        node: Id,
        base: Id,
        offset: u64,
        #[serde(with = "serde_bytes")]
        data: Vec<u8>,
        append: bool,
        handle: Option<Id>,
    },
    Truncate {
        node: Id,
        base: Id,
        size: u64,
        handle: Option<Id>,
    },
    SetAttr {
        node: Id,
        base: Id,
        mode: Option<u32>,
        mtime_ms: Option<u64>,
        handle: Option<Id>,
    },
    Unlink {
        parent: Id,
        name: String,
        expected: Id,
        directory: bool,
    },
    Rename {
        parent: Id,
        name: String,
        expected: Id,
        new_parent: Id,
        new_name: String,
        destination: Option<Id>,
    },
    Grant {
        node: Id,
        subject: Id,
        verbs: u16,
    },
    Member {
        group: Id,
        principal: Id,
        present: bool,
    },
    PutFiles {
        files: Vec<FileUpdate>,
    },
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileUpdate {
    pub node: Node,
    pub base: Option<Id>,
    #[serde(with = "serde_bytes")]
    pub data: Vec<u8>,
}

pub fn validate_file_updates(files: &[FileUpdate]) -> Result<()> {
    let mut identities = std::collections::BTreeSet::new();
    let mut names = std::collections::BTreeSet::new();
    let mut bytes = 0usize;
    if files.is_empty() || files.len() > MAX_BATCH_NODES {
        return Err(err(libc::E2BIG, "file batch count"));
    }
    for file in files {
        let node = &file.node;
        bytes = bytes.saturating_add(file.data.len());
        if bytes > MAX_BATCH_BYTES
            || node.size != file.data.len() as u64
            || (node.kind == Kind::Directory && node.size != 0)
            || node.unlinked
            || node.parent.is_none()
            || node.mode & !0o777 != 0
            || [&node.id, &node.version]
                .iter()
                .any(|id| id.len() != 32 || !id.bytes().all(|c| c.is_ascii_hexdigit()))
            || node.entry_token.is_empty()
            || node.entry_token.len() > 128
            || (file.base.is_none()
                && (node.entry_token.len() != 32
                    || !node.entry_token.bytes().all(|c| c.is_ascii_hexdigit())))
            || !identities.insert(node.id.clone())
            || !names.insert((node.parent.clone(), node.name.clone()))
            || file.base.as_ref() == Some(&node.version)
        {
            return Err(err(libc::EINVAL, "invalid file batch"));
        }
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RequestId {
    pub id: Id,
    pub epoch: Id,
    pub incarnation: Id,
    pub expires_ms: u64,
}
impl Session {
    pub fn request_id(&self) -> RequestId {
        RequestId {
            id: id(),
            epoch: self.retry_epoch.clone(),
            incarnation: self.incarnation.clone(),
            expires_ms: self.retry_expires_ms,
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Outcome {
    pub head: u64,
    pub node: Option<Node>,
    pub written: u32,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PublicationId {
    pub tenant: Id,
    pub request: RequestId,
    pub digest: [u8; 32],
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PublicationReceipt {
    pub publication: PublicationId,
    pub tenant_head: u64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Publication {
    pub outcome: Outcome,
    pub receipt: PublicationReceipt,
}
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum DurabilityLevel {
    Local,
    Quorum,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistenceConfirmation {
    pub incarnation: Id,
    pub engine_prefix: u64,
    pub level: DurabilityLevel,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetryRecord {
    pub principal: Id,
    pub hash: Vec<u8>,
    pub expires_ms: u64,
    pub outcome: Outcome,
    pub targets: Vec<Id>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Change {
    pub head: u64,
    pub node: Option<Id>,
    pub reset: bool,
    pub time_ms: u64,
    pub old_parent: Option<Id>,
    pub old_name: Option<String>,
    pub new_parent: Option<Id>,
    pub new_name: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ViewNode {
    pub node: Node,
    pub visible_parent: Option<Id>,
    pub visible_name: String,
    pub verbs: u16,
}
impl ViewNode {
    pub fn namespace_bytes(&self) -> usize {
        2 * (self.node.retained_bytes() + std::mem::size_of::<Self>() - std::mem::size_of::<Node>()
            + self.visible_parent.as_ref().map_or(0, String::capacity)
            + self.visible_name.capacity())
            + 2 * self.node.id.capacity()
            + self.visible_parent.as_ref().map_or(0, String::capacity)
            + self.visible_name.capacity()
            + 256
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct View {
    pub incarnation: Id,
    pub head: u64,
    pub auth_generation: u64,
    pub nodes: Vec<ViewNode>,
}
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Metrics {
    pub published: u64,
    pub persisted: u64,
    pub pending_bytes: u64,
    pub persistence_age_ms: u64,
    pub retained_bytes: u64,
    pub storage_error: Option<String>,
    pub live_sst_bytes: u64,
    pub pending_compaction_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Call {
    Changes {
        cursor: Cursor,
    },
    Login {
        token: String,
    },
    Logout,
    Head,
    Metrics,
    Stat {
        node: Id,
        handle: Option<Id>,
    },
    Lookup {
        parent: Id,
        name: String,
    },
    Read {
        node: Id,
        version: Option<Id>,
        offset: u64,
        size: u32,
        handle: Option<Id>,
    },
    ReadPack {
        ranges: Vec<ReadRange>,
    },
    Open {
        node: Id,
        write: bool,
    },
    Close {
        handle: Id,
    },
    Mutate {
        request: RequestId,
        mutation: Mutation,
    },
    Barrier,
    BeginIndexSnapshot {
        after: Option<IndexBoundary>,
    },
    ListIndexNodes {
        lease: Id,
        offset: u32,
    },
    ReadIndexContent {
        lease: Id,
        node: Id,
        offset: u64,
        size: u32,
    },
    EndIndexSnapshot {
        lease: Id,
    },
    ListIndexGrants {
        lease: Id,
        offset: u32,
    },
    SearchGrants,
    ValidateSearch {
        nodes: Vec<Id>,
    },
    SearchContext {
        indexed: IndexBoundary,
    },
    RenewIndexSnapshot {
        lease: Id,
    },
    CheckSession,
    ResolvePublication {
        publication: PublicationId,
    },
    PersistThrough {
        receipt: PublicationReceipt,
        level: DurabilityLevel,
    },
    OpenWriteback {
        node: Id,
        request: Id,
    },
    RenewWriteback {
        handle: Id,
    },
    ReadBlocks {
        ranges: Vec<BlockRead>,
    },
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WriterLease {
    pub generation: Id,
    pub expires_ms: u64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WritebackHandle {
    pub handle: Id,
    pub node: Node,
    pub lease: WriterLease,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadRange {
    pub node: Id,
    pub version: Id,
    pub offset: u64,
    pub size: u32,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Envelope {
    pub session: Id,
    pub call: Call,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Reply {
    Delta(Delta),
    Session(Session),
    Unit,
    Head {
        head: u64,
        auth_generation: u64,
        incarnation: Id,
    },
    Metrics(Metrics),
    Node(Node),
    Lookup(Node, Entry),
    Data(#[serde(with = "serde_bytes")] Vec<u8>),
    Pack(#[serde(with = "byte_packs")] Vec<Vec<u8>>),
    Handle(Id, Node),
    Outcome(Outcome),
    IndexSnapshot(IndexSnapshot),
    IndexNodes(Vec<Node>),
    IndexGrants(Vec<IndexGrant>),
    SearchGrants(SearchGrants),
    SearchNodes(View),
    SearchContext(SearchContext),
    IndexLeaseExpiry(u64),
    Publication(Option<Publication>),
    Persisted(PersistenceConfirmation),
    WritebackHandle(WritebackHandle),
    WriterLease(WriterLease),
    Blocks(Vec<Result<BlockPage>>),
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SnapshotPart {
    Begin {
        incarnation: Id,
        head: u64,
        auth_generation: u64,
    },
    Nodes(Vec<ViewNode>),
    End,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Cursor {
    pub incarnation: Id,
    pub head: u64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Delta {
    pub incarnation: Id,
    pub from_head: u64,
    pub head: u64,
    pub auth_generation: u64,
    pub reset: bool,
    pub upserts: Vec<ViewNode>,
    pub removed: Vec<Id>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexSnapshot {
    pub lease: Id,
    pub tenant: Id,
    pub cursor: IndexBoundary,
    pub expires_ms: u64,
    pub reset: bool,
    pub changes: Vec<Change>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexBoundary {
    pub tenant: Id,
    pub incarnation: Id,
    pub head: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct IndexGrant {
    pub node: Id,
    pub token: Id,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchGrants {
    pub incarnation: Id,
    pub head: u64,
    pub auth_generation: u64,
    pub namespace_head: u64,
    pub admin: bool,
    pub scope: Option<Id>,
    pub metadata: Vec<Id>,
    pub read: Vec<Id>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchContext {
    pub grants: SearchGrants,
    pub roots: BTreeMap<Id, Id>,
    pub excluded: Vec<Id>,
    pub complete: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchNamespaceChange {
    pub previous: u64,
    pub roots: Vec<Id>,
}

pub const MAX_BLOCK_REQUESTS: usize = 16;
pub const MAX_READ_BLOCKS: usize = 32;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockRead {
    pub node: Id,
    pub version: Id,
    pub offset: u64,
    pub size: u32,
    pub handle: Option<Id>,
    pub known: Vec<Id>,
}

impl BlockRead {
    pub fn block_count(&self) -> Result<usize> {
        if self.size as usize > MAX_IO_BYTES
            || self.node.len() > 128
            || self.version.len() > 128
            || self.handle.as_ref().is_some_and(|h| h.len() > 256)
            || self.known.len() > MAX_READ_BLOCKS
            || self.known.iter().any(|h| {
                h.len() != 64
                    || !h
                        .bytes()
                        .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
            })
        {
            return Err(err(libc::E2BIG, "block request capacity"));
        }
        self.offset
            .checked_add(u64::from(self.size))
            .ok_or_else(|| err(libc::EINVAL, "block range overflow"))?;
        Ok(if self.size == 0 {
            0
        } else {
            ((self.offset % CHUNK_BYTES as u64 + u64::from(self.size) - 1) / CHUNK_BYTES as u64 + 1)
                as usize
        })
    }
}

pub fn validate_block_reads(ranges: &[BlockRead]) -> Result<()> {
    if ranges.is_empty() || ranges.len() > MAX_BLOCK_REQUESTS {
        return Err(err(libc::E2BIG, "block batch capacity"));
    }
    let mut count = 0;
    for range in ranges {
        count += range.block_count()?;
        if count > MAX_READ_BLOCKS {
            return Err(err(libc::E2BIG, "block batch bytes"));
        }
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockPage {
    pub node: Id,
    pub version: Id,
    pub size: u64,
    pub first: u64,
    pub hashes: Vec<Option<Id>>,
    #[serde(with = "byte_chunks")]
    pub chunks: Vec<(Id, Vec<u8>)>,
}

mod byte_packs {
    use serde::{Deserialize, Deserializer, Serializer};
    pub fn serialize<S: Serializer>(values: &[Vec<u8>], serializer: S) -> Result<S::Ok, S::Error> {
        serializer.collect_seq(values.iter().map(|value| serde_bytes::Bytes::new(value)))
    }
    pub fn deserialize<'de, D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Vec<Vec<u8>>, D::Error> {
        Ok(Vec::<serde_bytes::ByteBuf>::deserialize(deserializer)?
            .into_iter()
            .map(serde_bytes::ByteBuf::into_vec)
            .collect())
    }
}

mod byte_chunks {
    use serde::{Deserialize, Deserializer, Serializer};
    pub fn serialize<S: Serializer>(
        values: &[(String, Vec<u8>)],
        serializer: S,
    ) -> Result<S::Ok, S::Error> {
        serializer.collect_seq(
            values
                .iter()
                .map(|(id, value)| (id, serde_bytes::Bytes::new(value))),
        )
    }
    pub fn deserialize<'de, D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Vec<(String, Vec<u8>)>, D::Error> {
        Ok(
            Vec::<(String, serde_bytes::ByteBuf)>::deserialize(deserializer)?
                .into_iter()
                .map(|(id, value)| (id, value.into_vec()))
                .collect(),
        )
    }
}
