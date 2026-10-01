use dfs_protocol::{error::status, rpc::ErrorCode, validate};
use tonic::Status;

/// @cc [owner:spolu,label:security] disjoint-key-prefixes
/// Keys MUST encode the workspace before the family. Variable components followed by another
/// component MUST be length-delimited; data block numbers MUST sort numerically.
#[derive(Clone)]
pub(crate) struct Keys(Vec<u8>);
impl Keys {
    pub fn new(workspace: &str) -> Result<Self, Status> {
        validate::workspace(workspace)?;
        let mut key = vec![1];
        string(&mut key, workspace)?;
        Ok(Self(key))
    }
    fn family(&self, family: u8) -> Vec<u8> {
        let mut key = self.0.clone();
        key.push(family);
        key
    }
    fn object_family(&self, family: u8, id: &str) -> Result<Vec<u8>, Status> {
        let mut key = self.family(family);
        let id = validate::id(id)?;
        key.extend_from_slice(
            uuid::Uuid::parse_str(&id)
                .map_err(|_| status(ErrorCode::InvalidInput))?
                .as_bytes(),
        );
        Ok(key)
    }
    pub fn object(&self, id: &str) -> Result<Vec<u8>, Status> {
        self.object_family(1, id)
    }
    pub fn children(&self, parent: &str) -> Result<Vec<u8>, Status> {
        self.object_family(2, parent)
    }
    pub fn child(&self, parent: &str, name: &str) -> Result<Vec<u8>, Status> {
        let mut key = self.children(parent)?;
        key.extend_from_slice(name.as_bytes());
        Ok(key)
    }
    pub fn grants(&self, object: &str) -> Result<Vec<u8>, Status> {
        self.object_family(3, object)
    }
    pub fn grant(&self, object: &str, grant: &str) -> Result<Vec<u8>, Status> {
        let mut key = self.grants(object)?;
        key.extend_from_slice(grant.as_bytes());
        Ok(key)
    }
    pub fn granted(&self, grant: &str) -> Result<Vec<u8>, Status> {
        let mut key = self.family(4);
        string(&mut key, grant)?;
        Ok(key)
    }
    pub fn granted_object(&self, grant: &str, object: &str) -> Result<Vec<u8>, Status> {
        let mut key = self.granted(grant)?;
        key.extend_from_slice(
            uuid::Uuid::parse_str(object)
                .map_err(|_| status(ErrorCode::InvalidInput))?
                .as_bytes(),
        );
        Ok(key)
    }
    pub fn data(&self, object: &str) -> Result<Vec<u8>, Status> {
        self.object_family(5, object)
    }
    pub fn block(&self, object: &str, index: u64) -> Result<Vec<u8>, Status> {
        let mut key = self.data(object)?;
        key.extend_from_slice(&index.to_be_bytes());
        Ok(key)
    }
    pub fn workspace(&self) -> Vec<u8> {
        self.family(6)
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

pub(crate) fn prefix_end(prefix: &[u8]) -> Vec<u8> {
    let mut end = prefix.to_vec();
    while let Some(last) = end.pop() {
        if last != u8::MAX {
            end.push(last + 1);
            break;
        }
    }
    end
}
