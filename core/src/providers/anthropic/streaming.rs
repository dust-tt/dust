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
use tracing::error;

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
            .map(|content| match content {
                StreamContent::AnthropicStreamContent(content) => {
                    Ok(Some(AnthropicResponseContent::Text { text: content.text }))
                }
                StreamContent::AnthropicStreamToolUse(tool_use) => {
                    let input_json = match tool_use.input {
                        Value::String(ref json_string) => {
                            serde_json::from_str(match json_string.as_str() {
                                "" => "{}",
                                _ => json_string,
                            })?
                        }
                        input => input,
                    };

                    Ok(Some(AnthropicResponseContent::ToolUse(ToolUse {
                        id: tool_use.id,
                        name: tool_use.name,
                        input: input_json,
                    })))
                }
                // Ignore thinking-related content.
                StreamContent::AnthropicStreamThinking(_)
                | StreamContent::AnthropicStreamRedactedThinking(_) => Ok(None),
            })
            .collect::<Result<Vec<Option<AnthropicResponseContent>>, anyhow::Error>>()?
            .into_iter()
            .filter_map(|c| c)
            .collect::<Vec<AnthropicResponseContent>>();

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
    let mut tokens_sent = false;

    let mut send_event = |event: Value| {
        tokens_sent = true;
        if let Err(e) = event_sender.send(event) {
            error!("Error sending event: {:?}", e);
        }
    };

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
                    Some(es::SSE::Event(event)) => {
                        match event.event_type.as_str() {
                            "message_start" => {
                                let event: StreamMessageStart =
                                    serde_json::from_str(event.data.as_str()).map_err(|e| {
                                        anyhow!(
                                            "Error parsing response from Anthropic: {:?} {:?}",
                                            e,
                                            event.data
                                        )
                                    })?;
                                final_response = Some(event.message);
                            }
                            "content_block_start" => {
                                let event: StreamContentBlockStart =
                                    serde_json::from_str(event.data.as_str()).map_err(|e| {
                                        anyhow!(
                                            "Error parsing response from Anthropic: {:?} {:?}",
                                            e,
                                            event.data
                                        )
                                    })?;

                                match final_response.as_mut() {
                                    None => {
                                        return Err(anyhow!(
                                            "Error streaming from Anthropic: \
                                                missing `message_start`"
                                        ));
                                    }
                                    Some(response) => {
                                        response.content.push(event.content_block.clone());

                                        match event.content_block {
                                            StreamContent::AnthropicStreamContent(
                                                content_block,
                                            ) => {
                                                if content_block.text.len() > 0 {
                                                    send_event(json!({
                                                        "type": "tokens",
                                                        "content": {
                                                          "text": content_block.text,
                                                        }
                                                    }));
                                                }
                                            }
                                            StreamContent::AnthropicStreamToolUse(tool_use) => {
                                                send_event(json!({
                                                    "type": "function_call",
                                                    "content": {
                                                        "name": tool_use.name,
                                                    },
                                                }));
                                            }
                                            StreamContent::AnthropicStreamThinking(_)
                                            | StreamContent::AnthropicStreamRedactedThinking(_) => {
                                                // Ignore thinking and redacted thinking events.
                                            }
                                        }
                                    }
                                }
                            }
                            "content_block_delta" => {
                                let event: StreamContentBlockDelta =
                                    serde_json::from_str(event.data.as_str()).map_err(|e| {
                                        anyhow!(
                                            "Error parsing response from Anthropic: {:?} {:?}",
                                            e,
                                            event.data
                                        )
                                    })?;

                                match final_response.as_mut() {
                                    None => {
                                        return Err(anyhow!(
                                            "Error streaming from Anthropic: \
                                                    missing `message_start`"
                                        ));
                                    }
                                    Some(response) => match response.content.last_mut() {
                                        None => {
                                            return Err(anyhow!(
                                                "Error streaming from Anthropic: \
                                                        missing `content_block_start`"
                                            ));
                                        }
                                        Some(content) => match (event.delta, content) {
                                            (StreamContentDelta::AnthropicStreamContent(delta),
                                             StreamContent::AnthropicStreamContent(content)) => {
                                                content.text.push_str(delta.text.as_str());
                                                if delta.text.len() > 0 {
                                                    send_event(json!({
                                                        "type": "tokens",
                                                        "content": {
                                                            "text": delta.text,
                                                        }

                                                    }));
                                                }
                                            }

                                            (StreamContentDelta::AnthropicStreamThinkingDelta(_),
                                                StreamContent::AnthropicStreamThinking(_)) | (StreamContentDelta::AnthropicStreamRedactedThinkingDelta(_),
                                                StreamContent::AnthropicStreamRedactedThinking(_)) | (StreamContentDelta::AnthropicStreamSignatureDelta(_),
                                                StreamContent::AnthropicStreamThinking(_)) => {
                                                // Ignore thinking-related events.
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
                                                return Err(anyhow!(
                                                    "Error parsing input chunks from Anthropic response"
                                                ));
                                            }
                                        },
                                    },
                                }
                            }
                            "message_delta" => {
                                let event: StreamMessageDelta =
                                    serde_json::from_str(event.data.as_str()).map_err(|e| {
                                        anyhow!(
                                            "Error parsing response from Anthropic: {:?} {:?}",
                                            e,
                                            event.data
                                        )
                                    })?;

                                match final_response.as_mut() {
                                    None => {
                                        return Err(anyhow!(
                                            "Error streaming from Anthropic: \
                                                missing `message_start`"
                                        ));
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
                                    serde_json::from_str(event.data.as_str()).map_err(|e| {
                                        anyhow!(
                                            "Streaming error from Anthropic: {:?} ({})",
                                            event.data,
                                            e
                                        )
                                    })?;

                                return Err(ModelError {
                                    request_id: request_id.clone(),
                                    message: format!(
                                        "AnthropicError: [{}] {}",
                                        event.error.r#type, event.error.message,
                                    ),
                                    retryable: None,
                                }
                                .into());
                            }
                            _ => (),
                        }
                    }
                    Some(es::SSE::Comment(comment)) => {
                        println!("UNEXPECTED COMMENT {}", comment);
                    }
                    None => {
                        println!("UNEXPECTED NONE");
                        break 'stream;
                    }
                }
            }
            Err(e) => match e {
                es::Error::UnexpectedResponse(r) => {
                    let status = StatusCode::from_u16(r.status())?;
                    let headers = r.headers()?;
                    let request_id = match headers.get("request-id") {
                        Some(v) => Some(v.to_string()),
                        None => None,
                    };
                    let b = r.body_bytes().await?;

                    let parsed_anthropic_error: AnthropicError = serde_json::from_slice(&b)
                        .map_err(|e| {
                            anyhow!(
                                "Error parsing error from Anthropic: {:?} {:?}",
                                e,
                                String::from_utf8_lossy(&b)
                            )
                        })?;

                    if !tokens_sent && parsed_anthropic_error.retryable_streamed(status) {
                        return Err(ModelError {
                            request_id,
                            message: parsed_anthropic_error.message(),
                            retryable: Some(ModelErrorRetryOptions {
                                sleep: Duration::from_millis(500),
                                factor: 1,
                                retries: 1,
                            }),
                        }
                        .into());
                    } else {
                        return Err(ModelError {
                            request_id,
                            message: parsed_anthropic_error.message(),
                            retryable: None,
                        }
                        .into());
                    }
                }
                _ => {
                    return Err(anyhow!("Error streaming tokens from Anthropic: {:?}", e));
                }
            },
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
