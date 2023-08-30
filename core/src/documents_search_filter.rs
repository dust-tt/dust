use anyhow::Result;
use serde::{Deserialize, Serialize};

/// A filter to apply to the query based on `tags`. All documents returned must have at least
/// one tag in `is_in` and none of the tags in `is_not`.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TagsFilter {
    #[serde(rename = "in")]
    pub is_in: Option<Vec<String>>,
    #[serde(rename = "not")]
    pub is_not: Option<Vec<String>>,
}

/// A filter to apply to the query based on document parents. All documents returned must have at least
/// one parent in `is_in` and none of their parents in `is_not`.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ParentsFilter {
    #[serde(rename = "in")]
    pub is_in: Option<Vec<String>>,
    #[serde(rename = "not")]
    pub is_not: Option<Vec<String>>,
}

/// A filter to apply to the query based on `timestamp`. All documents returned must have a
/// timestamp greater than `gt` and less than `lt`.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TimestampFilter {
    pub gt: Option<u64>,
    pub lt: Option<u64>,
}

/// Filter argument to perform semantic search or simple reverse-chron querying.
/// It is used to filter the search results based on the
/// presence of tags, parents, or time spans for timestamps.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchFilter {
    pub tags: Option<TagsFilter>,
    pub parents: Option<ParentsFilter>,
    pub timestamp: Option<TimestampFilter>,
}

impl SearchFilter {
    pub fn from_json_str(json: &str) -> Result<Self> {
        let filter: SearchFilter = serde_json::from_str(json)?;
        Ok(filter)
    }
}
