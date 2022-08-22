use anyhow::Result;
use async_trait::async_trait;
use serde_json::Value;
use std::collections::HashMap;

pub struct Env {
    pub state: HashMap<String, Value>,
    pub input: Value,
}

// pub enum Expectations {
//   Keys(Vec<String>),
//   Array(Box<Expectations>),
// }

#[async_trait]
pub trait Block {
    async fn execute(&self, env: &Env) -> Result<Value>;
}
