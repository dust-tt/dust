use crate::tree::GrantId;
use dfs_protocol::{ObjectId, ObjectRef};
use dfs_protocol::{error::status, rpc::ErrorCode, validate};
use tonic::Status;

/// @cc [owner:spolu,label:security] disjoint-key-prefixes
/// Keys MUST encode the tenant before the family. Variable components followed by another
/// component MUST be length-delimited; data block numbers MUST sort numerically.
#[derive(Clone, PartialEq, Eq)]
pub struct Keys(Vec<u8>);
impl Keys {
    pub fn new(tenant: &str) -> Result<Self, Status> {
        validate::tenant(tenant)?;
        let mut key = vec![1];
        string(&mut key, tenant)?;
        Ok(Self(key))
    }
    fn family(&self, family: u8) -> Vec<u8> {
        let mut key = Vec::with_capacity(self.0.len() + 17);
        key.extend_from_slice(&self.0);
        key.push(family);
        key
    }
    fn object_family(&self, family: u8, id: &ObjectRef) -> Result<Vec<u8>, Status> {
        let mut key = self.family(family);
        let id = validate::id_ref(id)?;
        key.extend_from_slice(
            id.real()
                .map_err(|_| status(ErrorCode::InvalidInput))?
                .as_bytes(),
        );
        Ok(key)
    }
    pub fn object(&self, id: &ObjectRef) -> Result<Vec<u8>, Status> {
        self.object_family(1, id)
    }
    pub fn objects(&self) -> Vec<u8> {
        self.family(1)
    }
    pub fn search_pending(&self) -> Vec<u8> {
        self.family(30)
    }
    pub fn pending_object(&self, id: &ObjectRef) -> Result<Vec<u8>, Status> {
        self.object_family(30, id)
    }
    pub fn search_meta(&self) -> Vec<u8> {
        self.family(31)
    }
    pub fn children(&self, parent: &ObjectRef) -> Result<Vec<u8>, Status> {
        self.object_family(2, parent)
    }
    pub fn all_children(&self) -> Vec<u8> {
        self.family(2)
    }
    pub fn child(&self, parent: &ObjectRef, name: &str) -> Result<Vec<u8>, Status> {
        let mut key = self.children(parent)?;
        key.extend_from_slice(name.as_bytes());
        Ok(key)
    }
    pub fn grants(&self, object: &ObjectRef) -> Result<Vec<u8>, Status> {
        self.object_family(3, object)
    }
    pub fn grant(&self, object: &ObjectRef, grant: GrantId) -> Result<Vec<u8>, Status> {
        let mut key = self.grants(object)?;
        key.extend_from_slice(&grant.0.to_be_bytes());
        Ok(key)
    }
    pub fn granted(&self, grant: GrantId) -> Vec<u8> {
        let mut key = self.family(4);
        key.extend_from_slice(&grant.0.to_be_bytes());
        key
    }
    pub fn granted_object(&self, grant: GrantId, object: &ObjectRef) -> Result<Vec<u8>, Status> {
        let mut key = self.granted(grant);
        key.extend_from_slice(
            object
                .real()
                .map_err(|_| status(ErrorCode::InvalidInput))?
                .as_bytes(),
        );
        Ok(key)
    }
    pub fn data(&self, object: &ObjectRef) -> Result<Vec<u8>, Status> {
        self.object_family(5, object)
    }
    pub fn block(&self, object: &ObjectRef, index: u64) -> Result<Vec<u8>, Status> {
        let mut key = self.data(object)?;
        key.extend_from_slice(&index.to_be_bytes());
        Ok(key)
    }
    pub fn tenant(&self) -> Vec<u8> {
        self.family(6)
    }
    pub fn listing_version(&self, id: &ObjectRef) -> Result<Vec<u8>, Status> {
        self.object_family(9, id)
    }
    pub fn authorization_version(&self) -> Vec<u8> {
        self.family(10)
    }
    pub fn metadata(&self, id: &ObjectRef) -> Result<Vec<u8>, Status> {
        self.object_family(8, id)
    }
    pub fn directory_state(&self, id: &ObjectRef) -> Result<Vec<u8>, Status> {
        self.object_family(7, id)
    }
    pub fn directory_time(&self, id: &ObjectRef) -> Result<Vec<u8>, Status> {
        self.object_family(26, id)
    }
    pub fn membership_version(&self, id: &ObjectRef) -> Result<Vec<u8>, Status> {
        self.object_family(27, id)
    }
    pub fn grant_name(&self, name: &str) -> Vec<u8> {
        let mut key = self.family(11);
        key.extend_from_slice(name.as_bytes());
        key
    }
    pub fn grant_id(&self, id: GrantId) -> Vec<u8> {
        let mut key = self.family(12);
        key.extend_from_slice(&id.0.to_be_bytes());
        key
    }
    pub fn grant_next(&self) -> Vec<u8> {
        self.family(13)
    }
    pub fn grant_names(&self, object: &ObjectRef) -> Result<Vec<u8>, Status> {
        self.object_family(14, object)
    }
    pub fn object_grant_name(&self, object: &ObjectRef, name: &str) -> Result<Vec<u8>, Status> {
        let mut key = self.grant_names(object)?;
        key.extend_from_slice(name.as_bytes());
        Ok(key)
    }
    pub fn tree_nodes(&self) -> Vec<u8> {
        self.family(20)
    }
    pub fn tree_node(&self, id: ObjectId) -> Vec<u8> {
        let mut key = self.tree_nodes();
        key.extend_from_slice(id.as_bytes());
        key
    }
    pub fn tree_updates(&self) -> Vec<u8> {
        self.family(21)
    }
    pub fn tree_deleted(&self) -> Vec<u8> {
        self.family(22)
    }
    pub fn tree_incarnation(&self) -> Vec<u8> {
        self.family(23)
    }
    pub fn tree_floor(&self) -> Vec<u8> {
        self.family(24)
    }
    pub fn tree_deleted_count(&self) -> Vec<u8> {
        self.family(25)
    }
    pub fn registered_tenant(tenant: &str) -> Result<Vec<u8>, Status> {
        validate::tenant(tenant)?;
        let mut key = vec![2];
        key.extend_from_slice(tenant.as_bytes());
        Ok(key)
    }
}
fn string(key: &mut Vec<u8>, value: &str) -> Result<(), Status> {
    key.extend_from_slice(
        &u32::try_from(value.len())
            .map_err(|_| status(ErrorCode::InvalidInput))?
            .to_be_bytes(),
    );
    key.extend_from_slice(value.as_bytes());
    Ok(())
}

pub fn prefix_end(prefix: &[u8]) -> Vec<u8> {
    let mut end = prefix.to_vec();
    while let Some(last) = end.pop() {
        if last != u8::MAX {
            end.push(last + 1);
            break;
        }
    }
    end
}
