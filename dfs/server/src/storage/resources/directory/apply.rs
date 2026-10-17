use dfs_protocol::rpc::{CreateOperation, MoveOperation, Mutation, ObjectKind, RemoveOperation};
use foundationdb::Transaction;

use super::{DirectoryResource, Error};
use crate::{
    clock,
    storage::{
        self,
        resources::{
            object::{self, ObjectResource},
            session::SessionResource,
        },
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

    /**
     * @cc [owner:spolu,label:backend;security] directory-apply-remove-authorization
     * For supported kinds and existing non-root objects, Remove MUST evaluate modes in the caller's
     * transaction and require read and write on both the object and its parent. Missing either
     * permission MUST return Forbidden without writes.
     */
    /**
     * @cc [owner:spolu,label:backend;error-handling] directory-apply-remove-validation
     * For supported kinds, Remove MUST reject the tenant root with Forbidden. For existing
     * authorized objects, a wrong parent or binding MUST return Object(NotFound), a wrong kind MUST
     * return InvalidKind, and a nonempty directory MUST return NotEmpty. Missing objects MUST return
     * Object(NotFound).
     * All validation MUST complete before staging writes.
     */
    /**
     * @cc [owner:spolu,label:backend] directory-apply-remove-attributes
     * Remove MUST clear the object and its parent binding atomically, advance the parent's content
     * and attribute versions once, and set its mtime and ctime. The result MUST have no object and
     * include the parent's attributes immediately after removal in related.
     */
    pub async fn apply_remove(
        tx: &Transaction,
        session: &SessionResource,
        operation: RemoveOperation,
    ) -> Result<Mutation, storage::Error<Error>> {
        let kind = Self::supported_kind(operation.kind)?;
        if operation.object_id == session.tenant.root_id {
            return Err(Error::Forbidden.into());
        }

        // Check object and parent permissions using the same fetched records.
        let mut objects = ObjectResource::modes_for_session(
            tx,
            session,
            &[operation.parent_id, operation.object_id],
        )
        .await?
        .into_iter();
        let (parent, parent_mode) = objects
            .next()
            .flatten()
            .ok_or(Error::Object(object::Error::NotFound))?;
        let (object, mode) = objects
            .next()
            .flatten()
            .ok_or(Error::Object(object::Error::NotFound))?;
        if !parent_mode.can_read()
            || !parent_mode.can_write()
            || !mode.can_read()
            || !mode.can_write()
        {
            return Err(Error::Forbidden.into());
        }

        // Verify the parent binding, requested kind, and directory emptiness.
        if object.parent_id != Some(operation.parent_id) {
            return Err(Error::Object(object::Error::NotFound).into());
        }
        let mut parent = Self::try_from(parent)?;
        if parent.lookup(tx, &object.name).await? != Some(object.object_id) {
            return Err(Error::Object(object::Error::NotFound).into());
        }
        if object.kind != kind {
            return Err(Error::InvalidKind.into());
        }
        if kind == ObjectKind::Directory {
            let directory = Self::try_from(object.clone())?;
            if !directory.list(tx, None, 1).await?.entries.is_empty() {
                return Err(Error::NotEmpty.into());
            }
        }
        let now_ms = clock::now_ms().map_err(|_| Error::TimestampGeneration)?;

        // Remove the object and its binding, then update the parent attributes.
        object.remove(tx).await?;
        tx.clear(&parent.child_key(&object.name));
        parent.object.record_content_change(tx, now_ms);

        Ok(Mutation {
            object: None,
            related: vec![parent.object.attr(tx, parent_mode).await?],
        })
    }

    fn supported_kind(kind: i32) -> Result<ObjectKind, Error> {
        match ObjectKind::try_from(kind).map_err(|_| Error::InvalidKind)? {
            ObjectKind::Symlink => Err(Error::UnsupportedKind),
            kind => Ok(kind),
        }
    }
}
