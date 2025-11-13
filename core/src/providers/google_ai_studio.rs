use super::{
    chat_messages::ChatMessage,
    embedder::Embedder,
    helpers::{convert_message_images_to_base64, fetch_and_encode_images_from_messages},
    llm::TokenizerSingleton,
    llm::{ChatFunction, LLMChatGeneration, LLMGeneration, LLM},
    openai_compatible_helpers::{openai_compatible_chat_completion, TransformSystemMessages},
    provider::{Provider, ProviderID},
};
use crate::types::tokenizer::{TiktokenTokenizerBase, TokenizerConfig};
use crate::{run::Credentials, utils};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use http::Uri;
use serde_json::Value;
use tokio::sync::mpsc::UnboundedSender;

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

    fn llm(&self, id: String, tokenizer: Option<TokenizerSingleton>) -> Box<dyn LLM + Sync + Send> {
        Box::new(GoogleAiStudioLLM::new(id, tokenizer))
    }

    fn embedder(&self, _id: String) -> Box<dyn Embedder + Sync + Send> {
        unimplemented!()
    }
}

pub struct GoogleAiStudioLLM {
    id: String,
    api_key: Option<String>,
    tokenizer: Option<TokenizerSingleton>,
}

impl GoogleAiStudioLLM {
    pub fn new(id: String, tokenizer: Option<TokenizerSingleton>) -> Self {
        Self {
            id,
            api_key: None,
            tokenizer: tokenizer.or_else(|| {
                TokenizerSingleton::from_config(&TokenizerConfig::Tiktoken {
                    base: TiktokenTokenizerBase::Cl100kBase,
                })
            }),
        }
    }

    fn model_endpoint(&self) -> Uri {
        Uri::from_static("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions")
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
        let api_key = match self.api_key.clone() {
            Some(key) => key,
            None => Err(anyhow!("GOOGLE_AI_STUDIO_API_KEY is not set."))?,
        };

        let base64_map = fetch_and_encode_images_from_messages(messages).await?;

        let messages = messages
            .iter()
            .map(|msg| convert_message_images_to_base64(msg.clone(), &base64_map))
            .collect::<Result<Vec<_>>>()?;

        openai_compatible_chat_completion(
            self.model_endpoint(),
            self.id.clone(),
            api_key,
            &messages,
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
