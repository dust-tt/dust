use crate::providers::{
    chat_messages::{AssistantChatMessage, AssistantContentItem, ReasoningContent},
    helpers::Base64EncodedImageContent,
    llm::{ChatFunctionCall, ChatMessageRole},
};
use crate::utils::ParseError;
use anyhow::Result;
use hyper::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fmt::{self, Display},
    str::FromStr,
};

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
    pub cache_read_input_tokens: Option<u64>,
    pub cache_creation_input_tokens: Option<u64>,
}

// Anthropic content enum (a response is really an array of contents)
#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
#[serde(rename_all = "snake_case", tag = "type")]
pub enum AnthropicResponseContent {
    Text { text: String },
    ToolUse(ToolUse),
    Thinking(ThinkingContent),
    RedactedThinking(RedactedThinkingContent),
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct ToolUse {
    pub id: String,
    pub name: String,
    pub input: Value,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct ThinkingContent {
    pub thinking: String,
    pub signature: String,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct RedactedThinkingContent {
    pub data: String,
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

    #[serde(skip_serializing_if = "Option::is_none")]
    pub thinking: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_control: Option<AnthropicCacheControl>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AnthropicContentType {
    Text,
    Image,
    ToolUse,
    ToolResult,
    Thinking,
    RedactedThinking,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct AnthropicCacheControl {
    pub r#type: AnthropicCacheControlType,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AnthropicCacheControlType {
    Ephemeral,
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

impl From<Base64EncodedImageContent> for AnthropicImageContent {
    fn from(encoded: Base64EncodedImageContent) -> Self {
        AnthropicImageContent {
            r#type: "base64".to_string(),
            media_type: encoded.media_type,
            data: encoded.data,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct AnthropicChatMessage {
    pub content: Vec<AnthropicContent>,
    pub role: AnthropicChatMessageRole,
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

impl TryFrom<ChatResponse> for AssistantChatMessage {
    type Error = anyhow::Error;

    fn try_from(cr: ChatResponse) -> Result<Self, Self::Error> {
        let mut text_content = String::new();
        let mut function_calls = Vec::new();
        let mut contents = Vec::new();

        for item in cr.content {
            match item {
                AnthropicResponseContent::Text { text } => {
                    if !text.is_empty() {
                        text_content.push_str(&text);
                    }
                    contents.push(AssistantContentItem::TextContent { value: text });
                }
                AnthropicResponseContent::ToolUse(tu) => {
                    let fc = ChatFunctionCall {
                        id: tu.id,
                        name: tu.name,
                        arguments: serde_json::to_string(&tu.input)?,
                    };
                    function_calls.push(fc.clone());
                    contents.push(AssistantContentItem::FunctionCall { value: fc });
                }
                AnthropicResponseContent::Thinking(thinking) => {
                    let metadata = serde_json::json!({
                        "id": format!("thinking_{}", uuid::Uuid::new_v4().to_string()),
                        "encrypted_content": thinking.signature,
                    });
                    contents.push(AssistantContentItem::Reasoning {
                        value: ReasoningContent {
                            reasoning: Some(thinking.thinking),
                            metadata: metadata.to_string(),
                            region: None,
                        },
                    });
                }
                AnthropicResponseContent::RedactedThinking(redacted) => {
                    let metadata = serde_json::json!({
                        "id": format!("redacted_thinking_{}", uuid::Uuid::new_v4().to_string()),
                        "encrypted_content": redacted.data,
                    });
                    contents.push(AssistantContentItem::Reasoning {
                        value: ReasoningContent {
                            reasoning: None,
                            metadata: metadata.to_string(),
                            region: None,
                        },
                    });
                }
            }
        }

        let function_calls = if function_calls.is_empty() {
            None
        } else {
            Some(function_calls)
        };

        let contents = if contents.is_empty() {
            None
        } else {
            Some(contents)
        };

        Ok(AssistantChatMessage {
            role: ChatMessageRole::Assistant,
            name: None,
            content: if text_content.is_empty() {
                None
            } else {
                Some(text_content)
            },
            function_call: function_calls.as_ref().and_then(|fcs| fcs.first().cloned()),
            function_calls,
            contents,
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
