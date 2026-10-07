use dfs_protocol::{MAX_IO, error::status, rpc::*, validate};
use std::collections::BTreeSet;
use tonic::Status;

/// @cc [owner:spolu,label:backend;concurrency] semantic-file-projection
/// Metadata projection MUST change only fields addressed by the operation and its timestamps/token.
/// Acceptance, local reads, and durable replay MUST use the same rules. Timestamps supplied at
/// acceptance MUST survive replay. Authorization and expected-version policy belong to the caller.
pub(crate) fn write(
    mut object: Object,
    request: &WriteRequest,
    time: Timestamp,
    version: u64,
) -> Result<Object, Status> {
    if request.data.len() > MAX_IO {
        return Err(status(ErrorCode::InvalidInput));
    }
    if object.directory {
        return Err(status(ErrorCode::IsDirectory));
    }
    let offset = if request.append {
        object.size
    } else {
        request.offset
    };
    let end = offset
        .checked_add(request.data.len() as u64)
        .filter(|end| *end <= i64::MAX as u64)
        .ok_or_else(|| status(ErrorCode::InvalidInput))?;
    if !request.data.is_empty() {
        object.size = object.size.max(end);
        object.version = version;
        object.ctime = Some(time);
        object.mtime = Some(time);
    }
    Ok(object)
}

/// @cc [owner:spolu,label:backend;concurrency] semantic-metadata-projection
/// Preserve every unspecified field and xattr. A size change MUST enforce the same type/size limits
/// as durable truncation; explicit timestamps override implicit content timestamps. Validate the
/// resulting complete attribute map before exposing or publishing the new state.
pub(crate) fn update(
    mut object: Object,
    request: &UpdateRequest,
    time: Timestamp,
    version: u64,
) -> Result<Object, Status> {
    if request.xattrs.len() > 1024 {
        return Err(status(ErrorCode::InvalidInput));
    }
    if let Some(size) = request.size {
        if object.directory {
            return Err(status(ErrorCode::IsDirectory));
        }
        if size > i64::MAX as u64 {
            return Err(status(ErrorCode::InvalidInput));
        }
        object.size = size;
        object.mtime = Some(time);
    }
    object.version = version;
    object.ctime = Some(time);
    if let Some(mime) = &request.mime_type {
        object.mime_type = mime.clone();
    }
    if let Some(mode) = request.mode {
        object.mode = mode;
    }
    if let Some(atime) = request.atime {
        validate::timestamp(&atime)?;
        object.atime = Some(atime);
    }
    if let Some(mtime) = request.mtime {
        validate::timestamp(&mtime)?;
        object.mtime = Some(mtime);
    }
    let mut names = BTreeSet::new();
    for change in &request.xattrs {
        if change.name.is_empty()
            || change.name.len() > 255
            || change.name.contains('\0')
            || !names.insert(&change.name)
        {
            return Err(status(ErrorCode::InvalidInput));
        }
        match &change.value {
            Some(value) => {
                object.xattrs.insert(change.name.clone(), value.clone());
            }
            None => {
                object.xattrs.remove(&change.name);
            }
        }
    }
    validate::attributes(&object.mime_type, &object.xattrs, object.mode)?;
    Ok(object)
}
