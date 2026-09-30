use std::collections::BTreeMap;

use axum::{
    Json,
    extract::{Request, State},
    response::Response,
};
use base64::{Engine, engine::general_purpose::STANDARD};
use serde::{Deserialize, Serialize};

use super::{ApiError, ApiState, json_body, no_store, sessions::AuthenticatedSession};
use crate::{
    model::{EntryName, ObjectId, ObjectKind, ObjectMetadata},
    namespace::NamespaceRead,
};

/// @swaggerschema StatRequest in server/openapi.yaml.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct StatRequest {
    object_id: String,
}

/// @swaggerschema LookupRequest in server/openapi.yaml.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct LookupRequest {
    parent_id: String,
    name: String,
}

/// @swaggerschema ListRequest in server/openapi.yaml.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ListRequest {
    directory_id: String,
    #[serde(default)]
    after: Option<String>,
    #[serde(default = "default_limit")]
    limit: usize,
}

fn default_limit() -> usize {
    100
}

/**
 * @cc [owner:spolu,label:security] object-response-boundary
 * Object attributes MUST omit canonical parent IDs, ancestor paths, and grants. Lookup/list may
 * expose entry names only after authorizing the containing directory. Xattrs MUST use padded
 * standard base64 so arbitrary bytes round-trip without loss.
 */
/// @swaggerschema ObjectAttributes in server/openapi.yaml.
#[derive(Serialize)]
struct ObjectAttributes {
    object_id: String,
    #[serde(flatten)]
    kind: KindAttributes,
    mime_type: String,
    xattrs: BTreeMap<String, String>,
    metadata_revision: u64,
}

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum KindAttributes {
    File {
        content_version: String,
        size_bytes: u64,
    },
    Directory,
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
        }
    }
}

/// @swaggerschema ListResponse in server/openapi.yaml.
#[derive(Serialize)]
struct ListResponse {
    entries: Vec<EntryAttributes>,
    next_after: Option<String>,
}

#[derive(Serialize)]
struct EntryAttributes {
    name: String,
    attributes: ObjectAttributes,
}

/// @swagger See POST /objects/stat in server/openapi.yaml.
pub(super) async fn stat(
    State(state): State<ApiState>,
    AuthenticatedSession(session): AuthenticatedSession,
    request: Request,
) -> Result<Response, ApiError> {
    let body: StatRequest = json_body(request, &state).await?;
    let id = object_id(&body.object_id)?;
    let view = NamespaceRead::new(state.storage()?, &session.workspace, &session.grants).await?;
    Ok(no_store(Json(ObjectAttributes::from(view.stat(id).await?))))
}

/// @swagger See POST /objects/lookup in server/openapi.yaml.
pub(super) async fn lookup(
    State(state): State<ApiState>,
    AuthenticatedSession(session): AuthenticatedSession,
    request: Request,
) -> Result<Response, ApiError> {
    let body: LookupRequest = json_body(request, &state).await?;
    let parent = object_id(&body.parent_id)?;
    let name = EntryName::new(body.name)?;
    let view = NamespaceRead::new(state.storage()?, &session.workspace, &session.grants).await?;
    Ok(no_store(Json(ObjectAttributes::from(
        view.lookup(parent, &name).await?,
    ))))
}

/// @swagger See POST /objects/list in server/openapi.yaml.
pub(super) async fn list(
    State(state): State<ApiState>,
    AuthenticatedSession(session): AuthenticatedSession,
    request: Request,
) -> Result<Response, ApiError> {
    let body: ListRequest = json_body(request, &state).await?;
    let directory = object_id(&body.directory_id)?;
    let after = body.after.map(EntryName::new).transpose()?;
    let view = NamespaceRead::new(state.storage()?, &session.workspace, &session.grants).await?;
    let page = view.list(directory, after.as_ref(), body.limit).await?;
    Ok(no_store(Json(ListResponse {
        entries: page
            .entries
            .into_iter()
            .map(|(name, object)| EntryAttributes {
                name: name.to_string(),
                attributes: object.into(),
            })
            .collect(),
        next_after: page.next_after.map(|name| name.to_string()),
    })))
}

fn object_id(value: &str) -> Result<ObjectId, ApiError> {
    value.parse().map_err(|_| ApiError::InvalidInput)
}

#[cfg(test)]
mod tests;
