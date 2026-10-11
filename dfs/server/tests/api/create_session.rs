use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result};
use dfs_api::{
    auth::hash_key,
    storage::{
        fdb,
        resources::keys::{namespace_subspace, tenant_subspace},
    },
};
use dfs_protocol::{
    ObjectId,
    rpc::{CreateSessionRequest, CreateTenantRequest, ErrorCode, dfs_client::DfsClient},
};
use foundationdb::{FdbBindingError, tuple::unpack};

use crate::{MASTER_KEY, error_code, serve, with_authorization};

const SESSION_TTL_MS: u128 = 3_600_000;

pub(crate) async fn creates_durable_sessions_for_authenticated_tenants() -> Result<()> {
    let mut client = DfsClient::new(serve().await?);
    let mut tenants = Vec::new();
    let mut sessions = Vec::new();
    for (subjects, expected) in [
        (
            vec!["u:test", "g:engineering", "u:test"],
            vec!["g:engineering", "u:test"],
        ),
        (vec![], vec![]),
    ] {
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
        let before_ms = SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis();
        let session = client
            .create_session(with_authorization(
                CreateSessionRequest {
                    subjects: subjects.into_iter().map(str::to_owned).collect(),
                },
                &format!("Bearer {}", tenant.tenant_key),
            )?)
            .await?
            .into_inner();
        let after_ms = SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis();
        assert_eq!(session.tenant_id, tenant.tenant_id);
        assert_eq!(session.subjects, expected);
        assert_eq!(session.session_key.len(), 64);
        assert_eq!(uuid::Uuid::parse_str(&session.id)?.get_version_num(), 7);
        assert!(
            (before_ms + SESSION_TTL_MS..=after_ms + SESSION_TTL_MS)
                .contains(&u128::from(session.expires_at))
        );
        tenants.push(tenant);
        sessions.push(session);
    }
    assert_ne!(sessions[0].id, sessions[1].id);
    assert_ne!(sessions[0].session_key, sessions[1].session_key);

    for subjects in [
        vec![String::new()],
        vec!["é".repeat(513)],
        (0..513).map(|index| index.to_string()).collect(),
    ] {
        let error = client
            .create_session(with_authorization(
                CreateSessionRequest { subjects },
                &format!("Bearer {}", tenants[0].tenant_key),
            )?)
            .await
            .err()
            .context("expected invalid session subjects to fail")?;
        assert_eq!(error_code(&error)?, ErrorCode::InvalidInput);
        assert_eq!(error.code(), tonic::Code::InvalidArgument);
        assert_eq!(error.message(), "Invalid input.");
    }

    // Authentication must fail before subject validation for every incorrect credential kind.
    for key in [
        MASTER_KEY.to_owned(),
        sessions[0].session_key.clone(),
        "a".repeat(64),
    ] {
        let error = client
            .create_session(with_authorization(
                CreateSessionRequest {
                    subjects: vec![String::new()],
                },
                &format!("Bearer {key}"),
            )?)
            .await
            .err()
            .context("expected a non-tenant key to fail")?;
        assert_eq!(error_code(&error)?, ErrorCode::Unauthenticated);
    }
    let error = client
        .create_session(CreateSessionRequest::default())
        .await
        .err()
        .context("expected a missing bearer to fail")?;
    assert_eq!(error_code(&error)?, ErrorCode::Unauthenticated);

    // Responses must describe records already committed to FDB, accessible outside the RPC.
    fdb::database()?
        .run(|tx, _| {
            let sessions = &sessions;
            let tenants = &tenants;
            async move {
                for session in sessions {
                    let key_hash = hash_key(&session.session_key);
                    let lookup = namespace_subspace().pack(&("session-key", key_hash.as_slice()));
                    let value = tx.get(&lookup, false).await?.ok_or_else(|| {
                        FdbBindingError::CustomError("missing session lookup".into())
                    })?;
                    let (tenant_id, session_id): (String, String) =
                        unpack(&value).map_err(FdbBindingError::PackError)?;
                    assert_eq!(tenant_id, session.tenant_id);
                    assert_eq!(session_id, session.id);
                    let state_key = tenant_subspace(&tenant_id).pack(&(
                        "session",
                        session_id.as_str(),
                        "state",
                    ));
                    let value = tx.get(&state_key, false).await?.ok_or_else(|| {
                        FdbBindingError::CustomError("missing session state".into())
                    })?;
                    let (stored_hash, expires_at_ms): (Vec<u8>, u64) =
                        unpack(&value).map_err(FdbBindingError::PackError)?;
                    assert_eq!(stored_hash, key_hash);
                    assert_eq!(expires_at_ms, session.expires_at);
                    tx.clear(&lookup);
                    tx.clear(&namespace_subspace().pack(&(
                        "session-expiry",
                        expires_at_ms.to_be_bytes().as_slice(),
                        tenant_id.as_str(),
                        session_id.as_str(),
                    )));
                }
                for tenant in tenants {
                    let (begin, end) = tenant_subspace(&tenant.tenant_id).range();
                    tx.clear_range(&begin, &end);
                    tx.clear(
                        &namespace_subspace()
                            .pack(&("tenant-key", hash_key(&tenant.tenant_key).as_slice())),
                    );
                }
                Ok(())
            }
        })
        .await?;
    Ok(())
}
