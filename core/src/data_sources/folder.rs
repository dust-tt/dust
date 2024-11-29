use serde::{Deserialize, Serialize};

use crate::project::Project;

use super::node::{Node, NodeType, SimpleNode};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Folder {
    project: Project,
    data_source_id: String,
    folder_id: String,
    created: u64,
    timestamp: u64,
    title: String,
    parents: Vec<String>,
}

/// MIME type used to identify folder objects
pub const FOLDER_MIMETYPE: &str = "application/vnd.dust.folder";

impl Folder {
    pub fn new(
        project: &Project,
        data_source_id: &str,
        folder_id: &str,
        created: u64,
        timestamp: u64,
        title: &str,
        parents: Vec<String>,
    ) -> Self {
        Folder {
            project: project.clone(),
            data_source_id: data_source_id.to_string(),
            folder_id: folder_id.to_string(),
            created,
            timestamp,
            title: title.to_string(),
            parents,
        }
    }

    pub fn from_node(node: &SimpleNode) -> Self {
        Folder::new(
            node.project(),
            node.data_source_id(),
            node.node_id(),
            node.created(),
            node.timestamp(),
            node.title(),
            node.parents().clone(),
        )
    }
}

impl Node for Folder {
    fn project(&self) -> &Project {
        &self.project
    }
    fn data_source_id(&self) -> &str {
        &self.data_source_id
    }
    fn created(&self) -> u64 {
        self.created
    }
    fn timestamp(&self) -> u64 {
        self.timestamp
    }
    fn node_id(&self) -> &str {
        &self.folder_id
    }
    fn node_type(&self) -> NodeType {
        NodeType::Folder
    }
    fn title(&self) -> &str {
        &self.title
    }
    fn mime_type(&self) -> &str {
        FOLDER_MIMETYPE
    }
    fn parents(&self) -> &Vec<String> {
        &self.parents
    }
}
