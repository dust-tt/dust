use crate::providers::embedder::Embedder;
use crate::providers::llm::Tokens;
use crate::providers::llm::{ChatMessage, LLMChatGeneration, LLMGeneration, LLM};
use crate::providers::provider::{ModelError, ModelErrorRetryOptions, Provider, ProviderID};
use crate::run::Credentials;
use crate::utils;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use hyper::body::Buf;
use hyper::Uri;
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::prelude::*;
use std::time::Duration;
use tokio::sync::mpsc::UnboundedSender;

use super::embedder::EmbedderVector;
use super::llm::ChatFunction;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TokenizeResponse {
    pub tokens: Vec<usize>,
    pub token_strings: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DetokenizeResponse {
    pub text: String,
}

async fn api_encode(api_key: &str, text: &str) -> Result<Vec<usize>> {
    let res = reqwest::Client::new()
        .post("https://api.cohere.ai/tokenize")
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&json!({
            "text": text,
        }))
        .send()
        .await?;
    let status = res.status();
    let body = res.bytes().await?;

    let mut b: Vec<u8> = vec![];
    body.reader().read_to_end(&mut b)?;
    let c: &[u8] = &b;

    let r = match status {
        StatusCode::OK => {
            let r: TokenizeResponse = serde_json::from_slice(c)?;
            Ok(r)
        }
        StatusCode::TOO_MANY_REQUESTS => {
            let error: Error = serde_json::from_slice(c).unwrap_or(Error {
                message: "Too many requests".to_string(),
            });
            Err(ModelError {
                message: format!("CohereAPIError: {}", error.message),
                retryable: Some(ModelErrorRetryOptions {
                    sleep: Duration::from_millis(2000),
                    factor: 2,
                    retries: 8,
                }),
            })
        }
        _ => {
            let error: Error = serde_json::from_slice(c)?;
            Err(ModelError {
                message: format!("CohereAPIError: {}", error.message),
                retryable: None,
            })
        }
    }?;
    Ok(r.tokens)
}

async fn api_decode(api_key: &str, tokens: Vec<usize>) -> Result<String> {
    let res = reqwest::Client::new()
        .post("https://api.cohere.ai/detokenize")
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&json!({
            "tokens": tokens,
        }))
        .send()
        .await?;

    let status = res.status();
    let body = res.bytes().await?;

    let mut b: Vec<u8> = vec![];
    body.reader().read_to_end(&mut b)?;
    let c: &[u8] = &b;

    let r = match status {
        StatusCode::OK => {
            let r: DetokenizeResponse = serde_json::from_slice(c)?;
            Ok(r)
        }
        StatusCode::TOO_MANY_REQUESTS => {
            let error: Error = serde_json::from_slice(c).unwrap_or(Error {
                message: "Too many requests".to_string(),
            });
            Err(ModelError {
                message: format!("CohereAPIError: {}", error.message),
                retryable: Some(ModelErrorRetryOptions {
                    sleep: Duration::from_millis(2000),
                    factor: 2,
                    retries: 8,
                }),
            })
        }
        _ => {
            let error: Error = serde_json::from_slice(c)?;
            Err(ModelError {
                message: format!("CohereAPIError: {}", error.message),
                retryable: None,
            })
        }
    }?;
    Ok(r.text)
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TokenLikelihood {
    pub token: String,
    pub likelihood: Option<f32>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Generation {
    pub text: String,
    pub likelihood: Option<f32>,
    pub token_likelihoods: Option<Vec<TokenLikelihood>>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Response {
    pub id: String,
    pub generations: Vec<Generation>,
    pub prompt: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Error {
    pub message: String,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub enum ReturnLikelihoods {
    NONE,
    GENERATION,
    ALL,
}

pub struct CohereLLM {
    id: String,
    api_key: Option<String>,
}

impl CohereLLM {
    pub fn new(id: String) -> Self {
        CohereLLM { id, api_key: None }
    }

    fn uri(&self) -> Result<Uri> {
        Ok(format!("https://api.cohere.ai/generate",).parse::<Uri>()?)
    }

    async fn generate(
        &self,
        prompt: &str,
        max_tokens: Option<i32>,
        temperature: f32,
        num_generations: usize,
        return_likelihoods: ReturnLikelihoods,
        stop: &Vec<String>,
        frequency_penalty: f32,
        presence_penalty: f32,
        p: f32,
    ) -> Result<Response> {
        assert!(self.api_key.is_some());

        let res = reqwest::Client::new()
            .post(self.uri()?.to_string())
            .header("Content-Type", "application/json")
            .header("Cohere-Version", "2022-12-06")
            .header(
                "Authorization",
                format!("Bearer {}", self.api_key.clone().unwrap()),
            )
            .json(&json!({
                "model": self.id.clone(),
                "prompt": prompt,
                "max_tokens": max_tokens,
                "temperature": temperature,
                "num_generations": num_generations,
                "return_likelihoods": return_likelihoods,
                "stop_sequences": match stop.len() {
                    0 => None,
                    _ => Some(stop),
                },
                "frequency_penalty": frequency_penalty,
                "presence_penalty": presence_penalty,
                "p": p,
            }))
            .send()
            .await?;

        let status = res.status();
        let body = res.bytes().await?;
        let mut b: Vec<u8> = vec![];
        body.reader().read_to_end(&mut b)?;
        let c: &[u8] = &b;

        let response = match status {
            StatusCode::OK => {
                let response: Response = serde_json::from_slice(c)?;
                Ok(response)
            }
            StatusCode::TOO_MANY_REQUESTS => {
                let error: Error = serde_json::from_slice(c).unwrap_or(Error {
                    message: "Too many requests".to_string(),
                });
                Err(ModelError {
                    message: format!("CohereAPIError: {}", error.message),
                    retryable: Some(ModelErrorRetryOptions {
                        sleep: Duration::from_millis(2000),
                        factor: 2,
                        retries: 8,
                    }),
                })
            }
            _ => {
                let error: Error = serde_json::from_slice(c)?;
                Err(ModelError {
                    message: format!("CohereAPIError: {}", error.message),
                    retryable: None,
                })
            }
        }?;
        Ok(response)
    }
}

#[async_trait]
impl LLM for CohereLLM {
    fn id(&self) -> String {
        self.id.clone()
    }

    async fn initialize(&mut self, credentials: Credentials) -> Result<()> {
        match credentials.get("COHERE_API_KEY") {
            Some(api_key) => {
                self.api_key = Some(api_key.clone());
            }
            None => match tokio::task::spawn_blocking(|| std::env::var("COHERE_API_KEY")).await? {
                Ok(key) => {
                    self.api_key = Some(key);
                }
                Err(_) => Err(anyhow!(
                    "Credentials or environment variable `COHERE_API_KEY` is not set."
                ))?,
            },
        }
        Ok(())
    }

    fn context_size(&self) -> usize {
        2048
    }

    async fn encode(&self, text: &str) -> Result<Vec<usize>> {
        assert!(self.api_key.is_some());
        api_encode(self.api_key.as_ref().unwrap(), text).await
    }

    async fn decode(&self, tokens: Vec<usize>) -> Result<String> {
        assert!(self.api_key.is_some());
        api_decode(self.api_key.as_ref().unwrap(), tokens).await
    }

    // We return empty string in tokenize to partially support the endpoint.
    async fn tokenize(&self, text: &str) -> Result<Vec<(usize, String)>> {
        assert!(self.api_key.is_some());
        let tokens = api_encode(self.api_key.as_ref().unwrap(), text).await?;
        Ok(tokens
            .iter()
            .map(|t| (*t, "".to_string()))
            .collect::<Vec<_>>())
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
        _event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<LLMGeneration> {
        assert!(self.api_key.is_some());
        assert!(n > 0);

        // println!("STOP: {:?}", stop);

        let r = self
            .generate(
                prompt,
                max_tokens,
                temperature,
                n,
                ReturnLikelihoods::GENERATION,
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
            )
            .await?;

        // println!("RESPONSE: {:?}", r);

        assert!(r.generations.len() > 0);
        assert!(r.generations[0].token_likelihoods.is_some());

        Ok(LLMGeneration {
            created: utils::now(),
            provider: ProviderID::Cohere.to_string(),
            model: self.id.clone(),
            completions: r
                .generations
                .iter()
                .map(|g| {
                    let logp = g.token_likelihoods.as_ref().unwrap();

                    Tokens {
                        text: g.text.clone(),
                        tokens: Some(logp.iter().map(|l| l.token.clone()).collect()),
                        logprobs: Some(logp.iter().map(|l| l.likelihood).collect()),
                        top_logprobs: None,
                    }
                })
                .collect::<Vec<_>>(),
            prompt: Tokens {
                text: r.prompt,
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
            "Chat capabilties are not implemented for provider `cohere`"
        ))
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Embeddings {
    pub id: String,
    pub texts: Vec<String>,
    pub embeddings: Vec<Vec<f64>>,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub enum Truncate {
    NONE,
    START,
    END,
}

pub struct CohereEmbedder {
    id: String,
    api_key: Option<String>,
}

impl CohereEmbedder {
    pub fn new(id: String) -> Self {
        CohereEmbedder { id, api_key: None }
    }

    fn uri(&self) -> Result<Uri> {
        Ok(format!("https://api.cohere.ai/embed",).parse::<Uri>()?)
    }

    async fn embed(&self, text: Vec<&str>, truncate: Truncate) -> Result<Embeddings> {
        assert!(self.api_key.is_some());

        let res = reqwest::Client::new()
            .post(self.uri()?.to_string())
            .header("Content-Type", "application/json")
            .header("Cohere-Version", "2022-12-06")
            .header(
                "Authorization",
                format!("Bearer {}", self.api_key.clone().unwrap()),
            )
            .json(&json!({
                "model": self.id.clone(),
                "texts": text,
                "truncate": truncate,
            }))
            .send()
            .await?;
        let status = res.status();
        let body = res.bytes().await?;
        let mut b: Vec<u8> = vec![];
        body.reader().read_to_end(&mut b)?;
        let c: &[u8] = &b;

        let e = match status {
            StatusCode::OK => {
                let embeddings: Embeddings = serde_json::from_slice(c)?;
                Ok(embeddings)
            }
            StatusCode::TOO_MANY_REQUESTS => {
                let error: Error = serde_json::from_slice(c).unwrap_or(Error {
                    message: "Too many requests".to_string(),
                });
                Err(ModelError {
                    message: format!("CohereAPIError: {}", error.message),
                    retryable: Some(ModelErrorRetryOptions {
                        sleep: Duration::from_millis(2000),
                        factor: 2,
                        retries: 8,
                    }),
                })
            }
            _ => {
                let error: Error = serde_json::from_slice(c)?;
                Err(ModelError {
                    message: format!("CohereAPIError: {}", error.message),
                    retryable: None,
                })
            }
        }?;
        Ok(e)
    }
}

#[async_trait]
impl Embedder for CohereEmbedder {
    fn id(&self) -> String {
        self.id.clone()
    }

    async fn initialize(&mut self, credentials: Credentials) -> Result<()> {
        if !(vec!["small", "large"].contains(&self.id.as_str())) {
            return Err(anyhow!(
                "Unexpected embedder model id (`{}`) for provider `cohere`, \
                  expected: `small` or `large`",
                self.id
            ));
        }

        match credentials.get("COHERE_API_KEY") {
            Some(api_key) => {
                self.api_key = Some(api_key.clone());
            }
            None => match tokio::task::spawn_blocking(|| std::env::var("COHERE_API_KEY")).await? {
                Ok(key) => {
                    self.api_key = Some(key);
                }
                Err(_) => Err(anyhow!(
                    "Credentials or environment variable `COHERE_API_KEY` is not set."
                ))?,
            },
        }
        Ok(())
    }

    fn context_size(&self) -> usize {
        2048
    }

    fn embedding_size(&self) -> usize {
        match self.id.as_str() {
            "large" => 4096,
            "small" => 1024,
            _ => unimplemented!(),
        }
    }

    async fn encode(&self, text: &str) -> Result<Vec<usize>> {
        assert!(self.api_key.is_some());
        api_encode(self.api_key.as_ref().unwrap(), text).await
    }

    async fn decode(&self, tokens: Vec<usize>) -> Result<String> {
        assert!(self.api_key.is_some());
        api_decode(self.api_key.as_ref().unwrap(), tokens).await
    }

    async fn embed(&self, text: Vec<&str>, _extras: Option<Value>) -> Result<Vec<EmbedderVector>> {
        assert!(self.api_key.is_some());

        let e = self.embed(text, Truncate::NONE).await?;

        assert!(e.embeddings.len() > 0);
        // println!("EMBEDDING: {:?}", e);

        Ok(e.embeddings
            .into_iter()
            .map(|e| EmbedderVector {
                created: utils::now(),
                provider: ProviderID::Cohere.to_string(),
                model: self.id.clone(),
                vector: e,
            })
            .collect())
    }
}

pub struct CohereProvider {}

impl CohereProvider {
    pub fn new() -> Self {
        CohereProvider {}
    }
}

#[async_trait]
impl Provider for CohereProvider {
    fn id(&self) -> ProviderID {
        ProviderID::Cohere
    }

    fn setup(&self) -> Result<()> {
        utils::info("Setting up Cohere:");
        utils::info("");
        utils::info(
            "To use Cohere's models, you must set the environment variable `COHERE_API_KEY`.",
        );
        utils::info("Your API key can be found at `https://os.cohere.ai`.");
        utils::info("");
        utils::info("Once ready you can check your setup with `dust provider test cohere`");

        Ok(())
    }

    async fn test(&self) -> Result<()> {
        if !utils::confirm(
            "You are about to make a request for 1 token to `medium` on the Cohere API.",
        )? {
            Err(anyhow!("User aborted Cohere test."))?;
        }

        let mut llm = self.llm(String::from("medium"));
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

        let t = llm.encode("Hello 😊").await?;
        let d = llm.decode(t).await?;
        assert!(d == "Hello 😊");

        // let mut embedder = self.embedder(String::from("large"));
        // embedder.initialize(Credentials::new()).await?;

        // let _v = embedder.embed("Hello 😊", None).await?;
        // println!("EMBEDDING SIZE: {}", v.vector.len());

        utils::done("Test successfully completed! Cohere is ready to use.");

        Ok(())
    }

    fn llm(&self, id: String) -> Box<dyn LLM + Sync + Send> {
        Box::new(CohereLLM::new(id))
    }

    fn embedder(&self, id: String) -> Box<dyn Embedder + Sync + Send> {
        Box::new(CohereEmbedder::new(id))
    }
}
