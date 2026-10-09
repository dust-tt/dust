use dfs_protocol::{ObjectId, error::status, rpc::ErrorCode};
use foundationdb::{
    FdbBindingError, Transaction,
    tuple::{pack, unpack},
};
use tonic::Status;

use crate::{
    auth::{self, KeyHash},
    storage::resources::layout::tenant_subspace,
};

const FAMILY: &str = "tenant";
const TENANT_ID_MAX_BYTES: usize = 256;

pub struct TenantResource {
    pub tenant_id: String,
    pub root_id: ObjectId,
    pub key_hash: KeyHash,
}

impl TenantResource {
    /// A new tenant with its bearer key, the only time the key is visible. Build it before the
    /// transaction, so retries store the same key and root.
    pub fn new(tenant_id: String) -> Result<(Self, String), Status> {
        if !Self::is_valid_id(&tenant_id) {
            return Err(status(ErrorCode::InvalidInput));
        }
        let tenant_key = auth::new_key().map_err(|_| status(ErrorCode::Internal))?;
        let tenant = Self {
            tenant_id,
            root_id: ObjectId::new_v7(),
            key_hash: auth::hash_key(&tenant_key),
        };
        Ok((tenant, tenant_key))
    }

    /// Stores this tenant; `false` when another tenant already holds its ID.
    pub async fn create(&self, transaction: &Transaction) -> Result<bool, FdbBindingError> {
        match Self::fetch(transaction, &self.tenant_id).await? {
            // A retry after an unknown commit result finds our own record.
            Some(existing) => Ok(existing.root_id == self.root_id),
            None => {
                self.insert(transaction);
                Ok(true)
            }
        }
    }

    fn is_valid_id(tenant_id: &str) -> bool {
        !tenant_id.is_empty() && tenant_id.len() <= TENANT_ID_MAX_BYTES
    }

    async fn fetch(
        transaction: &Transaction,
        tenant_id: &str,
    ) -> Result<Option<Self>, FdbBindingError> {
        let Some(value) = transaction.get(&key(tenant_id), false).await? else {
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

    fn insert(&self, transaction: &Transaction) {
        let value = pack(&(self.root_id.as_bytes().as_slice(), self.key_hash.as_slice()));
        transaction.set(&key(&self.tenant_id), &value);
    }
}

fn key(tenant_id: &str) -> Vec<u8> {
    tenant_subspace(tenant_id).pack(&FAMILY)
}
