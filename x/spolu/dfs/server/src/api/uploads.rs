use axum::{
    Json,
    extract::{Request, State},
    http::{StatusCode, header},
    response::Response,
};
use futures::StreamExt;
use serde::{Deserialize, Serialize};
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

/// @swaggerschema StartUploadRequest in server/openapi.yaml.
#[derive(Deserialize)]
#[serde(tag = "operation", rename_all = "snake_case", deny_unknown_fields)]
enum StartUploadRequest {
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
#[derive(Serialize)]
struct UploadReceipt {
    upload_id: String,
    object_id: String,
    content_version: String,
    complete: bool,
    size_bytes: Option<u64>,
    expires_in_seconds: u64,
}

impl From<Upload> for UploadReceipt {
    fn from(upload: Upload) -> Self {
        Self {
            upload_id: upload.version.to_string(),
            object_id: upload.object_id.to_string(),
            content_version: upload.version.to_string(),
            complete: upload.completed.is_some(),
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

/// @swaggerschema UploadStatusRequest in server/openapi.yaml.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct UploadStatusRequest {
    upload_id: String,
}

/// @swagger See POST /uploads/status in server/openapi.yaml.
pub(super) async fn status(
    State(state): State<ApiState>,
    AuthenticatedSession(session): AuthenticatedSession,
    request: Request,
) -> Result<Response, ApiError> {
    let body: UploadStatusRequest = json_body(request, &state).await?;
    let id = body.upload_id.parse().map_err(|_| ApiError::InvalidInput)?;
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
