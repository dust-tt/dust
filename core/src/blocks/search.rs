use crate::blocks::block::{parse_pair, replace_variables_in_string, Block, BlockType, Env};
use crate::providers::google::{GoogleSearch, ProviderID};
use crate::{utils, Rule};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use pest::iterators::Pair;
use serde_json::Value;
use std::str::FromStr;

#[derive(Clone)]
pub struct Search {
    query: String,
}

impl Search {
    pub fn parse(block_pair: Pair<Rule>) -> Result<Self> {
        let mut query: Option<String> = None;

        for pair in block_pair.into_inner() {
            match pair.as_rule() {
                Rule::pair => {
                    let (key, value) = parse_pair(pair)?;
                    match key.as_str() {
                        "query" => query = Some(value),
                        _ => Err(anyhow!("Unexpected `{}` in `search` block", key))?,
                    }
                }
                Rule::expected => {
                    Err(anyhow!("`expected` is not yet supported in `search` block"))?
                }
                _ => unreachable!(),
            }
        }

        if !query.is_some() {
            Err(anyhow!("Missing required `query` in `search` block"))?;
        }

        Ok(Search {
            query: query.unwrap(),
        })
    }
}

#[async_trait]
impl Block for Search {
    fn block_type(&self) -> BlockType {
        BlockType::Search
    }

    fn inner_hash(&self) -> String {
        let mut hasher = blake3::Hasher::new();
        hasher.update("search".as_bytes());
        hasher.update(self.query.as_bytes());
        format!("{}", hasher.finalize().to_hex())
    }

    async fn execute(&self, name: &str, env: &Env) -> Result<Value> {
        let config = env.config.config_for_block(name);

        let provider_id = match config {
            Some(v) => {
                let provider_id = match v.get("provider_id") {
                    Some(v) => match v {
                        Value::String(s) => match ProviderID::from_str(s) {
                            Ok(p) => p,
                            Err(e) => Err(anyhow!(
                                "Invalid `provider_id` `{}` in configuration \
                                 for search block `{}`: {}",
                                s,
                                name,
                                e
                            ))?,
                        },
                        _ => Err(anyhow!(
                            "Invalid `provider_id` in configuration for search block `{}`: \
                             string expected",
                            name
                        ))?,
                    },
                    _ => Err(anyhow!(
                        "Missing `provider_id` in configuration for search block `{}`",
                        name
                    ))?,
                };

                provider_id
            }
            _ => Err(anyhow!(
                "Missing configuration for search block `{}`, \
                 expecting `{{ \"provider_id\": ... }}`",
                name
            ))?,
        };

        let env = env.clone();
        let mut google = match provider_id {
            ProviderID::Google => GoogleSearch::new(),
        };
        google.initialize(env.credentials.clone()).await?;
        let parsed_query = replace_variables_in_string(&self.query, &env)?;

        let result = google.query(parsed_query.as_str()).await?;

        Ok(serde_json::to_value(result)?)
    }

    fn clone_box(&self) -> Box<dyn Block + Sync + Send> {
        Box::new(self.clone())
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
}
