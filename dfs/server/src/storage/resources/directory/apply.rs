use dfs_protocol::rpc::{CreateOperation, MoveOperation, Mutation, ObjectKind, RemoveOperation};
use foundationdb::Transaction;

use super::{DirectoryResource, Error};
use crate::storage::{
    self,
    resources::{
        object::{self, ObjectResource},
        session::SessionResource,
    },
};

impl DirectoryResource {
    /**
     * @cc [owner:spolu,label:backend;security] directory-apply-create-authorization
     * Create MUST evaluate session modes in the caller's transaction and require read and write on
     * the parent directory. Missing either permission MUST return Forbidden without staging writes.
     */
    /**
     * @cc [owner:spolu,label:backend] directory-apply-create-attributes
     * A successful Create MUST return the child's attributes in object and the updated parent's
     * attributes in related, both reflecting state immediately after creation.
     */
    pub async fn apply_create(
        tx: &Transaction,
        session: &SessionResource,
        operation: CreateOperation,
    ) -> Result<Mutation, storage::Error<Error>> {
        let kind = Self::supported_kind(operation.kind)?;

        // Check parent permissions.
        let (parent, mode) = ObjectResource::modes_for_session(tx, session, &[operation.parent_id])
            .await?
            .pop()
            .flatten()
            .ok_or(Error::Object(object::Error::NotFound))?;
        if !mode.can_read() || !mode.can_write() {
            return Err(Error::Forbidden.into());
        }
        let mut parent = Self::try_from(parent)?;

        // Create the child and update the parent directory.
        let mut child = parent
            .create_child(
                tx,
                operation.object_id,
                operation.name,
                kind,
                operation.mime_type,
                operation.xattrs.into_iter().collect(),
            )
            .await?;

        // Apply responses omit optional metadata.
        child.metadata = None;

        // The child has no explicit grants and inherits its parent's mode.
        Ok(Mutation {
            object: Some(child.attr(tx, mode).await?),
            related: vec![parent.object.attr(tx, mode).await?],
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

    fn supported_kind(kind: i32) -> Result<ObjectKind, Error> {
        match ObjectKind::try_from(kind).map_err(|_| Error::InvalidKind)? {
            ObjectKind::Symlink => Err(Error::UnsupportedKind),
            kind => Ok(kind),
        }
    }
}
