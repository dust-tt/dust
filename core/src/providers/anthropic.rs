use crate::providers::embedder::{Embedder, EmbedderVector};
use crate::providers::llm::{
    ChatMessage, ChatMessageRole, LLMChatGeneration, LLMGeneration, Tokens, LLM,
};
use crate::providers::provider::{ModelError, Provider, ProviderID};
use crate::providers::tiktoken::tiktoken::anthropic_base_singleton;
use crate::run::Credentials;
use crate::utils;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use eventsource_client as es;
use eventsource_client::Client as ESClient;
use futures::TryStreamExt;
use hyper::{body::Buf, Uri};
use hyper_tls::HttpsConnector;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fmt::{self, Display};
use std::io::prelude::*;
use std::time::Duration;
use tokio::sync::mpsc::UnboundedSender;

use super::llm::ChatFunction;
use super::tiktoken::tiktoken::{decode_async, encode_async, tokenize_async};

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum StopReason {
    StopSequence,
    MaxTokens,
    EndTurn,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
#[serde(rename_all = "lowercase")]
pub enum AnthropicChatMessageRole {
    Assistant,
    User,
}

impl From<AnthropicChatMessageRole> for ChatMessageRole {
    fn from(value: AnthropicChatMessageRole) -> Self {
        match value {
            AnthropicChatMessageRole::Assistant => ChatMessageRole::Assistant,
            AnthropicChatMessageRole::User => ChatMessageRole::User,
        }
    }
}

impl TryFrom<&ChatMessageRole> for AnthropicChatMessageRole {
    type Error = anyhow::Error;

    fn try_from(value: &ChatMessageRole) -> Result<Self, Self::Error> {
        match value {
            ChatMessageRole::Assistant => Ok(AnthropicChatMessageRole::Assistant),
            ChatMessageRole::System => Ok(AnthropicChatMessageRole::User),
            ChatMessageRole::User => Ok(AnthropicChatMessageRole::User),
            ChatMessageRole::Function => Ok(AnthropicChatMessageRole::User),
        }
    }
}

impl ToString for AnthropicChatMessageRole {
    fn to_string(&self) -> String {
        match self {
            AnthropicChatMessageRole::Assistant => String::from("assistant"),
            AnthropicChatMessageRole::User => String::from("user"),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct AnthropicContent {
    pub r#type: String,
    pub text: String,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct AnthropicChatMessage {
    pub content: Vec<AnthropicContent>,
    pub role: AnthropicChatMessageRole,
}

impl TryFrom<&ChatMessage> for AnthropicChatMessage {
    type Error = anyhow::Error;

    fn try_from(cm: &ChatMessage) -> Result<Self, Self::Error> {
        let role = AnthropicChatMessageRole::try_from(&cm.role)
            .map_err(|e| anyhow!("Error converting role: {:?}", e))?;

        let meta_prompt = match cm.role {
            ChatMessageRole::User => match cm.name.as_ref() {
                Some(name) => format!("[user: {}] ", name), // Include space here.
                None => String::from(""),
            },
            ChatMessageRole::Function => match cm.name.as_ref() {
                Some(name) => format!("[function_result: {}] ", name), // Include space here.
                None => "[function_result]".to_string(),
            },
            _ => String::from(""),
        };

        Ok(AnthropicChatMessage {
            content: vec![AnthropicContent {
                r#type: "text".to_string(),
                text: format!(
                    "{}{}",
                    meta_prompt,
                    cm.content.clone().unwrap_or(String::from(""))
                ),
            }],
            role,
        })
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Usage {
    pub input_tokens: u64,
    pub output_tokens: u64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ChatResponse {
    pub id: String,
    pub model: String,
    pub role: AnthropicChatMessageRole,
    pub content: Vec<AnthropicContent>,
    pub stop_reason: Option<StopReason>,
    pub usage: Usage,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CompletionResponse {
    pub completion: String,
    pub stop_reason: Option<StopReason>,
    pub stop: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ErrorDetail {
    pub r#type: String,
    pub message: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Error {
    // Anthropi api errors look like this:
    // {"error":{"type":"invalid_request_error","message":"model: field required"}}
    pub error: ErrorDetail,
}

// Streaming types

#[derive(Serialize, Deserialize, Debug, Clone)]
struct StreamMessageStart {
    pub r#type: String,
    pub message: ChatResponse,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct StreamContentBlockStart {
    pub r#type: String,
    pub index: u64,
    pub content_block: AnthropicContent,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct StreamContentBlockDelta {
    pub r#type: String,
    pub index: u64,
    pub delta: AnthropicContent,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct StreamContentBlockStop {
    pub r#type: String,
    pub index: u64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct ChatResponseDelta {
    stop_reason: Option<StopReason>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct UsageDelta {
    output_tokens: u64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct StreamMessageDelta {
    pub r#type: String,
    pub delta: ChatResponseDelta,
    pub usage: UsageDelta,
}

impl Display for ErrorDetail {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{},{}", self.r#type, self.message)
    }
}

impl Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.error)
    }
}

pub struct AnthropicLLM {
    id: String,
    api_key: Option<String>,
}

impl AnthropicLLM {
    pub fn new(id: String) -> Self {
        Self { id, api_key: None }
    }

    fn messages_uri(&self) -> Result<Uri> {
        Ok("https://api.anthropic.com/v1/messages"
            .to_string()
            .parse::<Uri>()?)
    }

    fn completions_uri(&self) -> Result<Uri> {
        Ok("https://api.anthropic.com/v1/complete"
            .to_string()
            .parse::<Uri>()?)
    }

    async fn chat_completion(
        &self,
        system: Option<String>,
        messages: &Vec<AnthropicChatMessage>,
        temperature: f32,
        top_p: f32,
        stop_sequences: &Vec<String>,
        max_tokens: i32,
    ) -> Result<ChatResponse> {
        assert!(self.api_key.is_some());

        let mut body = json!({
            "model": self.id.clone(),
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "top_p": top_p,
            "stop_sequences": match stop_sequences.len() {
                0 => None,
                _ => Some(stop_sequences),
            },
        });

        if system.is_some() {
            body["system"] = json!(system);
        }

        let res = reqwest::Client::new()
            .post(self.messages_uri()?.to_string())
            .header("Content-Type", "application/json")
            .header("X-API-Key", self.api_key.clone().unwrap())
            .header("anthropic-version", "2023-06-01")
            .json(&body)
            .send()
            .await?;

        let status = res.status();
        let body = res.bytes().await?;

        let mut b: Vec<u8> = vec![];
        body.reader().read_to_end(&mut b)?;
        let c: &[u8] = &b;
        let response = match status {
            reqwest::StatusCode::OK => {
                let response: ChatResponse = serde_json::from_slice(c)?;
                Ok(response)
            }
            _ => {
                let error: Error = serde_json::from_slice(c)?;
                Err(ModelError {
                    message: format!("Anthropic API Error: {}", error.to_string()),
                    retryable: None,
                })
            }
        }?;

        Ok(response)
    }

    pub async fn streamed_chat_completion(
        &self,
        system: Option<String>,
        messages: &Vec<AnthropicChatMessage>,
        temperature: f32,
        top_p: f32,
        stop_sequences: &Vec<String>,
        max_tokens: i32,
        event_sender: UnboundedSender<Value>,
    ) -> Result<ChatResponse> {
        assert!(self.api_key.is_some());

        let mut body = json!({
            "model": self.id.clone(),
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "top_p": top_p,
            "stop_sequences": match stop_sequences.len() {
                0 => None,
                _ => Some(stop_sequences),
            },
            "stream": true,
        });

        if system.is_some() {
            body["system"] = json!(system);
        }

        let https = HttpsConnector::new();
        let url = self.messages_uri()?.to_string();

        let mut builder = match es::ClientBuilder::for_url(url.as_str()) {
            Ok(builder) => builder,
            Err(e) => {
                return Err(anyhow!(
                    "Error creating Anthropic streaming client: {:?}",
                    e
                ))
            }
        };

        builder = builder.method(String::from("POST"));
        builder = match builder.header("Content-Type", "application/json") {
            Ok(builder) => builder,
            Err(e) => return Err(anyhow!("Error setting header: {:?}", e)),
        };
        builder = match builder.header("X-API-Key", self.api_key.clone().unwrap().as_str()) {
            Ok(builder) => builder,
            Err(e) => return Err(anyhow!("Error setting header: {:?}", e)),
        };
        builder = match builder.header("anthropic-version", "2023-06-01") {
            Ok(builder) => builder,
            Err(e) => return Err(anyhow!("Error setting header: {:?}", e)),
        };

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
            .build_with_conn(https);

        let mut stream = client.stream();

        let mut final_response: Option<ChatResponse> = None;
        'stream: loop {
            match stream.try_next().await {
                Ok(stream_next) => match stream_next {
                    Some(es::SSE::Comment(comment)) => {
                        println!("UNEXPECTED COMMENT {}", comment);
                    }
                    Some(es::SSE::Event(event)) => match event.event_type.as_str() {
                        "message_start" => {
                            let event: StreamMessageStart =
                                match serde_json::from_str(event.data.as_str()) {
                                    Ok(event) => event,
                                    Err(error) => {
                                        Err(anyhow!(
                                            "Error parsing response from Anthropic: {:?} {:?}",
                                            error,
                                            event.data
                                        ))?;
                                        break 'stream;
                                    }
                                };

                            final_response = Some(event.message.clone());
                        }
                        "content_block_start" => {
                            let event: StreamContentBlockStart =
                                match serde_json::from_str(event.data.as_str()) {
                                    Ok(event) => event,
                                    Err(error) => {
                                        Err(anyhow!(
                                            "Error parsing response from Anthropic: {:?} {:?}",
                                            error,
                                            event.data
                                        ))?;
                                        break 'stream;
                                    }
                                };

                            match final_response.as_mut() {
                                None => {
                                    Err(anyhow!(
                                        "Error streaming from Anthropic: \
                                                missing `message_start`"
                                    ))?;
                                    break 'stream;
                                }
                                Some(response) => {
                                    response.content.push(event.content_block.clone());
                                    if event.content_block.text.len() > 0 {
                                        let _ = event_sender.send(json!({
                                            "type": "tokens",
                                            "content": {
                                              "text": event.content_block.text,
                                            }

                                        }));
                                    }
                                }
                            }
                        }
                        "content_block_delta" => {
                            let event: StreamContentBlockDelta =
                                match serde_json::from_str(event.data.as_str()) {
                                    Ok(event) => event,
                                    Err(error) => {
                                        Err(anyhow!(
                                            "Error parsing response from Anthropic: {:?} {:?}",
                                            error,
                                            event.data
                                        ))?;
                                        break 'stream;
                                    }
                                };

                            match event.delta.r#type.as_str() {
                                "text_delta" => (),
                                _ => {
                                    Err(anyhow!(
                                        "Error streaming from Anthropic: \
                                             unexpected delta type: {:?}",
                                        event.delta.r#type
                                    ))?;
                                    break 'stream;
                                }
                            }

                            match final_response.as_mut() {
                                None => {
                                    Err(anyhow!(
                                        "Error streaming from Anthropic: \
                                                missing `message_start`"
                                    ))?;
                                    break 'stream;
                                }
                                Some(response) => match response.content.get_mut(0) {
                                    None => {
                                        Err(anyhow!(
                                            "Error streaming from Anthropic: \
                                                    missing `content_block_start`"
                                        ))?;
                                        break 'stream;
                                    }
                                    Some(content) => {
                                        content.text.push_str(event.delta.text.as_str());
                                        if event.delta.text.len() > 0 {
                                            let _ = event_sender.send(json!({
                                                "type": "tokens",
                                                "content": {
                                                  "text": event.delta.text,
                                                }

                                            }));
                                        }
                                    }
                                },
                            }
                        }
                        "content_block_stop" => {
                            let _: StreamContentBlockStop =
                                match serde_json::from_str(event.data.as_str()) {
                                    Ok(event) => event,
                                    Err(error) => {
                                        Err(anyhow!(
                                            "Error parsing response from Anthropic: {:?} {:?}",
                                            error,
                                            event.data
                                        ))?;
                                        break 'stream;
                                    }
                                };
                        }
                        "message_delta" => {
                            let event: StreamMessageDelta =
                                match serde_json::from_str(event.data.as_str()) {
                                    Ok(event) => event,
                                    Err(error) => {
                                        Err(anyhow!(
                                            "Error parsing response from Anthropic: {:?} {:?}",
                                            error,
                                            event.data
                                        ))?;
                                        break 'stream;
                                    }
                                };

                            match final_response.as_mut() {
                                None => {
                                    Err(anyhow!(
                                        "Error streaming from Anthropic: \
                                                missing `message_start`"
                                    ))?;
                                    break 'stream;
                                }
                                Some(response) => {
                                    response.stop_reason = event.delta.stop_reason;
                                    response.usage.output_tokens = event.usage.output_tokens;
                                }
                            }
                        }
                        "message_stop" => {
                            break 'stream;
                        }
                        "error" => {
                            let event: Error = match serde_json::from_str(event.data.as_str()) {
                                Ok(event) => event,
                                Err(_) => {
                                    Err(anyhow!(
                                        "Streaming error from Anthropic: {:?}",
                                        event.data
                                    ))?;
                                    break 'stream;
                                }
                            };

                            Err(ModelError {
                                message: format!(
                                    "Anthropic API Error: {}",
                                    event.error.to_string()
                                ),
                                retryable: None,
                            })?;
                            break 'stream;
                        }
                        _ => (),
                    },
                    None => {
                        println!("UNEXPECTED NONE");
                        break 'stream;
                    }
                },
                Err(error) => {
                    Err(anyhow!("Error streaming from Anthropic: {:?}", error))?;
                    break 'stream;
                }
            }
        }

        match final_response {
            Some(response) => Ok(response),
            None => Err(anyhow!("No response from Anthropic")),
        }
    }

    pub async fn streamed_completion(
        &self,
        prompt: &str,
        max_tokens_to_sample: i32,
        temperature: f32,
        top_p: f32,
        top_k: Option<i32>,
        stop: &Vec<String>,
        event_sender: UnboundedSender<Value>,
    ) -> Result<CompletionResponse> {
        assert!(self.api_key.is_some());

        let https = HttpsConnector::new();
        let url = self.completions_uri()?.to_string();

        let mut builder = match es::ClientBuilder::for_url(url.as_str()) {
            Ok(builder) => builder,
            Err(e) => {
                return Err(anyhow!(
                    "Error creating Anthropic streaming client: {:?}",
                    e
                ))
            }
        };

        builder = builder.method(String::from("POST"));
        builder = match builder.header("Content-Type", "application/json") {
            Ok(builder) => builder,
            Err(e) => return Err(anyhow!("Error setting header: {:?}", e)),
        };
        builder = match builder.header("X-API-Key", self.api_key.clone().unwrap().as_str()) {
            Ok(builder) => builder,
            Err(e) => return Err(anyhow!("Error setting header: {:?}", e)),
        };
        builder = match builder.header("anthropic-version", "2023-06-01") {
            Ok(builder) => builder,
            Err(e) => return Err(anyhow!("Error setting header: {:?}", e)),
        };

        let body = json!({
            "model": self.id.clone(),
            "prompt": prompt,
            "max_tokens_to_sample": max_tokens_to_sample,
            "temperature": temperature,
            "stop_sequences": stop.clone(),
            "top_p": top_p,
            "top_k": match top_k {
                Some(k) => k,
                None => -1
            },
            "stream": true
        });

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
            .build_with_conn(https);

        let mut stream = client.stream();

        let mut final_response: Option<CompletionResponse> = None;
        let mut completion = String::new();
        'stream: loop {
            match stream.try_next().await {
                Ok(stream_next) => match stream_next {
                    Some(es::SSE::Comment(comment)) => {
                        println!("UNEXPECTED COMMENT {}", comment);
                    }
                    Some(es::SSE::Event(event)) => match event.event_type.as_str() {
                        "completion" => {
                            // println!("RESPONSE {} {}", event.event_type, event.data);
                            let response: CompletionResponse =
                                match serde_json::from_str(event.data.as_str()) {
                                    Ok(response) => response,
                                    Err(error) => {
                                        Err(anyhow!(
                                            "Error parsing response from Anthropic: {:?} {:?}",
                                            error,
                                            event.data
                                        ))?;
                                        break 'stream;
                                    }
                                };

                            match response.stop_reason {
                                Some(stop_reason) => {
                                    final_response = Some(CompletionResponse {
                                        completion,
                                        stop_reason: Some(stop_reason),
                                        stop: response.stop.clone(),
                                    });
                                    break 'stream;
                                }
                                None => (),
                            }

                            completion.push_str(response.completion.as_str());

                            if response.completion.len() > 0 {
                                let _ = event_sender.send(json!({
                                    "type":"tokens",
                                    "content": {
                                        "text":response.completion,
                                    }

                                }));
                            }

                            final_response = Some(response.clone());
                        }
                        "error" => {
                            Err(anyhow!("Streaming error from Anthropic: {:?}", event.data))?;
                            break 'stream;
                        }
                        _ => (),
                    },
                    None => {
                        println!("UNEXPECTED NONE");
                        break 'stream;
                    }
                },
                Err(error) => {
                    Err(anyhow!("Error streaming from Anthropic: {:?}", error))?;
                    break 'stream;
                }
            }
        }

        return match final_response {
            Some(response) => Ok(response),
            None => Err(anyhow!("No response from Anthropic")),
        };
    }

    async fn completion(
        &self,
        prompt: &str,
        max_tokens_to_sample: i32,
        temperature: f32,
        top_p: f32,
        top_k: Option<i32>,
        stop: &Vec<String>,
    ) -> Result<CompletionResponse> {
        assert!(self.api_key.is_some());

        let res = reqwest::Client::new()
            .post(self.completions_uri()?.to_string())
            .header("Content-Type", "application/json")
            .header("X-API-Key", self.api_key.clone().unwrap())
            .header("anthropic-version", "2023-06-01")
            .json(&json!({
                "model": self.id.clone(),
                "prompt": prompt,
                "max_tokens_to_sample": max_tokens_to_sample,
                "temperature": temperature,
                // stop sequences need to be non-null for anthropic, otherwise
                // we get 422 Unprocessable Entity
                "stop_sequences": stop.clone(),
                "top_p": top_p,
                "top_k": match top_k {
                    Some(k) => k,
                    None => -1
                },
            }))
            .send()
            .await?;

        let status = res.status();
        let body = res.bytes().await?;

        let mut b: Vec<u8> = vec![];
        body.reader().read_to_end(&mut b)?;
        let c: &[u8] = &b;
        let response = match status {
            reqwest::StatusCode::OK => {
                let response: CompletionResponse = serde_json::from_slice(c)?;
                Ok(response)
            }
            _ => {
                let error: Error = serde_json::from_slice(c)?;
                Err(ModelError {
                    message: format!("Anthropic API Error: {}", error.to_string()),
                    retryable: None,
                })
            }
        }?;

        Ok(response)
    }
}

#[async_trait]
impl LLM for AnthropicLLM {
    fn id(&self) -> String {
        self.id.clone()
    }

    async fn initialize(&mut self, credentials: Credentials) -> Result<()> {
        match credentials.get("ANTHROPIC_API_KEY") {
            Some(api_key) => {
                self.api_key = Some(api_key.clone());
            }
            None => match tokio::task::spawn_blocking(|| std::env::var("ANTHROPIC_API_KEY")).await?
            {
                Ok(key) => {
                    self.api_key = Some(key);
                }
                Err(_) => Err(anyhow!(
                    "Credentials or environment variable `ANTHROPIC_API_KEY` is not set."
                ))?,
            },
        }
        Ok(())
    }

    fn context_size(&self) -> usize {
        if self.id.starts_with("claude-2.1") || self.id.starts_with("claude-3") {
            200000
        } else {
            100000
        }
    }

    async fn generate(
        &self,
        prompt: &str,
        mut max_tokens: Option<i32>,
        temperature: f32,
        n: usize,
        stop: &Vec<String>,
        _frequency_penalty: Option<f32>,
        _presence_penalty: Option<f32>,
        top_p: Option<f32>,
        _top_logprobs: Option<i32>,
        _extras: Option<Value>,
        event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<LLMGeneration> {
        assert!(self.api_key.is_some());
        assert!(n > 0);
        if n > 1 {
            return Err(anyhow!(
                "Anthropic only supports generating one sample at a time."
            ))?;
        }

        if let Some(m) = max_tokens {
            if m == -1 {
                let tokens = self.encode(prompt).await?;
                max_tokens = Some(std::cmp::min(
                    (self.context_size() - tokens.len()) as i32,
                    4096,
                ));
            }
        }

        let c: Vec<Tokens> = match event_sender {
            Some(es) => {
                let mut completions: Vec<Tokens> = vec![];
                let response = match self
                    .streamed_completion(
                        prompt,
                        match max_tokens {
                            Some(m) => m,
                            None => 256,
                        },
                        temperature,
                        match top_p {
                            Some(p) => p,
                            None => 1.0,
                        },
                        None,
                        stop,
                        es,
                    )
                    .await
                {
                    Ok(response) => response,
                    Err(error) => {
                        return Err(anyhow!("Error streaming from Anthropic: {:?}", error))?;
                    }
                };
                completions.push(Tokens {
                    // Anthropic only return the text
                    text: response.completion.clone(),
                    tokens: Some(vec![]),
                    logprobs: Some(vec![]),
                    top_logprobs: Some(vec![]),
                });

                completions
            }
            None => {
                let mut completions: Vec<Tokens> = vec![];
                // anthropic only supports generating one sample at a time
                // so we loop here and make n API calls
                let response = self
                    .completion(
                        prompt,
                        match max_tokens {
                            Some(m) => m,
                            None => 4096,
                        },
                        temperature,
                        match top_p {
                            Some(p) => p,
                            None => 1.0,
                        },
                        None,
                        stop,
                    )
                    .await?;

                completions.push(Tokens {
                    // Anthropic only return the text
                    text: response.completion.clone(),
                    tokens: Some(vec![]),
                    logprobs: Some(vec![]),
                    top_logprobs: Some(vec![]),
                });
                completions
            }
        };

        let llm_generation = LLMGeneration {
            created: utils::now(),
            completions: c,
            provider: ProviderID::Anthropic.to_string(),
            model: self.id.clone(),
            prompt: Tokens {
                text: prompt.to_string(),
                tokens: None,
                logprobs: None,
                top_logprobs: None,
            },
        };

        Ok(llm_generation)
    }

    async fn encode(&self, text: &str) -> Result<Vec<usize>> {
        encode_async(anthropic_base_singleton(), text).await
    }

    async fn decode(&self, tokens: Vec<usize>) -> Result<String> {
        decode_async(anthropic_base_singleton(), tokens).await
    }

    async fn tokenize(&self, text: &str) -> Result<Vec<(usize, String)>> {
        tokenize_async(anthropic_base_singleton(), text).await
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
        mut max_tokens: Option<i32>,
        _presence_penalty: Option<f32>,
        _frequency_penalty: Option<f32>,
        _extras: Option<Value>,
        event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<LLMChatGeneration> {
        assert!(self.api_key.is_some());
        assert!(n > 0);
        if n > 1 {
            return Err(anyhow!(
                "Anthropic only supports generating one sample at a time."
            ))?;
        }
        if functions.len() > 0 || function_call.is_some() {
            return Err(anyhow!("Anthropic does not support chat functions."));
        }

        if let Some(m) = max_tokens {
            if m == -1 {
                max_tokens = Some(4096);
            }
        }

        let system = match messages.get(0) {
            Some(cm) => match cm.role {
                ChatMessageRole::System => match cm.content.as_ref() {
                    Some(c) => Some(c.clone()),
                    None => None,
                },
                _ => None,
            },
            None => None,
        };

        let mut messages = messages
            .iter()
            .skip(match system.as_ref() {
                Some(_) => 1,
                None => 0,
            })
            .map(|cm| AnthropicChatMessage::try_from(cm))
            .collect::<Result<Vec<AnthropicChatMessage>>>()?;

        messages = messages.iter().fold(
            vec![],
            |mut acc: Vec<AnthropicChatMessage>, cm: &AnthropicChatMessage| {
                match acc.last_mut() {
                    Some(last) if last.role == cm.role => {
                        last.content.extend(cm.content.clone());
                    }
                    _ => {
                        acc.push(cm.clone());
                    }
                };
                acc
            },
        );

        messages = messages
            .iter()
            .map(|cm| AnthropicChatMessage {
                content: vec![AnthropicContent {
                    r#type: String::from("text"),
                    text: cm
                        .content
                        .iter()
                        .map(|c| c.text.clone())
                        .collect::<Vec<String>>()
                        .join("\n"),
                }],
                role: cm.role.clone(),
            })
            .collect();

        // merge messages of the same role

        let c = match event_sender {
            Some(es) => {
                self.streamed_chat_completion(
                    system,
                    &messages,
                    temperature,
                    match top_p {
                        Some(p) => p,
                        None => 1.0,
                    },
                    stop,
                    match max_tokens {
                        Some(m) => m,
                        None => 4096,
                    },
                    es,
                )
                .await?
            }
            None => {
                self.chat_completion(
                    system,
                    &messages,
                    temperature,
                    match top_p {
                        Some(p) => p,
                        None => 1.0,
                    },
                    stop,
                    match max_tokens {
                        Some(m) => m,
                        None => 4096,
                    },
                )
                .await?
            }
        };

        match c.content.first() {
            None => Err(anyhow!("No content in response from Anthropic.")),
            Some(content) => match content.r#type.as_str() {
                "text" => Ok(LLMChatGeneration {
                    created: utils::now(),
                    provider: ProviderID::Anthropic.to_string(),
                    model: self.id.clone(),
                    completions: vec![ChatMessage {
                        role: ChatMessageRole::Assistant,
                        content: Some(content.text.clone()),
                        name: None,
                        function_call: None,
                    }],
                }),
                _ => Err(anyhow!("Anthropic returned an unexpected content type.")),
            },
        }
    }
}

pub struct AnthropicEmbedder {
    id: String,
}

impl AnthropicEmbedder {
    pub fn new(id: String) -> Self {
        AnthropicEmbedder { id }
    }
}

#[async_trait]
impl Embedder for AnthropicEmbedder {
    fn id(&self) -> String {
        self.id.clone()
    }

    async fn initialize(&mut self, _credentials: Credentials) -> Result<()> {
        Err(anyhow!("Embedders not available for provider `anthropic`"))
    }

    fn context_size(&self) -> usize {
        0
    }
    fn embedding_size(&self) -> usize {
        0
    }

    async fn encode(&self, text: &str) -> Result<Vec<usize>> {
        encode_async(anthropic_base_singleton(), text).await
    }

    async fn decode(&self, tokens: Vec<usize>) -> Result<String> {
        decode_async(anthropic_base_singleton(), tokens).await
    }

    async fn embed(&self, _text: Vec<&str>, _extras: Option<Value>) -> Result<Vec<EmbedderVector>> {
        Err(anyhow!("Embeddings not available for provider `anthropic`"))
    }
}

pub struct AnthropicProvider {}

impl AnthropicProvider {
    pub fn new() -> Self {
        AnthropicProvider {}
    }
}

#[async_trait]
impl Provider for AnthropicProvider {
    fn id(&self) -> ProviderID {
        ProviderID::Anthropic
    }

    fn setup(&self) -> Result<()> {
        utils::info("Setting up Anthropic:");
        utils::info("");
        utils::info(
            "To use Anthropic's models, you must set the environment variable `ANTHROPIC_API_KEY`.",
        );
        utils::info("Your API key can be found at `https://console.anthropic.com/account/keys`.");
        utils::info("");
        utils::info("Once ready you can check your setup with `dust provider test anthropic`");

        Ok(())
    }

    async fn test(&self) -> Result<()> {
        if !utils::confirm(
            "You are about to make a request for 1 token to `claude-instant-1.2` on the Anthropic API.",
        )? {
            Err(anyhow!("User aborted Anthropic test."))?;
        }

        let mut llm = self.llm(String::from("claude-instant-1.2"));
        llm.initialize(Credentials::new()).await?;

        let llm_generation = llm
            .generate(
                "fine, dry powder consisting of tiny particles of earth or waste matter \
                lying on the ground or on surfaces or carried in the air. We call it ",
                Some(1),
                0.9,
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

        utils::info(&format!("Prompt: {}", llm_generation.prompt.text));
        utils::info(&format!(
            "Completion: {}",
            llm_generation.completions[0].text,
        ));

        utils::done("Test successfully completed! Anthropic is ready to use.");

        Ok(())
    }

    fn llm(&self, id: String) -> Box<dyn LLM + Sync + Send> {
        Box::new(AnthropicLLM::new(id))
    }

    fn embedder(&self, id: String) -> Box<dyn Embedder + Sync + Send> {
        Box::new(AnthropicEmbedder::new(id))
    }
}
