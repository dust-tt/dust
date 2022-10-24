use crate::blocks::block::{parse_pair, Block, BlockType, Env};
use crate::Rule;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use pest::iterators::Pair;
use serde_json::Value;

#[derive(Clone)]
pub struct Map {
    from: String,
    repeat: Option<usize>,
}

impl Map {
    pub fn repeat(&self) -> Option<usize> {
        self.repeat
    }

    pub fn parse(block_pair: Pair<Rule>) -> Result<Self> {
        let mut from: Option<String> = None;
        let mut repeat: Option<usize> = None;

        for pair in block_pair.into_inner() {
            match pair.as_rule() {
                Rule::pair => {
                    let (key, value) = parse_pair(pair)?;
                    match key.as_str() {
                        "from" => from = Some(value),
                        "repeat" => match value.parse::<usize>() {
                            Ok(n) => repeat = Some(n),
                            Err(_) => Err(anyhow!(
                                "Invalid `repeat` in `map` block, expecting unsigned integer"
                            ))?,
                        },
                        _ => Err(anyhow!("Unexpected `{}` in `map` block", key))?,
                    }
                }
                Rule::expected => Err(anyhow!("`expected` is not yet supported in `map` block"))?,
                _ => unreachable!(),
            }
        }

        if !from.is_some() {
            Err(anyhow!("Missing required `from` in `map` block"))?;
        }

        Ok(Map {
            from: from.unwrap(),
            repeat,
        })
    }
}

#[async_trait]
impl Block for Map {
    fn block_type(&self) -> BlockType {
        BlockType::Map
    }

    fn inner_hash(&self) -> String {
        let mut hasher = blake3::Hasher::new();
        hasher.update("map".as_bytes());
        hasher.update(self.from.as_bytes());
        if let Some(repeat) = &self.repeat {
            hasher.update(repeat.to_string().as_bytes());
        }
        format!("{}", hasher.finalize().to_hex())
    }

    async fn execute(&self, _name: &str, env: &Env) -> Result<Value> {
        match env.state.get(&self.from) {
            None => Err(anyhow::anyhow!(
                "Map `from` block `{}` output not found",
                self.from
            )),
            Some(v) => match self.repeat {
                None => match v.as_array() {
                    None => Err(anyhow::anyhow!(
                        "Map `from` block `{}` output must be an array, \
                            or `repeat` must be defined",
                        self.from
                    )),
                    Some(arr) => match arr.len() {
                        0 => Err(anyhow::anyhow!(
                            "Map `from` block `{}` output must be a non-empty array",
                            self.from
                        )),
                        _ => Ok(v.clone()),
                    },
                },
                Some(repeat) => match repeat {
                    0 => Err(anyhow::anyhow!(
                        "Map `repeat` must be a positive integer, got 0",
                    )),
                    _ => {
                        let mut output = Vec::new();
                        for _ in 0..repeat {
                            output.push(v.clone());
                        }
                        Ok(Value::Array(output))
                    }
                },
            },
        }
    }

    fn clone_box(&self) -> Box<dyn Block + Sync + Send> {
        Box::new(self.clone())
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
}
