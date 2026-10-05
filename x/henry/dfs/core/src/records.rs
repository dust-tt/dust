//! Logical record layout. Keys are ordered bytes; values are postcard-encoded.

use dfs_proto::{Errno, Id, Kind, Right};
use dfs_store::KeyRange;
use serde::{Deserialize, Serialize, de::DeserializeOwned};

/// Authorization epoch, bumped by every grant, boundary, membership, or directory-move change.
pub const TOPO: &[u8] = b"m/topo";
pub const NEXT_ID: &[u8] = b"m/next-id";

fn key(tag: &[u8], parts: &[&[u8]]) -> Vec<u8> {
    let mut out = tag.to_vec();
    for part in parts {
        out.extend_from_slice(part);
    }
    out
}

pub fn node(id: Id) -> Vec<u8> {
    key(b"n/", &[&id.to_be_bytes()])
}

pub fn entry(dir: Id, name: &str) -> Vec<u8> {
    key(b"e/", &[&dir.to_be_bytes(), b"/", name.as_bytes()])
}

pub fn entries(dir: Id) -> KeyRange {
    KeyRange::prefix(&key(b"e/", &[&dir.to_be_bytes(), b"/"]))
}

/// Name of the entry stored at `key`, which must come from `entries(dir)`.
pub fn entry_name(key: &[u8]) -> Result<String, Errno> {
    let name = key.get(2 + 8 + 1..).ok_or(Errno::EIO)?;
    String::from_utf8(name.to_vec()).map_err(|_| Errno::EIO)
}

/// Child-change time of a directory, maintained with blind atomic max.
pub fn dir_time(dir: Id) -> Vec<u8> {
    key(b"t/", &[&dir.to_be_bytes()])
}

pub fn block(id: Id, index: u32) -> Vec<u8> {
    key(b"b/", &[&id.to_be_bytes(), &index.to_be_bytes()])
}

/// Blocks `first..=last` of one object.
pub fn blocks(id: Id, first: u32, last: u32) -> KeyRange {
    KeyRange::new(block(id, first), KeyRange::single(&block(id, last)).end)
}

pub fn block_index(key: &[u8]) -> Result<u32, Errno> {
    let bytes = key.get(2 + 8..2 + 8 + 4).ok_or(Errno::EIO)?;
    Ok(u32::from_be_bytes(bytes.try_into().map_err(|_| Errno::EIO)?))
}

pub fn policy(id: Id) -> Vec<u8> {
    key(b"p/", &[&id.to_be_bytes()])
}

pub fn group(name: &str) -> Vec<u8> {
    key(b"g/", &[name.as_bytes()])
}

/// Membership index: `u/<principal>\0<group>`.
pub fn membership(principal: &str, group: &str) -> Vec<u8> {
    key(b"u/", &[principal.as_bytes(), b"\0", group.as_bytes()])
}

pub fn memberships(principal: &str) -> KeyRange {
    KeyRange::prefix(&key(b"u/", &[principal.as_bytes(), b"\0"]))
}

pub fn membership_group(key: &[u8], principal: &str) -> Result<String, Errno> {
    let name = key.get(2 + principal.len() + 1..).ok_or(Errno::EIO)?;
    String::from_utf8(name.to_vec()).map_err(|_| Errno::EIO)
}

pub fn token(hash: &[u8]) -> Vec<u8> {
    key(b"k/", &[hash])
}

pub fn session(session: u128) -> Vec<u8> {
    key(b"s/", &[&session.to_be_bytes()])
}

pub fn receipt(session: u128, seq: u64) -> Vec<u8> {
    key(b"r/", &[&session.to_be_bytes(), &seq.to_be_bytes()])
}

pub fn index_job(id: Id) -> Vec<u8> {
    key(b"j/i/", &[&id.to_be_bytes()])
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Node {
    pub parent: Id,
    pub name: String,
    pub kind: Kind,
    pub mode: u32,
    pub size: u64,
    pub mtime_ns: i64,
    pub ctime_ns: i64,
    /// Wall time of the last explicit mtime change; a later child change wins over it (dirs).
    pub mtime_set_ns: i64,
    pub rev: u64,
    pub target: Option<String>,
    pub policy: bool,
    pub detached: bool,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub struct EntryRecord {
    pub id: Id,
    pub kind: Kind,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct Policy {
    pub grants: Vec<(String, Right)>,
    /// Read-only boundary: write grants inherited from above stop here.
    pub boundary: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TokenRecord {
    pub principal: String,
    pub admin: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SessionRecord {
    pub principal: String,
    pub created_ns: i64,
}

pub fn encode<T: Serialize>(value: &T) -> Vec<u8> {
    // Serializing plain structs into a Vec cannot fail.
    postcard::to_stdvec(value).unwrap_or_default()
}

pub fn decode<T: DeserializeOwned>(bytes: &[u8]) -> Result<T, Errno> {
    postcard::from_bytes(bytes).map_err(|_| Errno::EIO)
}

pub fn le_u64(value: Option<&Vec<u8>>) -> u64 {
    value.and_then(|v| v.get(..8)).and_then(|b| b.try_into().ok()).map_or(0, u64::from_le_bytes)
}
