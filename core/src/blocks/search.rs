use crate::blocks::block::{
    parse_pair, replace_variables_in_string, Block, BlockResult, BlockType, Env,
};
use crate::http::request::HttpRequest;
use crate::utils::ParseError;
use crate::Rule;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use pest::iterators::Pair;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::str::FromStr;
use tokio::sync::mpsc::UnboundedSender;
use urlencoding::encode;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Error {
    pub error: String,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SearchProviderID {
    SerpAPI,
    Serper,
}

impl ToString for SearchProviderID {
    fn to_string(&self) -> String {
        match self {
            SearchProviderID::SerpAPI => String::from("serpapi"),
            SearchProviderID::Serper => String::from("serper"),
        }
    }
}

impl FromStr for SearchProviderID {
    type Err = ParseError;

    fn from_str(s: &str) -> std::result::Result<Self, Self::Err> {
        match s {
            "serpapi" => Ok(SearchProviderID::SerpAPI),
            "serper" => Ok(SearchProviderID::Serper),
            _ => Err(ParseError::with_message(
                "Unknown search provider ID (possible values: serpapi, serper)",
            )),
        }
    }
}

#[derive(Clone)]
pub struct Search {
    query: String,
    engine: String,
    num: Option<usize>,
}

impl Search {
    pub fn parse(block_pair: Pair<Rule>) -> Result<Self> {
        let mut query: Option<String> = None;
        let mut engine: Option<String> = None;
        let mut num: Option<usize> = None;

        for pair in block_pair.into_inner() {
            match pair.as_rule() {
                Rule::pair => {
                    let (key, value) = parse_pair(pair)?;
                    match key.as_str() {
                        "query" => query = Some(value),
                        "engine" => engine = Some(value),
                        "num" => match value.parse::<usize>() {
                            Ok(n) => num = Some(n),
                            Err(_) => Err(anyhow!(
                                "Invalid `num` in `search` block, expecting unsigned integer"
                            ))?,
                        },
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
            engine: match engine {
                Some(engine) => engine,
                None => "google".to_string(),
            },
            num,
        })
    }
}

#[derive(Serialize, Deserialize)]
struct SerpApiAnswerBoxResult {
    answer: String,
}

#[derive(Serialize, Deserialize)]
struct SerpApiResult {
    answer_box: SerpApiAnswerBoxResult,
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
        hasher.update(self.engine.as_bytes());
        if let Some(num) = &self.num {
            hasher.update(num.to_string().as_bytes());
        }
        format!("{}", hasher.finalize().to_hex())
    }

    async fn execute(
        &self,
        name: &str,
        env: &Env,
        _event_sender: Option<UnboundedSender<Value>>,
        _project_id: i64,
    ) -> Result<BlockResult> {
        let config = env.config.config_for_block(name);

        let (provider_id, num) = match config {
            Some(v) => {
                let provider_id = match v.get("provider_id") {
                    Some(v) => match v {
                        Value::String(s) => match SearchProviderID::from_str(s) {
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

                let num = match v.get("num") {
                    Some(v) => match v {
                        Value::Number(t) => match t.as_u64() {
                            Some(t) => Some(t as usize),
                            None => Err(anyhow!(
                                "Invalid `num` in configuration for search block `{}`",
                                name
                            ))?,
                        },
                        _ => Err(anyhow!(
                            "Invalid `num` in configuration for search block `{}`",
                            name
                        ))?,
                    },
                    _ => None,
                };

                (provider_id, num)
            }
            _ => Err(anyhow!(
                "Missing configuration for search block `{}`, \
                 expecting `{{ \"provider_id\": ... }}`",
                name
            ))?,
        };

        let use_cache = match config {
            Some(v) => match v.get("use_cache") {
                Some(v) => match v {
                    Value::Bool(b) => *b,
                    _ => true,
                },
                None => true,
            },
            None => true,
        };

        let query = replace_variables_in_string(&self.query, "query", env)?;

        let credential_key = match provider_id {
            SearchProviderID::SerpAPI => "SERP_API_KEY",
            SearchProviderID::Serper => "SERPER_API_KEY",
        };

        let provider_api_key = match env.credentials.get(credential_key) {
            Some(api_key) => Ok(api_key.clone()),
            None => match std::env::var(credential_key) {
                Ok(key) => Ok(key),
                Err(_) => Err(anyhow!(format!(
                    "Credentials or environment variable `{}` is not set.",
                    credential_key
                ))),
            },
        }?;

        let num = match num {
            Some(n) => Some(n),
            None => self.num,
        };

        let request = match provider_id {
            SearchProviderID::SerpAPI => {
                let url = match num {
                    None => format!(
                        "https://serpapi.com/search?q={}&engine={}&api_key={}",
                        encode(&query),
                        self.engine,
                        provider_api_key
                    ),
                    Some(n) => format!(
                        "https://serpapi.com/search?q={}&num={}&engine={}&api_key={}",
                        encode(&query),
                        n,
                        self.engine,
                        provider_api_key,
                    ),
                };

                let request = HttpRequest::new("GET", url.as_str(), json!({}), Value::Null)?;

                request
            }
            SearchProviderID::Serper => {
                let url = "https://google.serper.dev/search";

                let headers = json!({
                    "X-API-KEY": provider_api_key,
                    "Content-Type": "application/json"
                });

                let body = json!({
                    "q": query,
                    "num": num.unwrap_or(8),
                });

                let request = HttpRequest::new("POST", url, headers, body)?;

                request
            }
        };

        let response = request
            .execute_with_cache(env.project.clone(), env.store.clone(), use_cache)
            .await?;

        match response.status {
            200 => Ok(BlockResult {
                value: response.body,
                meta: None,
            }),
            s => Err(anyhow!(
                "SearchError: Unexpected error with HTTP status {}.",
                s
            )),
        }
    }

    fn clone_box(&self) -> Box<dyn Block + Sync + Send> {
        Box::new(self.clone())
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
}
