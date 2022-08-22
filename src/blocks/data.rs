use crate::blocks::block::{Block, Env};
use anyhow::Result;
use async_trait::async_trait;
use serde_json::Value;

pub struct Data {}

#[async_trait]
impl Block for Data {
    async fn execute(&self, env: &Env) -> Result<Value> {
        Ok(env.input.clone())
    }
}
