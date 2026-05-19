use anyhow::{anyhow, Result};
use async_trait::async_trait;
use pest::iterators::Pair;
use serde_json::Value;
use tokio::sync::mpsc::UnboundedSender;
use tracing::warn;

use crate::{
    blocks::block::{parse_pair, Block, BlockResult, BlockType, Env},
    Rule,
};

#[derive(Clone)]
pub struct Database {
    query: String,
}

impl Database {
    pub fn parse(block_pair: Pair<Rule>) -> Result<Self> {
        let mut query: Option<String> = None;

        for pair in block_pair.into_inner() {
            match pair.as_rule() {
                Rule::pair => {
                    let (key, value) = parse_pair(pair)?;
                    match key.as_str() {
                        "query" => query = Some(value),
                        _ => Err(anyhow!("Unexpected `{}` in `database` block", key))?,
                    }
                }
                Rule::expected => Err(anyhow!(
                    "`expected` is not yet supported in `database` block"
                ))?,
                _ => unreachable!(),
            }
        }

        if !query.is_some() {
            Err(anyhow!("Missing required `query` in `database` block"))?;
        }

        Ok(Database {
            query: query.unwrap(),
        })
    }
}

#[async_trait]
impl Block for Database {
    fn block_type(&self) -> BlockType {
        BlockType::Database
    }

    fn inner_hash(&self) -> String {
        let mut hasher = blake3::Hasher::new();
        hasher.update("database_schema".as_bytes());
        hasher.update(self.query.as_bytes());
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
            method = "Database::execute",
            "DEPRECATION"
        );
        Err(anyhow!("`database` blocks are now longer supported."))?
    }

    fn clone_box(&self) -> Box<dyn Block + Sync + Send> {
        Box::new(self.clone())
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
}
