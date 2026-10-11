use std::{
    collections::BTreeSet,
    fmt,
    time::{SystemTime, UNIX_EPOCH},
};

use foundationdb::{
    FdbBindingError, Transaction,
    tuple::{pack, unpack},
};

use crate::{
    auth::{self, KeyHash},
    storage::{
        self,
        resources::{
            keys::{namespace_subspace, tenant_subspace},
            tenant::TenantResource,
        },
    },
};

const FAMILY: &str = "session";
const KEY_HASH_FAMILY: &str = "session-key";
const EXPIRY_FAMILY: &str = "session-expiry";
const SUBJECT_MAX_BYTES: usize = 1_024;
const MAX_SUBJECTS: usize = 512;
const SESSION_TTL_MS: u64 = 3_600_000;

#[derive(Debug)]
pub enum Error {
    InvalidSubject,
    TooManySubjects,
    KeyGeneration,
    ExpiryGeneration,
    AlreadyExists,
    KeyCollision,
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
        }
    }
}

impl std::error::Error for Error {}

impl From<Error> for storage::Error<Error> {
    fn from(error: Error) -> Self {
        Self::Resource(error)
    }
}

pub struct SessionResource {
    pub session_id: String,
    pub tenant_id: String,
    pub subjects: BTreeSet<String>,
    pub key_hash: KeyHash,
    pub expires_at_ms: u64,
}

impl SessionResource {
    /**
     * @cc [owner:spolu,label:api;security] session-subject-validation
     * Subjects MUST contain at most 512 distinct values of 1-1,024 UTF-8 bytes each. Values MUST
     * remain exact and be deduplicated; the empty set MUST be accepted without consulting grants.
     */
    /**
     * @cc [owner:spolu,label:backend;security] session-creation-state
     * A new session MUST belong to the supplied tenant and expire one hour after construction.
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

        let now_ms: u64 = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| Error::ExpiryGeneration)?
            .as_millis()
            .try_into()
            .map_err(|_| Error::ExpiryGeneration)?;
        let expires_at_ms = now_ms
            .checked_add(SESSION_TTL_MS)
            .ok_or(Error::ExpiryGeneration)?;
        let session_key = auth::new_key().map_err(|_| Error::KeyGeneration)?;
        let session = Self {
            session_id: uuid::Uuid::now_v7().simple().to_string(),
            tenant_id: tenant.tenant_id.clone(),
            subjects,
            key_hash: auth::hash_key(&session_key),
            expires_at_ms,
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
        let session_key = Self::session_key(&self.tenant_id, &self.session_id);
        if let Some(value) = tx
            .get(&session_key, false)
            .await
            .map_err(FdbBindingError::from)?
        {
            let (key_hash, _expires_at_ms): (Vec<u8>, u64) =
                unpack(&value).map_err(FdbBindingError::PackError)?;
            let key_hash =
                auth::key_hash_from_bytes(&key_hash).map_err(storage::Error::InvalidKeyHash)?;
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
        for subject in &self.subjects {
            tx.set(
                &Self::subject_key(&self.tenant_id, &self.session_id, subject),
                &[],
            );
        }
        tx.set(
            &Self::key_hash_key(&self.key_hash),
            &pack(&(self.tenant_id.as_str(), self.session_id.as_str())),
        );
        tx.set(
            &Self::expiry_key(self.expires_at_ms, &self.tenant_id, &self.session_id),
            &[],
        );
        Ok(())
    }

    fn session_key(tenant_id: &str, session_id: &str) -> Vec<u8> {
        tenant_subspace(tenant_id).pack(&(FAMILY, session_id, "state"))
    }

    fn subject_key(tenant_id: &str, session_id: &str, subject: &str) -> Vec<u8> {
        tenant_subspace(tenant_id).pack(&(FAMILY, session_id, "subject", subject))
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
