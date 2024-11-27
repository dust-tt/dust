use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, PartialEq, Deserialize)]
pub struct Folder {
    pub data_source_id: String,
    pub folder_id: String,
    pub created: u64,
}
