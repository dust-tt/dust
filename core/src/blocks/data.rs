use crate::blocks::block::{parse_pair, Block, BlockResult, BlockType, Env};
use crate::Rule;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use pest::iterators::Pair;
use serde_json::Value;
use tokio::sync::mpsc::UnboundedSender;

#[derive(Clone)]
pub struct Data {
    dataset_id: String,
    hash: String,
}

impl Data {
    pub fn parse(block_pair: Pair<Rule>) -> Result<Self> {
        let mut dataset_id: Option<String> = None;
        let mut hash: Option<String> = None;

        for pair in block_pair.into_inner() {
            match pair.as_rule() {
                Rule::pair => {
                    let (key, value) = parse_pair(pair)?;
                    match key.as_str() {
                        "dataset_id" => dataset_id = Some(value),
                        "hash" => hash = Some(value),
                        _ => Err(anyhow!("Unexpected `{}` in `data` block", key))?,
                    }
                }
                Rule::expected => Err(anyhow!("`expected` is not yet supported in `data` block"))?,
                _ => unreachable!(),
            }
        }

        if !dataset_id.is_some() {
            Err(anyhow!("Missing required `id` in `data` block"))?;
        }
        if !hash.is_some() {
            Err(anyhow!("Missing required `hash` in `data` block"))?;
        }

        Ok(Data {
            dataset_id: dataset_id.unwrap(),
            hash: hash.unwrap(),
        })
    }
}

#[async_trait]
impl Block for Data {
    fn block_type(&self) -> BlockType {
        BlockType::Data
    }

    fn inner_hash(&self) -> String {
        let mut hasher = blake3::Hasher::new();
        hasher.update("data".as_bytes());
        hasher.update(self.dataset_id.as_bytes());
        hasher.update(self.hash.as_bytes());
        format!("{}", hasher.finalize().to_hex())
    }

    async fn execute(
        &self,
        _name: &str,
        env: &Env,
        _event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<BlockResult> {
        match env
            .store
            .load_dataset(&env.project, &self.dataset_id, &self.hash)
            .await?
        {
            Some(d) => Ok(BlockResult {
                value: d.data_as_value(),
                meta: None,
            }),
            None => Err(anyhow!(
                "Version `{}` not found for dataset `{}`",
                self.hash,
                self.dataset_id,
            ))?,
        }
    }

    fn clone_box(&self) -> Box<dyn Block + Sync + Send> {
        Box::new(self.clone())
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
}
