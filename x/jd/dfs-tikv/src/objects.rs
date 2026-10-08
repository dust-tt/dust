use crate::cache::{CacheStats, Digest};
use crate::store::{Error, Result};
use bincode::Options;
use serde::{Serialize, de::DeserializeOwned};
use sha2::{Digest as _, Sha256};

#[derive(Debug, Clone, Copy, Serialize)]
pub struct IoStats {
    pub object_reads: u64,
    pub object_writes: u64,
    pub root_reads: u64,
    pub root_cas: u64,
    pub transaction_snapshots: u64,
    pub transaction_commits: u64,
    pub transaction_conflicts: u64,
    pub cache: CacheStats,
}

pub fn hash(bytes: &[u8]) -> Digest {
    Sha256::digest(bytes).into()
}

pub fn hex(bytes: &[u8]) -> String {
    const DIGITS: &[u8] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);
    for &byte in bytes {
        output.push(char::from(DIGITS[usize::from(byte >> 4)]));
        output.push(char::from(DIGITS[usize::from(byte & 15)]));
    }
    output
}

pub fn encode<T: Serialize>(value: &T, limit: usize) -> Result<Vec<u8>> {
    Ok(bincode::DefaultOptions::new()
        .with_fixint_encoding()
        .with_limit(limit as u64)
        .serialize(value)?)
}

pub fn decode<T: DeserializeOwned>(bytes: &[u8], limit: usize) -> Result<T> {
    if bytes.len() > limit {
        return Err(Error::Capacity("encoded object"));
    }
    Ok(bincode::DefaultOptions::new()
        .with_fixint_encoding()
        .with_limit(limit as u64)
        .reject_trailing_bytes()
        .deserialize(bytes)?)
}
