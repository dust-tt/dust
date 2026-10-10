use std::fmt;

use dfs_protocol::ObjectId;
use foundationdb::{
    FdbBindingError, Transaction,
    tuple::{pack, unpack},
};

use crate::{
    auth::{self, KeyHash},
    storage::{
        self,
        resources::keys::{namespace_subspace, tenant_subspace},
    },
};

const FAMILY: &str = "tenant";
const KEY_HASH_FAMILY: &str = "tenant-key";
const TENANT_ID_MAX_BYTES: usize = 256;

#[derive(Debug)]
pub enum Error {
    InvalidId,
    KeyGeneration,
    KeyCollision,
    AlreadyExists,
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidId => f.write_str("invalid tenant ID"),
            Self::KeyGeneration => f.write_str("tenant key generation failed"),
            Self::KeyCollision => f.write_str("tenant key hash already exists"),
            Self::AlreadyExists => f.write_str("tenant already exists"),
        }
    }
}

impl std::error::Error for Error {}

impl From<Error> for storage::Error<Error> {
    fn from(error: Error) -> Self {
        Self::Resource(error)
    }
}

pub struct TenantResource {
    pub tenant_id: String,
    pub root_id: ObjectId,
    pub key_hash: KeyHash,
}

impl TenantResource {
    /// A new tenant with its bearer key, the only time the key is visible. Build it before the
    /// transaction, so retries store the same key and root.
    pub fn new(tenant_id: String) -> Result<(Self, String), Error> {
        if !Self::is_valid_id(&tenant_id) {
            return Err(Error::InvalidId);
        }
        let tenant_key = auth::new_key().map_err(|_| Error::KeyGeneration)?;
        let tenant = Self {
            tenant_id,
            root_id: ObjectId::new_v7(),
            key_hash: auth::hash_key(&tenant_key),
        };
        Ok((tenant, tenant_key))
    }

    /// @cc [owner:spolu,label:backend;error-handling] tenant-create-idempotency
    /// An existing tenant with a different root MUST return AlreadyExists. An existing tenant with
    /// the same root MUST succeed so a retry can recognize its own commit. Both cases MUST leave the
    /// stored record unchanged.
    /**
     * @cc [owner:spolu,label:backend;security] tenant-key-index-consistency
     * A new tenant's record and key-hash lookup MUST be written in the caller's transaction. For a
     * new tenant ID, an occupied lookup MUST return KeyCollision before staging either write.
     * Existing tenants MUST leave the lookup unchanged, including on retries and duplicate-ID
     * failures.
     */
    pub async fn create(&self, tx: &Transaction) -> Result<(), storage::Error<Error>> {
        match Self::fetch(tx, &self.tenant_id).await? {
            // A retry after an unknown commit result finds our own record.
            Some(existing) if existing.root_id == self.root_id => Ok(()),
            Some(_) => Err(Error::AlreadyExists.into()),
            None => {
                if tx
                    .get(&Self::key_hash_key(&self.key_hash), false)
                    .await
                    .map_err(FdbBindingError::from)?
                    .is_some()
                {
                    return Err(Error::KeyCollision.into());
                }
                let value = pack(&(self.root_id.as_bytes().as_slice(), self.key_hash.as_slice()));
                tx.set(&Self::tenant_key(&self.tenant_id), &value);
                tx.set(
                    &Self::key_hash_key(&self.key_hash),
                    &pack(&self.tenant_id.as_str()),
                );
                Ok(())
            }
        }
    }

    /// @cc [owner:spolu,label:api;security] tenant-id-validation
    /// Tenant IDs MUST contain 1-256 UTF-8 bytes and MUST NOT contain NUL.
    fn is_valid_id(tenant_id: &str) -> bool {
        !tenant_id.is_empty() && tenant_id.len() <= TENANT_ID_MAX_BYTES && !tenant_id.contains('\0')
    }

    async fn fetch(tx: &Transaction, tenant_id: &str) -> Result<Option<Self>, FdbBindingError> {
        let Some(value) = tx.get(&Self::tenant_key(tenant_id), false).await? else {
            return Ok(None);
        };
        let (root_id, key_hash): (Vec<u8>, Vec<u8>) =
            unpack(&value).map_err(FdbBindingError::PackError)?;
        let corrupt =
            || FdbBindingError::CustomError(format!("corrupt tenant {tenant_id:?}").into());
        Ok(Some(Self {
            tenant_id: tenant_id.to_owned(),
            root_id: ObjectId::from_bytes(root_id.try_into().map_err(|_| corrupt())?)
                .map_err(|_| corrupt())?,
            key_hash: key_hash.try_into().map_err(|_| corrupt())?,
        }))
    }

    fn tenant_key(tenant_id: &str) -> Vec<u8> {
        tenant_subspace(tenant_id).pack(&FAMILY)
    }

    fn key_hash_key(key_hash: &KeyHash) -> Vec<u8> {
        namespace_subspace().pack(&(KEY_HASH_FAMILY, key_hash.as_slice()))
    }
}
