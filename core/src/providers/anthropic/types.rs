use std::{
    collections::HashMap,
    fmt::{self, Display},
    str::FromStr,
};

use crate::providers::{
    chat_messages::{AssistantChatMessage, ChatMessage, ContentBlock, MixedContent},
    llm::{ChatFunction, ChatFunctionCall, ChatMessageRole},
};
use crate::utils::ParseError;
use anyhow::{anyhow, Result};

use hyper::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/*
** COMMON TYPES
*/

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

/*
** OUTPUT TYPES
*/
// This is the main output type from the Anthropic messages API.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ChatResponse {
    pub id: String,
    pub model: String,
    pub role: AnthropicChatMessageRole,
    pub content: Vec<AnthropicResponseContent>,
    pub stop_reason: Option<StopReason>,
    pub usage: Usage,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum StopReason {
    EndTurn,
    MaxTokens,
    StopSequence,
    ToolUse,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Usage {
    pub input_tokens: u64,
    pub output_tokens: u64,
}

// Anthropic content enum (a response is really an array of contents)
#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
#[serde(rename_all = "snake_case", tag = "type")]
pub enum AnthropicResponseContent {
    Text { text: String },
    ToolUse(ToolUse),
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
pub struct ToolUse {
    pub id: String,
    pub name: String,
    pub input: Value,
}

/*
** INPUT TYPES
*/

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct AnthropicContent {
    pub r#type: AnthropicContentType,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none", flatten)]
    pub tool_use: Option<AnthropicContentToolUse>,

    #[serde(skip_serializing_if = "Option::is_none", flatten)]
    pub tool_result: Option<AnthropicContentToolResult>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<AnthropicImageContent>,
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
pub struct AnthropicContentToolResult {
    pub tool_use_id: String,
    pub content: Vec<AnthropicContentToolResultContent>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
#[serde()]
pub struct AnthropicContentToolResultContent {
    pub r#type: AnthropicContentToolResultContentType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<AnthropicImageContent>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AnthropicContentToolResultContentType {
    Text,
    Image,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct AnthropicContentToolUse {
    pub name: String,
    pub id: String,
    pub input: Value,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct AnthropicImageContent {
    pub r#type: String,
    pub media_type: String,
    pub data: String,
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
pub struct AnthropicChatMessage {
    pub content: Vec<AnthropicContent>,
    pub role: AnthropicChatMessageRole,
}

pub struct ChatMessageConversionInput<'a> {
    pub chat_message: &'a ChatMessage,
    pub base64_map: &'a HashMap<String, AnthropicImageContent>,
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
                let content: Vec<AnthropicContentToolResultContent> = match &function_msg.content {
                    ContentBlock::Text(t) => vec![AnthropicContentToolResultContent {
                        r#type: AnthropicContentToolResultContentType::Text,
                        text: Some(t.clone()),
                        source: None,
                    }],
                    ContentBlock::Mixed(m) => m
                        .into_iter()
                        .map(|mb| match mb {
                            MixedContent::TextContent(tc) => {
                                Ok(AnthropicContentToolResultContent {
                                    r#type: AnthropicContentToolResultContentType::Text,
                                    text: Some(tc.text.clone()),
                                    source: None,
                                })
                            }
                            MixedContent::ImageContent(ic) => {
                                if let Some(base64_data) = base64_map.get(&ic.image_url.url) {
                                    Ok(AnthropicContentToolResultContent {
                                        r#type: AnthropicContentToolResultContentType::Image,
                                        source: Some(base64_data.clone()),
                                        text: None,
                                    })
                                } else {
                                    Err(anyhow!("Invalid Image."))
                                }
                            }
                        })
                        .collect::<Result<Vec<AnthropicContentToolResultContent>>>()?,
                };

                // Handling tool_result.
                let tool_result = AnthropicContent {
                    r#type: AnthropicContentType::ToolResult,
                    tool_use: None,
                    tool_result: Some(AnthropicContentToolResult {
                        tool_use_id: function_msg.function_call_id.clone(),
                        content: content,
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
    None,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct AnthropicToolChoice {
    pub r#type: AnthropicToolChoiceType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
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
            "none" => Ok(AnthropicToolChoice {
                r#type: AnthropicToolChoiceType::None,
                name: None,
            }),
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

impl TryFrom<ChatResponse> for AssistantChatMessage {
    type Error = anyhow::Error;

    fn try_from(cr: ChatResponse) -> Result<Self, Self::Error> {
        let text_content = cr
            .content
            .iter()
            .filter_map(|item| item.get_text())
            .filter(|text| !text.is_empty())
            .cloned()
            .collect::<Vec<String>>();

        let text_content = if text_content.is_empty() {
            None
        } else {
            Some(text_content.join(""))
        };

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
            contents: None,
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
