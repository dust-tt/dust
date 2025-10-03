use std::{collections::HashMap, str::FromStr, time::Duration};

use crate::{
    providers::{llm::LLMTokenUsage, provider::ProviderID},
    utils::{self, ParseError},
};
use anyhow::{anyhow, Result};
use eventsource_client as es;
use eventsource_client::Client as ESClient;
use futures::TryStreamExt;
use http::StatusCode;
use hyper::{body::Buf, Uri};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::prelude::*;
use tokio::sync::mpsc::UnboundedSender;
use tokio::time::timeout;

use super::{
    chat_messages::{AssistantChatMessage, ChatMessage, ContentBlock, MixedContent},
    llm::{
        ChatFunction, ChatFunctionCall, ChatMessageRole, LLMChatGeneration, LLMChatLogprob,
        TopLogprob,
    },
    provider::{ModelError, ModelErrorRetryOptions},
};

// Input types.

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
#[serde(rename_all = "lowercase")]
pub enum OpenAIToolType {
    Function,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct OpenAIFunction {
    name: String,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct OpenAIFunctionCall {
    r#type: OpenAIToolType,
    function: OpenAIFunction,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
#[serde(rename_all = "lowercase")]
pub enum OpenAIToolControl {
    Auto,
    Required,
    None,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
#[serde(untagged)]
pub enum OpenAIToolChoice {
    OpenAIToolControl(OpenAIToolControl),
    OpenAIFunctionCall(OpenAIFunctionCall),
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct OpenAIToolFunction {
    pub name: String,
    pub description: Option<String>,
    pub parameters: Option<Value>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct OpenAITool {
    pub r#type: OpenAIToolType,
    pub function: OpenAIToolFunction,
}

impl FromStr for OpenAIToolChoice {
    type Err = ParseError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "auto" => Ok(OpenAIToolChoice::OpenAIToolControl(OpenAIToolControl::Auto)),
            "any" => Ok(OpenAIToolChoice::OpenAIToolControl(
                OpenAIToolControl::Required,
            )),
            "none" => Ok(OpenAIToolChoice::OpenAIToolControl(OpenAIToolControl::None)),
            _ => {
                let function = OpenAIFunctionCall {
                    r#type: OpenAIToolType::Function,
                    function: OpenAIFunction {
                        name: s.to_string(),
                    },
                };
                Ok(OpenAIToolChoice::OpenAIFunctionCall(function))
            }
        }
    }
}

type ResponseFormat = serde_json::Map<String, serde_json::Value>;

// Outputs types.

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct UsageDetails {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cached_tokens: Option<u64>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Usage {
    pub prompt_tokens: u64,
    pub completion_tokens: Option<u64>,
    pub total_tokens: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt_tokens_details: Option<UsageDetails>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct OpenAIToolCallFunction {
    name: String,
    arguments: String,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct OpenAIToolCall {
    #[serde(skip_serializing_if = "Option::is_none")]
    id: Option<String>,
    r#type: OpenAIToolType,
    pub function: OpenAIToolCallFunction,
}

impl TryFrom<&ChatFunctionCall> for OpenAIToolCall {
    type Error = anyhow::Error;

    fn try_from(cf: &ChatFunctionCall) -> Result<Self, Self::Error> {
        Ok(OpenAIToolCall {
            id: Some(cf.id.clone()),
            r#type: OpenAIToolType::Function,
            function: OpenAIToolCallFunction {
                name: cf.name.clone(),
                arguments: cf.arguments.clone(),
            },
        })
    }
}

impl TryFrom<&OpenAIToolCall> for ChatFunctionCall {
    type Error = anyhow::Error;

    fn try_from(tc: &OpenAIToolCall) -> Result<Self, Self::Error> {
        // Some providers don't provide a function call ID (eg google_ai_studio)
        // or provide an empty string ID.
        let id = tc
            .id
            .clone()
            .filter(|id| !id.is_empty())
            .unwrap_or(format!("fc_{}", utils::new_id()[0..9].to_string()));

        Ok(ChatFunctionCall {
            id,
            name: tc.function.name.clone(),
            arguments: tc.function.arguments.clone(),
        })
    }
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
#[serde(rename_all = "lowercase")]
pub enum OpenAIChatMessageRole {
    Assistant,
    Function,
    System,
    Developer,
    Tool,
    User,
}

impl From<&ChatMessageRole> for OpenAIChatMessageRole {
    fn from(role: &ChatMessageRole) -> Self {
        match role {
            ChatMessageRole::Assistant => OpenAIChatMessageRole::Assistant,
            ChatMessageRole::Function => OpenAIChatMessageRole::Function,
            ChatMessageRole::System => OpenAIChatMessageRole::System,
            ChatMessageRole::User => OpenAIChatMessageRole::User,
        }
    }
}

impl FromStr for OpenAIChatMessageRole {
    type Err = ParseError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "system" => Ok(OpenAIChatMessageRole::System),
            "user" => Ok(OpenAIChatMessageRole::User),
            "assistant" => Ok(OpenAIChatMessageRole::Assistant),
            "function" => Ok(OpenAIChatMessageRole::Tool),
            _ => Err(ParseError::with_message("Unknown OpenAIChatMessageRole"))?,
        }
    }
}

impl From<OpenAIChatMessageRole> for ChatMessageRole {
    fn from(value: OpenAIChatMessageRole) -> Self {
        match value {
            OpenAIChatMessageRole::Assistant => ChatMessageRole::Assistant,
            OpenAIChatMessageRole::Function => ChatMessageRole::Function,
            OpenAIChatMessageRole::System => ChatMessageRole::System,
            OpenAIChatMessageRole::Developer => ChatMessageRole::System,
            OpenAIChatMessageRole::Tool => ChatMessageRole::Function,
            OpenAIChatMessageRole::User => ChatMessageRole::User,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
#[serde(rename_all = "snake_case")]
pub enum OpenAITextContentType {
    Text,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct OpenAITextContent {
    #[serde(rename = "type")]
    pub r#type: OpenAITextContentType,
    pub text: String,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct OpenAIImageUrlContent {
    pub url: String,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
#[serde(rename_all = "snake_case")]
pub enum OpenAIImageContentType {
    ImageUrl,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct OpenAIImageContent {
    pub r#type: OpenAIImageContentType,
    pub image_url: OpenAIImageUrlContent,
}

// Define an enum for mixed content
#[derive(Serialize, Deserialize, Debug, PartialEq, Clone)]
#[serde(untagged)]
pub enum OpenAIContentBlock {
    TextContent(OpenAITextContent),
    ImageContent(OpenAIImageContent),
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
#[serde(untagged)]
pub enum OpenAIChatMessageContent {
    Structured(Vec<OpenAIContentBlock>),
    String(String),
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct OpenAIChatMessage {
    pub role: OpenAIChatMessageRole,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<OpenAIChatMessageContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<OpenAIToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct OpenAICompletionChatMessage {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub role: OpenAIChatMessageRole,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<OpenAIToolCall>>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct OpenAITopLogprob {
    pub token: String,
    pub logprob: f32,
    pub bytes: Option<Vec<u8>>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct OpenAIChatChoiceLogprob {
    pub token: String,
    pub logprob: f32,
    pub bytes: Option<Vec<u8>>,
    pub top_logprobs: Vec<OpenAITopLogprob>,
}

impl From<OpenAITopLogprob> for TopLogprob {
    fn from(top_logprob: OpenAITopLogprob) -> Self {
        TopLogprob {
            token: top_logprob.token,
            logprob: top_logprob.logprob,
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct OpenAIChatChoiceLogprobs {
    pub content: Vec<OpenAIChatChoiceLogprob>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct OpenAIChatChoice {
    pub message: OpenAICompletionChatMessage,
    pub index: usize,
    pub finish_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub logprobs: Option<OpenAIChatChoiceLogprobs>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct OpenAIChatCompletion {
    pub id: Option<String>,
    pub object: String,
    pub created: u64,
    pub choices: Vec<OpenAIChatChoice>,
    pub usage: Option<Usage>,
}

// This code performs a type conversion with information loss when converting to ChatFunctionCall.
// It only supports one tool call, so it takes the first one from the vector of OpenAIToolCall,
// hence potentially discarding other tool calls.
impl TryFrom<&OpenAICompletionChatMessage> for AssistantChatMessage {
    type Error = anyhow::Error;

    fn try_from(cm: &OpenAICompletionChatMessage) -> Result<Self, Self::Error> {
        let role = ChatMessageRole::from(cm.role.clone());
        let content = match cm.content.as_ref() {
            Some(c) => Some(c.clone()),
            None => None,
        };

        let function_calls = if let Some(tool_calls) = cm.tool_calls.as_ref() {
            let cfc = tool_calls
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

        let name = match cm.name.as_ref() {
            Some(c) => Some(c.clone()),
            None => None,
        };

        Ok(AssistantChatMessage {
            content,
            role,
            name,
            function_call,
            function_calls,
            contents: None,
        })
    }
}

impl TryFrom<&ContentBlock> for OpenAIChatMessageContent {
    type Error = anyhow::Error;

    fn try_from(cm: &ContentBlock) -> Result<Self, Self::Error> {
        match cm {
            ContentBlock::Text(t) => Ok(OpenAIChatMessageContent::Structured(vec![
                OpenAIContentBlock::TextContent(OpenAITextContent {
                    r#type: OpenAITextContentType::Text,
                    text: t.clone(),
                }),
            ])),
            ContentBlock::Mixed(m) => {
                let content: Vec<OpenAIContentBlock> = m
                    .into_iter()
                    .map(|mb| match mb {
                        MixedContent::TextContent(tc) => {
                            Ok(OpenAIContentBlock::TextContent(OpenAITextContent {
                                r#type: OpenAITextContentType::Text,
                                text: tc.text.clone(),
                            }))
                        }
                        MixedContent::ImageContent(ic) => {
                            Ok(OpenAIContentBlock::ImageContent(OpenAIImageContent {
                                r#type: OpenAIImageContentType::ImageUrl,
                                image_url: OpenAIImageUrlContent {
                                    url: ic.image_url.url.clone(),
                                },
                            }))
                        }
                    })
                    .collect::<Result<Vec<OpenAIContentBlock>>>()?;

                Ok(OpenAIChatMessageContent::Structured(content))
            }
        }
    }
}

impl TryFrom<&String> for OpenAIChatMessageContent {
    type Error = anyhow::Error;

    fn try_from(t: &String) -> Result<Self, Self::Error> {
        Ok(OpenAIChatMessageContent::Structured(vec![
            OpenAIContentBlock::TextContent(OpenAITextContent {
                r#type: OpenAITextContentType::Text,
                text: t.clone(),
            }),
        ]))
    }
}

impl TryFrom<&ChatMessage> for OpenAIChatMessage {
    type Error = anyhow::Error;

    fn try_from(cm: &ChatMessage) -> Result<Self, Self::Error> {
        match cm {
            ChatMessage::Assistant(assistant_msg) => Ok(OpenAIChatMessage {
                content: match &assistant_msg.content {
                    Some(c) => Some(OpenAIChatMessageContent::try_from(c)?),
                    None => None,
                },
                name: assistant_msg.name.clone(),
                role: OpenAIChatMessageRole::from(&assistant_msg.role),
                tool_calls: match assistant_msg.function_calls.as_ref() {
                    Some(fc) => Some(
                        fc.into_iter()
                            .map(|f| OpenAIToolCall::try_from(f))
                            .collect::<Result<Vec<OpenAIToolCall>, _>>()?,
                    ),
                    None => None,
                },
                tool_call_id: None,
            }),
            ChatMessage::Function(function_msg) => Ok(OpenAIChatMessage {
                content: Some(OpenAIChatMessageContent::try_from(&function_msg.content)?),
                name: None,
                role: OpenAIChatMessageRole::Tool,
                tool_calls: None,
                tool_call_id: Some(function_msg.function_call_id.clone()),
            }),
            ChatMessage::System(system_msg) => Ok(OpenAIChatMessage {
                content: Some(OpenAIChatMessageContent::try_from(&system_msg.content)?),
                name: None,
                role: OpenAIChatMessageRole::from(&system_msg.role),
                tool_calls: None,
                tool_call_id: None,
            }),
            ChatMessage::User(user_msg) => Ok(OpenAIChatMessage {
                content: Some(OpenAIChatMessageContent::try_from(&user_msg.content)?),
                name: user_msg.name.clone(),
                role: OpenAIChatMessageRole::from(&user_msg.role),
                tool_calls: None,
                tool_call_id: None,
            }),
        }
    }
}

impl TryFrom<&ChatFunction> for OpenAITool {
    type Error = anyhow::Error;

    fn try_from(f: &ChatFunction) -> Result<Self, Self::Error> {
        Ok(OpenAITool {
            r#type: OpenAIToolType::Function,
            function: OpenAIToolFunction {
                name: f.name.clone(),
                description: f.description.clone(),
                parameters: f.parameters.clone(),
            },
        })
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ChatDelta {
    pub delta: Value,
    pub index: usize,
    pub finish_reason: Option<String>,
    pub logprobs: Option<OpenAIChatChoiceLogprobs>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ChatChunk {
    pub id: Option<String>,
    pub object: String,
    pub created: u64,
    pub model: String,
    pub choices: Vec<ChatDelta>,
    pub usage: Option<Usage>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct InnerError {
    pub message: String,
    #[serde(alias = "type")]
    pub _type: String,
    pub param: Option<String>,
    pub internal_message: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct OpenAIError {
    pub error: InnerError,
}

pub struct OpenAICompatibleError {
    pub provider: String,
    pub error: OpenAIError,
}

impl OpenAIError {
    pub fn with_provider(self, provider: &str) -> OpenAICompatibleError {
        OpenAICompatibleError {
            provider: provider.to_string(),
            error: self,
        }
    }

    pub fn retryable(&self) -> bool {
        match self.error._type.as_str() {
            "requests" => true,
            "server_error" => match &self.error.internal_message {
                Some(message) if message.contains("retry") => true,
                _ => false,
            },
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
        match self.error._type.as_str() {
            "server_error" => match self.error.internal_message {
                Some(_) => true,
                None => false,
            },
            _ => false,
        }
    }
}

impl OpenAICompatibleError {
    pub fn message(&self) -> String {
        match &self.error.error.internal_message {
            Some(ref msg) => format!(
                "{}Error: [{}] {} internal_message={}",
                self.provider, self.error.error._type, self.error.error.message, msg,
            ),
            None => format!(
                "{}Error: [{}] {}",
                self.provider, self.error.error._type, self.error.error.message,
            ),
        }
    }

    pub fn retryable(&self) -> bool {
        self.error.retryable()
    }

    pub fn retryable_streamed(&self, status: StatusCode) -> bool {
        self.error.retryable_streamed(status)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransformSystemMessages {
    ReplaceWithDeveloper,
    Keep,
}

pub async fn openai_compatible_chat_completion(
    uri: Uri,
    model_id: String,
    api_key: String,
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
    logprobs: Option<bool>,
    top_logprobs: Option<i32>,
    openai_extras: Option<Value>,
    event_sender: Option<UnboundedSender<Value>>,
    disable_provider_streaming: bool,
    transform_system_messages: TransformSystemMessages,
    provider_name: String,
    squash_text_contents: bool,
) -> Result<LLMChatGeneration> {
    if let Some(m) = max_tokens {
        if m == -1 {
            max_tokens = None;
        }
    }

    let (openai_org_id, openai_user, response_format, reasoning_effort) = match &openai_extras {
        None => (None, None, None, None),
        Some(v) => (
            match v.get("openai_organization_id") {
                Some(Value::String(o)) => Some(o.to_string()),
                _ => None,
            },
            match v.get("openai_user") {
                Some(Value::String(u)) => Some(u.to_string()),
                _ => None,
            },
            match v.get("response_format") {
                Some(Value::Object(f)) => Some(f.clone()),
                _ => None,
            },
            match v.get("reasoning_effort") {
                Some(Value::String(r)) => Some(r.to_string()),
                _ => None,
            },
        ),
    };

    let tool_choice = match function_call.as_ref() {
        Some(fc) => Some(OpenAIToolChoice::from_str(fc)?),
        None => None,
    };

    let tools = functions
        .iter()
        .map(OpenAITool::try_from)
        .collect::<Result<Vec<OpenAITool>, _>>()?;

    let openai_messages =
        to_openai_messages(messages, transform_system_messages, squash_text_contents)?;

    let stream_output = event_sender.is_some();

    let (c, request_id) = if !disable_provider_streaming && stream_output {
        streamed_chat_completion(
            uri,
            api_key,
            openai_org_id,
            Some(model_id.clone()),
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
            presence_penalty,
            frequency_penalty,
            response_format,
            reasoning_effort,
            logprobs,
            top_logprobs,
            openai_user,
            event_sender.clone(),
            provider_name,
        )
        .await?
    } else {
        chat_completion(
            uri,
            api_key,
            openai_org_id,
            Some(model_id.clone()),
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
            presence_penalty,
            frequency_penalty,
            response_format,
            reasoning_effort,
            logprobs,
            top_logprobs,
            openai_user,
            provider_name,
        )
        .await?
    };

    // We support streaming the output in the event sender, even if we're not
    // using streaming from the provider.
    if stream_output && disable_provider_streaming {
        let sender = event_sender.as_ref().unwrap();
        for choice in &c.choices {
            if let Some(content) = &choice.message.content {
                // Split content into smaller chunks to simulate streaming.
                for chunk in content
                    .chars()
                    .collect::<Vec<char>>()
                    .chunks(4)
                    .map(|c| c.iter().collect::<String>())
                {
                    let _ = sender.send(json!({
                        "type": "tokens",
                        "content": {
                            "text": chunk,
                        },
                    }));
                    // Add a small delay to simulate real-time streaming.
                    tokio::time::sleep(std::time::Duration::from_millis(20)).await;
                }
            }
        }
    }

    assert!(c.choices.len() > 0);

    Ok(LLMChatGeneration {
        created: utils::now(),
        provider: ProviderID::OpenAI.to_string(),
        model: model_id.clone(),
        completions: c
            .choices
            .iter()
            .map(|c| AssistantChatMessage::try_from(&c.message))
            .collect::<Result<Vec<_>>>()?,
        usage: c.usage.map(|usage| LLMTokenUsage {
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens.unwrap_or(0),
            cached_tokens: usage
                .prompt_tokens_details
                .and_then(|details| details.cached_tokens),
            reasoning_tokens: None,
        }),
        provider_request_id: request_id,
        logprobs: logprobs_from_choices(&c.choices),
    })
}

fn to_openai_messages(
    messages: &Vec<ChatMessage>,
    transform_system_messages: TransformSystemMessages,
    squash_text_contents: bool,
) -> Result<Vec<OpenAIChatMessage>, anyhow::Error> {
    let mut oai_messages = messages
        .into_iter()
        // First convert to OpenAI chat messages.
        .map(|m| OpenAIChatMessage::try_from(m))
        .collect::<Result<Vec<_>>>()?
        .into_iter()
        // Decide which content format to use for each message (structured or string).
        // If there are images, we need to use structured format.
        // If there is a single text content, we can always use string format (equivalent and compatible everywhere).
        // Otherwise, if there are multiple text contents, we either squash them or keep the structured format,
        // depending on the `squash_text_contents` flag.
        .map(|m| match m.content {
            None => m,
            Some(OpenAIChatMessageContent::String(_)) => m,
            Some(OpenAIChatMessageContent::Structured(contents)) => {
                let all_contents_are_text = contents
                    .iter()
                    .all(|c| matches!(c, OpenAIContentBlock::TextContent(_)));
                let is_tool_result = m.tool_call_id.is_some();

                OpenAIChatMessage {
                    role: m.role,
                    name: m.name,
                    tool_call_id: m.tool_call_id,
                    tool_calls: m.tool_calls,
                    content: match (
                        contents.len(),
                        all_contents_are_text,
                        squash_text_contents,
                        is_tool_result,
                    ) {
                        // Case 0: there's no content => return None
                        (0, _, _, _) => None,
                        // Case 1: there's only a single text content => use string format
                        (1, true, _, _) => Some(OpenAIChatMessageContent::String(
                            match contents.into_iter().next().unwrap() {
                                OpenAIContentBlock::TextContent(tc) => tc.text.clone(),
                                _ => unreachable!(),
                            },
                        )),
                        // Case 2: There's more than one content, all contents are text and we want to squash them => squash them
                        (_, true, true, _) => Some(OpenAIChatMessageContent::String(
                            contents
                                .into_iter()
                                .map(|c| match c {
                                    OpenAIContentBlock::TextContent(tc) => tc.text.clone(),
                                    _ => unreachable!(),
                                })
                                .collect::<Vec<String>>()
                                .join("\n"),
                        )),
                        // Case 3: it's a tool result, openai only supports string format for tool results, return the stringified content as a string
                        (_, _, _, true) => Some(OpenAIChatMessageContent::String(
                            contents
                                .into_iter()
                                .map(|c| match c {
                                    OpenAIContentBlock::TextContent(tc) => tc.text.clone(),
                                    OpenAIContentBlock::ImageContent(ic) => {
                                        ic.image_url.url.clone()
                                    }
                                })
                                .collect::<Vec<String>>()
                                .join("\n"),
                        )),
                        // Case 4: there's more than one content, the content isn't text or we don't want to squash them => keep structured format
                        (_, _, _, _) => Some(OpenAIChatMessageContent::Structured(contents)),
                    },
                }
            }
        })
        // Truncate the tool_ids to 40 characters.
        .map(|m| {
            fn truncate_id(id: Option<String>) -> Option<String> {
                id.map(|id| id.chars().take(40).collect::<String>())
            }
            OpenAIChatMessage {
                role: m.role,
                name: m.name,
                tool_call_id: truncate_id(m.tool_call_id),
                tool_calls: m.tool_calls.map(|tool_calls| {
                    tool_calls
                        .into_iter()
                        .map(|tc| OpenAIToolCall {
                            id: truncate_id(tc.id),
                            function: tc.function,
                            r#type: tc.r#type,
                        })
                        .collect()
                }),
                content: m.content,
            }
        })
        .collect::<Vec<_>>();

    // Replace system messages with developer messages if requested.
    // Some newer models no longer support "system" as a role and support a "developer" role.
    for m in oai_messages.iter_mut() {
        if m.role == OpenAIChatMessageRole::System
            && transform_system_messages == TransformSystemMessages::ReplaceWithDeveloper
        {
            m.role = OpenAIChatMessageRole::Developer;
        }
    }

    Ok(oai_messages)
}

async fn streamed_chat_completion(
    uri: Uri,
    api_key: String,
    organization_id: Option<String>,
    model_id: Option<String>,
    messages: &Vec<OpenAIChatMessage>,
    tools: Vec<OpenAITool>,
    tool_choice: Option<OpenAIToolChoice>,
    temperature: f32,
    top_p: f32,
    n: usize,
    stop: &Vec<String>,
    max_tokens: Option<i32>,
    presence_penalty: Option<f32>,
    frequency_penalty: Option<f32>,
    response_format: Option<ResponseFormat>,
    reasoning_effort: Option<String>,
    logprobs: Option<bool>,
    top_logprobs: Option<i32>,
    user: Option<String>,
    event_sender: Option<UnboundedSender<Value>>,
    provider_name: String,
) -> Result<(OpenAIChatCompletion, Option<String>)> {
    let url = uri.to_string();

    let mut builder = match es::ClientBuilder::for_url(url.as_str()) {
        Ok(b) => b,
        Err(_) => {
            return Err(anyhow!(format!(
                "Error creating streamed client to {}",
                provider_name
            )))
        }
    };
    builder = match builder.method(String::from("POST")).header(
        "Authorization",
        format!("Bearer {}", api_key.clone()).as_str(),
    ) {
        Ok(b) => b,
        Err(_) => {
            return Err(anyhow!(format!(
                "Error creating streamed client to {}",
                provider_name
            )))
        }
    };
    builder = match builder.header("Content-Type", "application/json") {
        Ok(b) => b,
        Err(_) => {
            return Err(anyhow!(format!(
                "Error creating streamed client to {}",
                provider_name
            )))
        }
    };
    builder = match builder.header("api-key", api_key.clone().as_str()) {
        Ok(b) => b,
        Err(_) => {
            return Err(anyhow!(format!(
                "Error creating streamed client to {}",
                provider_name
            )))
        }
    };

    if let Some(org_id) = organization_id {
        builder = builder
            .header("OpenAI-Organization", org_id.as_str())
            .map_err(|_| {
                anyhow!(format!(
                    "Error creating streamed client to {}",
                    provider_name
                ))
            })?;
    }

    let mut body = json!({
        "messages": messages,
        "temperature": temperature,
        "top_p": top_p,
        "n": n,
        "stream": true,
        "stream_options": HashMap::from([("include_usage", true)]),
    });
    if let Some(presence_penalty) = presence_penalty {
        body["presence_penalty"] = json!(presence_penalty);
    }
    if let Some(frequency_penalty) = frequency_penalty {
        body["frequency_penalty"] = json!(frequency_penalty);
    }
    if user.is_some() {
        body["user"] = json!(user);
    }
    if model_id.is_some() {
        body["model"] = json!(model_id);
    }
    if let Some(mt) = max_tokens {
        body["max_tokens"] = mt.into();
    }
    if !stop.is_empty() {
        body["stop"] = json!(stop);
    }

    if tools.len() > 0 {
        body["tools"] = json!(tools);
    }
    if let Some(tool_choice) = tool_choice {
        body["tool_choice"] = json!(tool_choice);
    }
    if let Some(response_format) = response_format {
        // Guard against empty object response_format (must include a string "type").
        if let Some(Value::String(_)) = response_format.get("type") {
            body["response_format"] = json!(response_format);
        }
    }
    if let Some(reasoning_effort) = reasoning_effort {
        body["reasoning_effort"] = json!(reasoning_effort);
    }
    if let Some(logprobs) = logprobs {
        body["logprobs"] = json!(logprobs);
    }
    if let Some(top_logprobs) = top_logprobs {
        body["top_logprobs"] = json!(top_logprobs);
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

    let mut stream = client.stream();

    let mut chunks: Vec<ChatChunk> = Vec::new();
    let mut usage = None;
    let mut request_id: Option<String> = None;

    'stream: loop {
        match stream.try_next().await {
            Ok(e) => match e {
                Some(es::SSE::Connected((_, headers))) => {
                    request_id = match headers.get("x-request-id") {
                        Some(v) => Some(v.to_string()),
                        None => None,
                    };
                }
                Some(es::SSE::Comment(_)) => {
                    println!("UNEXPECTED COMMENT");
                }
                Some(es::SSE::Event(e)) => match e.data.as_str() {
                    "[DONE]" => {
                        break 'stream;
                    }
                    _ => {
                        let index = chunks.len();

                        let chunk: ChatChunk = match serde_json::from_str(e.data.as_str()) {
                            Ok(c) => c,
                            Err(err) => {
                                let error: Result<OpenAIError, _> =
                                    serde_json::from_str(e.data.as_str());
                                match error {
                                    Ok(error) => {
                                        match error.retryable_streamed(StatusCode::OK) && index == 0
                                        {
                                            true => Err(ModelError {
                                                request_id: request_id.clone(),
                                                message: error
                                                    .with_provider(&provider_name)
                                                    .message(),
                                                retryable: Some(ModelErrorRetryOptions {
                                                    sleep: Duration::from_millis(500),
                                                    factor: 2,
                                                    retries: 3,
                                                }),
                                            })?,
                                            false => Err(ModelError {
                                                request_id: request_id.clone(),
                                                message: error
                                                    .with_provider(&provider_name)
                                                    .message(),
                                                retryable: None,
                                            })?,
                                        }
                                        break 'stream;
                                    }
                                    Err(_) => {
                                        Err(anyhow!(format!(
                                            "{}Error: failed parsing streamed \
                                                 completion from {} err={} data={}",
                                            provider_name,
                                            provider_name,
                                            err,
                                            e.data.as_str(),
                                        )))?;
                                        break 'stream;
                                    }
                                }
                            }
                        };

                        // Store usage
                        match &chunk.usage {
                            Some(received_usage) => {
                                usage = Some(received_usage.clone());
                            }
                            None => (),
                        };

                        // Only stream if choices is length 1 but should always be the case.
                        match event_sender.as_ref() {
                            Some(sender) => {
                                if chunk.choices.len() == 1 {
                                    // we ignore the role for generating events

                                    // If we get `content` in the delta object we stream "tokens".
                                    match chunk.choices[0].delta.get("content") {
                                        None => (),
                                        Some(content) => match content.as_str() {
                                            None => (),
                                            Some(s) => {
                                                if s.len() > 0 {
                                                    let _ = sender.send(json!({
                                                        "type": "tokens",
                                                        "content": {
                                                            "text": s,
                                                        },
                                                    }));
                                                }
                                            }
                                        },
                                    };

                                    // Emit a `function_call` event per tool_call.
                                    if let Some(tool_calls) = chunk.choices[0]
                                        .delta
                                        .get("tool_calls")
                                        .and_then(|v| v.as_array())
                                    {
                                        tool_calls.iter().for_each(|tool_call| {
                                            match tool_call.get("function") {
                                                Some(f) => {
                                                    if let Some(Value::String(name)) = f.get("name")
                                                    {
                                                        let _ = sender.send(json!({
                                                            "type": "function_call",
                                                            "content": {
                                                                "name": name,
                                                            },
                                                        }));
                                                    }
                                                }
                                                _ => (),
                                            }
                                        });
                                    }
                                }
                            }
                            None => (),
                        };

                        if !chunk.choices.is_empty() {
                            chunks.push(chunk);
                        }
                    }
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
                        let request_id = match headers.get("x-request-id") {
                            Some(v) => Some(v.to_string()),
                            None => None,
                        };
                        let b = r.body_bytes().await?;

                        let error: Result<OpenAIError, _> = serde_json::from_slice(&b);
                        match error {
                            Ok(error) => {
                                match error.retryable_streamed(status) {
                                    true => Err(ModelError {
                                        request_id,
                                        message: error.with_provider(&provider_name).message(),
                                        retryable: Some(ModelErrorRetryOptions {
                                            sleep: Duration::from_millis(500),
                                            factor: 2,
                                            retries: 3,
                                        }),
                                    }),
                                    false => Err(ModelError {
                                        request_id,
                                        message: error.with_provider(&provider_name).message(),
                                        retryable: None,
                                    }),
                                }
                            }?,
                            Err(_) => {
                                Err(anyhow!(
                                    "Error streaming tokens from {}: status={} data={}",
                                    &provider_name,
                                    status,
                                    String::from_utf8_lossy(&b)
                                ))?;
                            }
                        }
                    }
                    _ => {
                        Err(anyhow!(
                            "Error streaming tokens from {}: {:?}",
                            &provider_name,
                            e
                        ))?;
                    }
                }
                break 'stream;
            }
        }
    }

    let mut completion = {
        let f = match chunks.len() {
            0 => Err(anyhow!("No chunks received from {}", provider_name)),
            _ => Ok(chunks[0].clone()),
        }?;

        // merge logprobs from all choices of all chunks
        let logprobs: Vec<OpenAIChatChoiceLogprob> = chunks
            .iter()
            .flat_map(|chunk| {
                chunk
                    .choices
                    .iter()
                    .filter_map(|choice| choice.logprobs.as_ref().map(|lp| lp.content.clone()))
            })
            .flatten()
            .collect();

        let mut c = OpenAIChatCompletion {
            id: f.id.clone(),
            object: f.object.clone(),
            created: f.created,
            choices: f
                .choices
                .iter()
                .map(|c| OpenAIChatChoice {
                    message: OpenAICompletionChatMessage {
                        content: Some("".to_string()),
                        name: None,
                        role: OpenAIChatMessageRole::System,
                        tool_calls: None,
                        tool_call_id: None,
                    },
                    index: c.index,
                    finish_reason: None,
                    logprobs: match logprobs.len() {
                        0 => None,
                        _ => Some(OpenAIChatChoiceLogprobs {
                            content: logprobs.clone(),
                        }),
                    },
                })
                .collect::<Vec<_>>(),
            usage,
        };

        for i in 0..chunks.len() {
            let a = chunks[i].clone();
            if a.choices.len() != f.choices.len() {
                Err(anyhow!("Inconsistent number of choices in streamed chunks"))?;
            }
            for j in 0..a.choices.len() {
                match a.choices.get(j).unwrap().finish_reason.clone() {
                    None => (),
                    Some(f) => c.choices[j].finish_reason = Some(f),
                };

                match a.choices[j].delta.get("role") {
                    None => (),
                    Some(role) => match role.as_str() {
                        None => (),
                        Some(r) => {
                            c.choices[j].message.role = OpenAIChatMessageRole::from_str(r)?;
                        }
                    },
                };

                match a.choices[j].delta.get("content") {
                    None => (),
                    Some(content) => match content.as_str() {
                        None => (),
                        Some(s) => {
                            c.choices[j].message.content = Some(format!(
                                "{}{}",
                                c.choices[j]
                                    .message
                                    .content
                                    .as_ref()
                                    .unwrap_or(&String::new()),
                                s
                            ));
                        }
                    },
                };

                if let Some(tool_calls) = a.choices[j]
                    .delta
                    .get("tool_calls")
                    .and_then(|v| v.as_array())
                {
                    for tool_call in tool_calls {
                        match (
                            tool_call.get("type").and_then(|v| v.as_str()),
                            tool_call.get("id"),
                            tool_call.get("function"),
                        ) {
                            (Some("function"), Some(Value::String(id)), Some(f)) => {
                                if let Some(Value::String(name)) = f.get("name") {
                                    // Get initial arguments, treating empty string as no arguments
                                    let initial_arguments = f
                                        .get("arguments")
                                        .and_then(|v| v.as_str())
                                        .filter(|s| !s.is_empty())
                                        .map(|s| s.to_string())
                                        .unwrap_or_default();

                                    c.choices[j]
                                        .message
                                        .tool_calls
                                        .get_or_insert_with(Vec::new)
                                        .push(OpenAIToolCall {
                                            // Use the id directly
                                            id: Some(id.clone()),
                                            r#type: OpenAIToolType::Function,
                                            function: OpenAIToolCallFunction {
                                                name: name.clone(),
                                                arguments: initial_arguments,
                                            },
                                        });
                                }
                            }
                            // Handle subsequent chunks - either id is null or missing
                            (_, id, Some(f)) if id.is_none() || matches!(id, Some(Value::Null)) => {
                                if let (Some(Value::Number(idx)), Some(Value::String(a))) =
                                    (tool_call.get("index"), f.get("arguments"))
                                {
                                    let index: usize = idx
                                        .as_u64()
                                        .ok_or_else(|| anyhow!("Missing index for tools"))?
                                        .try_into()
                                        .map_err(|e| {
                                            anyhow!("Invalid index value for tools: {:?}", e)
                                        })?;

                                    let tool_calls = c.choices[j]
                                        .message
                                        .tool_calls
                                        .as_mut()
                                        .ok_or(anyhow!("Missing tool calls"))?;

                                    if index >= tool_calls.len() {
                                        return Err(anyhow!(
                                            "Index out-of-bound for tool_calls: {}",
                                            index
                                        ));
                                    }

                                    tool_calls[index].function.arguments += &a;
                                }
                            }
                            _ => (),
                        }
                    }
                }
            }
        }
        c
    };

    // for all messages, edit the content and strip leading and trailing spaces and \n
    for m in completion.choices.iter_mut() {
        m.message.content = match m.message.content.as_ref() {
            None => None,
            Some(c) => Some(c.trim().to_string()),
        };
    }

    Ok((completion, request_id))
}

async fn chat_completion(
    uri: Uri,
    api_key: String,
    organization_id: Option<String>,
    model_id: Option<String>,
    messages: &Vec<OpenAIChatMessage>,
    tools: Vec<OpenAITool>,
    tool_choice: Option<OpenAIToolChoice>,
    temperature: f32,
    top_p: f32,
    n: usize,
    stop: &Vec<String>,
    max_tokens: Option<i32>,
    presence_penalty: Option<f32>,
    frequency_penalty: Option<f32>,
    response_format: Option<ResponseFormat>,
    reasoning_effort: Option<String>,
    logprobs: Option<bool>,
    top_logprobs: Option<i32>,
    user: Option<String>,
    provider_name: String,
) -> Result<(OpenAIChatCompletion, Option<String>)> {
    let mut body = json!({
        "messages": messages,
        "temperature": temperature,
        "top_p": top_p,
        "n": n,
    });
    if let Some(presence_penalty) = presence_penalty {
        body["presence_penalty"] = json!(presence_penalty);
    }
    if let Some(frequency_penalty) = frequency_penalty {
        body["frequency_penalty"] = json!(frequency_penalty);
    }
    if user.is_some() {
        body["user"] = json!(user);
    }
    if let Some(model_id) = model_id {
        body["model"] = json!(model_id);
    }
    if let Some(mt) = max_tokens {
        body["max_tokens"] = mt.into();
    }
    if !stop.is_empty() {
        body["stop"] = json!(stop);
    }

    if let Some(response_format) = response_format {
        // Guard against empty object response_format (must include a string "type").
        if let Some(Value::String(_)) = response_format.get("type") {
            body["response_format"] = json!(response_format);
        }
    }
    if tools.len() > 0 {
        body["tools"] = json!(tools);
    }
    if let Some(tool_choice) = tool_choice {
        body["tool_choice"] = json!(tool_choice);
    }
    if let Some(reasoning_effort) = reasoning_effort {
        body["reasoning_effort"] = json!(reasoning_effort);
    }
    if let Some(logprobs) = logprobs {
        body["logprobs"] = json!(logprobs);
    }
    if let Some(top_logprobs) = top_logprobs {
        body["top_logprobs"] = json!(top_logprobs);
    }

    let mut req = reqwest::Client::new()
        .post(uri.to_string())
        .header("Content-Type", "application/json")
        // This one is for `openai`.
        .header("Authorization", format!("Bearer {}", api_key.clone()))
        // This one is for `azure_openai`.
        .header("api-key", api_key.clone());

    if let Some(organization_id) = organization_id {
        req = req.header(
            "OpenAI-Organization",
            &format!("{}", organization_id.clone()),
        );
    }

    let req = req.json(&body);

    let res = match timeout(Duration::new(180, 0), req.send()).await {
        Ok(Ok(res)) => res,
        Ok(Err(e)) => Err(e)?,
        Err(_) => Err(anyhow!(format!(
            "Timeout sending request to {} after 180s",
            provider_name
        )))?,
    };

    let res_headers = res.headers();
    let request_id = match res_headers.get("x-request-id") {
        Some(request_id) => Some(request_id.to_str()?.to_string()),
        None => None,
    };

    let body = match timeout(Duration::new(180, 0), res.bytes()).await {
        Ok(Ok(body)) => body,
        Ok(Err(e)) => Err(e)?,
        Err(_) => Err(anyhow!(format!(
            "Timeout reading response from {} after 180s",
            provider_name
        )))?,
    };

    let mut b: Vec<u8> = vec![];
    body.reader().read_to_end(&mut b)?;
    let c: &[u8] = &b;

    let mut completion: OpenAIChatCompletion = match serde_json::from_slice(c) {
        Ok(c) => Ok(c),
        Err(_) => {
            let error: OpenAIError = serde_json::from_slice(c)?;
            match error.retryable() {
                true => Err(ModelError {
                    request_id: request_id.clone(),
                    message: error.with_provider(&provider_name).message(),
                    retryable: Some(ModelErrorRetryOptions {
                        sleep: Duration::from_millis(500),
                        factor: 2,
                        retries: 3,
                    }),
                }),
                false => Err(ModelError {
                    request_id: request_id.clone(),
                    message: error.with_provider(&provider_name).message(),
                    retryable: Some(ModelErrorRetryOptions {
                        sleep: Duration::from_millis(500),
                        factor: 1,
                        retries: 1,
                    }),
                }),
            }
        }
    }?;

    // for all messages, edit the content and strip leading and trailing spaces and \n
    for m in completion.choices.iter_mut() {
        m.message.content = match m.message.content.as_ref() {
            None => None,
            Some(c) => Some(c.trim().to_string()),
        };
    }

    Ok((completion, request_id))
}

fn logprobs_from_choices(choices: &Vec<OpenAIChatChoice>) -> Option<Vec<LLMChatLogprob>> {
    let lp: Vec<LLMChatLogprob> = choices
        .iter()
        .filter_map(|choice| choice.logprobs.as_ref())
        .flat_map(|lp| {
            lp.content.iter().map(|content_logprob| LLMChatLogprob {
                token: content_logprob.token.clone(),
                logprob: content_logprob.logprob,
                top_logprobs: match content_logprob.top_logprobs.len() {
                    0 => None,
                    _ => Some(
                        content_logprob
                            .top_logprobs
                            .iter()
                            .map(|top_logprob| top_logprob.clone().into())
                            .collect(),
                    ),
                },
            })
        })
        .collect();

    match lp.len() {
        0 => None,
        _ => Some(lp),
    }
}
