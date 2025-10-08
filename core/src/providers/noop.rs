use crate::providers::chat_messages::AssistantContentItem::TextContent;
use crate::providers::chat_messages::{AssistantChatMessage, ChatMessage};
use crate::providers::embedder::Embedder;
use crate::providers::llm::{ChatFunction, ChatMessageRole, Tokens};
use crate::providers::llm::{LLMChatGeneration, LLMGeneration, LLM};
use crate::providers::provider::{Provider, ProviderID};
use crate::providers::tiktoken::tiktoken::{
    batch_tokenize_async, decode_async, encode_async, o200k_base_singleton, CoreBPE,
};
use crate::run::Credentials;
use crate::utils;
use anyhow::Result;
use async_trait::async_trait;
use parking_lot::RwLock;
use serde_json::{json, Value};
use std::sync::Arc;
use tokio::sync::mpsc::UnboundedSender;

pub struct NoopLLM {
    id: String,
}

impl NoopLLM {
    pub fn new(id: String) -> Self {
        NoopLLM { id }
    }

    fn tokenizer(&self) -> Arc<RwLock<CoreBPE>> {
        o200k_base_singleton()
    }
}

#[async_trait]
impl LLM for NoopLLM {
    fn id(&self) -> String {
        self.id.clone()
    }

    async fn initialize(&mut self, _credentials: Credentials) -> Result<()> {
        Ok(())
    }

    fn context_size(&self) -> usize {
        1_000_000
    }

    async fn encode(&self, text: &str) -> Result<Vec<usize>> {
        encode_async(self.tokenizer(), text).await
    }

    async fn decode(&self, tokens: Vec<usize>) -> Result<String> {
        decode_async(self.tokenizer(), tokens).await
    }

    async fn tokenize(&self, texts: Vec<String>) -> Result<Vec<Vec<(usize, String)>>> {
        batch_tokenize_async(self.tokenizer(), texts).await
    }

    async fn generate(
        &self,
        _prompt: &str,
        _max_tokens: Option<i32>,
        _temperature: f32,
        _n: usize,
        _stop: &Vec<String>,
        _frequency_penalty: Option<f32>,
        _presence_penalty: Option<f32>,
        _top_p: Option<f32>,
        _top_logprobs: Option<i32>,
        _extras: Option<Value>,
        event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<LLMGeneration> {
        // First, we send the tokens to the event sender, so the UI can display them.
        match event_sender {
            None => {}
            Some(e) => e.send(json!({
                "type": "tokens",
                "content": {
                  "text": "noop",
                }
            }))?,
        }
        Ok(LLMGeneration {
            created: utils::now(),
            provider: ProviderID::Noop.to_string(),
            model: self.id.clone(),
            completions: vec![Tokens {
                text: "noop".to_string(),
                tokens: Some(vec!["noop".to_string()]),
                logprobs: None,
                top_logprobs: None,
            }],
            prompt: Tokens {
                text: "noop".to_string(),
                tokens: Some(vec!["noop".to_string()]),
                logprobs: None,
                top_logprobs: None,
            },
            usage: None,
            provider_request_id: None,
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
        _logprobs: Option<bool>,
        _top_logprobs: Option<i32>,
        _extras: Option<Value>,
        event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<LLMChatGeneration> {
        // First, we send the tokens to the event sender, so the UI can display them.
        match event_sender {
            None => {}
            Some(e) => e.send(json!({
                "type": "tokens",
                "content": {
                  "text": "noop",
                }
            }))?,
        }
        // Then we return the full completion.
        Ok(LLMChatGeneration {
            created: utils::now(),
            provider: ProviderID::Noop.to_string(),
            model: "noop".to_string(),
            completions: vec![AssistantChatMessage {
                content: None,
                function_call: None,
                function_calls: None,
                name: None,
                role: ChatMessageRole::Assistant,
                contents: Some(vec![TextContent {
                    value: "noop".to_string(),
                }]),
            }],
            usage: None,
            provider_request_id: None,
            logprobs: None,
        })
    }
}

pub struct NoopProvider {}

impl NoopProvider {
    pub fn new() -> Self {
        NoopProvider {}
    }
}

#[async_trait]
impl Provider for NoopProvider {
    fn id(&self) -> ProviderID {
        ProviderID::Noop
    }

    fn setup(&self) -> Result<()> {
        Ok(())
    }

    async fn test(&self) -> Result<()> {
        Ok(())
    }

    fn llm(&self, id: String) -> Box<dyn LLM + Sync + Send> {
        Box::new(NoopLLM::new(id))
    }

    fn embedder(&self, _id: String) -> Box<dyn Embedder + Sync + Send> {
        unimplemented!()
    }
}
