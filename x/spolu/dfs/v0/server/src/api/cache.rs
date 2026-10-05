use axum::{
    Json,
    extract::{MatchedPath, Request, State},
    middleware::Next,
    response::Response,
};
use dfs_protocol::wire::CacheCheckRequest;

use super::{ApiError, ApiState, access, json_body, no_store, sessions::AuthenticatedSession};

/// @swagger See POST /sessions/cache in server/openapi.yaml.
pub(super) async fn poll(
    State(state): State<ApiState>,
    AuthenticatedSession(session): AuthenticatedSession,
    request: Request,
) -> Result<Response, ApiError> {
    let body: CacheCheckRequest = json_body(request, &state).await?;
    if body.revision == Some(0) {
        return Err(ApiError::InvalidInput);
    }
    Ok(no_store(Json(
        session.cache_scope.poll(&session, body).await?,
    )))
}

/// @cc [owner:spolu,label:security] cache-response-generation
/// A cacheable response MUST be bound to its authenticated session's workspace revision before
/// and after response preparation. Omit the cache stamp if a mutation races the request or the
/// session closes. Clients MUST admit the response only under a fresh check at that same revision.
pub(super) async fn stamp(State(state): State<ApiState>, request: Request, next: Next) -> Response {
    let eligible = request
        .extensions()
        .get::<MatchedPath>()
        .is_some_and(|path| {
            matches!(
                path.as_str(),
                "/objects/stat" | "/objects/lookup" | "/objects/list" | "/objects/read"
            )
        });
    let session = if eligible && let Ok(key) = access::bearer(request.headers()) {
        state.access.session(key).await.ok()
    } else {
        None
    };
    let before = session
        .as_ref()
        .and_then(|session| session.cache_scope.revision().ok());
    let mut response = next.run(request).await;
    if let (Some(session), Some(before)) = (session, before)
        && session.check_active().is_ok()
        && session.cache_scope.revision() == Ok(before)
        && let Ok(value) = before.to_string().parse()
    {
        response.headers_mut().insert("dfs-cache-revision", value);
    }
    response
}
