use std::sync::Arc;

use crate::providers::chat_messages::ChatMessage;
use crate::providers::embedder::Embedder;
use crate::providers::llm::ChatFunction;
use crate::providers::llm::{LLMChatGeneration, LLMGeneration, LLM};
use crate::providers::provider::{Provider, ProviderID};
use crate::providers::tiktoken::tiktoken::{batch_tokenize_async, o200k_base_singleton, CoreBPE};
use crate::providers::tiktoken::tiktoken::{decode_async, encode_async};
use crate::run::Credentials;
use crate::utils;

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use hyper::Uri;
use parking_lot::RwLock;
use serde_json::Value;
use tokio::sync::mpsc::UnboundedSender;

use super::helpers::strip_tools_from_chat_history;
use super::openai_compatible_helpers::{
    openai_compatible_chat_completion, TransformSystemMessages,
};

// ModelIds that support tools
const MODEL_IDS_WITH_TOOLS_SUPPORT: &[&str] = &["deepseek-chat"];

pub struct DeepseekLLM {
    id: String,
    api_key: Option<String>,
}

impl DeepseekLLM {
    pub fn new(id: String) -> Self {
        DeepseekLLM { id, api_key: None }
    }

    fn chat_uri(&self) -> Result<Uri> {
        Ok(format!("https://api.deepseek.com/v1/chat/completions",).parse::<Uri>()?)
    }

    fn tokenizer(&self) -> Arc<RwLock<CoreBPE>> {
        // TODO(@fontanierh): TBD
        o200k_base_singleton()
    }

    pub fn deepseek_context_size(_model_id: &str) -> usize {
        // TODO(@fontanierh): TBD
        131072
    }
}

#[async_trait]
impl LLM for DeepseekLLM {
    fn id(&self) -> String {
        self.id.clone()
    }

    async fn initialize(&mut self, credentials: Credentials) -> Result<()> {
        match credentials.get("DEEPSEEK_API_KEY") {
            Some(api_key) => {
                self.api_key = Some(api_key.clone());
            }
            None => {
                match tokio::task::spawn_blocking(|| std::env::var("DEEPSEEK_API_KEY")).await? {
                    Ok(key) => {
                        self.api_key = Some(key);
                    }
                    Err(_) => Err(anyhow!(
                        "Credentials or environment variable `DEEPSEEK_API_KEY` is not set."
                    ))?,
                }
            }
        }
        Ok(())
    }

    fn context_size(&self) -> usize {
        Self::deepseek_context_size(self.id.as_str())
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
        mut _max_tokens: Option<i32>,
        _temperature: f32,
        _n: usize,
        _stop: &Vec<String>,
        _frequency_penalty: Option<f32>,
        _presence_penalty: Option<f32>,
        _top_p: Option<f32>,
        _top_logprobs: Option<i32>,
        _extras: Option<Value>,
        _event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<LLMGeneration> {
        Err(anyhow!("Not implemented."))
    }

    // API is openai-compatible.
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
        logprobs: Option<bool>,
        top_logprobs: Option<i32>,
        _extras: Option<Value>,
        event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<LLMChatGeneration> {
        openai_compatible_chat_completion(
            self.chat_uri()?,
            self.id.clone(),
            self.api_key.clone().unwrap(),
            // Pre-process messages if model is deepseek-reasoner.
            match MODEL_IDS_WITH_TOOLS_SUPPORT.contains(&self.id.as_str()) {
                false => Some(strip_tools_from_chat_history(messages)),
                true => None,
            }
            .as_ref()
            .map(|m| m.as_ref())
            .unwrap_or(messages),
            // Remove functions if model is deepseek-reasoner.
            match MODEL_IDS_WITH_TOOLS_SUPPORT.contains(&self.id.as_str()) {
                false => None,
                true => Some(functions),
            }
            .as_ref()
            .map(|m| m.as_ref())
            .unwrap_or(functions),
            // Remove function call if model is deepseek-reasoner.
            match MODEL_IDS_WITH_TOOLS_SUPPORT.contains(&self.id.as_str()) {
                false => None,
                true => function_call,
            },
            temperature,
            top_p,
            n,
            stop,
            max_tokens,
            presence_penalty,
            frequency_penalty,
            logprobs,
            top_logprobs,
            None,
            event_sender,
            false, // don't disable provider streaming
            TransformSystemMessages::Keep,
            "DeepSeek".to_string(),
            false, // don't squash text contents
        )
        .await
    }
}

pub struct DeepseekProvider {}

impl DeepseekProvider {
    pub fn new() -> Self {
        DeepseekProvider {}
    }
}

#[async_trait]
impl Provider for DeepseekProvider {
    fn id(&self) -> ProviderID {
        ProviderID::Deepseek
    }

    fn setup(&self) -> Result<()> {
        utils::info("Setting up Deepseek:");
        utils::info("");
        utils::info(
            "To use Deepseek's models, you must set the environment variable `DEEPSEEK_API_KEY`.",
        );
        utils::info("Your API key can be found at `https://platform.deepseek.com/api-keys`.");
        utils::info("");
        utils::info("Once ready you can check your setup with `dust provider test deepseek`");

        Ok(())
    }

    async fn test(&self) -> Result<()> {
        if !utils::confirm(
            "You are about to make a request for 1 token to `deepseek-chat` on the Deepseek API.",
        )? {
            Err(anyhow!("User aborted Deepseek test."))?;
        }

        let mut llm = self.llm(String::from("deepseek-chat"));
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

        utils::done("Test successfully completed! Deepseek is ready to use.");

        Ok(())
    }

    fn llm(&self, id: String) -> Box<dyn LLM + Sync + Send> {
        Box::new(DeepseekLLM::new(id))
    }

    fn embedder(&self, _id: String) -> Box<dyn Embedder + Sync + Send> {
        unimplemented!()
    }
}
