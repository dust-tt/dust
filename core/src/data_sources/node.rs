use super::{
    data_source::{DataSourceESDocument, DATA_SOURCE_MIME_TYPE},
    folder::Folder,
};
use crate::data_sources::data_source::Document;
use crate::databases::table::Table;
use crate::search_stores::search_store::Indexable;
use serde::{Deserialize, Serialize};
use std::error::Error;
use std::fmt;
use tokio_postgres::types::{private::BytesMut, FromSql, IsNull, ToSql, Type};

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
        // note: serde serialization cannot be used here as it would cause double serialization
        let s = match self {
            ProviderVisibility::Private => "private",
            ProviderVisibility::Public => "public",
        };
        s.to_sql(ty, out)
    }

    fn accepts(ty: &Type) -> bool {
        <&str as ToSql>::accepts(ty)
    }

    // note: serde serialization cannot be used here as it would cause double serialization
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

#[derive(Debug, Clone, PartialEq, Copy)]
pub enum NodeType {
    Document,
    Table,
    Folder,
}

impl Serialize for NodeType {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string().to_lowercase())
    }
}

impl<'de> Deserialize<'de> for NodeType {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        match s.as_str() {
            "Document" | "document" => Ok(NodeType::Document),
            "Table" | "table" => Ok(NodeType::Table),
            "Folder" | "folder" => Ok(NodeType::Folder),
            _ => Err(serde::de::Error::unknown_variant(
                &s,
                &["Document", "document", "Table", "table", "Folder", "folder"],
            )),
        }
    }
}

impl fmt::Display for NodeType {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            NodeType::Document => write!(f, "document"),
            NodeType::Table => write!(f, "table"),
            NodeType::Folder => write!(f, "folder"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Node {
    pub data_source_id: String,
    pub data_source_internal_id: String,
    pub node_id: String,
    pub node_type: NodeType,
    pub text_size: Option<i64>,
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
        text_size: Option<i64>,
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
            text_size,
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
    pub base: NodeESDocument,
    pub children_count: u64,
    pub parent_title: Option<String>,
}

pub const DATA_SOURCE_NODE_ID: &str = "datasource_node_id";

impl CoreContentNode {
    pub fn new(base: NodeESDocument, children_count: u64, parent_title: Option<String>) -> Self {
        CoreContentNode {
            base,
            children_count,
            parent_title,
        }
    }

    pub fn from_es_data_source_document(data_source: DataSourceESDocument) -> Self {
        Self {
            base: NodeESDocument {
                data_source_id: data_source.data_source_id.clone(),
                data_source_internal_id: data_source.data_source_internal_id,
                node_id: DATA_SOURCE_NODE_ID.to_string(),
                node_type: NodeType::Folder,
                text_size: None,
                timestamp: data_source.timestamp,
                title: data_source.name,
                mime_type: DATA_SOURCE_MIME_TYPE.to_string(),
                provider_visibility: None,
                parent_id: None, // Data sources don't have parents.
                parents: vec![],
                source_url: None,
                tags: Some(vec![]),
            },
            children_count: 1, // Assume that data source nodes have at least one child.
            parent_title: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeESDocument {
    pub data_source_id: String,
    pub data_source_internal_id: String,
    pub node_id: String,
    pub node_type: NodeType,
    pub text_size: Option<i64>, // Mapped to a long in the ES index.
    pub timestamp: u64,
    pub title: String,
    pub mime_type: String,
    pub provider_visibility: Option<ProviderVisibility>,
    pub parent_id: Option<String>,
    pub parents: Vec<String>,
    pub source_url: Option<String>,
    pub tags: Option<Vec<String>>,
}

impl From<&Folder> for NodeESDocument {
    fn from(folder: &Folder) -> Self {
        Self {
            data_source_id: folder.data_source_id().to_string(),
            data_source_internal_id: folder.data_source_internal_id().to_string(),
            node_id: folder.folder_id().to_string(),
            node_type: NodeType::Folder,
            text_size: None,
            timestamp: folder.timestamp(),
            title: folder.title().to_string(),
            mime_type: folder.mime_type().to_string(),
            provider_visibility: folder.provider_visibility().clone(),
            parent_id: folder.parent_id().clone(),
            parents: folder.parents().clone(),
            source_url: folder.source_url().clone(),
            tags: None,
        }
    }
}

impl From<&Document> for NodeESDocument {
    fn from(document: &Document) -> Self {
        Self {
            data_source_id: document.data_source_id.to_string(),
            data_source_internal_id: document.data_source_internal_id.to_string(),
            node_id: document.document_id.to_string(),
            node_type: NodeType::Document,
            text_size: Some(document.text_size as i64),
            timestamp: document.timestamp,
            title: document.title.to_string(),
            mime_type: document.mime_type.to_string(),
            provider_visibility: document.provider_visibility.clone(),
            parent_id: document.parent_id.clone(),
            parents: document.parents.clone(),
            source_url: document.source_url.clone(),
            tags: Some(document.tags.clone()),
        }
    }
}

impl From<&Table> for NodeESDocument {
    fn from(table: &Table) -> Self {
        Self {
            data_source_id: table.data_source_id().to_string(),
            data_source_internal_id: table.data_source_internal_id().to_string(),
            node_id: table.table_id().to_string(),
            node_type: NodeType::Table,
            text_size: None,
            timestamp: table.timestamp(),
            title: table.title().to_string(),
            mime_type: table.mime_type().to_string(),
            provider_visibility: table.provider_visibility().clone(),
            parent_id: table.parent_id().clone(),
            parents: table.parents().clone(),
            source_url: table.source_url().clone(),
            tags: None,
        }
    }
}

impl From<&Node> for NodeESDocument {
    fn from(node: &Node) -> Self {
        Self {
            data_source_id: node.data_source_id().to_string(),
            data_source_internal_id: node.data_source_internal_id().to_string(),
            node_id: node.node_id().to_string(),
            node_type: node.node_type(),
            text_size: node.text_size,
            timestamp: node.timestamp(),
            title: node.title().to_string(),
            mime_type: node.mime_type().to_string(),
            provider_visibility: node.provider_visibility.clone(),
            parent_id: node.parent_id.clone(),
            parents: node.parents().to_vec(),
            source_url: node.source_url.clone(),
            tags: node.tags.clone(),
        }
    }
}

impl From<serde_json::Value> for NodeESDocument {
    fn from(value: serde_json::Value) -> Self {
        serde_json::from_value(value).expect("Failed to deserialize NodeESDocument from JSON value")
    }
}

pub const DATA_SOURCE_NODE_INDEX_NAME: &str = "core.data_sources_nodes";

impl Indexable for Node {
    type Doc = NodeESDocument;
    fn index_name(&self) -> &'static str {
        DATA_SOURCE_NODE_INDEX_NAME
    }
    fn unique_id(&self) -> String {
        self.unique_id()
    }
    fn document_type(&self) -> &'static str {
        "data_source_node"
    }
    fn to_document(&self) -> Self::Doc {
        self.into()
    }
}

impl Indexable for Document {
    type Doc = NodeESDocument;
    fn index_name(&self) -> &'static str {
        DATA_SOURCE_NODE_INDEX_NAME
    }
    fn unique_id(&self) -> String {
        format!("{}__{}", self.data_source_internal_id, self.document_id)
    }
    fn document_type(&self) -> &'static str {
        "data_source_node"
    }
    fn to_document(&self) -> Self::Doc {
        self.into()
    }
}

impl Indexable for Table {
    type Doc = NodeESDocument;
    fn index_name(&self) -> &'static str {
        DATA_SOURCE_NODE_INDEX_NAME
    }
    fn unique_id(&self) -> String {
        format!("{}__{}", self.data_source_internal_id(), self.table_id())
    }
    fn document_type(&self) -> &'static str {
        "data_source_node"
    }
    fn to_document(&self) -> Self::Doc {
        self.into()
    }
}

impl Indexable for Folder {
    type Doc = NodeESDocument;
    fn index_name(&self) -> &'static str {
        DATA_SOURCE_NODE_INDEX_NAME
    }
    fn unique_id(&self) -> String {
        format!("{}__{}", self.data_source_internal_id(), self.folder_id())
    }
    fn document_type(&self) -> &'static str {
        "data_source_node"
    }
    fn to_document(&self) -> Self::Doc {
        self.into()
    }
}
