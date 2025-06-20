use crate::providers::provider::{ModelError, ModelErrorRetryOptions};
use anyhow::{anyhow, Result};
use eventsource_client as es;
use eventsource_client::Client as ESClient;
use futures::TryStreamExt;
use hyper::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;
use tokio::sync::mpsc::UnboundedSender;

use super::types::{
    AnthropicChatMessageRole, AnthropicError, AnthropicResponseContent, ChatResponse, StopReason,
    ToolUse, Usage,
};

#[derive(Serialize, Deserialize, Debug, Clone)]
struct StreamChatResponse {
    pub id: String,
    pub model: String,
    pub role: AnthropicChatMessageRole,
    pub content: Vec<StreamContent>,
    pub stop_reason: Option<StopReason>,
    pub usage: Usage,
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
#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct AnthropicStreamThinking {
    pub r#type: String,
    pub thinking: String,
    pub signature: String,
}
#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct AnthropicStreamRedactedThinking {
    pub r#type: String,
    // Note that the data field is an encrypted string that is not human-readable.
    pub data: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(untagged)]
enum StreamContent {
    AnthropicStreamContent(AnthropicStreamContent),
    AnthropicStreamToolUse(AnthropicStreamToolUse),
    AnthropicStreamThinking(AnthropicStreamThinking),
    AnthropicStreamRedactedThinking(AnthropicStreamRedactedThinking),
}

impl TryFrom<StreamContent> for AnthropicResponseContent {
    type Error = anyhow::Error;

    fn try_from(value: StreamContent) -> Result<Self, Self::Error> {
        match value {
            StreamContent::AnthropicStreamContent(content) => {
                Ok(AnthropicResponseContent::Text { text: content.text })
            }
            StreamContent::AnthropicStreamThinking(content) => Ok(AnthropicResponseContent::Text {
                text: content.thinking,
            }),
            StreamContent::AnthropicStreamRedactedThinking(_) => {
                // We exclude these from the response as they are not human-readable and don't have anything useful for subsequent messages.
                Ok(AnthropicResponseContent::Text { text: "".into() })
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

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct AnthropicStreamThinkingDelta {
    pub r#type: String,
    // The documentation seems to tell we should get "thinking_delta" here but we don't for some reason.
    pub thinking: String,
}
#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct AnthropicStreamRedactedThinkingDelta {
    pub r#type: String,
    pub data: String,
}
#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct AnthropicStreamSignatureDelta {
    pub r#type: String,
    pub signature: String,
}
#[derive(Serialize, Deserialize, Debug, Clone)]
struct AnthropicStreamToolInputDelta {
    partial_json: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(untagged)]
enum StreamContentDelta {
    AnthropicStreamContent(AnthropicStreamContent),
    AnthropicStreamThinkingDelta(AnthropicStreamThinkingDelta),
    AnthropicStreamRedactedThinkingDelta(AnthropicStreamRedactedThinkingDelta),
    AnthropicStreamSignatureDelta(AnthropicStreamSignatureDelta),
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

pub async fn handle_streaming_response(
    client: impl ESClient,
    event_sender: UnboundedSender<Value>,
) -> Result<(ChatResponse, Option<String>)> {
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
                                            StreamContent::AnthropicStreamThinking(thinking) => {
                                                // Send <thinking> tag at the start of a thinking block
                                                let _ = event_sender.send(json!({
                                                    "type": "tokens",
                                                    "content": {
                                                        "text": "<thinking>",
                                                    },
                                                }));
                                                // Then send the actual thinking content
                                                let _ = event_sender.send(json!({
                                                    "type": "tokens",
                                                    "content": {
                                                        "text": thinking.thinking,
                                                    },
                                                }));
                                            }
                                            StreamContent::AnthropicStreamRedactedThinking(_) => {
                                                // We skip these as these do not contain anything human-readable.
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
                                            (StreamContentDelta::AnthropicStreamThinkingDelta(delta),
                                                StreamContent::AnthropicStreamThinking(content)) => {
                                                content.thinking.push_str(delta.thinking.as_str());
                                                if delta.thinking.len() > 0 {
                                                    let _ = event_sender.send(json!({
                                                        "type": "tokens",
                                                        "content": {
                                                            "text": delta.thinking,
                                                        }

                                                    }));
                                                }
                                            }
                                            (StreamContentDelta::AnthropicStreamRedactedThinkingDelta(delta),
                                                StreamContent::AnthropicStreamRedactedThinking(content)) => {
                                                content.data.push_str(delta.data.as_str());
                                                // We don't send an event, the redacted thinking data is not human-readable.
                                            }
                                            (StreamContentDelta::AnthropicStreamSignatureDelta(delta),
                                                StreamContent::AnthropicStreamThinking(content)) => {
                                                // We just add to the signature and don't push any event.
                                                content.signature.push_str(delta.signature.as_str());
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
                                let stop_event: StreamContentBlockStop =
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

                                // Check if the stopping block is a thinking block
                                match final_response.as_ref() {
                                    Some(response) => {
                                        if let Some(content) =
                                            response.content.get(stop_event.index as usize)
                                        {
                                            if let StreamContent::AnthropicStreamThinking(_) =
                                                content
                                            {
                                                // Send </thinking> tag at the end of a thinking block
                                                let _ = event_sender.send(json!({
                                                    "type": "tokens",
                                                    "content": {
                                                        "text": "</thinking>",
                                                    },
                                                }));
                                            }
                                        }
                                    }
                                    None => {}
                                }
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
                                        response.usage.output_tokens = event.usage.output_tokens;
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
