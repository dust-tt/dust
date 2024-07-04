use crate::blocks::block::{
    parse_pair, replace_secrets_in_string, replace_variables_in_string, Block, BlockResult,
    BlockType, Env,
};
use crate::deno::js_executor::JSExecutor;
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
pub struct Curl {
    method: String,
    url: String,
    headers_code: String,
    body_code: String,
}

impl Curl {
    pub fn parse(block_pair: Pair<Rule>) -> Result<Self> {
        let mut method: Option<String> = None;
        let mut url: Option<String> = None;
        let mut headers_code: Option<String> = None;
        let mut body_code: Option<String> = None;

        for pair in block_pair.into_inner() {
            match pair.as_rule() {
                Rule::pair => {
                    let (key, value) = parse_pair(pair)?;
                    match key.as_str() {
                        "method" => method = Some(value),
                        "url" => url = Some(value),
                        "headers_code" => headers_code = Some(value),
                        "body_code" => body_code = Some(value),
                        _ => Err(anyhow!("Unexpected `{}` in `curl` block", key))?,
                    }
                }
                Rule::expected => Err(anyhow!("`expected` is not yet supported in `curl` block"))?,
                _ => unreachable!(),
            }
        }

        if !method.is_some() {
            Err(anyhow!("Missing required `method` in `curl` block"))?;
        }
        if !url.is_some() {
            Err(anyhow!("Missing required `url` in `curl` block"))?;
        }
        if !headers_code.is_some() {
            Err(anyhow!("Missing required `headers_code` in `curl` block"))?;
        }
        if !body_code.is_some() {
            Err(anyhow!("Missing required `body_code` in `curl` block"))?;
        }

        Ok(Curl {
            method: method.unwrap(),
            url: url.unwrap(),
            headers_code: headers_code.unwrap(),
            body_code: body_code.unwrap(),
        })
    }
}

#[derive(Serialize, Deserialize)]
struct CurlResult {
    status: u16,
    body: Option<serde_json::Value>,
    error: Option<String>,
}

#[async_trait]
impl Block for Curl {
    fn block_type(&self) -> BlockType {
        BlockType::Curl
    }

    fn inner_hash(&self) -> String {
        let mut hasher = blake3::Hasher::new();
        hasher.update("curl".as_bytes());
        hasher.update(self.method.as_bytes());
        hasher.update(self.url.as_bytes());
        hasher.update(self.headers_code.as_bytes());
        hasher.update(self.body_code.as_bytes());
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

        let e = env.clone_with_unredacted_secrets();
        let headers_code = self.headers_code.clone();
        let (headers_value, headers_logs): (Value, Vec<Value>) = JSExecutor::client()?
            .exec(
                &headers_code,
                "_fun",
                &e,
                std::time::Duration::from_secs(10),
            )
            .await
            .map_err(|e| anyhow!("Error in `headers_code`: {}", e))?;

        let e = env.clone_with_unredacted_secrets();
        let body_code = self.body_code.clone();
        let (body_value, body_logs): (Value, Vec<Value>) = JSExecutor::client()?
            .exec(&body_code, "_fun", &e, std::time::Duration::from_secs(10))
            .await
            .map_err(|e| anyhow!("Error in `body_code`: {}", e))?;

        let mut url = replace_variables_in_string(&self.url, "url", env)?;
        url = replace_secrets_in_string(&url, "url", env)?;

        if url.contains("https://dust.tt") || url.contains("https://www.dust.tt") {
            Err(anyhow!(
                "Curl block cannot be used for reentrant calls to Dust"
            ))?;
        }

        let request = HttpRequest::new(
            self.method.as_str(),
            url.as_str(),
            headers_value,
            body_value,
        )?;

        let response = request
            .execute_with_cache(env.project.clone(), env.store.clone(), use_cache)
            .await?;

        let mut all_logs = headers_logs;
        all_logs.extend(body_logs);

        Ok(BlockResult {
            value: json!(response),
            meta: Some(json!({ "logs": all_logs })),
        })
    }

    fn clone_box(&self) -> Box<dyn Block + Sync + Send> {
        Box::new(self.clone())
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
}
