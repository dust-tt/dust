use crate::blocks::{
    browser::Browser, chat::Chat, code::Code, curl::Curl, data::Data, data_source::DataSource,
    database::Database, database_schema::DatabaseSchema, end::End, input::Input, llm::LLM,
    map::Map, r#while::While, reduce::Reduce, search::Search,
};
use crate::data_sources::qdrant::QdrantClients;
use crate::databases_store::store::DatabasesStore;
use crate::project::Project;
use crate::run::{Credentials, RunConfig, Secrets};
use crate::stores::store::Store;
use crate::utils::ParseError;
use crate::Rule;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use lazy_static::lazy_static;
use pest::iterators::Pair;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::any::Any;
use std::collections::HashMap;
use std::error::Error;
use std::str::FromStr;
use tera::{Context, Tera};
use tokio::sync::mpsc::UnboundedSender;

#[derive(Serialize, PartialEq, Clone, Debug)]
pub struct MapState {
    pub name: String,
    pub iteration: usize,
}

#[derive(Serialize, PartialEq, Clone, Debug)]
pub struct InputState {
    pub value: Option<Value>,
    pub index: usize,
}

// Env is serialized when passed to code blocks. RunConfig.credentials are not serialized.
#[derive(Serialize, Clone)]
pub struct Env {
    pub config: RunConfig,
    pub state: HashMap<String, Value>,
    pub input: InputState,
    pub map: Option<MapState>,
    pub secrets: Secrets,
    pub run_id: String,
    #[serde(skip_serializing)]
    pub store: Box<dyn Store + Sync + Send>,
    #[serde(skip_serializing)]
    pub databases_store: Box<dyn DatabasesStore + Sync + Send>,
    #[serde(skip_serializing)]
    pub qdrant_clients: QdrantClients,
    #[serde(skip_serializing)]
    pub project: Project,
    #[serde(skip_serializing)]
    pub credentials: Credentials,
}

impl Env {
    pub fn clone_with_unredacted_secrets(&self) -> Self {
        let mut e = self.clone();
        e.secrets.redacted = false;
        e
    }
}

// pub enum Expectations {
//   Keys(Vec<String>),
//   Array(Box<Expectations>),
// }

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize, Hash)]
#[serde(rename_all = "lowercase")]
pub enum BlockType {
    Input,
    Data,
    #[serde(rename = "data_source")]
    DataSource,
    Code,
    LLM,
    Chat,
    Map,
    Reduce,
    Search,
    Curl,
    Browser,
    While,
    End,
    #[serde(rename = "database_schema")]
    DatabaseSchema,
    Database,
}

impl ToString for BlockType {
    fn to_string(&self) -> String {
        match self {
            BlockType::Input => String::from("input"),
            BlockType::Data => String::from("data"),
            BlockType::DataSource => String::from("data_source"),
            BlockType::Code => String::from("code"),
            BlockType::LLM => String::from("llm"),
            BlockType::Chat => String::from("chat"),
            BlockType::Map => String::from("map"),
            BlockType::Reduce => String::from("reduce"),
            BlockType::Search => String::from("search"),
            BlockType::Curl => String::from("curl"),
            BlockType::Browser => String::from("browser"),
            BlockType::While => String::from("while"),
            BlockType::End => String::from("end"),
            BlockType::DatabaseSchema => String::from("database_schema"),
            BlockType::Database => String::from("database"),
        }
    }
}

impl FromStr for BlockType {
    type Err = ParseError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "input" => Ok(BlockType::Input),
            "data" => Ok(BlockType::Data),
            "data_source" => Ok(BlockType::DataSource),
            "code" => Ok(BlockType::Code),
            "llm" => Ok(BlockType::LLM),
            "chat" => Ok(BlockType::Chat),
            "map" => Ok(BlockType::Map),
            "reduce" => Ok(BlockType::Reduce),
            "search" => Ok(BlockType::Search),
            "curl" => Ok(BlockType::Curl),
            "browser" => Ok(BlockType::Browser),
            "while" => Ok(BlockType::While),
            "end" => Ok(BlockType::End),
            "database_schema" => Ok(BlockType::DatabaseSchema),
            "database" => Ok(BlockType::Database),
            _ => Err(ParseError::with_message("Unknown BlockType"))?,
        }
    }
}

#[derive(Deserialize, Serialize, PartialEq, Clone, Debug)]
pub struct BlockResult {
    pub value: Value,
    pub meta: Option<Value>,
}

#[async_trait]
pub trait Block {
    fn block_type(&self) -> BlockType;

    fn inner_hash(&self) -> String;

    async fn execute(
        &self,
        name: &str,
        env: &Env,
        event_sender: Option<UnboundedSender<Value>>,
        project_id: i64,
    ) -> Result<BlockResult>;

    fn clone_box(&self) -> Box<dyn Block + Sync + Send>;
    fn as_any(&self) -> &dyn Any;
}

impl Clone for Box<dyn Block + Sync + Send> {
    fn clone(&self) -> Self {
        self.clone_box()
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
                let chars = pair.as_str().chars().collect::<Vec<char>>();
                if chars[chars.len() - 4] != '\n' {
                    Err(anyhow!("Multine values are expected to end with '\\n```'"))?;
                }
                value = Some(chars.iter().skip(4).take(chars.len() - 8).collect());
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
        BlockType::Input => Ok(Box::new(Input::parse(block_pair)?)),
        BlockType::Data => Ok(Box::new(Data::parse(block_pair)?)),
        BlockType::DataSource => Ok(Box::new(DataSource::parse(block_pair)?)),
        BlockType::Code => Ok(Box::new(Code::parse(block_pair)?)),
        BlockType::LLM => Ok(Box::new(LLM::parse(block_pair)?)),
        BlockType::Chat => Ok(Box::new(Chat::parse(block_pair)?)),
        BlockType::Map => Ok(Box::new(Map::parse(block_pair)?)),
        BlockType::Reduce => Ok(Box::new(Reduce::parse(block_pair)?)),
        BlockType::Search => Ok(Box::new(Search::parse(block_pair)?)),
        BlockType::Curl => Ok(Box::new(Curl::parse(block_pair)?)),
        BlockType::Browser => Ok(Box::new(Browser::parse(block_pair)?)),
        BlockType::While => Ok(Box::new(While::parse(block_pair)?)),
        BlockType::End => Ok(Box::new(End::parse(block_pair)?)),
        BlockType::DatabaseSchema => Ok(Box::new(DatabaseSchema::parse(block_pair)?)),
        BlockType::Database => Ok(Box::new(Database::parse(block_pair)?)),
    }
}

pub fn find_secrets(text: &str) -> Vec<String> {
    lazy_static! {
        static ref RE: Regex = Regex::new(r"\$\{secrets\.(?P<name>[a-zA-Z0-9_\.]+)\}").unwrap();
    }

    RE.captures_iter(text)
        .map(|c| {
            let name = c.name("name").unwrap().as_str();
            String::from(name)
        })
        .collect::<Vec<_>>()
}
pub fn replace_secrets_in_string(text: &str, field: &str, env: &Env) -> Result<String> {
    let secrets_found = find_secrets(text);

    // Run Tera templating engine one_off on the result (before replacing variables but after
    // looking for them).
    let context = Context::from_value(json!(env.state))?;

    let mut result = match Tera::one_off(text, &context, false) {
        Ok(r) => r,
        Err(e) => {
            let err_msg = e
                .source()
                .unwrap()
                .to_string()
                .replace("__tera_one_off", field);

            Err(anyhow!("Templating error: {}", err_msg))?
        }
    };

    secrets_found
        .iter()
        .map(|key| {
            if let Some(secret) = env.secrets.secrets.get(key) {
                result = result.replace(&format!("${{secrets.{}}}", key), secret);
                Ok(())
            } else {
                Err(anyhow!("`secrets.{}` is not a string", key))
            }
        })
        .collect::<Result<Vec<_>>>()?;

    Ok(result)
}

pub fn find_variables(text: &str) -> Vec<(String, String)> {
    lazy_static! {
        static ref RE: Regex =
            Regex::new(r"\$\{(?P<name>[A-Z0-9_]+)\.(?P<key>[a-zA-Z0-9_\.]+)\}").unwrap();
    }

    RE.captures_iter(text)
        .map(|c| {
            let name = c.name("name").unwrap().as_str();
            let key = c.name("key").unwrap().as_str();
            // println!("{} {}", name, key);
            (String::from(name), String::from(key))
        })
        .collect::<Vec<_>>()
}

pub fn replace_variables_in_string(text: &str, field: &str, env: &Env) -> Result<String> {
    let variables = find_variables(text);

    // Run Tera templating engine one_off on the result (before replacing variables but after
    // looking for them).
    let context = Context::from_value(json!(env.state))?;

    let mut result = match Tera::one_off(text, &context, false) {
        Ok(r) => r,
        Err(e) => {
            let err_msg = e
                .source()
                .unwrap()
                .to_string()
                .replace("__tera_one_off", field);

            Err(anyhow!("Templating error: {}", err_msg))?
        }
    };

    variables
        .iter()
        .map(|(name, key)| {
            // Check that the block output exists and is an object.
            let output = env
                .state
                .get(name)
                .ok_or_else(|| anyhow!("Block `{}` output not found", name))?;
            if !output.is_object() {
                Err(anyhow!(
                    "Block `{}` output is not an object, the output of `{}` referred to \
                     as a variable in `{}` must be an object",
                    name,
                    name,
                    field
                ))?;
            }
            let output = output.as_object().unwrap();

            if !output.contains_key(key) {
                Err(anyhow!(
                    "Key `{}` is not present in block `{}` output",
                    key,
                    name
                ))?;
            }
            // Check that output[key] is a string.
            if !output.get(key).unwrap().is_string() {
                Err(anyhow!("`{}.{}` is not a string", name, key,))?;
            }
            result = result.replace(
                &format!("${{{}.{}}}", name, key),
                &output[key].as_str().unwrap(),
            );

            Ok(())
        })
        .collect::<Result<Vec<_>>>()?;

    Ok(result)
}
