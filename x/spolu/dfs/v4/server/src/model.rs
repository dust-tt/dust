use dfs_protocol::{
    error::status,
    rpc::{ErrorCode, Object, Timestamp},
};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use tonic::Status;

#[derive(Clone, PartialEq, Serialize, Deserialize)]
pub(crate) struct Parent {
    pub id: String,
    pub name: String,
}
/// @cc [owner:spolu,label:backend] bounded-object-encoding
/// Valid v4 objects MUST fit one FDB value. Postcard's xattr encoding is bounded by three times
/// the 32 KiB key/value budget plus 1 KiB for all other fields, below FDB's 100,000-byte limit.
#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct Record {
    pub object: Object,
    pub parent: Option<Parent>,
    pub revision: [u8; 16],
}
/// @cc [owner:spolu,label:backend;concurrency] independent-directory-membership
/// Directory revision and membership timestamps MUST live outside the authority record. Namespace
/// edits of the parent's membership MUST replace this whole value atomically with their child-index
/// edits, without reading it. Other metadata edits MUST preserve fields with conflict-tracked reads.
#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct DirectoryState {
    pub revision: [u8; 16],
    pub mtime: Timestamp,
    pub ctime: Timestamp,
}
#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct TenantRecord {
    pub root: String,
    pub key_hash: [u8; 32],
}

pub(crate) fn now() -> Result<Timestamp, Status> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| status(ErrorCode::Internal))?;
    Ok(Timestamp {
        seconds: i64::try_from(duration.as_secs()).map_err(|_| status(ErrorCode::Internal))?,
        nanos: duration.subsec_nanos(),
    })
}
pub(crate) fn new_object(directory: bool, mode: u32) -> Result<Object, Status> {
    let time = now()?;
    Ok(Object {
        id: uuid::Uuid::new_v4().simple().to_string(),
        directory,
        size: 0,
        mime_type: if directory {
            "inode/directory"
        } else {
            "application/octet-stream"
        }
        .into(),
        xattrs: Default::default(),
        mode,
        atime: Some(time),
        mtime: Some(time),
        ctime: Some(time),
        revision: uuid::Uuid::new_v4().as_bytes().to_vec(),
    })
}
pub(crate) fn bumped(mut object: Object, content: bool) -> Result<Object, Status> {
    let time = now()?;
    object.ctime = Some(time);
    if content {
        object.mtime = Some(time);
    }
    Ok(object)
}
