use crate::providers::chat_messages::ChatMessage;
use crate::providers::embedder::Embedder;
use crate::providers::llm::ChatFunction;
use crate::providers::llm::TokenizerSingleton;
use crate::providers::llm::{LLMChatGeneration, LLMGeneration, LLM};
use crate::providers::provider::{Provider, ProviderID};
use crate::run::Credentials;
use crate::types::tokenizer::{TiktokenTokenizerBase, TokenizerConfig};
use crate::utils;

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use hyper::Uri;
use serde_json::Value;
use tokio::sync::mpsc::UnboundedSender;

use super::openai_compatible_helpers::{
    openai_compatible_chat_completion, TransformSystemMessages,
};

pub struct XaiLLM {
    id: String,
    tokenizer: Option<TokenizerSingleton>,
    api_key: Option<String>,
}

impl XaiLLM {
    pub fn new(id: String, tokenizer: Option<TokenizerSingleton>) -> Self {
        XaiLLM {
            id,
            tokenizer: tokenizer.or_else(|| {
                TokenizerSingleton::from_config(&TokenizerConfig::Tiktoken {
                    base: TiktokenTokenizerBase::O200kBase,
                })
            }),
            api_key: None,
        }
    }

    fn chat_uri(&self) -> Result<Uri> {
        Ok("https://api.x.ai/v1/chat/completions".parse::<Uri>()?)
    }

    pub fn xai_context_size(_model_id: &str) -> usize {
        131072
    }
}

#[async_trait]
impl LLM for XaiLLM {
    fn id(&self) -> String {
        self.id.clone()
    }

    async fn initialize(&mut self, credentials: Credentials) -> Result<()> {
        match credentials.get("XAI_API_KEY") {
            Some(api_key) => {
                self.api_key = Some(api_key.clone());
            }
            None => match tokio::task::spawn_blocking(|| std::env::var("XAI_API_KEY")).await? {
                Ok(key) => {
                    self.api_key = Some(key);
                }
                Err(_) => Err(anyhow!(
                    "Credentials or environment variable `XAI_API_KEY` is not set."
                ))?,
            },
        }
        Ok(())
    }

    fn context_size(&self) -> usize {
        Self::xai_context_size(self.id.as_str())
    }

    async fn encode(&self, text: &str) -> Result<Vec<usize>> {
        self.tokenizer
            .as_ref()
            .ok_or_else(|| anyhow!("Tokenizer not initialized"))?
            .encode(text)
            .await
    }

    async fn decode(&self, tokens: Vec<usize>) -> Result<String> {
        self.tokenizer
            .as_ref()
            .ok_or_else(|| anyhow!("Tokenizer not initialized"))?
            .decode(tokens)
            .await
    }

    async fn tokenize(&self, texts: Vec<String>) -> Result<Vec<Vec<(usize, String)>>> {
        self.tokenizer
            .as_ref()
            .ok_or_else(|| anyhow!("Tokenizer not initialized"))?
            .tokenize(texts)
            .await
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
        Err(anyhow!(
            "xAI Grok models do not support text completions, only chat completions."
        ))
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
        presence_penalty: Option<f32>,
        frequency_penalty: Option<f32>,
        logprobs: Option<bool>,
        top_logprobs: Option<i32>,
        _extras: Option<Value>,
        event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<LLMChatGeneration> {
        let api_key = match self.api_key.clone() {
            Some(key) => key,
            None => Err(anyhow!("XAI_API_KEY is not set."))?,
        };

        openai_compatible_chat_completion(
            self.chat_uri()?,
            self.id.clone(),
            api_key,
            messages,
            functions,
            function_call,
            temperature,
            top_p,
            n,
            stop,
            max_tokens,
            presence_penalty,
            frequency_penalty,
            logprobs,
            top_logprobs,
            None, // extras
            event_sender,
            false,                         // xAI models support streaming
            TransformSystemMessages::Keep, // xAI models support system messages
            "xAI".to_string(),
            false, // xAI models support structured message content
        )
        .await
    }
}

pub struct XaiProvider {}

impl XaiProvider {
    pub fn new() -> Self {
        XaiProvider {}
    }
}

#[async_trait]
impl Provider for XaiProvider {
    fn id(&self) -> ProviderID {
        ProviderID::Xai
    }

    fn setup(&self) -> Result<()> {
        utils::info("Setting up xAI:");
        utils::info("");
        utils::info(
            "To use xAI's Grok models, you must set the environment variable `XAI_API_KEY`.",
        );
        utils::info("Your API key can be found at https://x.ai/developers");
        utils::info("");
        utils::info("Once ready you can check your setup with `dust provider test xai`");

        Ok(())
    }

    async fn test(&self) -> Result<()> {
        if !utils::confirm(
            "You are about to make a request for 1 token to the `grok-3-mini-beta` model on the xAI API.",
        )? {
            Err(anyhow!("User aborted xAI test."))?;
        }

        let tokenizer = TokenizerSingleton::from_config(&TokenizerConfig::Tiktoken {
            base: TiktokenTokenizerBase::O200kBase,
        });
        let mut llm = self.llm(String::from("grok-3-mini-beta"), tokenizer);
        llm.initialize(Credentials::new()).await?;

        let messages = vec![
            ChatMessage::System(super::chat_messages::SystemChatMessage {
                role: super::llm::ChatMessageRole::System,
                content: "You are a helpful assistant.".to_string(),
            }),
            ChatMessage::User(super::chat_messages::UserChatMessage {
                role: super::llm::ChatMessageRole::User,
                content: super::chat_messages::ContentBlock::Text(
                    "Hello! Reply with a single word.".to_string(),
                ),
                name: None,
            }),
        ];

        let _ = llm
            .chat(
                &messages,
                &vec![],
                None,
                0.7,
                None,
                1,
                &vec![],
                Some(1),
                None,
                None,
                None,
                None,
                None,
                None,
            )
            .await?;

        utils::done("Test successfully completed! xAI is ready to use.");

        Ok(())
    }

    fn llm(&self, id: String, tokenizer: Option<TokenizerSingleton>) -> Box<dyn LLM + Sync + Send> {
        Box::new(XaiLLM::new(id, tokenizer))
    }

    fn embedder(&self, _id: String) -> Box<dyn Embedder + Sync + Send> {
        unimplemented!("xAI does not support embeddings")
    }
}
