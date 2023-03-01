use crate::project::Project;
use crate::providers::provider::{provider, with_retryable_back_off, ProviderID};
use crate::run::Credentials;
use crate::stores::store::Store;
use crate::utils;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use tokio::sync::mpsc::UnboundedSender;

#[derive(Debug, Serialize, PartialEq, Clone, Deserialize)]
pub struct Tokens {
    pub text: String,
    pub tokens: Option<Vec<String>>,
    pub logprobs: Option<Vec<Option<f32>>>,
    pub top_logprobs: Option<Vec<Option<HashMap<String, f32>>>>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct LLMGeneration {
    pub created: u64,
    pub provider: String,
    pub model: String,
    pub completions: Vec<Tokens>,
    pub prompt: Tokens,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct LLMChatGeneration {
    pub created: u64,
    pub provider: String,
    pub model: String,
    pub message: ChatMessage,
}

#[async_trait]
pub trait LLM {
    fn id(&self) -> String;

    async fn initialize(&mut self, credentials: Credentials) -> Result<()>;

    fn context_size(&self) -> usize;

    async fn encode(&self, text: &str) -> Result<Vec<usize>>;
    async fn decode(&self, tokens: Vec<usize>) -> Result<String>;

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
        top_logprobs: Option<i32>,
        extras: Option<Value>,
        event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<LLMGeneration>;

    async fn chat(
        &self,
        messages: Vec<ChatMessage>,
        temperature: f32,
        top_p: Option<f32>,
        n: usize,
        stop: &Vec<String>,
        presence_penalty: Option<f32>,
        frequency_penalty: Option<f32>,
        extras: Option<Value>,
        event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<LLMChatGeneration>;
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
    frequency_penalty: Option<f32>,
    presence_penalty: Option<f32>,
    top_p: Option<f32>,
    top_logprobs: Option<i32>,
    extras: Option<Value>,
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
        frequency_penalty: Option<f32>,
        presence_penalty: Option<f32>,
        top_p: Option<f32>,
        top_logprobs: Option<i32>,
        extras: Option<Value>,
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
        if !frequency_penalty.is_none() {
            hasher.update(frequency_penalty.unwrap().to_string().as_bytes());
        }
        if !presence_penalty.is_none() {
            hasher.update(presence_penalty.unwrap().to_string().as_bytes());
        }
        if !top_p.is_none() {
            hasher.update(top_p.unwrap().to_string().as_bytes());
        }
        if !top_logprobs.is_none() {
            hasher.update(top_logprobs.unwrap().to_string().as_bytes());
        }
        if !extras.is_none() {
            hasher.update(extras.clone().unwrap().to_string().as_bytes());
        }

        Self {
            hash: format!("{}", hasher.finalize().to_hex()),
            provider_id,
            model_id: String::from(model_id),
            prompt: String::from(prompt),
            max_tokens,
            temperature,
            n,
            stop: stop.clone(),
            frequency_penalty,
            presence_penalty,
            top_p,
            top_logprobs,
            extras,
        }
    }

    pub fn hash(&self) -> &str {
        &self.hash
    }

    pub async fn execute(
        &self,
        credentials: Credentials,
        event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<LLMGeneration> {
        let mut llm = provider(self.provider_id).llm(self.model_id.clone());
        llm.initialize(credentials).await?;

        let out = with_retryable_back_off(
            || {
                llm.generate(
                    self.prompt.as_str(),
                    self.max_tokens,
                    self.temperature,
                    self.n,
                    &self.stop,
                    self.frequency_penalty,
                    self.presence_penalty,
                    self.top_p,
                    self.top_logprobs,
                    self.extras.clone(),
                    event_sender.clone(),
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
        .await;

        match out {
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
                let generation = self.execute(credentials, None).await?;
                store.llm_cache_store(&project, self, &generation).await?;
                Ok(generation)
            }
        }
    }
}

// TODO(spolu) LLMChatRequest
#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct LLMChatRequest {
    hash: String,
    provider_id: ProviderID,
    model_id: String,
    messages: Vec<ChatMessage>,
    temperature: f32,
    top_p: Option<f32>,
    n: usize,
    stop: Vec<String>,
    presence_penalty: Option<f32>,
    frequency_penalty: Option<f32>,
    extras: Option<Value>,
}

impl LLMChatRequest {
    pub fn new(
        provider_id: ProviderID,
        model_id: &str,
        messages: Vec<ChatMessage>,
        temperature: f32,
        top_p: Option<f32>,
        n: usize,
        stop: &Vec<String>,
        presence_penalty: Option<f32>,
        frequency_penalty: Option<f32>,
        extras: Option<Value>,
    ) -> Self {
        let mut hasher = blake3::Hasher::new();
        hasher.update(provider_id.to_string().as_bytes());
        hasher.update(model_id.as_bytes());
        messages.iter().for_each(|m| {
            hasher.update(m.role.as_bytes());
            hasher.update(m.content.as_bytes());
        });
        hasher.update(temperature.to_string().as_bytes());
        if !top_p.is_none() {
            hasher.update(top_p.unwrap().to_string().as_bytes());
        }
        hasher.update(n.to_string().as_bytes());
        stop.iter().for_each(|s| {
            hasher.update(s.as_bytes());
        });
        if !presence_penalty.is_none() {
            hasher.update(presence_penalty.unwrap().to_string().as_bytes());
        }
        if !frequency_penalty.is_none() {
            hasher.update(frequency_penalty.unwrap().to_string().as_bytes());
        }
        if !extras.is_none() {
            hasher.update(extras.clone().unwrap().to_string().as_bytes());
        }

        Self {
            hash: format!("{}", hasher.finalize().to_hex()),
            provider_id,
            model_id: String::from(model_id),
            messages: messages.clone(),
            temperature,
            top_p,
            n,
            stop: stop.clone(),
            presence_penalty,
            frequency_penalty,
            extras,
        }
    }

    pub fn hash(&self) -> &str {
        &self.hash
    }

    pub async fn execute(
        &self,
        credentials: Credentials,
        event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<LLMGeneration> {
        let mut llm = provider(self.provider_id).llm(self.model_id.clone());
        llm.initialize(credentials).await?;

        let out = with_retryable_back_off(
            || {
                llm.generate(
                    self.prompt.as_str(),
                    self.max_tokens,
                    self.temperature,
                    self.n,
                    &self.stop,
                    self.frequency_penalty,
                    self.presence_penalty,
                    self.top_p,
                    self.top_logprobs,
                    self.extras.clone(),
                    event_sender.clone(),
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
        .await;

        match out {
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
                let generation = self.execute(credentials, None).await?;
                store.llm_cache_store(&project, self, &generation).await?;
                Ok(generation)
            }
        }
    }
}
