use crate::providers::embedder::{Embedder, EmbedderVector};
use crate::providers::llm::{ChatMessage, LLMChatGeneration, LLMGeneration, Tokens, LLM};
use crate::providers::provider::{ModelError, Provider, ProviderID};
use crate::run::Credentials;
use crate::utils;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use hyper::{body::Buf, Body, Client, Method, Request, Uri};
use hyper_tls::HttpsConnector;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fmt::{self, Display};
use std::io::prelude::*;
use tokio::sync::mpsc::UnboundedSender;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum StopReason {
    StopSequence,
    MaxTokens,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Response {
    pub completion: String,
    pub stop_reason: StopReason,
    pub stop: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ErrorDetail {
    pub loc: Vec<String>,
    pub msg: String,
    #[serde(rename = "type")]
    pub type_: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Error {
    // anthropi api errors look like this:
    // {"detail":[{"loc":["body","model"],"msg":"field required","type":"value_error.missing"}]}
    pub detail: Vec<ErrorDetail>,
}

impl Display for ErrorDetail {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{},{},{}", self.loc.join("."), self.type_, self.msg)
    }
}

impl Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let details = self
            .detail
            .iter()
            .map(|detail| detail.to_string())
            .collect::<Vec<String>>()
            .join("\t");

        write!(f, "{}", details)
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

    async fn generate(
        &self,
        prompt: &str,
        max_tokens_to_sample: i32,
        temperature: f32,
        top_p: f32,
        top_k: i32,
        stop: &Vec<String>,
    ) -> Result<Response> {
        assert!(self.api_key.is_some());

        let https = HttpsConnector::new();
        let cli = Client::builder().build::<_, hyper::Body>(https);

        // TODO: implement stream
        let req = Request::builder()
            .method(Method::POST)
            .uri(self.uri()?)
            .header("Content-Type", "application/json")
            .header("X-API-Key", self.api_key.clone().unwrap())
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
                    "top_k": top_k,
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
        top_logprobs: Option<i32>,
        _extras: Option<Value>,
        _event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<LLMGeneration> {
        assert!(self.api_key.is_some());
        assert!(n > 0);

        // anthropic only supports generating one sample at a time
        // so we loop here and make n API calls
        let mut completions: Vec<Tokens> = vec![];
        for _ in 0..n {
            let response = self
                .generate(
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
                    match top_logprobs {
                        Some(k) => k,
                        None => 0,
                    },
                    stop,
                )
                .await?;

            completions.push(Tokens {
                // Anthropic only return the text
                text: response.completion.clone(),
                tokens: None,
                logprobs: None,
                top_logprobs: None,
            });
        }

        let llm_generation = LLMGeneration {
            created: utils::now(),
            completions: completions,
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
        _messages: &Vec<ChatMessage>,
        _temperature: f32,
        _top_p: Option<f32>,
        _n: usize,
        _stop: &Vec<String>,
        _max_tokens: Option<i32>,
        _presence_penalty: Option<f32>,
        _frequency_penalty: Option<f32>,
        _extras: Option<Value>,
        _event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<LLMChatGeneration> {
        Err(anyhow!(
            "Chat capabilities are not implemented for provider `anthropic`"
        ))
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
        utils::info("Once ready you can check your setup with `dust provider test Anthropic`");

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
