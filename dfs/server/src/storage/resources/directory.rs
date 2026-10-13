use std::{collections::HashMap, fmt};

use dfs_protocol::{ObjectId, rpc::ObjectKind};
use foundationdb::{
    FdbBindingError, Transaction,
    tuple::{Subspace, pack, unpack},
};

use crate::{
    clock,
    storage::{
        self,
        resources::{
            keys::tenant_subspace,
            object::{self, ObjectResource},
            page,
        },
    },
};

const FAMILY: &str = "child";
const NAME_MAX_BYTES: usize = 255;
const PAGE_MAX_ENTRIES: usize = 4_096;

#[derive(Debug)]
pub enum Error {
    NotDirectory,
    InvalidName,
    NameTooLong,
    UnsupportedKind,
    AlreadyExists,
    TimestampGeneration,
    InvalidPageLimit,
    InvalidCursor,
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
            Self::InvalidPageLimit => f.write_str("invalid child page limit"),
            Self::InvalidCursor => f.write_str("invalid child cursor"),
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

pub struct ChildEntry {
    pub name: String,
    pub object_id: ObjectId,
}

pub struct ChildPage {
    pub entries: Vec<ChildEntry>,
    pub next_after: Option<String>,
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
        object_id: ObjectId,
        name: String,
        kind: ObjectKind,
        mime_type: Option<String>,
        xattrs: HashMap<String, Vec<u8>>,
    ) -> Result<ObjectResource, storage::Error<Error>> {
        Self::validate_name(&name)?;
        if kind == ObjectKind::Symlink {
            return Err(Error::UnsupportedKind.into());
        }
        let entry_key = self.child_key(&name);
        let name_taken = tx
            .get(&entry_key, false)
            .await
            .map_err(FdbBindingError::from)?
            .is_some();
        if name_taken {
            return Err(Error::AlreadyExists.into());
        }

        let now_ms = clock::now_ms().map_err(|_| Error::TimestampGeneration)?;
        let child = ObjectResource::new(
            &self.object.tenant_id,
            object_id,
            Some(self.object.object_id),
            name,
            kind,
            mime_type,
            xattrs,
            now_ms,
        );
        child.create(tx, &[]).await?;
        tx.set(&entry_key, &pack(&child.object_id.as_bytes().as_slice()));
        self.object
            .record_content_change(tx, now_ms)
            .map_err(Error::Object)?;
        Ok(child)
    }

    pub async fn lookup(
        &self,
        tx: &Transaction,
        name: &str,
    ) -> Result<Option<ObjectId>, storage::Error<Error>> {
        Self::validate_name(name)?;
        let Some(entry) = tx
            .get(&self.child_key(name), false)
            .await
            .map_err(FdbBindingError::from)?
        else {
            return Ok(None);
        };
        Ok(Some(Self::decode_child_id(&entry)?))
    }

    pub async fn list(
        &self,
        tx: &Transaction,
        after: Option<&str>,
        limit: u32,
    ) -> Result<ChildPage, storage::Error<Error>> {
        let limit = usize::try_from(limit).map_err(|_| Error::InvalidPageLimit)?;
        if limit == 0 || limit > PAGE_MAX_ENTRIES {
            return Err(Error::InvalidPageLimit.into());
        }
        let children = self.children_subspace();
        let after = after
            .map(|after| {
                page::decode_cursor(&children, after, |key| {
                    children.unpack::<String>(key).is_ok()
                })
                .ok_or(Error::InvalidCursor)
            })
            .transpose()?;
        let page = page::read_page(tx, &children, after, limit).await?;
        let mut entries = Vec::with_capacity(page.entries.len());
        for (key, value) in &page.entries {
            entries.push(ChildEntry {
                name: children.unpack(key).map_err(FdbBindingError::PackError)?,
                object_id: Self::decode_child_id(value)?,
            });
        }
        Ok(ChildPage {
            entries,
            next_after: page.next_after,
        })
    }

    fn children_subspace(&self) -> Subspace {
        tenant_subspace(&self.object.tenant_id)
            .subspace(&(FAMILY, self.object.object_id.as_bytes().as_slice()))
    }

    fn child_key(&self, name: &str) -> Vec<u8> {
        self.children_subspace().pack(&name)
    }

    fn decode_child_id(value: &[u8]) -> Result<ObjectId, storage::Error<Error>> {
        let child_id: Vec<u8> = unpack(value).map_err(FdbBindingError::PackError)?;
        ObjectId::try_from(child_id.as_slice()).map_err(storage::Error::InvalidObjectId)
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
