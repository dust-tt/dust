use std::collections::{BTreeSet, HashSet};

use crate::{
    api::ApiError,
    model::{EntryName, ObjectId, ObjectKind, ObjectMetadata, WorkspaceId},
    storage::{ReadView, Storage},
};

/**
 * @cc [owner:spolu,label:security] authorized-namespace-view
 * Callers MUST supply the authenticated session's workspace and grants. Every operation MUST
 * authorize against the same snapshot used for its metadata reads. Views MUST NOT be reused across
 * requests; subsequent requests MUST observe completed grant revocations and moves.
 */
pub(crate) struct NamespaceRead<'a> {
    view: ReadView,
    grants: &'a BTreeSet<String>,
}

pub(crate) struct DirectoryPage {
    pub entries: Vec<(EntryName, ObjectMetadata)>,
    pub next_after: Option<EntryName>,
}

impl<'a> NamespaceRead<'a> {
    pub async fn new(
        storage: &Storage,
        workspace: &WorkspaceId,
        grants: &'a BTreeSet<String>,
    ) -> Result<Self, ApiError> {
        let scoped = storage
            .workspace(workspace)
            .map_err(|_| ApiError::Unavailable)?;
        Ok(Self {
            view: scoped
                .read_view()
                .await
                .map_err(|_| ApiError::Unavailable)?,
            grants,
        })
    }

    /**
     * @cc [owner:spolu,label:security] live-ancestor-grants
     * Access MUST require a matching explicit grant on the object or a current ancestor in this
     * workspace. Missing and inaccessible objects MUST return the same NotFound error. Ancestor
     * cycles, missing ancestors, and inconsistent parent links encountered during traversal MUST
     * fail closed as Unavailable; they MUST NOT expose private names or loop indefinitely.
     */
    pub async fn stat(&self, id: ObjectId) -> Result<ObjectMetadata, ApiError> {
        if self.grants.is_empty() {
            return Err(ApiError::NotFound);
        }
        let object = self
            .view
            .object(id)
            .await
            .map_err(|_| ApiError::Unavailable)?
            .ok_or(ApiError::NotFound)?;
        let mut current = object.clone();
        let mut visited = HashSet::new();
        loop {
            if !visited.insert(current.id) {
                return Err(ApiError::Unavailable);
            }
            if self
                .view
                .has_any_grant(current.id, self.grants)
                .await
                .map_err(|_| ApiError::Unavailable)?
            {
                return Ok(object);
            }
            let Some(link) = current.parent else {
                return Err(ApiError::NotFound);
            };
            if self
                .view
                .child(link.parent_id, &link.name)
                .await
                .map_err(|_| ApiError::Unavailable)?
                != Some(current.id)
            {
                return Err(ApiError::Unavailable);
            }
            current = self
                .view
                .object(link.parent_id)
                .await
                .map_err(|_| ApiError::Unavailable)?
                .ok_or(ApiError::Unavailable)?;
            if current.kind != ObjectKind::Directory {
                return Err(ApiError::Unavailable);
            }
        }
    }

    pub async fn lookup(
        &self,
        parent: ObjectId,
        name: &EntryName,
    ) -> Result<ObjectMetadata, ApiError> {
        self.directory(parent).await?;
        let id = self
            .view
            .child(parent, name)
            .await
            .map_err(|_| ApiError::Unavailable)?
            .ok_or(ApiError::NotFound)?;
        let object = self
            .view
            .object(id)
            .await
            .map_err(|_| ApiError::Unavailable)?
            .ok_or(ApiError::Unavailable)?;
        checked_child(parent, name, &object)?;
        // A visible directory's grant also authorizes every canonical child through inheritance.
        Ok(object)
    }

    /**
     * @cc [owner:spolu,label:backend] directory-page-consistency
     * A page MUST read entries, attributes, and continuation from one authorized snapshot, ordered
     * by exact UTF-8 name bytes. Cursors are exclusive names; limits MUST be 1..=1000. Each subsequent
     * page MUST reauthorize using a fresh view; cursors MUST NOT retain stale access rights.
     */
    pub async fn list(
        &self,
        parent: ObjectId,
        after: Option<&EntryName>,
        limit: usize,
    ) -> Result<DirectoryPage, ApiError> {
        if !(1..=1000).contains(&limit) {
            return Err(ApiError::InvalidInput);
        }
        self.directory(parent).await?;
        let entries = self
            .view
            .children(parent, after, limit)
            .await
            .map_err(|_| ApiError::Unavailable)?;
        let ids: Vec<_> = entries.iter().map(|entry| entry.object_id).collect();
        let objects = self
            .view
            .objects(&ids)
            .await
            .map_err(|_| ApiError::Unavailable)?;
        let mut result = Vec::with_capacity(entries.len());
        for (entry, object) in entries.into_iter().zip(objects) {
            let object = object.ok_or(ApiError::Unavailable)?;
            checked_child(parent, &entry.name, &object)?;
            result.push((entry.name, object));
        }
        let mut next_after = None;
        if result.len() == limit
            && let Some((last, _)) = result.last()
            && !self
                .view
                .children(parent, Some(last), 1)
                .await
                .map_err(|_| ApiError::Unavailable)?
                .is_empty()
        {
            next_after = Some(last.clone());
        }
        Ok(DirectoryPage {
            entries: result,
            next_after,
        })
    }

    async fn directory(&self, id: ObjectId) -> Result<(), ApiError> {
        if self.stat(id).await?.kind != ObjectKind::Directory {
            return Err(ApiError::NotDirectory);
        }
        Ok(())
    }
}

/**
 * @cc [owner:spolu,label:security] canonical-child-inheritance
 * Callers MUST authorize the containing directory in the same snapshot. A child may inherit that
 * authorization only when its stored parent ID and name exactly match the directory entry.
 */
fn checked_child(
    parent: ObjectId,
    name: &EntryName,
    child: &ObjectMetadata,
) -> Result<(), ApiError> {
    if !child
        .parent
        .as_ref()
        .is_some_and(|link| link.parent_id == parent && link.name == *name)
    {
        return Err(ApiError::Unavailable);
    }
    Ok(())
}
