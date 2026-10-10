use std::{
    sync::Arc,
    time::{Duration, Instant},
};

use dfs_protocol::{error::status, rpc::ErrorCode};
use tokio::time::{MissedTickBehavior, interval_at};
use tonic::{Request, Status};

use crate::{
    auth::{KEY_LENGTH, KeyHash, hash_key},
    storage::{fdb, resources::tenant::TenantResource},
};

use super::API;

#[cfg(test)]
mod tests;

const TENANT_KEY_CACHE_TTL_MS: u64 = 30_000;
const TENANT_KEY_CACHE_SWEEP_INTERVAL_MS: u64 = TENANT_KEY_CACHE_TTL_MS;

/**
 * @cc [owner:spolu,label:api;security] tenant-key-cache-expiry
 * Cached tenants MUST NOT authenticate requests at or after their expiry. Expiry MUST be set to
 * 30,000 milliseconds after successful FDB authentication and MUST NOT be extended by cache hits.
 */
pub(super) struct CachedTenant {
    tenant: Arc<TenantResource>,
    expires_at: Instant,
}

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
    pub(crate) fn new(master_key: &str) -> anyhow::Result<Self> {
        anyhow::ensure!(
            master_key.len() == KEY_LENGTH
                && master_key.bytes().all(|byte| byte.is_ascii_graphic()),
            "master key must contain {KEY_LENGTH} visible ASCII characters"
        );
        Ok(Self {
            master_key_hash: hash_key(master_key),
            tenant_key_cache: Default::default(),
        })
    }

    /// @cc [owner:spolu,label:performance;concurrency] tenant-key-cache-reclamation
    /// Every sweep MUST remove expired entries and retain unexpired entries. Removing an entry
    /// MUST release the cache's ownership of the tenant without invalidating outstanding references.
    pub(crate) async fn sweep_tenant_key_cache(&self) {
        let period = Duration::from_millis(TENANT_KEY_CACHE_SWEEP_INTERVAL_MS);
        let mut sweep = interval_at(tokio::time::Instant::now() + period, period);
        sweep.set_missed_tick_behavior(MissedTickBehavior::Skip);
        loop {
            sweep.tick().await;
            let mut cache = self.tenant_key_cache.write().await;
            let now = Instant::now();
            cache.retain(|_, cached| cached.expires_at > now);
        }
    }

    pub(super) fn require_master<T>(&self, request: &Request<T>) -> Result<(), Status> {
        let key_hash = credentials(request)?;
        if key_hash != self.master_key_hash {
            return Err(status(ErrorCode::Unauthenticated));
        }
        Ok(())
    }

    /**
     * @cc [owner:spolu,label:api;security] tenant-auth-cache-isolation
     * Successful tenant authentication MUST be shared across this API instance's connections only
     * for the same key hash and MUST NOT authorize master-key RPCs. Failed authentication MUST NOT
     * be cached. Every RPC MUST still supply its bearer.
     */
    /**
     * @cc [owner:spolu,label:performance;concurrency] tenant-key-cache-concurrency
     * Cache hits MUST use shared read access. FDB authentication MUST run without a cache guard.
     */
    pub(super) async fn require_tenant<T>(
        &self,
        request: &Request<T>,
    ) -> Result<Arc<TenantResource>, Status> {
        let key_hash = credentials(request)?;
        if let Some(cached) = self.tenant_key_cache.read().await.get(&key_hash)
            && cached.expires_at > Instant::now()
        {
            return Ok(Arc::clone(&cached.tenant));
        }
        // Release the cache lock before FDB so a miss cannot block requests for cached tenants.
        let tenant = Arc::new(
            fdb::with_transaction(|tx| async move {
                TenantResource::authenticate(&tx, &key_hash).await
            })
            .await?,
        );
        let cached = CachedTenant {
            tenant: Arc::clone(&tenant),
            expires_at: Instant::now() + Duration::from_millis(TENANT_KEY_CACHE_TTL_MS),
        };
        self.tenant_key_cache.write().await.insert(key_hash, cached);
        Ok(tenant)
    }
}
