use serde::{Deserialize, Deserializer, Serialize, Serializer, de::Error};
use std::{fmt, str::FromStr};

/// @cc [owner:spolu,label:architecture;performance] dense-object-identity
/// Real object IDs MUST be valid UUIDv4 values stored in exactly 16 inline bytes. Binary serde
/// encodings MUST retain those bytes without a string or length prefix. Text is for human boundaries.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ObjectId([u8; 16]);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct InvalidId;

impl fmt::Display for InvalidId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("expected a UUIDv4")
    }
}
impl std::error::Error for InvalidId {}

impl ObjectId {
    pub fn new_v4() -> Self {
        Self(*uuid::Uuid::new_v4().as_bytes())
    }

    pub fn from_bytes(bytes: [u8; 16]) -> Result<Self, InvalidId> {
        if bytes[6] >> 4 != 4 || bytes[8] >> 6 != 2 {
            return Err(InvalidId);
        }
        Ok(Self(bytes))
    }

    pub fn as_bytes(&self) -> &[u8; 16] {
        &self.0
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
        let text = crate::validate::id_text(text).map_err(|_| InvalidId)?;
        let uuid = uuid::Uuid::parse_str(text).map_err(|_| InvalidId)?;
        Self::from_bytes(*uuid.as_bytes())
    }
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

impl Serialize for ObjectId {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        if serializer.is_human_readable() {
            serializer.collect_str(self)
        } else {
            self.0.serialize(serializer)
        }
    }
}

impl<'de> Deserialize<'de> for ObjectId {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        if deserializer.is_human_readable() {
            String::deserialize(deserializer)?
                .parse()
                .map_err(D::Error::custom)
        } else {
            Self::from_bytes(<[u8; 16]>::deserialize(deserializer)?).map_err(D::Error::custom)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn real_ids_are_inline_and_binary_encodings_are_dense() -> Result<(), Box<dyn std::error::Error>>
    {
        assert_eq!(std::mem::size_of::<ObjectId>(), 16);
        assert_eq!(std::mem::align_of::<ObjectId>(), 1);
        let id = ObjectId::new_v4();
        let binary = postcard::to_stdvec(&id)?;
        assert_eq!(binary, id.as_bytes());
        assert_eq!(postcard::from_bytes::<ObjectId>(&binary)?, id);
        let text = serde_json::to_string(&id)?;
        assert_eq!(text, format!("\"{id}\""));
        assert_eq!(serde_json::from_str::<ObjectId>(&text)?, id);
        assert_eq!(
            format!("dfs://renamed%20file--{id}").parse::<ObjectId>()?,
            id
        );
        Ok(())
    }

    #[test]
    fn ingress_rejects_wrong_length_version_and_variant() {
        let valid = ObjectId::new_v4();
        assert!(ObjectId::try_from(&valid.as_bytes()[..15]).is_err());
        for (index, value) in [(6, 0x70), (8, 0x00), (8, 0xc0)] {
            let mut bytes = *valid.as_bytes();
            bytes[index] = value;
            assert!(ObjectId::from_bytes(bytes).is_err());
            assert!(postcard::from_bytes::<ObjectId>(&bytes).is_err());
        }
        assert!("root".parse::<ObjectId>().is_err());
        assert!(
            "00000000000000000000000000000000"
                .parse::<ObjectId>()
                .is_err()
        );
    }
}
