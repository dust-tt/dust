use crate::blocks::block::{parse_pair, Block, BlockType, Env};
use crate::Rule;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use hyper::{body::Buf, Body, Client, Method, Request};
use hyper_tls::HttpsConnector;
use pest::iterators::Pair;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::prelude::*;
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Error {
    pub error: String,
}

#[derive(Clone)]
pub struct Replit {
    replit_user: String,
    repl: String,
    path: String,
}

impl Replit {
    pub fn parse(block_pair: Pair<Rule>) -> Result<Self> {
        let mut replit_user: Option<String> = None;
        let mut repl: Option<String> = None;
        let mut path: Option<String> = None;

        for pair in block_pair.into_inner() {
            match pair.as_rule() {
                Rule::pair => {
                    let (key, value) = parse_pair(pair)?;
                    match key.as_str() {
                        "replit_user" => replit_user = Some(value),
                        "repl" => repl = Some(value),
                        "path" => path = Some(value),
                        _ => Err(anyhow!("Unexpected `{}` in `replit` block", key))?,
                    }
                }
                Rule::expected => {
                    Err(anyhow!("`expected` is not yet supported in `replit` block"))?
                }
                _ => unreachable!(),
            }
        }

        if !replit_user.is_some() {
            Err(anyhow!("Missing required `replit_user` in `replit` block"))?;
        }

        if !repl.is_some() {
            Err(anyhow!("Missing required `repl` in `replit` block"))?;
        }

        Ok(Replit {
            replit_user: replit_user.unwrap(),
            repl: repl.unwrap(),
            path: match path {
                Some(path) => path,
                None => "/".to_string(),
            },
        })
    }
}

#[derive(Serialize, Deserialize)]
struct ReplitResult {
    result: Option<serde_json::Value>,
    error: Option<String>,
}


#[async_trait]
impl Block for Replit {
    fn block_type(&self) -> BlockType {
        BlockType::Replit
    }

    fn inner_hash(&self) -> String {
        let mut hasher = blake3::Hasher::new();
        hasher.update("replit".as_bytes());
        hasher.update(self.replit_user.as_bytes());
        hasher.update(self.repl.as_bytes());
        hasher.update(self.path.as_bytes());
        format!("{}", hasher.finalize().to_hex())
    }

    async fn execute(&self, _name: &str, env: &Env) -> Result<Value> {
        let https = HttpsConnector::new();
        let cli = Client::builder().build::<_, hyper::Body>(https);

        let path_with_leading_slash =  match self.path.chars().nth(0) {
            None => "/".to_string(),
            Some('/') => self.path.clone(),
            _ => "/".to_owned() + &self.path,
        };

        let req = Request::builder()
            .method(Method::POST)
            .uri(format!(
                "https://{}.{}.repl.co{}",
                self.repl.replace(" ", "-").to_lowercase(),
                self.replit_user,
                path_with_leading_slash
            ))
            .header("Content-Type", "application/json")
            .body(Body::from(
                json!(HashMap::from([
                    ("version", json!("1.0.0")),
                    ("env", json!(env)),
                ]))
                .to_string(),
            ))?;

        let res = cli.request(req).await?;

        let status = res.status();

        let body = hyper::body::aggregate(res).await?;
        let mut b: Vec<u8> = vec![];
        body.reader().read_to_end(&mut b)?;
        let c: &[u8] = &b;

        match status {
            hyper::StatusCode::OK => {
                let raw: ReplitResult = serde_json::from_slice(c)?;
                match raw.error {
                    Some(msg) => Err(anyhow!(msg)),
                    None => match raw.result {
                        None => Err(anyhow!("The Repl returned neither a result, nor an error.")),
                        Some(result) => Ok(result),
                    }
                }
            }
            s => {
                let raw: Result<ReplitResult, serde_json::Error> = serde_json::from_slice(c);
                match raw {
                    Ok(api_result) => match api_result.error {
                        None => Err(anyhow!("Unexpected error with HTTP status {} and no error message", s)),
                        Some(err) => Err(anyhow!(err)),
                    },
                    Err(_) => {
                        Err(anyhow!("Unexpected error with HTTP status {}", s))
                    }
                }
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
