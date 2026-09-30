use std::str::FromStr;

use axum::{
    Json,
    body::Body,
    extract::{Request, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
};
use futures::{StreamExt, stream};
use serde::{Deserialize, Serialize};

use super::{
    ApiError, ApiState, json_body, no_store,
    objects::{ObjectAttributes, object_id},
    sessions::AuthenticatedSession,
};
use crate::{
    files::{HandleMode, WriteKind, WriteRequest, upload_error},
    model::{ContentVersionId, HandleId, ObjectId, ObjectKind, RequestId},
    namespace::{self, NamespaceRead},
    storage::OperationRecord,
};

/// @swaggerschema MutationReceipt in server/openapi.yaml.
#[derive(Serialize)]
pub(super) struct MutationReceipt {
    request_id: String,
    object_id: String,
    content_version: String,
    size_bytes: u64,
    metadata_revision: u64,
}

impl MutationReceipt {
    pub(super) fn new(id: RequestId, record: OperationRecord) -> Self {
        Self {
            request_id: id.to_string(),
            object_id: ObjectId::from_bytes(record.object_id).to_string(),
            content_version: ContentVersionId::from_bytes(record.content_version).to_string(),
            size_bytes: record.size_bytes,
            metadata_revision: record.metadata_revision,
        }
    }
}

/// @swaggerschema OpenFileRequest in server/openapi.yaml.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct OpenFileRequest {
    object_id: String,
    #[serde(default = "yes")]
    read: bool,
    #[serde(default)]
    write: bool,
    #[serde(default)]
    append: bool,
    #[serde(default)]
    truncate: bool,
    request_id: Option<String>,
}
fn yes() -> bool {
    true
}

/// @swaggerschema OpenFileResponse in server/openapi.yaml.
#[derive(Serialize)]
struct OpenFileResponse {
    handle_id: String,
    sequence: u64,
    attributes: ObjectAttributes,
}

/// @swagger See POST /files/open in server/openapi.yaml.
pub(super) async fn open(
    State(state): State<ApiState>,
    AuthenticatedSession(session): AuthenticatedSession,
    request: Request,
) -> Result<Response, ApiError> {
    let body: OpenFileRequest = json_body(request, &state).await?;
    let id = object_id(&body.object_id)?;
    let request_id: Option<RequestId> = body
        .request_id
        .as_deref()
        .map(str::parse)
        .transpose()
        .map_err(|_| ApiError::InvalidInput)?;
    if body.truncate != request_id.is_some() || (body.truncate && !body.write) {
        return Err(ApiError::InvalidInput);
    }
    let files = state.files.clone();
    files
        .run(async move {
            let handle = state
                .files
                .open(
                    state.storage()?,
                    session.clone(),
                    id,
                    HandleMode {
                        read: body.read,
                        write: body.write,
                        append: body.append,
                    },
                )
                .await?;
            let result = async {
                if let Some(request_id) = request_id {
                    state
                        .files
                        .edit(
                            state.storage()?,
                            &handle,
                            WriteRequest {
                                request_id,
                                sequence: 1,
                                kind: WriteKind::Truncate { size: 0 },
                            },
                            stream::empty().boxed(),
                        )
                        .await?;
                }
                let attributes =
                    NamespaceRead::new(state.storage()?, &session.workspace, &session.grants)
                        .await?
                        .stat(id)
                        .await?;
                Ok(no_store(Json(OpenFileResponse {
                    handle_id: handle.id.to_string(),
                    sequence: u64::from(body.truncate),
                    attributes: attributes.into(),
                })))
            }
            .await;
            if result.is_err() {
                let _ = state.files.close(&handle).await;
            }
            result
        })
        .await
}

/// @swaggerschema ReadFileRequest in server/openapi.yaml.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ReadFileRequest {
    handle_id: String,
    content_version: Option<String>,
    offset: u64,
    length: u64,
}

/// @swagger See POST /files/read in server/openapi.yaml.
pub(super) async fn read(
    State(state): State<ApiState>,
    AuthenticatedSession(session): AuthenticatedSession,
    request: Request,
) -> Result<Response, ApiError> {
    let body: ReadFileRequest = json_body(request, &state).await?;
    let handle = state.files.handle(&session, parse(&body.handle_id)?)?;
    if !handle.mode.read {
        return Err(ApiError::Forbidden);
    }
    if handle.progress.lock().await.closed {
        return Err(ApiError::NotFound);
    }
    session.check_active()?;
    let object = NamespaceRead::new(state.storage()?, &session.workspace, &session.grants)
        .await?
        .stat(handle.object_id)
        .await?;
    let ObjectKind::File(content) = object.kind else {
        return Err(ApiError::IsDirectory);
    };
    if let Some(version) = body.content_version
        && parse::<ContentVersionId>(&version)? != content.version
    {
        return Err(ApiError::Conflict);
    }
    let bytes = state
        .storage()?
        .workspace(&session.workspace)
        .map_err(|_| ApiError::Unavailable)?
        .read_blob_stream(handle.object_id, &content, body.offset, body.length)
        .await
        .map_err(upload_error)?;
    let mut response = Body::from_stream(
        bytes
            .stream
            .map(|result| result.map_err(|_| std::io::Error::other("Content read failed."))),
    )
    .into_response();
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        "application/octet-stream"
            .parse()
            .map_err(|_| ApiError::Internal)?,
    );
    response.headers_mut().insert(
        header::CONTENT_LENGTH,
        bytes
            .length
            .to_string()
            .parse()
            .map_err(|_| ApiError::Internal)?,
    );
    response.headers_mut().insert(
        "dfs-content-version",
        content
            .version
            .to_string()
            .parse()
            .map_err(|_| ApiError::Internal)?,
    );
    Ok(no_store(response))
}

/// @swagger See PUT /files/write in server/openapi.yaml.
pub(super) async fn write(
    State(state): State<ApiState>,
    AuthenticatedSession(session): AuthenticatedSession,
    request: Request,
) -> Result<Response, ApiError> {
    let (parts, body) = request.into_parts();
    binary_content(&parts.headers)?;
    let handle = state.files.handle(
        &session,
        request_header::<HandleId>(&parts.headers, "dfs-handle-id")?,
    )?;
    let request_id = request_header(&parts.headers, "dfs-request-id")?;
    let request = WriteRequest {
        request_id,
        sequence: request_header(&parts.headers, "dfs-write-sequence")?,
        kind: WriteKind::Write {
            offset: request_header(&parts.headers, "dfs-write-offset")?,
            length: request_header(&parts.headers, "dfs-write-length")?,
        },
    };
    let files = state.files.clone();
    files
        .run(async move {
            let input = body
                .into_data_stream()
                .map(|bytes| bytes.map_err(anyhow::Error::from))
                .boxed();
            let result = state
                .files
                .edit(state.storage()?, &handle, request, input)
                .await?;
            Ok(no_store(Json(MutationReceipt::new(request_id, result))))
        })
        .await
}

/// @swaggerschema TruncateFileRequest in server/openapi.yaml.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct TruncateFileRequest {
    handle_id: String,
    request_id: String,
    sequence: u64,
    size_bytes: u64,
}

/// @swagger See POST /files/truncate in server/openapi.yaml.
pub(super) async fn truncate(
    State(state): State<ApiState>,
    AuthenticatedSession(session): AuthenticatedSession,
    request: Request,
) -> Result<Response, ApiError> {
    let body: TruncateFileRequest = json_body(request, &state).await?;
    let handle = state.files.handle(&session, parse(&body.handle_id)?)?;
    let request_id = parse(&body.request_id)?;
    let files = state.files.clone();
    files
        .run(async move {
            let result = state
                .files
                .edit(
                    state.storage()?,
                    &handle,
                    WriteRequest {
                        request_id,
                        sequence: body.sequence,
                        kind: WriteKind::Truncate {
                            size: body.size_bytes,
                        },
                    },
                    stream::empty().boxed(),
                )
                .await?;
            Ok(no_store(Json(MutationReceipt::new(request_id, result))))
        })
        .await
}

/// @swaggerschema FsyncFileRequest in server/openapi.yaml.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct FsyncFileRequest {
    handle_id: String,
    through_sequence: u64,
}

/// @swagger See POST /files/fsync in server/openapi.yaml.
pub(super) async fn fsync(
    State(state): State<ApiState>,
    AuthenticatedSession(session): AuthenticatedSession,
    request: Request,
) -> Result<Response, ApiError> {
    let body: FsyncFileRequest = json_body(request, &state).await?;
    let handle = state.files.handle(&session, parse(&body.handle_id)?)?;
    state
        .files
        .fsync(state.storage()?, &handle, body.through_sequence)
        .await?;
    Ok(no_store(StatusCode::NO_CONTENT))
}

/// @swaggerschema CloseFileRequest in server/openapi.yaml.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CloseFileRequest {
    handle_id: String,
}

/// @swagger See POST /files/close in server/openapi.yaml.
pub(super) async fn close(
    State(state): State<ApiState>,
    AuthenticatedSession(session): AuthenticatedSession,
    request: Request,
) -> Result<Response, ApiError> {
    let body: CloseFileRequest = json_body(request, &state).await?;
    let handle = state.files.handle(&session, parse(&body.handle_id)?)?;
    state.files.close(&handle).await?;
    Ok(no_store(StatusCode::NO_CONTENT))
}

/// @swaggerschema MutationStatusRequest in server/openapi.yaml.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct MutationStatusRequest {
    object_id: String,
    request_id: String,
}

/// @swagger See POST /files/status in server/openapi.yaml.
pub(super) async fn status(
    State(state): State<ApiState>,
    AuthenticatedSession(session): AuthenticatedSession,
    request: Request,
) -> Result<Response, ApiError> {
    let body: MutationStatusRequest = json_body(request, &state).await?;
    let request_id = parse(&body.request_id)?;
    let receipt = namespace::operation_status(
        state.storage()?,
        &session,
        object_id(&body.object_id)?,
        request_id,
    )
    .await?
    .map(|record| MutationReceipt::new(request_id, record));
    Ok(no_store(Json(receipt)))
}

pub(super) fn parse<T: FromStr>(value: &str) -> Result<T, ApiError> {
    value.parse().map_err(|_| ApiError::InvalidInput)
}

pub(super) fn request_header<T: FromStr>(
    headers: &HeaderMap,
    name: &'static str,
) -> Result<T, ApiError> {
    let mut values = headers.get_all(name).iter();
    let value = values
        .next()
        .ok_or(ApiError::InvalidInput)?
        .to_str()
        .map_err(|_| ApiError::InvalidInput)?;
    if values.next().is_some() {
        return Err(ApiError::InvalidInput);
    }
    parse(value)
}

pub(super) fn binary_content(headers: &HeaderMap) -> Result<(), ApiError> {
    let content_type: String = request_header(headers, "content-type")?;
    if content_type != "application/octet-stream" || headers.contains_key(header::CONTENT_ENCODING)
    {
        return Err(ApiError::InvalidInput);
    }
    Ok(())
}
