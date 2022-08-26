use crate::blocks::block::{parse_pair, Block, BlockType, Env};
use crate::Rule;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use pest::iterators::Pair;
use serde_json::Value;

#[derive(Clone)]
pub struct Reduce {}

impl Reduce {
    pub fn parse(block_pair: Pair<Rule>) -> Result<Self> {
        for pair in block_pair.into_inner() {
            match pair.as_rule() {
                Rule::pair => {
                    let (key, value) = parse_pair(pair)?;
                    match key.as_str() {
                        _ => Err(anyhow!("Unexpected `{}` in `reduce` block", key))?,
                    }
                }
                Rule::expected => {
                    Err(anyhow!("`expected` is not yet supported in `reduce` block"))?
                }
                _ => unreachable!(),
            }
        }

        Ok(Reduce {})
    }
}

#[async_trait]
impl Block for Reduce {
    fn block_type(&self) -> BlockType {
        BlockType::Reduce
    }

    fn run_if(&self) -> Option<String> {
        None
    }

    fn inner_hash(&self) -> String {
        let mut hasher = blake3::Hasher::new();
        hasher.update("reduce".as_bytes());
        format!("{}", hasher.finalize().to_hex())
    }

    async fn execute(&self, env: &Env) -> Result<Value> {
        // No-op the block outputs within the map/reduce will be coallesced, the output of reduce is
        // ignored and not stored in the environment as it has the same name as the map block.
        Ok(Value::Null)
    }

    fn clone_box(&self) -> Box<dyn Block + Sync + Send> {
        Box::new(self.clone())
    }
}
