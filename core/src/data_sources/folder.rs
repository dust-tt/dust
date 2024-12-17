use serde::{Deserialize, Serialize};

use super::node::{Node, NodeType};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Folder {
    data_source_id: String,
    folder_id: String,
    timestamp: u64,
    title: String,
    parent_id: Option<String>,
    parents: Vec<String>,
}

/// MIME type used to identify folder objects
pub const FOLDER_MIMETYPE: &str = "application/vnd.dust.folder";

impl Folder {
    pub fn new(
        data_source_id: String,
        folder_id: String,
        timestamp: u64,
        title: String,
        parent_id: Option<String>,
        parents: Vec<String>,
    ) -> Self {
        Folder {
            data_source_id,
            folder_id,
            timestamp,
            title,
            parent_id,
            parents,
        }
    }

    pub fn data_source_id(&self) -> &str {
        &self.data_source_id
    }
    pub fn timestamp(&self) -> u64 {
        self.timestamp
    }
    pub fn folder_id(&self) -> &str {
        &self.folder_id
    }
    pub fn title(&self) -> &str {
        &self.title
    }
    pub fn parent_id(&self) -> &Option<String> {
        &self.parent_id
    }
    pub fn parents(&self) -> &Vec<String> {
        &self.parents
    }
}

impl From<Folder> for Node {
    fn from(folder: Folder) -> Node {
        Node::new(
            &folder.data_source_id,
            &folder.folder_id,
            NodeType::Folder,
            folder.timestamp,
            &folder.title,
            FOLDER_MIMETYPE,
            folder.parent_id,
            folder.parents,
        )
    }
}
