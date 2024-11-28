use serde::{Deserialize, Serialize};

use crate::project::Project;

#[derive(Debug, Clone, Serialize, PartialEq, Deserialize, Copy)]
pub enum NodeType {
    Document,
    Table,
    Folder,
}

pub trait Node {
    fn project(&self) -> &Project;
    fn data_source_id(&self) -> &str;
    fn node_id(&self) -> &str;
    fn created(&self) -> u64;
    fn timestamp(&self) -> u64;
    fn node_type(&self) -> NodeType;
    fn title(&self) -> &str;
    fn mime_type(&self) -> &str;
    fn parents(&self) -> &Vec<String>;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimpleNode {
    project: Project,
    data_source_id: String,
    node_id: String,
    node_type: NodeType,
    created: u64,
    timestamp: u64,
    title: String,
    mime_type: String,
    parents: Vec<String>,
}

impl SimpleNode {
    pub fn new(
        project: &Project,
        data_source_id: &str,
        node_id: &str,
        node_type: NodeType,
        created: u64,
        timestamp: u64,
        title: &str,
        mime_type: &str,
        parents: Vec<String>,
    ) -> Self {
        SimpleNode {
            project: project.clone(),
            data_source_id: data_source_id.to_string(),
            node_id: node_id.to_string(),
            node_type,
            created,
            timestamp,
            title: title.to_string(),
            mime_type: mime_type.to_string(),
            parents,
        }
    }
}

impl Node for SimpleNode {
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
        &self.node_id
    }
    fn node_type(&self) -> NodeType {
        self.node_type
    }
    fn title(&self) -> &str {
        &self.title
    }
    fn mime_type(&self) -> &str {
        &self.mime_type
    }
    fn parents(&self) -> &Vec<String> {
        &self.parents
    }
}
