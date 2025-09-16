use crate::providers::chat_messages::ChatMessage;
use crate::providers::embedder::{Embedder, EmbedderVector};
use crate::providers::llm::ChatFunction;
use crate::providers::llm::Tokens;
use crate::providers::llm::{LLMChatGeneration, LLMGeneration, LLMTokenUsage, LLM};
use crate::providers::provider::{ModelError, ModelErrorRetryOptions, Provider, ProviderID};
use crate::providers::tiktoken::tiktoken::{
    batch_tokenize_async, cl100k_base_singleton, o200k_base_singleton, p50k_base_singleton,
    r50k_base_singleton, CoreBPE,
};
use crate::providers::tiktoken::tiktoken::{decode_async, encode_async};
use crate::run::Credentials;
use crate::utils;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use eventsource_client as es;
use eventsource_client::Client as ESClient;
use futures::TryStreamExt;
use humantime::parse_duration;
use hyper::StatusCode;
use hyper::{body::Buf, Uri};
use itertools::izip;
use lazy_static::lazy_static;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use serde_json::json;
use serde_json::Value;
use std::collections::HashMap;
use std::io::prelude::*;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc::UnboundedSender;
use tokio::time::timeout;

use super::azure_openai::AzureOpenAIEmbedder;
use super::openai_compatible_helpers::{
    openai_compatible_chat_completion, OpenAIError, TransformSystemMessages,
};
use super::openai_responses_api_helpers::openai_responses_api_completion;

pub const REMAINING_TOKENS_MARGIN: u64 = 500_000;
#[derive(Debug)]
struct RateLimitDetails {
    pub remaining_tokens: u64,
    pub reset_tokens: u64, // Unix timestamp in milliseconds when the rate limit resets
}

lazy_static! {
    // Map of API key to rate limit details
    static ref RATE_LIMITS: RwLock<HashMap<String, RateLimitDetails>> = RwLock::new(HashMap::new());
}

static RESPONSES_API_ENABLED: bool = true;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct UsageDetails {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cached_tokens: Option<u64>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Usage {
    pub prompt_tokens: u64,
    pub completion_tokens: Option<u64>,
    pub total_tokens: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt_tokens_details: Option<UsageDetails>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Logprobs {
    pub tokens: Vec<String>,
    pub token_logprobs: Vec<Option<f32>>,
    pub top_logprobs: Option<Vec<Option<HashMap<String, f32>>>>,
    pub text_offset: Vec<usize>,
}

impl Logprobs {
    pub fn logprob(&self) -> f32 {
        let mut logp = 0_f32;
        self.token_logprobs.iter().for_each(|lgp| match lgp {
            None => (),
            Some(lgp) => logp += lgp,
        });
        logp
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Choice {
    pub text: String,
    pub index: usize,
    pub logprobs: Option<Logprobs>,
    pub finish_reason: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Completion {
    pub id: String,
    pub object: String,
    pub created: u64,
    pub model: String,
    pub choices: Vec<Choice>,
    pub usage: Option<Usage>,
}

///
/// Shared streamed/non-streamed chat/completion handling code (used by both OpenAILLM and
/// AzureOpenAILLM).
///

pub async fn streamed_completion(
    uri: Uri,
    api_key: String,
    organization_id: Option<String>,
    model_id: Option<String>,
    prompt: &str,
    max_tokens: Option<i32>,
    temperature: f32,
    n: usize,
    logprobs: Option<i32>,
    echo: bool,
    stop: &Vec<String>,
    frequency_penalty: f32,
    presence_penalty: f32,
    top_p: f32,
    user: Option<String>,
    event_sender: Option<UnboundedSender<Value>>,
) -> Result<(Completion, Option<String>)> {
    let url = uri.to_string();

    let mut builder = match es::ClientBuilder::for_url(url.as_str()) {
        Ok(b) => b,
        Err(_) => return Err(anyhow!("Error creating streamed client to OpenAI")),
    };
    builder = match builder.method(String::from("POST")).header(
        "Authorization",
        format!("Bearer {}", api_key.clone()).as_str(),
    ) {
        Ok(b) => b,
        Err(_) => return Err(anyhow!("Error creating streamed client to OpenAI")),
    };
    builder = match builder.header("Content-Type", "application/json") {
        Ok(b) => b,
        Err(_) => return Err(anyhow!("Error creating streamed client to OpenAI")),
    };
    builder = match builder.header("api-key", api_key.clone().as_str()) {
        Ok(b) => b,
        Err(_) => return Err(anyhow!("Error creating streamed client to OpenAI")),
    };

    if let Some(org_id) = organization_id {
        builder = builder
            .header("OpenAI-Organization", org_id.as_str())
            .map_err(|_| anyhow!("Error creating streamed client to OpenAI"))?;
    }

    let mut body = json!({
        "prompt": prompt,
        "temperature": temperature,
        "n": n,
        "logprobs": logprobs,
        "echo": echo,
        "frequency_penalty": frequency_penalty,
        "presence_penalty": presence_penalty,
        "top_p": top_p,
        "stream": true,
    });
    if user.is_some() {
        body["user"] = json!(user);
    }
    if model_id.is_some() {
        body["model"] = json!(model_id);
    }
    if let Some(mt) = max_tokens {
        body["max_tokens"] = mt.into();
    }
    if !stop.is_empty() {
        body["stop"] = json!(stop);
    }

    let client = builder
        .body(body.to_string())
        .reconnect(
            es::ReconnectOptions::reconnect(true)
                .retry_initial(false)
                .delay(Duration::from_secs(1))
                .backoff_factor(2)
                .delay_max(Duration::from_secs(8))
                .build(),
        )
        .build();

    let mut stream = client.stream();

    let mut completions: Vec<Completion> = Vec::new();
    let mut request_id: Option<String> = None;

    'stream: loop {
        match stream.try_next().await {
            Ok(e) => match e {
                Some(es::SSE::Connected((_, headers))) => {
                    request_id = match headers.get("x-request-id") {
                        Some(v) => Some(v.to_string()),
                        None => None,
                    };
                }
                Some(es::SSE::Comment(_)) => {
                    println!("UNEXPECTED COMMENT");
                }
                Some(es::SSE::Event(e)) => match e.data.as_str() {
                    "[DONE]" => {
                        break 'stream;
                    }
                    _ => {
                        let index = completions.len();

                        let completion: Completion = match serde_json::from_str(e.data.as_str()) {
                            Ok(c) => c,
                            Err(err) => {
                                let error: Result<OpenAIError, _> =
                                    serde_json::from_str(e.data.as_str());
                                match error {
                                    Ok(error) => {
                                        match error.retryable_streamed(StatusCode::OK) && index == 0
                                        {
                                            true => Err(ModelError {
                                                request_id: request_id.clone(),
                                                message: error.with_provider("OpenAI").message(),
                                                retryable: Some(ModelErrorRetryOptions {
                                                    sleep: Duration::from_millis(500),
                                                    factor: 2,
                                                    retries: 3,
                                                }),
                                            })?,
                                            false => Err(ModelError {
                                                request_id: request_id.clone(),
                                                message: error.with_provider("OpenAI").message(),
                                                retryable: None,
                                            })?,
                                        }
                                        break 'stream;
                                    }
                                    Err(_) => {
                                        Err(anyhow!(
                                            "OpenAIError: failed parsing streamed \
                                                 completion from OpenAI err={} data={}",
                                            err,
                                            e.data.as_str(),
                                        ))?;
                                        break 'stream;
                                    }
                                }
                            }
                        };

                        // UTF-8 length of the prompt (as used by the API for text_offset).
                        let prompt_len = prompt.chars().count();

                        // Only stream if choices is length 1 but should always be the case.
                        match event_sender.as_ref() {
                            Some(sender) => {
                                let mut text = completion.choices[0].text.clone();
                                let mut tokens = match completion.choices[0].logprobs.as_ref() {
                                    Some(l) => Some(l.tokens.clone()),
                                    None => None,
                                };
                                let mut logprobs = match completion.choices[0].logprobs.as_ref() {
                                    Some(l) => Some(l.token_logprobs.clone()),
                                    None => None,
                                };
                                let text_offset = match completion.choices[0].logprobs.as_ref() {
                                    Some(l) => Some(l.text_offset.clone()),
                                    None => None,
                                };
                                if index == 0 && text_offset.is_some() {
                                    let mut token_offset: usize = 0;
                                    for o in text_offset.as_ref().unwrap() {
                                        if *o < prompt_len {
                                            token_offset += 1;
                                        }
                                    }
                                    text = text.chars().skip(prompt_len).collect::<String>();
                                    tokens = match tokens {
                                        Some(t) => Some(t[token_offset..].to_vec()),
                                        None => None,
                                    };
                                    logprobs = match logprobs {
                                        Some(l) => Some(l[token_offset..].to_vec()),
                                        None => None,
                                    };
                                }

                                if text.len() > 0 {
                                    let _ = sender.send(json!({
                                        "type": "tokens",
                                        "content": {
                                            "text": text,
                                            "tokens": tokens,
                                            "logprobs": logprobs,
                                        },
                                    }));
                                }
                            }
                            None => (),
                        };
                        completions.push(completion);
                    }
                },
                None => {
                    println!("UNEXPECTED NONE");
                    break 'stream;
                }
            },
            Err(e) => {
                match e {
                    es::Error::UnexpectedResponse(r) => {
                        let status = StatusCode::from_u16(r.status())?;
                        let headers = r.headers()?;
                        let request_id = match headers.get("x-request-id") {
                            Some(v) => Some(v.to_string()),
                            None => None,
                        };
                        let b = r.body_bytes().await?;

                        let error: Result<OpenAIError, _> = serde_json::from_slice(&b);
                        match error {
                            Ok(error) => {
                                match error.retryable_streamed(status) {
                                    true => Err(ModelError {
                                        request_id,
                                        message: error.with_provider("OpenAI").message(),
                                        retryable: Some(ModelErrorRetryOptions {
                                            sleep: Duration::from_millis(500),
                                            factor: 2,
                                            retries: 3,
                                        }),
                                    }),
                                    false => Err(ModelError {
                                        request_id,
                                        message: error.with_provider("OpenAI").message(),
                                        retryable: None,
                                    }),
                                }
                            }?,
                            Err(_) => {
                                Err(anyhow!(
                                    "Error streaming tokens from OpenAI: status={} data={}",
                                    status,
                                    String::from_utf8_lossy(&b)
                                ))?;
                            }
                        }
                    }
                    _ => {
                        Err(anyhow!("Error streaming tokens from OpenAI: {:?}", e))?;
                    }
                }
                break 'stream;
            }
        }
    }

    let completion = {
        let mut c = match completions.len() {
            0 => Err(anyhow!("No completions received from OpenAI")),
            _ => Ok(completions[0].clone()),
        }?;
        completions.remove(0);
        for i in 0..completions.len() {
            let a = completions[i].clone();
            if a.choices.len() != c.choices.len() {
                Err(anyhow!(
                    "Inconsistent number of choices in streamed completions"
                ))?;
            }
            for j in 0..c.choices.len() {
                c.choices[j].finish_reason = a.choices.get(j).unwrap().finish_reason.clone();
                // OpenAI does the bytes merging for us <3.
                c.choices[j].text = format!("{}{}", c.choices[j].text, a.choices[j].text);

                match c.choices[j].logprobs.as_mut() {
                    Some(c_logprobs) => match a.choices[j].logprobs.as_ref() {
                        Some(a_logprobs) => {
                            c_logprobs.tokens.extend(a_logprobs.tokens.clone());
                            c_logprobs
                                .token_logprobs
                                .extend(a_logprobs.token_logprobs.clone());
                            c_logprobs
                                .text_offset
                                .extend(a_logprobs.text_offset.clone());
                            match c_logprobs.top_logprobs.as_mut() {
                                Some(c_top_logprobs) => match a_logprobs.top_logprobs.as_ref() {
                                    Some(a_top_logprobs) => {
                                        c_top_logprobs.extend(a_top_logprobs.clone());
                                    }
                                    None => (),
                                },
                                None => (),
                            }
                        }
                        None => (),
                    },
                    None => (),
                }
            }
        }
        c
    };

    Ok((completion, request_id))
}

pub async fn completion(
    uri: Uri,
    api_key: String,
    organization_id: Option<String>,
    model_id: Option<String>,
    prompt: &str,
    max_tokens: Option<i32>,
    temperature: f32,
    n: usize,
    logprobs: Option<i32>,
    echo: bool,
    stop: &Vec<String>,
    frequency_penalty: f32,
    presence_penalty: f32,
    top_p: f32,
    user: Option<String>,
) -> Result<(Completion, Option<String>)> {
    let mut body = json!({
        "prompt": prompt,
        "temperature": temperature,
        "n": n,
        "logprobs": logprobs,
        "frequency_penalty": frequency_penalty,
        "presence_penalty": presence_penalty,
        "top_p": top_p,
    });
    if user.is_some() {
        body["user"] = json!(user);
    }
    if model_id.is_some() {
        body["model"] = json!(model_id);
    }
    if let Some(mt) = max_tokens {
        body["max_tokens"] = mt.into();
    }
    if !stop.is_empty() {
        body["stop"] = json!(stop);
    }

    match model_id {
        None => (),
        Some(model_id) => {
            body["model"] = json!(model_id);
            // `gpt-3.5-turbo-instruct` does not support `echo`
            if !model_id.starts_with("gpt-3.5-turbo-instruct") {
                body["echo"] = json!(echo);
            }
        }
    };

    let mut req = reqwest::Client::new()
        .post(uri.to_string())
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_key.clone()))
        .header("api-key", api_key.clone());

    if let Some(organization_id) = organization_id {
        req = req.header("OpenAI-Organization", organization_id);
    }

    req = req.json(&body);

    let res = match timeout(Duration::new(180, 0), req.send()).await {
        Ok(Ok(res)) => res,
        Ok(Err(e)) => Err(e)?,
        Err(_) => Err(anyhow!("Timeout sending request to OpenAI after 180s"))?,
    };

    let res_headers = res.headers();
    let request_id = match res_headers.get("x-request-id") {
        Some(request_id) => Some(request_id.to_str()?.to_string()),
        None => None,
    };

    let body = match timeout(Duration::new(180, 0), res.bytes()).await {
        Ok(Ok(body)) => body,
        Ok(Err(e)) => Err(e)?,
        Err(_) => Err(anyhow!("Timeout reading response from OpenAI after 180s"))?,
    };

    let mut b: Vec<u8> = vec![];
    body.reader().read_to_end(&mut b)?;
    let c: &[u8] = &b;

    let completion: Completion = match serde_json::from_slice(c) {
        Ok(c) => Ok(c),
        Err(_) => {
            let error: OpenAIError = serde_json::from_slice(c)?;
            match error.retryable() {
                true => Err(ModelError {
                    request_id: request_id.clone(),
                    message: error.with_provider("OpenAI").message(),
                    retryable: Some(ModelErrorRetryOptions {
                        sleep: Duration::from_millis(500),
                        factor: 2,
                        retries: 3,
                    }),
                }),
                false => Err(ModelError {
                    request_id: request_id.clone(),
                    message: error.with_provider("OpenAI").message(),
                    retryable: Some(ModelErrorRetryOptions {
                        sleep: Duration::from_millis(500),
                        factor: 1,
                        retries: 1,
                    }),
                }),
            }
        }
    }?;

    Ok((completion, request_id))
}

///
/// Shared streamed/non-streamed chat/completion handling code (used by both OpenAILLM and
/// AzureOpenAILLM).
///

pub fn get_model_id_from_internal_embeddings_id(model_id: &str) -> &str {
    match model_id {
        "text-embedding-3-large-1536" => "text-embedding-3-large",
        _ => model_id,
    }
}

pub async fn embed(
    uri: Uri,
    api_key: String,
    organization_id: Option<String>,
    model_id: Option<String>,
    text: Vec<&str>,
    user: Option<String>,
    min_remaining_tokens: Option<u64>,
) -> Result<Embeddings> {
    if let Some(min_remaining_tokens) = min_remaining_tokens {
        let now = utils::now();

        // Clean up expired rate limits
        {
            let mut rate_limits = RATE_LIMITS.write();
            rate_limits.retain(|_, details| details.reset_tokens > now);
        }

        // Check rate limits
        {
            let rate_limits = RATE_LIMITS.read();
            if let Some(details) = rate_limits.get(&api_key) {
                if details.remaining_tokens < min_remaining_tokens {
                    Err(ModelError {
                        request_id: None,
                        message: "Rate limit exceeded".to_string(),
                        retryable: Some(ModelErrorRetryOptions {
                            sleep: Duration::from_millis(details.reset_tokens - now),
                            factor: 2,
                            retries: 3,
                        }),
                    })?;
                }
            }
        }
    }

    let mut body = json!({
        "input": text,
    });
    if user.is_some() {
        body["user"] = json!(user);
    }
    match model_id {
        Some(model_id) => {
            body["model"] = json!(get_model_id_from_internal_embeddings_id(&model_id));
            match model_id.as_str() {
                "text-embedding-3-large-1536" => {
                    body["dimensions"] = json!(1536);
                }
                _ => (),
            }
        }
        None => (),
    }

    let mut req = reqwest::Client::new()
        .post(uri.to_string())
        .header("Content-Type", "application/json")
        // This one is for `openai`.
        .header("Authorization", format!("Bearer {}", api_key.clone()))
        // This one is for `azure_openai`.
        .header("api-key", api_key.clone());

    if let Some(organization_id) = organization_id {
        req = req.header("OpenAI-Organization", organization_id);
    }

    let req = req.json(&body);

    let res = match timeout(Duration::new(60, 0), req.send()).await {
        Ok(Ok(res)) => res,
        Ok(Err(e)) => Err(e)?,
        Err(_) => Err(anyhow!("Timeout sending request to OpenAI after 60s"))?,
    };

    let res_headers = res.headers();
    let request_id = match res_headers.get("x-request-id") {
        Some(request_id) => Some(request_id.to_str()?.to_string()),
        None => None,
    };

    let remaining_tokens = match res_headers.get("x-ratelimit-remaining-tokens") {
        Some(remaining_tokens) => remaining_tokens.to_str()?.to_string().parse::<u64>().ok(),
        None => None,
    };

    let reset_tokens = match res_headers.get("x-ratelimit-reset-tokens") {
        Some(reset_tokens) => parse_duration(reset_tokens.to_str()?)
            .ok()
            .map(|d| d.as_millis()),
        None => None,
    };
    match (remaining_tokens, reset_tokens) {
        (Some(remaining_tokens), Some(reset_tokens)) => {
            let now = utils::now();
            if reset_tokens > 0 {
                RATE_LIMITS.write().insert(
                    api_key.clone(),
                    RateLimitDetails {
                        remaining_tokens,
                        reset_tokens: now + reset_tokens as u64,
                    },
                );
            }
        }
        _ => (),
    }

    let body = match timeout(Duration::new(60, 0), res.bytes()).await {
        Ok(Ok(body)) => body,
        Ok(Err(e)) => Err(e)?,
        Err(_) => Err(anyhow!("Timeout reading response from OpenAI after 60s"))?,
    };

    let mut b: Vec<u8> = vec![];
    body.reader().read_to_end(&mut b)?;
    let c: &[u8] = &b;

    let embeddings: Embeddings = match serde_json::from_slice(c) {
        Ok(c) => Ok(c),
        Err(_) => {
            let error: OpenAIError = serde_json::from_slice(c)?;
            match error.retryable() {
                true => Err(ModelError {
                    request_id,
                    message: error.with_provider("OpenAI").message(),
                    retryable: Some(ModelErrorRetryOptions {
                        sleep: Duration::from_millis(500),
                        factor: 2,
                        retries: 3,
                    }),
                }),
                false => Err(ModelError {
                    request_id,
                    message: error.with_provider("OpenAI").message(),
                    retryable: Some(ModelErrorRetryOptions {
                        sleep: Duration::from_millis(500),
                        factor: 1,
                        retries: 1,
                    }),
                }),
            }
        }
    }?;

    Ok(embeddings)
}

pub struct OpenAILLM {
    id: String,
    api_key: Option<String>,
}

impl OpenAILLM {
    pub fn new(id: String) -> Self {
        OpenAILLM { id, api_key: None }
    }

    #[inline]
    fn host(use_openai_eu_key: bool) -> &'static str {
        if use_openai_eu_key {
            "eu.api.openai.com"
        } else {
            "api.openai.com"
        }
    }

    fn uri(&self, use_openai_eu_key: bool) -> Result<Uri> {
        Ok(format!("https://{}/v1/completions", Self::host(use_openai_eu_key)).parse::<Uri>()?)
    }

    fn chat_uri(&self, use_openai_eu_key: bool) -> Result<Uri> {
        Ok(format!(
            "https://{}/v1/chat/completions",
            Self::host(use_openai_eu_key)
        )
        .parse::<Uri>()?)
    }

    fn responses_uri(&self, use_openai_eu_key: bool) -> Result<Uri> {
        Ok(format!("https://{}/v1/responses", Self::host(use_openai_eu_key)).parse::<Uri>()?)
    }

    fn tokenizer(&self) -> Arc<RwLock<CoreBPE>> {
        match self.id.as_str() {
            "code_davinci-002" | "code-cushman-001" => p50k_base_singleton(),
            "text-davinci-002" | "text-davinci-003" => p50k_base_singleton(),
            _ => {
                if self.id.starts_with("gpt-4o")
                    || self.id.starts_with("gpt-4.1")
                    || self.id.starts_with("o4")
                    || self.id.starts_with("o3")
                    || self.id.starts_with("o1")
                {
                    o200k_base_singleton()
                } else if self.id.starts_with("gpt-3.5-turbo") || self.id.starts_with("gpt-4") {
                    cl100k_base_singleton()
                } else {
                    r50k_base_singleton()
                }
            }
        }
    }

    pub fn openai_context_size(model_id: &str) -> usize {
        // Reference: https://platform.openai.com/docs/models

        if model_id.starts_with("o4-mini") || model_id.starts_with("o3") || model_id == "o1" {
            return 200000;
        }

        // gpt-3.5-*
        if model_id.starts_with("gpt-3.5") {
            if model_id.starts_with("gpt-3.5-turbo-instruct") {
                return 4096;
            }
            if model_id == "gpt-3.5-turbo-0613" {
                return 4096;
            }
            return 16385;
        }

        // gpt-4*
        if model_id.starts_with("gpt-4") {
            if model_id.starts_with("gpt-4.1") {
                return 1000000;
            }
            if model_id.starts_with("gpt-4-32k") {
                return 32768;
            }
            if model_id == "gpt-4" || model_id == "gpt-4-0613" {
                return 8192;
            }
            return 128000;
        }

        // By default return 128000
        return 128000;
    }
}

#[async_trait]
impl LLM for OpenAILLM {
    fn id(&self) -> String {
        self.id.clone()
    }

    async fn initialize(&mut self, credentials: Credentials) -> Result<()> {
        match credentials.get("OPENAI_API_KEY") {
            Some(api_key) => {
                self.api_key = Some(api_key.clone());
            }
            None => match tokio::task::spawn_blocking(|| std::env::var("OPENAI_API_KEY")).await? {
                Ok(key) => {
                    self.api_key = Some(key);
                }
                Err(_) => Err(anyhow!(
                    "Credentials or environment variable `OPENAI_API_KEY` is not set."
                ))?,
            },
        }
        Ok(())
    }

    fn context_size(&self) -> usize {
        Self::openai_context_size(self.id.as_str())
    }

    async fn encode(&self, text: &str) -> Result<Vec<usize>> {
        encode_async(self.tokenizer(), text).await
    }

    async fn decode(&self, tokens: Vec<usize>) -> Result<String> {
        decode_async(self.tokenizer(), tokens).await
    }

    async fn tokenize(&self, texts: Vec<String>) -> Result<Vec<Vec<(usize, String)>>> {
        batch_tokenize_async(self.tokenizer(), texts).await
    }

    async fn generate(
        &self,
        prompt: &str,
        mut max_tokens: Option<i32>,
        temperature: f32,
        n: usize,
        stop: &Vec<String>,
        frequency_penalty: Option<f32>,
        presence_penalty: Option<f32>,
        top_p: Option<f32>,
        top_logprobs: Option<i32>,
        extras: Option<Value>,
        event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<LLMGeneration> {
        assert!(self.api_key.is_some());
        assert!(n > 0);

        // println!("STOP: {:?}", stop);

        if let Some(m) = max_tokens {
            if m == -1 {
                let tokens = self.encode(prompt).await?;
                max_tokens = Some((self.context_size() - tokens.len()) as i32);
                // println!("Using max_tokens = {}", max_tokens.unwrap());
            }
        }

        let model_is_o1 = self.id.as_str().starts_with("o1");
        let api_key = match self.api_key.clone() {
            Some(key) => key,
            None => Err(anyhow!("OPENAI_API_KEY is not set."))?,
        };

        let use_openai_eu_key = match &extras {
            None => false,
            Some(v) => match v.get("use_openai_eu_key") {
                Some(Value::Bool(b)) => *b,
                _ => false,
            },
        };

        let (c, request_id) = if event_sender.is_some() {
            if n > 1 {
                return Err(anyhow!(
                    "Generating multiple variations in streaming mode is not supported."
                ))?;
            }
            streamed_completion(
                self.uri(use_openai_eu_key)?,
                api_key.clone(),
                match &extras {
                    Some(ex) => match ex.get("openai_organization_id") {
                        Some(Value::String(o)) => Some(o.to_string().clone()),
                        _ => None,
                    },
                    None => None,
                },
                Some(self.id.clone()),
                prompt,
                max_tokens,
                // [o1] O1 models do not support custom temperature.
                if !model_is_o1 { temperature } else { 1.0 },
                n,
                match top_logprobs {
                    Some(l) => Some(l),
                    None => Some(0),
                },
                true,
                stop,
                match frequency_penalty {
                    Some(f) => f,
                    None => 0.0,
                },
                match presence_penalty {
                    Some(p) => p,
                    None => 0.0,
                },
                match top_p {
                    Some(t) => t,
                    None => 1.0,
                },
                match &extras {
                    Some(e) => match e.get("openai_user") {
                        Some(Value::String(u)) => Some(u.to_string()),
                        _ => None,
                    },
                    None => None,
                },
                event_sender,
            )
            .await?
        } else {
            completion(
                self.uri(use_openai_eu_key)?,
                api_key.clone(),
                match &extras {
                    Some(e) => match e.get("openai_organization_id") {
                        Some(Value::String(o)) => Some(o.to_string()),
                        _ => None,
                    },
                    None => None,
                },
                Some(self.id.clone()),
                prompt,
                max_tokens,
                // [o1] O1 models do not support custom temperature.
                if !model_is_o1 { temperature } else { 1.0 },
                n,
                match top_logprobs {
                    Some(l) => Some(l),
                    None => Some(0),
                },
                true,
                stop,
                match frequency_penalty {
                    Some(f) => f,
                    None => 0.0,
                },
                match presence_penalty {
                    Some(p) => p,
                    None => 0.0,
                },
                match top_p {
                    Some(t) => t,
                    None => 1.0,
                },
                match &extras {
                    Some(e) => match e.get("openai_user") {
                        Some(Value::String(u)) => Some(u.to_string()),
                        _ => None,
                    },
                    None => None,
                },
            )
            .await?
        };

        // println!("COMPLETION: {:?}", c);

        assert!(c.choices.len() > 0);
        assert!(c.choices[0].logprobs.is_some());

        let logp = c.choices[0].logprobs.as_ref().unwrap();
        assert!(logp.tokens.len() == logp.token_logprobs.len());
        assert!(logp.tokens.len() == logp.text_offset.len());

        // UTF-8 length of the prompt (as used by the API for text_offset).
        let prompt_len = prompt.chars().count();

        let mut token_offset: usize = 0;

        let mut prompt_tokens = Tokens {
            text: String::from(prompt),
            tokens: Some(vec![]),
            logprobs: Some(vec![]),
            top_logprobs: match logp.top_logprobs {
                Some(_) => Some(vec![]),
                None => None,
            },
        };
        for (o, t, l) in izip!(
            logp.text_offset.clone(),
            logp.tokens.clone(),
            logp.token_logprobs.clone()
        ) {
            if o < prompt_len {
                prompt_tokens.tokens.as_mut().unwrap().push(t.clone());
                prompt_tokens.logprobs.as_mut().unwrap().push(l);
                token_offset += 1;
            }
        }
        if logp.top_logprobs.is_some() {
            for (o, t) in izip!(
                logp.text_offset.clone(),
                logp.top_logprobs.as_ref().unwrap().clone()
            ) {
                if o < prompt_len {
                    prompt_tokens.top_logprobs.as_mut().unwrap().push(t);
                }
            }
        }

        Ok(LLMGeneration {
            created: utils::now(),
            provider: ProviderID::OpenAI.to_string(),
            model: self.id.clone(),
            completions: c
                .choices
                .iter()
                .map(|c| {
                    let logp = c.logprobs.as_ref().unwrap();
                    assert!(logp.tokens.len() == logp.token_logprobs.len());
                    assert!(logp.tokens.len() == logp.text_offset.len());
                    assert!(
                        !logp.top_logprobs.is_some()
                            || logp.tokens.len() == logp.top_logprobs.as_ref().unwrap().len()
                    );
                    assert!(logp.tokens.len() >= token_offset);

                    Tokens {
                        text: c.text.chars().skip(prompt_len).collect::<String>(),
                        tokens: Some(logp.tokens[token_offset..].to_vec()),
                        logprobs: Some(logp.token_logprobs[token_offset..].to_vec()),
                        top_logprobs: match logp.top_logprobs {
                            Some(ref t) => Some(t[token_offset..].to_vec()),
                            None => None,
                        },
                    }
                })
                .collect::<Vec<_>>(),
            prompt: prompt_tokens,
            usage: c.usage.map(|usage| LLMTokenUsage {
                prompt_tokens: usage.prompt_tokens,
                completion_tokens: usage.completion_tokens.unwrap_or(0),
                cached_tokens: usage
                    .prompt_tokens_details
                    .and_then(|details| details.cached_tokens),
                reasoning_tokens: None,
            }),
            provider_request_id: request_id,
        })
    }

    async fn chat(
        &self,
        messages: &Vec<ChatMessage>,
        functions: &Vec<ChatFunction>,
        function_call: Option<String>,
        temperature: f32,
        top_p: Option<f32>,
        n: usize,
        stop: &Vec<String>,
        max_tokens: Option<i32>,
        presence_penalty: Option<f32>,
        frequency_penalty: Option<f32>,
        logprobs: Option<bool>,
        top_logprobs: Option<i32>,
        extras: Option<Value>,
        event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<LLMChatGeneration> {
        let is_reasoning_model = self.id.as_str().starts_with("o3")
            || self.id.as_str().starts_with("o1")
            || self.id.as_str().starts_with("o4")
            || self.id.as_str().starts_with("gpt-5");

        let api_key = match self.api_key.clone() {
            Some(key) => key,
            None => Err(anyhow!("OPENAI_API_KEY is not set."))?,
        };

        let transform_system_messages = if is_reasoning_model {
            TransformSystemMessages::ReplaceWithDeveloper
        } else {
            TransformSystemMessages::Keep
        };

        let temperature = if is_reasoning_model { 1.0 } else { temperature };

        let provider_name = "OpenAI".to_string();

        let is_auto_function_call = match &function_call {
            Some(f) => f.to_lowercase() == "auto",
            None => true,
        };

        let use_openai_eu_key = match &extras {
            None => false,
            Some(v) => match v.get("use_openai_eu_key") {
                Some(Value::Bool(b)) => *b,
                _ => false,
            },
        };

        // Use response API only when function_call is not forced and when n == 1.
        if RESPONSES_API_ENABLED && is_auto_function_call && n == 1 && is_reasoning_model {
            openai_responses_api_completion(
                self.responses_uri(use_openai_eu_key)?,
                self.id.clone(),
                api_key,
                &messages,
                functions,
                temperature,
                max_tokens,
                extras,
                event_sender,
                transform_system_messages,
                provider_name,
            )
            .await
        } else {
            openai_compatible_chat_completion(
                self.chat_uri(use_openai_eu_key)?,
                self.id.clone(),
                api_key,
                &messages,
                functions,
                function_call,
                temperature,
                top_p,
                n,
                stop,
                max_tokens,
                presence_penalty,
                frequency_penalty,
                logprobs,
                top_logprobs,
                extras,
                event_sender,
                false,
                transform_system_messages,
                provider_name,
                false, // Don't squash text contents.
            )
            .await
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Embedding {
    pub embedding: Vec<f64>,
    pub index: u64,
    pub object: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Embeddings {
    pub model: String,
    pub usage: Usage,
    pub object: String,
    pub data: Vec<Embedding>,
}

pub struct OpenAIEmbedder {
    id: String,
    api_key: Option<String>,
}

impl OpenAIEmbedder {
    pub fn new(id: String) -> Self {
        OpenAIEmbedder { id, api_key: None }
    }

    fn uri(&self) -> Result<Uri> {
        Ok(format!("https://api.openai.com/v1/embeddings",).parse::<Uri>()?)
    }

    fn tokenizer(&self) -> Arc<RwLock<CoreBPE>> {
        match self.id.as_str() {
            "text-embedding-3-small" => cl100k_base_singleton(),
            "text-embedding-3-large-1536" => cl100k_base_singleton(),
            _ => r50k_base_singleton(),
        }
    }
}

#[async_trait]
impl Embedder for OpenAIEmbedder {
    fn id(&self) -> String {
        self.id.clone()
    }

    async fn initialize(&mut self, credentials: Credentials) -> Result<()> {
        if !(vec!["text-embedding-3-small", "text-embedding-3-large-1536"]
            .contains(&self.id.as_str()))
        {
            return Err(anyhow!(
                "Unexpected embedder model id (`{}`) for provider `openai`",
                self.id
            ));
        }

        // Give priority to `CORE_DATA_SOURCES_OPENAI_API_KEY` env variable
        match std::env::var("CORE_DATA_SOURCES_OPENAI_API_KEY") {
            Ok(key) => {
                self.api_key = Some(key);
            }
            Err(_) => match credentials.get("OPENAI_API_KEY") {
                Some(api_key) => {
                    self.api_key = Some(api_key.clone());
                }
                None => match std::env::var("OPENAI_API_KEY") {
                    Ok(key) => {
                        self.api_key = Some(key);
                    }
                    Err(_) => Err(anyhow!(
                        "Credentials or environment variable `OPENAI_API_KEY` is not set."
                    ))?,
                },
            },
        }
        Ok(())
    }

    fn context_size(&self) -> usize {
        match self.id.as_str() {
            "text-embedding-3-small" => 8191,
            "text-embedding-3-large-1536" => 8191,
            _ => unimplemented!(),
        }
    }

    fn embedding_size(&self) -> usize {
        match self.id.as_str() {
            "text-embedding-3-small" => 1536,
            "text-embedding-3-large-1536" => 1536,
            _ => unimplemented!(),
        }
    }

    async fn encode(&self, text: &str) -> Result<Vec<usize>> {
        encode_async(self.tokenizer(), text).await
    }

    async fn decode(&self, tokens: Vec<usize>) -> Result<String> {
        decode_async(self.tokenizer(), tokens).await
    }

    async fn tokenize(&self, texts: Vec<String>) -> Result<Vec<Vec<(usize, String)>>> {
        batch_tokenize_async(self.tokenizer(), texts).await
    }

    async fn embed(&self, text: Vec<&str>, extras: Option<Value>) -> Result<Vec<EmbedderVector>> {
        let api_key = match self.api_key.clone() {
            Some(key) => key,
            None => Err(anyhow!("OPENAI_API_KEY is not set."))?,
        };

        let e = embed(
            self.uri()?,
            api_key,
            match &extras {
                Some(e) => match e.get("openai_organization_id") {
                    Some(Value::String(o)) => Some(o.to_string()),
                    _ => None,
                },
                None => None,
            },
            Some(self.id.clone()),
            text,
            match &extras {
                Some(e) => match e.get("openai_user") {
                    Some(Value::String(u)) => Some(u.to_string()),
                    _ => None,
                },
                None => None,
            },
            match &extras {
                Some(e) => match e.get("enforce_rate_limit_margin") {
                    Some(Value::Bool(true)) => Some(REMAINING_TOKENS_MARGIN),
                    _ => None,
                },
                None => None,
            },
        )
        .await?;

        assert!(e.data.len() > 0);
        // println!("EMBEDDING: {:?}", e);

        Ok(e.data
            .into_iter()
            .map(|v| EmbedderVector {
                created: utils::now(),
                provider: ProviderID::OpenAI.to_string(),
                model: self.id.clone(),
                vector: v.embedding.clone(),
            })
            .collect::<Vec<_>>())
    }
}

pub struct OpenAIProvider {
    fallback_embeddings_to_azure: bool,
}

impl OpenAIProvider {
    pub fn new() -> Self {
        let fallback_embeddings_to_azure = std::env::var("OPENAI_EMBEDDINGS_AZURE_FALLBACK")
            .map(|value| value.to_lowercase() == "true")
            .unwrap_or(false);

        OpenAIProvider {
            fallback_embeddings_to_azure,
        }
    }
}

#[async_trait]
impl Provider for OpenAIProvider {
    fn id(&self) -> ProviderID {
        ProviderID::OpenAI
    }

    fn setup(&self) -> Result<()> {
        utils::info("Setting up OpenAI:");
        utils::info("");
        utils::info(
            "To use OpenAI's models, you must set the environment variable `OPENAI_API_KEY`.",
        );
        utils::info("Your API key can be found at `https://platform.openai.com/account/api-keys`.");
        utils::info("");
        utils::info("Once ready you can check your setup with `dust provider test openai`");

        Ok(())
    }

    async fn test(&self) -> Result<()> {
        if !utils::confirm(
            "You are about to make a request for 1 token to `text-ada-001` on the OpenAI API.",
        )? {
            Err(anyhow!("User aborted OpenAI test."))?;
        }

        let mut llm = self.llm(String::from("text-ada-001"));
        llm.initialize(Credentials::new()).await?;

        let _ = llm
            .generate(
                "Hello 😊",
                Some(1),
                0.7,
                1,
                &vec![],
                None,
                None,
                None,
                None,
                None,
                None,
            )
            .await?;

        utils::done("Test successfully completed! OpenAI is ready to use.");

        Ok(())
    }

    fn llm(&self, id: String) -> Box<dyn LLM + Sync + Send> {
        Box::new(OpenAILLM::new(id))
    }

    fn embedder(&self, id: String) -> Box<dyn Embedder + Sync + Send> {
        if self.fallback_embeddings_to_azure {
            Box::new(AzureOpenAIEmbedder::new(id))
        } else {
            Box::new(OpenAIEmbedder::new(id))
        }
    }
}
