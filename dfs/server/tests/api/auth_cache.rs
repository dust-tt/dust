use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};

use anyhow::{Context, Result};
use tokio::{task::yield_now, time::advance};

use super::{
    API, CachedSession, CachedTenant, KEY_CACHE_SWEEP_INTERVAL_MS, SESSION_KEY_CACHE_TTL_MS,
    TENANT_KEY_CACHE_TTL_MS,
};
use crate::{
    auth::KEY_LENGTH,
    storage::resources::{session::SessionResource, tenant::TenantResource},
};

#[tokio::test(start_paused = true)]
async fn periodic_sweeps_reclaim_expired_entries_and_preserve_live_references() -> Result<()> {
    let api = Arc::new(API::new(&"a".repeat(KEY_LENGTH))?);
    let now = Instant::now();
    let (expired, _) = TenantResource::new("expired".to_owned())?;
    let (held, _) = TenantResource::new("held".to_owned())?;
    let (live, _) = TenantResource::new("live".to_owned())?;
    let expired = Arc::new(expired);
    let held = Arc::new(held);
    let live = Arc::new(live);
    let expired_reference = Arc::downgrade(&expired);
    let held_reference = Arc::downgrade(&held);
    let live_reference = Arc::downgrade(&live);
    let live_key_hash = live.key_hash;
    *api.tenant_key_cache.write().await = HashMap::from([
        (
            expired.key_hash,
            CachedTenant {
                tenant: expired,
                expires_at: now,
            },
        ),
        (
            held.key_hash,
            CachedTenant {
                tenant: Arc::clone(&held),
                expires_at: now,
            },
        ),
        (
            live.key_hash,
            CachedTenant {
                tenant: live,
                expires_at: now + Duration::from_millis(TENANT_KEY_CACHE_TTL_MS),
            },
        ),
    ]);

    let (expired_session, _) = SessionResource::new(&held, vec![])?;
    let (mut expired_state, _) = SessionResource::new(&held, vec![])?;
    expired_state.expires_at_ms = 0;
    let (live_session, _) = SessionResource::new(&held, vec![])?;
    let expired_session = Arc::new(expired_session);
    let expired_session_reference = Arc::downgrade(&expired_session);
    let live_session = Arc::new(live_session);
    let live_session_reference = Arc::downgrade(&live_session);
    *api.session_key_cache.write().await = HashMap::from([
        (
            expired_session.key_hash,
            CachedSession {
                session: expired_session,
                expires_at: now,
            },
        ),
        (
            expired_state.key_hash,
            CachedSession {
                session: Arc::new(expired_state),
                expires_at: now + Duration::from_millis(SESSION_KEY_CACHE_TTL_MS),
            },
        ),
        (
            live_session.key_hash,
            CachedSession::new(Arc::clone(&live_session), now)?,
        ),
    ]);

    let sweeper = tokio::spawn({
        let api = Arc::clone(&api);
        async move { api.sweep_key_caches().await }
    });
    yield_now().await;
    assert_eq!(api.tenant_key_cache.read().await.len(), 3);

    // Advance the sweep timer; entry deadlines use the separate, unpaused monotonic clock.
    advance(Duration::from_millis(KEY_CACHE_SWEEP_INTERVAL_MS)).await;
    yield_now().await;
    assert_eq!(api.tenant_key_cache.read().await.len(), 1);
    assert!(expired_reference.upgrade().is_none());
    assert!(live_reference.upgrade().is_some());
    assert_eq!(api.session_key_cache.read().await.len(), 1);
    assert!(expired_session_reference.upgrade().is_none());
    assert_eq!(Arc::strong_count(&live_session), 2);
    assert_eq!(Arc::strong_count(&held), 1);
    drop(held);
    assert!(held_reference.upgrade().is_none());

    api.tenant_key_cache
        .write()
        .await
        .get_mut(&live_key_hash)
        .context("missing unexpired cache entry")?
        .expires_at = Instant::now();
    api.session_key_cache
        .write()
        .await
        .get_mut(&live_session.key_hash)
        .context("missing unexpired session cache entry")?
        .expires_at = Instant::now();
    advance(Duration::from_millis(KEY_CACHE_SWEEP_INTERVAL_MS)).await;
    yield_now().await;
    assert!(api.tenant_key_cache.read().await.is_empty());
    assert!(live_reference.upgrade().is_none());
    assert!(api.session_key_cache.read().await.is_empty());
    assert_eq!(Arc::strong_count(&live_session), 1);
    drop(live_session);
    assert!(live_session_reference.upgrade().is_none());

    sweeper.abort();
    assert!(sweeper.await.is_err_and(|error| error.is_cancelled()));
    Ok(())
}

#[test]
fn session_cache_deadline_starts_before_the_lookup() -> Result<()> {
    let (tenant, _) = TenantResource::new("cache-deadline".to_owned())?;
    let (session, _) = SessionResource::new(&tenant, vec![])?;
    let session = Arc::new(session);
    let lookup_started = Instant::now() - Duration::from_millis(SESSION_KEY_CACHE_TTL_MS);
    let cached = CachedSession::new(session, lookup_started)?;
    assert_eq!(
        cached.expires_at,
        lookup_started + Duration::from_millis(SESSION_KEY_CACHE_TTL_MS)
    );
    assert!(cached.expires_at <= Instant::now());
    Ok(())
}
