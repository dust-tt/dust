use crate::{
    MAX_GRANTS, MAX_XATTRS,
    error::status,
    rpc::{ErrorCode, Timestamp},
};
use std::collections::{BTreeMap, BTreeSet};
use tonic::Status;

pub fn id(value: &str) -> Result<String, Status> {
    id_ref(value).map(str::to_owned)
}

/// Validate the same URI/ID syntax without allocating its canonical ID.
pub fn id_ref(value: &str) -> Result<&str, Status> {
    let value = if let Some(uri) = value.strip_prefix("dfs://") {
        let (name, raw) = uri
            .rsplit_once("--")
            .map_or((None, uri), |(n, id)| (Some(n), id));
        if let Some(name) = name {
            if name.is_empty() {
                return Err(status(ErrorCode::InvalidInput));
            }
            let mut bytes = name.bytes();
            while let Some(b) = bytes.next() {
                match b {
                    b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {}
                    b'%' => {
                        for _ in 0..2 {
                            if !bytes.next().is_some_and(|b| b.is_ascii_hexdigit()) {
                                return Err(status(ErrorCode::InvalidInput));
                            }
                        }
                    }
                    _ => return Err(status(ErrorCode::InvalidInput)),
                }
            }
        }
        raw
    } else {
        value
    };
    if value.len() != 32
        || !value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return Err(status(ErrorCode::InvalidInput));
    }
    Ok(value)
}

pub fn name(value: &str) -> Result<(), Status> {
    if value.len() > 255 {
        return Err(status(ErrorCode::NameTooLong));
    }
    if value.is_empty() || matches!(value, "." | "..") || value.contains(['/', '\0']) {
        return Err(status(ErrorCode::InvalidInput));
    }
    Ok(())
}

pub fn tenant(value: &str) -> Result<(), Status> {
    if value.is_empty() || value.len() > 256 {
        return Err(status(ErrorCode::InvalidInput));
    }
    Ok(())
}

pub fn grant(value: &str) -> Result<(), Status> {
    if value.is_empty() || value.len() > 1024 {
        return Err(status(ErrorCode::InvalidInput));
    }
    Ok(())
}

pub fn grants(values: Vec<String>) -> Result<BTreeSet<String>, Status> {
    let set: BTreeSet<_> = values.into_iter().collect();
    if set.len() > MAX_GRANTS {
        return Err(status(ErrorCode::InvalidInput));
    }
    for value in &set {
        grant(value)?;
    }
    Ok(set)
}

pub fn attributes(
    mime_type: &str,
    attrs: &BTreeMap<String, Vec<u8>>,
    mode: u32,
) -> Result<(), Status> {
    if mime_type.len() > 255 || mime_type.parse::<mime::Mime>().is_err() || mode & !0o7777 != 0 {
        return Err(status(ErrorCode::InvalidInput));
    }
    let mut size = 0usize;
    for (key, value) in attrs {
        if key.is_empty() || key.len() > 255 || key.contains('\0') {
            return Err(status(ErrorCode::InvalidInput));
        }
        size = size.saturating_add(key.len()).saturating_add(value.len());
    }
    if size > MAX_XATTRS {
        return Err(status(ErrorCode::InvalidInput));
    }
    Ok(())
}

pub fn timestamp(value: &Timestamp) -> Result<(), Status> {
    if value.nanos >= 1_000_000_000 {
        return Err(status(ErrorCode::InvalidInput));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stable_ids_ignore_valid_decorative_names() -> Result<(), Status> {
        let raw = "550e8400e29b41d4a716446655440000";
        assert_eq!(id(raw)?, raw);
        assert_eq!(id(&format!("dfs://old%20name--{raw}"))?, raw);
        for invalid in [
            format!("dfs://a/b--{raw}"),
            format!("dfs://{raw}?x"),
            format!("dfs://bad%zz--{raw}"),
            raw.to_uppercase(),
        ] {
            assert!(id(&invalid).is_err());
        }
        Ok(())
    }

    #[test]
    fn input_bounds_and_grant_cardinality_are_enforced() -> Result<(), Status> {
        assert_eq!(grants(vec!["same".into(); 600])?.len(), 1);
        assert!(grants((0..513).map(|i| i.to_string()).collect()).is_err());
        assert!(name("../hidden").is_err());
        assert!(name(&"a".repeat(256)).is_err());
        let attrs = BTreeMap::from([("user.large".into(), vec![0; MAX_XATTRS])]);
        assert!(attributes("text/plain", &attrs, 0o600).is_err());
        assert!(attributes("text/plain", &BTreeMap::new(), 0o10000).is_err());
        Ok(())
    }
}
