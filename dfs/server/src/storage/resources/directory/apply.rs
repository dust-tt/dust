use std::collections::HashSet;

use dfs_protocol::rpc::{CreateOperation, MoveOperation, Mutation, ObjectKind, RemoveOperation};
use foundationdb::{Transaction, tuple::pack};

use super::{DirectoryResource, Error, VIRTUAL_SHARED_NAME};
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

    /**
     * @cc [owner:spolu,label:backend;security] directory-apply-move-authorization
     * Move MUST evaluate modes in the caller's transaction and require read and write on the
     * source and target directories and read on the moved object. Missing permissions MUST return
     * Forbidden without writes. Replacement is authorized by access to the target directory.
     */
    /**
     * @cc [owner:spolu,label:backend;error-handling] directory-apply-move-validation
     * With a valid name, Move MUST reject the tenant root with Forbidden. For authorized objects,
     * a wrong source binding MUST return Object(NotFound), and moving a directory into itself or a
     * descendant MUST return InvalidMove. A destination occupied by another object MUST fail with
     * AlreadyExists unless replace is set; replacements MUST have the same kind, and directories
     * MUST be empty.
     * Renaming an object to its current name MUST succeed without replace.
     * All validation MUST complete before staging writes.
     */
    /**
     * @cc [owner:spolu,label:backend] directory-apply-move-attributes
     * Move MUST preserve the object's ID, content, metadata, and grants. Besides parent and name,
     * only its attr_version and ctime MUST change. Each distinct parent MUST advance attr_version
     * and content_version once and set mtime and ctime, including for a rename to the current name.
     * The result MUST include the moved object and each distinct parent immediately after the
     * operation. Bindings, attributes, and replacement cleanup MUST change atomically.
     */
    pub async fn apply_move(
        tx: &Transaction,
        session: &SessionResource,
        operation: MoveOperation,
    ) -> Result<Mutation, storage::Error<Error>> {
        Self::validate_name(&operation.name)?;
        if operation.object_id == session.tenant.root_id {
            return Err(Error::Forbidden.into());
        }

        // Check permissions using the same fetched records.
        let target_id = operation.target_id.unwrap_or(operation.parent_id);
        let mut objects = ObjectResource::modes_for_session(
            tx,
            session,
            &[operation.parent_id, target_id, operation.object_id],
        )
        .await?
        .into_iter();
        let (source, source_mode) = objects
            .next()
            .flatten()
            .ok_or(Error::Object(object::Error::NotFound))?;
        let (target, target_mode) = objects
            .next()
            .flatten()
            .ok_or(Error::Object(object::Error::NotFound))?;
        let (mut object, mode) = objects
            .next()
            .flatten()
            .ok_or(Error::Object(object::Error::NotFound))?;
        if !source_mode.can_read()
            || !source_mode.can_write()
            || !target_mode.can_read()
            || !target_mode.can_write()
            || !mode.can_read()
        {
            return Err(Error::Forbidden.into());
        }
        let mut source = Self::try_from(source)?;
        let mut target = Self::try_from(target)?;
        Self::supported_kind(object.kind.into())?;

        // Check the source binding and reserve shared under the tenant root.
        if object.parent_id != Some(operation.parent_id)
            || source.lookup(tx, &object.name).await? != Some(object.object_id)
        {
            return Err(Error::Object(object::Error::NotFound).into());
        }
        if target.is_tenant_root() && operation.name == VIRTUAL_SHARED_NAME {
            return Err(Error::AlreadyExists.into());
        }

        // Follow stored parents with conflict tracking to prevent directory cycles.
        if object.kind == ObjectKind::Directory {
            let mut ancestor = target.object.clone();
            let mut visited = HashSet::new();
            loop {
                if ancestor.object_id == object.object_id {
                    return Err(Error::InvalidMove.into());
                }
                if !visited.insert(ancestor.object_id) {
                    return Err(Error::Object(object::Error::InvalidAncestry).into());
                }
                let Some(parent_id) = ancestor.parent_id else {
                    break;
                };
                ancestor = ObjectResource::fetch(tx, &session.tenant, &parent_id)
                    .await?
                    .ok_or(Error::Object(object::Error::InvalidAncestry))?;
            }
        }

        // Validate an occupied destination before removing it.
        let destination = target.lookup(tx, &operation.name).await?;
        let replaced = match destination {
            Some(id) if id != object.object_id => {
                if !operation.replace {
                    return Err(Error::AlreadyExists.into());
                }
                let replaced = ObjectResource::fetch(tx, &session.tenant, &id)
                    .await?
                    .ok_or(Error::Object(object::Error::NotFound))?;
                if replaced.parent_id != Some(target_id) || replaced.name != operation.name {
                    return Err(Error::Object(object::Error::InvalidAncestry).into());
                }
                if replaced.kind != object.kind {
                    return Err(Error::InvalidKind.into());
                }
                if replaced.kind == ObjectKind::Directory {
                    let directory = Self::try_from(replaced.clone())?;
                    if !directory.list(tx, None, 1).await?.entries.is_empty() {
                        return Err(Error::NotEmpty.into());
                    }
                }
                Some(replaced)
            }
            _ => None,
        };
        let now_ms = clock::now_ms().map_err(|_| Error::TimestampGeneration)?;

        // Removal validates stored grants before writing. The moved object's grants stay intact.
        if let Some(replaced) = replaced {
            replaced.remove(tx).await?;
        }
        tx.clear(&source.child_key(&object.name));
        tx.set(
            &target.child_key(&operation.name),
            &pack(&object.object_id.as_bytes().as_slice()),
        );
        object.parent_id = Some(target_id);
        object.name = operation.name;
        object.record_attr_change(tx, now_ms);
        source.object.record_content_change(tx, now_ms);

        // A same-directory rename updates and returns its parent only once.
        let mut related = vec![source.object.attr(tx, source_mode).await?];
        if target_id != operation.parent_id {
            target.object.record_content_change(tx, now_ms);
            related.push(target.object.attr(tx, target_mode).await?);
        }
        // Both parents have read/write, so inherited permissions and the object's mode are unchanged.
        Ok(Mutation {
            object: Some(object.attr(tx, mode).await?),
            related,
        })
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
