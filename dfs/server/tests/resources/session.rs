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
