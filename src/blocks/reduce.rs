use crate::blocks::block::{Block, BlockType, Env};
use anyhow::Result;
use async_trait::async_trait;
use serde_json::Value;

pub struct Reduce {
    from: String,
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
        hasher.update(self.from.as_bytes());
        format!("{}", hasher.finalize().to_hex())
    }

    async fn execute(&self, env: &Env) -> Result<Value> {
        match env.state.get(&self.from) {
            Some(v) => match v.as_array() {
                None => Err(anyhow::anyhow!(
                    "Reduce `from` block `{}` output expeced to be an array",
                    self.from
                )),
                Some(_) => Ok(v.clone()),
            },
            None => Err(anyhow::anyhow!("Block `{}` output not found", self.from)),
        }
    }
}
