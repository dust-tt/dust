use prost::{
    DecodeError, Message,
    bytes::{Buf, BufMut},
    encoding::{self, DecodeContext, WireType},
};
use std::{fmt, str::FromStr};

/**
 * @cc [owner:spolu,label:api] dfs-real-object-id
 * Populated object IDs MUST contain exactly 16 UUIDv7 bytes. The protobuf default MUST remain an
 * invalid unset value, never a generated identity; request consumers MUST reject it with
 * `validate`. Text parsing MUST accept lowercase 32-digit hex and references using the `dfs` URI
 * scheme and reject virtual references. Display MUST emit lowercase 32-digit hex.
 */
#[derive(Clone, Copy, Default, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ObjectId([u8; 16]);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct InvalidId;

impl fmt::Display for InvalidId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("expected a UUIDv7 object ID")
    }
}

impl std::error::Error for InvalidId {}

impl ObjectId {
    pub fn new_v7() -> Self {
        Self(*uuid::Uuid::now_v7().as_bytes())
    }

    pub fn from_bytes(bytes: [u8; 16]) -> Result<Self, InvalidId> {
        let id = Self(bytes);
        id.validate()?;
        Ok(id)
    }

    pub fn as_bytes(&self) -> &[u8; 16] {
        &self.0
    }

    pub fn validate(&self) -> Result<(), InvalidId> {
        if self.0[6] >> 4 != 7 || self.0[8] >> 6 != 2 {
            return Err(InvalidId);
        }
        Ok(())
    }
}

impl TryFrom<&[u8]> for ObjectId {
    type Error = InvalidId;

    fn try_from(bytes: &[u8]) -> Result<Self, Self::Error> {
        Self::from_bytes(bytes.try_into().map_err(|_| InvalidId)?)
    }
}

impl FromStr for ObjectId {
    type Err = InvalidId;

    fn from_str(text: &str) -> Result<Self, Self::Err> {
        let raw = if let Some(reference) = text.strip_prefix("dfs://") {
            if let Some((name, id)) = reference.rsplit_once("--") {
                validate_reference_name(name)?;
                id
            } else {
                reference
            }
        } else {
            text
        };
        if raw.len() != 32
            || !raw
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        {
            return Err(InvalidId);
        }
        let uuid = uuid::Uuid::parse_str(raw).map_err(|_| InvalidId)?;
        Self::from_bytes(*uuid.as_bytes())
    }
}

fn validate_reference_name(name: &str) -> Result<(), InvalidId> {
    if name.is_empty() {
        return Err(InvalidId);
    }
    let mut bytes = name.bytes();
    while let Some(byte) = bytes.next() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {}
            b'%' => {
                for _ in 0..2 {
                    if !bytes.next().is_some_and(|value| value.is_ascii_hexdigit()) {
                        return Err(InvalidId);
                    }
                }
            }
            _ => return Err(InvalidId),
        }
    }
    Ok(())
}

impl fmt::Display for ObjectId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        uuid::Uuid::from_bytes(self.0).simple().fmt(f)
    }
}

impl fmt::Debug for ObjectId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(self, f)
    }
}

impl Message for ObjectId {
    fn encode_raw(&self, buf: &mut impl BufMut) {
        encoding::encode_key(1, WireType::LengthDelimited, buf);
        encoding::encode_varint(16, buf);
        buf.put_slice(&self.0);
    }

    fn merge_field(
        &mut self,
        tag: u32,
        wire: WireType,
        buf: &mut impl Buf,
        ctx: DecodeContext,
    ) -> Result<(), DecodeError> {
        if tag != 1 {
            return encoding::skip_field(wire, tag, buf, ctx);
        }
        if wire != WireType::LengthDelimited {
            return Err(decode_error("expected object ID bytes"));
        }
        if encoding::decode_varint(buf)? != 16 || buf.remaining() < 16 {
            return Err(decode_error("expected 16 object ID bytes"));
        }
        let mut bytes = [0; 16];
        buf.copy_to_slice(&mut bytes);
        *self = Self::from_bytes(bytes).map_err(|_| decode_error("expected UUIDv7"))?;
        Ok(())
    }

    fn encoded_len(&self) -> usize {
        18
    }

    fn clear(&mut self) {
        *self = Self::default();
    }
}

// Prost exposes no replacement constructor for errors from custom Message implementations.
#[allow(deprecated)]
pub(crate) fn decode_error(message: &'static str) -> DecodeError {
    DecodeError::new(message)
}
