use crate::blocks::{code::Code, data::Data, llm::LLM, map::Map, reduce::Reduce, root::Root};
use crate::providers::provider::ProviderID;
use crate::utils::ParseError;
use crate::Rule;
use anyhow::Result;
use async_trait::async_trait;
use js_sandbox::Script;
use pest::iterators::Pair;
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::str::FromStr;

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

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum BlockType {
    Root,
    Data,
    Code,
    LLM,
    Map,
    Reduce,
}

impl ToString for BlockType {
    fn to_string(&self) -> String {
        match self {
            BlockType::Root => String::from("root"),
            BlockType::Data => String::from("data"),
            BlockType::Code => String::from("code"),
            BlockType::LLM => String::from("llm"),
            BlockType::Map => String::from("map"),
            BlockType::Reduce => String::from("reduce"),
        }
    }
}

impl FromStr for BlockType {
    type Err = ParseError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "root" => Ok(BlockType::Root),
            "data" => Ok(BlockType::Data),
            "code" => Ok(BlockType::Code),
            "llm" => Ok(BlockType::LLM),
            "map" => Ok(BlockType::Map),
            "reduce" => Ok(BlockType::Reduce),
            _ => Err(ParseError::with_message("Unknown BlockType"))?,
        }
    }
}

#[async_trait]
pub trait Block {
    fn block_type(&self) -> BlockType;

    fn run_if(&self) -> Option<String>;

    fn inner_hash(&self) -> String;

    async fn execute(&self, env: &Env) -> Result<Value>;

    fn should_run(&self, env: &Env) -> Result<bool> {
        match self.run_if() {
            None => Ok(true),
            Some(source) => {
                // TODO(spolu): performance impact of initializing the script?
                let mut script = Script::from_string(source.as_str())?;
                let result: Value = script.call("_fun", env)?;
                match result.as_bool() {
                    Some(b) => Ok(b),
                    _ => Err(anyhow::anyhow!(
                        "Expected boolean to be returned from the `run_if` condition"
                    ))?,
                }
            }
        }
    }
}

/// Parses a block pair from a pest parser Pair.
pub fn parse_pair(pair_pair: Pair<Rule>) -> Result<(String, String)> {
    assert!(pair_pair.as_rule() == Rule::pair);

    let mut key: Option<String> = None;
    let mut value: Option<String> = None;
    for pair in pair_pair.into_inner() {
        match pair.as_rule() {
            Rule::key => {
                key = Some(pair.as_str().to_string());
            }
            Rule::string => {
                value = Some(pair.as_str().to_string());
            }
            Rule::multiline => {
                value = Some(pair.as_str().to_string());
            }
            _ => unreachable!(),
        }
    }
    assert!(key.is_some());
    assert!(value.is_some());

    Ok((key.unwrap(), value.unwrap()))
}

// TODO(spolu): pass in block_name for better error messages.
pub fn parse_block(t: BlockType, block_pair: Pair<Rule>) -> Result<Box<dyn Block + Sync + Send>> {
    match t {
        BlockType::Root => Ok(Box::new(Root::parse(block_pair)?)),
        BlockType::Data => Ok(Box::new(Data::parse(block_pair)?)),
        BlockType::Code => Ok(Box::new(Code::parse(block_pair)?)),
        BlockType::LLM => Ok(Box::new(LLM::parse(block_pair)?)),
        BlockType::Map => Ok(Box::new(Map::parse(block_pair)?)),
        BlockType::Reduce => Ok(Box::new(Reduce::parse(block_pair)?)),
    }
}
