use dfs_protocol::ObjectRef;
use dfs_protocol::Revision;
use dfs_protocol::{
    error::status,
    rpc::{Attr, ErrorCode, Timestamp},
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::time::{SystemTime, UNIX_EPOCH};
use tonic::Status;

#[derive(Clone, PartialEq, Serialize, Deserialize)]
pub struct Parent {
    pub id: ObjectRef,
    pub name: String,
}
/// @cc [owner:spolu,label:backend] bounded-object-encoding
/// Ordinary attributes and parent links MUST fit one FDB value and MUST NOT embed MIME/xattrs.
/// Extended metadata MUST use a separate bounded value so traversal does not fetch large xattrs.
#[derive(Clone, Serialize, Deserialize)]
pub struct Record {
    pub object: Attr,
    pub parent: Option<Parent>,
    pub revision: [u8; 16],
}
/// @cc [owner:spolu,label:backend;concurrency] independent-directory-membership
/// Directory revision and membership timestamps MUST live outside the authority record. Namespace
/// edits MUST atomically maximize membership time and increment a counter without reading either.
/// Explicit metadata edits MUST preserve complete fields with conflict-tracked reads, replace this
/// base, and clear the membership time/counter. Public revisions MUST cover both base and counter.
#[derive(Clone, Serialize, Deserialize)]
pub struct DirectoryState {
    pub revision: [u8; 16],
    pub mtime: Timestamp,
    pub ctime: Timestamp,
}
impl DirectoryState {
    pub fn apply(
        &self,
        record: &mut Record,
        membership_time: Option<&[u8]>,
        membership_version: Option<&[u8]>,
    ) -> Result<(), Status> {
        let version = match membership_version {
            Some(bytes) => u64::from_le_bytes(
                bytes
                    .try_into()
                    .map_err(|_| status(ErrorCode::Unavailable))?,
            ),
            None => 0,
        };
        let mut hash = Sha256::new();
        hash.update(b"directory-revision-v5");
        hash.update(self.revision);
        hash.update(version.to_le_bytes());
        record.revision.copy_from_slice(&hash.finalize()[..16]);
        record.object.revision = record.revision.into();
        let time = membership_time.map(decode_time).transpose()?;
        // A present membership time always follows the last explicit metadata edit, even utimes.
        record.object.mtime = Some(time.unwrap_or(self.mtime));
        record.object.ctime = Some(time.unwrap_or(self.ctime));
        Ok(())
    }
}

/// @cc [owner:spolu,label:backend] ordered-directory-time
/// Encoded timestamps MUST sort chronologically as bytes across all signed seconds and valid nanos.
/// This encoding MUST be used for both atomic maxima and their same-snapshot readers.
pub fn ordered_time(time: Timestamp) -> Result<[u8; 12], Status> {
    if time.nanos >= 1_000_000_000 {
        return Err(status(ErrorCode::InvalidInput));
    }
    let mut bytes = [0; 12];
    bytes[..8].copy_from_slice(&(time.seconds as u64 ^ (1 << 63)).to_be_bytes());
    bytes[8..].copy_from_slice(&time.nanos.to_be_bytes());
    Ok(bytes)
}
fn decode_time(bytes: &[u8]) -> Result<Timestamp, Status> {
    let bytes: &[u8; 12] = bytes
        .try_into()
        .map_err(|_| status(ErrorCode::Unavailable))?;
    let mut seconds = [0; 8];
    let mut nanos = [0; 4];
    seconds.copy_from_slice(&bytes[..8]);
    nanos.copy_from_slice(&bytes[8..]);
    let seconds = u64::from_be_bytes(seconds) ^ (1 << 63);
    let nanos = u32::from_be_bytes(nanos);
    if nanos >= 1_000_000_000 {
        return Err(status(ErrorCode::Unavailable));
    }
    Ok(Timestamp {
        seconds: seconds as i64,
        nanos,
    })
}
#[derive(Clone, Serialize, Deserialize)]
pub struct TenantRecord {
    pub root: ObjectRef,
    pub key_hash: [u8; 32],
}

pub fn now() -> Result<Timestamp, Status> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| status(ErrorCode::Internal))?;
    Ok(Timestamp {
        seconds: i64::try_from(duration.as_secs()).map_err(|_| status(ErrorCode::Internal))?,
        nanos: duration.subsec_nanos(),
    })
}
pub fn new_object(directory: bool, mode: u32) -> Result<Attr, Status> {
    let time = now()?;
    Ok(Attr {
        id: ObjectRef::new_v4(),
        directory,
        size: 0,
        mode,
        atime: Some(time),
        mtime: Some(time),
        ctime: Some(time),
        revision: Revision::new(),
        read_version: 0,
    })
}
pub fn bumped(mut object: Attr, content: bool) -> Result<Attr, Status> {
    let time = now()?;
    object.ctime = Some(time);
    if content {
        object.mtime = Some(time);
    }
    Ok(object)
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Extended {
    pub mime_type: String,
    pub xattrs: std::collections::BTreeMap<String, Vec<u8>>,
}
impl Extended {
    pub fn new(directory: bool) -> Self {
        Self {
            mime_type: if directory {
                "inode/directory"
            } else {
                "application/octet-stream"
            }
            .into(),
            xattrs: Default::default(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn directory_time_orders_signed_seconds_and_nanoseconds() -> Result<(), Status> {
        let times = [
            Timestamp {
                seconds: i64::MIN,
                nanos: 0,
            },
            Timestamp {
                seconds: -1,
                nanos: 999_999_999,
            },
            Timestamp {
                seconds: 0,
                nanos: 0,
            },
            Timestamp {
                seconds: 0,
                nanos: 1,
            },
            Timestamp {
                seconds: i64::MAX,
                nanos: 999_999_999,
            },
        ];
        let encoded = times
            .into_iter()
            .map(ordered_time)
            .collect::<Result<Vec<_>, _>>()?;
        assert!(encoded.windows(2).all(|pair| pair[0] < pair[1]));
        for (time, bytes) in times.into_iter().zip(encoded) {
            assert_eq!(decode_time(&bytes)?, time);
        }
        assert!(decode_time(&[0; 11]).is_err());
        assert!(decode_time(&[255; 12]).is_err());
        Ok(())
    }
}
