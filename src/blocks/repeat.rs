use crate::blocks::block::{Block, BlockType, Env};
use anyhow::Result;
use async_trait::async_trait;
use serde_json::Value;

pub struct Repeat {
    from: String,
    count: usize,
    run_if: Option<String>,
}

#[async_trait]
impl Block for Repeat {
    fn block_type(&self) -> BlockType {
        BlockType::Repeat
    }

    fn run_if(&self) -> Option<String> {
        self.run_if.clone()
    }

    fn inner_hash(&self) -> String {
        let mut hasher = blake3::Hasher::new();
        hasher.update("repeat".as_bytes());
        hasher.update(self.from.as_bytes());
        hasher.update(self.count.to_string().as_bytes());
        if let Some(run_if) = &self.run_if {
            hasher.update(run_if.as_bytes());
        }
        format!("{}", hasher.finalize().to_hex())
    }

    async fn execute(&self, env: &Env) -> Result<Value> {
        match env.state.get(&self.from) {
            Some(v) => {
                let mut output = Vec::new();
                for _ in 0..self.count {
                    output.push(v.clone());
                }
                Ok(Value::Array(output))
            }
            None => Err(anyhow::anyhow!("Block `{}` output not found", self.from)),
        }
    }
}
