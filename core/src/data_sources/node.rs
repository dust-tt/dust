use serde::{Deserialize, Serialize};

use super::folder::Folder;

#[derive(Debug, Clone, Serialize, PartialEq, Deserialize, Copy)]
pub enum NodeType {
    Document,
    Table,
    Folder,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Node {
    data_source_id: String,
    node_id: String,
    node_type: NodeType,
    timestamp: u64,
    title: String,
    mime_type: String,
    parent_id: Option<String>,
    parents: Vec<String>,
}

impl Node {
    pub fn new(
        data_source_id: &str,
        node_id: &str,
        node_type: NodeType,
        timestamp: u64,
        title: &str,
        mime_type: &str,
        parent_id: Option<String>,
        parents: Vec<String>,
    ) -> Self {
        Node {
            data_source_id: data_source_id.to_string(),
            node_id: node_id.to_string(),
            node_type,
            timestamp,
            title: title.to_string(),
            mime_type: mime_type.to_string(),
            parent_id: parent_id.clone(),
            parents,
        }
    }

    pub fn data_source_id(&self) -> &str {
        &self.data_source_id
    }
    pub fn timestamp(&self) -> u64 {
        self.timestamp
    }
    pub fn node_id(&self) -> &str {
        &self.node_id
    }
    pub fn node_type(&self) -> NodeType {
        self.node_type
    }
    pub fn title(&self) -> &str {
        &self.title
    }
    pub fn mime_type(&self) -> &str {
        &self.mime_type
    }
    pub fn parents(&self) -> &Vec<String> {
        &self.parents
    }

    // Consumes self into a Folder.
    pub fn into_folder(self) -> Folder {
        Folder::new(
            self.data_source_id,
            self.node_id,
            self.timestamp,
            self.title,
            self.parent_id,
            self.parents,
        )
    }
}

impl From<serde_json::Value> for Node {
    fn from(value: serde_json::Value) -> Self {
        serde_json::from_value(value).expect("Failed to deserialize Node from JSON value")
    }
}
