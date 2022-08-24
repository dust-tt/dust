use crate::blocks::block::{Block, BlockType, Env};
use crate::Rule;
use anyhow::Result;
use async_trait::async_trait;
use pest::iterators::Pair;
use serde_json::Value;

pub struct Root {}

impl Root {
    pub fn parse(block_pair: Pair<Rule>) -> Result<Self> {
        // TODO(spolu): implement expected for Root as a starter
        Ok(Root {})
    }
}

#[async_trait]
impl Block for Root {
    fn block_type(&self) -> BlockType {
        BlockType::Root
    }

    fn run_if(&self) -> Option<String> {
        None
    }

    fn inner_hash(&self) -> String {
        let mut hasher = blake3::Hasher::new();
        hasher.update("root".as_bytes());
        format!("{}", hasher.finalize().to_hex())
    }

    async fn execute(&self, env: &Env) -> Result<Value> {
        Ok(env.input.clone())
    }
}
