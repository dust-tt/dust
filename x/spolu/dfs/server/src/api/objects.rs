use std::collections::BTreeMap;

use axum::{
    Json,
    extract::{Request, State},
    http::StatusCode,
    response::Response,
};
use base64::{Engine, engine::general_purpose::STANDARD};
use dfs_protocol::wire::{
    EntryAttributes, KindAttributes, ListRequest, ListResponse, LookupRequest, MkdirRequest,
    ObjectAttributes, RemoveRequest, RenameRequest, StatRequest, UpdateMetadataRequest,
};

use super::{ApiError, ApiState, json_body, no_store, sessions::AuthenticatedSession};
use crate::{
    model::{EntryName, ObjectId, PosixAttributes, Timestamp},
    namespace::{self, NamespaceId, NamespaceNode, NamespaceRead, SyntheticDirectory},
};

pub(super) use dfs_protocol::wire::default_limit;

/**
 * @cc [owner:spolu,label:security] object-response-boundary
 * Object attributes MUST omit canonical parent IDs, ancestor paths, and grants. Canonical lookup/list
 * MUST authorize the containing directory; synthetic projections MUST authorize each target without
 * exposing its hidden ancestry. Xattrs MUST use padded standard base64 so arbitrary bytes round-trip
 * without loss.
 */
impl From<NamespaceNode> for ObjectAttributes {
    fn from(node: NamespaceNode) -> Self {
        match node {
            NamespaceNode::Object(object) => Self::from(*object),
            NamespaceNode::Synthetic(directory) => Self {
                object_id: directory.as_str().to_owned(),
                kind: KindAttributes::Directory,
                mime_type: "inode/directory".to_owned(),
                xattrs: BTreeMap::new(),
                metadata_revision: 0,
                posix: PosixAttributes {
                    mode: 0o555,
                    ..PosixAttributes::new(true, Timestamp::EPOCH)
                },
            },
        }
    }
}

/// @swagger See POST /objects/stat in server/openapi.yaml.
pub(super) async fn stat(
    State(state): State<ApiState>,
    AuthenticatedSession(session): AuthenticatedSession,
    request: Request,
) -> Result<Response, ApiError> {
    let body: StatRequest = json_body(request, &state).await?;
    let id = body.object_id.parse()?;
    let view = NamespaceRead::new(state.storage()?, &session.workspace, &session.grants).await?;
    Ok(no_store(Json(ObjectAttributes::from(
        view.session_stat(id).await?,
    ))))
}

/// @swagger See POST /objects/lookup in server/openapi.yaml.
pub(super) async fn lookup(
    State(state): State<ApiState>,
    AuthenticatedSession(session): AuthenticatedSession,
    request: Request,
) -> Result<Response, ApiError> {
    let body: LookupRequest = json_body(request, &state).await?;
    let parent = body.parent_id.parse()?;
    let name = EntryName::new(body.name)?;
    let view = NamespaceRead::new(state.storage()?, &session.workspace, &session.grants).await?;
    Ok(no_store(Json(ObjectAttributes::from(
        view.session_lookup(parent, &name).await?,
    ))))
}

/// @swagger See POST /objects/list in server/openapi.yaml.
pub(super) async fn list(
    State(state): State<ApiState>,
    AuthenticatedSession(session): AuthenticatedSession,
    request: Request,
) -> Result<Response, ApiError> {
    let body: ListRequest = json_body(request, &state).await?;
    let directory = body.directory_id.parse()?;
    let view = NamespaceRead::new(state.storage()?, &session.workspace, &session.grants).await?;
    let page = view
        .session_list(directory, body.after.as_deref(), body.limit)
        .await?;
    Ok(no_store(Json(ListResponse {
        entries: page
            .entries
            .into_iter()
            .map(|(name, object)| EntryAttributes {
                name: name.to_string(),
                attributes: object.into(),
            })
            .collect(),
        next_after: page.next_after,
    })))
}

/// @swagger See POST /objects/mkdir in server/openapi.yaml.
pub(super) async fn mkdir(
    State(state): State<ApiState>,
    AuthenticatedSession(session): AuthenticatedSession,
    request: Request,
) -> Result<Response, ApiError> {
    let body: MkdirRequest = json_body(request, &state).await?;
    let object = namespace::mkdir(
        state.storage()?,
        &session.workspace,
        &session.grants,
        namespace::CreateDirectory {
            parent_id: object_id(&body.parent_id)?,
            name: EntryName::new(body.name)?,
            mime_type: body
                .mime_type
                .as_deref()
                .unwrap_or("inode/directory")
                .parse()
                .map_err(|_| ApiError::InvalidInput)?,
            xattrs: body
                .xattrs
                .into_iter()
                .map(|(key, value)| {
                    Ok((
                        key,
                        STANDARD.decode(value).map_err(|_| ApiError::InvalidInput)?,
                    ))
                })
                .collect::<Result<_, ApiError>>()?,
            mode: body.mode.unwrap_or(0o755),
        },
    )
    .await?;
    Ok(no_store((
        StatusCode::CREATED,
        Json(ObjectAttributes::from(object)),
    )))
}

/// @swagger See POST /objects/update in server/openapi.yaml.
pub(super) async fn update(
    State(state): State<ApiState>,
    AuthenticatedSession(session): AuthenticatedSession,
    request: Request,
) -> Result<Response, ApiError> {
    let body: UpdateMetadataRequest = json_body(request, &state).await?;
    let object = namespace::update(
        state.storage()?,
        &session.workspace,
        &session.grants,
        namespace::MetadataUpdate {
            object_id: object_id(&body.object_id)?,
            expected_metadata_revision: body.expected_metadata_revision,
            mime_type: body
                .mime_type
                .map(|mime| mime.parse())
                .transpose()
                .map_err(|_| ApiError::InvalidInput)?,
            xattrs: body
                .xattrs
                .into_iter()
                .map(|(key, value)| {
                    Ok((
                        key,
                        value
                            .map(|value| STANDARD.decode(value))
                            .transpose()
                            .map_err(|_| ApiError::InvalidInput)?,
                    ))
                })
                .collect::<Result<_, ApiError>>()?,
            mode: body.mode,
            atime: body.atime,
            mtime: body.mtime,
        },
    )
    .await?;
    Ok(no_store(Json(ObjectAttributes::from(object))))
}

/// @swagger See POST /objects/rename in server/openapi.yaml.
pub(super) async fn rename(
    State(state): State<ApiState>,
    AuthenticatedSession(session): AuthenticatedSession,
    request: Request,
) -> Result<Response, ApiError> {
    let body: RenameRequest = json_body(request, &state).await?;
    let object = namespace::rename(
        state.storage()?,
        &session.workspace,
        &session.grants,
        namespace::RenameObject {
            object_id: object_id(&body.object_id)?,
            expected_metadata_revision: body.expected_metadata_revision,
            parent_id: object_id(&body.parent_id)?,
            name: EntryName::new(body.name)?,
            replace: body.replace,
        },
    )
    .await?;
    Ok(no_store(Json(ObjectAttributes::from(object))))
}

/// @swagger See POST /objects/unlink in server/openapi.yaml.
pub(super) async fn unlink(
    State(state): State<ApiState>,
    session: AuthenticatedSession,
    request: Request,
) -> Result<Response, ApiError> {
    remove(&state, session, request, namespace::RemovalKind::File).await
}

/// @swagger See POST /objects/rmdir in server/openapi.yaml.
pub(super) async fn rmdir(
    State(state): State<ApiState>,
    session: AuthenticatedSession,
    request: Request,
) -> Result<Response, ApiError> {
    remove(&state, session, request, namespace::RemovalKind::Directory).await
}

async fn remove(
    state: &ApiState,
    AuthenticatedSession(session): AuthenticatedSession,
    request: Request,
    kind: namespace::RemovalKind,
) -> Result<Response, ApiError> {
    let body: RemoveRequest = json_body(request, state).await?;
    namespace::remove(
        state.storage()?,
        &session.workspace,
        &session.grants,
        namespace::RemoveObject {
            object_id: object_id(&body.object_id)?,
            expected_metadata_revision: body.expected_metadata_revision,
        },
        kind,
    )
    .await?;
    Ok(no_store(StatusCode::NO_CONTENT))
}

pub(super) fn object_id(value: &str) -> Result<ObjectId, ApiError> {
    match value.parse()? {
        NamespaceId::Object(id) => Ok(id),
        NamespaceId::Synthetic(SyntheticDirectory::Root | SyntheticDirectory::Shared) => {
            Err(ApiError::Forbidden)
        }
    }
}

#[cfg(test)]
pub(super) mod tests;
