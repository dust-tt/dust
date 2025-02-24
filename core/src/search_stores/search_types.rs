use crate::data_sources::{data_source::DataSourceESDocument, node::Node};
use anyhow::Result;
use serde_json::Value;

use crate::data_sources::data_source::DATA_SOURCE_MIME_TYPE;

#[derive(Debug, Clone)]
pub enum SearchItem {
    Node(Node),
    DataSource(DataSourceESDocument),
}

impl SearchItem {
    pub fn from_hit(hit: &Value) -> Result<Self> {
        let source = hit
            .get("_source")
            .ok_or_else(|| anyhow::anyhow!("Missing _source"))?;

        println!("source: {:?}", source);

        let mime_type = source
            .get("mime_type")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing mime_type"))?;

        if mime_type == DATA_SOURCE_MIME_TYPE {
            Ok(SearchItem::DataSource(DataSourceESDocument::from(
                source.clone(),
            )))
        } else {
            Ok(SearchItem::Node(Node::from(source.clone())))
        }
    }
}
