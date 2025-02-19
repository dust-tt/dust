use serde::{Deserialize, Serialize};
use std::error::Error;
use std::fmt;
use tokio_postgres::types::{private::BytesMut, FromSql, IsNull, ToSql, Type};

use super::folder::Folder;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ProviderVisibility {
    Private,
    Public,
}

impl ToSql for ProviderVisibility {
    fn to_sql(
        &self,
        ty: &Type,
        out: &mut BytesMut,
    ) -> Result<IsNull, Box<dyn Error + Sync + Send>> {
        // note: serde serialization cannot be used here as it would cause a double serialization
        let s = match self {
            ProviderVisibility::Private => "private",
            ProviderVisibility::Public => "public",
        };
        s.to_sql(ty, out)
    }

    fn accepts(ty: &Type) -> bool {
        <&str as ToSql>::accepts(ty)
    }

    // note: serde serialization cannot be used here as it would cause a double serialization
    fn to_sql_checked(
        &self,
        ty: &Type,
        out: &mut BytesMut,
    ) -> Result<IsNull, Box<dyn Error + Sync + Send>> {
        let s = match self {
            ProviderVisibility::Private => "private",
            ProviderVisibility::Public => "public",
        };
        s.to_sql_checked(ty, out)
    }
}

impl<'a> FromSql<'a> for ProviderVisibility {
    fn from_sql(ty: &Type, raw: &'a [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        let s = <&str as FromSql>::from_sql(ty, raw)?;
        match s {
            "private" => Ok(ProviderVisibility::Private),
            "public" => Ok(ProviderVisibility::Public),
            _ => Err("invalid provider visibility".into()),
        }
    }

    fn accepts(ty: &Type) -> bool {
        <&str as FromSql>::accepts(ty)
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Deserialize, Copy)]
pub enum NodeType {
    Document,
    Table,
    Folder,
}

impl fmt::Display for NodeType {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            NodeType::Document => write!(f, "Document"),
            NodeType::Table => write!(f, "Table"),
            NodeType::Folder => write!(f, "Folder"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Node {
    pub data_source_id: String,
    pub data_source_internal_id: String,
    pub node_id: String,
    pub node_type: NodeType,
    pub timestamp: u64,
    pub title: String,
    pub mime_type: String,
    pub provider_visibility: Option<ProviderVisibility>,
    pub parent_id: Option<String>,
    pub parents: Vec<String>,
    pub source_url: Option<String>,
    pub tags: Option<Vec<String>>,
}

impl Node {
    pub fn new(
        data_source_id: &str,
        data_source_internal_id: &str,
        node_id: &str,
        node_type: NodeType,
        timestamp: u64,
        title: &str,
        mime_type: &str,
        provider_visibility: Option<ProviderVisibility>,
        parent_id: Option<String>,
        parents: Vec<String>,
        source_url: Option<String>,
        tags: Option<Vec<String>>,
    ) -> Self {
        Node {
            data_source_id: data_source_id.to_string(),
            data_source_internal_id: data_source_internal_id.to_string(),
            node_id: node_id.to_string(),
            node_type,
            timestamp,
            title: title.to_string(),
            mime_type: mime_type.to_string(),
            provider_visibility: provider_visibility.clone(),
            parent_id: parent_id.clone(),
            parents,
            source_url,
            tags,
        }
    }

    pub fn data_source_id(&self) -> &str {
        &self.data_source_id
    }
    pub fn data_source_internal_id(&self) -> &str {
        &self.data_source_internal_id
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
            self.data_source_internal_id,
            self.node_id,
            self.timestamp,
            self.title,
            self.parent_id,
            self.parents,
            self.mime_type,
            self.source_url,
            self.provider_visibility,
        )
    }

    // Computes a globally unique id for the node.
    pub fn unique_id(&self) -> String {
        format!("{}__{}", self.data_source_internal_id, self.node_id)
    }
}

impl From<serde_json::Value> for Node {
    fn from(value: serde_json::Value) -> Self {
        serde_json::from_value(value).expect("Failed to deserialize Node from JSON value")
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoreContentNode {
    #[serde(flatten)]
    pub base: Node,
    pub children_count: u64,
    pub parent_title: Option<String>,
}

impl CoreContentNode {
    pub fn new(base: Node, children_count: u64, parent_title: Option<String>) -> Self {
        CoreContentNode {
            base,
            children_count,
            parent_title,
        }
    }
}
