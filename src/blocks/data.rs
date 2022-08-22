use crate::blocks::block::{Block, Env};
use anyhow::Result;
use async_trait::async_trait;
use serde_json::Value;
use crate::data;

pub struct Data {
    id: String,
    hash: String,
}

#[async_trait]
impl Block for Data {
    async fn execute(&self, _env: &Env) -> Result<Value> {
        let d = data::Data::new_from_hash(self.id.clone(), self.hash.clone()).await?;
        Ok(d.data_as_value())
    }
}
