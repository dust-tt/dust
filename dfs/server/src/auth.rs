use std::fmt;

use ring::rand::{SecureRandom, SystemRandom};
use sha2::{Digest, Sha256};

/// Keys are opaque 64-character bearer strings (API.md, "Authorization and common limits").
pub(crate) const KEY_LENGTH: usize = 64;
const KEY_BYTES: usize = KEY_LENGTH / 2;

/// SHA-256 of a bearer key. Only the hash is stored, so a leaked store holds no usable key.
pub type KeyHash = [u8; 32];

#[derive(Debug)]
pub struct InvalidKeyHash;

impl fmt::Display for InvalidKeyHash {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("invalid key hash length")
    }
}

impl std::error::Error for InvalidKeyHash {}

/**
 * @cc [owner:spolu,label:security;error-handling] key-hash-decoding
 * Decoding MUST preserve exactly 32 bytes or return InvalidKeyHash. It MUST NOT truncate or pad
 * malformed hashes.
 */
pub fn key_hash_from_bytes(bytes: &[u8]) -> Result<KeyHash, InvalidKeyHash> {
    bytes.try_into().map_err(|_| InvalidKeyHash)
}

/// A new random bearer key, hex-encoded from `KEY_BYTES` bytes of OS randomness.
pub fn new_key() -> Result<String, ring::error::Unspecified> {
    let mut bytes = [0; KEY_BYTES];
    SystemRandom::new().fill(&mut bytes)?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

pub fn hash_key(key: &str) -> KeyHash {
    Sha256::digest(key.as_bytes()).into()
}
