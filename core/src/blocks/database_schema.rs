use anyhow::{anyhow, Ok, Result};
use async_trait::async_trait;
use pest::iterators::Pair;
use serde_json::Value;
use tokio::sync::mpsc::UnboundedSender;
use tracing::warn;

use crate::{
    blocks::block::{Block, BlockResult, BlockType, Env},
    Rule,
};

#[derive(Clone)]
pub struct DatabaseSchema {}

impl DatabaseSchema {
    pub fn parse(_block_pair: Pair<Rule>) -> Result<Self> {
        Ok(DatabaseSchema {})
    }
}

#[async_trait]
impl Block for DatabaseSchema {
    fn block_type(&self) -> BlockType {
        BlockType::DatabaseSchema
    }

    fn inner_hash(&self) -> String {
        let mut hasher = blake3::Hasher::new();
        hasher.update("database_schema".as_bytes());
        format!("{}", hasher.finalize().to_hex())
    }

    async fn execute(
        &self,
        _name: &str,
        env: &Env,
        _event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<BlockResult> {
        warn!(
            project_id = env.project.project_id(),
            method = "DatabaseSchema::execute",
            "DEPRECATION"
        );
        Err(anyhow!(
            "`database_schema` blocks are now longer supported."
        ))?
    }

    fn clone_box(&self) -> Box<dyn Block + Sync + Send> {
        Box::new(self.clone())
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
}
