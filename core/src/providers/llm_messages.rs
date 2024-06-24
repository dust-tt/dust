use anyhow::anyhow;
use serde::{
    de::{self, DeserializeOwned, Error},
    Deserialize, Deserializer, Serialize,
};

use super::llm::{ChatFunctionCall, ChatMessageRole};

// User message.

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct TextContent {
    pub r#type: String,
    pub text: String,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct ImageUrlContent {
    pub url: String,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct ImageContent {
    pub r#type: String,
    pub image_url: ImageUrlContent,
}

#[derive(Serialize, Deserialize, Debug, PartialEq, Clone)]
#[serde(untagged)]
pub enum ContentBlock {
    ImageContent(ImageContent),
    Text(String),
    TextContent(TextContent),
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct UserChatMessage {
    pub content: ContentBlock,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    // TODO:
    pub role: ChatMessageRole,
}

// System message.

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct SystemChatMessage {
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub role: ChatMessageRole,
}

// Assistant message.

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct AssistantChatMessage {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub function_call: Option<ChatFunctionCall>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub function_calls: Option<Vec<ChatFunctionCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub role: ChatMessageRole,
}

// Function message.

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct FunctionChatMessage {
    pub content: String,
    pub function_call_id: String,
    pub name: Option<String>,
    pub role: ChatMessageRole,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub enum ChatMessage {
    AssistantChatMessage(AssistantChatMessage),
    FunctionChatMessage(FunctionChatMessage),
    UserChatMessage(UserChatMessage),
    SystemChatMessage(SystemChatMessage),
}

impl ChatMessage {
    pub fn get_role(&self) -> Option<&ChatMessageRole> {
        match self {
            ChatMessage::AssistantChatMessage(msg) => Some(&msg.role),
            ChatMessage::FunctionChatMessage(msg) => Some(&msg.role),
            ChatMessage::UserChatMessage(msg) => Some(&msg.role),
            ChatMessage::SystemChatMessage(msg) => Some(&msg.role),
        }
    }
}

