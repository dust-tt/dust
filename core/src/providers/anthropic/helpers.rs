use std::collections::HashMap;

use crate::providers::chat_messages::{ChatMessage, ContentBlock, MixedContent};

use super::types::{
    AnthropicChatMessage, AnthropicChatMessageRole, AnthropicContent, AnthropicContentToolResult,
    AnthropicContentToolResultContent, AnthropicContentToolResultContentType,
    AnthropicContentToolUse, AnthropicContentType, AnthropicImageContent,
};
use anyhow::{anyhow, Result};
use base64::{engine::general_purpose, Engine};

// Convert a vector of ChatMessages to a vector of AnthropicChatMessages.
// This function will also fetch the images from URL and encode them to base64.
pub async fn get_anthropic_chat_messages(
    messages: Vec<ChatMessage>,
) -> Result<Vec<AnthropicChatMessage>> {
    // Fetch and encode any images in the messages.
    let base64_map = fetch_and_encode_images(messages.clone()).await?;

    let anthropic_messages = messages
        .into_iter()
        // Convert each message to an AnthropicChatMessage.
        .map(|message| convert_chat_message_to_anthropic_chat_message(&message, &base64_map))
        .collect::<Result<Vec<AnthropicChatMessage>>>()?
        // Group consecutive messages with the same role by appending their content. This is
        // needed to group all the `tool_results` within one content vector.
        .iter()
        .fold(
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

    Ok(anthropic_messages)
}

fn convert_chat_message_to_anthropic_chat_message(
    chat_message: &ChatMessage,
    base64_map: &HashMap<String, AnthropicImageContent>,
) -> Result<AnthropicChatMessage> {
    match chat_message {
        ChatMessage::System(system_msg) => Ok(AnthropicChatMessage {
            content: vec![AnthropicContent {
                r#type: AnthropicContentType::Text,
                text: Some(system_msg.content.clone()),
                tool_use: None,
                tool_result: None,
                source: None,
            }],
            role: AnthropicChatMessageRole::User,
        }),
        ChatMessage::User(user_msg) => match &user_msg.content {
            ContentBlock::Text(t) => Ok(AnthropicChatMessage {
                content: vec![AnthropicContent {
                    r#type: AnthropicContentType::Text,
                    text: Some(t.clone()),
                    tool_use: None,
                    tool_result: None,
                    source: None,
                }],
                role: AnthropicChatMessageRole::User,
            }),
            ContentBlock::Mixed(m) => {
                let content = m
                    .into_iter()
                    .map(|mb| match mb {
                        MixedContent::TextContent(tc) => Ok(AnthropicContent {
                            r#type: AnthropicContentType::Text,
                            text: Some(tc.text.clone()),
                            tool_use: None,
                            tool_result: None,
                            source: None,
                        }),
                        MixedContent::ImageContent(ic) => {
                            let base64_data = base64_map
                                .get(&ic.image_url.url)
                                .ok_or(anyhow!("Invalid Image."))?;

                            Ok(AnthropicContent {
                                r#type: AnthropicContentType::Image,
                                source: Some(base64_data.clone()),
                                text: None,
                                tool_use: None,
                                tool_result: None,
                            })
                        }
                    })
                    .collect::<Result<Vec<AnthropicContent>>>()?;

                Ok(AnthropicChatMessage {
                    content,
                    role: AnthropicChatMessageRole::User,
                })
            }
        },
        ChatMessage::Assistant(assistant_msg) => {
            // TODO(reasoning_v2): use the contents array.

            let mut content: Vec<AnthropicContent> = Vec::new();

            if let Some(assistant_msg_content) = assistant_msg.content.as_ref() {
                content.push(AnthropicContent {
                    r#type: AnthropicContentType::Text,
                    text: Some(assistant_msg_content.clone()),
                    tool_use: None,
                    tool_result: None,
                    source: None,
                });
            };

            for function_call in assistant_msg.function_calls.as_ref().unwrap_or(&vec![]) {
                let args = serde_json::from_str(function_call.arguments.as_str())?;
                content.push(AnthropicContent {
                    r#type: AnthropicContentType::ToolUse,
                    text: None,
                    tool_use: Some(AnthropicContentToolUse {
                        name: function_call.name.clone(),
                        id: function_call.id.clone(),
                        input: args,
                    }),
                    tool_result: None,
                    source: None,
                });
            }

            Ok(AnthropicChatMessage {
                content,
                role: AnthropicChatMessageRole::Assistant,
            })
        }
        ChatMessage::Function(function_msg) => match &function_msg.content {
            ContentBlock::Text(t) => Ok(AnthropicChatMessage {
                content: vec![AnthropicContent {
                    r#type: AnthropicContentType::ToolResult,
                    text: None,
                    tool_use: None,
                    tool_result: Some(AnthropicContentToolResult {
                        tool_use_id: function_msg.function_call_id.clone(),
                        content: vec![AnthropicContentToolResultContent {
                            r#type: AnthropicContentToolResultContentType::Text,
                            text: Some(t.clone()),
                            source: None,
                        }],
                    }),
                    source: None,
                }],
                role: AnthropicChatMessageRole::User,
            }),
            ContentBlock::Mixed(m) => {
                let content = m
                    .into_iter()
                    .map(|mb| match mb {
                        MixedContent::TextContent(tc) => Ok(AnthropicContentToolResultContent {
                            r#type: AnthropicContentToolResultContentType::Text,
                            text: Some(tc.text.clone()),
                            source: None,
                        }),
                        MixedContent::ImageContent(ic) => {
                            let base64_data = base64_map
                                .get(&ic.image_url.url)
                                .ok_or(anyhow!("Invalid Image."))?;
                            Ok(AnthropicContentToolResultContent {
                                r#type: AnthropicContentToolResultContentType::Image,
                                source: Some(base64_data.clone()),
                                text: None,
                            })
                        }
                    })
                    .collect::<Result<Vec<AnthropicContentToolResultContent>>>()?;

                Ok(AnthropicChatMessage {
                    content: vec![AnthropicContent {
                        r#type: AnthropicContentType::ToolResult,
                        text: None,
                        tool_use: None,
                        tool_result: Some(AnthropicContentToolResult {
                            tool_use_id: function_msg.function_call_id.clone(),
                            content,
                        }),
                        source: None,
                    }],
                    role: AnthropicChatMessageRole::User,
                })
            }
        },
    }
}

async fn fetch_image_base64(image_url: &str) -> Result<(String, AnthropicImageContent)> {
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
            let mixed_content = match message {
                ChatMessage::User(user_msg) => match user_msg.content {
                    ContentBlock::Mixed(content) => Some(content),
                    _ => None,
                },
                ChatMessage::Function(func_msg) => match func_msg.content {
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
        .map(|(image_url, img_content)| (image_url.clone(), img_content))
        .collect::<HashMap<_, _>>();

    Ok(base64_pairs)
}
