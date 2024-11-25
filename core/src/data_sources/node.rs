use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, PartialEq, Deserialize)]
pub enum NodeType {
    Document,
    Table,
    Folder,
}

#[derive(Debug, Clone, Serialize, PartialEq, Deserialize)]
pub struct Node {
    pub node_id: String,
    pub created: u64,
    pub timestamp: u64,
    pub node_type: NodeType,
    pub title: String,
    pub mime_type: String,
    pub parents: Vec<String>,
}
