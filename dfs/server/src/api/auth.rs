use std::sync::Arc;

use dfs_protocol::{error::status, rpc::ErrorCode};
use tonic::{Request, Status};

use crate::{
    auth::{KEY_LENGTH, KeyHash, hash_key},
    storage::{fdb, resources::tenant::TenantResource},
};

use super::API;

/// A parsed credential, not proof of authentication.
#[derive(Clone)]
struct BearerKeyHash(KeyHash);

/// Rejects requests without a well-formed bearer key with UNAUTHENTICATED.
pub(crate) fn bearer_auth(mut request: Request<()>) -> Result<Request<()>, Status> {
    let key_hash = request
        .metadata()
        .get("authorization")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .filter(|key| key.len() == KEY_LENGTH)
        .map(hash_key)
        .ok_or_else(|| status(ErrorCode::Unauthenticated))?;
    request.extensions_mut().insert(BearerKeyHash(key_hash));
    Ok(request)
}

fn credentials<T>(request: &Request<T>) -> Result<KeyHash, Status> {
    let key = request
        .extensions()
        .get::<BearerKeyHash>()
        .ok_or_else(|| status(ErrorCode::Unauthenticated))?;
    Ok(key.0)
}

impl API {
    pub(crate) fn new(server_key: &str) -> anyhow::Result<Self> {
        anyhow::ensure!(
            server_key.len() == KEY_LENGTH
                && server_key.bytes().all(|byte| byte.is_ascii_graphic()),
            "server key must contain {KEY_LENGTH} visible ASCII characters"
        );
        Ok(Self {
            server_key_hash: hash_key(server_key),
            tenant_cache: Default::default(),
        })
    }

    pub(super) fn require_server<T>(&self, request: &Request<T>) -> Result<(), Status> {
        let key_hash = credentials(request)?;
        if key_hash != self.server_key_hash {
            return Err(status(ErrorCode::Unauthenticated));
        }
        Ok(())
    }

    /// @cc [owner:spolu,label:api;security] tenant-auth-cache-isolation
    /// Successful tenant authentication MUST be shared across this API instance's connections only
    /// for the same key hash and MUST NOT authorize server-key RPCs. Failed authentication MUST NOT
    /// be cached. Every RPC MUST still supply its bearer.
    pub(super) async fn require_tenant<T>(
        &self,
        request: &Request<T>,
    ) -> Result<Arc<TenantResource>, Status> {
        let key_hash = credentials(request)?;
        if let Some(tenant) = self.tenant_cache.lock().await.get(&key_hash) {
            return Ok(Arc::clone(tenant));
        }
        // Release the cache lock before FDB so a miss cannot block requests for cached tenants.
        let tenant = Arc::new(
            fdb::with_transaction(|tx| async move {
                TenantResource::authenticate(&tx, &key_hash).await
            })
            .await?,
        );
        self.tenant_cache
            .lock()
            .await
            .insert(key_hash, Arc::clone(&tenant));
        Ok(tenant)
    }
}
