use anyhow::{Context, Result, ensure};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use slatedb::Db;

use crate::model::{
    ContentVersionId, FileContent, MetadataRevision, ObjectId, ObjectKind, ObjectMetadata,
    ParentLink, WorkspaceId, Xattrs,
};

const FORMAT_KEY: &[u8] = b"dfs-format";
const FORMAT_V1: &[u8] = b"1";

/**
 * @cc [owner:spolu,label:backend] database-format-guard
 * Opening storage MUST reject an unknown database format or unmarked nonempty keyspace. Only an
 * empty keyspace may be initialized, and its format marker MUST be durable before serving it.
 */
pub(super) async fn check_format(db: &Db) -> Result<()> {
    match db.get(FORMAT_KEY).await? {
        Some(format) => ensure!(
            format.as_ref() == FORMAT_V1,
            "unsupported dfs database format"
        ),
        None => {
            ensure!(
                db.scan(..).await?.next().await?.is_none(),
                "unmarked nonempty dfs database"
            );
            let write = db.put(FORMAT_KEY, FORMAT_V1).await?;
            db.flush().await?;
            write.await_durable().await?;
        }
    }
    Ok(())
}

/**
 * @cc [owner:spolu,label:backend] versioned-metadata-values
 * Persisted values MUST carry an explicit schema version. Unknown versions, malformed records,
 * and trailing bytes MUST fail decoding rather than appear missing or partially deserialize.
 * The V1 field order and enum tags MUST remain stable; format changes require a new version.
 */
pub(super) fn encode<T: Serialize>(value: &T) -> Result<Vec<u8>> {
    let mut bytes = vec![1];
    bytes.extend(postcard::to_stdvec(value).context("encode metadata")?);
    Ok(bytes)
}

pub(super) fn decode<T: DeserializeOwned>(bytes: &[u8]) -> Result<T> {
    ensure!(
        bytes.first() == Some(&1),
        "unsupported metadata schema version"
    );
    let (value, remaining) = postcard::take_from_bytes(&bytes[1..]).context("decode metadata")?;
    ensure!(remaining.is_empty(), "trailing metadata bytes");
    Ok(value)
}

#[derive(Serialize, Deserialize)]
struct ObjectV1 {
    workspace: String,
    id: [u8; 16],
    parent: Option<([u8; 16], String)>,
    kind: KindV1,
    mime_type: String,
    xattrs: Xattrs,
    revision: u64,
}

#[derive(Serialize, Deserialize)]
enum KindV1 {
    File { version: [u8; 16], size_bytes: u64 },
    Directory,
}

pub(super) fn encode_object(object: &ObjectMetadata) -> Result<Vec<u8>> {
    validate_xattrs(&object.xattrs)?;
    encode(&ObjectV1 {
        workspace: object.workspace_id.to_string(),
        id: *object.id.as_bytes(),
        parent: object
            .parent
            .as_ref()
            .map(|p| (*p.parent_id.as_bytes(), p.name.to_string())),
        kind: match &object.kind {
            ObjectKind::File(content) => KindV1::File {
                version: *content.version.as_bytes(),
                size_bytes: content.size_bytes,
            },
            ObjectKind::Directory => KindV1::Directory,
        },
        mime_type: object.mime_type.to_string(),
        xattrs: object.xattrs.clone(),
        revision: object.metadata_revision.get(),
    })
}

pub(super) fn decode_object(
    bytes: &[u8],
    workspace: &WorkspaceId,
    id: ObjectId,
) -> Result<ObjectMetadata> {
    let record: ObjectV1 = decode(bytes)?;
    ensure!(
        record.workspace == workspace.as_str() && record.id == *id.as_bytes(),
        "object record does not match its key"
    );
    validate_xattrs(&record.xattrs)?;
    Ok(ObjectMetadata {
        workspace_id: workspace.clone(),
        id,
        parent: record
            .parent
            .map(|(parent_id, name)| {
                Ok::<_, anyhow::Error>(ParentLink {
                    parent_id: ObjectId::from_bytes(parent_id),
                    name: name.parse()?,
                })
            })
            .transpose()?,
        kind: match record.kind {
            KindV1::File {
                version,
                size_bytes,
            } => ObjectKind::File(FileContent {
                version: ContentVersionId::from_bytes(version),
                size_bytes,
            }),
            KindV1::Directory => ObjectKind::Directory,
        },
        mime_type: record
            .mime_type
            .parse()
            .context("invalid stored MIME type")?,
        xattrs: record.xattrs,
        metadata_revision: MetadataRevision::from_u64(record.revision),
    })
}

fn validate_xattrs(xattrs: &Xattrs) -> Result<()> {
    ensure!(
        xattrs
            .keys()
            .all(|key| !key.is_empty() && !key.contains('\0')),
        "invalid xattr key"
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn metadata_round_trips_and_rejects_corruption_or_wrong_scope() -> Result<()> {
        let object = ObjectMetadata {
            workspace_id: WorkspaceId::new("w/\0é")?,
            id: ObjectId::generate(),
            parent: Some(ParentLink {
                parent_id: ObjectId::generate(),
                name: "café".parse()?,
            }),
            kind: ObjectKind::File(FileContent {
                version: ContentVersionId::generate(),
                size_bytes: 8,
            }),
            mime_type: "text/plain; charset=utf-8".parse()?,
            xattrs: Xattrs::from([("user.binary".to_owned(), vec![0, 128, 255])]),
            metadata_revision: MetadataRevision::from_u64(u64::MAX),
        };
        let bytes = encode_object(&object)?;
        assert_eq!(
            decode_object(&bytes, &object.workspace_id, object.id)?,
            object
        );
        assert!(decode_object(&bytes, &WorkspaceId::new("elsewhere")?, object.id).is_err());
        assert!(decode_object(&bytes, &object.workspace_id, ObjectId::generate()).is_err());
        for invalid in [
            vec![],
            vec![2],
            bytes[..bytes.len() - 1].to_vec(),
            [bytes.clone(), vec![0]].concat(),
        ] {
            assert!(decode_object(&invalid, &object.workspace_id, object.id).is_err());
        }
        let mut corrupt: ObjectV1 = decode(&bytes)?;
        corrupt.mime_type = "invalid".to_owned();
        assert!(decode_object(&encode(&corrupt)?, &object.workspace_id, object.id).is_err());
        assert_eq!(encode(&[0x42_u8; 16])?, [vec![1], vec![0x42; 16]].concat());
        Ok(())
    }
}
