use crate::blocks::block::{parse_pair, replace_variables_in_string, Block, BlockType, Env};
use crate::Rule;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use hyper::{body::Buf, Body, Client, Method, Request};
use hyper_tls::HttpsConnector;
use pest::iterators::Pair;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::prelude::*;
use urlencoding::encode;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Error {
    pub error: String,
}

#[derive(Clone)]
pub struct Search {
    query: String,
    engine: String,
}

impl Search {
    pub fn parse(block_pair: Pair<Rule>) -> Result<Self> {
        let mut query: Option<String> = None;
        let mut engine: Option<String> = None;

        for pair in block_pair.into_inner() {
            match pair.as_rule() {
                Rule::pair => {
                    let (key, value) = parse_pair(pair)?;
                    match key.as_str() {
                        "query" => query = Some(value),
                        "engine" => engine = Some(value),
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
        format!("{}", hasher.finalize().to_hex())
    }

    async fn execute(&self, _name: &str, env: &Env) -> Result<Value> {
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

        let https = HttpsConnector::new();
        let cli = Client::builder().build::<_, hyper::Body>(https);

        let req = Request::builder()
            .method(Method::GET)
            .uri(format!(
                "https://serpapi.com/search?q={}&engine={}&api_key={}",
                encode(&query),
                self.engine,
                serp_api_key
            ))
            .body(Body::empty())?;

        let res = cli.request(req).await?;

        let status = res.status();

        let body = hyper::body::aggregate(res).await?;
        let mut b: Vec<u8> = vec![];
        body.reader().read_to_end(&mut b)?;
        let c: &[u8] = &b;

        match status {
            hyper::StatusCode::OK => {
                let raw: serde_json::Value = serde_json::from_slice(c)?;
                Ok(raw)
            }
            s => {
                let error: Error = serde_json::from_slice(c).unwrap_or(Error {
                    error: format!("Unexpected error with HTTP status {}", s),
                });
                Err(anyhow!("SerpAPIError: {}", error.error))
            }
        }
    }

    fn clone_box(&self) -> Box<dyn Block + Sync + Send> {
        Box::new(self.clone())
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
}
