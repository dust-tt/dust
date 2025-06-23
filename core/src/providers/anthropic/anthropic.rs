use crate::providers::anthropic::helpers::get_anthropic_chat_messages;
use crate::providers::anthropic::streaming::handle_streaming_response;
use crate::providers::anthropic::types::{
    AnthropicChatMessage, AnthropicError, AnthropicTool, AnthropicToolChoice,
    AnthropicToolChoiceType, ChatResponse,
};
use crate::providers::chat_messages::{AssistantChatMessage, ChatMessage};
use crate::providers::embedder::{Embedder, EmbedderVector};
use crate::providers::llm::ChatFunction;
use crate::providers::llm::{LLMChatGeneration, LLMGeneration, LLMTokenUsage, LLM};
use crate::providers::provider::{ModelError, ModelErrorRetryOptions, Provider, ProviderID};
use crate::providers::tiktoken::tiktoken::anthropic_base_singleton;
use crate::providers::tiktoken::tiktoken::{batch_tokenize_async, decode_async, encode_async};
use crate::run::Credentials;
use crate::utils;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use eventsource_client as es;
use hyper::{body::Buf, Uri};
use serde_json::{json, Value};
use std::io::prelude::*;
use std::str::FromStr;
use std::time::Duration;
use tokio::sync::mpsc::UnboundedSender;

pub struct AnthropicLLM {
    id: String,
    api_key: Option<String>,
    user_id: Option<String>,
}

fn get_max_tokens(model_id: &str) -> u64 {
    if model_id.starts_with("claude-3-7-sonnet") || model_id.starts_with("claude-4-sonnet") {
        64000
    } else if model_id.starts_with("claude-4-opus") {
        32000
    } else if model_id.starts_with("claude-3-5-sonnet") {
        8192
    } else {
        4096
    }
}

impl AnthropicLLM {
    pub fn new(id: String) -> Self {
        Self {
            id,
            api_key: None,
            user_id: None,
        }
    }

    fn messages_uri(&self) -> Result<Uri> {
        Ok("https://api.anthropic.com/v1/messages"
            .to_string()
            .parse::<Uri>()?)
    }

    fn placehodler_tool(&self) -> AnthropicTool {
        AnthropicTool {
            name: "dummy_do_not_use".to_string(),
            description: Some("Dummy placeholder tool that does nothing. Do not use.".to_string()),
            input_schema: Some(json!({
                "type": "object",
                "properties": {
                    "dummy": {"type": "string", "description": "Do not use."}
                },
            })),
        }
    }

    async fn chat_completion(
        &self,
        system: Option<String>,
        messages: &Vec<AnthropicChatMessage>,
        tools: Vec<AnthropicTool>,
        tool_choice: Option<AnthropicToolChoice>,
        temperature: f32,
        top_p: f32,
        stop_sequences: &Vec<String>,
        max_tokens: i32,
        beta_flags: &Vec<&str>,
    ) -> Result<(ChatResponse, Option<String>)> {
        assert!(self.api_key.is_some());

        let mut body = json!({
            "model": self.id.clone(),
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "top_p": top_p,
            "stop_sequences": match stop_sequences.len() {
                0 => None,
                _ => Some(stop_sequences),
            },
        });

        if let Some(user_id) = self.user_id.as_ref() {
            body["metadata"] = json!({
                "user_id": user_id,
            });
        }

        if system.is_some() {
            body["system"] = json!(system);
        }

        if !tools.is_empty() {
            body["tools"] = json!(tools);
            if tool_choice.is_some() {
                body["tool_choice"] = json!(tool_choice);
            }
        } else {
            let has_tool_choice_none_flag = beta_flags
                .iter()
                .any(|flag| flag.starts_with("tool-choice-none"));

            if !has_tool_choice_none_flag
                && messages.iter().any(|m| {
                    m.content
                        .iter()
                        .any(|c| c.tool_use.is_some() || c.tool_result.is_some())
                })
            {
                // Add only if we have tool_use or tool_result in the messages and we are
                // not using the tool-choice-none beta flag
                body["tools"] = json!(vec![self.placehodler_tool()]);
            }
        }

        let api_key = match self.api_key.clone() {
            Some(key) => key,
            None => Err(anyhow!("ANTHROPIC_API_KEY is not set."))?,
        };
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert("Content-Type", "application/json".parse()?);
        headers.insert("X-API-Key", api_key.parse()?);
        headers.insert("anthropic-version", "2023-06-01".parse()?);

        for flag in beta_flags {
            headers.insert("anthropic-beta", flag.parse()?);
        }

        let res = reqwest::Client::new()
            .post(self.messages_uri()?.to_string())
            .headers(headers)
            .json(&body)
            .send()
            .await?;

        let status = res.status();

        let res_headers = res.headers();
        let request_id = match res_headers.get("request-id") {
            Some(v) => Some(v.to_str()?.to_string()),
            None => None,
        };

        let body = res.bytes().await?;

        let mut b: Vec<u8> = vec![];
        body.reader().read_to_end(&mut b)?;
        let c: &[u8] = &b;
        let response = match status {
            reqwest::StatusCode::OK => Ok(serde_json::from_slice(c)?),
            _ => {
                let error: AnthropicError = serde_json::from_slice(c)?;
                Err(ModelError {
                    request_id: request_id.clone(),
                    message: error.message(),
                    retryable: match error.retryable() {
                        true => Some(ModelErrorRetryOptions {
                            sleep: Duration::from_millis(500),
                            factor: 2,
                            retries: 3,
                        }),
                        false => Some(ModelErrorRetryOptions {
                            sleep: Duration::from_millis(500),
                            factor: 1,
                            retries: 1,
                        }),
                    },
                })
            }
        }?;

        Ok((response, request_id))
    }

    async fn streamed_chat_completion(
        &self,
        system: Option<String>,
        messages: &Vec<AnthropicChatMessage>,
        tools: Vec<AnthropicTool>,
        tool_choice: Option<AnthropicToolChoice>,
        temperature: f32,
        top_p: f32,
        stop_sequences: &Vec<String>,
        max_tokens: i32,
        beta_flags: &Vec<&str>,
        event_sender: UnboundedSender<Value>,
        thinking: Option<(String, u64)>,
    ) -> Result<(ChatResponse, Option<String>)> {
        assert!(self.api_key.is_some());

        let mut body = json!({
            "model": self.id.clone(),
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "top_p": top_p,
            "stop_sequences": match stop_sequences.len() {
                0 => None,
                _ => Some(stop_sequences),
            },
            "stream": true,
        });

        if let Some(user_id) = self.user_id.as_ref() {
            body["metadata"] = json!({
                "user_id": user_id,
            });
        }

        if system.is_some() {
            body["system"] = json!(system);
        }

        if !tools.is_empty() {
            body["tools"] = json!(tools);
            if tool_choice.is_some() {
                body["tool_choice"] = json!(tool_choice);
            }
        } else {
            let has_tool_choice_none_flag = beta_flags
                .iter()
                .any(|flag| flag.starts_with("tool-choice-none"));

            if !has_tool_choice_none_flag
                && messages.iter().any(|m| {
                    m.content
                        .iter()
                        .any(|c| c.tool_use.is_some() || c.tool_result.is_some())
                })
            {
                // Add only if we have tool_use or tool_result in the messages and we are
                //not using the tool-choice-none beta flag
                body["tools"] = json!(vec![self.placehodler_tool()]);
            }
        }

        if let Some((thinking_type, thinking_budget_tokens)) = thinking {
            body["thinking"] = json!({
                "type": thinking_type,
                "budget_tokens": thinking_budget_tokens,
            });
            // We can't pass a temperature different from 1.0 in thinking mode: https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking#important-considerations-when-using-extended-thinking
            body["temperature"] = 1.0f32.into();
            body.as_object_mut().unwrap().remove("top_p");
        }

        let api_key = match self.api_key.clone() {
            Some(key) => key,
            None => Err(anyhow!("ANTHROPIC_API_KEY is not set."))?,
        };

        let url = self.messages_uri()?.to_string();

        let mut builder = match es::ClientBuilder::for_url(url.as_str()) {
            Ok(builder) => builder,
            Err(e) => {
                return Err(anyhow!(
                    "Error creating Anthropic streaming client: {:?}",
                    e
                ))
            }
        };

        builder = builder.method(String::from("POST"));
        builder = match builder.header("Content-Type", "application/json") {
            Ok(builder) => builder,
            Err(e) => return Err(anyhow!("Error setting header: {:?}", e)),
        };
        builder = match builder.header("X-API-Key", api_key.as_str()) {
            Ok(builder) => builder,
            Err(e) => return Err(anyhow!("Error setting header: {:?}", e)),
        };
        builder = match builder.header("anthropic-version", "2023-06-01") {
            Ok(builder) => builder,
            Err(e) => return Err(anyhow!("Error setting header: {:?}", e)),
        };

        for flag in beta_flags {
            builder = match builder.header("anthropic-beta", flag) {
                Ok(builder) => builder,
                Err(e) => return Err(anyhow!("Error setting header: {:?}", e)),
            }
        }

        let client = builder
            .body(body.to_string())
            .reconnect(
                es::ReconnectOptions::reconnect(true)
                    .retry_initial(false)
                    .delay(Duration::from_secs(1))
                    .backoff_factor(2)
                    .delay_max(Duration::from_secs(8))
                    .build(),
            )
            .build();

        handle_streaming_response(client, event_sender).await
    }
}

#[async_trait]
impl LLM for AnthropicLLM {
    fn id(&self) -> String {
        self.id.clone()
    }

    async fn initialize(&mut self, credentials: Credentials) -> Result<()> {
        match credentials.get("ANTHROPIC_API_KEY") {
            Some(api_key) => {
                self.api_key = Some(api_key.clone());
            }
            None => match tokio::task::spawn_blocking(|| std::env::var("ANTHROPIC_API_KEY")).await?
            {
                Ok(key) => {
                    self.api_key = Some(key);
                }
                Err(_) => Err(anyhow!(
                    "Credentials or environment variable `ANTHROPIC_API_KEY` is not set."
                ))?,
            },
        }
        match credentials.get("DUST_WORKSPACE_ID") {
            Some(workspace_id) => {
                self.user_id = Some(workspace_id.clone());
            }
            None => (),
        }
        Ok(())
    }

    fn context_size(&self) -> usize {
        if self.id.starts_with("claude-2.1") || self.id.starts_with("claude-3") {
            200000
        } else {
            100000
        }
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
        _event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<LLMGeneration> {
        Err(anyhow!(
            "Completion API not available for provider `anthropic`"
        ))?
    }

    async fn encode(&self, text: &str) -> Result<Vec<usize>> {
        encode_async(anthropic_base_singleton(), text).await
    }

    async fn decode(&self, tokens: Vec<usize>) -> Result<String> {
        decode_async(anthropic_base_singleton(), tokens).await
    }

    async fn tokenize(&self, texts: Vec<String>) -> Result<Vec<Vec<(usize, String)>>> {
        batch_tokenize_async(anthropic_base_singleton(), texts).await
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
        _presence_penalty: Option<f32>,
        _frequency_penalty: Option<f32>,
        _logprobs: Option<bool>,
        _top_logprobs: Option<i32>,
        extras: Option<Value>,
        event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<LLMChatGeneration> {
        assert!(self.api_key.is_some());
        assert!(n > 0);
        if n > 1 {
            return Err(anyhow!(
                "Anthropic only supports generating one sample at a time."
            ))?;
        }

        if let Some(m) = max_tokens {
            if m == -1 {
                max_tokens = Some(get_max_tokens(self.id.as_str()) as i32);
            }
        }

        // If the first message is a system message, we use that as system prompt,
        // and we remove it from the messages vector.
        let (system, slice_from) = match messages.get(0) {
            Some(cm) => match cm {
                ChatMessage::System(system_msg) => (Some(system_msg.content.clone()), 1),
                _ => (None, 0),
            },
            None => (None, 0),
        };

        let anthropic_messages =
            get_anthropic_chat_messages(messages[slice_from..].to_vec()).await?;

        let tools = functions
            .iter()
            .map(|f| AnthropicTool {
                name: f.name.clone(),
                description: f.description.clone(),
                input_schema: f.parameters.clone(),
            })
            .collect::<Vec<AnthropicTool>>();

        let tool_choice = match function_call.as_ref() {
            Some(fc) => Some(AnthropicToolChoice::from_str(fc)?),
            None => None,
        };

        let beta_flags = match &extras {
            None => vec![],
            Some(v) => match v.get("anthropic_beta_flags") {
                Some(Value::Array(a)) => a
                    .iter()
                    .map(|v| match v {
                        Value::String(s) => Ok(s.as_str()),
                        _ => Err(anyhow!(
                            "Invalid `anthropic_beta_flags`in extras: expecting an array of strings",
                        ))?,
                    })
                    .collect::<Result<Vec<&str>>>()?,
                _ => vec![],
            },
        };

        let thinking = match &extras {
            None => None,
            // We don't pass the thinking parameters in tool use.
            Some(v) => match tool_choice.is_some() {
                true => None,
                false => match v.get("anthropic_beta_thinking") {
                    Some(Value::Object(s)) => match (s.get("type"), s.get("budget_tokens")) {
                        (Some(Value::String(t)), Some(Value::Number(b))) => {
                            Some((t.clone(), b.as_u64().unwrap_or(1024)))
                        }
                        _ => None,
                    },
                    _ => None,
                },
            },
        };

        // Error if toolchoice is of type AnthropicToolChoiceType::None and we aren't using the tool-choice-none beta flag
        if let Some(AnthropicToolChoice {
            r#type: AnthropicToolChoiceType::None,
            name: _,
        }) = tool_choice
        {
            match beta_flags
                .iter()
                .any(|flag| flag.starts_with("tool-choice-none"))
            {
                true => (),
                false => Err(anyhow!(
                    "tool-choice-none beta flag is required when using tool-choice: none"
                ))?,
            }
        }

        let (c, request_id) = match event_sender {
            Some(es) => {
                self.streamed_chat_completion(
                    system,
                    &anthropic_messages,
                    tools,
                    tool_choice,
                    temperature,
                    match top_p {
                        Some(p) => p,
                        None => 1.0,
                    },
                    stop,
                    match max_tokens {
                        Some(m) => m,
                        None => get_max_tokens(self.id.as_str()) as i32,
                    },
                    &beta_flags,
                    es,
                    thinking,
                )
                .await?
            }
            None => {
                self.chat_completion(
                    system,
                    &anthropic_messages,
                    tools,
                    tool_choice,
                    temperature,
                    match top_p {
                        Some(p) => p,
                        None => 1.0,
                    },
                    stop,
                    match max_tokens {
                        Some(m) => m,
                        None => get_max_tokens(self.id.as_str()) as i32,
                    },
                    &beta_flags,
                )
                .await?
            }
        };

        Ok(LLMChatGeneration {
            created: utils::now(),
            provider: ProviderID::Anthropic.to_string(),
            model: self.id.clone(),
            usage: Some(LLMTokenUsage {
                prompt_tokens: c.usage.input_tokens,
                completion_tokens: c.usage.output_tokens,
            }),
            completions: AssistantChatMessage::try_from(c).into_iter().collect(),
            provider_request_id: request_id,
            logprobs: None,
        })
    }
}

pub struct AnthropicEmbedder {
    id: String,
}

impl AnthropicEmbedder {
    pub fn new(id: String) -> Self {
        AnthropicEmbedder { id }
    }
}

#[async_trait]
impl Embedder for AnthropicEmbedder {
    fn id(&self) -> String {
        self.id.clone()
    }

    async fn initialize(&mut self, _credentials: Credentials) -> Result<()> {
        Err(anyhow!("Embedders not available for provider `anthropic`"))
    }

    fn context_size(&self) -> usize {
        0
    }
    fn embedding_size(&self) -> usize {
        0
    }

    async fn encode(&self, text: &str) -> Result<Vec<usize>> {
        encode_async(anthropic_base_singleton(), text).await
    }

    async fn decode(&self, tokens: Vec<usize>) -> Result<String> {
        decode_async(anthropic_base_singleton(), tokens).await
    }

    async fn tokenize(&self, texts: Vec<String>) -> Result<Vec<Vec<(usize, String)>>> {
        batch_tokenize_async(anthropic_base_singleton(), texts).await
    }

    async fn embed(&self, _text: Vec<&str>, _extras: Option<Value>) -> Result<Vec<EmbedderVector>> {
        Err(anyhow!("Embeddings not available for provider `anthropic`"))
    }
}

pub struct AnthropicProvider {}

impl AnthropicProvider {
    pub fn new() -> Self {
        AnthropicProvider {}
    }
}

#[async_trait]
impl Provider for AnthropicProvider {
    fn id(&self) -> ProviderID {
        ProviderID::Anthropic
    }

    fn setup(&self) -> Result<()> {
        utils::info("Setting up Anthropic:");
        utils::info("");
        utils::info(
            "To use Anthropic's models, you must set the environment variable `ANTHROPIC_API_KEY`.",
        );
        utils::info("Your API key can be found at `https://console.anthropic.com/account/keys`.");
        utils::info("");
        utils::info("Once ready you can check your setup with `dust provider test anthropic`");

        Ok(())
    }

    async fn test(&self) -> Result<()> {
        if !utils::confirm(
            "You are about to make a request for 1 token to `claude-instant-1.2` on the Anthropic API.",
        )? {
            Err(anyhow!("User aborted Anthropic test."))?;
        }

        let mut llm = self.llm(String::from("claude-instant-1.2"));
        llm.initialize(Credentials::new()).await?;

        let llm_generation = llm
            .generate(
                "fine, dry powder consisting of tiny particles of earth or waste matter \
                lying on the ground or on surfaces or carried in the air. We call it ",
                Some(1),
                0.9,
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

        utils::info(&format!("Prompt: {}", llm_generation.prompt.text));
        utils::info(&format!(
            "Completion: {}",
            llm_generation.completions[0].text,
        ));

        utils::done("Test successfully completed! Anthropic is ready to use.");

        Ok(())
    }

    fn llm(&self, id: String) -> Box<dyn LLM + Sync + Send> {
        Box::new(AnthropicLLM::new(id))
    }

    fn embedder(&self, id: String) -> Box<dyn Embedder + Sync + Send> {
        Box::new(AnthropicEmbedder::new(id))
    }
}
