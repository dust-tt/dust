use crate::providers::chat_messages::{AssistantChatMessage, ChatMessage};
use crate::providers::embedder::Embedder;
use crate::providers::llm::ChatFunction;
use crate::providers::llm::{LLMChatGeneration, LLMGeneration, LLMTokenUsage, LLM};
use crate::providers::openai::{
    chat_completion, streamed_chat_completion, to_openai_messages, OpenAIChatMessage,
    OpenAIChatMessageContent, OpenAIContentBlock, OpenAITextContent, OpenAITextContentType,
    OpenAITool, OpenAIToolChoice,
};
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
use std::str::FromStr;
use std::sync::Arc;
use tokio::sync::mpsc::UnboundedSender;

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
        mut max_tokens: Option<i32>,
        presence_penalty: Option<f32>,
        frequency_penalty: Option<f32>,
        _extras: Option<Value>,
        event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<LLMChatGeneration> {
        if let Some(m) = max_tokens {
            if m == -1 {
                max_tokens = None;
            }
        }

        let tool_choice = match function_call.as_ref() {
            Some(fc) => Some(OpenAIToolChoice::from_str(fc)?),
            None => None,
        };

        let tools = functions
            .iter()
            .map(OpenAITool::try_from)
            .collect::<Result<Vec<OpenAITool>, _>>()?;

        // TogetherAI doesn't work with the new chat message content format.
        // We have to modify the messages contents to use the "String" format.
        let openai_messages = to_openai_messages(messages, &self.id)?
            .into_iter()
            .filter_map(|m| match m.content {
                None => Some(m),
                Some(OpenAIChatMessageContent::String(_)) => Some(m),
                Some(OpenAIChatMessageContent::Structured(contents)) => {
                    // Find the first text content, and use it to make a string content.
                    let content = contents.into_iter().find_map(|c| match c {
                        OpenAIContentBlock::TextContent(OpenAITextContent {
                            r#type: OpenAITextContentType::Text,
                            text,
                            ..
                        }) => Some(OpenAIChatMessageContent::String(text)),
                        _ => None,
                    });

                    Some(OpenAIChatMessage {
                        role: m.role,
                        name: m.name,
                        tool_call_id: m.tool_call_id,
                        tool_calls: m.tool_calls,
                        content,
                    })
                }
            })
            .collect::<Vec<_>>();

        let is_streaming = event_sender.is_some();

        let (c, request_id) = if is_streaming {
            streamed_chat_completion(
                self.chat_uri()?,
                self.api_key.clone().unwrap(),
                None,
                Some(self.id.clone()),
                &openai_messages,
                tools,
                tool_choice,
                temperature,
                match top_p {
                    Some(t) => t,
                    None => 1.0,
                },
                n,
                stop,
                max_tokens,
                match presence_penalty {
                    Some(p) => p,
                    None => 0.0,
                },
                match frequency_penalty {
                    Some(f) => f,
                    None => 0.0,
                },
                None,
                None,
                event_sender.clone(),
            )
            .await?
        } else {
            chat_completion(
                self.chat_uri()?,
                self.api_key.clone().unwrap(),
                None,
                Some(self.id.clone()),
                &openai_messages,
                tools,
                tool_choice,
                temperature,
                match top_p {
                    Some(t) => t,
                    None => 1.0,
                },
                n,
                stop,
                max_tokens,
                match presence_penalty {
                    Some(p) => p,
                    None => 0.0,
                },
                match frequency_penalty {
                    Some(f) => f,
                    None => 0.0,
                },
                None,
                None,
            )
            .await?
        };

        assert!(c.choices.len() > 0);

        Ok(LLMChatGeneration {
            created: utils::now(),
            provider: ProviderID::OpenAI.to_string(),
            model: self.id.clone(),
            completions: c
                .choices
                .iter()
                .map(|c| AssistantChatMessage::try_from(&c.message))
                .collect::<Result<Vec<_>>>()?,
            usage: c.usage.map(|usage| LLMTokenUsage {
                prompt_tokens: usage.prompt_tokens,
                completion_tokens: usage.completion_tokens.unwrap_or(0),
            }),
            provider_request_id: request_id,
        })
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
