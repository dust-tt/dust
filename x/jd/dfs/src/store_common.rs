use crate::model::*;
use crate::store::Reader;

pub fn key(tenant: &str, parts: &[&str]) -> Vec<u8> {
    let mut bytes = Vec::new();
    for part in std::iter::once(tenant)
        .chain(std::iter::once("1"))
        .chain(parts.iter().copied())
    {
        for byte in part.bytes() {
            if byte == 0 {
                bytes.extend_from_slice(&[0, 255]);
            } else {
                bytes.push(byte);
            }
        }
        bytes.extend_from_slice(&[0, 0]);
    }
    bytes
}
impl Reader<'_> {
    pub fn node(&self, tenant: &str, node: &str) -> Result<Node> {
        self.get("metadata", key(tenant, &["node", node]))?
            .ok_or_else(|| err(libc::ENOENT, "node absent"))
    }
    pub fn state(&self, tenant: &str) -> Result<State> {
        self.get("metadata", key(tenant, &["state"]))?
            .ok_or_else(|| err(libc::EACCES, "tenant absent"))
    }
    pub fn entry(&self, tenant: &str, parent: &str, name: &str) -> Result<Option<Entry>> {
        self.get("metadata", key(tenant, &["entry", parent, name]))
    }
}

pub fn decode_key(bytes: &[u8]) -> Result<Vec<String>> {
    let mut parts = Vec::new();
    let mut part = Vec::new();
    let mut offset = 0;
    while offset < bytes.len() {
        match bytes[offset] {
            0 => {
                offset += 1;
                match bytes.get(offset) {
                    Some(0) => {
                        parts.push(
                            String::from_utf8(std::mem::take(&mut part))
                                .map_err(|_| err(libc::EIO, "invalid tuple UTF-8"))?,
                        );
                    }
                    Some(255) => part.push(0),
                    _ => return Err(err(libc::EIO, "invalid tuple escape")),
                }
            }
            byte => part.push(byte),
        }
        offset += 1;
    }
    if !part.is_empty() || !bytes.ends_with(&[0, 0]) {
        return Err(err(libc::EIO, "unterminated tuple"));
    }
    Ok(parts)
}
