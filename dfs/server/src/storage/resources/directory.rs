use std::fmt;

use dfs_protocol::rpc::ObjectKind;

use crate::storage::{self, resources::object::ObjectResource};

#[derive(Debug)]
pub enum Error {
    NotDirectory,
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotDirectory => f.write_str("object is not a directory"),
        }
    }
}

impl std::error::Error for Error {}

impl From<Error> for storage::Error<Error> {
    fn from(error: Error) -> Self {
        Self::Resource(error)
    }
}

pub struct DirectoryResource {
    object: ObjectResource,
}

impl DirectoryResource {
    pub fn object(&self) -> &ObjectResource {
        &self.object
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
