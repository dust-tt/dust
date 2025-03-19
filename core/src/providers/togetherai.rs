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
use std::sync::Arc;
use tokio::sync::mpsc::UnboundedSender;

use super::helpers::strip_tools_from_chat_history;
use super::openai_compatible_helpers::{
    openai_compatible_chat_completion, TransformSystemMessages,
};

// ModelIds that support tools
const MODEL_IDS_WITH_TOOLS_SUPPORT: &[&str] = &[
    "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
    "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
    "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo",
    "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    "mistralai/Mixtral-8x7B-Instruct-v0.1",
    "mistralai/Mistral-7B-Instruct-v0.1",
];

pub struct TogetherAILLM {
    id: String,
    api_key: Option<String>,
}

impl TogetherAILLM {
    pub fn new(id: String) -> Self {
        TogetherAILLM { id, api_key: None }
    }

    fn chat_uri(&self) -> Result<Uri> {
        Ok(format!("https://api.together.xyz/v1/chat/completions",).parse::<Uri>()?)
    }

    fn tokenizer(&self) -> Arc<RwLock<CoreBPE>> {
        // TODO(@fontanierh): TBD
        o200k_base_singleton()
    }

    pub fn togetherai_context_size(_model_id: &str) -> usize {
        // TODO(@fontanierh): TBD
        131072
    }
}

#[async_trait]
impl LLM for TogetherAILLM {
    fn id(&self) -> String {
        self.id.clone()
    }

    async fn initialize(&mut self, credentials: Credentials) -> Result<()> {
        match credentials.get("TOGETHERAI_API_KEY") {
            Some(api_key) => {
                self.api_key = Some(api_key.clone());
            }
            None => {
                match tokio::task::spawn_blocking(|| std::env::var("TOGETHERAI_API_KEY")).await? {
                    Ok(key) => {
                        self.api_key = Some(key);
                    }
                    Err(_) => Err(anyhow!(
                        "Credentials or environment variable `TOGETHERAI_API_KEY` is not set."
                    ))?,
                }
            }
        }
        Ok(())
    }

    fn context_size(&self) -> usize {
        Self::togetherai_context_size(self.id.as_str())
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
            // Pre-process messages if model is one of the supported models.
            match MODEL_IDS_WITH_TOOLS_SUPPORT.contains(&self.id.as_str()) {
                false => Some(strip_tools_from_chat_history(messages)),
                true => None,
            }
            .as_ref()
            .map(|m| m.as_ref())
            .unwrap_or(messages),
            // Remove functions if model is one of the supported models.
            match MODEL_IDS_WITH_TOOLS_SUPPORT.contains(&self.id.as_str()) {
                false => None,
                true => Some(functions),
            }
            .as_ref()
            .map(|m| m.as_ref())
            .unwrap_or(functions),
            // Remove function call if model is one of the supported models.
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
            "TogetherAI".to_string(),
            true, // squash text contents (togetherai doesn't support structured messages)
        )
        .await
    }
}

pub struct TogetherAIProvider {}

impl TogetherAIProvider {
    pub fn new() -> Self {
        TogetherAIProvider {}
    }
}

#[async_trait]
impl Provider for TogetherAIProvider {
    fn id(&self) -> ProviderID {
        ProviderID::TogetherAI
    }

    fn setup(&self) -> Result<()> {
        utils::info("Setting up TogetherAI:");
        utils::info("");
        utils::info(
            "To use TogetherAI's models, you must set the environment variable `TOGETHERAI_API_KEY`.",
        );
        utils::info("Your API key can be found at `https://platform.openai.com/account/api-keys`.");
        utils::info("");
        utils::info("Once ready you can check your setup with `dust provider test togetherai`");

        Ok(())
    }

    async fn test(&self) -> Result<()> {
        if !utils::confirm(
            "You are about to make a request for 1 token to `meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo` on the TogetherAI API.",
        )? {
            Err(anyhow!("User aborted OpenAI test."))?;
        }

        let mut llm = self.llm(String::from("meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo"));
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

        utils::done("Test successfully completed! TogetherAI is ready to use.");

        Ok(())
    }

    fn llm(&self, id: String) -> Box<dyn LLM + Sync + Send> {
        Box::new(TogetherAILLM::new(id))
    }

    fn embedder(&self, _id: String) -> Box<dyn Embedder + Sync + Send> {
        unimplemented!()
    }
}
