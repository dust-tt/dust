use crate::cached_request::CachedRequest;
use crate::project::Project;
use crate::providers::provider::{provider, with_retryable_back_off, ProviderID};
use crate::run::Credentials;
use crate::stores::store::Store;
use crate::utils::ParseError;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::str::FromStr;
use tokio::sync::mpsc::UnboundedSender;
use tracing::{error, info};

use super::chat_messages::{AssistantChatMessage, ChatMessage};

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
    pub usage: Option<LLMTokenUsage>,
    pub provider_request_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
#[serde(rename_all = "lowercase")]
pub enum ChatMessageRole {
    System,
    User,
    Assistant,
    Function,
}

impl ToString for ChatMessageRole {
    fn to_string(&self) -> String {
        match self {
            ChatMessageRole::System => String::from("system"),
            ChatMessageRole::User => String::from("user"),
            ChatMessageRole::Assistant => String::from("assistant"),
            ChatMessageRole::Function => String::from("function"),
        }
    }
}

impl FromStr for ChatMessageRole {
    type Err = ParseError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "system" => Ok(ChatMessageRole::System),
            "user" => Ok(ChatMessageRole::User),
            "assistant" => Ok(ChatMessageRole::Assistant),
            "function" => Ok(ChatMessageRole::Function),
            _ => Err(ParseError::with_message("Unknown ChatMessageRole"))?,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct ChatFunctionCall {
    pub arguments: String,
    pub id: String,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct ChatFunction {
    pub name: String,
    pub description: Option<String>,
    pub parameters: Option<Value>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct LLMTokenUsage {
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct LLMChatGeneration {
    pub created: u64,
    pub provider: String,
    pub model: String,
    pub completions: Vec<AssistantChatMessage>,
    pub usage: Option<LLMTokenUsage>,
    pub provider_request_id: Option<String>,
}

#[async_trait]
pub trait LLM {
    fn id(&self) -> String;

    async fn initialize(&mut self, credentials: Credentials) -> Result<()>;

    fn context_size(&self) -> usize;

    async fn encode(&self, text: &str) -> Result<Vec<usize>>;
    async fn decode(&self, tokens: Vec<usize>) -> Result<String>;
    async fn tokenize(&self, texts: Vec<String>) -> Result<Vec<Vec<(usize, String)>>>;

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
        extras: Option<Value>,
        event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<LLMChatGeneration>;
}

impl CachedRequest for LLMRequest {
    /// The version of the cache. This should be incremented whenever the inputs or
    /// outputs of the request are changed, to ensure that the cached data is invalidated.
    const VERSION: i32 = 1;

    const REQUEST_TYPE: &'static str = "llm";
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
        hasher.update(LLMRequest::version().to_string().as_bytes());

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
        run_id: String,
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
                info!(
                    provider_id = self.provider_id.to_string(),
                    model_id = self.model_id,
                    attempts = attempts,
                    sleep = sleep.as_millis(),
                    err_msg = err_msg,
                    run_id = run_id,
                    "Retry querying"
                );
            },
            |err| {
                error!(
                    provider_id = self.provider_id.to_string(),
                    model_id = self.model_id,
                    err_msg = err.message,
                    request_id = err.request_id.as_deref().unwrap_or(""),
                    run_id = run_id,
                    "LLMRequest ModelError",
                );
            },
        )
        .await;

        match out {
            Ok(c) => {
                info!(
                    provider_id = self.provider_id.to_string(),
                    model_id = self.model_id,
                    prompt_length = self.prompt.len(),
                    max_tokens = self.max_tokens.unwrap_or(0),
                    temperature = self.temperature,
                    prompt_tokens = match c.prompt.logprobs.as_ref() {
                        None => 0,
                        Some(logprobs) => logprobs.len(),
                    },
                    request_id = c.provider_request_id.as_deref().unwrap_or(""),
                    run_id = run_id,
                    completion_tokens = c
                        .completions
                        .iter()
                        .map(|c| c.logprobs.as_ref().unwrap().len().to_string())
                        .collect::<Vec<_>>()
                        .join(","),
                    "Success querying"
                );
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
        run_id: String,
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
                let generation = self.execute(credentials, None, run_id).await?;
                store.llm_cache_store(&project, self, &generation).await?;
                Ok(generation)
            }
        }
    }
}

impl CachedRequest for LLMChatRequest {
    /// The version of the cache. This should be incremented whenever the inputs or
    /// outputs of the request are changed, to ensure that the cached data is invalidated.
    const VERSION: i32 = 1;

    const REQUEST_TYPE: &'static str = "chat";
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct LLMChatRequest {
    hash: String,
    provider_id: ProviderID,
    model_id: String,
    messages: Vec<ChatMessage>,
    functions: Vec<ChatFunction>,
    function_call: Option<String>,
    temperature: f32,
    top_p: Option<f32>,
    n: usize,
    stop: Vec<String>,
    max_tokens: Option<i32>,
    presence_penalty: Option<f32>,
    frequency_penalty: Option<f32>,
    extras: Option<Value>,
}

impl LLMChatRequest {
    pub fn new(
        provider_id: ProviderID,
        model_id: &str,
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
        extras: Option<Value>,
    ) -> Self {
        let mut hasher = blake3::Hasher::new();

        hasher.update(provider_id.to_string().as_bytes());
        hasher.update(model_id.as_bytes());
        hasher.update(LLMChatRequest::version().to_string().as_bytes());

        messages.iter().for_each(|m| {
            hasher.update(serde_json::to_string(m).unwrap().as_bytes());
        });
        functions.iter().for_each(|m| {
            hasher.update(serde_json::to_string(m).unwrap().as_bytes());
        });
        if !function_call.is_none() {
            hasher.update(function_call.clone().unwrap().as_bytes());
        }
        hasher.update(temperature.to_string().as_bytes());
        if !top_p.is_none() {
            hasher.update(top_p.unwrap().to_string().as_bytes());
        }
        hasher.update(n.to_string().as_bytes());
        stop.iter().for_each(|s| {
            hasher.update(s.as_bytes());
        });
        if !max_tokens.is_none() {
            hasher.update(max_tokens.unwrap().to_string().as_bytes());
        }
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
            functions: functions.clone(),
            function_call,
            temperature,
            top_p,
            n,
            stop: stop.clone(),
            max_tokens,
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
        run_id: String,
    ) -> Result<LLMChatGeneration> {
        let mut llm = provider(self.provider_id).llm(self.model_id.clone());
        llm.initialize(credentials).await?;

        let out = with_retryable_back_off(
            || {
                llm.chat(
                    &self.messages,
                    &self.functions,
                    self.function_call.clone(),
                    self.temperature,
                    self.top_p,
                    self.n,
                    &self.stop,
                    self.max_tokens,
                    self.presence_penalty,
                    self.frequency_penalty,
                    self.extras.clone(),
                    event_sender.clone(),
                )
            },
            |err_msg, sleep, attempts| {
                info!(
                    provider_id = self.provider_id.to_string(),
                    model_id = self.model_id,
                    attempts = attempts,
                    sleep = sleep.as_millis(),
                    err_msg = err_msg,
                    run_id = run_id,
                    "Retry querying"
                );
            },
            |err| {
                error!(
                    provider_id = self.provider_id.to_string(),
                    model_id = self.model_id,
                    err_msg = err.message,
                    request_id = err.request_id.as_deref().unwrap_or(""),
                    "LLMChatRequest ModelError",
                );
            },
        )
        .await;

        match out {
            Ok(c) => {
                info!(
                    provider_id = self.provider_id.to_string(),
                    model_id = self.model_id,
                    messages_count = self.messages.len(),
                    temperature = self.temperature,
                    request_id = c.provider_request_id.as_deref().unwrap_or(""),
                    run_id = run_id,
                    completion_message_length = c
                        .completions
                        .iter()
                        .map(|c| c
                            .content
                            .as_ref()
                            .unwrap_or(&String::new())
                            .len()
                            .to_string())
                        .collect::<Vec<_>>()
                        .join(","),
                    "Success querying",
                );
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
        run_id: String,
    ) -> Result<LLMChatGeneration> {
        let generation = {
            match use_cache {
                false => None,
                true => {
                    let mut generations = store.llm_chat_cache_get(&project, self).await?;
                    match generations.len() {
                        0 => None,
                        _ => {
                            let mut generation = generations.remove(0);
                            generation.usage = None;
                            Some(generation)
                        }
                    }
                }
            }
        };

        match generation {
            Some(generation) => Ok(generation),
            None => {
                let generation = self.execute(credentials, None, run_id).await?;
                store
                    .llm_chat_cache_store(&project, self, &generation)
                    .await?;
                Ok(generation)
            }
        }
    }
}
