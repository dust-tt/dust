use crate::providers::embedder::{Embedder, EmbedderVector};
use crate::providers::llm::{
    ChatMessage, ChatMessageRole, LLMChatGeneration, LLMGeneration, Tokens, LLM,
};
use crate::providers::provider::{ModelError, Provider, ProviderID};
use crate::run::Credentials;
use crate::utils;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use eventsource_client as es;
use eventsource_client::Client as ESClient;
use futures::TryStreamExt;
use hyper::{body::Buf, Body, Client, Method, Request, Uri};
use hyper_tls::HttpsConnector;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fmt::{self, Display};
use std::io::prelude::*;
use std::time::Duration;
use tokio::sync::mpsc::UnboundedSender;

use super::llm::ChatFunction;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum StopReason {
    StopSequence,
    MaxTokens,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Response {
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
    fn uri(&self) -> Result<Uri> {
        Ok("https://api.anthropic.com/v1/complete"
            .to_string()
            .parse::<Uri>()?)
    }

    fn chat_prompt(&self, messages: &Vec<ChatMessage>) -> String {
        let mut prompt = messages
            .iter()
            .map(|cm| -> String {
                format!(
                    "\n\n{}: {}",
                    match cm.role {
                        ChatMessageRole::System => "Human",
                        ChatMessageRole::Assistant => "Assistant",
                        ChatMessageRole::User => "Human",
                        ChatMessageRole::Function => "Human",
                    },
                    cm.content.as_ref().unwrap_or(&String::from("")).clone()
                )
            })
            .collect::<Vec<_>>()
            .join("");

        prompt = format!("{}\n\nAssistant:", prompt);

        return prompt;
    }

    async fn chat_completion(
        &self,
        messages: &Vec<ChatMessage>,
        temperature: f32,
        top_p: f32,
        stop: &Vec<String>,
        max_tokens: Option<i32>,
    ) -> Result<LLMChatGeneration> {
        assert!(self.api_key.is_some());

        let prompt = self.chat_prompt(messages);
        let mut stop_tokens = stop.clone();
        stop_tokens.push(String::from("\n\nHuman:"));
        stop_tokens.push(String::from("\n\nAssistant:"));

        let response = self
            .completion(
                self.api_key.clone().unwrap(),
                &prompt,
                match max_tokens {
                    Some(m) => m,
                    None => 256,
                },
                temperature,
                top_p,
                None,
                stop_tokens.as_ref(),
            )
            .await?;

        return Ok(LLMChatGeneration {
            created: utils::now(),
            provider: ProviderID::Anthropic.to_string(),
            model: self.id.clone(),
            completions: vec![ChatMessage {
                role: ChatMessageRole::Assistant,
                content: Some(response.completion.clone()),
                name: None,
                function_call: None,
            }],
        });
    }

    pub async fn streamed_chat_completion(
        &self,
        messages: &Vec<ChatMessage>,
        temperature: f32,
        top_p: f32,
        stop: &Vec<String>,
        max_tokens: Option<i32>,
        event_sender: UnboundedSender<Value>,
    ) -> Result<LLMChatGeneration> {
        let prompt = self.chat_prompt(messages);
        let mut stop_tokens = stop.clone();
        stop_tokens.push(String::from("\n\nHuman:"));
        stop_tokens.push(String::from("\n\nAssistant:"));

        let response = self
            .streamed_completion(
                self.api_key.clone().unwrap(),
                prompt.as_str(),
                match max_tokens {
                    Some(m) => m,
                    None => 256,
                },
                temperature,
                top_p,
                None,
                &stop_tokens,
                event_sender,
            )
            .await;

        return Ok(LLMChatGeneration {
            created: utils::now(),
            provider: ProviderID::Anthropic.to_string(),
            model: self.id.clone(),
            completions: vec![ChatMessage {
                role: ChatMessageRole::Assistant,
                content: Some(response?.completion.clone()),
                name: None,
                function_call: None,
            }],
        });
    }

    pub async fn streamed_completion(
        &self,
        api_key: String,
        prompt: &str,
        max_tokens_to_sample: i32,
        temperature: f32,
        top_p: f32,
        top_k: Option<i32>,
        stop: &Vec<String>,
        event_sender: UnboundedSender<Value>,
    ) -> Result<Response> {
        let url = self.uri()?.to_string();

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
        builder = match builder.header("X-API-Key", api_key.as_str()) {
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
            .build();

        let mut stream = client.stream();

        let mut final_response: Option<Response> = None;
        let mut streamed_length = 0;
        'stream: loop {
            match stream.try_next().await {
                Ok(stream_next) => match stream_next {
                    Some(es::SSE::Comment(comment)) => {
                        println!("UNEXPECTED COMMENT {}", comment);
                    }
                    Some(es::SSE::Event(event)) => match event.data.as_str() {
                        "[DONE]" => {
                            println!("DONE");
                            break 'stream;
                        }
                        _ => {
                            let response: Response = match serde_json::from_str(event.data.as_str())
                            {
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
                            let completion_to_stream = &response.completion[streamed_length..];

                            if completion_to_stream.len() > 0 {
                                let _ = event_sender.send(json!({
                                    "type":"tokens",
                                    "content": {
                                        "text":completion_to_stream
                                    }

                                }));
                            }
                            streamed_length = response.completion.len();
                            final_response = Some(response.clone());
                        }
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
        api_key: String,
        prompt: &str,
        max_tokens_to_sample: i32,
        temperature: f32,
        top_p: f32,
        top_k: Option<i32>,
        stop: &Vec<String>,
    ) -> Result<Response> {
        let https = HttpsConnector::new();
        let cli = Client::builder().build::<_, hyper::Body>(https);

        // TODO: implement stream
        let req = Request::builder()
            .method(Method::POST)
            .uri(self.uri()?)
            .header("Content-Type", "application/json")
            .header("X-API-Key", api_key)
            .body(Body::from(
                json!({
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
                })
                .to_string(),
            ))?;

        let res = cli.request(req).await?;

        let status = res.status();

        let body = hyper::body::aggregate(res).await?;
        let mut b: Vec<u8> = vec![];
        body.reader().read_to_end(&mut b)?;
        let c: &[u8] = &b;
        let response = match status {
            hyper::StatusCode::OK => {
                let response: Response = serde_json::from_slice(c)?;
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
        8000
    }

    async fn generate(
        &self,
        prompt: &str,
        max_tokens: Option<i32>,
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

        let c: Vec<Tokens> = match event_sender {
            Some(es) => {
                let mut completions: Vec<Tokens> = vec![];
                let response = match self
                    .streamed_completion(
                        self.api_key.clone().unwrap(),
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
                        self.api_key.clone().unwrap(),
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

    async fn encode(&self, _text: &str) -> Result<Vec<usize>> {
        Err(anyhow!(
            "Encode/Decode not implemented for provider `anthropic`"
        ))
    }

    async fn decode(&self, _tokens: Vec<usize>) -> Result<String> {
        Err(anyhow!(
            "Encode/Decode not implemented for provider `anthropic`"
        ))
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
        _presence_penalty: Option<f32>,
        _frequency_penalty: Option<f32>,
        _extras: Option<Value>,
        event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<LLMChatGeneration> {
        if n > 1 {
            return Err(anyhow!(
                "Anthropic only supports generating one sample at a time."
            ))?;
        }
        if functions.len() > 0 || function_call.is_some() {
            return Err(anyhow!("Anthropic does not support chat functions."));
        }

        match event_sender {
            Some(es) => {
                return self
                    .streamed_chat_completion(
                        messages,
                        temperature,
                        match top_p {
                            Some(p) => p,
                            None => 1.0,
                        },
                        stop,
                        max_tokens,
                        es,
                    )
                    .await;
            }
            None => {
                return self
                    .chat_completion(
                        messages,
                        temperature,
                        match top_p {
                            Some(p) => p,
                            None => 1.0,
                        },
                        stop,
                        max_tokens,
                    )
                    .await;
            }
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
        8000
    }
    fn embedding_size(&self) -> usize {
        8000
    }

    async fn encode(&self, _text: &str) -> Result<Vec<usize>> {
        Err(anyhow!(
            "Encode/Decode not implemented for provider `anthropic`"
        ))
    }

    async fn decode(&self, _tokens: Vec<usize>) -> Result<String> {
        Err(anyhow!(
            "Encode/Decode not implemented for provider `anthropic`"
        ))
    }

    async fn embed(&self, _text: &str, _extras: Option<Value>) -> Result<EmbedderVector> {
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
            "You are about to make a request for 1 token to `claude-instant-v1` on the Anthropic API.",
        )? {
            Err(anyhow!("User aborted Anthropic test."))?;
        }

        let mut llm = self.llm(String::from("claude-instant-v1"));
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
