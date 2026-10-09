use dfs_protocol::ObjectId;
use foundationdb::{
    FdbBindingError, Transaction,
    tuple::{pack, unpack},
};

use crate::auth::KeyHash;

const SUBSPACE: &str = "tenant";

pub struct TenantResource {
    pub tenant_id: String,
    pub root_id: ObjectId,
    pub key_hash: KeyHash,
}

impl TenantResource {
    pub async fn fetch(
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

    pub fn create(&self, transaction: &Transaction) {
        let value = pack(&(self.root_id.as_bytes().as_slice(), self.key_hash.as_slice()));
        transaction.set(&key(&self.tenant_id), &value);
    }
}

fn key(tenant_id: &str) -> Vec<u8> {
    pack(&(SUBSPACE, tenant_id))
}
