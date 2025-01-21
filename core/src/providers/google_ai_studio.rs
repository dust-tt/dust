use anyhow::{anyhow, Result};
use async_trait::async_trait;

use http::Uri;
use parking_lot::RwLock;
use serde_json::Value;
use std::sync::Arc;

use tokio::sync::mpsc::UnboundedSender;

use crate::{run::Credentials, utils};

use super::{
    chat_messages::ChatMessage,
    embedder::Embedder,
    llm::{ChatFunction, LLMChatGeneration, LLMGeneration, LLM},
    openai_compatible_helpers::{openai_compatible_chat_completion, TransformSystemMessages},
    provider::{Provider, ProviderID},
    tiktoken::tiktoken::{
        batch_tokenize_async, cl100k_base_singleton, decode_async, encode_async, CoreBPE,
    },
};

pub struct GoogleAiStudioProvider {}

impl GoogleAiStudioProvider {
    pub fn new() -> Self {
        Self {}
    }
}

#[async_trait]
impl Provider for GoogleAiStudioProvider {
    fn id(&self) -> ProviderID {
        ProviderID::GoogleAiStudio
    }

    fn setup(&self) -> Result<()> {
        utils::info("You cannot setup GoogleAIStudio from the CLI, sorry.");

        Ok(())
    }

    async fn test(&self) -> Result<()> {
        Err(anyhow!(
            "You cannot test GoogleAIStudio from the CLI, sorry."
        ))
    }

    fn llm(&self, id: String) -> Box<dyn LLM + Sync + Send> {
        Box::new(GoogleAiStudioLLM::new(id))
    }

    fn embedder(&self, _id: String) -> Box<dyn Embedder + Sync + Send> {
        unimplemented!()
    }
}

pub struct GoogleAiStudioLLM {
    id: String,
    api_key: Option<String>,
}

impl GoogleAiStudioLLM {
    pub fn new(id: String) -> Self {
        Self { id, api_key: None }
    }

    fn model_endpoint(&self) -> Uri {
        Uri::from_static("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions")
    }

    fn tokenizer(&self) -> Arc<RwLock<CoreBPE>> {
        // TODO: use countTokens API
        // "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:countTokens"
        cl100k_base_singleton()
    }
}

#[async_trait]
impl LLM for GoogleAiStudioLLM {
    fn id(&self) -> String {
        self.id.clone()
    }

    async fn initialize(&mut self, credentials: Credentials) -> Result<()> {
        match credentials.get("GOOGLE_AI_STUDIO_API_KEY") {
            Some(api_key) => {
                self.api_key = Some(api_key.clone());
            }
            None => Err(anyhow!("GOOGLE_AI_STUDIO_API_KEY not found in credentials"))?,
        }
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
        _presence_penalty: Option<f32>,
        _frequency_penalty: Option<f32>,
        _top_p: Option<f32>,
        _top_logprobs: Option<i32>,
        _extras: Option<Value>,
        _event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<LLMGeneration> {
        unimplemented!()
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
        logprobs: Option<bool>,
        top_logprobs: Option<i32>,
        _extras: Option<Value>,
        event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<LLMChatGeneration> {
        openai_compatible_chat_completion(
            self.model_endpoint(),
            self.id.clone(),
            self.api_key.clone().unwrap(),
            messages,
            functions,
            function_call,
            temperature,
            top_p,
            n,
            stop,
            max_tokens,
            None,
            None,
            logprobs,
            top_logprobs,
            None,
            // Non-streaming API of gemini does not work correctly with hyper client.
            // We create a dummy event sender to use the streaming API.
            // TODO(@fontanierh): use ureq instead of hyper to fix this.
            event_sender.or_else(|| {
                let (sender, _) = tokio::sync::mpsc::unbounded_channel::<Value>();
                Some(sender)
            }),
            false, // don't disable provider streaming
            TransformSystemMessages::Keep,
            "GoogleAIStudio".to_string(),
            false, // don't squash text contents
        )
        .await
    }
}
