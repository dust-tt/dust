use std::{fmt, str::FromStr};

use percent_encoding::{AsciiSet, NON_ALPHANUMERIC, utf8_percent_encode};
use thiserror::Error;

use super::ObjectId;

const NAME_ENCODING: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'.')
    .remove(b'_')
    .remove(b'~');

/**
 * @cc [owner:spolu,label:product] uri-identity
 * Parsing either URI form MUST retain only its object ID; decorative names MUST NOT affect equality
 * or canonical display. Reject paths, queries, fragments, and malformed percent escapes. Parsing
 * identifies an object only and MUST NOT be treated as authorization to access it.
 */
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub struct ObjectUri(ObjectId);

impl ObjectUri {
    pub const fn new(object_id: ObjectId) -> Self {
        Self(object_id)
    }

    pub const fn object_id(self) -> ObjectId {
        self.0
    }

    /// Percent-encode the optional display name without making it part of the identity.
    pub fn format_with_name(self, name: &str) -> Result<String, InvalidObjectUri> {
        if name.is_empty() {
            return Err(InvalidObjectUri);
        }
        Ok(format!(
            "dfs://{}--{}",
            utf8_percent_encode(name, NAME_ENCODING),
            self.0
        ))
    }
}

impl FromStr for ObjectUri {
    type Err = InvalidObjectUri;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        let reference = value.strip_prefix("dfs://").ok_or(InvalidObjectUri)?;
        let id = match reference.rsplit_once("--") {
            Some((name, id)) => {
                validate_name(name)?;
                id
            }
            None => reference,
        };
        id.parse().map(Self).map_err(|_| InvalidObjectUri)
    }
}

impl fmt::Display for ObjectUri {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "dfs://{}", self.0)
    }
}

fn validate_name(name: &str) -> Result<(), InvalidObjectUri> {
    if name.is_empty() {
        return Err(InvalidObjectUri);
    }
    let mut bytes = name.bytes();
    while let Some(byte) = bytes.next() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {}
            b'%' => {
                for _ in 0..2 {
                    if !bytes.next().is_some_and(|byte| byte.is_ascii_hexdigit()) {
                        return Err(InvalidObjectUri);
                    }
                }
            }
            _ => return Err(InvalidObjectUri),
        }
    }
    Ok(())
}

#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
#[error("expected dfs://<uuid> or dfs://<encoded-name>--<uuid> with a lowercase 32-hex UUID")]
pub struct InvalidObjectUri;

#[cfg(test)]
mod tests {
    use super::*;

    const ID: &str = "550e8400e29b41d4a716446655440000";

    #[test]
    fn names_do_not_affect_identity_and_display_is_canonical() -> anyhow::Result<()> {
        let bare: ObjectUri = format!("dfs://{ID}").parse()?;
        for name in ["old-name", "different--name", "café notes?#/%"] {
            let named = bare.format_with_name(name)?;
            let parsed: ObjectUri = named.parse()?;
            assert_eq!(parsed, bare);
            assert_eq!(parsed.object_id(), ID.parse()?);
            assert_eq!(parsed.to_string(), format!("dfs://{ID}"));
        }
        assert_eq!(bare.format_with_name("a b")?, format!("dfs://a%20b--{ID}"));
        assert!(bare.format_with_name("").is_err());
        Ok(())
    }

    #[test]
    fn malformed_uris_and_paths_are_rejected() {
        for invalid in [
            format!("http://{ID}"),
            format!("dfs:///{ID}"),
            format!("dfs://{ID}/file"),
            format!("dfs://dir/name--{ID}"),
            format!("dfs://dir\\name--{ID}"),
            format!("dfs://{ID}?query"),
            format!("dfs://{ID}#fragment"),
            format!("dfs://name?query--{ID}"),
            format!("dfs://name#fragment--{ID}"),
            format!("dfs://--{ID}"),
            format!("dfs://bad%2--{ID}"),
            format!("dfs://bad%zz--{ID}"),
            format!("dfs://{ID} "),
            format!("dfs://{}", ID.to_uppercase()),
            "dfs://550e8400-e29b-41d4-a716-446655440000".to_owned(),
            "dfs://not-a-uuid".to_owned(),
        ] {
            assert!(invalid.parse::<ObjectUri>().is_err(), "{invalid}");
        }
    }
}
