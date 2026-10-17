use std::collections::HashSet;

use dfs_protocol::{
    ObjectId,
    rpc::{CreateOperation, MoveOperation, Mutation, ObjectKind, RemoveOperation},
};
use foundationdb::{Transaction, tuple::pack};

use super::{DirectoryResource, Error, VIRTUAL_SHARED_NAME};
use crate::{
    clock,
    storage::{
        self,
        resources::{
            object::{self, Mode, ObjectResource},
            session::SessionResource,
        },
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

    /**
     * @cc [owner:spolu,label:backend;security] directory-apply-move-authorization
     * Move MUST evaluate session modes in the caller's transaction and require write on both
     * source and destination directories, without requiring access to the moved object.
     */
    /**
     * @cc [owner:spolu,label:backend] directory-apply-move-validation
     * Move MUST reject root moves, cycles, occupied destinations without replace, different-kind
     * replacements, and nonempty directory replacements before staging writes. It MUST preserve
     * the moved object's ID, content, metadata, and grants, updating both bindings atomically.
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

        // Check source and target permissions.
        let target_id = operation.target_id.unwrap_or(operation.parent_id);
        let modes =
            ObjectResource::modes_for_session(tx, session, &[operation.parent_id, target_id])
                .await?;
        let mut modes = modes.into_iter();
        let (mut source, _) = Self::require_writable(modes.next().flatten())?;
        let (mut target, target_mode) = Self::require_writable(modes.next().flatten())?;

        // Reserve shared under the tenant root.
        if target.is_tenant_root() && operation.name == VIRTUAL_SHARED_NAME {
            return Err(Error::AlreadyExists.into());
        }

        // Fetch the object and destination entry.
        let mut object = ObjectResource::fetch(tx, &session.tenant, &operation.object_id)
            .await?
            .ok_or(Error::Object(object::Error::NotFound))?;
        Self::supported_kind(object.kind.into())?;
        let destination = target.lookup(tx, &operation.name).await?;

        // Check the source binding and reject directory cycles.
        if object.parent_id != Some(operation.parent_id) {
            return Err(Error::Object(object::Error::NotFound).into());
        }
        if source.lookup(tx, &object.name).await? != Some(object.object_id) {
            return Err(Error::Object(object::Error::NotFound).into());
        }
        if object.kind == ObjectKind::Directory {
            Self::check_move_ancestry(tx, session, &object.object_id, &target.object).await?;
        }

        // Check whether the destination can be replaced.
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

                // Check replacement kind and directory emptiness.
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

        // Prepare object and parent attributes before staging writes.
        let mode = object.mode_with_parent(tx, session, target_mode).await?;
        let now_ms = clock::now_ms().map_err(|_| Error::TimestampGeneration)?;
        source
            .object
            .prepare_content_change(now_ms)
            .map_err(Error::Object)?;
        if target_id != operation.parent_id {
            target
                .object
                .prepare_content_change(now_ms)
                .map_err(Error::Object)?;
        }
        object.prepare_attr_change(now_ms).map_err(Error::Object)?;
        let source_key = source.child_key(&object.name);
        object.parent_id = Some(target_id);
        object.name = operation.name;
        let attr = object.mutation_attr(tx, mode).await?;

        // Removal validates stored grants before writing. Everything after it is infallible.
        if let Some(replaced) = replaced {
            replaced.remove(tx).await?;
        }

        // Update source and target directory entries.
        tx.clear(&source_key);
        tx.set(
            &target.child_key(&object.name),
            &pack(&object.object_id.as_bytes().as_slice()),
        );

        // Save object and parent attributes.
        object.save_attributes(tx);
        source.object.save_attributes(tx);
        if target_id != operation.parent_id {
            target.object.save_attributes(tx);
        }

        Ok(Mutation {
            object: Some(attr),
            related: Vec::new(),
        })
    }

    /**
     * @cc [owner:spolu,label:backend;security] directory-apply-remove-authorization
     * Remove MUST evaluate session modes in the caller's transaction and require write on the
     * parent only. It MUST reject the tenant root, a mismatched parent or kind, and nonempty
     * directories before staging writes. Removing an absent object MUST return Object(NotFound).
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

        // Check parent permissions.
        let parent = ObjectResource::modes_for_session(tx, session, &[operation.parent_id])
            .await?
            .pop()
            .flatten();
        let (mut parent, mode) = Self::require_writable(parent)?;

        // Check parent_id against object.parent_id.
        let object = ObjectResource::fetch(tx, &session.tenant, &operation.object_id)
            .await?
            .ok_or(Error::Object(object::Error::NotFound))?;
        if object.parent_id != Some(operation.parent_id)
            || parent.lookup(tx, &object.name).await? != Some(object.object_id)
        {
            return Err(Error::Object(object::Error::NotFound).into());
        }

        // Check the requested kind and directory emptiness.
        if object.kind != kind {
            return Err(Error::InvalidKind.into());
        }
        if kind == ObjectKind::Directory {
            let directory = Self::try_from(object.clone())?;
            if !directory.list(tx, None, 1).await?.entries.is_empty() {
                return Err(Error::NotEmpty.into());
            }
        }

        // Prepare to update parent attributes.
        let now_ms = clock::now_ms().map_err(|_| Error::TimestampGeneration)?;
        parent
            .object
            .prepare_content_change(now_ms)
            .map_err(Error::Object)?;
        let attr = parent.object.mutation_attr(tx, mode).await?;

        // Remove the object and update the parent directory.
        object.remove(tx).await?;
        tx.clear(&parent.child_key(&object.name));

        // Save parent attributes.
        parent.object.save_attributes(tx);

        Ok(Mutation {
            object: None,
            related: vec![attr],
        })
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

    async fn check_move_ancestry(
        tx: &Transaction,
        session: &SessionResource,
        object_id: &ObjectId,
        target: &ObjectResource,
    ) -> Result<(), storage::Error<Error>> {
        let mut current = target.clone();
        let mut visited = HashSet::new();
        loop {
            if current.object_id == *object_id {
                return Err(Error::InvalidMove.into());
            }
            if !visited.insert(current.object_id) {
                return Err(Error::Object(object::Error::InvalidAncestry).into());
            }
            let Some(parent_id) = current.parent_id else {
                return Ok(());
            };
            current = ObjectResource::fetch(tx, &session.tenant, &parent_id)
                .await?
                .ok_or(Error::Object(object::Error::InvalidAncestry))?;
        }
    }
}
