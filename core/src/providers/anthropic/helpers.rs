use super::types::{
    AnthropicChatMessage, AnthropicChatMessageRole, AnthropicContent, AnthropicContentToolResult,
    AnthropicContentToolResultContent, AnthropicContentToolResultContentType,
    AnthropicContentToolUse, AnthropicContentType,
};
use crate::providers::{
    chat_messages::{AssistantContentItem, ChatMessage, ContentBlock, MixedContent},
    helpers::{fetch_and_encode_images_from_messages, Base64EncodedImageContent},
};
use anyhow::{anyhow, Result};
use std::collections::HashMap;

// Convert a vector of ChatMessages to a vector of AnthropicChatMessages.
// This function will also fetch the images from URL and encode them to base64.
pub async fn get_anthropic_chat_messages(
    messages: Vec<ChatMessage>,
) -> Result<Vec<AnthropicChatMessage>> {
    // Fetch and encode any images in the messages.
    let base64_map = fetch_and_encode_images_from_messages(&messages).await?;

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
    base64_map: &HashMap<String, Base64EncodedImageContent>,
) -> Result<AnthropicChatMessage> {
    match chat_message {
        ChatMessage::System(system_msg) => Ok(AnthropicChatMessage {
            content: vec![AnthropicContent {
                r#type: AnthropicContentType::Text,
                text: Some(system_msg.content.clone()),
                tool_use: None,
                tool_result: None,
                source: None,
                thinking: None,
                signature: None,
                data: None,
                cache_control: None,
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
                    thinking: None,
                    signature: None,
                    data: None,
                    cache_control: None,
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
                            thinking: None,
                            signature: None,
                            data: None,
                            cache_control: None,
                        }),
                        MixedContent::ImageContent(ic) => {
                            let base64_data = base64_map
                                .get(&ic.image_url.url)
                                .ok_or(anyhow!("Invalid Image."))?;

                            Ok(AnthropicContent {
                                r#type: AnthropicContentType::Image,
                                source: Some(base64_data.clone().into()),
                                text: None,
                                tool_use: None,
                                tool_result: None,
                                thinking: None,
                                signature: None,
                                data: None,
                                cache_control: None,
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
            Ok(AnthropicChatMessage {
                role: AnthropicChatMessageRole::Assistant,
                content: assistant_msg
                    .contents
                    .as_ref()
                    .unwrap_or(&vec![])
                    .iter()
                    .filter_map(|content_item| match content_item {
                        AssistantContentItem::TextContent { value } => Some(Ok(AnthropicContent {
                            r#type: AnthropicContentType::Text,
                            text: Some(value.clone()),
                            tool_use: None,
                            tool_result: None,
                            source: None,
                            thinking: None,
                            signature: None,
                            data: None,
                            cache_control: None,
                        })),
                        AssistantContentItem::FunctionCall { value } => {
                            Some(serde_json::from_str(&value.arguments).map(|input| {
                                AnthropicContent {
                                    r#type: AnthropicContentType::ToolUse,
                                    text: None,
                                    tool_use: Some(AnthropicContentToolUse {
                                        name: value.name.clone(),
                                        id: value.id.clone(),
                                        input,
                                    }),
                                    tool_result: None,
                                    source: None,
                                    thinking: None,
                                    signature: None,
                                    data: None,
                                    cache_control: None,
                                }
                            }))
                        }
                        AssistantContentItem::Reasoning { value } => {
                            // Parse the metadata to extract thinking content
                            let metadata: serde_json::Value =
                                serde_json::from_str(&value.metadata).ok()?;
                            let encrypted_content = metadata.get("encrypted_content")?.as_str()?;

                            // Determine if this is regular thinking or redacted thinking
                            let is_redacted = metadata
                                .get("id")?
                                .as_str()?
                                .starts_with("redacted_thinking_");

                            if is_redacted {
                                Some(Ok(AnthropicContent {
                                    r#type: AnthropicContentType::RedactedThinking,
                                    text: None,
                                    tool_use: None,
                                    tool_result: None,
                                    source: None,
                                    thinking: None,
                                    signature: None,
                                    data: Some(encrypted_content.to_string()),
                                    cache_control: None,
                                }))
                            } else {
                                Some(Ok(AnthropicContent {
                                    r#type: AnthropicContentType::Thinking,
                                    text: None,
                                    tool_use: None,
                                    tool_result: None,
                                    source: None,
                                    thinking: value.reasoning.clone(),
                                    signature: Some(encrypted_content.to_string()),
                                    data: None,
                                    cache_control: None,
                                }))
                            }
                        }
                    })
                    .collect::<Result<Vec<_>, _>>()?,
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
                    thinking: None,
                    signature: None,
                    data: None,
                    cache_control: None,
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
                                source: Some(base64_data.clone().into()),
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
                        thinking: None,
                        signature: None,
                        data: None,
                        cache_control: None,
                    }],
                    role: AnthropicChatMessageRole::User,
                })
            }
        },
    }
}
