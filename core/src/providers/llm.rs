use crate::project::Project;
use crate::providers::provider::{provider, with_retryable_back_off, ProviderID};
use crate::run::Credentials;
use crate::stores::store::Store;
use crate::utils;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, PartialEq, Clone, Deserialize)]
pub struct Tokens {
    pub text: String,
    pub tokens: Option<Vec<String>>,
    pub logprobs: Option<Vec<Option<f32>>>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct LLMGeneration {
    pub created: u64,
    pub provider: String,
    pub model: String,
    pub completions: Vec<Tokens>,
    pub prompt: Tokens,
}

#[async_trait]
pub trait LLM {
    fn id(&self) -> String;

    async fn initialize(&mut self, credentials: Credentials) -> Result<()>;

    async fn generate(
        &self,
        prompt: &str,
        max_tokens: Option<i32>,
        temperature: f32,
        n: usize,
        stop: &Vec<String>,
    ) -> Result<LLMGeneration>;
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
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

    pub fn hash(&self) -> &str {
        &self.hash
    }

    pub async fn execute(&self, credentials: Credentials) -> Result<LLMGeneration> {
        let mut llm = provider(self.provider_id).llm(self.model_id.clone());
        llm.initialize(credentials).await?;

        match with_retryable_back_off(
            || {
                llm.generate(
                    self.prompt.as_str(),
                    self.max_tokens,
                    self.temperature,
                    self.n,
                    &self.stop,
                )
            },
            |err_msg, sleep, attempts| {
                utils::info(&format!(
                    "Retry querying `{}:{}`: attempts={} sleep={}ms err_msg={}",
                    self.provider_id.to_string(),
                    self.model_id,
                    attempts,
                    sleep.as_millis(),
                    err_msg,
                ));
            },
        )
        .await
        {
            Ok(c) => {
                utils::done(&format!(
                    "Success querying `{}:{}`: \
                     prompt_length={} max_tokens={} temperature={} \
                     prompt_tokens={} completion_tokens={}",
                    self.provider_id.to_string(),
                    self.model_id,
                    self.prompt.len(),
                    self.max_tokens.unwrap_or(0),
                    self.temperature,
                    match c.prompt.logprobs.as_ref() {
                        None => 0,
                        Some(logprobs) => logprobs.len(),
                    },
                    c.completions
                        .iter()
                        .map(|c| c.logprobs.as_ref().unwrap().len().to_string())
                        .collect::<Vec<_>>()
                        .join(","),
                ));
                Ok(c)
            }
            Err(e) => Err(anyhow!(
                "Error querying `{}:{}`: error={}",
                self.provider_id.to_string(),
                self.model_id,
                e.to_string(),
            )),
        }
    }

    pub async fn execute_with_cache(
        &self,
        credentials: Credentials,
        project: Project,
        store: Box<dyn Store + Send + Sync>,
        use_cache: bool,
    ) -> Result<LLMGeneration> {
        let generation = {
            match use_cache {
                false => None,
                true => {
                    let mut generations = store.llm_cache_get(&project, self).await?;
                    match generations.len() {
                        0 => None,
                        _ => Some(generations.remove(0)),
                    }
                }
            }
        };

        match generation {
            Some(generation) => Ok(generation),
            None => {
                let generation = self.execute(credentials).await?;
                store.llm_cache_store(&project, self, &generation).await?;
                Ok(generation)
            }
        }
    }
}
