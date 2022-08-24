use crate::blocks::block::{parse_pair, Block, BlockType, Env};
use crate::data;
use crate::Rule;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use pest::iterators::Pair;
use serde_json::Value;

pub struct Data {
    id: String,
    hash: String,
    run_if: Option<String>,
}

impl Data {
    pub fn parse(block_pair: Pair<Rule>) -> Result<Self> {
        let mut id: Option<String> = None;
        let mut hash: Option<String> = None;
        let mut run_if: Option<String> = None;

        for pair in block_pair.into_inner() {
            match pair.as_rule() {
                Rule::pair => {
                    let (key, value) = parse_pair(pair)?;
                    match key.as_str() {
                        "id" => id = Some(value),
                        "hash" => hash = Some(value),
                        "run_if" => run_if = Some(value),
                        _ => Err(anyhow!("Unexpected `{}` in `data` block", key))?,
                    }
                }
                Rule::expected => Err(anyhow!("`expected` is not yet supported in `data` block"))?,
                _ => unreachable!(),
            }
        }

        if !id.is_some() {
            Err(anyhow!("Missing required `id` in `data` block"))?;
        }
        if !hash.is_some() {
            Err(anyhow!("Missing required `hash` in `data` block"))?;
        }

        Ok(Data {
            id: id.unwrap(),
            hash: hash.unwrap(),
            run_if,
        })
    }
}

#[async_trait]
impl Block for Data {
    fn block_type(&self) -> BlockType {
        BlockType::Data
    }

    fn run_if(&self) -> Option<String> {
        self.run_if.clone()
    }

    fn inner_hash(&self) -> String {
        let mut hasher = blake3::Hasher::new();
        hasher.update("data".as_bytes());
        hasher.update(self.id.as_bytes());
        hasher.update(self.hash.as_bytes());
        if let Some(run_if) = &self.run_if {
            hasher.update(run_if.as_bytes());
        }
        format!("{}", hasher.finalize().to_hex())
    }

    async fn execute(&self, _env: &Env) -> Result<Value> {
        let d = data::Data::new_from_hash(self.id.clone(), self.hash.clone()).await?;
        Ok(d.data_as_value())
    }
}
