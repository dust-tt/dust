use dfs_protocol::{error::status, rpc::ErrorCode};
use tonic::{Request, Status};

/// Keys are opaque 64-character bearer strings (API.md, "Authorization and common limits").
const KEY_LENGTH: usize = 64;

/// The raw key from `authorization: Bearer <key>`, left in request extensions for handlers.
/// Well-formed only: whether it names a server, tenant or session key is checked downstream.
#[derive(Clone)]
pub struct BearerKey(pub String);

/// Rejects requests without a well-formed bearer key with UNAUTHENTICATED.
pub fn bearer_auth(mut request: Request<()>) -> Result<Request<()>, Status> {
    let key = request
        .metadata()
        .get("authorization")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .filter(|key| key.len() == KEY_LENGTH)
        .map(str::to_owned)
        .ok_or_else(|| status(ErrorCode::Unauthenticated))?;
    request.extensions_mut().insert(BearerKey(key));
    Ok(request)
}
