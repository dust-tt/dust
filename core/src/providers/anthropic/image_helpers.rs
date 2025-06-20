use std::collections::HashMap;

use crate::providers::chat_messages::{ChatMessage, ContentBlock, MixedContent};

use super::types::AnthropicImageContent;
use anyhow::{anyhow, Result};
use base64::{engine::general_purpose, Engine};

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

pub async fn fetch_and_encode_images(
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
