use crate::model::{ObjectKind, ObjectMetadata, PosixAttributes, Timestamp};
use base64::{Engine, engine::general_purpose::STANDARD};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

/// @swaggerschema StatRequest in server/openapi.yaml.
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StatRequest {
    pub object_id: String,
}

/// @swaggerschema LookupRequest in server/openapi.yaml.
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LookupRequest {
    pub parent_id: String,
    pub name: String,
}

/// @swaggerschema ListRequest in server/openapi.yaml.
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ListRequest {
    pub directory_id: String,
    #[serde(default)]
    pub after: Option<String>,
    #[serde(default = "default_limit")]
    pub limit: usize,
}

/// @swaggerschema ObjectAttributes in server/openapi.yaml.
#[derive(Clone, Serialize, Deserialize)]
pub struct ObjectAttributes {
    pub object_id: String,
    #[serde(flatten)]
    pub kind: KindAttributes,
    pub mime_type: String,
    pub xattrs: BTreeMap<String, String>,
    pub metadata_revision: u64,
    #[serde(flatten)]
    pub posix: PosixAttributes,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum KindAttributes {
    File {
        content_version: String,
        size_bytes: u64,
    },
    Directory,
}

/// @swaggerschema ListResponse in server/openapi.yaml.
#[derive(Clone, Serialize, Deserialize)]
pub struct ListResponse {
    pub entries: Vec<EntryAttributes>,
    pub next_after: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct EntryAttributes {
    pub name: String,
    pub attributes: ObjectAttributes,
}

/// @swaggerschema MkdirRequest in server/openapi.yaml.
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MkdirRequest {
    pub parent_id: String,
    pub name: String,
    pub mime_type: Option<String>,
    #[serde(default)]
    pub xattrs: BTreeMap<String, String>,
    pub mode: Option<u16>,
}

/// @swaggerschema UpdateMetadataRequest in server/openapi.yaml.
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdateMetadataRequest {
    pub object_id: String,
    pub expected_metadata_revision: u64,
    pub mime_type: Option<String>,
    #[serde(default)]
    pub xattrs: BTreeMap<String, Option<String>>,
    pub mode: Option<u16>,
    pub atime: Option<Timestamp>,
    pub mtime: Option<Timestamp>,
}

/// @swaggerschema RenameRequest in server/openapi.yaml.
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RenameRequest {
    pub object_id: String,
    pub expected_metadata_revision: u64,
    pub parent_id: String,
    pub name: String,
    #[serde(default)]
    pub replace: bool,
}

/// @swaggerschema RemoveRequest in server/openapi.yaml.
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RemoveRequest {
    pub object_id: String,
    pub expected_metadata_revision: u64,
}

impl From<ObjectMetadata> for ObjectAttributes {
    fn from(object: ObjectMetadata) -> Self {
        Self {
            object_id: object.id.to_string(),
            kind: match object.kind {
                ObjectKind::File(content) => KindAttributes::File {
                    content_version: content.version.to_string(),
                    size_bytes: content.size_bytes,
                },
                ObjectKind::Directory => KindAttributes::Directory,
            },
            mime_type: object.mime_type.to_string(),
            xattrs: object
                .xattrs
                .into_iter()
                .map(|(key, value)| (key, STANDARD.encode(value)))
                .collect(),
            metadata_revision: object.metadata_revision.get(),
            posix: object.posix,
        }
    }
}

pub fn default_limit() -> usize {
    100
}

/// @swaggerschema MutationReceipt in server/openapi.yaml.
#[derive(Clone, Serialize, Deserialize)]
pub struct MutationReceipt {
    pub request_id: String,
    pub object_id: String,
    pub content_version: String,
    pub size_bytes: u64,
    pub metadata_revision: u64,
}

/// @swaggerschema OpenFileRequest in server/openapi.yaml.
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OpenFileRequest {
    pub object_id: String,
    #[serde(default = "yes")]
    pub read: bool,
    #[serde(default)]
    pub write: bool,
    #[serde(default)]
    pub append: bool,
    #[serde(default)]
    pub truncate: bool,
    pub request_id: Option<String>,
}

/// @swaggerschema OpenFileResponse in server/openapi.yaml.
#[derive(Clone, Serialize, Deserialize)]
pub struct OpenFileResponse {
    pub handle_id: String,
    pub sequence: u64,
    pub attributes: ObjectAttributes,
}

/// @swaggerschema ReadFileRequest in server/openapi.yaml.
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReadFileRequest {
    pub handle_id: String,
    pub content_version: Option<String>,
    pub offset: u64,
    pub length: u64,
}

/// @swaggerschema TruncateFileRequest in server/openapi.yaml.
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TruncateFileRequest {
    pub handle_id: String,
    pub request_id: String,
    pub sequence: u64,
    pub size_bytes: u64,
}

/// @swaggerschema FsyncFileRequest in server/openapi.yaml.
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FsyncFileRequest {
    pub handle_id: String,
    pub through_sequence: u64,
}

/// @swaggerschema CloseFileRequest in server/openapi.yaml.
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CloseFileRequest {
    pub handle_id: String,
}

/// @swaggerschema MutationStatusRequest in server/openapi.yaml.
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MutationStatusRequest {
    pub object_id: String,
    pub request_id: String,
}

fn yes() -> bool {
    true
}

/// @swaggerschema StartUploadRequest in server/openapi.yaml.
#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "operation", rename_all = "snake_case", deny_unknown_fields)]
pub enum StartUploadRequest {
    Create {
        parent_id: String,
        name: String,
    },
    Replace {
        object_id: String,
        expected_content_version: String,
    },
}

/// @swaggerschema UploadReceipt in server/openapi.yaml.
#[derive(Clone, Serialize, Deserialize)]
pub struct UploadReceipt {
    pub upload_id: String,
    pub object_id: String,
    pub content_version: String,
    pub complete: bool,
    pub published: bool,
    pub size_bytes: Option<u64>,
    pub expires_in_seconds: u64,
}

/// @swaggerschema UploadStatusRequest in server/openapi.yaml.
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UploadStatusRequest {
    pub upload_id: String,
}

/// @swaggerschema CreateWorkspaceRequest in server/openapi.yaml.
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CreateWorkspaceRequest {
    pub workspace_id: String,
    #[serde(default)]
    pub root_grants: Vec<String>,
}

/// @swaggerschema CreateWorkspaceResponse in server/openapi.yaml.
#[derive(Clone, Serialize, Deserialize)]
pub struct CreateWorkspaceResponse {
    pub workspace_id: String,
    pub root_id: String,
    pub workspace_key: String,
}

/// @swaggerschema CreateSessionRequest in server/openapi.yaml.
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CreateSessionRequest {
    pub workspace_id: String,
    pub grants: Vec<String>,
}

/// @swaggerschema SessionResponse in server/openapi.yaml.
#[derive(Clone, Serialize, Deserialize)]
pub struct SessionResponse {
    pub session_id: String,
    pub workspace_id: String,
    pub grants: BTreeSet<String>,
    pub expires_at: u64,
}

/// @swaggerschema CreateSessionResponse in server/openapi.yaml.
#[derive(Clone, Serialize, Deserialize)]
pub struct CreateSessionResponse {
    #[serde(flatten)]
    pub session: SessionResponse,
    pub session_key: String,
}

/// @swaggerschema CommitUploadRequest in server/openapi.yaml.
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CommitUploadRequest {
    pub upload_id: String,
    pub mime_type: Option<String>,
    #[serde(default)]
    pub xattrs: std::collections::BTreeMap<String, String>,
    pub mode: Option<u16>,
}
