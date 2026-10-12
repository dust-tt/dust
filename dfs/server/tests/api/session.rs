use std::time::{Duration, SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result};
use dfs_api::{
    auth::hash_key,
    storage::{
        fdb,
        resources::{
            keys::{namespace_subspace, tenant_subspace},
            session::SessionResource,
            tenant::TenantResource,
        },
    },
};
use dfs_protocol::{
    ObjectId,
    rpc::{
        CreateSessionRequest, CreateTenantRequest, Empty, ErrorCode, RevokeSessionRequest, Session,
        Tenant, dfs_client::DfsClient,
    },
};
use tokio::{net::TcpListener, time::sleep};
use tonic::transport::Channel;

use crate::{MASTER_KEY, error_code, serve, with_authorization};

const SESSION_TTL_MS: u128 = 3_600_000;
const CACHE_TEST_INTERVAL: Duration = Duration::from_secs(16);
const SHORT_SESSION_TTL_MS: u64 = 10_000;

pub(crate) async fn session_rpcs_enforce_credentials_and_preserve_identity() -> Result<()> {
    let mut client = DfsClient::new(serve().await?);
    let (tenant, session) = create_session(&mut client).await?;
    let (other_tenant, other_session) = create_session(&mut client).await?;
    let tenant_authorization = format!("Bearer {}", tenant.tenant_key);
    let session_authorization = format!("Bearer {}", session.session_key);

    for expected in [&session, &other_session] {
        let current = client
            .current_session(with_authorization(
                Empty {},
                &format!("Bearer {}", expected.session_key),
            )?)
            .await?
            .into_inner();
        let mut expected = expected.clone();
        expected.session_key.clear();
        assert_eq!(current, expected);
    }
    for key in [
        MASTER_KEY.to_owned(),
        tenant.tenant_key.clone(),
        "a".repeat(64),
    ] {
        let authorization = format!("Bearer {key}");
        let errors = [
            client
                .current_session(with_authorization(Empty {}, &authorization)?)
                .await
                .err()
                .context("expected session authentication failure")?,
            client
                .refresh_session(with_authorization(Empty {}, &authorization)?)
                .await
                .err()
                .context("expected refresh authentication failure")?,
        ];
        for error in errors {
            assert_eq!(error_code(&error)?, ErrorCode::Unauthenticated);
        }
    }
    for key in [MASTER_KEY.to_owned(), session.session_key.clone()] {
        let error = client
            .revoke_session(with_authorization(
                RevokeSessionRequest::default(),
                &format!("Bearer {key}"),
            )?)
            .await
            .err()
            .context("expected tenant authentication before ID validation")?;
        assert_eq!(error_code(&error)?, ErrorCode::Unauthenticated);
    }
    for (id, expected) in [
        (String::new(), ErrorCode::InvalidInput),
        (other_session.id.clone(), ErrorCode::NotFound),
        (ObjectId::new_v7().to_string(), ErrorCode::NotFound),
        ("x".repeat(20_000), ErrorCode::NotFound),
    ] {
        let error = client
            .revoke_session(with_authorization(
                RevokeSessionRequest { session_id: id },
                &tenant_authorization,
            )?)
            .await
            .err()
            .context("expected invalid or cross-tenant session ID to fail")?;
        assert_eq!(error_code(&error)?, expected);
    }

    let before_ms = SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis();
    let refreshed = client
        .refresh_session(with_authorization(Empty {}, &session_authorization)?)
        .await?
        .into_inner();
    let after_ms = SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis();
    let original_expiry_ms = u128::from(session.expires_at);
    assert!(
        (original_expiry_ms.max(before_ms + SESSION_TTL_MS)
            ..=original_expiry_ms.max(after_ms + SESSION_TTL_MS))
            .contains(&u128::from(refreshed.expires_at))
    );
    let mut expected = session.clone();
    expected.session_key.clear();
    expected.expires_at = refreshed.expires_at;
    assert_eq!(refreshed, expected);
    let current = client
        .current_session(with_authorization(Empty {}, &session_authorization)?)
        .await?
        .into_inner();
    assert_eq!(current, refreshed);

    for (tenant, session) in [(&tenant, &session), (&other_tenant, &other_session)] {
        client
            .revoke_session(with_authorization(
                RevokeSessionRequest {
                    session_id: session.id.clone(),
                },
                &format!("Bearer {}", tenant.tenant_key),
            )?)
            .await?;
        let authorization = format!("Bearer {}", session.session_key);
        let errors = [
            client
                .current_session(with_authorization(Empty {}, &authorization)?)
                .await
                .err()
                .context("expected local revocation to evict cached authentication")?,
            client
                .refresh_session(with_authorization(Empty {}, &authorization)?)
                .await
                .err()
                .context("revoked sessions must not be revived")?,
        ];
        for error in errors {
            assert_eq!(error_code(&error)?, ErrorCode::Unauthenticated);
        }
        let error = client
            .revoke_session(with_authorization(
                RevokeSessionRequest {
                    session_id: session.id.clone(),
                },
                &format!("Bearer {}", tenant.tenant_key),
            )?)
            .await
            .err()
            .context("expected repeated revocation to return NOT_FOUND")?;
        assert_eq!(error_code(&error)?, ErrorCode::NotFound);
        clear_tenant(tenant).await?;
    }
    Ok(())
}

pub(crate) async fn session_authentication_requires_and_caches_existing_tenants() -> Result<()> {
    let mut client = DfsClient::new(serve().await?);
    let (tenant, session) = create_session(&mut client).await?;
    let authorization = format!("Bearer {}", session.session_key);
    let tenant_key = tenant_subspace(&tenant.tenant_id).pack(&"tenant");
    let tx = fdb::database()?.create_trx()?;
    let tenant_value = tx
        .get(&tenant_key, false)
        .await?
        .context("missing tenant")?;
    tx.clear(&tenant_key);
    tx.commit().await?;

    // Tenant-key authentication was cached by CreateSession, but it cannot satisfy this lookup.
    let error = client
        .current_session(with_authorization(Empty {}, &authorization)?)
        .await
        .err()
        .context("a session without its tenant must not authenticate")?;
    assert_eq!(error_code(&error)?, ErrorCode::Unauthenticated);

    let tx = fdb::database()?.create_trx()?;
    tx.set(&tenant_key, b"invalid tenant record");
    tx.commit().await?;
    let error = client
        .current_session(with_authorization(Empty {}, &authorization)?)
        .await
        .err()
        .context("tenant decoding failures must propagate")?;
    assert_eq!(error_code(&error)?, ErrorCode::Internal);

    let tx = fdb::database()?.create_trx()?;
    tx.set(&tenant_key, &tenant_value);
    tx.commit().await?;
    // Neither failed lookup may prevent authentication once the tenant is available.
    let current = client
        .current_session(with_authorization(Empty {}, &authorization)?)
        .await?
        .into_inner();
    assert_eq!(current.id, session.id);
    assert_eq!(current.tenant_id, tenant.tenant_id);

    let tx = fdb::database()?.create_trx()?;
    tx.clear(&tenant_key);
    tx.commit().await?;
    let cached = client
        .current_session(with_authorization(Empty {}, &authorization)?)
        .await?
        .into_inner();
    assert_eq!(cached, current);
    let mut fresh = DfsClient::new(serve().await?);
    let error = fresh
        .current_session(with_authorization(Empty {}, &authorization)?)
        .await
        .err()
        .context("a fresh server must reject the missing tenant")?;
    assert_eq!(error_code(&error)?, ErrorCode::Unauthenticated);

    let tx = fdb::database()?.create_trx()?;
    tx.set(&tenant_key, &tenant_value);
    tx.commit().await?;
    client
        .revoke_session(with_authorization(
            RevokeSessionRequest {
                session_id: session.id,
            },
            &format!("Bearer {}", tenant.tenant_key),
        )?)
        .await?;
    clear_tenant(&tenant).await?;
    Ok(())
}

pub(crate) async fn session_cache_bounds_revocation_and_absolute_expiry() -> Result<()> {
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let endpoint = format!("http://{}", listener.local_addr()?);
    tokio::spawn(dfs_api::serve(listener, MASTER_KEY, std::future::pending()));
    let mut client = DfsClient::new(Channel::from_shared(endpoint.clone())?.connect().await?);
    let (tenant, session) = create_session(&mut client).await?;
    let authorization = format!("Bearer {}", session.session_key);
    client
        .current_session(with_authorization(Empty {}, &authorization)?)
        .await?;

    let (resource, _) = TenantResource::new(tenant.tenant_id.clone())?;
    let (mut short, short_key) = SessionResource::new(&resource, vec![])?;
    short.expires_at_ms = u64::try_from(SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis())?
        + SHORT_SESSION_TTL_MS;
    let short_authorization = format!("Bearer {short_key}");
    let missing = client
        .current_session(with_authorization(Empty {}, &short_authorization)?)
        .await
        .err()
        .context("expected an unstored session to fail")?;
    assert_eq!(error_code(&missing)?, ErrorCode::Unauthenticated);
    fdb::with_transaction(|tx| {
        let short = &short;
        async move { short.create(&tx).await }
    })
    .await?;
    // A failed lookup must not hide a subsequently created session.
    client
        .current_session(with_authorization(Empty {}, &short_authorization)?)
        .await?;

    let mut other_server = DfsClient::new(serve().await?);
    other_server
        .revoke_session(with_authorization(
            RevokeSessionRequest {
                session_id: session.id.clone(),
            },
            &format!("Bearer {}", tenant.tenant_key),
        )?)
        .await?;
    let mut reconnected = DfsClient::new(Channel::from_shared(endpoint)?.connect().await?);
    // A new connection to the first server shares its cached authentication after remote revocation.
    reconnected
        .current_session(with_authorization(Empty {}, &authorization)?)
        .await?;
    let fresh = other_server
        .current_session(with_authorization(Empty {}, &authorization)?)
        .await
        .err()
        .context("revoked sessions must fail on a server without cached state")?;
    assert_eq!(error_code(&fresh)?, ErrorCode::Unauthenticated);
    let refresh = reconnected
        .refresh_session(with_authorization(Empty {}, &authorization)?)
        .await
        .err()
        .context("refresh must bypass still-valid cached authentication")?;
    assert_eq!(error_code(&refresh)?, ErrorCode::Unauthenticated);

    for still_cached in [true, false] {
        sleep(CACHE_TEST_INTERVAL).await;
        let current = reconnected
            .current_session(with_authorization(Empty {}, &authorization)?)
            .await;
        if still_cached {
            assert_eq!(current?.into_inner().id, session.id);
        } else {
            let error = current
                .err()
                .context("cache hits must not extend the revocation window")?;
            assert_eq!(error_code(&error)?, ErrorCode::Unauthenticated);
        }
        let errors = [
            client
                .current_session(with_authorization(Empty {}, &short_authorization)?)
                .await
                .err()
                .context("absolute expiry must cap cache validity")?,
            client
                .refresh_session(with_authorization(Empty {}, &short_authorization)?)
                .await
                .err()
                .context("expired sessions must not be revived")?,
        ];
        for error in errors {
            assert_eq!(error_code(&error)?, ErrorCode::Unauthenticated);
        }
    }
    // The background sweep may already have removed this expired fixture.
    if let Err(error) = other_server
        .revoke_session(with_authorization(
            RevokeSessionRequest {
                session_id: short.session_id,
            },
            &format!("Bearer {}", tenant.tenant_key),
        )?)
        .await
    {
        assert_eq!(error_code(&error)?, ErrorCode::NotFound);
    }
    clear_tenant(&tenant).await?;
    Ok(())
}

async fn create_session(client: &mut DfsClient<Channel>) -> Result<(Tenant, Session)> {
    let tenant = client
        .create_tenant(with_authorization(
            CreateTenantRequest {
                tenant_id: ObjectId::new_v7().to_string(),
                root_grants: vec![],
            },
            &format!("Bearer {MASTER_KEY}"),
        )?)
        .await?
        .into_inner();
    let session = client
        .create_session(with_authorization(
            CreateSessionRequest {
                subjects: vec!["u:test".to_owned(), "a\0/b".to_owned()],
            },
            &format!("Bearer {}", tenant.tenant_key),
        )?)
        .await?
        .into_inner();
    Ok((tenant, session))
}

async fn clear_tenant(tenant: &Tenant) -> Result<()> {
    fdb::database()?
        .run(|tx, _| async move {
            let (begin, end) = tenant_subspace(&tenant.tenant_id).range();
            tx.clear_range(&begin, &end);
            tx.clear(
                &namespace_subspace()
                    .pack(&("tenant-key", hash_key(&tenant.tenant_key).as_slice())),
            );
            Ok(())
        })
        .await?;
    Ok(())
}
