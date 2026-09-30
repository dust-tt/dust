use std::collections::BTreeMap;

use super::{
    ContentVersionId, EntryName, MetadataRevision, MimeType, ObjectId, ObjectRevision, WorkspaceId,
};

/// Xattr values are opaque bytes; their API encoding is defined with the wire protocol.
pub type Xattrs = BTreeMap<String, Vec<u8>>;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ParentLink {
    pub parent_id: ObjectId,
    pub name: EntryName,
}

/// An immutable content reference, including for empty files; file bytes live outside metadata.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FileContent {
    pub version: ContentVersionId,
    pub size_bytes: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ObjectKind {
    File(FileContent),
    Directory,
}

/// Namespace operations validate parent existence, workspace membership, and cycles before publish.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ObjectMetadata {
    pub workspace_id: WorkspaceId,
    pub id: ObjectId,
    pub parent: Option<ParentLink>,
    pub kind: ObjectKind,
    pub mime_type: MimeType,
    pub xattrs: Xattrs,
    pub metadata_revision: MetadataRevision,
}

impl ObjectMetadata {
    pub fn revision(&self) -> ObjectRevision {
        ObjectRevision {
            workspace_id: self.workspace_id.clone(),
            object_id: self.id,
            metadata: self.metadata_revision,
            content: match &self.kind {
                ObjectKind::File(content) => Some(content.version),
                ObjectKind::Directory => None,
            },
        }
    }

    pub fn directory_entry(&self) -> Option<DirectoryEntry> {
        self.parent.as_ref().map(|parent| DirectoryEntry {
            workspace_id: self.workspace_id.clone(),
            parent_id: parent.parent_id,
            name: parent.name.clone(),
            object_id: self.id,
        })
    }
}

/// A workspace-scoped mapping from a parent ID and name to an object's stable ID.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DirectoryEntry {
    pub workspace_id: WorkspaceId,
    pub parent_id: ObjectId,
    pub name: EntryName,
    pub object_id: ObjectId,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::ObjectUri;

    #[test]
    fn namespace_changes_preserve_file_identity_and_content() -> anyhow::Result<()> {
        let before = ObjectMetadata {
            workspace_id: WorkspaceId::new("workspace_1")?,
            id: ObjectId::generate(),
            parent: Some(ParentLink {
                parent_id: ObjectId::generate(),
                name: "old.txt".parse()?,
            }),
            kind: ObjectKind::File(FileContent {
                version: ContentVersionId::generate(),
                size_bytes: 3,
            }),
            mime_type: "text/plain".parse()?,
            xattrs: BTreeMap::from([("user.example".to_owned(), vec![0, 128, 255])]),
            metadata_revision: MetadataRevision::INITIAL,
        };
        let after = ObjectMetadata {
            parent: Some(ParentLink {
                parent_id: ObjectId::generate(),
                name: "new.txt".parse()?,
            }),
            metadata_revision: before.metadata_revision.next()?,
            ..before.clone()
        };
        assert_eq!(ObjectUri::new(before.id), ObjectUri::new(after.id));
        assert_eq!(before.revision().content, after.revision().content);
        assert_ne!(before.revision(), after.revision());
        assert_eq!(before.xattrs, after.xattrs);
        let entry = after
            .directory_entry()
            .ok_or_else(|| anyhow::anyhow!("missing entry"))?;
        assert_eq!(entry.name.as_str(), "new.txt");
        assert_eq!(entry.object_id, before.id);
        assert_eq!(entry.workspace_id, before.workspace_id);
        Ok(())
    }

    #[test]
    fn workspace_root_has_no_parent_entry_or_content_revision() -> anyhow::Result<()> {
        let root = ObjectMetadata {
            workspace_id: WorkspaceId::new("workspace_1")?,
            id: ObjectId::generate(),
            parent: None,
            kind: ObjectKind::Directory,
            mime_type: "inode/directory".parse()?,
            xattrs: Xattrs::new(),
            metadata_revision: MetadataRevision::INITIAL,
        };
        assert_eq!(root.directory_entry(), None);
        assert_eq!(root.revision().content, None);
        Ok(())
    }
}
