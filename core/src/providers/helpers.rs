use super::{
    chat_messages::{FunctionChatMessage, ImageContent, ImageUrlContent},
    llm::ChatMessageRole,
};
use crate::providers::chat_messages::{
    AssistantChatMessage, ChatMessage, ContentBlock, MixedContent, UserChatMessage,
};
use anyhow::{anyhow, Result};
use base64::{engine::general_purpose, Engine};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// Useful for models that don't support tools.
// For assistant messages, we remove function/tool calls (and we format them inside of the "content" field instead).
// For function/tool result messages, we transform them into user messages.
pub fn strip_tools_from_chat_history(messages: &Vec<ChatMessage>) -> Vec<ChatMessage> {
    let mut new_messages = Vec::new();
    for message in messages {
        match message {
            ChatMessage::System(message) => {
                new_messages.push(ChatMessage::System(message.clone()));
            }
            ChatMessage::User(message) => {
                new_messages.push(ChatMessage::User(message.clone()));
            }
            ChatMessage::Assistant(message) => {
                let mut content = message.content.clone().unwrap_or_default();
                if !content.is_empty() {
                    content = format!("{}\n", content);
                }
                if let Some(function_calls) = &message.function_calls {
                    if function_calls.len() > 0 {
                        let tool_calls_formatted = message
                            .function_calls
                            .clone()
                            .unwrap_or_default()
                            .iter()
                            .map(|call| format!("function_call {}({})", call.name, call.arguments))
                            .collect::<Vec<String>>()
                            .join("\n");
                        content = format!("{}{}", content, tool_calls_formatted);
                    }
                }
                new_messages.push(ChatMessage::Assistant(AssistantChatMessage {
                    content: Some(content),
                    name: message.name.clone(),
                    role: message.role.clone(),
                    function_call: None,
                    function_calls: None,
                    contents: None,
                }));
            }
            ChatMessage::Function(message) => {
                new_messages.push(ChatMessage::User(UserChatMessage {
                    content: message.content.clone(),
                    role: ChatMessageRole::User,
                    name: message.name.clone(),
                }));
            }
        }
    }

    new_messages
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct EncodedImageContent {
    pub r#type: String,
    pub media_type: String,
    pub data: String,
}

async fn fetch_image_base64(image_url: &str) -> Result<(String, EncodedImageContent)> {
    let response = reqwest::get(image_url)
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
        EncodedImageContent {
            r#type: "base64".to_string(),
            media_type: mime_type,
            data: general_purpose::STANDARD.encode(&bytes),
        },
    ))
}

pub async fn fetch_and_encode_images_from_messages(
    messages: &Vec<ChatMessage>,
) -> Result<HashMap<String, EncodedImageContent>, anyhow::Error> {
    let futures = messages
        .into_iter()
        .filter_map(|message| {
            let mixed_content = match message {
                ChatMessage::User(user_msg) => match user_msg.content.clone() {
                    ContentBlock::Mixed(content) => Some(content),
                    _ => None,
                },
                ChatMessage::Function(func_msg) => match func_msg.content.clone() {
                    ContentBlock::Mixed(content) => Some(content),
                    _ => None,
                },
                _ => None,
            };

            mixed_content.map(|content| {
                content
                    .into_iter()
                    .filter_map(|content| {
                        if let MixedContent::ImageContent(ic) = content {
                            let url = ic.image_url.url.clone();
                            Some(async move { fetch_image_base64(&url).await })
                        } else {
                            None
                        }
                    })
                    .collect::<Vec<_>>()
            })
        })
        .flatten()
        .collect::<Vec<_>>();

    let base64_pairs = futures::future::try_join_all(futures)
        .await?
        .into_iter()
        //.map(|(image_url, img_content)| (image_url.clone(), img_content))
        .collect::<HashMap<_, _>>();

    Ok(base64_pairs)
}

pub fn convert_content_block_images_to_base64(
    content: ContentBlock,
    base64_map: &HashMap<String, EncodedImageContent>,
) -> Result<ContentBlock> {
    match content {
        ContentBlock::Text(t) => Ok(ContentBlock::Text(t)),
        ContentBlock::Mixed(m) => {
            let mixed_content = m
                .into_iter()
                .map(|mb| match mb {
                    MixedContent::TextContent(tc) => Ok(MixedContent::TextContent(tc)),
                    MixedContent::ImageContent(ic) => {
                        let base64_data = base64_map
                            .get(&ic.image_url.url)
                            .ok_or(anyhow!("Invalid Image."))?;
                        Ok(MixedContent::ImageContent(ImageContent {
                            r#type: ic.r#type,
                            image_url: ImageUrlContent {
                                url: format!(
                                    "data:{};{},{}",
                                    base64_data.media_type, base64_data.r#type, base64_data.data
                                ),
                            },
                        }))
                    }
                })
                .collect::<Result<Vec<MixedContent>>>()?;
            Ok(ContentBlock::Mixed(mixed_content))
        }
    }
}

pub fn convert_message_images_to_base64(
    message: ChatMessage,
    base64_map: &HashMap<String, EncodedImageContent>,
) -> Result<ChatMessage> {
    match message {
        ChatMessage::System(system_msg) => Ok(ChatMessage::System(system_msg)),
        ChatMessage::User(user_msg) => {
            let content = convert_content_block_images_to_base64(user_msg.content, base64_map)?;
            Ok(ChatMessage::User(UserChatMessage {
                content,
                role: user_msg.role,
                name: user_msg.name,
            }))
        }
        ChatMessage::Assistant(assistant_msg) => Ok(ChatMessage::Assistant(assistant_msg)),
        ChatMessage::Function(function_msg) => {
            let content = convert_content_block_images_to_base64(function_msg.content, base64_map)?;
            Ok(ChatMessage::Function(FunctionChatMessage {
                content,
                function_call_id: function_msg.function_call_id,
                role: function_msg.role,
                name: function_msg.name,
            }))
        }
    }
}
