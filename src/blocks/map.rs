use crate::blocks::block::{parse_pair, Block, BlockType, Env};
use crate::Rule;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use pest::iterators::Pair;
use serde_json::Value;

pub struct Map {
    from: String,
    repeat: Option<usize>,
    run_if: Option<String>,
}

impl Map {
    pub fn parse(block_pair: Pair<Rule>) -> Result<Self> {
        let mut from: Option<String> = None;
        let mut repeat: Option<usize> = None;
        let mut run_if: Option<String> = None;

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
                        "run_if" => run_if = Some(value),
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
            run_if,
        })
    }
}

#[async_trait]
impl Block for Map {
    fn block_type(&self) -> BlockType {
        BlockType::Map
    }

    fn run_if(&self) -> Option<String> {
        self.run_if.clone()
    }

    fn inner_hash(&self) -> String {
        let mut hasher = blake3::Hasher::new();
        hasher.update("map".as_bytes());
        hasher.update(self.from.as_bytes());
        if let Some(repeat) = &self.repeat {
            hasher.update(repeat.to_string().as_bytes());
        }
        if let Some(run_if) = &self.run_if {
            hasher.update(run_if.as_bytes());
        }
        format!("{}", hasher.finalize().to_hex())
    }

    async fn execute(&self, env: &Env) -> Result<Value> {
        match self.repeat {
            None => match env.state.get(&self.from) {
                Some(v) => match v.as_array() {
                    None => Err(anyhow::anyhow!(
                        "Map `from` block `{}` output must be an array, \
                         or `repeat` must be defined",
                        self.from
                    )),
                    Some(_) => Ok(v.clone()),
                },
                None => Err(anyhow::anyhow!("Block `{}` output not found", self.from)),
            },
            Some(repeat) => match env.state.get(&self.from) {
                Some(v) => {
                    let mut output = Vec::new();
                    for _ in 0..repeat {
                        output.push(v.clone());
                    }
                    Ok(Value::Array(output))
                }
                None => Err(anyhow::anyhow!("Block `{}` output not found", self.from)),
            },
        }
    }
}
