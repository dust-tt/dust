use serde::{Deserialize, Serialize};

use super::node::ProviderVisibility;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Folder {
    data_source_id: String,
    data_source_internal_id: String,
    folder_id: String,
    timestamp: u64,
    title: String,
    parent_id: Option<String>,
    parents: Vec<String>,
    mime_type: String,
    source_url: Option<String>,
    provider_visibility: Option<ProviderVisibility>,
}

impl Folder {
    pub fn new(
        data_source_id: String,
        data_source_internal_id: String,
        folder_id: String,
        timestamp: u64,
        title: String,
        parent_id: Option<String>,
        parents: Vec<String>,
        mime_type: String,
        source_url: Option<String>,
        provider_visibility: Option<ProviderVisibility>,
    ) -> Self {
        Folder {
            data_source_id,
            data_source_internal_id,
            folder_id,
            timestamp,
            title,
            parent_id,
            parents,
            mime_type,
            source_url,
            provider_visibility,
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
    pub fn source_url(&self) -> &Option<String> {
        &self.source_url
    }
    pub fn mime_type(&self) -> &str {
        &self.mime_type
    }
    pub fn provider_visibility(&self) -> &Option<ProviderVisibility> {
        &self.provider_visibility
    }
}
