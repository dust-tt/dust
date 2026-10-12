use std::{collections::HashMap, fmt};

use dfs_protocol::{ObjectId, rpc::ObjectKind};
use foundationdb::{
    FdbBindingError, Transaction,
    tuple::{pack, unpack},
};

use crate::{
    clock,
    storage::{
        self,
        resources::{
            keys::tenant_subspace,
            object::{self, ObjectCreateParams, ObjectResource},
        },
    },
};

const FAMILY: &str = "child";
const NAME_MAX_BYTES: usize = 255;

#[derive(Debug)]
pub enum Error {
    NotDirectory,
    InvalidName,
    NameTooLong,
    UnsupportedKind,
    AlreadyExists,
    TimestampGeneration,
    Object(object::Error),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotDirectory => f.write_str("object is not a directory"),
            Self::InvalidName => f.write_str("invalid child name"),
            Self::NameTooLong => f.write_str("child name too long"),
            Self::UnsupportedKind => f.write_str("unsupported child kind"),
            Self::AlreadyExists => f.write_str("child name already exists"),
            Self::TimestampGeneration => f.write_str("child timestamp generation failed"),
            Self::Object(error) => error.fmt(f),
        }
    }
}

impl std::error::Error for Error {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Object(error) => Some(error),
            _ => None,
        }
    }
}

impl From<Error> for storage::Error<Error> {
    fn from(error: Error) -> Self {
        Self::Resource(error)
    }
}

impl From<storage::Error<object::Error>> for storage::Error<Error> {
    fn from(error: storage::Error<object::Error>) -> Self {
        match error {
            storage::Error::Open(error) => Self::Open(error),
            storage::Error::Transaction(error) => Self::Transaction(error),
            storage::Error::InvalidKeyHash(error) => Self::InvalidKeyHash(error),
            storage::Error::InvalidObjectId(error) => Self::InvalidObjectId(error),
            storage::Error::Resource(error) => Self::Resource(Error::Object(error)),
        }
    }
}

pub struct ChildCreateParams {
    pub object_id: ObjectId,
    pub name: String,
    pub kind: ObjectKind,
    pub mime_type: Option<String>,
    pub xattrs: HashMap<String, Vec<u8>>,
}

pub struct DirectoryResource {
    object: ObjectResource,
}

impl DirectoryResource {
    pub fn object(&self) -> &ObjectResource {
        &self.object
    }

    pub async fn create_child(
        &mut self,
        tx: &Transaction,
        child: ChildCreateParams,
    ) -> Result<ObjectResource, storage::Error<Error>> {
        validate_name(&child.name)?;
        if child.kind == ObjectKind::Symlink {
            return Err(Error::UnsupportedKind.into());
        }
        let entry_key = self.child_key(&child.name);
        let name_taken = tx
            .get(&entry_key, false)
            .await
            .map_err(FdbBindingError::from)?
            .is_some();
        if name_taken {
            return Err(Error::AlreadyExists.into());
        }

        let now_ms = clock::now_ms().map_err(|_| Error::TimestampGeneration)?;
        let object = ObjectResource::new(
            &self.object.tenant_id,
            ObjectCreateParams {
                object_id: child.object_id,
                parent_id: Some(self.object.object_id),
                name: child.name,
                kind: child.kind,
                mime_type: child.mime_type,
                xattrs: child.xattrs,
            },
            now_ms,
        );
        object.create(tx, &[]).await?;
        tx.set(&entry_key, &pack(&object.object_id.as_bytes().as_slice()));
        self.object
            .record_content_change(now_ms)
            .map_err(Error::Object)?;
        self.object.save_attributes(tx);
        Ok(object)
    }

    pub async fn lookup_child(
        &self,
        tx: &Transaction,
        name: &str,
    ) -> Result<Option<ObjectId>, storage::Error<Error>> {
        validate_name(name)?;
        let Some(entry) = tx
            .get(&self.child_key(name), false)
            .await
            .map_err(FdbBindingError::from)?
        else {
            return Ok(None);
        };
        let child_id: Vec<u8> = unpack(&entry).map_err(FdbBindingError::PackError)?;
        let child_id = ObjectId::try_from(child_id.as_slice())
            .map_err(storage::Error::<Error>::InvalidObjectId)?;
        Ok(Some(child_id))
    }

    fn child_key(&self, name: &str) -> Vec<u8> {
        tenant_subspace(&self.object.tenant_id).pack(&(
            FAMILY,
            self.object.object_id.as_bytes().as_slice(),
            name,
        ))
    }
}

impl TryFrom<ObjectResource> for DirectoryResource {
    type Error = Error;

    fn try_from(object: ObjectResource) -> Result<Self, Self::Error> {
        if object.kind != ObjectKind::Directory {
            return Err(Error::NotDirectory);
        }
        Ok(Self { object })
    }
}

fn validate_name(name: &str) -> Result<(), Error> {
    if name.len() > NAME_MAX_BYTES {
        return Err(Error::NameTooLong);
    }
    let invalid = name.is_empty() || name == "." || name == ".." || name.contains(['/', '\0']);
    if invalid {
        return Err(Error::InvalidName);
    }
    Ok(())
}
