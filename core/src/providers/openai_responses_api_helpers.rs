use std::{io::prelude::*, time::Duration};

use crate::{
    providers::{llm::LLMTokenUsage, provider::ProviderID},
    utils,
};
use anyhow::{anyhow, Result};
use eventsource_client as es;
use eventsource_client::Client as ESClient;
use futures::TryStreamExt;
use http::StatusCode;
use hyper::{body::Buf, Uri};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::sync::mpsc::UnboundedSender;
use tokio::time::timeout;
use tracing::{info, warn};

use super::{
    chat_messages::{
        AssistantChatMessage, AssistantContentItem, ChatMessage, ContentBlock, MixedContent,
        ReasoningContent,
    },
    llm::{ChatFunction, ChatFunctionCall, ChatMessageRole, LLMChatGeneration},
    openai_compatible_helpers::{OpenAIChatMessageRole, OpenAIError, TransformSystemMessages},
    provider::{ModelError, ModelErrorRetryOptions},
};

// OpenAI Responses API types

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
#[serde(rename_all = "snake_case")]
pub enum OpenAIResponsesInputContentType {
    InputText,
    InputImage,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct OpenAIResponsesInputTextContent {
    pub r#type: OpenAIResponsesInputContentType,
    pub text: String,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct OpenAIResponsesInputImageContent {
    pub r#type: OpenAIResponsesInputContentType,
    pub image_url: String,
}

#[derive(Serialize, Deserialize, Debug, PartialEq, Clone)]
#[serde(untagged)]
pub enum OpenAIResponsesInputContentBlock {
    TextContent(OpenAIResponsesInputTextContent),
    ImageContent(OpenAIResponsesInputImageContent),
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
#[serde(untagged)]
pub enum OpenAIResponsesMessageContent {
    String(String),
    Structured(Vec<OpenAIResponsesInputContentBlock>),
}

// Input items for the input array format
#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum OpenAIResponseInputItem {
    Message {
        role: OpenAIChatMessageRole,
        content: OpenAIResponsesMessageContent,
    },
    Reasoning {
        id: String,
        encrypted_content: String,
        summary: Vec<OpenAIResponseSummaryItem>,
    },
    FunctionCall {
        id: String,
        status: String,
        name: String,
        arguments: String,
        call_id: String,
    },
    FunctionCallOutput {
        call_id: String,
        output: String,
    },
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct OpenAIResponseSummaryItem {
    #[serde(rename = "type")]
    pub r#type: String,
    pub text: String,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct OpenAIResponseReasoningConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub effort: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct OpenAIResponseAPITool {
    #[serde(rename = "type")]
    pub r#type: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parameters: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub strict: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct OpenAIResponsesRequest {
    pub model: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input: Option<Vec<OpenAIResponseInputItem>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning: Option<OpenAIResponseReasoningConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<OpenAIResponseAPITool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub instructions: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_output_tokens: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub store: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub previous_response_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub service_tier: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum OpenAIResponseOutputItem {
    Reasoning {
        id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        encrypted_content: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        summary: Option<Vec<OpenAIResponseSummaryItem>>,
    },
    Message {
        id: String,
        status: String,
        content: Vec<OpenAIResponseMessageContent>,
        role: OpenAIChatMessageRole,
    },
    FunctionCall {
        id: String,
        name: String,
        arguments: String,
        call_id: String,
    },
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum OpenAIResponseMessageContent {
    OutputText {
        text: String,
        #[serde(default)]
        annotations: Vec<Value>,
    },
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct OpenAIResponseUsageDetails {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cached_tokens: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_tokens: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct OpenAIResponseUsage {
    pub input_tokens: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_tokens_details: Option<OpenAIResponseUsageDetails>,
    pub output_tokens: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_tokens_details: Option<OpenAIResponseUsageDetails>,
    pub total_tokens: u64,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct OpenAIResponseIncompleteDetails {
    pub reason: String,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct OpenAIResponsesResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<Vec<OpenAIResponseOutputItem>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<OpenAIResponseUsage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub incomplete_details: Option<OpenAIResponseIncompleteDetails>,
}

// OpenAI Responses API conversion functions

/// Strips literal Unicode escape sequences like \u0000 and \u0004 from strings
fn strip_null_chars(s: &str) -> String {
    s.replace("\\u0000", "").replace("\\u0004", "")
}

fn responses_api_input_from_chat_messages(
    messages: &Vec<ChatMessage>,
    transform_system_messages: TransformSystemMessages,
    use_openai_eu_host: bool,
) -> Result<Vec<OpenAIResponseInputItem>> {
    let mut input_items = Vec::new();

    for message in messages {
        match message {
            ChatMessage::User(user_msg) => {
                let content = match &user_msg.content {
                    ContentBlock::Text(text) => OpenAIResponsesMessageContent::String(text.clone()),
                    ContentBlock::Mixed(mixed_contents) => {
                        let content_blocks: Vec<OpenAIResponsesInputContentBlock> = mixed_contents
                            .iter()
                            .map(|c| match c {
                                MixedContent::TextContent(tc) => {
                                    OpenAIResponsesInputContentBlock::TextContent(
                                        OpenAIResponsesInputTextContent {
                                            r#type: OpenAIResponsesInputContentType::InputText,
                                            text: tc.text.clone(),
                                        },
                                    )
                                }
                                MixedContent::ImageContent(ic) => {
                                    OpenAIResponsesInputContentBlock::ImageContent(
                                        OpenAIResponsesInputImageContent {
                                            r#type: OpenAIResponsesInputContentType::InputImage,
                                            image_url: ic.image_url.url.clone(),
                                        },
                                    )
                                }
                            })
                            .collect();
                        OpenAIResponsesMessageContent::Structured(content_blocks)
                    }
                };
                input_items.push(OpenAIResponseInputItem::Message {
                    role: OpenAIChatMessageRole::User,
                    content,
                });
            }
            ChatMessage::System(system_msg) => {
                let role =
                    if transform_system_messages == TransformSystemMessages::ReplaceWithDeveloper {
                        OpenAIChatMessageRole::Developer
                    } else {
                        OpenAIChatMessageRole::System
                    };
                input_items.push(OpenAIResponseInputItem::Message {
                    role,
                    content: OpenAIResponsesMessageContent::String(system_msg.content.clone()),
                });
            }
            ChatMessage::Assistant(assistant_msg) => {
                for item in assistant_msg.contents.as_ref().unwrap_or(&vec![]) {
                    match item {
                        AssistantContentItem::Reasoning { value } => {
                            // The encrypted content is only usable if it was generated in the same region
                            // as the one being used to call the API, since OpenAI uses different keys per region.
                            // So if we find a mismatch, we skip adding this reasoning item to the input.
                            // This might degrade the quality, but it's better than blowing up.
                            let region = value.region.as_deref();
                            let is_mismatch = match (use_openai_eu_host, region) {
                                // We treat no region as US
                                (true, Some("us")) | (true, None) => true,
                                (false, Some("eu")) => true,
                                _ => false,
                            };

                            if is_mismatch {
                                warn!(
                                    region,
                                    use_openai_eu_host,
                                    model = assistant_msg.name.as_deref().unwrap_or("unknown"),
                                    "Skipping reasoning metadata due to region mismatch. This is expected if a conversation was started with OpenAI US and is now being continued with OpenAI EU, or vice versa."
                                );
                                continue;
                            }

                            // Parse metadata JSON to extract ID and encrypted content
                            let metadata: Value =
                                serde_json::from_str(&value.metadata).map_err(|e| {
                                    anyhow!("Failed to parse reasoning metadata JSON: {}", e)
                                })?;

                            let id = metadata
                                .get("id")
                                .and_then(|v| v.as_str())
                                .ok_or_else(|| anyhow!("Missing 'id' field in reasoning metadata"))?
                                .to_string();

                            let encrypted_content = metadata
                                .get("encrypted_content")
                                .and_then(|v| v.as_str())
                                .ok_or_else(|| {
                                    anyhow!(
                                        "Missing 'encrypted_content' field in reasoning metadata"
                                    )
                                })?
                                .to_string();

                            input_items.push(OpenAIResponseInputItem::Reasoning {
                                id,
                                encrypted_content,
                                summary: vec![OpenAIResponseSummaryItem {
                                    r#type: "summary_text".to_string(),
                                    text: value.reasoning.clone().unwrap_or_default(),
                                }],
                            });
                        }
                        AssistantContentItem::FunctionCall { value } => {
                            input_items.push(OpenAIResponseInputItem::FunctionCall {
                                id: format!("fc_{}", utils::new_id()[0..9].to_string()),
                                status: "completed".to_string(),
                                name: value.name.clone(),
                                arguments: value.arguments.clone(),
                                call_id: value.id.clone(),
                            });
                        }
                        AssistantContentItem::TextContent { value } => {
                            input_items.push(OpenAIResponseInputItem::Message {
                                role: OpenAIChatMessageRole::Assistant,
                                content: OpenAIResponsesMessageContent::String(value.clone()),
                            });
                        }
                    }
                }
            }
            ChatMessage::Function(function_msg) => {
                let output = match &function_msg.content {
                    ContentBlock::Text(text) => text.clone(),
                    ContentBlock::Mixed(mixed_contents) => mixed_contents
                        .iter()
                        .map(|c| match c {
                            MixedContent::TextContent(tc) => tc.text.clone(),
                            MixedContent::ImageContent(ic) => ic.image_url.url.clone(),
                        })
                        .collect::<Vec<String>>()
                        .join("\n"),
                };
                input_items.push(OpenAIResponseInputItem::FunctionCallOutput {
                    call_id: function_msg.function_call_id.clone(),
                    output,
                });
            }
        }
    }

    Ok(input_items)
}

fn assistant_chat_message_from_responses_api_output(
    output: Vec<OpenAIResponseOutputItem>,
) -> Result<AssistantChatMessage> {
    let mut contents = Vec::new();
    let mut function_calls = Vec::new();
    let mut content: Option<String> = None;

    for item in output {
        match item {
            OpenAIResponseOutputItem::Reasoning {
                id,
                encrypted_content,
                summary,
            } => {
                let reasoning = summary.as_ref().map(|s| {
                    s.iter()
                        .map(|s| s.text.clone())
                        .collect::<Vec<String>>()
                        .join("\n\n")
                });

                let metadata = json!({
                    "id": id,
                    "encrypted_content": encrypted_content.unwrap_or_default()
                });

                contents.push(AssistantContentItem::Reasoning {
                    value: ReasoningContent {
                        reasoning,
                        metadata: metadata.to_string(),
                        region: None,
                    },
                });
            }
            OpenAIResponseOutputItem::Message {
                id: _,
                status: _,
                content: message_content,
                role: _,
            } => {
                // Extract text from message content
                for content_item in message_content {
                    match content_item {
                        OpenAIResponseMessageContent::OutputText {
                            text,
                            annotations: _,
                        } => {
                            content = Some(text.clone());
                            contents.push(AssistantContentItem::TextContent { value: text });
                        }
                    }
                }
            }
            OpenAIResponseOutputItem::FunctionCall {
                id: _,
                name,
                arguments,
                call_id,
            } => {
                let fc = ChatFunctionCall {
                    id: call_id,
                    name,
                    arguments: strip_null_chars(&arguments),
                };
                function_calls.push(fc.clone());
                contents.push(AssistantContentItem::FunctionCall { value: fc });
            }
        }
    }

    Ok(AssistantChatMessage {
        content,
        role: ChatMessageRole::Assistant,
        name: None,
        function_call: function_calls.first().cloned(),
        function_calls: if function_calls.is_empty() {
            None
        } else {
            Some(function_calls)
        },
        contents: if contents.is_empty() {
            None
        } else {
            Some(contents)
        },
    })
}

pub async fn openai_responses_api_completion(
    uri: Uri,
    model_id: String,
    api_key: String,
    messages: &Vec<ChatMessage>,
    functions: &Vec<ChatFunction>,
    temperature: f32,
    max_tokens: Option<i32>,
    extras: Option<Value>,
    event_sender: Option<UnboundedSender<Value>>,
    transform_system_messages: TransformSystemMessages,
    provider_name: String,
    use_openai_eu_host: bool,
) -> Result<LLMChatGeneration> {
    let is_reasoning_model = model_id.starts_with("o3")
        || model_id.starts_with("o1")
        || model_id.starts_with("o4")
        || model_id.starts_with("gpt-5");

    let (openai_org_id, instructions, reasoning_effort, store) = match &extras {
        None => (None, None, None, true),
        Some(v) => (
            match v.get("openai_organization_id") {
                Some(Value::String(o)) => Some(o.to_string()),
                _ => None,
            },
            match v.get("instructions") {
                Some(Value::String(i)) => Some(i.to_string()),
                _ => None,
            },
            match v.get("reasoning_effort") {
                Some(Value::String(r)) => {
                    if r == "light" {
                        Some("low".to_string())
                    } else {
                        Some(r.to_string())
                    }
                }
                _ => {
                    if model_id.starts_with("gpt-5") {
                        Some("minimal".to_string())
                    } else if is_reasoning_model {
                        Some("medium".to_string())
                    } else {
                        None
                    }
                }
            },
            match v.get("store") {
                Some(Value::Bool(b)) => *b,
                _ => true,
            },
        ),
    };

    let input = responses_api_input_from_chat_messages(
        messages,
        transform_system_messages,
        use_openai_eu_host,
    )?;

    let tools: Vec<OpenAIResponseAPITool> = functions
        .iter()
        .map(|f| OpenAIResponseAPITool {
            r#type: "function".to_string(),
            name: f.name.clone(),
            description: f.description.clone(),
            parameters: f.parameters.clone(),
            strict: Some(false),
        })
        .collect();

    let (reasoning_config, include) = if reasoning_effort.is_some() {
        (
            Some(OpenAIResponseReasoningConfig {
                effort: reasoning_effort,
                summary: Some("auto".to_string()),
            }),
            Some(vec!["reasoning.encrypted_content".to_string()]),
        )
    } else {
        (None, None)
    };

    // TODO(gpt-5): remove this once we have a proper service tier system
    let service_tier = if model_id.starts_with("gpt-5") {
        Some("priority".to_string())
    } else {
        None
    };

    let request = OpenAIResponsesRequest {
        model: model_id.clone(),
        input: Some(input),
        reasoning: reasoning_config,
        tools: if tools.is_empty() { None } else { Some(tools) },
        instructions,
        temperature: Some(temperature),
        max_output_tokens: max_tokens,
        stream: Some(event_sender.is_some()),
        store: Some(store),
        include,
        previous_response_id: None,
        service_tier,
    };

    let (response, request_id) = if event_sender.is_some() {
        streamed_responses_api_completion(
            uri,
            api_key,
            openai_org_id,
            request,
            event_sender.clone(),
            provider_name.clone(),
        )
        .await?
    } else {
        responses_api_completion(uri, api_key, openai_org_id, request, provider_name.clone())
            .await?
    };

    let assistant_message =
        assistant_chat_message_from_responses_api_output(response.output.unwrap_or_default())?;

    Ok(LLMChatGeneration {
        created: utils::now(),
        provider: ProviderID::OpenAI.to_string(),
        model: model_id,
        completions: vec![assistant_message],
        usage: response.usage.map(|usage| LLMTokenUsage {
            prompt_tokens: usage.input_tokens,
            completion_tokens: usage.output_tokens,
            cached_tokens: usage
                .input_tokens_details
                .and_then(|details| details.cached_tokens),
            reasoning_tokens: usage
                .output_tokens_details
                .and_then(|details| details.reasoning_tokens),
        }),
        provider_request_id: request_id,
        logprobs: None,
    })
}

async fn responses_api_completion(
    uri: Uri,
    api_key: String,
    organization_id: Option<String>,
    request: OpenAIResponsesRequest,
    provider_name: String,
) -> Result<(OpenAIResponsesResponse, Option<String>)> {
    let mut req = reqwest::Client::new()
        .post(uri.to_string())
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_key.clone()))
        .header("api-key", api_key.clone());

    if let Some(organization_id) = organization_id {
        req = req.header("OpenAI-Organization", organization_id);
    }

    let req = req.json(&request);

    let res = match timeout(Duration::new(180, 0), req.send()).await {
        Ok(Ok(res)) => res,
        Ok(Err(e)) => Err(e)?,
        Err(_) => Err(anyhow!(format!(
            "Timeout sending request to {} after 180s",
            provider_name
        )))?,
    };

    let res_headers = res.headers();
    let request_id = match res_headers.get("x-request-id") {
        Some(request_id) => Some(request_id.to_str()?.to_string()),
        None => None,
    };

    let body = match timeout(Duration::new(180, 0), res.bytes()).await {
        Ok(Ok(body)) => body,
        Ok(Err(e)) => Err(e)?,
        Err(_) => Err(anyhow!(format!(
            "Timeout reading response from {} after 180s",
            provider_name
        )))?,
    };

    let mut b: Vec<u8> = vec![];
    body.reader().read_to_end(&mut b)?;
    let c: &[u8] = &b;

    let response: OpenAIResponsesResponse = match serde_json::from_slice(c) {
        Ok(r) => Ok(r),
        Err(_) => {
            let error: OpenAIError = serde_json::from_slice(c)?;
            match error.retryable() {
                true => Err(ModelError {
                    request_id: request_id.clone(),
                    message: error.with_provider(&provider_name).message(),
                    retryable: Some(ModelErrorRetryOptions {
                        sleep: Duration::from_millis(500),
                        factor: 2,
                        retries: 3,
                    }),
                }),
                false => Err(ModelError {
                    request_id: request_id.clone(),
                    message: error.with_provider(&provider_name).message(),
                    retryable: Some(ModelErrorRetryOptions {
                        sleep: Duration::from_millis(500),
                        factor: 1,
                        retries: 1,
                    }),
                }),
            }
        }
    }?;

    Ok((response, request_id))
}

// Event handling structures for responses API streaming
#[derive(Debug)]
struct ResponseState {
    response_id: String,
    model: String,
    output_items: Vec<OpenAIResponseOutputItem>,
    usage: Option<OpenAIResponseUsage>,
    completed: bool,
    // status: String,
    // For accumulating function call arguments
    // function_call_accumulator: std::collections::HashMap<String, String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ResponseEvent {
    #[serde(rename = "type")]
    event_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    sequence_number: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    response: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    output_index: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    item: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    item_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    delta: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    arguments: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<Value>,
}

async fn streamed_responses_api_completion(
    uri: Uri,
    api_key: String,
    organization_id: Option<String>,
    request: OpenAIResponsesRequest,
    event_sender: Option<UnboundedSender<Value>>,
    provider_name: String,
) -> Result<(OpenAIResponsesResponse, Option<String>)> {
    let url = uri.to_string();

    let mut builder = match es::ClientBuilder::for_url(url.as_str()) {
        Ok(b) => b,
        Err(_) => {
            return Err(anyhow!(format!(
                "Error creating streamed client to {}",
                provider_name
            )))
        }
    };
    builder = match builder.method(String::from("POST")).header(
        "Authorization",
        format!("Bearer {}", api_key.clone()).as_str(),
    ) {
        Ok(b) => b,
        Err(_) => {
            return Err(anyhow!(format!(
                "Error creating streamed client to {}",
                provider_name
            )))
        }
    };
    builder = match builder.header("Content-Type", "application/json") {
        Ok(b) => b,
        Err(_) => {
            return Err(anyhow!(format!(
                "Error creating streamed client to {}",
                provider_name
            )))
        }
    };
    builder = match builder.header("api-key", api_key.clone().as_str()) {
        Ok(b) => b,
        Err(_) => {
            return Err(anyhow!(format!(
                "Error creating streamed client to {}",
                provider_name
            )))
        }
    };

    if let Some(org_id) = organization_id {
        builder = builder
            .header("OpenAI-Organization", org_id.as_str())
            .map_err(|_| {
                anyhow!(format!(
                    "Error creating streamed client to {}",
                    provider_name
                ))
            })?;
    }

    let body = serde_json::to_string(&request)?;

    let client = builder
        .body(body)
        .reconnect(
            es::ReconnectOptions::reconnect(true)
                .retry_initial(false)
                .delay(Duration::from_secs(1))
                .backoff_factor(2)
                .delay_max(Duration::from_secs(8))
                .build(),
        )
        .build();

    let mut stream = client.stream();
    let mut state = ResponseState {
        response_id: String::new(),
        model: request.model.clone(),
        output_items: Vec::new(),
        usage: None,
        completed: false,
        // status: "in_progress".to_string(),
        // function_call_accumulator: std::collections::HashMap::new(),
    };
    let mut request_id: Option<String> = None;

    'stream: loop {
        match stream.try_next().await {
            Ok(e) => match e {
                Some(es::SSE::Connected((_, headers))) => {
                    request_id = match headers.get("x-request-id") {
                        Some(v) => Some(v.to_string()),
                        None => None,
                    };
                }
                Some(es::SSE::Comment(_)) => {
                    // Ignore comments.
                }
                Some(es::SSE::Event(e)) => {
                    if e.event_type == "done" && e.data == "[DONE]" {
                        break 'stream;
                    }

                    let event_data: ResponseEvent = match serde_json::from_str(&e.data) {
                        Ok(data) => data,
                        Err(_err) => {
                            println!("Could not parse event: {:?}", e);
                            continue;
                        }
                    };

                    match e.event_type.as_str() {
                        "response.created" => {
                            handle_response_created(&mut state, event_data)?;
                        }
                        "response.in_progress" => {
                            // Ignore.
                        }
                        "response.output_item.added" => {
                            handle_output_item_added(&mut state, event_data, &event_sender)?;
                        }
                        "response.output_item.done" => {
                            handle_output_item_done(&mut state, event_data, &event_sender)?;
                        }
                        "response.output_text.delta" => {
                            if let Some(delta) = event_data.delta {
                                if let Some(sender) = &event_sender {
                                    let _ = sender.send(json!({
                                        "type": "tokens",
                                        "content": {
                                            "text": delta
                                        }
                                    }));
                                }
                            }
                        }
                        "response.reasoning_summary.delta" => {
                            if let Some(delta) = event_data.delta {
                                if let Some(sender) = &event_sender {
                                    let _ = sender.send(json!({
                                        "type": "reasoning_tokens",
                                        "content": {
                                            "text": delta
                                        }
                                    }));
                                }
                            }
                        }
                        "response.reasoning_summary_text.delta" => {
                            if let Some(delta) = event_data.delta {
                                if let Some(sender) = &event_sender {
                                    let _ = sender.send(json!({
                                        "type": "reasoning_tokens",
                                        "content": {
                                            "text": delta
                                        }
                                    }));
                                }
                            }
                        }
                        "response.reasoning_summary_text.done" => {
                            if let Some(sender) = &event_sender {
                                let _ = sender.send(json!({
                                    "type": "reasoning_tokens",
                                    "content": {
                                        "text": "\n\n"
                                    }
                                }));
                            }
                        }
                        "response.completed" => {
                            handle_response_completed(&mut state, event_data, &event_sender)?;
                            break 'stream;
                        }
                        "response.failed" | "response.incomplete" => {
                            handle_response_error(event_data, &provider_name, &request_id)?;
                            break 'stream;
                        }
                        "response.reasoning.delta"
                        | "response.reasoning.done"
                        | "response.reasoning_summary.done"
                        | "response.reasoning_summary_part.added"
                        | "response.reasoning_summary_part.done"
                        | "response.content_part.added"
                        | "response.output_text.done"
                        | "response.content_part.done"
                        | "response.function_call_arguments.delta"
                        | "response.function_call_arguments.done" => {
                            // Ignore these events.
                        }
                        _ => {
                            info!("OPENAIRESPONSESAPI: unknown event: {:?}", e.event_type);
                        }
                    }
                }
                None => {
                    break 'stream;
                }
            },
            Err(e) => {
                // Check if we already have a completed response - if so, EOF is expected.
                if matches!(e, es::Error::Eof) && state.completed {
                    break 'stream;
                }

                match e {
                    es::Error::UnexpectedResponse(r) => {
                        let status = StatusCode::from_u16(r.status())?;
                        let headers = r.headers()?;
                        let request_id = match headers.get("x-request-id") {
                            Some(v) => Some(v.to_string()),
                            None => None,
                        };
                        let b = r.body_bytes().await?;

                        let error: Result<OpenAIError, _> = serde_json::from_slice(&b);
                        match error {
                            Ok(error) => {
                                match error.retryable_streamed(status) {
                                    true => Err(ModelError {
                                        request_id,
                                        message: error.with_provider(&provider_name).message(),
                                        retryable: Some(ModelErrorRetryOptions {
                                            sleep: Duration::from_millis(500),
                                            factor: 2,
                                            retries: 3,
                                        }),
                                    }),
                                    false => Err(ModelError {
                                        request_id,
                                        message: error.with_provider(&provider_name).message(),
                                        retryable: None,
                                    }),
                                }
                            }?,
                            Err(_) => {
                                Err(anyhow!(
                                    "Error streaming tokens from {}: status={} data={}",
                                    &provider_name,
                                    status,
                                    String::from_utf8_lossy(&b)
                                ))?;
                            }
                        }
                    }
                    _ => {
                        Err(anyhow!(
                            "Error streaming tokens from {}: {:?}",
                            &provider_name,
                            e
                        ))?;
                    }
                }
                break 'stream;
            }
        }
    }

    let final_response = OpenAIResponsesResponse {
        output: if state.output_items.is_empty() {
            None
        } else {
            Some(state.output_items)
        },
        usage: state.usage,
        incomplete_details: None,
    };

    Ok((final_response, request_id))
}

// Event handler functions

fn handle_response_created(state: &mut ResponseState, event: ResponseEvent) -> Result<()> {
    if let Some(response) = event.response {
        if let Ok(resp) = serde_json::from_value::<Value>(response) {
            if let Some(id) = resp.get("id").and_then(|v| v.as_str()) {
                state.response_id = id.to_string();
            }
            if let Some(model) = resp.get("model").and_then(|v| v.as_str()) {
                state.model = model.to_string();
            }
        }
    }
    Ok(())
}

fn handle_output_item_added(
    _state: &mut ResponseState,
    event: ResponseEvent,
    event_sender: &Option<UnboundedSender<Value>>,
) -> Result<()> {
    if let (Some(item), Some(_index)) = (event.item, event.output_index) {
        if let Ok(item_obj) = serde_json::from_value::<Value>(item) {
            if let Some(item_type) = item_obj.get("type").and_then(|v| v.as_str()) {
                match item_type {
                    "reasoning" => {
                        // TBD.
                    }
                    "function_call" => {
                        // Extract function name and stream function_call event.
                        if let Some(name) = item_obj.get("name").and_then(|v| v.as_str()) {
                            if let Some(sender) = event_sender {
                                let _ = sender.send(json!({
                                    "type": "function_call",
                                    "content": {
                                        "name": name
                                    }
                                }));
                            }
                        }
                    }
                    _ => {}
                }
            }
        }
    }
    Ok(())
}

fn handle_output_item_done(
    state: &mut ResponseState,
    event: ResponseEvent,
    event_sender: &Option<UnboundedSender<Value>>,
) -> Result<()> {
    if let (Some(item), Some(_index)) = (event.item, event.output_index) {
        // Parse the complete item.
        if let Ok(item_value) = serde_json::from_value::<Value>(item.clone()) {
            if let Some(item_type) = item_value.get("type").and_then(|v| v.as_str()) {
                match item_type {
                    "reasoning" => {
                        // Parse as reasoning item.
                        if let Ok(reasoning_item) =
                            serde_json::from_value::<OpenAIResponseOutputItem>(item)
                        {
                            if let OpenAIResponseOutputItem::Reasoning {
                                id,
                                encrypted_content,
                                summary: _,
                            } = &reasoning_item
                            {
                                // Don't send reasoning_tokens here - they're already streamed via delta events

                                // Stream reasoning_item event with both ID and encrypted content.
                                if let Some(content) = encrypted_content {
                                    if let Some(sender) = event_sender {
                                        let metadata = json!({
                                            "id": id,
                                            "encrypted_content": content
                                        });
                                        let _ = sender.send(json!({
                                            "type": "reasoning_item",
                                            "content": {
                                                "metadata": metadata.to_string()
                                            }
                                        }));
                                    }
                                }

                                // Add to state.
                                state.output_items.push(reasoning_item);
                            }
                        }
                    }
                    "function_call" => {
                        // Parse as function call item.
                        if let Ok(mut fc_item) =
                            serde_json::from_value::<OpenAIResponseOutputItem>(item)
                        {
                            if let OpenAIResponseOutputItem::FunctionCall {
                                ref mut arguments,
                                ..
                            } = &mut fc_item
                            {
                                // Strip null characters from arguments
                                *arguments = strip_null_chars(arguments);
                                // Add to state.
                                state.output_items.push(fc_item);
                            }
                        }
                    }
                    "message" => {
                        // Parse as message item.
                        if let Ok(msg_item) =
                            serde_json::from_value::<OpenAIResponseOutputItem>(item)
                        {
                            // Add to state.
                            state.output_items.push(msg_item);
                        }
                    }
                    _ => {}
                }
            }
        }
    }
    Ok(())
}

// fn handle_function_call_arguments_delta(
//     state: &mut ResponseState,
//     event: ResponseEvent,
// ) -> Result<()> {
//     if let (Some(item_id), Some(delta)) = (event.item_id, event.delta) {
//         // Accumulate function call arguments.
//         state
//             .function_call_accumulator
//             .entry(item_id)
//             .and_modify(|args| args.push_str(&delta))
//             .or_insert(delta);
//     }
//     Ok(())
// }

// fn handle_function_call_arguments_done(
//     state: &mut ResponseState,
//     event: ResponseEvent,
// ) -> Result<()> {
//     if let Some(item_id) = event.item_id {
//         // Clear the accumulator for this item
//         state.function_call_accumulator.remove(&item_id);
//     }
//     Ok(())
// }

fn handle_response_completed(
    state: &mut ResponseState,
    event: ResponseEvent,
    _event_sender: &Option<UnboundedSender<Value>>,
) -> Result<()> {
    if let Some(response) = event.response {
        if let Ok(resp) = serde_json::from_value::<OpenAIResponsesResponse>(response) {
            state.completed = true;

            if let Some(output) = resp.output {
                state.output_items = output;
            }

            if let Some(usage) = resp.usage {
                state.usage = Some(usage);
            }
        }
    }
    Ok(())
}

fn handle_response_error(
    event: ResponseEvent,
    provider_name: &str,
    request_id: &Option<String>,
) -> Result<()> {
    let response = match event.response {
        Some(response) => response,
        None => {
            info!("Missing response in error event: {:?}", event);
            Err(anyhow!("Missing response in error event"))?
        }
    };

    let error_msg = {
        // Check for error field (response.failed event)
        if let Some(error) = response.get("error") {
            match error.get("message").and_then(|m| m.as_str()) {
                Some(message) => format!("Response failed: {}", message),
                None => format!("Response failed: {:?}", error),
            }
        }
        // Check for incomplete_details (response.incomplete event)
        else if let Some(incomplete) = response.get("incomplete_details") {
            match incomplete.get("reason").and_then(|r| r.as_str()) {
                Some(reason) => format!("Response incomplete: {}", reason),
                None => format!("Response incomplete: {:?}", incomplete),
            }
        } else {
            info!("Unknown error in OpenAI Responses API: {:?}", response);
            "Unknown error in response".to_string()
        }
    };

    Err(ModelError {
        request_id: request_id.clone(),
        message: format!("{}: {}", provider_name, error_msg),
        retryable: None,
    })?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::chat_messages::{
        ImageContent, ImageContentType, ImageUrlContent, SystemChatMessage, TextContent,
        TextContentType, UserChatMessage,
    };
    use crate::providers::llm::ChatMessageRole;

    #[test]
    fn test_simple_text_input() {
        // Simple case: single user message with text should produce array with one message
        let user_message = ChatMessage::User(UserChatMessage {
            content: ContentBlock::Text("Tell me a bedtime story".to_string()),
            name: None,
            role: ChatMessageRole::User,
        });

        let messages = vec![user_message];
        let result =
            responses_api_input_from_chat_messages(&messages, TransformSystemMessages::Keep, false)
                .unwrap();

        assert_eq!(result.len(), 1);
        if let OpenAIResponseInputItem::Message { role, content } = &result[0] {
            assert_eq!(*role, OpenAIChatMessageRole::User);
            if let OpenAIResponsesMessageContent::String(text) = content {
                assert_eq!(text, "Tell me a bedtime story");
            } else {
                panic!("Expected string content");
            }
        } else {
            panic!("Expected message input item");
        }
    }

    #[test]
    fn test_mixed_content_with_image() {
        // Mixed content with image should produce message array format
        let user_message = ChatMessage::User(UserChatMessage {
            content: ContentBlock::Mixed(vec![
                MixedContent::TextContent(TextContent {
                    r#type: TextContentType::Text,
                    text: "what is in this image?".to_string(),
                }),
                MixedContent::ImageContent(ImageContent {
                    r#type: ImageContentType::ImageUrl,
                    image_url: ImageUrlContent {
                        url: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/2560px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg".to_string(),
                    },
                }),
            ]),
            name: None,
            role: ChatMessageRole::User,
        });

        let messages = vec![user_message];
        let result =
            responses_api_input_from_chat_messages(&messages, TransformSystemMessages::Keep, false)
                .unwrap();

        assert_eq!(result.len(), 1);

        if let OpenAIResponseInputItem::Message { role, content } = &result[0] {
            assert_eq!(*role, OpenAIChatMessageRole::User);

            if let OpenAIResponsesMessageContent::Structured(blocks) = content {
                assert_eq!(blocks.len(), 2);

                // Check text content
                if let OpenAIResponsesInputContentBlock::TextContent(text_block) = &blocks[0] {
                    assert_eq!(text_block.text, "what is in this image?");
                    assert_eq!(
                        text_block.r#type,
                        OpenAIResponsesInputContentType::InputText
                    );
                } else {
                    panic!("Expected text content block");
                }

                // Check image content
                if let OpenAIResponsesInputContentBlock::ImageContent(image_block) = &blocks[1] {
                    assert_eq!(image_block.image_url, "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/2560px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg");
                    assert_eq!(
                        image_block.r#type,
                        OpenAIResponsesInputContentType::InputImage
                    );
                } else {
                    panic!("Expected image content block");
                }
            } else {
                panic!("Expected structured content");
            }
        } else {
            panic!("Expected message input item");
        }
    }

    #[test]
    fn test_multiple_messages_produces_array() {
        // Multiple messages should always produce array format, even if all text
        let messages = vec![
            ChatMessage::System(SystemChatMessage {
                content: "You are a helpful assistant.".to_string(),
                role: ChatMessageRole::System,
            }),
            ChatMessage::User(UserChatMessage {
                content: ContentBlock::Text("Hello!".to_string()),
                name: None,
                role: ChatMessageRole::User,
            }),
        ];

        let result =
            responses_api_input_from_chat_messages(&messages, TransformSystemMessages::Keep, false)
                .unwrap();

        assert_eq!(result.len(), 2);
    }

    #[test]
    fn test_input_image_serialization() {
        // Test that the serialization produces the expected JSON format for input_image
        let image_content = OpenAIResponsesInputImageContent {
            r#type: OpenAIResponsesInputContentType::InputImage,
            image_url: "https://example.com/image.jpg".to_string(),
        };

        let json = serde_json::to_value(&image_content).unwrap();

        // Verify the JSON structure matches Responses API format
        assert_eq!(json["type"], "input_image");
        assert_eq!(json["image_url"], "https://example.com/image.jpg");

        // Verify it's different from Chat API format (which would have nested image_url object)
        assert!(json["image_url"].is_string()); // Direct string, not object
    }

    #[test]
    fn test_input_text_serialization() {
        // Test that the serialization produces the expected JSON format for input_text
        let text_content = OpenAIResponsesInputTextContent {
            r#type: OpenAIResponsesInputContentType::InputText,
            text: "Hello world".to_string(),
        };

        let json = serde_json::to_value(&text_content).unwrap();

        // Verify the JSON structure matches Responses API format
        assert_eq!(json["type"], "input_text");
        assert_eq!(json["text"], "Hello world");
    }

    // Macro to generate parameterized region mismatch/match tests
    macro_rules! region_test {
        (
            $test_name:ident,
            region: $region:expr,
            use_eu_host: $use_eu_host:literal,
            expected_len: $expected_len:literal,
            $description:expr
        ) => {
            #[test]
            fn $test_name() {
                let assistant_message = ChatMessage::Assistant(AssistantChatMessage {
                    content: None,
                    role: ChatMessageRole::Assistant,
                    name: Some("test-model".to_string()),
                    function_call: None,
                    function_calls: None,
                    contents: Some(vec![AssistantContentItem::Reasoning {
                        value: ReasoningContent {
                            reasoning: Some("This is reasoning content".to_string()),
                            metadata: r#"{"id": "reasoning_123", "encrypted_content": "encrypted_data"}"#
                                .to_string(),
                            region: $region,
                        },
                    }]),
                });

                let messages = vec![assistant_message];
                let result = responses_api_input_from_chat_messages(
                    &messages,
                    TransformSystemMessages::Keep,
                    $use_eu_host,
                )
                .unwrap();

                assert_eq!(result.len(), $expected_len, $description);

                // If we expect content to pass through, validate it
                if $expected_len == 1 {
                    if let OpenAIResponseInputItem::Reasoning {
                        id,
                        encrypted_content,
                        summary,
                    } = &result[0]
                    {
                        assert_eq!(id, "reasoning_123");
                        assert_eq!(encrypted_content, "encrypted_data");
                        assert_eq!(summary.len(), 1);
                        assert_eq!(summary[0].text, "This is reasoning content");
                    } else {
                        panic!("Expected reasoning input item");
                    }
                }
            }
        };
    }

    // Region mismatch tests (should be filtered out)
    region_test!(
        test_reasoning_region_mismatch_us_host_eu_region,
        region: Some("eu".to_string()),
        use_eu_host: false,
        expected_len: 0,
        "US host with EU region reasoning content should be filtered out due to region mismatch"
    );

    region_test!(
        test_reasoning_region_mismatch_eu_host_us_region,
        region: Some("us".to_string()),
        use_eu_host: true,
        expected_len: 0,
        "EU host with US region reasoning content should be filtered out due to region mismatch"
    );

    region_test!(
        test_reasoning_region_mismatch_eu_host_no_region,
        region: None,
        use_eu_host: true,
        expected_len: 0,
        "EU host with no region reasoning content should be filtered out (no region defaults to US)"
    );

    // Region match tests (should pass through)
    region_test!(
        test_reasoning_region_match_us_host_us_region,
        region: Some("us".to_string()),
        use_eu_host: false,
        expected_len: 1,
        "US host with US region reasoning content should pass through"
    );

    region_test!(
        test_reasoning_region_match_eu_host_eu_region,
        region: Some("eu".to_string()),
        use_eu_host: true,
        expected_len: 1,
        "EU host with EU region reasoning content should pass through"
    );

    region_test!(
        test_reasoning_region_match_us_host_no_region,
        region: None,
        use_eu_host: false,
        expected_len: 1,
        "US host with no region reasoning content should pass through (no region defaults to US)"
    );
}
