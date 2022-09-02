use crate::providers::provider::{provider, ProviderID};
use crate::utils;
use anyhow::Result;
use async_trait::async_trait;
use serde::Serialize;
use std::sync::Arc;

#[derive(Debug, Serialize, PartialEq, Clone)]
pub struct Tokens {
    pub text: String,
    pub tokens: Option<Vec<String>>,
    pub logprobs: Option<Vec<Option<f32>>>,
}

#[derive(Debug, Serialize)]
pub struct LLMGeneration {
    pub provider: String,
    pub model: String,
    pub completions: Vec<Tokens>,
    pub prompt: Tokens,
}

#[async_trait]
pub trait LLM {
    fn id(&self) -> String;

    async fn initialize(&mut self) -> Result<()>;

    async fn generate(
        &self,
        prompt: &str,
        max_tokens: Option<i32>,
        temperature: f32,
        n: usize,
        stop: &Vec<String>,
    ) -> Result<LLMGeneration>;
}

#[derive(Debug, Serialize)]
pub struct LLMRequest {
    hash: String,
    provider_id: ProviderID,
    model_id: String,
    prompt: String,
    max_tokens: Option<i32>,
    temperature: f32,
    n: usize,
    stop: Vec<String>,
}

impl LLMRequest {
    pub fn new(
        provider_id: ProviderID,
        model_id: &str,
        prompt: &str,
        max_tokens: Option<i32>,
        temperature: f32,
        n: usize,
        stop: &Vec<String>,
    ) -> Self {
        let mut hasher = blake3::Hasher::new();
        hasher.update(provider_id.to_string().as_bytes());
        hasher.update(model_id.as_bytes());
        hasher.update(prompt.as_bytes());
        if !max_tokens.is_none() {
            hasher.update(max_tokens.unwrap().to_string().as_bytes());
        }
        hasher.update(temperature.to_string().as_bytes());
        hasher.update(n.to_string().as_bytes());
        stop.iter().for_each(|s| {
            hasher.update(s.as_bytes());
        });

        Self {
            hash: format!("{}", hasher.finalize().to_hex()),
            provider_id,
            model_id: String::from(model_id),
            prompt: String::from(prompt),
            max_tokens,
            temperature,
            n,
            stop: stop.clone(),
        }
    }

    pub async fn execute(&self) -> Result<LLMGeneration> {
        let mut llm = provider(self.provider_id).llm(self.model_id.clone());
        llm.initialize().await?;
        llm.generate(
            self.prompt.as_str(),
            self.max_tokens,
            self.temperature,
            self.n,
            &self.stop,
        )
        .await
    }
}

pub struct LLMCache {
    data: HashMap<String, (LLMRequest, LLMGeneration)>,
}

impl struct LLMCache {
    pub async fn warm_up() -> Result<Self> {
        let root_path = utils::init_check().await?;
        let cache_path = root_path.join(".cache").join("llm");



        Ok(LLMCache {
            data: HashMap::new(),
        })
    }

    pub async fn flush(self) -> Result<()> {
    }

    pub fn get(&self, request: &LLMRequest) -> Option<&LLMGeneration> {
    }

    pub fn store(self, request: &LLMRequest, generation: &LLMGeneration) -> Result<()> {
    }
}
