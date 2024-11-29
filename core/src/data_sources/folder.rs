use serde::{Deserialize, Serialize};

use crate::project::Project;

use super::node::{Node, NodeType};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Folder {
    project: Project,
    data_source_id: String,
    folder_id: String,
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
        timestamp: u64,
        title: &str,
        parents: Vec<String>,
    ) -> Self {
        Folder {
            project: project.clone(),
            data_source_id: data_source_id.to_string(),
            folder_id: folder_id.to_string(),
            timestamp,
            title: title.to_string(),
            parents,
        }
    }

    pub fn from_node(node: &Node) -> Self {
        Folder::new(
            node.project(),
            node.data_source_id(),
            node.node_id(),
            node.timestamp(),
            node.title(),
            node.parents().clone(),
        )
    }

    pub fn project(&self) -> &Project {
        &self.project
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
    pub fn parents(&self) -> &Vec<String> {
        &self.parents
    }
}

impl From<Node> for Folder {
    fn from(node: Node) -> Self {
        Folder::new(
            node.project(),
            node.data_source_id(),
            node.node_id(),
            node.timestamp(),
            node.title(),
            node.parents().clone(),
        )
    }
}

impl From<Folder> for Node {
    fn from(folder: Folder) -> Self {
        Node::new(
            &folder.project,
            &folder.data_source_id,
            &folder.folder_id,
            NodeType::Folder,
            folder.timestamp,
            &folder.title,
            FOLDER_MIMETYPE,
            folder.parents.clone(),
        )
    }
}
