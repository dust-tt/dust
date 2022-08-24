use crate::blocks::block::{Block, Env, BlockType};
use anyhow::Result;
use async_trait::async_trait;
use js_sandbox::Script;
use serde_json::Value;

pub struct Code {
    source: String,
    run_if: Option<String>,
}

#[async_trait]
impl Block for Code {
    fn block_type(&self) -> BlockType {
        BlockType::Code
    }

    fn run_if(&self) -> Option<String> {
        self.run_if.clone()
    }

    fn inner_hash(&self) -> String {
        let mut hasher = blake3::Hasher::new();
        hasher.update("code".as_bytes());
        hasher.update(self.source.as_bytes());
        if let Some(run_if) = &self.run_if {
            hasher.update(run_if.as_bytes());
        }
        format!("{}", hasher.finalize().to_hex())
    }

    async fn execute(&self, env: &Env) -> Result<Value> {
        // Assumes there is a _fun function defined in `source`.

        // TODO(spolu): make it non-blocking with tokio::block_in_place?
        let mut script = Script::from_string(self.source.as_str())?;
        let result: Value = script.call("_fun", env)?;

        Ok(result)
    }
}
