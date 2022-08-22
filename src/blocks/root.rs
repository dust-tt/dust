use crate::blocks::block::{Block, Env};
use anyhow::Result;
use async_trait::async_trait;
use serde_json::Value;

pub struct Root {}

#[async_trait]
impl Block for Root {
    async fn execute(&self, env: &Env) -> Result<Value> {
        Ok(env.input.clone())
    }
}
