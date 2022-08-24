use crate::blocks::block::{Block, BlockType, Env};
use anyhow::Result;
use async_trait::async_trait;
use serde_json::Value;

pub struct Map {
    from: String,
    run_if: Option<String>,
}

#[async_trait]
impl Block for Map {
    fn block_type(&self) -> BlockType {
        BlockType::Map
    }

    fn run_if(&self) -> Option<String> {
        self.run_if.clone()
    }

    fn inner_hash(&self) -> String {
        let mut hasher = blake3::Hasher::new();
        hasher.update("map".as_bytes());
        hasher.update(self.from.as_bytes());
        if let Some(run_if) = &self.run_if {
            hasher.update(run_if.as_bytes());
        }
        format!("{}", hasher.finalize().to_hex())
    }

    async fn execute(&self, env: &Env) -> Result<Value> {
        match env.state.get(&self.from) {
            Some(v) => match v.as_array() {
                None => Err(anyhow::anyhow!(
                    "Map `from` block `{}` output must be an array",
                    self.from
                )),
                Some(_) => Ok(v.clone()),
            },
            None => Err(anyhow::anyhow!("Block `{}` output not found", self.from)),
        }
    }
}
