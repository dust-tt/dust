use std::{fmt, str::FromStr};

use thiserror::Error;
use uuid::Uuid;

/// Caller-provided workspace identifier; no normalization or UUID format is imposed.
#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub struct WorkspaceId(String);

impl WorkspaceId {
    pub fn new(value: impl Into<String>) -> Result<Self, InvalidWorkspaceId> {
        let value = value.into();
        if value.is_empty() {
            return Err(InvalidWorkspaceId);
        }
        Ok(Self(value))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl FromStr for WorkspaceId {
    type Err = InvalidWorkspaceId;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        Self::new(value)
    }
}

impl fmt::Display for WorkspaceId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
#[error("workspace ID must not be empty")]
pub struct InvalidWorkspaceId;

#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
#[error("UUID must contain exactly 32 lowercase hexadecimal characters")]
pub struct InvalidUuid;

macro_rules! uuid_id {
    ($name:ident) => {
        #[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
        pub struct $name(Uuid);

        impl $name {
            pub fn generate() -> Self {
                Self(Uuid::new_v4())
            }

            pub const fn from_bytes(bytes: [u8; 16]) -> Self {
                Self(Uuid::from_bytes(bytes))
            }

            pub const fn as_bytes(&self) -> &[u8; 16] {
                self.0.as_bytes()
            }
        }

        impl FromStr for $name {
            type Err = InvalidUuid;

            fn from_str(value: &str) -> Result<Self, Self::Err> {
                if value.len() != 32
                    || !value
                        .bytes()
                        .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
                {
                    return Err(InvalidUuid);
                }
                Uuid::parse_str(value).map(Self).map_err(|_| InvalidUuid)
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                self.0.simple().fmt(f)
            }
        }
    };
}

uuid_id!(ObjectId);
uuid_id!(ContentVersionId);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generated_ids_are_v4_and_reconstruct_from_bytes() -> anyhow::Result<()> {
        let object = ObjectId::generate();
        let content = ContentVersionId::generate();
        for bytes in [object.as_bytes(), content.as_bytes()] {
            assert_eq!(Uuid::from_bytes(*bytes).get_version_num(), 4);
            assert_eq!(
                Uuid::from_bytes(*bytes).get_variant(),
                uuid::Variant::RFC4122
            );
        }
        assert_eq!(ObjectId::from_bytes(*object.as_bytes()), object);
        assert_eq!(ContentVersionId::from_bytes(*content.as_bytes()), content);
        assert_eq!(object.to_string().parse::<ObjectId>()?, object);
        assert_eq!(content.to_string().parse::<ContentVersionId>()?, content);
        Ok(())
    }

    #[test]
    fn uuid_text_requires_the_canonical_representation() -> anyhow::Result<()> {
        let canonical = "550e8400e29b41d4a716446655440000";
        assert_eq!(canonical.parse::<ObjectId>()?.to_string(), canonical);
        for invalid in [
            "",
            "550e8400-e29b-41d4-a716-446655440000",
            "550E8400E29B41D4A716446655440000",
            "550e8400e29b41d4a71644665544000",
            "550e8400e29b41d4a71644665544000g",
        ] {
            assert!(invalid.parse::<ObjectId>().is_err(), "{invalid}");
        }
        Ok(())
    }

    #[test]
    fn workspace_ids_are_opaque_and_nonempty() -> anyhow::Result<()> {
        let id: WorkspaceId = "workspace_123".parse()?;
        assert_eq!(id.as_str(), "workspace_123");
        assert_ne!(id, "WORKSPACE_123".parse()?);
        assert!(WorkspaceId::new("").is_err());
        Ok(())
    }
}
