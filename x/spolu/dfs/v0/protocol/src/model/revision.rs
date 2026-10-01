use thiserror::Error;

use super::{ContentVersionId, ObjectId, WorkspaceId};

/**
 * @cc [owner:spolu,label:backend] metadata-revision-counter
 * Metadata revisions count published changes to one object, starting at zero. Advancing the counter
 * MUST fail on overflow rather than wrap. Counters alone MUST NOT be used to detect stale state
 * across objects, workspaces, or sessions recreated after a server restart.
 */
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub struct MetadataRevision(u64);

impl MetadataRevision {
    pub const INITIAL: Self = Self(0);

    pub const fn from_u64(value: u64) -> Self {
        Self(value)
    }

    pub const fn get(self) -> u64 {
        self.0
    }

    pub fn next(self) -> Result<Self, RevisionOverflow> {
        self.0.checked_add(1).map(Self).ok_or(RevisionOverflow)
    }
}

#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
#[error("metadata revision exhausted")]
pub struct RevisionOverflow;

/**
 * @cc [owner:spolu,label:concurrency] scoped-object-revision
 * Revision equality MUST include workspace, object, metadata counter, and content version. Content
 * versions identify immutable bytes; metadata-only changes MUST preserve them. Directories have no
 * content version. Clients MUST compare revisions only within a live session and discard cached
 * state when recreating a session after a server restart.
 */
#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub struct ObjectRevision {
    pub workspace_id: WorkspaceId,
    pub object_id: ObjectId,
    pub metadata: MetadataRevision,
    pub content: Option<ContentVersionId>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn revision_overflow_cannot_reuse_an_old_counter() -> anyhow::Result<()> {
        assert_eq!(MetadataRevision::INITIAL.next()?.get(), 1);
        assert_eq!(
            MetadataRevision::from_u64(u64::MAX).next(),
            Err(RevisionOverflow)
        );
        Ok(())
    }

    #[test]
    fn equal_counters_do_not_hide_changes_of_scope_or_content() -> anyhow::Result<()> {
        let original = ObjectRevision {
            workspace_id: WorkspaceId::new("workspace_1")?,
            object_id: ObjectId::generate(),
            metadata: MetadataRevision::INITIAL,
            content: Some(ContentVersionId::generate()),
        };
        let changed = [
            ObjectRevision {
                workspace_id: WorkspaceId::new("workspace_2")?,
                ..original.clone()
            },
            ObjectRevision {
                object_id: ObjectId::generate(),
                ..original.clone()
            },
            ObjectRevision {
                metadata: original.metadata.next()?,
                ..original.clone()
            },
            ObjectRevision {
                content: Some(ContentVersionId::generate()),
                ..original.clone()
            },
        ];
        for revision in changed {
            assert_ne!(original, revision);
        }
        Ok(())
    }
}
