use crate::{ObjectId, id::InvalidId};
use prost::{
    DecodeError, Message,
    bytes::{Buf, BufMut},
    encoding::{self, DecodeContext, WireType},
};
use serde::{Deserialize, Deserializer, Serialize, Serializer, de::Error};
use std::{fmt, str::FromStr};

/// @cc [owner:spolu,label:architecture;performance;security] inline-wire-references
/// Real references MUST carry exactly 16 UUIDv4 bytes with no retained allocation. Root/shared MUST
/// use distinct protobuf tags. Missing references MUST remain invalid until explicitly populated;
/// decoding MUST NOT manufacture a fresh identity or interpret an invalid UUID as a projection.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum ObjectRef {
    #[default]
    Invalid,
    Object(ObjectId),
    Root,
    Shared,
}
impl ObjectRef {
    pub fn new_v4() -> Self {
        Self::Object(ObjectId::new_v4())
    }
    pub fn real(&self) -> Result<ObjectId, InvalidId> {
        match self {
            Self::Object(id) => Ok(*id),
            _ => Err(InvalidId),
        }
    }
    pub fn is_virtual(&self) -> bool {
        matches!(self, Self::Root | Self::Shared)
    }
    pub fn is_empty(&self) -> bool {
        *self == Self::Invalid
    }
    pub fn len(&self) -> usize {
        std::mem::size_of::<Self>()
    }
    pub fn as_bytes(&self) -> &[u8] {
        match self {
            Self::Object(id) => id.as_bytes(),
            _ => &[],
        }
    }
}
impl From<ObjectId> for ObjectRef {
    fn from(id: ObjectId) -> Self {
        Self::Object(id)
    }
}
impl From<&ObjectRef> for ObjectRef {
    fn from(id: &ObjectRef) -> Self {
        *id
    }
}
impl FromStr for ObjectRef {
    type Err = InvalidId;
    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "root" => Ok(Self::Root),
            "shared" => Ok(Self::Shared),
            _ => value.parse().map(Self::Object),
        }
    }
}
impl fmt::Display for ObjectRef {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Invalid => f.write_str(""),
            Self::Root => f.write_str("root"),
            Self::Shared => f.write_str("shared"),
            Self::Object(id) => id.fmt(f),
        }
    }
}
impl Message for ObjectRef {
    fn encode_raw(&self, buf: &mut impl BufMut) {
        match self {
            Self::Object(id) => encode_fixed(id.as_bytes(), buf),
            Self::Root => encoding::bool::encode(2, &true, buf),
            Self::Shared => encoding::bool::encode(3, &true, buf),
            Self::Invalid => (),
        }
    }
    fn merge_field(
        &mut self,
        tag: u32,
        wire: WireType,
        buf: &mut impl Buf,
        ctx: DecodeContext,
    ) -> Result<(), DecodeError> {
        match tag {
            1 => {
                *self = Self::Object(
                    ObjectId::from_bytes(decode_fixed(wire, buf)?)
                        .map_err(|_| decode_error("invalid UUIDv4"))?,
                )
            }
            2 | 3 => {
                let mut present = false;
                encoding::bool::merge(wire, &mut present, buf, ctx)?;
                if !present {
                    return Err(decode_error("invalid virtual reference"));
                }
                *self = if tag == 2 { Self::Root } else { Self::Shared };
            }
            _ => encoding::skip_field(wire, tag, buf, ctx)?,
        }
        Ok(())
    }
    fn encoded_len(&self) -> usize {
        match self {
            Self::Object(_) => 18,
            Self::Root | Self::Shared => 2,
            Self::Invalid => 0,
        }
    }
    fn clear(&mut self) {
        *self = Self::Invalid;
    }
}

impl Serialize for ObjectRef {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        if s.is_human_readable() {
            return s.collect_str(self);
        }
        let (tag, bytes) = match self {
            Self::Invalid => (0u8, [0; 16]),
            Self::Object(id) => (1, *id.as_bytes()),
            Self::Root => (2, [0; 16]),
            Self::Shared => (3, [0; 16]),
        };
        (tag, bytes).serialize(s)
    }
}
impl<'de> Deserialize<'de> for ObjectRef {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        if d.is_human_readable() {
            return String::deserialize(d)?.parse().map_err(D::Error::custom);
        }
        let (tag, bytes) = <(u8, [u8; 16])>::deserialize(d)?;
        match tag {
            0 if bytes == [0; 16] => Ok(Self::Invalid),
            1 => ObjectId::from_bytes(bytes)
                .map(Self::Object)
                .map_err(D::Error::custom),
            2 if bytes == [0; 16] => Ok(Self::Root),
            3 if bytes == [0; 16] => Ok(Self::Shared),
            _ => Err(D::Error::custom("invalid reference tag")),
        }
    }
}

/// Opaque revision bytes are inline; all-zero represents an absent precondition/local overlay.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Revision([u8; 16]);
impl Revision {
    pub fn new() -> Self {
        Self(*ObjectId::new_v4().as_bytes())
    }
    pub fn is_empty(&self) -> bool {
        self.0 == [0; 16]
    }
    pub fn len(&self) -> usize {
        if self.is_empty() { 0 } else { 16 }
    }
    pub fn as_slice(&self) -> &[u8] {
        if self.is_empty() { &[] } else { &self.0 }
    }
    pub fn clear(&mut self) {
        self.0 = [0; 16];
    }
}
impl From<[u8; 16]> for Revision {
    fn from(v: [u8; 16]) -> Self {
        Self(v)
    }
}
impl AsRef<[u8]> for Revision {
    fn as_ref(&self) -> &[u8] {
        self.as_slice()
    }
}
impl std::ops::Deref for Revision {
    type Target = [u8];
    fn deref(&self) -> &[u8] {
        self.as_slice()
    }
}
impl Message for Revision {
    fn encode_raw(&self, buf: &mut impl BufMut) {
        if !self.is_empty() {
            encode_fixed(&self.0, buf);
        }
    }
    fn merge_field(
        &mut self,
        tag: u32,
        wire: WireType,
        buf: &mut impl Buf,
        ctx: DecodeContext,
    ) -> Result<(), DecodeError> {
        if tag == 1 {
            self.0 = decode_fixed(wire, buf)?;
        } else {
            encoding::skip_field(wire, tag, buf, ctx)?;
        }
        Ok(())
    }
    fn encoded_len(&self) -> usize {
        if self.is_empty() { 0 } else { 18 }
    }
    fn clear(&mut self) {
        self.0 = [0; 16];
    }
}
impl Serialize for Revision {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        if s.is_human_readable() {
            self.as_slice().serialize(s)
        } else {
            self.0.serialize(s)
        }
    }
}
impl<'de> Deserialize<'de> for Revision {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        if !d.is_human_readable() {
            return <[u8; 16]>::deserialize(d).map(Self);
        }
        let bytes = Vec::<u8>::deserialize(d)?;
        if bytes.is_empty() {
            return Ok(Self::default());
        }
        bytes
            .try_into()
            .map(Self)
            .map_err(|_| D::Error::custom("expected 16 revision bytes"))
    }
}

fn encode_fixed(bytes: &[u8; 16], buf: &mut impl BufMut) {
    encoding::encode_key(1, WireType::LengthDelimited, buf);
    encoding::encode_varint(16, buf);
    buf.put_slice(bytes);
}
fn decode_fixed(wire: WireType, buf: &mut impl Buf) -> Result<[u8; 16], DecodeError> {
    if wire != WireType::LengthDelimited {
        return Err(decode_error("expected bytes"));
    }
    if encoding::decode_varint(buf)? != 16 || buf.remaining() < 16 {
        return Err(decode_error("expected 16 bytes"));
    }
    let mut value = [0; 16];
    buf.copy_to_slice(&mut value);
    Ok(value)
}

// Prost 0.14 exposes no replacement constructor for errors from custom Message implementations.
#[allow(deprecated)]
fn decode_error(message: &'static str) -> DecodeError {
    DecodeError::new(message)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn references_and_revisions_have_dense_wire_and_memory_layouts()
    -> Result<(), Box<dyn std::error::Error>> {
        assert_eq!(std::mem::size_of::<ObjectRef>(), 17);
        assert_eq!(std::mem::size_of::<Revision>(), 16);
        let object = ObjectRef::new_v4();
        let bytes = object.encode_to_vec();
        assert_eq!(&bytes[..2], &[10, 16]);
        assert_eq!(&bytes[2..], object.as_bytes());
        for reference in [object, ObjectRef::Root, ObjectRef::Shared] {
            assert_eq!(
                ObjectRef::decode(reference.encode_to_vec().as_slice())?,
                reference
            );
            assert_eq!(
                serde_json::from_str::<ObjectRef>(&serde_json::to_string(&reference)?)?,
                reference
            );
            let binary = postcard::to_stdvec(&reference)?;
            assert_eq!(binary.len(), 17);
            assert_eq!(postcard::from_bytes::<ObjectRef>(&binary)?, reference);
        }
        for revision in [Revision::default(), Revision::new()] {
            assert_eq!(
                Revision::decode(revision.encode_to_vec().as_slice())?,
                revision
            );
            assert_eq!(postcard::to_stdvec(&revision)?.len(), 16);
        }
        assert_eq!(ObjectRef::decode(&[][..])?, ObjectRef::Invalid);
        assert!(ObjectRef::Invalid.real().is_err());
        Ok(())
    }

    #[test]
    fn malformed_identity_wire_values_fail_before_entering_the_server() {
        for bad in [
            vec![10, 15],
            vec![10, 17],
            vec![10, 16, 1],
            vec![16, 0],
            vec![24, 0],
            vec![8, 1],
        ] {
            assert!(ObjectRef::decode(bad.as_slice()).is_err());
        }
        let mut non_v4 = vec![10, 16];
        non_v4.extend_from_slice(&[0; 16]);
        assert!(ObjectRef::decode(non_v4.as_slice()).is_err());
    }
}
