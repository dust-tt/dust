use crate::providers::provider::ProviderID;
use anyhow::Result;
use async_trait::async_trait;
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;

#[derive(Serialize, PartialEq)]
pub struct Env {
    pub provider: ProviderID,
    pub model_id: String,
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
