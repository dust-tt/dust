use axum::{
    Json,
    extract::{Request, State},
    http::{StatusCode, header},
    response::Response,
};
use dfs_protocol::wire::CommitUploadRequest;
use dfs_protocol::wire::{StartUploadRequest, UploadReceipt, UploadStatusRequest};
use futures::StreamExt;
use tokio::time::Instant;

use super::{
    ApiError, ApiState, access, json_body, no_store, objects::object_id,
    sessions::AuthenticatedSession,
};
use crate::{
    model::ContentVersionId,
    storage::UploadError,
    uploads::{self, Upload, UploadTarget},
};

impl From<Upload> for UploadReceipt {
    fn from(upload: Upload) -> Self {
        Self {
            upload_id: upload.version.to_string(),
            object_id: upload.object_id.to_string(),
            content_version: upload.version.to_string(),
            complete: upload.completed.is_some(),
            published: false,
            size_bytes: upload.completed.map(|blob| blob.content().size_bytes),
            expires_in_seconds: upload
                .deadline
                .saturating_duration_since(Instant::now())
                .as_secs(),
        }
    }
}

/// @swagger See POST /uploads/start in server/openapi.yaml.
pub(super) async fn start(
    State(state): State<ApiState>,
    AuthenticatedSession(session): AuthenticatedSession,
    request: Request,
) -> Result<Response, ApiError> {
    let target = match json_body::<StartUploadRequest>(request, &state).await? {
        StartUploadRequest::Create { parent_id, name } => UploadTarget::Create {
            parent_id: object_id(&parent_id)?,
            name: name.parse()?,
        },
        StartUploadRequest::Replace {
            object_id: id,
            expected_content_version,
        } => UploadTarget::Replace {
            object_id: object_id(&id)?,
            expected_content_version: expected_content_version
                .parse()
                .map_err(|_| ApiError::InvalidInput)?,
        },
    };
    uploads::authorize(
        state.storage()?,
        &session.workspace,
        &session.grants,
        &target,
    )
    .await?;
    let upload = state
        .uploads
        .create(&session.id, &session.workspace, target)?;
    Ok(no_store((
        StatusCode::CREATED,
        Json(UploadReceipt::from(upload)),
    )))
}

/// @swagger See POST /uploads/status in server/openapi.yaml.
pub(super) async fn status(
    State(state): State<ApiState>,
    AuthenticatedSession(session): AuthenticatedSession,
    request: Request,
) -> Result<Response, ApiError> {
    let body: UploadStatusRequest = json_body(request, &state).await?;
    let id: ContentVersionId = body.upload_id.parse().map_err(|_| ApiError::InvalidInput)?;
    let scoped = state
        .storage()?
        .workspace(&session.workspace)
        .map_err(|_| ApiError::Unavailable)?;
    let request_id = crate::model::RequestId::from_bytes(*id.as_bytes());
    if let Some(record) = scoped
        .read_view()
        .await
        .map_err(|_| ApiError::Unavailable)?
        .operation(request_id)
        .await
        .map_err(|_| ApiError::Unavailable)?
    {
        if record.content_version != *id.as_bytes() {
            return Err(ApiError::NotFound);
        }
        crate::namespace::NamespaceRead::new(state.storage()?, &session.workspace, &session.grants)
            .await?
            .stat(crate::model::ObjectId::from_bytes(record.object_id))
            .await?;
        scoped
            .acknowledge()
            .await
            .map_err(|_| ApiError::Unavailable)?;
        return Ok(no_store(Json(UploadReceipt {
            upload_id: id.to_string(),
            object_id: crate::model::ObjectId::from_bytes(record.object_id).to_string(),
            content_version: id.to_string(),
            complete: true,
            published: true,
            size_bytes: Some(record.size_bytes),
            expires_in_seconds: 0,
        })));
    }
    let upload = state.uploads.get(&session.id, &session.workspace, id)?;
    uploads::authorize(
        state.storage()?,
        &session.workspace,
        &session.grants,
        &upload.target,
    )
    .await?;
    Ok(no_store(Json(UploadReceipt::from(upload))))
}

/**
 * @cc [owner:spolu,label:api] streaming-upload-body
 * Authenticate and claim the session's reservation before polling HTTP content. Stream the binary
 * body directly into bounded storage buffers; never extract Bytes or collect the request. Require
 * fresh session and grant checks before retaining the completed descriptor. Upload success MUST
 * NOT be described as a filesystem write or fsync acknowledgement.
 */
/// @swagger See PUT /uploads/content in server/openapi.yaml.
pub(super) async fn content(
    State(state): State<ApiState>,
    AuthenticatedSession(session): AuthenticatedSession,
    request: Request,
) -> Result<Response, ApiError> {
    let (parts, body) = request.into_parts();
    let mut ids = parts.headers.get_all("dfs-upload-id").iter();
    let id: ContentVersionId = ids
        .next()
        .ok_or(ApiError::InvalidInput)?
        .to_str()
        .map_err(|_| ApiError::InvalidInput)?
        .parse()
        .map_err(|_| ApiError::InvalidInput)?;
    if ids.next().is_some()
        || parts
            .headers
            .get(header::CONTENT_TYPE)
            .is_none_or(|value| value != "application/octet-stream")
        || parts.headers.contains_key(header::CONTENT_ENCODING)
    {
        return Err(ApiError::InvalidInput);
    }
    let lease = state.uploads.claim(&session.id, &session.workspace, id)?;
    uploads::authorize(
        state.storage()?,
        &session.workspace,
        &session.grants,
        &lease.upload.target,
    )
    .await?;
    let scoped = state
        .storage()?
        .workspace(&session.workspace)
        .map_err(|_| ApiError::Unavailable)?;
    let stream = body
        .into_data_stream()
        .map(|chunk| chunk.map_err(anyhow::Error::from));
    let blob = tokio::time::timeout_at(
        lease.upload.deadline,
        scoped.upload_blob(lease.upload.object_id, lease.upload.version, stream),
    )
    .await
    .map_err(|_| ApiError::Unavailable)?
    .map_err(|error| match error {
        UploadError::Capacity => ApiError::CapacityExhausted,
        UploadError::Input => ApiError::InvalidInput,
        UploadError::Backend(_) => ApiError::Unavailable,
    })?;
    state
        .access
        .session(access::bearer(&parts.headers)?)
        .await?;
    uploads::authorize(
        state.storage()?,
        &session.workspace,
        &session.grants,
        &lease.upload.target,
    )
    .await?;
    Ok(no_store(Json(UploadReceipt::from(lease.finish(blob)?))))
}

/// @swagger See POST /uploads/commit in server/openapi.yaml.
pub(super) async fn commit(
    State(state): State<ApiState>,
    AuthenticatedSession(session): AuthenticatedSession,
    request: Request,
) -> Result<Response, ApiError> {
    use crate::{
        files,
        model::RequestId,
        namespace::{self, NewFileAttributes},
    };
    use base64::{Engine, engine::general_purpose::STANDARD};
    let body: CommitUploadRequest = json_body(request, &state).await?;
    let id: ContentVersionId = body.upload_id.parse().map_err(|_| ApiError::InvalidInput)?;
    let request_id = RequestId::from_bytes(*id.as_bytes());
    let hash = files::fingerprint(("upload", &body))?;
    let files = state.files.clone();
    files
        .run(async move {
            let storage = state.storage()?;
            let scoped = storage
                .workspace(&session.workspace)
                .map_err(|_| ApiError::Unavailable)?;
            let _request = scoped
                .lock_request(request_id)
                .await
                .map_err(|_| ApiError::Unavailable)?;
            if let Some(record) = files::replay(storage, &session, request_id, hash).await? {
                state.uploads.release_published(&session.workspace, id)?;
                return Ok(no_store(Json(super::files::mutation_receipt(
                    request_id, record,
                ))));
            }
            let upload = state.uploads.get(&session.id, &session.workspace, id)?;
            let blob = upload.completed.as_ref().ok_or(ApiError::Conflict)?;
            let attributes = match &upload.target {
                UploadTarget::Create { .. } => Some(NewFileAttributes {
                    mime_type: body
                        .mime_type
                        .as_deref()
                        .unwrap_or("application/octet-stream")
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
                    mode: body.mode.unwrap_or(0o644),
                }),
                UploadTarget::Replace { .. } => {
                    if body.mime_type.is_some() || !body.xattrs.is_empty() || body.mode.is_some() {
                        return Err(ApiError::InvalidInput);
                    }
                    None
                }
            };
            let _writer = scoped
                .lock_content(upload.object_id)
                .await
                .map_err(|_| ApiError::Unavailable)?;
            let record = namespace::publish_content(
                storage,
                &session,
                &upload.target,
                blob,
                request_id,
                hash,
                attributes.as_ref(),
            )
            .await?;
            state.uploads.release_published(&session.workspace, id)?;
            Ok(no_store(Json(super::files::mutation_receipt(
                request_id, record,
            ))))
        })
        .await
}
