use crate::blocks::block::{Block, BlockType, Env, parse_pair};
use crate::Rule;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use pest::iterators::Pair;
use serde_json::Value;

pub struct Reduce {
    from: String,
}

impl Reduce {
    pub fn parse(block_pair: Pair<Rule>) -> Result<Self> {
        let mut from: Option<String> = None;

        for pair in block_pair.into_inner() {
            match pair.as_rule() {
                Rule::pair => {
                    let (key, value) = parse_pair(pair)?;
                    match key.as_str() {
                        "from" => from = Some(value),
                        _ => Err(anyhow!("Unexpected `{}` in `reduce` block", key))?,
                    }
                }
                Rule::expected => {
                    Err(anyhow!("`expected` is not yet supported in `reduce` block"))?
                }
                _ => unreachable!(),
            }
        }

        if !from.is_some() {
            Err(anyhow!("Missing required `from` in `reduce` block"))?;
        }

        Ok(Reduce {
            from: from.unwrap(),
        })
    }
}

#[async_trait]
impl Block for Reduce {
    fn block_type(&self) -> BlockType {
        BlockType::Reduce
    }

    fn run_if(&self) -> Option<String> {
        None
    }

    fn inner_hash(&self) -> String {
        let mut hasher = blake3::Hasher::new();
        hasher.update("reduce".as_bytes());
        hasher.update(self.from.as_bytes());
        format!("{}", hasher.finalize().to_hex())
    }

    async fn execute(&self, env: &Env) -> Result<Value> {
        match env.state.get(&self.from) {
            Some(v) => match v.as_array() {
                None => Err(anyhow::anyhow!(
                    "Reduce `from` block `{}` output expeced to be an array",
                    self.from
                )),
                Some(_) => Ok(v.clone()),
            },
            None => Err(anyhow::anyhow!("Block `{}` output not found", self.from)),
        }
    }
}
