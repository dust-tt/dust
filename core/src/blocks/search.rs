use crate::blocks::block::{parse_pair, replace_variables_in_string, Block, BlockType, Env};
use crate::http::request::HttpRequest;
use crate::Rule;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use pest::iterators::Pair;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::sync::mpsc::UnboundedSender;
use urlencoding::encode;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Error {
    pub error: String,
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
    ) -> Result<Value> {
        let config = env.config.config_for_block(name);

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

        let serp_api_key = match env.credentials.get("SERP_API_KEY") {
            Some(api_key) => Ok(api_key.clone()),
            None => match std::env::var("SERP_API_KEY") {
                Ok(key) => Ok(key),
                Err(_) => Err(anyhow!(
                    "Credentials or environment variable `SERP_API_KEY` is not set."
                )),
            },
        }?;

        let url = match self.num {
            None => format!(
                "https://serpapi.com/search?q={}&engine={}&api_key={}",
                encode(&query),
                self.engine,
                serp_api_key
            ),
            Some(n) => format!(
                "https://serpapi.com/search?q={}&num={}&engine={}&api_key={}",
                encode(&query),
                n,
                self.engine,
                serp_api_key,
            ),
        };

        let request = HttpRequest::new("GET", url.as_str(), json!({}), Value::Null)?;

        let response = request
            .execute_with_cache(env.project.clone(), env.store.clone(), use_cache)
            .await?;

        match response.status {
            200 => Ok(response.body),
            s => Err(anyhow!(
                "SerpAPIError: Unexpected error with HTTP status {}.",
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
