use std::{
    collections::BTreeMap,
    time::{SystemTime, UNIX_EPOCH},
};

use anyhow::{Context, Result};
use dfs_api::{
    auth::hash_key,
    storage::{
        self, fdb,
        resources::{
            keys::{namespace_subspace, tenant_subspace},
            session::{self, SessionResource},
            tenant::TenantResource,
        },
    },
};
use dfs_protocol::ObjectId;
use foundationdb::{
    FdbBindingError, RangeOption, Transaction,
    tuple::{Subspace, pack, unpack},
};

const SESSION_TTL_MS: u128 = 3_600_000;
const REFRESH_EXTENSION_MS: u64 = 10_000;
const FDB_NOT_COMMITTED: i32 = 1020;

pub(crate) fn subjects_are_exact_deduplicated_and_bounded() -> Result<()> {
    let (tenant, _) = TenantResource::new(ObjectId::new_v7().to_string())?;
    let before_ms = SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis();
    let (session, key) = SessionResource::new(
        &tenant,
        vec![
            "User".to_owned(),
            "user".to_owned(),
            "a\0/b".to_owned(),
            "User".to_owned(),
        ],
    )?;
    let after_ms = SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis();
    assert_eq!(session.tenant_id, tenant.tenant_id);
    assert_eq!(
        session.subjects.into_iter().collect::<Vec<_>>(),
        ["User", "a\0/b", "user"]
    );
    assert_eq!(hash_key(&key), session.key_hash);
    assert_eq!(key.len(), 64);
    assert_eq!(
        uuid::Uuid::parse_str(&session.session_id)?.get_version_num(),
        7
    );
    assert!(
        (before_ms + SESSION_TTL_MS..=after_ms + SESSION_TTL_MS)
            .contains(&u128::from(session.expires_at_ms))
    );

    assert!(SessionResource::new(&tenant, vec![])?.0.subjects.is_empty());
    assert_eq!(
        SessionResource::new(&tenant, vec!["é".repeat(512); 513])?
            .0
            .subjects
            .len(),
        1
    );
    for subjects in [vec![String::new()], vec!["é".repeat(513)]] {
        assert!(matches!(
            SessionResource::new(&tenant, subjects),
            Err(session::Error::InvalidSubject)
        ));
    }
    assert!(matches!(
        SessionResource::new(&tenant, (0..513).map(|i| i.to_string()).collect()),
        Err(session::Error::TooManySubjects)
    ));
    Ok(())
}

pub(crate) async fn creation_persists_indexes_and_preserves_existing_sessions() -> Result<()> {
    let (tenant, _) = TenantResource::new(ObjectId::new_v7().to_string())?;
    let (other_tenant, _) = TenantResource::new(ObjectId::new_v7().to_string())?;
    for tenant in [&tenant, &other_tenant] {
        fdb::with_transaction(|tx| async move { tenant.create(&tx).await }).await?;
    }
    // The largest allowed subject set exceeds FDB's per-value limit and must use separate keys.
    let subjects = (0..512)
        .map(|i| format!("{i:03}:{}", "é".repeat(510)))
        .collect();
    let (owner, _) = SessionResource::new(&tenant, subjects)?;
    let (mut key_collision, _) = SessionResource::new(&other_tenant, vec!["other".to_owned()])?;
    key_collision.key_hash = owner.key_hash;
    let (mut id_collision, _) = SessionResource::new(&tenant, vec![])?;
    id_collision.session_id = owner.session_id.clone();

    fdb::with_transaction(|tx| {
        let owner = &owner;
        async move { owner.create(&tx).await }
    })
    .await?;

    let authenticated = fdb::with_transaction(|tx| {
        let key_hash = &owner.key_hash;
        async move { SessionResource::authenticate(&tx, key_hash).await }
    })
    .await?;
    assert_eq!(authenticated.subjects, owner.subjects);
    assert_eq!(authenticated.tenant_id, owner.tenant_id);
    assert_eq!(authenticated.session_id, owner.session_id);

    for (candidate, key_collision_expected) in [(&key_collision, true), (&id_collision, false)] {
        let result = fdb::with_transaction(|tx| async move { candidate.create(&tx).await }).await;
        if key_collision_expected {
            assert!(matches!(
                result,
                Err(storage::Error::Resource(session::Error::KeyCollision))
            ));
        } else {
            assert!(matches!(
                result,
                Err(storage::Error::Resource(session::Error::AlreadyExists))
            ));
        }
    }

    let session_subspace =
        tenant_subspace(&owner.tenant_id).subspace(&("session", owner.session_id.as_str()));
    let lookup = namespace_subspace().pack(&("session-key", owner.key_hash.as_slice()));
    let expires_at_ms = owner.expires_at_ms + REFRESH_EXTENSION_MS;
    let original_expiry = expiry_key(&owner, owner.expires_at_ms);
    let refreshed_expiry = expiry_key(&owner, expires_at_ms);
    fdb::database()?
        .run(|tx, _| {
            let owner = &owner;
            let session_subspace = &session_subspace;
            let lookup = &lookup;
            let original_expiry = &original_expiry;
            let refreshed_expiry = &refreshed_expiry;
            async move {
                let state = tx
                    .get(&session_subspace.pack(&"state"), false)
                    .await?
                    .ok_or_else(|| FdbBindingError::CustomError("missing session state".into()))?;
                let (key_hash, expiry): (Vec<u8>, u64) =
                    unpack(&state).map_err(FdbBindingError::PackError)?;
                assert_eq!(key_hash, owner.key_hash);
                assert_eq!(expiry, owner.expires_at_ms);
                let indexed = tx
                    .get(lookup, false)
                    .await?
                    .ok_or_else(|| FdbBindingError::CustomError("missing session lookup".into()))?;
                let (tenant_id, session_id): (String, String) =
                    unpack(&indexed).map_err(FdbBindingError::PackError)?;
                assert_eq!(tenant_id, owner.tenant_id);
                assert_eq!(session_id, owner.session_id);
                assert_eq!(
                    tx.get(original_expiry, false).await?.as_deref(),
                    Some([].as_slice())
                );
                let subjects = read_prefix(&tx, &session_subspace.subspace(&"subject")).await?;
                let expected: BTreeMap<_, _> = owner
                    .subjects
                    .iter()
                    .map(|subject| {
                        (
                            session_subspace.pack(&("subject", subject.as_str())),
                            vec![],
                        )
                    })
                    .collect();
                assert_eq!(subjects, expected);

                // Simulate a later refresh so retrying creation must preserve the newer expiry.
                tx.set(
                    &session_subspace.pack(&"state"),
                    &pack(&(owner.key_hash.as_slice(), expires_at_ms)),
                );
                tx.clear(original_expiry);
                tx.set(refreshed_expiry, &[]);
                Ok(())
            }
        })
        .await?;

    fdb::with_transaction(|tx| {
        let owner = &owner;
        async move { owner.create(&tx).await }
    })
    .await?;

    let tx = fdb::database()?.create_trx()?;
    let state = tx
        .get(&session_subspace.pack(&"state"), false)
        .await?
        .context("missing session")?;
    let (_, stored_expiry): (Vec<u8>, u64) = unpack(&state)?;
    assert_eq!(stored_expiry, expires_at_ms);
    assert!(tx.get(&original_expiry, false).await?.is_none());
    assert!(tx.get(&refreshed_expiry, false).await?.is_some());
    let collision_prefix = tenant_subspace(&other_tenant.tenant_id)
        .subspace(&("session", key_collision.session_id.as_str()));
    assert!(read_prefix(&tx, &collision_prefix).await?.is_empty());
    for collision in [&key_collision, &id_collision] {
        assert!(
            tx.get(&expiry_key(collision, collision.expires_at_ms), false)
                .await?
                .is_none()
        );
    }
    assert!(
        tx.get(
            &namespace_subspace().pack(&("session-key", id_collision.key_hash.as_slice())),
            false
        )
        .await?
        .is_none()
    );

    let result = fdb::with_transaction(|tx| {
        let owner = &owner;
        let session_subspace = &session_subspace;
        async move {
            tx.set(
                &session_subspace.pack(&"state"),
                &pack(&(&[0u8; 31][..], expires_at_ms)),
            );
            owner.create(&tx).await
        }
    })
    .await;
    assert!(matches!(result, Err(storage::Error::InvalidKeyHash(_))));

    for tenant in [&tenant, &other_tenant] {
        let (begin, end) = tenant_subspace(&tenant.tenant_id).range();
        tx.clear_range(&begin, &end);
        tx.clear(&namespace_subspace().pack(&("tenant-key", tenant.key_hash.as_slice())));
    }
    tx.clear(&lookup);
    tx.clear(&refreshed_expiry);
    tx.commit().await?;
    Ok(())
}

pub(crate) async fn authentication_and_refresh_require_active_matching_state() -> Result<()> {
    let (tenant, _) = TenantResource::new(ObjectId::new_v7().to_string())?;
    let (mut session, _) = SessionResource::new(&tenant, vec!["u:test".to_owned()])?;
    let tx = fdb::database()?.create_trx()?;
    session.create(&tx).await?;

    let lookup = namespace_subspace().pack(&("session-key", session.key_hash.as_slice()));
    let state =
        tenant_subspace(&tenant.tenant_id).pack(&("session", session.session_id.as_str(), "state"));
    for value in [
        pack(&(&[0u8; 32][..], session.expires_at_ms)),
        pack(&(session.key_hash.as_slice(), 0u64)),
    ] {
        tx.set(&state, &value);
        assert!(matches!(
            SessionResource::authenticate(&tx, &session.key_hash).await,
            Err(storage::Error::Resource(session::Error::InvalidKey))
        ));
        assert!(matches!(
            SessionResource::refresh(&tx, &session.key_hash).await,
            Err(storage::Error::Resource(session::Error::InvalidKey))
        ));
    }
    tx.set(&state, &pack(&(&[0u8; 31][..], session.expires_at_ms)));
    assert!(matches!(
        SessionResource::authenticate(&tx, &session.key_hash).await,
        Err(storage::Error::InvalidKeyHash(_))
    ));
    tx.clear(&state);
    assert!(matches!(
        SessionResource::authenticate(&tx, &session.key_hash).await,
        Err(storage::Error::Resource(session::Error::InvalidKey))
    ));
    tx.clear(&lookup);
    assert!(matches!(
        SessionResource::authenticate(&tx, &session.key_hash).await,
        Err(storage::Error::Resource(session::Error::InvalidKey))
    ));

    // An expiry already beyond now plus one hour must never be shortened by refresh.
    tx.clear(&expiry_key(&session, session.expires_at_ms));
    session.expires_at_ms += REFRESH_EXTENSION_MS;
    session.create(&tx).await?;
    let refreshed = SessionResource::refresh(&tx, &session.key_hash).await?;
    assert_eq!(refreshed.expires_at_ms, session.expires_at_ms);
    assert_eq!(refreshed.subjects, session.subjects);
    assert_eq!(refreshed.key_hash, session.key_hash);
    assert_eq!(refreshed.session_id, session.session_id);
    assert_eq!(refreshed.tenant_id, session.tenant_id);
    assert!(
        tx.get(&expiry_key(&session, session.expires_at_ms), false)
            .await?
            .is_some()
    );
    Ok(())
}

pub(crate) async fn refresh_and_revocation_conflict_in_both_orders() -> Result<()> {
    let (tenant, _) = TenantResource::new(ObjectId::new_v7().to_string())?;
    for refresh_commits_first in [true, false] {
        let (mut session, _) = SessionResource::new(&tenant, vec!["u:race".to_owned()])?;
        session.expires_at_ms -= REFRESH_EXTENSION_MS;
        fdb::with_transaction(|tx| {
            let session = &session;
            async move { session.create(&tx).await }
        })
        .await?;
        let stale = fdb::database()?.create_trx()?;
        let refreshed;
        if refresh_commits_first {
            SessionResource::revoke(&stale, &tenant, &session.session_id).await?;
            refreshed = fdb::with_transaction(|tx| {
                let key_hash = &session.key_hash;
                async move { SessionResource::refresh(&tx, key_hash).await }
            })
            .await?;
        } else {
            refreshed = SessionResource::refresh(&stale, &session.key_hash).await?;
            fdb::with_transaction(|tx| {
                let tenant = &tenant;
                let session = &session;
                async move { SessionResource::revoke(&tx, tenant, &session.session_id).await }
            })
            .await?;
        }
        assert!(refreshed.expires_at_ms > session.expires_at_ms);
        let conflict = stale
            .commit()
            .await
            .err()
            .context("expected a commit conflict")?;
        assert_eq!(conflict.code(), FDB_NOT_COMMITTED);

        if refresh_commits_first {
            let tx = fdb::database()?.create_trx()?;
            assert!(
                tx.get(&expiry_key(&session, session.expires_at_ms), false)
                    .await?
                    .is_none()
            );
            assert!(
                tx.get(&expiry_key(&refreshed, refreshed.expires_at_ms), false)
                    .await?
                    .is_some()
            );
            fdb::with_transaction(|tx| {
                let tenant = &tenant;
                let session = &session;
                async move { SessionResource::revoke(&tx, tenant, &session.session_id).await }
            })
            .await?;
        }
        let result = fdb::with_transaction(|tx| {
            let key_hash = &session.key_hash;
            async move { SessionResource::refresh(&tx, key_hash).await }
        })
        .await;
        assert!(matches!(
            result,
            Err(storage::Error::Resource(session::Error::InvalidKey))
        ));
        let tx = fdb::database()?.create_trx()?;
        assert!(
            read_prefix(&tx, &tenant_subspace(&tenant.tenant_id))
                .await?
                .is_empty()
        );
        assert!(
            tx.get(
                &namespace_subspace().pack(&("session-key", session.key_hash.as_slice())),
                false
            )
            .await?
            .is_none()
        );
        for expiry_ms in [session.expires_at_ms, refreshed.expires_at_ms] {
            assert!(
                tx.get(&expiry_key(&session, expiry_ms), false)
                    .await?
                    .is_none()
            );
        }
    }
    Ok(())
}

fn expiry_key(session: &SessionResource, expires_at_ms: u64) -> Vec<u8> {
    namespace_subspace().pack(&(
        "session-expiry",
        expires_at_ms.to_be_bytes().as_slice(),
        session.tenant_id.as_str(),
        session.session_id.as_str(),
    ))
}

async fn read_prefix(
    tx: &Transaction,
    prefix: &Subspace,
) -> Result<BTreeMap<Vec<u8>, Vec<u8>>, FdbBindingError> {
    let mut entries = BTreeMap::new();
    let mut range = Some(RangeOption::from(prefix.range()));
    let mut iteration = 1;
    while let Some(current) = range {
        let batch = tx.get_range(&current, iteration, false).await?;
        range = current.next_range(&batch);
        entries.extend(
            batch
                .iter()
                .map(|entry| (entry.key().to_vec(), entry.value().to_vec())),
        );
        iteration += 1;
    }
    Ok(entries)
}
