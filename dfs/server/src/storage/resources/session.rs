use std::{collections::BTreeSet, fmt, sync::Arc, time::Duration};

use foundationdb::{
    FdbBindingError, RangeOption, Transaction,
    options::StreamingMode,
    tuple::{Subspace, pack, unpack},
};

use crate::{
    auth::{self, KeyHash},
    clock,
    storage::{
        self,
        resources::{
            SUBJECT_MAX_BYTES,
            keys::{namespace_subspace, tenant_subspace},
            object::TreeHints,
            tenant::{self, TenantResource},
        },
    },
};

const FAMILY: &str = "session";
const KEY_HASH_FAMILY: &str = "session-key";
const EXPIRY_FAMILY: &str = "session-expiry";
const MAX_SUBJECTS: usize = 512;
const SESSION_TTL_MS: u64 = 3_600_000;
const SESSION_ID_LENGTH: usize = 32;
const EXPIRY_SWEEP_BATCH_SIZE: usize = 100;

#[derive(Debug)]
pub enum Error {
    InvalidSubject,
    TooManySubjects,
    KeyGeneration,
    ExpiryGeneration,
    AlreadyExists,
    KeyCollision,
    InvalidId,
    InvalidKey,
    NotFound,
    Tenant(tenant::Error),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidSubject => f.write_str("invalid session subject"),
            Self::TooManySubjects => f.write_str("too many session subjects"),
            Self::KeyGeneration => f.write_str("session key generation failed"),
            Self::ExpiryGeneration => f.write_str("session expiry generation failed"),
            Self::AlreadyExists => f.write_str("session already exists"),
            Self::KeyCollision => f.write_str("session key hash already exists"),
            Self::InvalidId => f.write_str("invalid session ID"),
            Self::InvalidKey => f.write_str("invalid or expired session key"),
            Self::NotFound => f.write_str("session not found"),
            Self::Tenant(error) => error.fmt(f),
        }
    }
}

impl std::error::Error for Error {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Tenant(error) => Some(error),
            _ => None,
        }
    }
}

impl From<Error> for storage::Error<Error> {
    fn from(error: Error) -> Self {
        Self::Resource(error)
    }
}

/**
 * @cc [owner:spolu,label:backend;error-handling] tenant-error-conversion
 * Tenant resource failures MUST retain their typed error inside the session error. FDB and
 * decoding failures MUST pass through unchanged to preserve retries and API error classification.
 */
impl From<storage::Error<tenant::Error>> for storage::Error<Error> {
    fn from(error: storage::Error<tenant::Error>) -> Self {
        match error {
            storage::Error::Open(error) => Self::Open(error),
            storage::Error::Transaction(error) => Self::Transaction(error),
            storage::Error::InvalidKeyHash(error) => Self::InvalidKeyHash(error),
            storage::Error::InvalidObjectId(error) => Self::InvalidObjectId(error),
            storage::Error::Receipt(error) => Self::Receipt(error),
            storage::Error::Resource(error) => Self::Resource(Error::Tenant(error)),
        }
    }
}

pub struct SessionResource {
    pub session_id: String,
    pub tenant: TenantResource,
    pub subjects: BTreeSet<String>,
    pub key_hash: KeyHash,
    pub expires_at_ms: u64,
    /// Shared process-local hints; every permission check still reads the current transaction.
    pub tree_hints: Arc<TreeHints>,
}

impl SessionResource {
    /**
     * @cc [owner:spolu,label:api;security] session-subject-validation
     * Subjects MUST contain at most 512 distinct values of 1-1,024 UTF-8 bytes each. Values MUST
     * remain exact and be deduplicated; the empty set MUST be accepted without consulting grants.
     */
    /**
     * @cc [owner:spolu,label:backend;security] session-creation-state
     * A new session MUST retain the supplied tenant and expire one hour after construction.
     * The plaintext bearer key MUST be returned separately and MUST NOT be stored in the resource.
     * Callers MUST construct the resource outside retrying transactions so its ID, key, subjects,
     * and expiry remain stable across attempts.
     */
    pub fn new(tenant: &TenantResource, subjects: Vec<String>) -> Result<(Self, String), Error> {
        if subjects
            .iter()
            .any(|subject| subject.is_empty() || subject.len() > SUBJECT_MAX_BYTES)
        {
            return Err(Error::InvalidSubject);
        }
        let subjects: BTreeSet<String> = subjects.into_iter().collect();
        if subjects.len() > MAX_SUBJECTS {
            return Err(Error::TooManySubjects);
        }

        let expires_at_ms = clock::now_ms()
            .map_err(|_| Error::ExpiryGeneration)?
            .checked_add(SESSION_TTL_MS)
            .ok_or(Error::ExpiryGeneration)?;
        let session_key = auth::new_key().map_err(|_| Error::KeyGeneration)?;
        let session = Self {
            session_id: uuid::Uuid::now_v7().simple().to_string(),
            tenant: tenant.clone(),
            subjects,
            key_hash: auth::hash_key(&session_key),
            expires_at_ms,
            tree_hints: TreeHints::shared(),
        };
        Ok((session, session_key))
    }

    /**
     * @cc [owner:spolu,label:backend;error-handling] session-create-idempotency
     * An existing session ID with the same key hash MUST succeed without rewriting stored state
     * or indexes. A different hash MUST return AlreadyExists without changing that session.
     */
    /**
     * @cc [owner:spolu,label:backend;security] session-index-consistency
     * Creation MUST write state, subject membership, key-hash lookup, and expiry index in the
     * caller's transaction. For a new session ID, an occupied key-hash lookup MUST return
     * KeyCollision before staging any writes. Plaintext bearer keys MUST NOT be persisted.
     */
    pub async fn create(&self, tx: &Transaction) -> Result<(), storage::Error<Error>> {
        let session_key = Self::session_key(&self.tenant.tenant_id, &self.session_id);
        if let Some(value) = tx
            .get(&session_key, false)
            .await
            .map_err(FdbBindingError::from)?
        {
            let (key_hash, _expires_at_ms): (Vec<u8>, u64) =
                unpack(&value).map_err(FdbBindingError::PackError)?;
            let key_hash = auth::key_hash_from_bytes(&key_hash)?;
            if key_hash == self.key_hash {
                // A retry after an unknown commit result finds our own record.
                return Ok(());
            }
            return Err(Error::AlreadyExists.into());
        }
        if tx
            .get(&Self::key_hash_key(&self.key_hash), false)
            .await
            .map_err(FdbBindingError::from)?
            .is_some()
        {
            return Err(Error::KeyCollision.into());
        }

        tx.set(
            &session_key,
            &pack(&(self.key_hash.as_slice(), self.expires_at_ms)),
        );
        let subjects = Self::subject_subspace(&self.tenant.tenant_id, &self.session_id);
        for subject in &self.subjects {
            tx.set(&subjects.pack(subject), &[]);
        }
        tx.set(
            &Self::key_hash_key(&self.key_hash),
            &pack(&(self.tenant.tenant_id.as_str(), self.session_id.as_str())),
        );
        tx.set(
            &Self::expiry_key(self.expires_at_ms, &self.tenant.tenant_id, &self.session_id),
            &[],
        );
        Ok(())
    }

    /**
     * @cc [owner:spolu,label:security;error-handling] session-key-authentication
     * Authentication MUST load the tenant from the lookup's tenant ID and verify the matching hash
     * and unexpired session state in the same transaction. Missing tenants or session entries,
     * mismatched hashes, and expired sessions MUST return InvalidKey.
     * Decoding failures MUST retain their storage error. Subjects MUST come from the stored session.
     */
    pub async fn authenticate(
        tx: &Transaction,
        key_hash: &KeyHash,
    ) -> Result<Self, storage::Error<Error>> {
        let value = tx
            .get(&Self::key_hash_key(key_hash), false)
            .await
            .map_err(FdbBindingError::from)?
            .ok_or(Error::InvalidKey)?;
        let (tenant_id, session_id): (String, String) =
            unpack(&value).map_err(FdbBindingError::PackError)?;
        let tenant = TenantResource::fetch(tx, &tenant_id)
            .await?
            .ok_or(Error::InvalidKey)?;
        let session = Self::fetch(tx, &tenant, &session_id)
            .await?
            .ok_or(Error::InvalidKey)?;
        if session.key_hash != *key_hash {
            return Err(Error::InvalidKey.into());
        }
        session.remaining_ttl()?;
        Ok(session)
    }

    pub fn remaining_ttl(&self) -> Result<Duration, Error> {
        let remaining_ms = self
            .expires_at_ms
            .checked_sub(clock::now_ms().map_err(|_| Error::ExpiryGeneration)?)
            .filter(|remaining_ms| *remaining_ms > 0)
            .ok_or(Error::InvalidKey)?;
        Ok(Duration::from_millis(remaining_ms))
    }

    /**
     * @cc [owner:spolu,label:backend;security] session-refresh
     * Refresh MUST authenticate against conflict-tracked FDB state and MUST NOT revive missing or
     * expired sessions. It MUST atomically replace the expiry index and set expiry to the maximum
     * of its current value and server time plus one hour, preserving identity, hash, and subjects.
     */
    pub async fn refresh(
        tx: &Transaction,
        key_hash: &KeyHash,
    ) -> Result<Self, storage::Error<Error>> {
        let mut session = Self::authenticate(tx, key_hash).await?;
        let now_ms = clock::now_ms().map_err(|_| Error::ExpiryGeneration)?;
        if session.expires_at_ms <= now_ms {
            return Err(Error::InvalidKey.into());
        }
        let expires_at_ms = session.expires_at_ms.max(
            now_ms
                .checked_add(SESSION_TTL_MS)
                .ok_or(Error::ExpiryGeneration)?,
        );
        tx.clear(&Self::expiry_key(
            session.expires_at_ms,
            &session.tenant.tenant_id,
            &session.session_id,
        ));
        tx.set(
            &Self::session_key(&session.tenant.tenant_id, &session.session_id),
            &pack(&(session.key_hash.as_slice(), expires_at_ms)),
        );
        tx.set(
            &Self::expiry_key(
                expires_at_ms,
                &session.tenant.tenant_id,
                &session.session_id,
            ),
            &[],
        );
        session.expires_at_ms = expires_at_ms;
        Ok(session)
    }

    /**
     * @cc [owner:spolu,label:backend;security] session-revocation
     * Revocation MUST resolve the session only under the supplied authenticated tenant and return
     * NotFound for unknown or cross-tenant IDs. It MUST atomically remove state, subjects, key
     * lookup, and expiry index. Concurrent refresh MUST conflict and MUST NOT undo revocation.
     */
    pub async fn revoke(
        tx: &Transaction,
        tenant: &TenantResource,
        session_id: &str,
    ) -> Result<KeyHash, storage::Error<Error>> {
        if session_id.is_empty() {
            return Err(Error::InvalidId.into());
        }
        if session_id.len() != SESSION_ID_LENGTH {
            return Err(Error::NotFound.into());
        }
        let tenant_id = &tenant.tenant_id;
        let session = Self::fetch(tx, tenant, session_id)
            .await?
            .ok_or(Error::NotFound)?;
        Self::clear(
            tx,
            tenant_id,
            session_id,
            &session.key_hash,
            session.expires_at_ms,
        );
        Ok(session.key_hash)
    }

    /**
     * @cc [owner:spolu,label:backend;security] session-expiry-cleanup
     * Cleanup MUST inspect at most 100 expiry entries through cutoff_ms in the caller's transaction.
     * It MUST re-read session state with conflict tracking and remove the session and its indexes
     * only when its stored expiry is at or before cutoff_ms. Stale or orphaned expiry entries MUST
     * be removed without deleting an unexpired session. The result MUST count processed index
     * entries and actually revoked sessions separately, as `(processed, revoked)`.
     */
    pub async fn revoke_expired(
        tx: &Transaction,
        cutoff_ms: u64,
    ) -> Result<(usize, usize), storage::Error<Error>> {
        let prefix = namespace_subspace().subspace(&EXPIRY_FAMILY);
        let begin = prefix.range().0;
        let end = prefix
            .subspace(&cutoff_ms.to_be_bytes().as_slice())
            .range()
            .1;
        let range = RangeOption {
            limit: Some(EXPIRY_SWEEP_BATCH_SIZE),
            mode: StreamingMode::WantAll,
            ..RangeOption::from((begin, end))
        };
        let entries = tx
            .get_range(&range, 1, false)
            .await
            .map_err(FdbBindingError::from)?;
        let processed = entries.len();
        let mut revoked = 0;
        // Own each row across the awaited state read.
        for entry in entries {
            let (_expiry_bytes, tenant_id, session_id): (Vec<u8>, String, String) = prefix
                .unpack(entry.key())
                .map_err(FdbBindingError::PackError)?;
            if let Some(value) = tx
                .get(&Self::session_key(&tenant_id, &session_id), false)
                .await
                .map_err(FdbBindingError::from)?
            {
                let (key_hash, expires_at_ms): (Vec<u8>, u64) =
                    unpack(&value).map_err(FdbBindingError::PackError)?;
                let key_hash = auth::key_hash_from_bytes(&key_hash)?;
                if expires_at_ms <= cutoff_ms {
                    Self::clear(tx, &tenant_id, &session_id, &key_hash, expires_at_ms);
                    revoked += 1;
                }
            }
            tx.clear(entry.key());
        }
        Ok((processed, revoked))
    }

    fn clear(
        tx: &Transaction,
        tenant_id: &str,
        session_id: &str,
        key_hash: &KeyHash,
        expires_at_ms: u64,
    ) {
        let (begin, end) = tenant_subspace(tenant_id)
            .subspace(&(FAMILY, session_id))
            .range();
        tx.clear_range(&begin, &end);
        tx.clear(&Self::key_hash_key(key_hash));
        tx.clear(&Self::expiry_key(expires_at_ms, tenant_id, session_id));
    }

    async fn fetch(
        tx: &Transaction,
        tenant: &TenantResource,
        session_id: &str,
    ) -> Result<Option<Self>, storage::Error<Error>> {
        let tenant_id = &tenant.tenant_id;
        let Some(value) = tx
            .get(&Self::session_key(tenant_id, session_id), false)
            .await
            .map_err(FdbBindingError::from)?
        else {
            return Ok(None);
        };
        let (key_hash, expires_at_ms): (Vec<u8>, u64) =
            unpack(&value).map_err(FdbBindingError::PackError)?;
        let key_hash = auth::key_hash_from_bytes(&key_hash)?;
        let prefix = Self::subject_subspace(tenant_id, session_id);
        let mut subjects = BTreeSet::new();
        let mut range = Some(RangeOption::from(prefix.range()));
        let mut iteration = 1;
        while let Some(current) = range {
            let batch = tx
                .get_range(&current, iteration, false)
                .await
                .map_err(FdbBindingError::from)?;
            range = current.next_range(&batch);
            for entry in &batch {
                let subject: String = prefix
                    .unpack(entry.key())
                    .map_err(FdbBindingError::PackError)?;
                subjects.insert(subject);
            }
            iteration += 1;
        }
        Ok(Some(Self {
            session_id: session_id.to_owned(),
            tenant: tenant.clone(),
            subjects,
            key_hash,
            expires_at_ms,
            tree_hints: TreeHints::shared(),
        }))
    }

    fn session_key(tenant_id: &str, session_id: &str) -> Vec<u8> {
        tenant_subspace(tenant_id).pack(&(FAMILY, session_id, "state"))
    }

    fn subject_subspace(tenant_id: &str, session_id: &str) -> Subspace {
        tenant_subspace(tenant_id).subspace(&(FAMILY, session_id, "subject"))
    }

    fn key_hash_key(key_hash: &KeyHash) -> Vec<u8> {
        namespace_subspace().pack(&(KEY_HASH_FAMILY, key_hash.as_slice()))
    }

    fn expiry_key(expires_at_ms: u64, tenant_id: &str, session_id: &str) -> Vec<u8> {
        namespace_subspace().pack(&(
            EXPIRY_FAMILY,
            expires_at_ms.to_be_bytes().as_slice(),
            tenant_id,
            session_id,
        ))
    }
}
