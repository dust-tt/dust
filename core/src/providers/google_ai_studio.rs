use anyhow::{anyhow, Result};
use async_trait::async_trait;
use parking_lot::RwLock;
use serde_json::Value;
use std::sync::Arc;
use tokio::sync::mpsc::UnboundedSender;

use crate::{
    providers::{
        google_vertex_ai::{streamed_chat_completion, Content, Part, USE_FUNCTION_CALLING},
        llm::{ChatMessageRole, Tokens},
    },
    run::Credentials,
    utils,
};

use super::{
    embedder::Embedder,
    llm::{ChatFunction, ChatMessage, LLMChatGeneration, LLMGeneration, LLM},
    provider::{Provider, ProviderID},
    tiktoken::tiktoken::{
        cl100k_base_singleton, decode_async, encode_async, tokenize_async, CoreBPE,
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
        utils::info("You cannot setup Google AI Studio from the CLI, sorry.");

        Ok(())
    }

    async fn test(&self) -> Result<()> {
        Err(anyhow!(
            "You cannot test Google Vertex AI from the CLI, sorry."
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

    fn model_endpoint(&self) -> String {
        format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:streamGenerateContent?alt=sse",
            self.id
        )
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

    async fn tokenize(&self, text: &str) -> Result<Vec<(usize, String)>> {
        tokenize_async(self.tokenizer(), text).await
    }

    async fn generate(
        &self,
        prompt: &str,
        mut max_tokens: Option<i32>,
        temperature: f32,
        n: usize,
        stop: &Vec<String>,
        presence_penalty: Option<f32>,
        frequency_penalty: Option<f32>,
        top_p: Option<f32>,
        top_logprobs: Option<i32>,
        _extras: Option<Value>,
        event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<LLMGeneration> {
        assert!(n == 1);

        let api_key = match &self.api_key {
            Some(k) => k.to_string(),
            None => Err(anyhow!("API key not found"))?,
        };

        if frequency_penalty.is_some() {
            Err(anyhow!(
                "Frequency penalty not supported by Google AI Studio"
            ))?;
        }
        if presence_penalty.is_some() {
            Err(anyhow!(
                "Presence penalty not supported by Google AI Studio"
            ))?;
        }
        if top_logprobs.is_some() {
            Err(anyhow!("Top logprobs not supported by Google Vertex AI"))?;
        }

        if let Some(m) = max_tokens {
            if m == -1 {
                let tokens = self.encode(prompt).await?;
                max_tokens = Some((self.context_size() - tokens.len()) as i32);
            }
        }

        let uri = self.model_endpoint();

        let c = streamed_chat_completion(
            uri,
            api_key,
            &vec![Content {
                role: String::from("user"),
                parts: Some(vec![Part {
                    text: Some(String::from(prompt)),
                    function_call: None,
                    function_response: None,
                }]),
            }],
            &vec![],
            None,
            temperature,
            stop,
            max_tokens,
            match top_p {
                Some(t) => t,
                None => 1.0,
            },
            None,
            event_sender,
            false,
        )
        .await?;

        Ok(LLMGeneration {
            created: utils::now(),
            provider: ProviderID::GoogleVertexAi.to_string(),
            model: self.id().clone(),
            completions: vec![Tokens {
                text: match c.candidates {
                    None => String::from(""),
                    Some(candidates) => match candidates.len() {
                        0 => String::from(""),
                        _ => match &candidates[0].content.parts {
                            None => String::from(""),
                            Some(parts) => match parts.len() {
                                0 => String::from(""),
                                _ => match &parts[0].text {
                                    None => String::from(""),
                                    Some(text) => text.clone(),
                                },
                            },
                        },
                    },
                },
                tokens: Some(vec![]),
                logprobs: Some(vec![]),
                top_logprobs: None,
            }],
            prompt: Tokens {
                text: prompt.to_string(),
                tokens: Some(vec![]),
                logprobs: Some(vec![]),
                top_logprobs: None,
            },
        })
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
        mut max_tokens: Option<i32>,
        presence_penalty: Option<f32>,
        frequency_penalty: Option<f32>,
        _extras: Option<Value>,
        event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<LLMChatGeneration> {
        assert!(n == 1);

        let api_key = match &self.api_key {
            Some(k) => k.to_string(),
            None => Err(anyhow!("API key not found"))?,
        };

        if frequency_penalty.is_some() {
            Err(anyhow!(
                "Frequency penalty not supported by Google AI Studio"
            ))?;
        }
        if presence_penalty.is_some() {
            Err(anyhow!(
                "Presence penalty not supported by Google AI Studio"
            ))?;
        }

        if let Some(m) = max_tokens {
            if m == -1 {
                max_tokens = None;
            }
        }

        if functions.len() > 0 || function_call.is_some() {
            if USE_FUNCTION_CALLING {
                unimplemented!("Functions on Google AI Studio are not implemented yet.");
            }
            Err(anyhow!("Functions on Google AI Studio are disabled."))?;
        }

        if frequency_penalty.is_some() {
            Err(anyhow!(
                "Frequency penalty not supported by Google Vertex AI"
            ))?;
        }
        if presence_penalty.is_some() {
            Err(anyhow!(
                "Presence penalty not supported by Google Vertex AI"
            ))?;
        }

        let uri = self.model_endpoint();

        let c = streamed_chat_completion(
            uri,
            api_key,
            &messages
                .iter()
                .map(|m| Content::try_from(m))
                .collect::<Result<Vec<Content>>>()?,
            &vec![],
            None,
            temperature,
            stop,
            max_tokens,
            match top_p {
                Some(t) => t,
                None => 1.0,
            },
            None,
            event_sender,
            false,
        )
        .await?;

        Ok(LLMChatGeneration {
            created: utils::now(),
            provider: ProviderID::GoogleVertexAi.to_string(),
            model: self.id().clone(),
            completions: vec![ChatMessage {
                name: None,
                function_call: None,
                role: ChatMessageRole::Assistant,
                content: match c.candidates {
                    None => None,
                    Some(candidates) => match candidates.len() {
                        0 => None,
                        _ => match &candidates[0].content.parts {
                            None => None,
                            Some(parts) => match parts.len() {
                                0 => None,
                                _ => match &parts[0].text {
                                    None => None,
                                    Some(text) => Some(text.clone()),
                                },
                            },
                        },
                    },
                },
            }],
        })
    }
}
