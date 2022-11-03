use crate::blocks::block::{parse_pair, replace_variables_in_string, Block, BlockType, Env};
use crate::http::request::HttpRequest;
use crate::Rule;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use pest::iterators::Pair;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Error {
    pub error: String,
}

#[derive(Clone)]
pub struct Browser {
    url: String,
    selector: String,
}

impl Browser {
    pub fn parse(block_pair: Pair<Rule>) -> Result<Self> {
        let mut url: Option<String> = None;
        let mut selector: Option<String> = None;

        for pair in block_pair.into_inner() {
            match pair.as_rule() {
                Rule::pair => {
                    let (key, value) = parse_pair(pair)?;
                    match key.as_str() {
                        "url" => url = Some(value),
                        "selector" => selector = Some(value),
                        _ => Err(anyhow!("Unexpected `{}` in `browser` block", key))?,
                    }
                }
                Rule::expected => {
                    Err(anyhow!("`expected` is not yet supported in `browser` block"))?
                }
                _ => unreachable!(),
            }
        }

        if !url.is_some() {
            Err(anyhow!("Missing required `url` in `browser` block"))?;
        }

        Ok(Browser {
            url: url.unwrap(),
            selector: match selector {
                Some(selector) => selector,
                None => "body".to_string(),
            },
        })
    }
}


#[async_trait]
impl Block for Browser {
    fn block_type(&self) -> BlockType {
        BlockType::Browser
    }

    fn inner_hash(&self) -> String {
        let mut hasher = blake3::Hasher::new();
        hasher.update("browser".as_bytes());
        hasher.update(self.url.as_bytes());
        hasher.update(self.selector.as_bytes());
        format!("{}", hasher.finalize().to_hex())
    }

    async fn execute(&self, name: &str, env: &Env) -> Result<Value> {
        let config = env.config.config_for_block(name);

        let use_cache = match config {
            Some(v) => match v.get("use_cache") {
                Some(v) => match v {
                    Value::Bool(b) => *b,
                    _ => true,
                },
                None => true,
            },
            _ => true,
        };

        let url = replace_variables_in_string(&self.url, "url", env)?;

        let browserless_api_key = match env.credentials.get("BROWSERLESS_API_KEY") {
            Some(api_key) => Ok(api_key.clone()),
            None => match std::env::var("BROWSERLESS_API_KEY") {
                Ok(key) => Ok(key),
                Err(_) => Err(anyhow!(
                    "Credentials or environment variable `BROWSERLESS_API_KEY` is not set."
                )),
            },
        }?;

        let request = HttpRequest::new(
            "POST",
            format!(
                "https://chrome.browserless.io/scrape?token={}",
                browserless_api_key,
            )
            .as_str(),
            json!({
                "Cache-Control": "no-cache",
                "Content-Type": "application/json",
            }),
            json!({
                "url": url,
                "elements": [ { "selector": self.selector } ],
            }),
        )?;


        let response = request
            .execute_with_cache(env.project.clone(), env.store.clone(), use_cache)
            .await?;

        match response.status {
            200 => {
                let result = json!({
                    "data": response.body["data"],
                    "response": {
                        "code": response.headers["x-response-code"],
                        "status": response.headers["x-response-status"],
                        "url": response.headers["x-response-url"],
                        "ip": response.headers["x-response-ip"],
                        "port": response.headers["x-response-port"],
                    }
                });
                Ok(result)
            },
            s => Err(anyhow!(
                "Browserless API: Unexpected error with HTTP status {} and response body {}",
                s,
                response.body,
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
