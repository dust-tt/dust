use dfs_protocol::{
    error::{detailed, status},
    rpc::{ErrorCode, Expected, Object, Timestamp},
    validate,
};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use tonic::Status;

#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct Parent {
    pub id: String,
    pub name: String,
}
#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct Record {
    pub object: Object,
    pub parent: Option<Parent>,
}
#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct WorkspaceRecord {
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
        version: 1,
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
    })
}
pub(crate) fn bumped(mut object: Object, content: bool) -> Result<Object, Status> {
    object.version = object
        .version
        .checked_add(1)
        .ok_or_else(|| status(ErrorCode::Capacity))?;
    let time = now()?;
    object.ctime = Some(time);
    if content {
        object.mtime = Some(time);
    }
    Ok(object)
}
pub(crate) fn check(object: &Object, version: u64) -> Result<(), Status> {
    if version != object.version {
        return Err(detailed(
            ErrorCode::VersionConflict,
            vec![Expected {
                id: object.id.clone(),
                version: object.version,
            }],
        ));
    }
    Ok(())
}
pub(crate) fn expected(objects: &[&Object], versions: &[Expected]) -> Result<(), Status> {
    if versions.len() > 4 {
        return Err(status(ErrorCode::InvalidInput));
    }
    let versions = versions
        .iter()
        .map(|entry| {
            Ok(Expected {
                id: validate::id(&entry.id)?,
                version: entry.version,
            })
        })
        .collect::<Result<Vec<_>, Status>>()?;
    for object in objects {
        let mut found = versions.iter().filter(|e| e.id == object.id);
        let value = found
            .next()
            .ok_or_else(|| status(ErrorCode::InvalidInput))?;
        if found.next().is_some() {
            return Err(status(ErrorCode::InvalidInput));
        }
        check(object, value.version)?;
    }
    Ok(())
}
