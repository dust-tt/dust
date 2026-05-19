use crate::blocks::block::{parse_pair, Block, BlockResult, BlockType, Env};
use crate::Rule;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use pest::iterators::Pair;
use serde_json::Value;
use tokio::sync::mpsc::UnboundedSender;

#[derive(Clone)]
pub struct DataSource {
    query: String,
    full_text: bool,
}

impl DataSource {
    pub fn parse(block_pair: Pair<Rule>) -> Result<Self> {
        let mut query: Option<String> = None;
        let mut full_text: bool = false;

        for pair in block_pair.into_inner() {
            match pair.as_rule() {
                Rule::pair => {
                    let (key, value) = parse_pair(pair)?;
                    match key.as_str() {
                        "query" => query = Some(value),
                        "full_text" => match value.as_str() {
                            "true" => full_text = true,
                            "false" => full_text = false,
                            _ => Err(anyhow!(
                                "Invalid value for `full_text`, must be `true` or `false`"
                            ))?,
                        },
                        _ => Err(anyhow!("Unexpected `{}` in `data_source` block", key))?,
                    }
                }
                Rule::expected => Err(anyhow!(
                    "`expected` is not yet supported in `data_source` block"
                ))?,
                _ => unreachable!(),
            }
        }

        if !query.is_some() {
            Err(anyhow!("Missing required `query` in `data_source` block"))?;
        }

        Ok(DataSource {
            query: query.unwrap(),
            full_text,
        })
    }
}

#[async_trait]
impl Block for DataSource {
    fn block_type(&self) -> BlockType {
        BlockType::DataSource
    }

    fn inner_hash(&self) -> String {
        let mut hasher = blake3::Hasher::new();
        hasher.update("data_source".as_bytes());
        hasher.update(self.query.as_bytes());
        hasher.update(self.full_text.to_string().as_bytes());
        format!("{}", hasher.finalize().to_hex())
    }

    async fn execute(
        &self,
        _name: &str,
        _env: &Env,
        _event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<BlockResult> {
        Err(anyhow!("`data_source` blocks are now longer supported."))?
    }

    fn clone_box(&self) -> Box<dyn Block + Sync + Send> {
        Box::new(self.clone())
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
}
