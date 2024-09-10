use crate::blocks::block::{parse_pair, Block, BlockResult, BlockType, Env};
use crate::Rule;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use pest::iterators::Pair;
use serde_json::Value;
use tokio::sync::mpsc::UnboundedSender;

#[derive(Clone)]
pub struct Map {
    from: String,
    repeat: Option<usize>,
}

static MAP_MAX_ITERATIONS: usize = 64;

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
                            Ok(n) => {
                                if n > MAP_MAX_ITERATIONS {
                                    Err(anyhow!(
                                        "Map `repeat` exceeds maximum value ({})",
                                        MAP_MAX_ITERATIONS
                                    ))?;
                                }
                                repeat = Some(n)
                            }
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

    async fn execute(
        &self,
        _name: &str,
        env: &Env,
        _event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<BlockResult> {
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
                    Some(arr) => {
                        if arr.len() > MAP_MAX_ITERATIONS {
                            Err(anyhow::anyhow!(
                                "Map `from` block `{}` output exceeds maximum size ({})",
                                self.from,
                                MAP_MAX_ITERATIONS
                            ))?;
                        }
                        match arr.len() {
                            0 => Err(anyhow::anyhow!(
                                "Map `from` block `{}` output must be a non-empty array",
                                self.from
                            )),
                            _ => Ok(BlockResult {
                                value: v.clone(),
                                meta: None, // do I need to take the meta here
                            }),
                        }
                    }
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
                        Ok(BlockResult {
                            value: Value::Array(output),
                            meta: None,
                        })
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
