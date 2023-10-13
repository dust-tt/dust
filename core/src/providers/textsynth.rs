use crate::providers::embedder::Embedder;
use crate::providers::llm::Tokens;
use crate::providers::llm::{ChatMessage, LLMChatGeneration, LLMGeneration, LLM};
use crate::providers::provider::{ModelError, ModelErrorRetryOptions, Provider, ProviderID};
use crate::run::Credentials;
use crate::utils;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use hyper::body::HttpBody;
use hyper::{body::Buf, Body, Client, Method, Request, Uri};
use hyper_tls::HttpsConnector;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::prelude::*;
use std::time::Duration;
use tokio::sync::mpsc::UnboundedSender;

use super::embedder::EmbedderVector;
use super::llm::{ChatFunction, ChatMessageRole};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Error {
    pub error: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TokenizeResponse {
    pub tokens: Vec<usize>,
}

async fn api_tokenize(api_key: &str, engine: &str, text: &str) -> Result<Vec<usize>> {
    let https = HttpsConnector::new();
    let cli = Client::builder().build::<_, hyper::Body>(https);

    let req = Request::builder()
        .method(Method::POST)
        .uri(format!("https://api.textsynth.com/v1/engines/{}/tokenize", engine).parse::<Uri>()?)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_key))
        .body(Body::from(
            json!({
                "text": text,
            })
            .to_string(),
        ))?;

    let res = cli.request(req).await?;
    let status = res.status();
    let body = hyper::body::aggregate(res).await?;
    let mut b: Vec<u8> = vec![];
    body.reader().read_to_end(&mut b)?;
    let c: &[u8] = &b;

    let r = match status {
        hyper::StatusCode::OK => {
            let r: TokenizeResponse = serde_json::from_slice(c)?;
            Ok(r)
        }
        hyper::StatusCode::TOO_MANY_REQUESTS => {
            let error: Error = serde_json::from_slice(c).unwrap_or(Error {
                error: "Too many requests".to_string(),
            });
            Err(ModelError {
                message: format!("TextSynthAPIError: {}", error.error),
                retryable: Some(ModelErrorRetryOptions {
                    sleep: Duration::from_millis(2000),
                    factor: 2,
                    retries: 8,
                }),
            })
        }
        hyper::StatusCode::BAD_REQUEST => {
            let error: Error = serde_json::from_slice(c).unwrap_or(Error {
                error: "Unknown error".to_string(),
            });
            Err(ModelError {
                message: format!("TextSynthAPIError: {}", error.error),
                retryable: None,
            })
        }
        _ => {
            let error: Error = serde_json::from_slice(c)?;
            Err(ModelError {
                message: format!("TextSynthAPIError: {}", error.error),
                retryable: None,
            })
        }
    }?;
    Ok(r.tokens)
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Completion {
    pub text: String,
    pub reached_end: bool,
    pub input_tokens: Option<usize>,
    pub output_tokens: Option<usize>,
    pub finish_reason: Option<String>,
}

pub struct TextSynthLLM {
    id: String,
    api_key: Option<String>,
}

impl TextSynthLLM {
    pub fn new(id: String) -> Self {
        TextSynthLLM { id, api_key: None }
    }

    fn uri(&self) -> Result<Uri> {
        Ok(format!(
            "https://api.textsynth.com/v1/engines/{}/completions",
            self.id
        )
        .parse::<Uri>()?)
    }

    fn chat_uri(&self) -> Result<Uri> {
        Ok(format!("https://api.textsynth.com/v1/engines/{}/chat", self.id).parse::<Uri>()?)
    }

    // This function is in charge of formatting the messages for the chat TextSynth interface by
    // injecting the role and name as context to the model. As a result the model will echo that
    // structure. We use `extract_name_and_role` to clean it up.
    fn format_chat_messages(&self, messages: &Vec<ChatMessage>) -> (Option<String>, Vec<String>) {
        let mut system: Option<String> = None;
        let mut messages = messages.clone();

        // If the first message is a system message, remove it and return a system string.
        if messages.len() > 0 && messages[0].role == ChatMessageRole::System {
            system = match messages[0].content {
                Some(ref c) => Some(c.clone()),
                None => None,
            };
            messages.remove(0);
        }

        let formatted = messages
            .iter()
            .map(|m| {
                let content = match m.content {
                    Some(ref c) => c.clone(),
                    None => String::from(""),
                };

                match m.name {
                    Some(ref n) => format!("role={} name={} {}", m.role.to_string(), n, content),
                    None => format!("role={} {}", m.role.to_string(), content),
                }
            })
            .collect::<Vec<_>>();

        (system, formatted)
    }

    // Cleans up output of the model by removing the injected role and name pieces. We run this in
    // non streamed mode on the final response. In streamed mode we run it on the first chunk
    // (textsynth returned more than one token at a time and this will fall into it with high
    // likelihood; this is not perfect but usage will tell if we need to be more elaboratde).
    fn extract_name_and_role(text: &str) -> (Option<ChatMessageRole>, Option<String>, String) {
        let mut response_text = text.trim().to_string();
        let mut role: Option<ChatMessageRole> = None;
        let mut name: Option<String> = None;

        // Extract and remove `role=...` at the beginning of the message if it exists.
        let re = regex::Regex::new(r"^role=(\w+) ").unwrap();
        response_text = match re.captures(response_text.as_str()) {
            Some(c) => {
                let r = c.get(1).unwrap().as_str().to_string();
                match r.as_str() {
                    "assistant" => role = Some(ChatMessageRole::Assistant),
                    "user" => role = Some(ChatMessageRole::User),
                    "system" => role = Some(ChatMessageRole::System),
                    _ => (),
                }
                response_text[6 + r.len()..]
                    .to_string()
                    .trim_start()
                    .to_string()
            }
            None => response_text,
        };

        // Extract and remove `name=...` at the beginning of the message if it exists.
        let re = regex::Regex::new(r"^name=(\w+) ").unwrap();
        response_text = match re.captures(response_text.as_str()) {
            Some(c) => {
                let n = c.get(1).unwrap().as_str().to_string();
                let t = response_text[6 + n.len()..]
                    .to_string()
                    .trim_start()
                    .to_string();
                name = Some(n);
                t
            }
            None => response_text,
        };

        (role, name, response_text)
    }

    async fn stream_events(
        &self,
        mut b: Body,
        event_sender: UnboundedSender<Value>,
    ) -> Result<Completion> {
        let mut completion: Option<Completion> = None;
        let mut completion_text = String::new();

        let mut buf: Vec<u8> = vec![];
        let mut chunk_idx: usize = 0;

        while let Some(chunk) = b.data().await {
            let chunk = chunk?;
            buf.extend_from_slice(&chunk);

            if buf.contains(&b'\n') {
                let last_newline = buf.iter().rposition(|&b| b == b'\n').unwrap();
                let split_buf: Vec<&[u8]> = buf[0..last_newline].split(|&i| i == b'\n').collect();

                for item in split_buf {
                    if item.len() == 0 {
                        continue;
                    }
                    match serde_json::from_slice::<Completion>(item) {
                        Ok(c) => {
                            // We push the full text so that it can be re-extracted to render the
                            // final completion.
                            completion_text.push_str(c.text.as_str());

                            match c.finish_reason {
                                Some(stop_reason) => {
                                    completion = Some(Completion {
                                        text: completion_text.clone(),
                                        finish_reason: Some(stop_reason),
                                        output_tokens: c.output_tokens,
                                        input_tokens: c.input_tokens,
                                        reached_end: c.reached_end,
                                    });
                                }
                                None => (),
                            }

                            // But we emit only the clean-ed version (first-chunk only).
                            let text = match chunk_idx {
                                0 => {
                                    let (_, _, text) = Self::extract_name_and_role(c.text.as_str());
                                    text
                                }
                                _ => c.text.clone(),
                            };

                            if c.text.len() > 0 {
                                let _ = event_sender.send(json!({
                                    "type":"tokens",
                                    "content": {
                                        "text": text,
                                    }
                                }));
                            }
                        }
                        Err(e) => Err(anyhow!(
                            "Error parsing response from TextSynth: error={:?}",
                            e,
                        ))?,
                    }

                    chunk_idx += 1;
                }

                // Keep the part after the last '\n' in the buffer
                buf = buf[last_newline + 1..].to_vec();
            }
        }
        // The last slice should be empty since we have two \n at the end of the stream.
        return match completion {
            Some(response) => Ok(response),
            None => Err(anyhow!("No response from TextSynth")),
        };
    }

    fn build_json_body(
        max_tokens: Option<i32>,
        temperature: f32,
        stop: &Vec<String>,
        top_k: Option<usize>,
        top_p: Option<f32>,
        frequency_penalty: Option<f32>,
        presence_penalty: Option<f32>,
        repetition_penalty: Option<f32>,
        typical_p: Option<f32>,
    ) -> Value {
        let mut body = json!({
            "temperature": temperature,
        });
        if max_tokens.is_some() {
            body["max_tokens"] = json!(max_tokens.unwrap());
        }
        if stop.len() > 0 {
            body["stop"] = json!(stop);
        }
        if top_k.is_some() {
            body["top_k"] = json!(top_k.unwrap());
        }
        if top_p.is_some() {
            body["top_p"] = json!(top_k.unwrap());
        }
        if frequency_penalty.is_some() {
            body["frequency_penalty"] = json!(frequency_penalty.unwrap());
        }
        if presence_penalty.is_some() {
            body["presence_penalty"] = json!(presence_penalty.unwrap());
        }
        if repetition_penalty.is_some() {
            body["repetition_penalty"] = json!(repetition_penalty.unwrap());
        }
        if typical_p.is_some() {
            body["typical_p"] = json!(typical_p.unwrap());
        }

        body
    }

    async fn completion(
        &self,
        prompt: &str,
        mut max_tokens: Option<i32>,
        temperature: f32,
        stop: &Vec<String>,
        top_k: Option<usize>,
        top_p: Option<f32>,
        frequency_penalty: Option<f32>,
        presence_penalty: Option<f32>,
        repetition_penalty: Option<f32>,
        typical_p: Option<f32>,
    ) -> Result<Completion> {
        assert!(self.api_key.is_some());

        if max_tokens.is_none() || max_tokens.unwrap() == -1 {
            let tokens = self.encode(prompt).await?;
            max_tokens = Some((self.context_size() - tokens.len()) as i32);
        }

        let https = HttpsConnector::new();
        let cli = Client::builder().build::<_, hyper::Body>(https);

        let mut body = Self::build_json_body(
            max_tokens,
            temperature,
            stop,
            top_k,
            top_p,
            frequency_penalty,
            presence_penalty,
            repetition_penalty,
            typical_p,
        );
        body["prompt"] = json!(prompt);

        let req = Request::builder()
            .method(Method::POST)
            .uri(self.uri()?)
            .header("Content-Type", "application/json")
            .header(
                "Authorization",
                format!("Bearer {}", self.api_key.clone().unwrap()),
            )
            .body(Body::from(body.to_string()))?;

        let res = cli.request(req).await?;
        let status = res.status();
        let body = hyper::body::aggregate(res).await?;
        let mut b: Vec<u8> = vec![];
        body.reader().read_to_end(&mut b)?;

        let response = match status {
            hyper::StatusCode::OK => {
                let completion: Completion = serde_json::from_slice(&b)?;
                Ok(completion)
            }
            hyper::StatusCode::TOO_MANY_REQUESTS => {
                let error: Error = serde_json::from_slice(&b).unwrap_or(Error {
                    error: "Too many requests".to_string(),
                });
                Err(ModelError {
                    message: format!("TextSynthAPIError: {}", error.error),
                    retryable: Some(ModelErrorRetryOptions {
                        sleep: Duration::from_millis(2000),
                        factor: 2,
                        retries: 8,
                    }),
                })
            }
            hyper::StatusCode::BAD_REQUEST => {
                let error: Error = serde_json::from_slice(&b).unwrap_or(Error {
                    error: "Unknown error".to_string(),
                });
                Err(ModelError {
                    message: format!("TextSynthAPIError: {}", error.error),
                    retryable: None,
                })
            }
            _ => {
                let error: Error = serde_json::from_slice(&b)?;
                Err(ModelError {
                    message: format!("TextSynthAPIError: {}", error.error),
                    retryable: None,
                })
            }
        }?;

        Ok(response)
    }

    pub async fn streamed_completion(
        &self,
        prompt: &str,
        mut max_tokens: Option<i32>,
        temperature: f32,
        stop: &Vec<String>,
        top_k: Option<usize>,
        top_p: Option<f32>,
        frequency_penalty: Option<f32>,
        presence_penalty: Option<f32>,
        repetition_penalty: Option<f32>,
        typical_p: Option<f32>,
        event_sender: UnboundedSender<Value>,
    ) -> Result<Completion> {
        assert!(self.api_key.is_some());

        if max_tokens.is_none() || max_tokens.unwrap() == -1 {
            let tokens = self.encode(prompt).await?;
            max_tokens = Some((self.context_size() - tokens.len()) as i32);
        }

        let https = HttpsConnector::new();
        let cli = Client::builder().build::<_, hyper::Body>(https);

        let mut body = Self::build_json_body(
            max_tokens,
            temperature,
            stop,
            top_k,
            top_p,
            frequency_penalty,
            presence_penalty,
            repetition_penalty,
            typical_p,
        );
        body["prompt"] = json!(prompt);
        body["stream"] = json!(true);

        let req = Request::builder()
            .method(Method::POST)
            .uri(self.uri()?)
            .header("Content-Type", "application/json")
            .header(
                "Authorization",
                format!("Bearer {}", self.api_key.clone().unwrap()),
            )
            .body(Body::from(body.to_string()))?;

        let res = cli.request(req).await?;
        let status = res.status();

        match status {
            hyper::StatusCode::OK => {
                let b = res.into_body();
                self.stream_events(b, event_sender).await
            }
            _ => {
                let body = hyper::body::aggregate(res).await?;
                let mut b: Vec<u8> = vec![];
                body.reader().read_to_end(&mut b)?;

                match status {
                    hyper::StatusCode::TOO_MANY_REQUESTS => {
                        let error: Error = serde_json::from_slice(&b).unwrap_or(Error {
                            error: "Too many requests".to_string(),
                        });
                        Err(ModelError {
                            message: format!("TextSynthAPIError: {}", error.error),
                            retryable: Some(ModelErrorRetryOptions {
                                sleep: Duration::from_millis(2000),
                                factor: 2,
                                retries: 8,
                            }),
                        })?
                    }
                    hyper::StatusCode::BAD_REQUEST => {
                        let error: Error = serde_json::from_slice(&b).unwrap_or(Error {
                            error: "Bad request".to_string(),
                        });

                        Err(ModelError {
                            message: format!("TextSynthAPIError: {}", error.error),
                            retryable: None,
                        })?
                    }
                    _ => {
                        let error: Error = serde_json::from_slice(&b)?;

                        Err(ModelError {
                            message: format!("TextSynthAPIError: {}", error.error),
                            retryable: None,
                        })?
                    }
                }
            }
        }
    }

    pub async fn chat(
        &self,
        messages: &Vec<ChatMessage>,
        mut max_tokens: Option<i32>,
        temperature: f32,
        stop: &Vec<String>,
        top_k: Option<usize>,
        top_p: Option<f32>,
        frequency_penalty: Option<f32>,
        presence_penalty: Option<f32>,
        repetition_penalty: Option<f32>,
        typical_p: Option<f32>,
    ) -> Result<LLMChatGeneration> {
        assert!(self.api_key.is_some());

        let (system, messages) = self.format_chat_messages(messages);

        if max_tokens.is_none() || max_tokens.unwrap() == -1 {
            let tokens = self
                .encode(
                    format!(
                        "{} {}",
                        system.as_ref().unwrap_or(&String::from("")),
                        messages.join("\n")
                    )
                    .as_str(),
                )
                .await?;
            max_tokens = Some((self.context_size() - tokens.len()) as i32);
        }

        let https = HttpsConnector::new();
        let cli = Client::builder().build::<_, hyper::Body>(https);

        let mut body = Self::build_json_body(
            max_tokens,
            temperature,
            stop,
            top_k,
            top_p,
            frequency_penalty,
            presence_penalty,
            repetition_penalty,
            typical_p,
        );
        match system.as_ref() {
            Some(s) => body["system"] = json!(s.clone()),
            None => (),
        }
        body["messages"] = json!(messages);

        let req = Request::builder()
            .method(Method::POST)
            .uri(self.chat_uri()?)
            .header("Content-Type", "application/json")
            .header(
                "Authorization",
                format!("Bearer {}", self.api_key.clone().unwrap()),
            )
            .body(Body::from(body.to_string()))?;

        let res = cli.request(req).await?;
        let status = res.status();
        let body = hyper::body::aggregate(res).await?;
        let mut b: Vec<u8> = vec![];
        body.reader().read_to_end(&mut b)?;

        let response = match status {
            hyper::StatusCode::OK => {
                let completion: Completion = serde_json::from_slice(&b)?;
                Ok(completion)
            }
            hyper::StatusCode::TOO_MANY_REQUESTS => {
                let error: Error = serde_json::from_slice(&b).unwrap_or(Error {
                    error: "Too many requests".to_string(),
                });
                Err(ModelError {
                    message: format!("TextSynthAPIError: {}", error.error),
                    retryable: Some(ModelErrorRetryOptions {
                        sleep: Duration::from_millis(2000),
                        factor: 2,
                        retries: 8,
                    }),
                })
            }
            hyper::StatusCode::BAD_REQUEST => {
                let error: Error = serde_json::from_slice(&b).unwrap_or(Error {
                    error: "Unknown error".to_string(),
                });
                Err(ModelError {
                    message: format!("TextSynthAPIError: {}", error.error),
                    retryable: None,
                })
            }
            _ => {
                let error: Error = serde_json::from_slice(&b)?;
                Err(ModelError {
                    message: format!("TextSynthAPIError: {}", error.error),
                    retryable: None,
                })
            }
        }?;

        let (_, name, response_text) = Self::extract_name_and_role(response.text.as_str());

        Ok(LLMChatGeneration {
            created: utils::now(),
            provider: ProviderID::TextSynth.to_string(),
            model: self.id.clone(),
            completions: vec![ChatMessage {
                role: ChatMessageRole::Assistant,
                name,
                content: Some(response_text),
                function_call: None,
            }],
        })
    }

    pub async fn streamed_chat(
        &self,
        messages: &Vec<ChatMessage>,
        mut max_tokens: Option<i32>,
        temperature: f32,
        stop: &Vec<String>,
        top_k: Option<usize>,
        top_p: Option<f32>,
        frequency_penalty: Option<f32>,
        presence_penalty: Option<f32>,
        repetition_penalty: Option<f32>,
        typical_p: Option<f32>,
        event_sender: UnboundedSender<Value>,
    ) -> Result<LLMChatGeneration> {
        assert!(self.api_key.is_some());

        let (system, messages) = self.format_chat_messages(messages);

        if max_tokens.is_none() || max_tokens.unwrap() == -1 {
            let tokens = self
                .encode(
                    format!(
                        "{} {}",
                        system.as_ref().unwrap_or(&String::from("")),
                        messages.join("\n")
                    )
                    .as_str(),
                )
                .await?;
            max_tokens = Some((self.context_size() - tokens.len()) as i32);
        }

        let https = HttpsConnector::new();
        let cli = Client::builder().build::<_, hyper::Body>(https);

        let mut body = Self::build_json_body(
            max_tokens,
            temperature,
            stop,
            top_k,
            top_p,
            frequency_penalty,
            presence_penalty,
            repetition_penalty,
            typical_p,
        );
        match system.as_ref() {
            Some(s) => body["system"] = json!(s.clone()),
            None => (),
        }
        body["messages"] = json!(messages);
        body["stream"] = json!(true);

        let req = Request::builder()
            .method(Method::POST)
            .uri(self.chat_uri()?)
            .header("Content-Type", "application/json")
            .header(
                "Authorization",
                format!("Bearer {}", self.api_key.clone().unwrap()),
            )
            .body(Body::from(body.to_string()))?;

        let res = cli.request(req).await?;
        let status = res.status();

        let response = match status {
            hyper::StatusCode::OK => {
                let b = res.into_body();
                self.stream_events(b, event_sender).await?
            }
            _ => {
                let body = hyper::body::aggregate(res).await?;
                let mut b: Vec<u8> = vec![];
                body.reader().read_to_end(&mut b)?;

                match status {
                    hyper::StatusCode::TOO_MANY_REQUESTS => {
                        let error: Error = serde_json::from_slice(&b).unwrap_or(Error {
                            error: "Too many requests".to_string(),
                        });
                        Err(ModelError {
                            message: format!("TextSynthAPIError: {}", error.error),
                            retryable: Some(ModelErrorRetryOptions {
                                sleep: Duration::from_millis(2000),
                                factor: 2,
                                retries: 8,
                            }),
                        })?
                    }
                    hyper::StatusCode::BAD_REQUEST => {
                        let error: Error = serde_json::from_slice(&b).unwrap_or(Error {
                            error: "Bad request".to_string(),
                        });

                        Err(ModelError {
                            message: format!("TextSynthAPIError: {}", error.error),
                            retryable: None,
                        })?
                    }
                    _ => {
                        let error: Error = serde_json::from_slice(&b)?;

                        Err(ModelError {
                            message: format!("TextSynthAPIError: {}", error.error),
                            retryable: None,
                        })?
                    }
                }
            }
        };

        let (_, name, response_text) = Self::extract_name_and_role(response.text.as_str());

        Ok(LLMChatGeneration {
            created: utils::now(),
            provider: ProviderID::TextSynth.to_string(),
            model: self.id.clone(),
            completions: vec![ChatMessage {
                role: ChatMessageRole::Assistant,
                name,
                content: Some(response_text.clone()),
                function_call: None,
            }],
        })
    }
}

#[async_trait]
impl LLM for TextSynthLLM {
    fn id(&self) -> String {
        self.id.clone()
    }

    async fn initialize(&mut self, credentials: Credentials) -> Result<()> {
        match credentials.get("TEXTSYNTH_API_KEY") {
            Some(api_key) => {
                self.api_key = Some(api_key.clone());
            }
            None => match tokio::task::spawn_blocking(|| std::env::var("TEXTSYNTH_API_KEY")).await?
            {
                Ok(key) => {
                    self.api_key = Some(key);
                }
                Err(_) => Err(anyhow!(
                    "Credentials or environment variable `TEXTSYNTH_API_KEY` is not set."
                ))?,
            },
        }
        Ok(())
    }

    fn context_size(&self) -> usize {
        match self.id.as_str() {
            "mistral_7B" => 4096,
            "mistral_7B_instruct" => 4096,
            "falcon_7B" => 2048,
            "falcon_40B" => 2048,
            "falcon_40B-chat" => 2048,
            "llama2_7B" => 4096,
            _ => 2048,
        }
    }

    async fn encode(&self, text: &str) -> Result<Vec<usize>> {
        assert!(self.api_key.is_some());

        api_tokenize(self.api_key.as_ref().unwrap(), self.id.as_str(), text).await
    }

    async fn decode(&self, _tokens: Vec<usize>) -> Result<String> {
        Err(anyhow!(
            "Encode/Decode not implemented for provider `textsynth`"
        ))
    }

    // We return empty strings in place of tokens strings to partially support the endpoint.
    async fn tokenize(&self, text: &str) -> Result<Vec<(usize, String)>> {
        api_tokenize(self.api_key.as_ref().unwrap(), self.id.as_str(), text)
            .await?
            .into_iter()
            .map(|t| Ok((t, String::from(""))))
            .collect()
    }

    async fn generate(
        &self,
        prompt: &str,
        max_tokens: Option<i32>,
        temperature: f32,
        n: usize,
        stop: &Vec<String>,
        frequency_penalty: Option<f32>,
        presence_penalty: Option<f32>,
        top_p: Option<f32>,
        _top_logprobs: Option<i32>,
        _extras: Option<Value>,
        event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<LLMGeneration> {
        assert!(self.api_key.is_some());

        if n > 1 {
            return Err(anyhow!(
                "TextSynth only supports generating one sample at a time."
            ))?;
        }

        let c: Completion = match event_sender {
            Some(es) => {
                match self
                    .streamed_completion(
                        prompt,
                        max_tokens,
                        temperature,
                        stop,
                        None,
                        top_p,
                        frequency_penalty,
                        presence_penalty,
                        None,
                        None,
                        es,
                    )
                    .await
                {
                    Ok(c) => c,
                    Err(error) => {
                        return Err(anyhow!("Error streaming from TextSynth: {:?}", error))?;
                    }
                }
            }
            None => {
                self.completion(
                    prompt,
                    max_tokens,
                    temperature,
                    stop,
                    None,
                    top_p,
                    frequency_penalty,
                    presence_penalty,
                    None,
                    None,
                )
                .await?
            }
        };

        Ok(LLMGeneration {
            created: utils::now(),
            provider: ProviderID::TextSynth.to_string(),
            model: self.id.clone(),
            completions: vec![Tokens {
                text: c.text.clone(),
                tokens: Some(vec![]),
                logprobs: Some(vec![]),
                top_logprobs: Some(vec![]),
            }],
            prompt: Tokens {
                text: prompt.to_string(),
                tokens: None,
                logprobs: None,
                top_logprobs: None,
            },
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
        _extras: Option<Value>,
        event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<LLMChatGeneration> {
        assert!(self.api_key.is_some());

        if n > 1 {
            return Err(anyhow!(
                "TextSynth only supports generating one sample at a time."
            ))?;
        }
        if functions.len() > 0 || function_call.is_some() {
            return Err(anyhow!("TextSynth does not support chat functions."));
        }

        let g = match event_sender {
            Some(es) => {
                match self
                    .streamed_chat(
                        messages,
                        max_tokens,
                        temperature,
                        stop,
                        None,
                        top_p,
                        frequency_penalty,
                        presence_penalty,
                        None,
                        None,
                        es,
                    )
                    .await
                {
                    Ok(c) => c,
                    Err(error) => {
                        return Err(anyhow!("Error streaming from TextSynth: {:?}", error))?;
                    }
                }
            }
            None => {
                self.chat(
                    messages,
                    max_tokens,
                    temperature,
                    stop,
                    None,
                    top_p,
                    frequency_penalty,
                    presence_penalty,
                    None,
                    None,
                )
                .await?
            }
        };

        Ok(g)
    }
}

pub struct TextSynthEmbedder {
    id: String,
}

impl TextSynthEmbedder {
    pub fn new(id: String) -> Self {
        TextSynthEmbedder { id }
    }
}

#[async_trait]
impl Embedder for TextSynthEmbedder {
    fn id(&self) -> String {
        self.id.clone()
    }

    async fn initialize(&mut self, _credentials: Credentials) -> Result<()> {
        Err(anyhow!("Embedders not available for provider `textsynth`"))
    }

    fn context_size(&self) -> usize {
        2048
    }
    fn embedding_size(&self) -> usize {
        2048
    }

    async fn encode(&self, _text: &str) -> Result<Vec<usize>> {
        Err(anyhow!(
            "Encode/Decode not implemented for provider `textsynth`"
        ))
    }

    async fn decode(&self, _tokens: Vec<usize>) -> Result<String> {
        Err(anyhow!(
            "Encode/Decode not implemented for provider `textsynth`"
        ))
    }

    async fn embed(&self, _text: Vec<&str>, _extras: Option<Value>) -> Result<Vec<EmbedderVector>> {
        Err(anyhow!("Embeddings not available for provider `textsynth`"))
    }
}

pub struct TextSynthProvider {}

impl TextSynthProvider {
    pub fn new() -> Self {
        TextSynthProvider {}
    }
}

#[async_trait]
impl Provider for TextSynthProvider {
    fn id(&self) -> ProviderID {
        ProviderID::TextSynth
    }

    fn setup(&self) -> Result<()> {
        utils::info("Setting up TextSynth:");
        utils::info("");
        utils::info(
            "To use TextSynth's models, you must set the environment variable `TEXTSYNTH_API_KEY`.",
        );
        utils::info("Your API key can be found at `https://textsynth.com/settings.html`.");
        utils::info("");
        utils::info("Once ready you can check your setup with `dust provider test textsynth`");

        Ok(())
    }

    async fn test(&self) -> Result<()> {
        if !utils::confirm(
            "You are about to make a request for 1 token to `mistral_7B` on the TextSynth API.",
        )? {
            Err(anyhow!("User aborted TextSynth test."))?;
        }

        let mut llm = self.llm(String::from("mistral_7B"));
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

        // let t = llm.encode("Hello 😊").await?;
        // let d = llm.decode(t).await?;
        // assert!(d == "Hello 😊");

        // let mut embedder = self.embedder(String::from("large"));
        // embedder.initialize(Credentials::new()).await?;

        // let _v = embedder.embed("Hello 😊", None).await?;
        // println!("EMBEDDING SIZE: {}", v.vector.len());

        utils::done("Test successfully completed! TextSynth is ready to use.");

        Ok(())
    }

    fn llm(&self, id: String) -> Box<dyn LLM + Sync + Send> {
        Box::new(TextSynthLLM::new(id))
    }

    fn embedder(&self, id: String) -> Box<dyn Embedder + Sync + Send> {
        Box::new(TextSynthEmbedder::new(id))
    }
}
