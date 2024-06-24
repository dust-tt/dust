use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;

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
#[serde(deny_unknown_fields)]
pub struct UserChatMessage {
    pub content: ContentBlock,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub role: ChatMessageRole,
}

// System message.

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
#[serde(deny_unknown_fields)]
pub struct SystemChatMessage {
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub role: ChatMessageRole,
}

// Assistant message.

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
#[serde(deny_unknown_fields)]
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
#[serde(deny_unknown_fields)]
pub struct FunctionChatMessage {
    pub content: String,
    pub function_call_id: String,
    pub name: Option<String>,
    pub role: ChatMessageRole,
}

#[derive(Debug, Serialize, PartialEq, Clone)]
#[serde(tag = "role", rename_all = "lowercase")]
pub enum ChatMessage {
    Assistant(AssistantChatMessage),
    Function(FunctionChatMessage),
    User(UserChatMessage),
    System(SystemChatMessage),
}

impl<'de> Deserialize<'de> for ChatMessage {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let v: Value = Value::deserialize(deserializer)?;
        let role = v["role"]
            .as_str()
            .ok_or_else(|| serde::de::Error::custom("role field missing"))?;

        match role {
            "assistant" => {
                let chat_msg: AssistantChatMessage =
                    serde_json::from_value(v).map_err(serde::de::Error::custom)?;
                Ok(ChatMessage::Assistant(chat_msg))
            }
            "function" => {
                let chat_msg: FunctionChatMessage =
                    serde_json::from_value(v).map_err(serde::de::Error::custom)?;
                Ok(ChatMessage::Function(chat_msg))
            }
            "user" => {
                let chat_msg: UserChatMessage =
                    serde_json::from_value(v).map_err(serde::de::Error::custom)?;
                Ok(ChatMessage::User(chat_msg))
            }
            "system" => {
                let chat_msg: SystemChatMessage =
                    serde_json::from_value(v).map_err(serde::de::Error::custom)?;
                Ok(ChatMessage::System(chat_msg))
            }
            _ => Err(serde::de::Error::custom(format!("Invalid role: {}", role))),
        }
    }
}

impl ChatMessage {
    pub fn get_role(&self) -> Option<&ChatMessageRole> {
        match self {
            ChatMessage::Assistant(msg) => Some(&msg.role),
            ChatMessage::Function(msg) => Some(&msg.role),
            ChatMessage::User(msg) => Some(&msg.role),
            ChatMessage::System(msg) => Some(&msg.role),
        }
    }
}
