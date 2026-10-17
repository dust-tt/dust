use dfs_protocol::rpc::{CreateOperation, MoveOperation, Mutation, ObjectKind, RemoveOperation};
use foundationdb::Transaction;

use super::{DirectoryResource, Error};
use crate::storage::{
    self,
    resources::{
        object::{self, Mode, ObjectResource},
        session::SessionResource,
    },
};

impl DirectoryResource {
    /**
     * @cc [owner:spolu,label:backend;security] directory-apply-create-authorization
     * Create MUST evaluate session modes in the caller's transaction and require write on the
     * parent directory only. A permission failure MUST return Forbidden without staging writes.
     */
    pub async fn apply_create(
        tx: &Transaction,
        session: &SessionResource,
        operation: CreateOperation,
    ) -> Result<Mutation, storage::Error<Error>> {
        let kind = Self::supported_kind(operation.kind)?;

        // Check parent permissions.
        let parent = ObjectResource::modes_for_session(tx, session, &[operation.parent_id])
            .await?
            .pop()
            .flatten();
        let (mut parent, mode) = Self::require_writable(parent)?;

        // Create the child and update the parent directory.
        let child = parent
            .create_child(
                tx,
                operation.object_id,
                operation.name,
                kind,
                operation.mime_type,
                operation.xattrs.into_iter().collect(),
            )
            .await?;

        Ok(Mutation {
            object: Some(child.mutation_attr(tx, mode).await?),
            related: Vec::new(),
        })
    }

    pub async fn apply_move(
        _tx: &Transaction,
        _session: &SessionResource,
        _operation: MoveOperation,
    ) -> Result<Mutation, storage::Error<Error>> {
        Err(Error::UnsupportedOperation.into())
    }

    pub async fn apply_remove(
        _tx: &Transaction,
        _session: &SessionResource,
        _operation: RemoveOperation,
    ) -> Result<Mutation, storage::Error<Error>> {
        Err(Error::UnsupportedOperation.into())
    }

    fn require_writable(object: Option<(ObjectResource, Mode)>) -> Result<(Self, Mode), Error> {
        let (object, mode) = object.ok_or(Error::Object(object::Error::NotFound))?;
        if !mode.can_write() {
            return Err(Error::Forbidden);
        }
        Ok((Self::try_from(object)?, mode))
    }

    fn supported_kind(kind: i32) -> Result<ObjectKind, Error> {
        match ObjectKind::try_from(kind).map_err(|_| Error::InvalidKind)? {
            ObjectKind::Symlink => Err(Error::UnsupportedKind),
            kind => Ok(kind),
        }
    }
}
