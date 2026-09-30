use anyhow::Result;

use crate::model::{EntryName, ObjectId, RequestId, WorkspaceId};

/**
 * @cc [owner:spolu,label:security] scoped-key-encoding
 * Every key MUST start with a schema byte and a length-delimited workspace ID before its family.
 * A grant followed by an object ID MUST be length-delimited too. Arbitrary UTF-8, including NUL
 * and slashes, MUST NOT alias another workspace, grant, or key family. UUIDs use exactly 16 bytes.
 */
#[derive(Clone)]
pub(super) struct Keyspace {
    pub workspace: WorkspaceId,
    prefix: Vec<u8>,
}

impl Keyspace {
    pub fn new(workspace: WorkspaceId) -> Result<Self> {
        let mut prefix = vec![1];
        append_string(&mut prefix, workspace.as_str())?;
        Ok(Self { workspace, prefix })
    }

    fn family(&self, tag: u8) -> Vec<u8> {
        let mut key = self.prefix.clone();
        key.push(tag);
        key
    }

    pub fn object(&self, id: ObjectId) -> Vec<u8> {
        let mut key = self.family(1);
        key.extend_from_slice(id.as_bytes());
        key
    }

    pub fn children(&self, parent: ObjectId) -> Vec<u8> {
        let mut key = self.family(2);
        key.extend_from_slice(parent.as_bytes());
        key
    }

    pub fn child(&self, parent: ObjectId, name: &EntryName) -> Vec<u8> {
        let mut key = self.children(parent);
        key.extend_from_slice(name.as_str().as_bytes());
        key
    }

    pub fn grants(&self, object: ObjectId) -> Vec<u8> {
        let mut key = self.family(3);
        key.extend_from_slice(object.as_bytes());
        key
    }

    pub fn grant(&self, object: ObjectId, grant: &str) -> Vec<u8> {
        let mut key = self.grants(object);
        key.extend_from_slice(grant.as_bytes());
        key
    }

    pub fn granted_objects(&self, grant: &str) -> Result<Vec<u8>> {
        let mut key = self.family(4);
        append_string(&mut key, grant)?;
        Ok(key)
    }

    pub fn granted_object(&self, grant: &str, object: ObjectId) -> Result<Vec<u8>> {
        let mut key = self.granted_objects(grant)?;
        key.extend_from_slice(object.as_bytes());
        Ok(key)
    }

    pub fn changes(&self) -> Vec<u8> {
        self.family(5)
    }

    pub fn change(&self, sequence: u64) -> Vec<u8> {
        let mut key = self.changes();
        key.extend_from_slice(&sequence.to_be_bytes());
        key
    }

    pub fn change_sequence(&self) -> Vec<u8> {
        self.family(6)
    }

    pub fn workspace_record(&self) -> Vec<u8> {
        self.family(7)
    }

    pub fn operation(&self, id: RequestId) -> Vec<u8> {
        let mut key = self.family(8);
        key.extend_from_slice(id.as_bytes());
        key
    }

    pub fn prefix(&self) -> &[u8] {
        &self.prefix
    }
}

fn append_string(key: &mut Vec<u8>, value: &str) -> Result<()> {
    key.extend_from_slice(&u32::try_from(value.len())?.to_be_bytes());
    key.extend_from_slice(value.as_bytes());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn workspace_and_grant_prefixes_are_unambiguous() -> Result<()> {
        let id = ObjectId::from_bytes([0x42; 16]);
        let names = ["a", "a/", "a\0", "a\0/", "é", "e\u{301}"];
        for name in names {
            let space = Keyspace::new(WorkspaceId::new(name)?)?;
            for other in names {
                if name != other {
                    let other = Keyspace::new(WorkspaceId::new(other)?)?;
                    assert!(!space.object(id).starts_with(&other.prefix));
                }
            }
            for grant in ["", "a", "a\0", "a/", "é"] {
                for other in ["", "a", "a\0", "a/", "é"] {
                    if grant != other {
                        assert!(
                            !space
                                .granted_object(grant, id)?
                                .starts_with(&space.granted_objects(other)?)
                        );
                    }
                }
            }
        }
        let keys = Keyspace::new(WorkspaceId::new("w")?)?;
        assert_eq!(
            hex::encode(keys.object(id)),
            format!("01000000017701{}", "42".repeat(16))
        );
        assert!(keys.change(255) < keys.change(256));
        Ok(())
    }
}
