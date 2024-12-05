use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Folder {
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
        data_source_id: String,
        folder_id: String,
        timestamp: u64,
        title: String,
        parents: Vec<String>,
    ) -> Self {
        Folder {
            data_source_id: data_source_id,
            folder_id: folder_id,
            timestamp,
            title: title,
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
    pub fn parents(&self) -> &Vec<String> {
        &self.parents
    }
}
