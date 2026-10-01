use std::str::FromStr;

use futures::{StreamExt, TryStreamExt, stream};

use super::{NamespaceRead, checked_child};
use crate::{
    api::ApiError,
    model::{EntryName, ObjectId, ObjectKind, ObjectMetadata},
};

#[derive(Clone, Copy)]
pub(crate) enum SyntheticDirectory {
    Root,
    Shared,
}

impl SyntheticDirectory {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Root => "root",
            Self::Shared => "shared",
        }
    }
}

pub(crate) enum NamespaceId {
    Object(ObjectId),
    Synthetic(SyntheticDirectory),
}

impl FromStr for NamespaceId {
    type Err = ApiError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "root" => Ok(Self::Synthetic(SyntheticDirectory::Root)),
            "shared" => Ok(Self::Synthetic(SyntheticDirectory::Shared)),
            _ => Ok(Self::Object(
                value.parse().map_err(|_| ApiError::InvalidInput)?,
            )),
        }
    }
}

pub(crate) enum NamespaceNode {
    Object(Box<ObjectMetadata>),
    Synthetic(SyntheticDirectory),
}

impl From<ObjectMetadata> for NamespaceNode {
    fn from(object: ObjectMetadata) -> Self {
        Self::Object(Box::new(object))
    }
}

pub(crate) struct NamespacePage {
    pub entries: Vec<(EntryName, NamespaceNode)>,
    pub next_after: Option<String>,
}

impl NamespaceRead<'_> {
    pub async fn session_stat(&self, id: NamespaceId) -> Result<NamespaceNode, ApiError> {
        match id {
            NamespaceId::Object(id) => Ok(self.stat(id).await?.into()),
            NamespaceId::Synthetic(directory) => Ok(NamespaceNode::Synthetic(directory)),
        }
    }

    pub async fn session_lookup(
        &self,
        parent: NamespaceId,
        name: &EntryName,
    ) -> Result<NamespaceNode, ApiError> {
        match parent {
            NamespaceId::Object(id) => Ok(self.lookup(id, name).await?.into()),
            NamespaceId::Synthetic(SyntheticDirectory::Root) => {
                if name.as_str() == "shared" {
                    return Ok(NamespaceNode::Synthetic(SyntheticDirectory::Shared));
                }
                let root = self.workspace_root().await?;
                let id = self
                    .view
                    .child(root.id, name)
                    .await
                    .map_err(|_| ApiError::Unavailable)?
                    .ok_or(ApiError::NotFound)?;
                let object = self.stat(id).await?;
                checked_child(root.id, name, &object)?;
                Ok(object.into())
            }
            NamespaceId::Synthetic(SyntheticDirectory::Shared) => {
                self.shared_lookup(name).await.map(Into::into)
            }
        }
    }

    pub async fn session_list(
        &self,
        directory: NamespaceId,
        after: Option<&str>,
        limit: usize,
    ) -> Result<NamespacePage, ApiError> {
        if !(1..=1000).contains(&limit) {
            return Err(ApiError::InvalidInput);
        }
        match directory {
            NamespaceId::Object(id) => {
                let after = after.map(EntryName::new).transpose()?;
                let page = self.list(id, after.as_ref(), limit).await?;
                Ok(NamespacePage {
                    entries: page
                        .entries
                        .into_iter()
                        .map(|(n, o)| (n, o.into()))
                        .collect(),
                    next_after: page.next_after.map(|name| name.to_string()),
                })
            }
            NamespaceId::Synthetic(SyntheticDirectory::Root) => {
                self.root_list(after.map(EntryName::new).transpose()?.as_ref(), limit)
                    .await
            }
            NamespaceId::Synthetic(SyntheticDirectory::Shared) => {
                let after = after
                    .map(str::parse)
                    .transpose()
                    .map_err(|_| ApiError::InvalidInput)?;
                self.shared_list(after, limit).await
            }
        }
    }

    async fn workspace_root(&self) -> Result<ObjectMetadata, ApiError> {
        let id = self
            .view
            .root_id()
            .await
            .map_err(|_| ApiError::Unavailable)?;
        let root = self
            .view
            .object(id)
            .await
            .map_err(|_| ApiError::Unavailable)?
            .ok_or(ApiError::Unavailable)?;
        if root.parent.is_some() || root.kind != ObjectKind::Directory {
            return Err(ApiError::Unavailable);
        }
        Ok(root)
    }

    /**
     * @cc [owner:spolu,label:security] session-root-projection
     * The synthetic root MUST expose only currently authorized immediate workspace-root children
     * and the reserved synthetic shared entry. It MUST NOT reveal inaccessible names, attributes,
     * or continuation keys. All page reads and authorization MUST use this request's snapshot.
     * A persisted child named shared MUST remain discoverable through the shared projection.
     */
    async fn root_list(
        &self,
        after: Option<&EntryName>,
        limit: usize,
    ) -> Result<NamespacePage, ApiError> {
        let root = self.workspace_root().await?;
        let root_authorized = match self.stat(root.id).await {
            Ok(_) => true,
            Err(ApiError::NotFound) => false,
            Err(error) => return Err(error),
        };
        let mut entries = Vec::new();
        if after.is_none_or(|name| name.as_str() < "shared") {
            entries.push((
                "shared".parse()?,
                NamespaceNode::Synthetic(SyntheticDirectory::Shared),
            ));
        }
        let mut cursor = after.cloned();
        'scan: loop {
            let children = self
                .view
                .children(root.id, cursor.as_ref(), 128)
                .await
                .map_err(|_| ApiError::Unavailable)?;
            if children.is_empty() {
                break;
            }
            cursor = children.last().map(|entry| entry.name.clone());
            let visible: Vec<_> = stream::iter(children)
                .map(|entry| async move {
                    if entry.name.as_str() == "shared" {
                        return Ok(None);
                    }
                    let object = if root_authorized {
                        self.view
                            .object(entry.object_id)
                            .await
                            .map_err(|_| ApiError::Unavailable)?
                            .ok_or(ApiError::Unavailable)?
                    } else {
                        match self.stat(entry.object_id).await {
                            Ok(object) => object,
                            Err(ApiError::NotFound) => return Ok(None),
                            Err(error) => return Err(error),
                        }
                    };
                    checked_child(root.id, &entry.name, &object)?;
                    Ok::<_, ApiError>(Some((entry.name, NamespaceNode::from(object))))
                })
                .buffered(16)
                .try_collect()
                .await?;
            for entry in visible.into_iter().flatten() {
                entries.push(entry);
                if entries.len() > limit {
                    break 'scan;
                }
            }
        }
        entries.sort_by(|(a, _), (b, _)| a.as_str().cmp(b.as_str()));
        let next_after = if entries.len() > limit {
            entries.truncate(limit);
            entries.last().map(|(name, _)| name.to_string())
        } else {
            None
        };
        Ok(NamespacePage {
            entries,
            next_after,
        })
    }

    /// Shared roots have access of their own but no visible containing directory.
    async fn is_shared_root(
        &self,
        root: ObjectId,
        object: &ObjectMetadata,
    ) -> Result<bool, ApiError> {
        if object.id == root {
            return Ok(false);
        }
        let link = object.parent.as_ref().ok_or(ApiError::Unavailable)?;
        if self
            .view
            .child(link.parent_id, &link.name)
            .await
            .map_err(|_| ApiError::Unavailable)?
            != Some(object.id)
        {
            return Err(ApiError::Unavailable);
        }
        let parent = self
            .view
            .object(link.parent_id)
            .await
            .map_err(|_| ApiError::Unavailable)?
            .ok_or(ApiError::Unavailable)?;
        if parent.kind != ObjectKind::Directory {
            return Err(ApiError::Unavailable);
        }
        if parent.id == root {
            return Ok(link.name.as_str() == "shared");
        }
        match self.stat(parent.id).await {
            Ok(_) => Ok(false),
            Err(ApiError::NotFound) => Ok(true),
            Err(error) => Err(error),
        }
    }

    /**
     * @cc [owner:spolu,label:security;performance] shared-projection
     * Shared entries MUST authorize their targets and omit objects reachable through a visible
     * ancestor or ordinary root entry. A persisted root child named shared is the reserved-name
     * exception. Grant discovery MUST bound candidates per page and deduplicate before pagination,
     * and recheck access in the same snapshot. Continuations MUST contain only authorized IDs;
     * a page with a continuation may be empty after filtering. No hidden ancestor may be returned.
     */
    async fn shared_list(
        &self,
        after: Option<ObjectId>,
        limit: usize,
    ) -> Result<NamespacePage, ApiError> {
        let root = self.workspace_root().await?;
        let budget = limit.max(64);
        let mut ids = self
            .view
            .granted_union(self.grants, after, budget)
            .await
            .map_err(|_| ApiError::Unavailable)?;
        // The reserved root child may inherit access without an explicit grant-index entry.
        if let Some(id) = self
            .view
            .child(root.id, &"shared".parse()?)
            .await
            .map_err(|_| ApiError::Unavailable)?
            && after.is_none_or(|after| id.as_bytes() > after.as_bytes())
        {
            match self.stat(id).await {
                Ok(_) => ids.push(id),
                Err(ApiError::NotFound) => {}
                Err(error) => return Err(error),
            }
        }
        ids.sort_by_key(|id| *id.as_bytes());
        ids.dedup();
        let possibly_more = ids.len() >= budget;
        ids.truncate(budget);
        let mut entries = Vec::new();
        let mut next_after = None;
        for (index, id) in ids.iter().copied().enumerate() {
            // Both grant indexes are atomic; an indexed but unauthorized/missing object is corrupt.
            let object = match self.stat(id).await {
                Ok(object) => object,
                Err(ApiError::NotFound) => return Err(ApiError::Unavailable),
                Err(error) => return Err(error),
            };
            if self.is_shared_root(root.id, &object).await? {
                entries.push((shared_name(&object)?, object.into()));
            }
            next_after = if index + 1 < ids.len() || possibly_more {
                Some(id.to_string())
            } else {
                None
            };
            if entries.len() == limit {
                break;
            }
        }
        Ok(NamespacePage {
            entries,
            next_after,
        })
    }

    /**
     * @cc [owner:spolu,label:security] shared-lookup-boundary
     * A shared lookup MUST authorize the ID from its suffix, check current shared-root eligibility,
     * and match the current rendered name in one snapshot. The suffix MUST NOT bypass these checks
     * or expose canonical ancestors. Missing, stale, and inaccessible aliases MUST return NotFound.
     */
    async fn shared_lookup(&self, name: &EntryName) -> Result<ObjectMetadata, ApiError> {
        let (_, suffix) = name.as_str().rsplit_once("--").ok_or(ApiError::NotFound)?;
        let id = suffix.parse().map_err(|_| ApiError::NotFound)?;
        let object = self.stat(id).await?;
        let root = self.workspace_root().await?;
        if !self.is_shared_root(root.id, &object).await? || shared_name(&object)? != *name {
            return Err(ApiError::NotFound);
        }
        Ok(object)
    }
}

/**
 * @cc [owner:spolu,label:product] shared-entry-names
 * Every entry directly inside synthetic shared MUST append -- and the full object ID to its current
 * basename. Other objects MUST NOT affect its name. Truncate only the basename at a UTF-8 boundary
 * to fit the 255-byte component limit. Canonical entries inside shared directories remain unchanged.
 */
fn shared_name(object: &ObjectMetadata) -> Result<EntryName, ApiError> {
    let basename = object
        .parent
        .as_ref()
        .ok_or(ApiError::Unavailable)?
        .name
        .as_str();
    let mut end = basename.len().min(EntryName::MAX_BYTES - 34);
    while !basename.is_char_boundary(end) {
        end -= 1;
    }
    EntryName::new(format!("{}--{}", &basename[..end], object.id)).map_err(Into::into)
}
