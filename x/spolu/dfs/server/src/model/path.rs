use std::{fmt, str::FromStr};

use thiserror::Error;

/**
 * @cc [owner:spolu,label:security] single-path-component
 * An EntryName MUST contain 1..=255 UTF-8 bytes and MUST NOT contain '/' or NUL, or equal '.' or '..'.
 * Preserve accepted UTF-8 names exactly; validation MUST NOT silently normalize them.
 */
#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub struct EntryName(String);

impl EntryName {
    pub const MAX_BYTES: usize = 255;

    pub fn new(value: impl Into<String>) -> Result<Self, InvalidEntryName> {
        let value = value.into();
        if value.is_empty() || matches!(value.as_str(), "." | "..") || value.contains(['/', '\0']) {
            return Err(InvalidEntryName::InvalidComponent);
        }
        if value.len() > Self::MAX_BYTES {
            return Err(InvalidEntryName::TooLong);
        }
        Ok(Self(value))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl FromStr for EntryName {
    type Err = InvalidEntryName;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        Self::new(value)
    }
}

impl fmt::Display for EntryName {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum InvalidEntryName {
    #[error("expected a nonempty name other than '.' or '..', containing neither '/' nor NUL")]
    InvalidComponent,
    #[error("name exceeds 255 UTF-8 bytes")]
    TooLong,
}

/**
 * @cc [owner:spolu,label:security] canonical-relative-path
 * Relative paths MUST contain one or more valid EntryName components separated by single slashes.
 * Reject absolute paths, empty components, and traversal instead of normalizing them.
 */
#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub struct RelativePath(Vec<EntryName>);

impl RelativePath {
    pub fn components(&self) -> &[EntryName] {
        &self.0
    }
}

impl FromStr for RelativePath {
    type Err = InvalidRelativePath;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        value
            .split('/')
            .map(|component| component.parse().map_err(|_| InvalidRelativePath))
            .collect::<Result<Vec<_>, _>>()
            .map(Self)
    }
}

impl fmt::Display for RelativePath {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        for (index, component) in self.0.iter().enumerate() {
            if index > 0 {
                f.write_str("/")?;
            }
            component.fmt(f)?;
        }
        Ok(())
    }
}

#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
#[error("expected a relative path with valid, nonempty components and no traversal")]
pub struct InvalidRelativePath;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn relative_paths_preserve_names_and_reject_traversal() -> anyhow::Result<()> {
        let path: RelativePath = "current/café notes".parse()?;
        assert_eq!(path.to_string(), "current/café notes");
        assert_eq!(path.components()[1].as_str(), "café notes");
        for invalid in [
            "", "/a", "a/", "a//b", ".", "..", "a/../b", "a/./b", "a/\0b",
        ] {
            assert!(invalid.parse::<RelativePath>().is_err(), "{invalid:?}");
        }
        Ok(())
    }

    #[test]
    fn entry_names_cannot_smuggle_another_path_component() {
        for invalid in ["", ".", "..", "a/b", "a\0b"] {
            assert!(EntryName::new(invalid).is_err(), "{invalid:?}");
        }
    }

    #[test]
    fn name_limits_count_bytes_without_normalizing_unicode() -> anyhow::Result<()> {
        assert!(EntryName::new("a".repeat(255)).is_ok());
        assert_eq!(
            EntryName::new("a".repeat(256)),
            Err(InvalidEntryName::TooLong)
        );
        assert!(EntryName::new(format!("{}a", "é".repeat(127))).is_ok());
        assert_eq!(
            EntryName::new("é".repeat(128)),
            Err(InvalidEntryName::TooLong)
        );
        assert_ne!(EntryName::new("é")?, EntryName::new("e\u{301}")?);
        assert_ne!(EntryName::new("a")?, EntryName::new("A")?);
        Ok(())
    }
}
