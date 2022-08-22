use crate::blocks::block::{Block, Env};
use anyhow::Result;
use async_trait::async_trait;
use js_sandbox::Script;
use serde_json::Value;

pub struct Code {
    source: String,
}

#[async_trait]
impl Block for Code {
    async fn execute(&self, env: &Env) -> Result<Value> {
        // Assumes there is a _block function defined in `source`.

        // TODO(spolu): make it non-blocking with tokio::block_in_place?
        let mut script = Script::from_string(self.source.as_str())?;
        let result: Value = script.call("_block", env)?;

        Ok(result)
    }
}
