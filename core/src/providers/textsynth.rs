use crate::providers::embedder::Embedder;
use crate::providers::llm::Tokens;
use crate::providers::llm::{ChatMessage, LLMChatGeneration, LLMGeneration, LLM};
use crate::providers::provider::{ModelError, ModelErrorRetryOptions, Provider, ProviderID};
use crate::run::Credentials;
use crate::utils;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use hyper::{body::Buf, Body, Client, Method, Request, Uri};
use hyper_tls::HttpsConnector;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::prelude::*;
use std::time::Duration;
use tokio::sync::mpsc::UnboundedSender;

use super::embedder::EmbedderVector;
use super::llm::ChatFunction;

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
    pub input_tokens: usize,
    pub output_tokens: usize,
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

    // fn chat_uri(&self) -> Result<Uri> {
    //     Ok(format!("https://api.textsynth.com/v1/engines/{}/chat", self.id).parse::<Uri>()?)
    // }

    async fn completion(
        &self,
        prompt: &str,
        max_tokens: Option<i32>,
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

        let https = HttpsConnector::new();
        let cli = Client::builder().build::<_, hyper::Body>(https);

        let mut body = json!({
            "prompt": prompt,
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
        let c: &[u8] = &b;

        let response = match status {
            hyper::StatusCode::OK => {
                let completion: Completion = serde_json::from_slice(c)?;
                Ok(completion)
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
        Ok(response)
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

        api_tokenize(
            self.api_key.clone().unwrap().as_str(),
            self.id.as_str(),
            text,
        )
        .await
    }

    async fn decode(&self, _tokens: Vec<usize>) -> Result<String> {
        Err(anyhow!(
            "Encode/Decode not implemented for provider `textsynth`"
        ))
    }

    async fn generate(
        &self,
        prompt: &str,
        mut max_tokens: Option<i32>,
        temperature: f32,
        _n: usize,
        stop: &Vec<String>,
        frequency_penalty: Option<f32>,
        presence_penalty: Option<f32>,
        top_p: Option<f32>,
        _top_logprobs: Option<i32>,
        _extras: Option<Value>,
        _event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<LLMGeneration> {
        assert!(self.api_key.is_some());

        if let Some(m) = max_tokens {
            if m == -1 {
                let tokens = self.encode(prompt).await?;
                max_tokens = Some((self.context_size() - tokens.len()) as i32);
            }
        }

        // println!("STOP: {:?}", stop);

        let c = self
            .completion(
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
            .await?;

        // println!("COMPLETION: {:?}", c);

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
        _messages: &Vec<ChatMessage>,
        _functions: &Vec<ChatFunction>,
        _function_call: Option<String>,
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
            "Chat capabilties are not implemented for provider `textsynth`"
        ))
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

    async fn tokenize(&self, _text: String) -> Result<Vec<(usize, String)>> {
        Err(anyhow!("Tokenize not implemented for provider `textsynth`"))
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
