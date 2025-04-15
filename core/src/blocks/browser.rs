use crate::blocks::block::{
    parse_pair, replace_variables_in_string, Block, BlockResult, BlockType, Env,
};
use crate::http::request::HttpRequest;
use crate::Rule;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use pest::iterators::Pair;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::sync::mpsc::UnboundedSender;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Error {
    pub error: String,
}

#[derive(Clone)]
pub struct Browser {
    url: String,
    selector: String,
    timeout: usize,
    wait_until: Option<String>,
    wait_for: Option<String>,
}

impl Browser {
    pub fn parse(block_pair: Pair<Rule>) -> Result<Self> {
        let mut url: Option<String> = None;
        let mut selector: Option<String> = None;
        let mut timeout: Option<usize> = None;
        let mut wait_until: Option<String> = None;
        let mut wait_for: Option<String> = None;

        for pair in block_pair.into_inner() {
            match pair.as_rule() {
                Rule::pair => {
                    let (key, value) = parse_pair(pair)?;
                    match key.as_str() {
                        "url" => url = Some(value),
                        "selector" => selector = Some(value),
                        "timeout" => match value.parse::<usize>() {
                            Ok(t) => timeout = Some(t),
                            Err(_) => Err(anyhow!(
                                "Invalid `timeout` in `browser` block, expecting unsigned integer"
                            ))?,
                        },
                        "wait_until" => match value.as_str() {
                            "load" | "domcontentloaded" | "networkidle0" | "networkidle2" => {
                                wait_until = Some(value)
                            }
                            _ => Err(anyhow!(
                                "Invalid `wait_until` in `browser` block, expecting one of \
                                  `load`, `domcontentloaded`, `networkidle0`, `networkidle2`"
                            ))?,
                        },
                        "wait_for" => wait_for = Some(value),
                        _ => Err(anyhow!("Unexpected `{}` in `browser` block", key))?,
                    }
                }
                Rule::expected => Err(anyhow!(
                    "`expected` is not yet supported in `browser` block"
                ))?,
                _ => unreachable!(),
            }
        }

        if !url.is_some() {
            Err(anyhow!("Missing required `url` in `browser` block"))?;
        }
        if !selector.is_some() {
            Err(anyhow!("Missing required `selector` in `browser` block"))?;
        }

        if !timeout.is_some() {
            timeout = Some(16000);
        }

        Ok(Browser {
            url: url.unwrap(),
            selector: selector.unwrap(),
            timeout: timeout.unwrap(),
            wait_until,
            wait_for,
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
        hasher.update(self.timeout.to_string().as_bytes());
        if let Some(wait_until) = &self.wait_until {
            hasher.update(wait_until.as_bytes());
        }
        if let Some(wait_for) = &self.wait_for {
            hasher.update(wait_for.as_bytes());
        }
        format!("{}", hasher.finalize().to_hex())
    }

    async fn execute(
        &self,
        name: &str,
        env: &Env,
        _event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<BlockResult> {
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

        let error_as_output = match config {
            Some(v) => match v.get("error_as_output") {
                Some(v) => match v {
                    Value::Bool(b) => *b,
                    _ => false,
                },
                None => false,
            },
            None => false,
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

        let query = r#"
mutation ScrapeWebsite($url: String!, $timeout: Float, $selector: String = "body") {
    goto(url: $url, waitUntil: firstContentfulPaint, timeout: $timeout) {
        status
        time
        url
        status
    }
    body: html(selector: $selector) {
        html
    }
    text: text(selector: $selector) {
        text
    }
}
"#;

        let mut body_json = json!({
            "query": query,
            "variables": {
                "url": url,
                "selector": self.selector,
                "timeout": self.timeout
            }
        });

        // WARN: not sure what to do with it. There is no waitFor in the current /scrape route, could be
        // waitForTimeout or waitForNavigation (or else?)
        if let Some(wait_for) = &self.wait_for {
            match wait_for.parse::<usize>() {
                Ok(t) => {
                    body_json["variables"]["waitFor"] = Value::Number(serde_json::Number::from(t));
                }
                _ => {
                    body_json["variables"]["waitFor"] = Value::String(wait_for.clone());
                }
            }
        }

        if let Some(wait_until) = &self.wait_until {
            body_json["variables"]["waitUntil"] = Value::String(wait_until.clone());
        }

        // println!(
        //     "Browser running with: {} error_as_output={} config={:?}",
        //     body_json.to_string(),
        //     error_as_output,
        //     config,
        // );

        let request = HttpRequest::new(
            "POST",
            format!(
                "https://production-sfo.browserless.io/chromium/bql?token={}",
                browserless_api_key,
            )
            .as_str(),
            json!({
                "Cache-Control": "no-cache",
                "Content-Type": "application/json",
            }),
            Value::String(body_json.to_string()),
        )?;

        let response = request
            .execute_with_cache(env.project.clone(), env.store.clone(), use_cache)
            .await?;

        match response.status {
            200 => {
                let result = json!({
                    "data": [
                        {
                            "selector": self.selector,
                            "results": [
                                {
                                    "html": response.body["data"]["body"]["html"],
                                    "text": response.body["data"]["text"]["text"],
                                },
                            ],
                        },
                    ],
                    "response": {
                        "code": response.body["data"]["goto"]["status"],
                        "status": response.body["data"]["goto"]["status"],
                        "url": response.body["data"]["goto"]["url"],
                    }
                });
                Ok(BlockResult {
                    value: result,
                    meta: None,
                })
            }
            s => match error_as_output {
                false => Err(anyhow!(
                    "BrowserlessAPIError: Error with HTTP status {} and body {}",
                    s,
                    response.body.to_string(),
                )),
                true => {
                    let result = json!({
                        "error": {
                            "status_code": s,
                            "body": response.body,
                        },
                    });
                    Ok(BlockResult {
                        value: result,
                        meta: None,
                    })
                }
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
