use crate::providers::chat_messages::{
    AssistantChatMessage, ChatMessage, ContentBlock, MixedContent,
};
use crate::providers::embedder::{Embedder, EmbedderVector};
use crate::providers::llm::{ChatFunction, ChatFunctionCall};
use crate::providers::llm::{
    ChatMessageRole, LLMChatGeneration, LLMGeneration, LLMTokenUsage, Tokens, LLM,
};
use crate::providers::provider::{ModelError, ModelErrorRetryOptions, Provider, ProviderID};
use crate::providers::tiktoken::tiktoken::anthropic_base_singleton;
use crate::providers::tiktoken::tiktoken::{batch_tokenize_async, decode_async, encode_async};
use crate::run::Credentials;
use crate::utils;
use crate::utils::ParseError;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use base64::{engine::general_purpose, Engine};
use eventsource_client as es;
use eventsource_client::Client as ESClient;
use futures::TryStreamExt;
use hyper::StatusCode;
use hyper::{body::Buf, Uri};
use reqwest::get;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fmt::{self, Display};
use std::io::prelude::*;
use std::str::FromStr;
use std::time::Duration;
use tokio::sync::mpsc::UnboundedSender;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum StopReason {
    EndTurn,
    MaxTokens,
    StopSequence,
    ToolUse,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
#[serde(rename_all = "lowercase")]
pub enum AnthropicChatMessageRole {
    Assistant,
    User,
}

impl From<AnthropicChatMessageRole> for ChatMessageRole {
    fn from(value: AnthropicChatMessageRole) -> Self {
        match value {
            AnthropicChatMessageRole::Assistant => ChatMessageRole::Assistant,
            AnthropicChatMessageRole::User => ChatMessageRole::User,
        }
    }
}

impl ToString for AnthropicChatMessageRole {
    fn to_string(&self) -> String {
        match self {
            AnthropicChatMessageRole::Assistant => String::from("assistant"),
            AnthropicChatMessageRole::User => String::from("user"),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
struct AnthropicContentToolResult {
    tool_use_id: String,
    content: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
struct AnthropicContentToolUse {
    name: String,
    id: String,
    input: Value,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
struct AnthropicImageContent {
    r#type: String,
    media_type: String,
    data: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AnthropicContentType {
    Text,
    Image,
    ToolUse,
    ToolResult,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
struct AnthropicContent {
    r#type: AnthropicContentType,

    #[serde(skip_serializing_if = "Option::is_none")]
    text: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none", flatten)]
    tool_use: Option<AnthropicContentToolUse>,

    #[serde(skip_serializing_if = "Option::is_none", flatten)]
    tool_result: Option<AnthropicContentToolResult>,

    #[serde(skip_serializing_if = "Option::is_none")]
    source: Option<AnthropicImageContent>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
struct ToolUse {
    id: String,
    name: String,
    input: Value,
}

impl TryFrom<&ToolUse> for ChatFunctionCall {
    type Error = anyhow::Error;

    fn try_from(tool_use: &ToolUse) -> Result<Self, Self::Error> {
        let arguments = serde_json::to_string(&tool_use.input)?;

        Ok(ChatFunctionCall {
            id: tool_use.id.clone(),
            name: tool_use.name.clone(),
            arguments,
        })
    }
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
#[serde(rename_all = "snake_case", tag = "type")]
enum AnthropicResponseContent {
    Text { text: String },
    ToolUse(ToolUse),
}

impl TryFrom<StreamContent> for AnthropicResponseContent {
    type Error = anyhow::Error;

    fn try_from(value: StreamContent) -> Result<Self, Self::Error> {
        match value {
            StreamContent::AnthropicStreamContent(content) => {
                Ok(AnthropicResponseContent::Text { text: content.text })
            }
            StreamContent::AnthropicStreamToolUse(tool_use) => {
                // Attempt to parse the input as JSON if it's a string.
                let input_json = if let Value::String(ref json_string) = tool_use.input {
                    serde_json::from_str(match json_string.as_str() {
                        "" => "{}",
                        _ => json_string,
                    })
                    .map_err(|e| {
                        anyhow::anyhow!(
                            "Failed to parse Anthropic tool inputs JSON ({}): {}",
                            json_string,
                            e
                        )
                    })?
                } else {
                    tool_use.input.clone()
                };

                Ok(AnthropicResponseContent::ToolUse(ToolUse {
                    id: tool_use.id,
                    name: tool_use.name,
                    input: input_json,
                }))
            }
        }
    }
}

impl AnthropicResponseContent {
    fn get_text(&self) -> Option<&String> {
        match self {
            AnthropicResponseContent::Text { text } => Some(text),
            AnthropicResponseContent::ToolUse { .. } => None,
        }
    }

    fn get_tool_use(&self) -> Option<&ToolUse> {
        match self {
            AnthropicResponseContent::Text { .. } => None,
            AnthropicResponseContent::ToolUse(tu) => Some(tu),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
struct AnthropicChatMessage {
    content: Vec<AnthropicContent>,
    role: AnthropicChatMessageRole,
}

async fn fetch_image_base64(image_url: &str) -> Result<(String, AnthropicImageContent)> {
    let response = get(image_url)
        .await
        .map_err(|e| anyhow!("Invalid image: {}", e))?;

    let mime_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|ct| ct.to_str().ok())
        .unwrap_or("application/octet-stream") // Default to a general binary type if MIME type is not found.
        .to_string();

    let bytes = response
        .bytes()
        .await
        .map_err(|e| anyhow!("Invalid image, could not parse response {}", e))?;

    Ok((
        image_url.to_string(),
        AnthropicImageContent {
            r#type: "base64".to_string(),
            media_type: mime_type,
            data: general_purpose::STANDARD.encode(&bytes),
        },
    ))
}

async fn fetch_and_encode_images(
    messages: Vec<ChatMessage>,
) -> Result<HashMap<String, AnthropicImageContent>, anyhow::Error> {
    let futures = messages
        .into_iter()
        .filter_map(|message| {
            if let ChatMessage::User(user_msg) = message {
                if let ContentBlock::Mixed(mixed_content) = user_msg.content {
                    let inner_futures = mixed_content
                        .into_iter()
                        .filter_map(|content| {
                            if let MixedContent::ImageContent(ic) = content {
                                let url = ic.image_url.url.clone();

                                Some(async move { fetch_image_base64(&url).await })
                            } else {
                                None
                            }
                        })
                        .collect::<Vec<_>>();
                    return Some(inner_futures);
                }
            }
            None
        })
        .flatten()
        .collect::<Vec<_>>();

    let base64_pairs = futures::future::try_join_all(futures)
        .await?
        .into_iter()
        .map(|(image_url, img_content)| (image_url.clone(), img_content))
        .collect::<HashMap<_, _>>();

    Ok(base64_pairs)
}

struct ChatMessageConversionInput<'a> {
    chat_message: &'a ChatMessage,
    base64_map: &'a HashMap<String, AnthropicImageContent>,
}

impl<'a> TryFrom<&'a ChatMessageConversionInput<'a>> for AnthropicChatMessage {
    type Error = anyhow::Error;

    fn try_from(input: &ChatMessageConversionInput) -> Result<Self, Self::Error> {
        let cm = input.chat_message;
        let base64_map = input.base64_map;

        match cm {
            ChatMessage::Assistant(assistant_msg) => {
                // Handling tool_uses.
                let tool_uses = match assistant_msg.function_calls.as_ref() {
                    Some(fc) => Some(
                        fc.iter()
                            .map(|function_call| {
                                let value = serde_json::from_str(function_call.arguments.as_str())?;

                                Ok(AnthropicContent {
                                    r#type: AnthropicContentType::ToolUse,
                                    text: None,
                                    tool_use: Some(AnthropicContentToolUse {
                                        name: function_call.name.clone(),
                                        id: function_call.id.clone(),
                                        input: value,
                                    }),
                                    tool_result: None,
                                    source: None,
                                })
                            })
                            .collect::<Result<Vec<AnthropicContent>>>()?,
                    ),
                    None => None,
                };

                // Handling text.
                let text = assistant_msg.content.as_ref().map(|text| AnthropicContent {
                    r#type: AnthropicContentType::Text,
                    text: Some(text.clone()),
                    tool_result: None,
                    tool_use: None,
                    source: None,
                });

                // Combining all content into one vector using iterators.
                let content_vec = text
                    .into_iter()
                    .chain(tool_uses.into_iter().flatten())
                    .collect::<Vec<AnthropicContent>>();

                Ok(AnthropicChatMessage {
                    content: content_vec,
                    role: AnthropicChatMessageRole::Assistant,
                })
            }
            ChatMessage::Function(function_msg) => {
                // Handling tool_result.
                let tool_result = AnthropicContent {
                    r#type: AnthropicContentType::ToolResult,
                    tool_use: None,
                    tool_result: Some(AnthropicContentToolResult {
                        tool_use_id: function_msg.function_call_id.clone(),
                        // TODO(2024-06-24 flav) This does not need to be Optionable.
                        content: Some(function_msg.content.clone()),
                    }),
                    text: None,
                    source: None,
                };

                Ok(AnthropicChatMessage {
                    content: vec![tool_result],
                    role: AnthropicChatMessageRole::User,
                })
            }
            ChatMessage::User(user_msg) => match &user_msg.content {
                ContentBlock::Mixed(m) => {
                    let content: Vec<AnthropicContent> = m
                        .into_iter()
                        .map(|mb| match mb {
                            MixedContent::TextContent(tc) => Ok(AnthropicContent {
                                r#type: AnthropicContentType::Text,
                                text: Some(tc.text.clone()),
                                tool_result: None,
                                tool_use: None,
                                source: None,
                            }),
                            MixedContent::ImageContent(ic) => {
                                if let Some(base64_data) = base64_map.get(&ic.image_url.url) {
                                    Ok(AnthropicContent {
                                        r#type: AnthropicContentType::Image,
                                        source: Some(base64_data.clone()),
                                        text: None,
                                        tool_use: None,
                                        tool_result: None,
                                    })
                                } else {
                                    Err(anyhow!("Invalid Image."))
                                }
                            }
                        })
                        .collect::<Result<Vec<AnthropicContent>>>()?;

                    Ok(AnthropicChatMessage {
                        content,
                        role: AnthropicChatMessageRole::User,
                    })
                }
                ContentBlock::Text(t) => Ok(AnthropicChatMessage {
                    content: vec![AnthropicContent {
                        r#type: AnthropicContentType::Text,
                        text: Some(t.clone()),
                        tool_result: None,
                        tool_use: None,
                        source: None,
                    }],
                    role: AnthropicChatMessageRole::User,
                }),
            },
            ChatMessage::System(system_msg) => Ok(AnthropicChatMessage {
                content: vec![AnthropicContent {
                    r#type: AnthropicContentType::Text,
                    text: Some(system_msg.content.clone()),
                    tool_result: None,
                    tool_use: None,
                    source: None,
                }],
                role: AnthropicChatMessageRole::User,
            }),
        }
    }
}

// Tools.

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
#[serde(rename_all = "lowercase")]
pub enum AnthropicToolChoiceType {
    Auto,
    Any,
    Tool,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct AnthropicToolChoice {
    r#type: AnthropicToolChoiceType,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
}

impl FromStr for AnthropicToolChoice {
    type Err = ParseError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "auto" => Ok(AnthropicToolChoice {
                r#type: AnthropicToolChoiceType::Auto,
                name: None,
            }),
            "any" => Ok(AnthropicToolChoice {
                r#type: AnthropicToolChoiceType::Any,
                name: None,
            }),
            "none" => Err(ParseError::with_message(
                "function_call option `none` is not supported by Antrhopic",
            )),
            _ => Ok(AnthropicToolChoice {
                r#type: AnthropicToolChoiceType::Tool,
                name: Some(s.to_string()),
            }),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct AnthropicTool {
    pub name: String,
    pub description: Option<String>,
    pub input_schema: Option<Value>,
}

impl TryFrom<&ChatFunction> for AnthropicTool {
    type Error = anyhow::Error;

    fn try_from(f: &ChatFunction) -> Result<Self, Self::Error> {
        Ok(AnthropicTool {
            name: f.name.clone(),
            description: f.description.clone(),
            input_schema: f.parameters.clone(),
        })
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Usage {
    pub input_tokens: u64,
    pub output_tokens: u64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct StreamChatResponse {
    pub id: String,
    pub model: String,
    pub role: AnthropicChatMessageRole,
    pub content: Vec<StreamContent>,
    pub stop_reason: Option<StopReason>,
    pub usage: Usage,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct ChatResponse {
    id: String,
    model: String,
    role: AnthropicChatMessageRole,
    content: Vec<AnthropicResponseContent>,
    stop_reason: Option<StopReason>,
    usage: Usage,
}

impl TryFrom<StreamChatResponse> for ChatResponse {
    type Error = anyhow::Error;

    fn try_from(cr: StreamChatResponse) -> Result<Self, Self::Error> {
        let content = cr
            .content
            .into_iter()
            .map(AnthropicResponseContent::try_from)
            .collect::<Result<Vec<AnthropicResponseContent>, anyhow::Error>>()?;

        Ok(ChatResponse {
            id: cr.id,
            model: cr.model,
            role: cr.role,
            content,
            stop_reason: cr.stop_reason,
            usage: cr.usage,
        })
    }
}

// This code converts a ChatResponse to a ChatMessage, but only supports one tool call.
// It takes the first tool call from the vector of AnthropicResponseContent,
// potentially discarding others. Anthropic often returns the CoT content as a first message,
// which gets combined with the first tool call in the resulting ChatMessage.
impl TryFrom<ChatResponse> for AssistantChatMessage {
    type Error = anyhow::Error;

    fn try_from(cr: ChatResponse) -> Result<Self, Self::Error> {
        let text_content = cr.content.iter().find_map(|item| match item.get_text() {
            Some(text) => Some(text.clone()),
            _ => None,
        });

        let tool_uses: Vec<&ToolUse> = cr
            .content
            .iter()
            .filter_map(|item| match item.get_tool_use() {
                Some(tool_use) => Some(tool_use),
                _ => None,
            })
            .collect();

        let function_calls = if !tool_uses.is_empty() {
            let cfc = tool_uses
                .into_iter()
                .map(|tc| ChatFunctionCall::try_from(tc))
                .collect::<Result<Vec<ChatFunctionCall>, _>>()?;

            Some(cfc)
        } else {
            None
        };

        let function_call = if let Some(fcs) = function_calls.as_ref() {
            match fcs.first() {
                Some(fc) => Some(fc),
                None => None,
            }
            .cloned()
        } else {
            None
        };

        Ok(AssistantChatMessage {
            role: ChatMessageRole::Assistant,
            name: None,
            content: text_content,
            function_call,
            function_calls,
        })
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CompletionResponse {
    pub completion: String,
    pub stop_reason: Option<StopReason>,
    pub stop: Option<String>,
    pub usage: Option<Usage>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ErrorDetail {
    pub r#type: String,
    pub message: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AnthropicError {
    // Anthropi api errors look like this:
    // {"error":{"type":"invalid_request_error","message":"model: field required"}}
    pub error: ErrorDetail,
}

impl AnthropicError {
    pub fn message(&self) -> String {
        format!(
            "AnthropicError: [{}] {}",
            self.error.r#type, self.error.message
        )
    }

    pub fn retryable(&self) -> bool {
        match self.error.r#type.as_str() {
            "overloaded_error" => true,
            "rate_limit_error" => true,
            _ => false,
        }
    }

    pub fn retryable_streamed(&self, status: StatusCode) -> bool {
        if status == StatusCode::TOO_MANY_REQUESTS {
            return true;
        }
        if status.is_server_error() {
            return true;
        }
        match self.error.r#type.as_str() {
            "overloaded_error" => true,
            "rate_limit_error" => true,
            _ => false,
        }
    }
}

impl Display for ErrorDetail {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[{}] {}", self.r#type, self.message)
    }
}

impl Display for AnthropicError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.error)
    }
}

// Streaming types

#[derive(Serialize, Deserialize, Debug, Clone)]
struct StreamMessageStart {
    pub r#type: String,
    pub message: StreamChatResponse,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct StreamContentBlockStart {
    pub r#type: String,
    pub index: u64,
    pub content_block: StreamContent,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct AnthropicStreamContent {
    pub r#type: String,
    pub text: String,
}
#[derive(Serialize, Deserialize, Debug, Clone)]
struct AnthropicStreamToolUse {
    r#type: String,
    name: String,
    input: Value,
    id: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(untagged)]
enum StreamContent {
    AnthropicStreamContent(AnthropicStreamContent),
    AnthropicStreamToolUse(AnthropicStreamToolUse),
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct AnthropicStreamToolInputDelta {
    partial_json: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(untagged)]
enum StreamContentDelta {
    AnthropicStreamContent(AnthropicStreamContent),
    AnthropicStreamToolInputDelta(AnthropicStreamToolInputDelta),
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct StreamContentBlockDelta {
    pub r#type: String,
    pub index: u64,
    pub delta: StreamContentDelta,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct StreamContentBlockStop {
    pub r#type: String,
    pub index: u64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct ChatResponseDelta {
    stop_reason: Option<StopReason>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct UsageDelta {
    output_tokens: u64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct StreamMessageDelta {
    pub r#type: String,
    pub delta: ChatResponseDelta,
    pub usage: UsageDelta,
}

pub struct AnthropicLLM {
    id: String,
    api_key: Option<String>,
}

impl AnthropicLLM {
    pub fn new(id: String) -> Self {
        Self { id, api_key: None }
    }

    fn messages_uri(&self) -> Result<Uri> {
        Ok("https://api.anthropic.com/v1/messages"
            .to_string()
            .parse::<Uri>()?)
    }

    fn completions_uri(&self) -> Result<Uri> {
        Ok("https://api.anthropic.com/v1/complete"
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

        if system.is_some() {
            body["system"] = json!(system);
        }

        if !tools.is_empty() {
            body["tools"] = json!(tools);
            if tool_choice.is_some() {
                body["tool_choice"] = json!(tool_choice);
            }
        } else {
            if messages.iter().any(|m| {
                m.content
                    .iter()
                    .any(|c| c.tool_use.is_some() || c.tool_result.is_some())
            }) {
                // Add only if we have tool_use or tool_result in the messages
                body["tools"] = json!(vec![self.placehodler_tool()]);
            }
        }

        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert("Content-Type", "application/json".parse()?);
        headers.insert("X-API-Key", self.api_key.clone().unwrap().parse()?);
        headers.insert("anthropic-version", "2023-06-01".parse()?);
        // headers.insert("anthropic-beta", "alpaca-2024-09-05".parse()?);

        if !tools.is_empty() {
            headers.insert("anthropic-beta", "tools-2024-05-16".parse()?);
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
        event_sender: UnboundedSender<Value>,
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

        if system.is_some() {
            body["system"] = json!(system);
        }

        if !tools.is_empty() {
            body["tools"] = json!(tools);
            if tool_choice.is_some() {
                body["tool_choice"] = json!(tool_choice);
            }
        } else {
            if messages.iter().any(|m| {
                m.content
                    .iter()
                    .any(|c| c.tool_use.is_some() || c.tool_result.is_some())
            }) {
                // Add only if we have tool_use or tool_result in the messages
                body["tools"] = json!(vec![self.placehodler_tool()]);
            }
        }

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
        builder = match builder.header("X-API-Key", self.api_key.clone().unwrap().as_str()) {
            Ok(builder) => builder,
            Err(e) => return Err(anyhow!("Error setting header: {:?}", e)),
        };
        builder = match builder.header("anthropic-version", "2023-06-01") {
            Ok(builder) => builder,
            Err(e) => return Err(anyhow!("Error setting header: {:?}", e)),
        };
        builder = match builder.header("anthropic-beta", "tools-2024-05-16") {
            Ok(builder) => builder,
            Err(e) => return Err(anyhow!("Error setting header: {:?}", e)),
        };

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

        let mut stream = client.stream();

        let mut final_response: Option<StreamChatResponse> = None;
        let mut request_id: Option<String> = None;

        'stream: loop {
            match stream.try_next().await {
                Ok(stream_next) => {
                    match stream_next {
                        Some(es::SSE::Connected((_, headers))) => {
                            request_id = match headers.get("request-id") {
                                Some(v) => Some(v.to_string()),
                                None => None,
                            };
                        }
                        Some(es::SSE::Comment(comment)) => {
                            println!("UNEXPECTED COMMENT {}", comment);
                        }
                        Some(es::SSE::Event(event)) => {
                            match event.event_type.as_str() {
                                "message_start" => {
                                    let event: StreamMessageStart =
                                        match serde_json::from_str(event.data.as_str()) {
                                            Ok(event) => event,
                                            Err(error) => {
                                                Err(anyhow!(
                                                "Error parsing response from Anthropic: {:?} {:?}",
                                                error,
                                                event.data
                                            ))?;
                                                break 'stream;
                                            }
                                        };
                                    final_response = Some(event.message.clone());
                                }
                                "content_block_start" => {
                                    let event: StreamContentBlockStart =
                                        match serde_json::from_str(event.data.as_str()) {
                                            Ok(event) => event,
                                            Err(error) => {
                                                Err(anyhow!(
                                                "Error parsing response from Anthropic: {:?} {:?}",
                                                error,
                                                event.data
                                            ))?;
                                                break 'stream;
                                            }
                                        };

                                    match final_response.as_mut() {
                                        None => {
                                            Err(anyhow!(
                                                "Error streaming from Anthropic: \
                                                missing `message_start`"
                                            ))?;
                                            break 'stream;
                                        }
                                        Some(response) => {
                                            response.content.push(event.content_block.clone());

                                            match event.content_block {
                                                StreamContent::AnthropicStreamContent(
                                                    content_block,
                                                ) => {
                                                    if content_block.text.len() > 0 {
                                                        let _ = event_sender.send(json!({
                                                            "type": "tokens",
                                                            "content": {
                                                              "text": content_block.text,
                                                            }

                                                        }));
                                                    }
                                                }
                                                StreamContent::AnthropicStreamToolUse(tool_use) => {
                                                    let _ = event_sender.send(json!({
                                                        "type": "function_call",
                                                        "content": {
                                                            "name": tool_use.name,
                                                        },
                                                    }));
                                                }
                                            }
                                        }
                                    }
                                }
                                "content_block_delta" => {
                                    let event: StreamContentBlockDelta =
                                        match serde_json::from_str(event.data.as_str()) {
                                            Ok(event) => event,
                                            Err(error) => {
                                                Err(anyhow!(
                                                "Error parsing response from Anthropic: {:?} {:?}",
                                                error,
                                                event.data
                                            ))?;
                                                break 'stream;
                                            }
                                        };

                                    match final_response.as_mut() {
                                    None => {
                                        Err(anyhow!(
                                            "Error streaming from Anthropic: \
                                                    missing `message_start`"
                                        ))?;
                                        break 'stream;
                                    }
                                    Some(response) => match response.content.last_mut() {
                                        None => {
                                            Err(anyhow!(
                                                "Error streaming from Anthropic: \
                                                        missing `content_block_start`"
                                            ))?;
                                            break 'stream;
                                        }
                                        Some(content) => match (event.delta, content) {
                                            (StreamContentDelta::AnthropicStreamContent(delta),
                                             StreamContent::AnthropicStreamContent(content)) => {
                                                content.text.push_str(delta.text.as_str());
                                                if delta.text.len() > 0 {
                                                    let _ = event_sender.send(json!({
                                                        "type": "tokens",
                                                        "content": {
                                                        "text": delta.text,
                                                        }

                                                    }));
                                                }
                                            }
                                            (StreamContentDelta::AnthropicStreamToolInputDelta(
                                                input_json_delta,
                                            ), StreamContent::AnthropicStreamToolUse(tool_use)) => {
                                                // The `content_block_start` for `tool_use`
                                                // initializes `input` as an empty object. To
                                                // append input chunks, we need to convert `input`
                                                // to a string.
                                                if tool_use.input.is_object() {
                                                    tool_use.input = Value::String("".to_string());
                                                }

                                                if let Value::String(ref mut input) = tool_use.input {
                                                    input.push_str(&input_json_delta.partial_json);
                                                }
                                            },
                                            _ => {
                                                Err(anyhow!("Error parsing input chunks from Anthropic response"))?;
                                            }
                                        },
                                    },
                                }
                                }
                                "content_block_stop" => {
                                    let _: StreamContentBlockStop =
                                        match serde_json::from_str(event.data.as_str()) {
                                            Ok(event) => event,
                                            Err(error) => {
                                                Err(anyhow!(
                                                "Error parsing response from Anthropic: {:?} {:?}",
                                                error,
                                                event.data
                                            ))?;
                                                break 'stream;
                                            }
                                        };
                                }
                                "message_delta" => {
                                    let event: StreamMessageDelta =
                                        match serde_json::from_str(event.data.as_str()) {
                                            Ok(event) => event,
                                            Err(error) => {
                                                Err(anyhow!(
                                                "Error parsing response from Anthropic: {:?} {:?}",
                                                error,
                                                event.data
                                            ))?;
                                                break 'stream;
                                            }
                                        };

                                    match final_response.as_mut() {
                                        None => {
                                            Err(anyhow!(
                                                "Error streaming from Anthropic: \
                                                missing `message_start`"
                                            ))?;
                                            break 'stream;
                                        }
                                        Some(response) => {
                                            response.stop_reason = event.delta.stop_reason;
                                            response.usage.output_tokens =
                                                event.usage.output_tokens;
                                        }
                                    }
                                }
                                "message_stop" => {
                                    break 'stream;
                                }
                                "error" => {
                                    let event: AnthropicError =
                                        match serde_json::from_str(event.data.as_str()) {
                                            Ok(event) => event,
                                            Err(_) => {
                                                Err(anyhow!(
                                                    "Streaming error from Anthropic: {:?}",
                                                    event.data
                                                ))?;
                                                break 'stream;
                                            }
                                        };

                                    Err(ModelError {
                                        request_id: request_id.clone(),
                                        message: format!(
                                            "AnthropicError: [{}] {}",
                                            event.error.r#type, event.error.message,
                                        ),
                                        retryable: None,
                                    })?;
                                    break 'stream;
                                }
                                _ => (),
                            }
                        }
                        None => {
                            println!("UNEXPECTED NONE");
                            break 'stream;
                        }
                    }
                }
                Err(e) => {
                    match e {
                        es::Error::UnexpectedResponse(r) => {
                            let status = StatusCode::from_u16(r.status())?;
                            let headers = r.headers()?;
                            let request_id = match headers.get("request-id") {
                                Some(v) => Some(v.to_string()),
                                None => None,
                            };
                            let b = r.body_bytes().await?;

                            let error: Result<AnthropicError, _> = serde_json::from_slice(&b);
                            match error {
                                Ok(error) => {
                                    match error.retryable_streamed(status) {
                                        true => Err(ModelError {
                                            request_id,
                                            message: error.message(),
                                            retryable: Some(ModelErrorRetryOptions {
                                                sleep: Duration::from_millis(500),
                                                factor: 1,
                                                retries: 1,
                                            }),
                                        }),
                                        false => Err(ModelError {
                                            request_id,
                                            message: error.message(),
                                            retryable: None,
                                        }),
                                    }
                                }?,
                                Err(_) => Err(anyhow!(
                                    "Error streaming tokens from Anthropic: status={} data={}",
                                    status,
                                    String::from_utf8_lossy(&b)
                                ))?,
                            }
                        }
                        _ => {
                            Err(anyhow!("Error streaming tokens from Anthropic: {:?}", e))?;
                        }
                    }
                    break 'stream;
                }
            }
        }

        match final_response {
            Some(response) => {
                let chat_response: ChatResponse = ChatResponse::try_from(response)?;
                Ok((chat_response, request_id))
            }
            None => Err(anyhow!("No response from Anthropic")),
        }
    }

    pub async fn streamed_completion(
        &self,
        prompt: &str,
        max_tokens_to_sample: i32,
        temperature: f32,
        top_p: f32,
        top_k: Option<i32>,
        stop: &Vec<String>,
        event_sender: UnboundedSender<Value>,
    ) -> Result<(CompletionResponse, Option<String>)> {
        assert!(self.api_key.is_some());

        let url = self.completions_uri()?.to_string();

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
        builder = match builder.header("X-API-Key", self.api_key.clone().unwrap().as_str()) {
            Ok(builder) => builder,
            Err(e) => return Err(anyhow!("Error setting header: {:?}", e)),
        };
        builder = match builder.header("anthropic-version", "2023-06-01") {
            Ok(builder) => builder,
            Err(e) => return Err(anyhow!("Error setting header: {:?}", e)),
        };

        let body = json!({
            "model": self.id.clone(),
            "prompt": prompt,
            "max_tokens_to_sample": max_tokens_to_sample,
            "temperature": temperature,
            "stop_sequences": stop.clone(),
            "top_p": top_p,
            "top_k": match top_k {
                Some(k) => k,
                None => -1
            },
            "stream": true
        });

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

        let mut stream = client.stream();

        let mut final_response: Option<CompletionResponse> = None;
        let mut completion = String::new();
        let mut request_id: Option<String> = None;

        'stream: loop {
            match stream.try_next().await {
                Ok(stream_next) => match stream_next {
                    Some(es::SSE::Connected((_, headers))) => {
                        request_id = match headers.get("request-id") {
                            Some(v) => Some(v.to_string()),
                            None => None,
                        };
                    }
                    Some(es::SSE::Comment(comment)) => {
                        println!("UNEXPECTED COMMENT {}", comment);
                    }
                    Some(es::SSE::Event(event)) => match event.event_type.as_str() {
                        "completion" => {
                            // println!("RESPONSE {} {}", event.event_type, event.data);
                            let response: CompletionResponse =
                                match serde_json::from_str(event.data.as_str()) {
                                    Ok(response) => response,
                                    Err(error) => {
                                        Err(anyhow!(
                                            "Error parsing response from Anthropic: {:?} {:?}",
                                            error,
                                            event.data
                                        ))?;
                                        break 'stream;
                                    }
                                };

                            match response.stop_reason {
                                Some(stop_reason) => {
                                    final_response = Some(CompletionResponse {
                                        completion,
                                        stop_reason: Some(stop_reason),
                                        stop: response.stop.clone(),
                                        usage: None,
                                    });
                                    break 'stream;
                                }
                                None => (),
                            }

                            completion.push_str(response.completion.as_str());

                            if response.completion.len() > 0 {
                                let _ = event_sender.send(json!({
                                    "type":"tokens",
                                    "content": {
                                        "text":response.completion,
                                    }

                                }));
                            }

                            final_response = Some(response.clone());
                        }
                        "error" => {
                            Err(anyhow!("Streaming error from Anthropic: {:?}", event.data))?;
                            break 'stream;
                        }
                        _ => (),
                    },
                    None => {
                        println!("UNEXPECTED NONE");
                        break 'stream;
                    }
                },
                Err(e) => {
                    match e {
                        es::Error::UnexpectedResponse(r) => {
                            let status = StatusCode::from_u16(r.status())?;
                            let headers = r.headers()?;
                            let request_id = match headers.get("request-id") {
                                Some(v) => Some(v.to_string()),
                                None => None,
                            };
                            let b = r.body_bytes().await?;

                            let error: Result<AnthropicError, _> = serde_json::from_slice(&b);
                            match error {
                                Ok(error) => {
                                    match error.retryable_streamed(status) {
                                        true => Err(ModelError {
                                            request_id,
                                            message: error.message(),
                                            retryable: Some(ModelErrorRetryOptions {
                                                sleep: Duration::from_millis(500),
                                                factor: 1,
                                                retries: 1,
                                            }),
                                        }),
                                        false => Err(ModelError {
                                            request_id,
                                            message: error.message(),
                                            retryable: None,
                                        }),
                                    }
                                }?,
                                Err(_) => Err(anyhow!(
                                    "Error streaming tokens from Anthropic: status={} data={}",
                                    status,
                                    String::from_utf8_lossy(&b)
                                ))?,
                            }
                        }
                        _ => {
                            Err(anyhow!("Error streaming tokens from Anthropic: {:?}", e))?;
                        }
                    }
                    break 'stream;
                }
            }
        }

        return match final_response {
            Some(response) => Ok((response, request_id)),
            None => Err(anyhow!("No response from Anthropic")),
        };
    }

    async fn completion(
        &self,
        prompt: &str,
        max_tokens_to_sample: i32,
        temperature: f32,
        top_p: f32,
        top_k: Option<i32>,
        stop: &Vec<String>,
    ) -> Result<(CompletionResponse, Option<String>)> {
        assert!(self.api_key.is_some());

        let res = reqwest::Client::new()
            .post(self.completions_uri()?.to_string())
            .header("Content-Type", "application/json")
            .header("X-API-Key", self.api_key.clone().unwrap())
            .header("anthropic-version", "2023-06-01")
            .json(&json!({
                "model": self.id.clone(),
                "prompt": prompt,
                "max_tokens_to_sample": max_tokens_to_sample,
                "temperature": temperature,
                // stop sequences need to be non-null for anthropic, otherwise
                // we get 422 Unprocessable Entity
                "stop_sequences": stop.clone(),
                "top_p": top_p,
                "top_k": match top_k {
                    Some(k) => k,
                    None => -1
                },
            }))
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
        prompt: &str,
        mut max_tokens: Option<i32>,
        temperature: f32,
        n: usize,
        stop: &Vec<String>,
        _frequency_penalty: Option<f32>,
        _presence_penalty: Option<f32>,
        top_p: Option<f32>,
        _top_logprobs: Option<i32>,
        _extras: Option<Value>,
        event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<LLMGeneration> {
        assert!(self.api_key.is_some());
        assert!(n > 0);
        if n > 1 {
            return Err(anyhow!(
                "Anthropic only supports generating one sample at a time."
            ))?;
        }

        if let Some(m) = max_tokens {
            if m == -1 {
                let tokens = self.encode(prompt).await?;
                max_tokens = Some(std::cmp::min(
                    (self.context_size() - tokens.len()) as i32,
                    4096,
                ));
            }
        }

        let (c, request_id) = match event_sender {
            Some(es) => {
                let mut completions: Vec<Tokens> = vec![];
                let (response, request_id) = match self
                    .streamed_completion(
                        prompt,
                        match max_tokens {
                            Some(m) => m,
                            None => 256,
                        },
                        temperature,
                        match top_p {
                            Some(p) => p,
                            None => 1.0,
                        },
                        None,
                        stop,
                        es,
                    )
                    .await
                {
                    Ok(response) => response,
                    Err(error) => {
                        return Err(anyhow!("Error streaming from Anthropic: {:?}", error))?;
                    }
                };
                completions.push(Tokens {
                    // Anthropic only return the text
                    text: response.completion.clone(),
                    tokens: Some(vec![]),
                    logprobs: Some(vec![]),
                    top_logprobs: Some(vec![]),
                });

                (completions, request_id)
            }
            None => {
                let mut completions: Vec<Tokens> = vec![];
                // anthropic only supports generating one sample at a time
                // so we loop here and make n API calls
                let (response, request_id) = self
                    .completion(
                        prompt,
                        match max_tokens {
                            Some(m) => m,
                            None => 4096,
                        },
                        temperature,
                        match top_p {
                            Some(p) => p,
                            None => 1.0,
                        },
                        None,
                        stop,
                    )
                    .await?;

                completions.push(Tokens {
                    // Anthropic only return the text
                    text: response.completion.clone(),
                    tokens: Some(vec![]),
                    logprobs: Some(vec![]),
                    top_logprobs: Some(vec![]),
                });

                (completions, request_id)
            }
        };

        let llm_generation = LLMGeneration {
            created: utils::now(),
            completions: c,
            provider: ProviderID::Anthropic.to_string(),
            model: self.id.clone(),
            prompt: Tokens {
                text: prompt.to_string(),
                tokens: None,
                logprobs: None,
                top_logprobs: None,
            },
            usage: None,
            provider_request_id: request_id,
        };

        Ok(llm_generation)
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
        _extras: Option<Value>,
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
                max_tokens = Some(4096);
            }
        }

        let system = match messages.get(0) {
            Some(cm) => match cm {
                ChatMessage::System(system_msg) => Some(system_msg.content.clone()),
                _ => None,
            },
            None => None,
        };

        let base64_map = fetch_and_encode_images(messages.clone()).await?;
        let mut messages = messages
            .iter()
            .skip(match system.as_ref() {
                Some(_) => 1,
                None => 0,
            })
            .map(|cm| {
                let conversion_input = ChatMessageConversionInput {
                    chat_message: &cm,
                    base64_map: &base64_map,
                };

                AnthropicChatMessage::try_from(&conversion_input)
            })
            .collect::<Result<Vec<AnthropicChatMessage>>>()?;

        // Group consecutive messages with the same role by appending their content. This is
        // needed to group all the `tool_results` within one content vector.
        messages = messages.iter().fold(
            vec![],
            |mut acc: Vec<AnthropicChatMessage>, cm: &AnthropicChatMessage| {
                match acc.last_mut() {
                    Some(last) if last.role == cm.role => {
                        last.content.extend(cm.content.clone());
                    }
                    _ => {
                        acc.push(cm.clone());
                    }
                };
                acc
            },
        );

        let tools = functions
            .iter()
            .map(AnthropicTool::try_from)
            .collect::<Result<Vec<AnthropicTool>, _>>()?;

        let tool_choice = match function_call.as_ref() {
            Some(fc) => Some(AnthropicToolChoice::from_str(fc)?),
            None => None,
        };

        let (c, request_id) = match event_sender {
            Some(es) => {
                self.streamed_chat_completion(
                    system,
                    &messages,
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
                        None => 4096,
                    },
                    es,
                )
                .await?
            }
            None => {
                self.chat_completion(
                    system,
                    &messages,
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
                        None => 4096,
                    },
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
