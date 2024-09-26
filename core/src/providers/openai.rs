use crate::providers::chat_messages::{
    AssistantChatMessage, ChatMessage, ContentBlock, MixedContent,
};
use crate::providers::embedder::{Embedder, EmbedderVector};
use crate::providers::llm::Tokens;
use crate::providers::llm::{ChatFunction, ChatFunctionCall};
use crate::providers::llm::{
    ChatMessageRole, LLMChatGeneration, LLMGeneration, LLMTokenUsage, LLM,
};
use crate::providers::provider::{ModelError, ModelErrorRetryOptions, Provider, ProviderID};
use crate::providers::tiktoken::tiktoken::{
    batch_tokenize_async, cl100k_base_singleton, o200k_base_singleton, p50k_base_singleton,
    r50k_base_singleton, CoreBPE,
};
use crate::providers::tiktoken::tiktoken::{decode_async, encode_async};
use crate::run::Credentials;
use crate::utils;
use crate::utils::ParseError;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use eventsource_client as es;
use eventsource_client::Client as ESClient;
use futures::TryStreamExt;
use hyper::StatusCode;
use hyper::{body::Buf, Uri};
use itertools::izip;
use parking_lot::{Mutex, RwLock};
use serde::{Deserialize, Serialize};
use serde_json::json;
use serde_json::Value;
use std::collections::HashMap;
use std::io::prelude::*;
use std::str::FromStr;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc::UnboundedSender;
use tokio::time::timeout;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Usage {
    pub prompt_tokens: u64,
    pub completion_tokens: Option<u64>,
    pub total_tokens: u64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Logprobs {
    pub tokens: Vec<String>,
    pub token_logprobs: Vec<Option<f32>>,
    pub top_logprobs: Option<Vec<Option<HashMap<String, f32>>>>,
    pub text_offset: Vec<usize>,
}

impl Logprobs {
    pub fn logprob(&self) -> f32 {
        let mut logp = 0_f32;
        self.token_logprobs.iter().for_each(|lgp| match lgp {
            None => (),
            Some(lgp) => logp += lgp,
        });
        logp
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Choice {
    pub text: String,
    pub index: usize,
    pub logprobs: Option<Logprobs>,
    pub finish_reason: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Completion {
    pub id: String,
    pub object: String,
    pub created: u64,
    pub model: String,
    pub choices: Vec<Choice>,
    pub usage: Option<Usage>,
}

///
/// Tools implementation types.
///

// Input types.

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
#[serde(rename_all = "lowercase")]
pub enum OpenAIToolType {
    Function,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct OpenAIFunction {
    name: String,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct OpenAIFunctionCall {
    r#type: OpenAIToolType,
    function: OpenAIFunction,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
#[serde(rename_all = "lowercase")]
pub enum OpenAIToolControl {
    Auto,
    Required,
    None,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
#[serde(untagged)]
pub enum OpenAIToolChoice {
    OpenAIToolControl(OpenAIToolControl),
    OpenAIFunctionCall(OpenAIFunctionCall),
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct OpenAIToolFunction {
    pub name: String,
    pub description: Option<String>,
    pub parameters: Option<Value>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct OpenAITool {
    pub r#type: OpenAIToolType,
    pub function: OpenAIToolFunction,
}

impl FromStr for OpenAIToolChoice {
    type Err = ParseError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "auto" => Ok(OpenAIToolChoice::OpenAIToolControl(OpenAIToolControl::Auto)),
            "any" => Ok(OpenAIToolChoice::OpenAIToolControl(
                OpenAIToolControl::Required,
            )),
            "none" => Ok(OpenAIToolChoice::OpenAIToolControl(OpenAIToolControl::None)),
            _ => {
                let function = OpenAIFunctionCall {
                    r#type: OpenAIToolType::Function,
                    function: OpenAIFunction {
                        name: s.to_string(),
                    },
                };
                Ok(OpenAIToolChoice::OpenAIFunctionCall(function))
            }
        }
    }
}

// Outputs types.

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct OpenAIToolCallFunction {
    name: String,
    arguments: String,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct OpenAIToolCall {
    #[serde(skip_serializing_if = "Option::is_none")]
    id: Option<String>,
    r#type: OpenAIToolType,
    pub function: OpenAIToolCallFunction,
}

impl TryFrom<&ChatFunctionCall> for OpenAIToolCall {
    type Error = anyhow::Error;

    fn try_from(cf: &ChatFunctionCall) -> Result<Self, Self::Error> {
        Ok(OpenAIToolCall {
            id: Some(cf.id.clone()),
            r#type: OpenAIToolType::Function,
            function: OpenAIToolCallFunction {
                name: cf.name.clone(),
                arguments: cf.arguments.clone(),
            },
        })
    }
}

impl TryFrom<&OpenAIToolCall> for ChatFunctionCall {
    type Error = anyhow::Error;

    fn try_from(tc: &OpenAIToolCall) -> Result<Self, Self::Error> {
        let id = tc
            .id
            .as_ref()
            .ok_or_else(|| anyhow!("Missing tool call id."))?;

        Ok(ChatFunctionCall {
            id: id.clone(),
            name: tc.function.name.clone(),
            arguments: tc.function.arguments.clone(),
        })
    }
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
#[serde(rename_all = "lowercase")]
pub enum OpenAIChatMessageRole {
    Assistant,
    Function,
    System,
    Tool,
    User,
}

impl From<&ChatMessageRole> for OpenAIChatMessageRole {
    fn from(role: &ChatMessageRole) -> Self {
        match role {
            ChatMessageRole::Assistant => OpenAIChatMessageRole::Assistant,
            ChatMessageRole::Function => OpenAIChatMessageRole::Function,
            ChatMessageRole::System => OpenAIChatMessageRole::System,
            ChatMessageRole::User => OpenAIChatMessageRole::User,
        }
    }
}

impl FromStr for OpenAIChatMessageRole {
    type Err = ParseError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "system" => Ok(OpenAIChatMessageRole::System),
            "user" => Ok(OpenAIChatMessageRole::User),
            "assistant" => Ok(OpenAIChatMessageRole::Assistant),
            "function" => Ok(OpenAIChatMessageRole::Tool),
            _ => Err(ParseError::with_message("Unknown OpenAIChatMessageRole"))?,
        }
    }
}

impl From<OpenAIChatMessageRole> for ChatMessageRole {
    fn from(value: OpenAIChatMessageRole) -> Self {
        match value {
            OpenAIChatMessageRole::Assistant => ChatMessageRole::Assistant,
            OpenAIChatMessageRole::Function => ChatMessageRole::Function,
            OpenAIChatMessageRole::System => ChatMessageRole::System,
            OpenAIChatMessageRole::Tool => ChatMessageRole::Function,
            OpenAIChatMessageRole::User => ChatMessageRole::User,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
#[serde(rename_all = "snake_case")]
pub enum OpenAITextContentType {
    Text,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct OpenAITextContent {
    #[serde(rename = "type")]
    pub r#type: OpenAITextContentType,
    pub text: String,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct OpenAIImageUrlContent {
    pub url: String,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
#[serde(rename_all = "snake_case")]
pub enum OpenAIImageContentType {
    ImageUrl,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct OpenAIImageContent {
    pub r#type: OpenAIImageContentType,
    pub image_url: OpenAIImageUrlContent,
}

// Define an enum for mixed content
#[derive(Serialize, Deserialize, Debug, PartialEq, Clone)]
#[serde(untagged)]
pub enum OpenAIContentBlock {
    TextContent(OpenAITextContent),
    ImageContent(OpenAIImageContent),
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct OpenAIContentBlockVec(Vec<OpenAIContentBlock>);

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct OpenAIChatMessage {
    pub role: OpenAIChatMessageRole,
    pub content: Option<OpenAIContentBlockVec>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<OpenAIToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct OpenAICompletionChatMessage {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub role: OpenAIChatMessageRole,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<OpenAIToolCall>>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct OpenAIChatChoice {
    pub message: OpenAICompletionChatMessage,
    pub index: usize,
    pub finish_reason: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct OpenAIChatCompletion {
    pub id: String,
    pub object: String,
    pub created: u64,
    pub choices: Vec<OpenAIChatChoice>,
    pub usage: Option<Usage>,
}

// This code performs a type conversion with information loss when converting to ChatFunctionCall.
// It only supports one tool call, so it takes the first one from the vector of OpenAIToolCall,
// hence potentially discarding other tool calls.
impl TryFrom<&OpenAICompletionChatMessage> for AssistantChatMessage {
    type Error = anyhow::Error;

    fn try_from(cm: &OpenAICompletionChatMessage) -> Result<Self, Self::Error> {
        let role = ChatMessageRole::from(cm.role.clone());
        let content = match cm.content.as_ref() {
            Some(c) => Some(c.clone()),
            None => None,
        };

        let function_calls = if let Some(tool_calls) = cm.tool_calls.as_ref() {
            let cfc = tool_calls
                .into_iter()
                .map(|tc| ChatFunctionCall::try_from(tc))
                .collect::<Result<Vec<ChatFunctionCall>, _>>()?;

            Some(cfc)
        } else {
            None
        };

        let function_call = if let Some(fcs) = function_calls.as_ref() {
            match fcs.first() {
                Some(fc) => Some(fc),
                None => None,
            }
            .cloned()
        } else {
            None
        };

        let name = match cm.name.as_ref() {
            Some(c) => Some(c.clone()),
            None => None,
        };

        Ok(AssistantChatMessage {
            content,
            role,
            name,
            function_call,
            function_calls,
        })
    }
}

impl TryFrom<&ContentBlock> for OpenAIContentBlockVec {
    type Error = anyhow::Error;

    fn try_from(cm: &ContentBlock) -> Result<Self, Self::Error> {
        match cm {
            ContentBlock::Text(t) => Ok(OpenAIContentBlockVec(vec![
                OpenAIContentBlock::TextContent(OpenAITextContent {
                    r#type: OpenAITextContentType::Text,
                    text: t.clone(),
                }),
            ])),
            ContentBlock::Mixed(m) => {
                let content: Vec<OpenAIContentBlock> = m
                    .into_iter()
                    .map(|mb| match mb {
                        MixedContent::TextContent(tc) => {
                            Ok(OpenAIContentBlock::TextContent(OpenAITextContent {
                                r#type: OpenAITextContentType::Text,
                                text: tc.text.clone(),
                            }))
                        }
                        MixedContent::ImageContent(ic) => {
                            Ok(OpenAIContentBlock::ImageContent(OpenAIImageContent {
                                r#type: OpenAIImageContentType::ImageUrl,
                                image_url: OpenAIImageUrlContent {
                                    url: ic.image_url.url.clone(),
                                },
                            }))
                        }
                    })
                    .collect::<Result<Vec<OpenAIContentBlock>>>()?;

                Ok(OpenAIContentBlockVec(content))
            }
        }
    }
}

impl TryFrom<&String> for OpenAIContentBlockVec {
    type Error = anyhow::Error;

    fn try_from(t: &String) -> Result<Self, Self::Error> {
        Ok(OpenAIContentBlockVec(vec![
            OpenAIContentBlock::TextContent(OpenAITextContent {
                r#type: OpenAITextContentType::Text,
                text: t.clone(),
            }),
        ]))
    }
}

impl TryFrom<&ChatMessage> for OpenAIChatMessage {
    type Error = anyhow::Error;

    fn try_from(cm: &ChatMessage) -> Result<Self, Self::Error> {
        match cm {
            ChatMessage::Assistant(assistant_msg) => Ok(OpenAIChatMessage {
                content: match &assistant_msg.content {
                    Some(c) => Some(OpenAIContentBlockVec::try_from(c)?),
                    None => None,
                },
                name: assistant_msg.name.clone(),
                role: OpenAIChatMessageRole::from(&assistant_msg.role),
                tool_calls: match assistant_msg.function_calls.as_ref() {
                    Some(fc) => Some(
                        fc.into_iter()
                            .map(|f| OpenAIToolCall::try_from(f))
                            .collect::<Result<Vec<OpenAIToolCall>, _>>()?,
                    ),
                    None => None,
                },
                tool_call_id: None,
            }),
            ChatMessage::Function(function_msg) => Ok(OpenAIChatMessage {
                content: Some(OpenAIContentBlockVec::try_from(&function_msg.content)?),
                name: None,
                role: OpenAIChatMessageRole::Tool,
                tool_calls: None,
                tool_call_id: Some(function_msg.function_call_id.clone()),
            }),
            ChatMessage::System(system_msg) => Ok(OpenAIChatMessage {
                content: Some(OpenAIContentBlockVec::try_from(&system_msg.content)?),
                name: None,
                role: OpenAIChatMessageRole::from(&system_msg.role),
                tool_calls: None,
                tool_call_id: None,
            }),
            ChatMessage::User(user_msg) => Ok(OpenAIChatMessage {
                content: Some(OpenAIContentBlockVec::try_from(&user_msg.content)?),
                name: user_msg.name.clone(),
                role: OpenAIChatMessageRole::from(&user_msg.role),
                tool_calls: None,
                tool_call_id: None,
            }),
        }
    }
}

impl TryFrom<&ChatFunction> for OpenAITool {
    type Error = anyhow::Error;

    fn try_from(f: &ChatFunction) -> Result<Self, Self::Error> {
        Ok(OpenAITool {
            r#type: OpenAIToolType::Function,
            function: OpenAIToolFunction {
                name: f.name.clone(),
                description: f.description.clone(),
                parameters: f.parameters.clone(),
            },
        })
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ChatDelta {
    pub delta: Value,
    pub index: usize,
    pub finish_reason: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ChatChunk {
    pub id: String,
    pub object: String,
    pub created: u64,
    pub model: String,
    pub choices: Vec<ChatDelta>,
    pub usage: Option<Usage>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct InnerError {
    pub message: String,
    #[serde(alias = "type")]
    pub _type: String,
    pub param: Option<String>,
    pub internal_message: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct OpenAIError {
    pub error: InnerError,
}

impl OpenAIError {
    pub fn message(&self) -> String {
        match self.error.internal_message {
            Some(ref msg) => format!(
                "OpenAIError: [{}] {} internal_message={}",
                self.error._type, self.error.message, msg,
            ),
            None => format!("OpenAIError: [{}] {}", self.error._type, self.error.message,),
        }
    }

    pub fn retryable(&self) -> bool {
        match self.error._type.as_str() {
            "requests" => true,
            "server_error" => match &self.error.internal_message {
                Some(message) if message.contains("retry") => true,
                _ => false,
            },
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
        match self.error._type.as_str() {
            "server_error" => match self.error.internal_message {
                Some(_) => true,
                None => false,
            },
            _ => false,
        }
    }
}

///
/// Shared streamed/non-streamed chat/completion handling code (used by both OpenAILLM and
/// AzureOpenAILLM).
///

pub async fn streamed_completion(
    uri: Uri,
    api_key: String,
    organization_id: Option<String>,
    model_id: Option<String>,
    prompt: &str,
    max_tokens: Option<i32>,
    temperature: f32,
    n: usize,
    logprobs: Option<i32>,
    echo: bool,
    stop: &Vec<String>,
    frequency_penalty: f32,
    presence_penalty: f32,
    top_p: f32,
    user: Option<String>,
    event_sender: Option<UnboundedSender<Value>>,
) -> Result<(Completion, Option<String>)> {
    let url = uri.to_string();

    let mut builder = match es::ClientBuilder::for_url(url.as_str()) {
        Ok(b) => b,
        Err(_) => return Err(anyhow!("Error creating streamed client to OpenAI")),
    };
    builder = match builder.method(String::from("POST")).header(
        "Authorization",
        format!("Bearer {}", api_key.clone()).as_str(),
    ) {
        Ok(b) => b,
        Err(_) => return Err(anyhow!("Error creating streamed client to OpenAI")),
    };
    builder = match builder.header("Content-Type", "application/json") {
        Ok(b) => b,
        Err(_) => return Err(anyhow!("Error creating streamed client to OpenAI")),
    };
    builder = match builder.header("api-key", api_key.clone().as_str()) {
        Ok(b) => b,
        Err(_) => return Err(anyhow!("Error creating streamed client to OpenAI")),
    };

    if let Some(org_id) = organization_id {
        builder = builder
            .header("OpenAI-Organization", org_id.as_str())
            .map_err(|_| anyhow!("Error creating streamed client to OpenAI"))?;
    }

    let mut body = json!({
        "prompt": prompt,
        "temperature": temperature,
        "n": n,
        "logprobs": logprobs,
        "echo": echo,
        "frequency_penalty": frequency_penalty,
        "presence_penalty": presence_penalty,
        "top_p": top_p,
        "stream": true,
    });
    if user.is_some() {
        body["user"] = json!(user);
    }
    if model_id.is_some() {
        body["model"] = json!(model_id);
    }
    if let Some(mt) = max_tokens {
        body["max_tokens"] = mt.into();
    }
    if !stop.is_empty() {
        body["stop"] = json!(stop);
    }

    // println!("BODY: {}", body.to_string());

    let client = builder
        .body(body.to_string())
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

    let completions: Arc<Mutex<Vec<Completion>>> = Arc::new(Mutex::new(Vec::new()));
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
                    println!("UNEXPECTED COMMENT");
                }
                Some(es::SSE::Event(e)) => match e.data.as_str() {
                    "[DONE]" => {
                        break 'stream;
                    }
                    _ => {
                        let index = {
                            let guard = completions.lock();
                            guard.len()
                        };

                        let completion: Completion = match serde_json::from_str(e.data.as_str()) {
                            Ok(c) => c,
                            Err(err) => {
                                let error: Result<OpenAIError, _> =
                                    serde_json::from_str(e.data.as_str());
                                match error {
                                    Ok(error) => {
                                        match error.retryable_streamed(StatusCode::OK) && index == 0
                                        {
                                            true => Err(ModelError {
                                                request_id: request_id.clone(),
                                                message: error.message(),
                                                retryable: Some(ModelErrorRetryOptions {
                                                    sleep: Duration::from_millis(500),
                                                    factor: 2,
                                                    retries: 3,
                                                }),
                                            })?,
                                            false => Err(ModelError {
                                                request_id: request_id.clone(),
                                                message: error.message(),
                                                retryable: None,
                                            })?,
                                        }
                                        break 'stream;
                                    }
                                    Err(_) => {
                                        Err(anyhow!(
                                            "OpenAIError: failed parsing streamed \
                                                 completion from OpenAI err={} data={}",
                                            err,
                                            e.data.as_str(),
                                        ))?;
                                        break 'stream;
                                    }
                                }
                            }
                        };

                        // UTF-8 length of the prompt (as used by the API for text_offset).
                        let prompt_len = prompt.chars().count();

                        // Only stream if choices is length 1 but should always be the case.
                        match event_sender.as_ref() {
                            Some(sender) => {
                                let mut text = completion.choices[0].text.clone();
                                let mut tokens = match completion.choices[0].logprobs.as_ref() {
                                    Some(l) => Some(l.tokens.clone()),
                                    None => None,
                                };
                                let mut logprobs = match completion.choices[0].logprobs.as_ref() {
                                    Some(l) => Some(l.token_logprobs.clone()),
                                    None => None,
                                };
                                let text_offset = match completion.choices[0].logprobs.as_ref() {
                                    Some(l) => Some(l.text_offset.clone()),
                                    None => None,
                                };
                                if index == 0 && text_offset.is_some() {
                                    let mut token_offset: usize = 0;
                                    for o in text_offset.as_ref().unwrap() {
                                        if *o < prompt_len {
                                            token_offset += 1;
                                        }
                                    }
                                    text = text.chars().skip(prompt_len).collect::<String>();
                                    tokens = match tokens {
                                        Some(t) => Some(t[token_offset..].to_vec()),
                                        None => None,
                                    };
                                    logprobs = match logprobs {
                                        Some(l) => Some(l[token_offset..].to_vec()),
                                        None => None,
                                    };
                                }

                                if text.len() > 0 {
                                    let _ = sender.send(json!({
                                        "type": "tokens",
                                        "content": {
                                            "text": text,
                                            "tokens": tokens,
                                            "logprobs": logprobs,
                                        },
                                    }));
                                }
                            }
                            None => (),
                        };
                        completions.lock().push(completion);
                    }
                },
                None => {
                    println!("UNEXPECTED NONE");
                    break 'stream;
                }
            },
            Err(e) => {
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
                                        message: error.message(),
                                        retryable: Some(ModelErrorRetryOptions {
                                            sleep: Duration::from_millis(500),
                                            factor: 2,
                                            retries: 3,
                                        }),
                                    }),
                                    false => Err(ModelError {
                                        request_id,
                                        message: error.message(),
                                        retryable: None,
                                    }),
                                }
                            }?,
                            Err(_) => {
                                Err(anyhow!(
                                    "Error streaming tokens from OpenAI: status={} data={}",
                                    status,
                                    String::from_utf8_lossy(&b)
                                ))?;
                            }
                        }
                    }
                    _ => {
                        Err(anyhow!("Error streaming tokens from OpenAI: {:?}", e))?;
                    }
                }
                break 'stream;
            }
        }
    }

    let completion = {
        let mut guard = completions.lock();
        let mut c = match guard.len() {
            0 => Err(anyhow!("No completions received from OpenAI")),
            _ => Ok(guard[0].clone()),
        }?;
        guard.remove(0);
        for i in 0..guard.len() {
            let a = guard[i].clone();
            if a.choices.len() != c.choices.len() {
                Err(anyhow!(
                    "Inconsistent number of choices in streamed completions"
                ))?;
            }
            for j in 0..c.choices.len() {
                c.choices[j].finish_reason = a.choices.get(j).unwrap().finish_reason.clone();
                // OpenAI does the bytes merging for us <3.
                c.choices[j].text = format!("{}{}", c.choices[j].text, a.choices[j].text);

                match c.choices[j].logprobs.as_mut() {
                    Some(c_logprobs) => match a.choices[j].logprobs.as_ref() {
                        Some(a_logprobs) => {
                            c_logprobs.tokens.extend(a_logprobs.tokens.clone());
                            c_logprobs
                                .token_logprobs
                                .extend(a_logprobs.token_logprobs.clone());
                            c_logprobs
                                .text_offset
                                .extend(a_logprobs.text_offset.clone());
                            match c_logprobs.top_logprobs.as_mut() {
                                Some(c_top_logprobs) => match a_logprobs.top_logprobs.as_ref() {
                                    Some(a_top_logprobs) => {
                                        c_top_logprobs.extend(a_top_logprobs.clone());
                                    }
                                    None => (),
                                },
                                None => (),
                            }
                        }
                        None => (),
                    },
                    None => (),
                }
            }
        }
        c
    };

    Ok((completion, request_id))
}

pub async fn completion(
    uri: Uri,
    api_key: String,
    organization_id: Option<String>,
    model_id: Option<String>,
    prompt: &str,
    max_tokens: Option<i32>,
    temperature: f32,
    n: usize,
    logprobs: Option<i32>,
    echo: bool,
    stop: &Vec<String>,
    frequency_penalty: f32,
    presence_penalty: f32,
    top_p: f32,
    user: Option<String>,
) -> Result<(Completion, Option<String>)> {
    // let https = HttpsConnector::new();
    // let cli = Client::builder().build::<_, hyper::Body>(https);

    let mut body = json!({
        "prompt": prompt,
        "temperature": temperature,
        "n": n,
        "logprobs": logprobs,
        "frequency_penalty": frequency_penalty,
        "presence_penalty": presence_penalty,
        "top_p": top_p,
    });
    if user.is_some() {
        body["user"] = json!(user);
    }
    if model_id.is_some() {
        body["model"] = json!(model_id);
    }
    if let Some(mt) = max_tokens {
        body["max_tokens"] = mt.into();
    }
    if !stop.is_empty() {
        body["stop"] = json!(stop);
    }

    match model_id {
        None => (),
        Some(model_id) => {
            body["model"] = json!(model_id);
            // `gpt-3.5-turbo-instruct` does not support `echo`
            if !model_id.starts_with("gpt-3.5-turbo-instruct") {
                body["echo"] = json!(echo);
            }
        }
    };

    let mut req = reqwest::Client::new()
        .post(uri.to_string())
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_key.clone()))
        .header("api-key", api_key.clone());

    if let Some(organization_id) = organization_id {
        req = req.header("OpenAI-Organization", organization_id);
    }

    req = req.json(&body);

    let res = match timeout(Duration::new(180, 0), req.send()).await {
        Ok(Ok(res)) => res,
        Ok(Err(e)) => Err(e)?,
        Err(_) => Err(anyhow!("Timeout sending request to OpenAI after 180s"))?,
    };

    let res_headers = res.headers();
    let request_id = match res_headers.get("x-request-id") {
        Some(request_id) => Some(request_id.to_str()?.to_string()),
        None => None,
    };

    let body = match timeout(Duration::new(180, 0), res.bytes()).await {
        Ok(Ok(body)) => body,
        Ok(Err(e)) => Err(e)?,
        Err(_) => Err(anyhow!("Timeout reading response from OpenAI after 180s"))?,
    };

    let mut b: Vec<u8> = vec![];
    body.reader().read_to_end(&mut b)?;
    let c: &[u8] = &b;

    let completion: Completion = match serde_json::from_slice(c) {
        Ok(c) => Ok(c),
        Err(_) => {
            let error: OpenAIError = serde_json::from_slice(c)?;
            match error.retryable() {
                true => Err(ModelError {
                    request_id: request_id.clone(),
                    message: error.message(),
                    retryable: Some(ModelErrorRetryOptions {
                        sleep: Duration::from_millis(500),
                        factor: 2,
                        retries: 3,
                    }),
                }),
                false => Err(ModelError {
                    request_id: request_id.clone(),
                    message: error.message(),
                    retryable: Some(ModelErrorRetryOptions {
                        sleep: Duration::from_millis(500),
                        factor: 1,
                        retries: 1,
                    }),
                }),
            }
        }
    }?;

    Ok((completion, request_id))
}

pub async fn streamed_chat_completion(
    uri: Uri,
    api_key: String,
    organization_id: Option<String>,
    model_id: Option<String>,
    messages: &Vec<OpenAIChatMessage>,
    tools: Vec<OpenAITool>,
    tool_choice: Option<OpenAIToolChoice>,
    temperature: f32,
    top_p: f32,
    n: usize,
    stop: &Vec<String>,
    max_tokens: Option<i32>,
    presence_penalty: f32,
    frequency_penalty: f32,
    response_format: Option<String>,
    user: Option<String>,
    event_sender: Option<UnboundedSender<Value>>,
) -> Result<(OpenAIChatCompletion, Option<String>)> {
    let url = uri.to_string();

    let mut builder = match es::ClientBuilder::for_url(url.as_str()) {
        Ok(b) => b,
        Err(_) => return Err(anyhow!("Error creating streamed client to OpenAI")),
    };
    builder = match builder.method(String::from("POST")).header(
        "Authorization",
        format!("Bearer {}", api_key.clone()).as_str(),
    ) {
        Ok(b) => b,
        Err(_) => return Err(anyhow!("Error creating streamed client to OpenAI")),
    };
    builder = match builder.header("Content-Type", "application/json") {
        Ok(b) => b,
        Err(_) => return Err(anyhow!("Error creating streamed client to OpenAI")),
    };
    builder = match builder.header("api-key", api_key.clone().as_str()) {
        Ok(b) => b,
        Err(_) => return Err(anyhow!("Error creating streamed client to OpenAI")),
    };

    if let Some(org_id) = organization_id {
        builder = builder
            .header("OpenAI-Organization", org_id.as_str())
            .map_err(|_| anyhow!("Error creating streamed client to OpenAI"))?;
    }

    let mut body = json!({
        "messages": messages,
        "temperature": temperature,
        "top_p": top_p,
        "n": n,
        "presence_penalty": presence_penalty,
        "frequency_penalty": frequency_penalty,
        "stream": true,
        "stream_options": HashMap::from([("include_usage", true)]),
    });
    if user.is_some() {
        body["user"] = json!(user);
    }
    if model_id.is_some() {
        body["model"] = json!(model_id);
    }
    if let Some(mt) = max_tokens {
        body["max_tokens"] = mt.into();
    }
    if !stop.is_empty() {
        body["stop"] = json!(stop);
    }

    if tools.len() > 0 {
        body["tools"] = json!(tools);
    }
    if tool_choice.is_some() {
        body["tool_choice"] = json!(tool_choice);
    }
    if response_format.is_some() {
        body["response_format"] = json!({
            "type": response_format.unwrap(),
        });
    }

    let client = builder
        .body(body.to_string())
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

    let chunks: Arc<Mutex<Vec<ChatChunk>>> = Arc::new(Mutex::new(Vec::new()));
    let mut usage = None;
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
                    println!("UNEXPECTED COMMENT");
                }
                Some(es::SSE::Event(e)) => match e.data.as_str() {
                    "[DONE]" => {
                        break 'stream;
                    }
                    _ => {
                        let index = {
                            let guard = chunks.lock();
                            guard.len()
                        };

                        let chunk: ChatChunk = match serde_json::from_str(e.data.as_str()) {
                            Ok(c) => c,
                            Err(err) => {
                                let error: Result<OpenAIError, _> =
                                    serde_json::from_str(e.data.as_str());
                                match error {
                                    Ok(error) => {
                                        match error.retryable_streamed(StatusCode::OK) && index == 0
                                        {
                                            true => Err(ModelError {
                                                request_id: request_id.clone(),
                                                message: error.message(),
                                                retryable: Some(ModelErrorRetryOptions {
                                                    sleep: Duration::from_millis(500),
                                                    factor: 2,
                                                    retries: 3,
                                                }),
                                            })?,
                                            false => Err(ModelError {
                                                request_id: request_id.clone(),
                                                message: error.message(),
                                                retryable: None,
                                            })?,
                                        }
                                        break 'stream;
                                    }
                                    Err(_) => {
                                        Err(anyhow!(
                                            "OpenAIError: failed parsing streamed \
                                                 completion from OpenAI err={} data={}",
                                            err,
                                            e.data.as_str(),
                                        ))?;
                                        break 'stream;
                                    }
                                }
                            }
                        };

                        // Store usage
                        match &chunk.usage {
                            Some(received_usage) => {
                                usage = Some(received_usage.clone());
                            }
                            None => (),
                        };

                        // Only stream if choices is length 1 but should always be the case.
                        match event_sender.as_ref() {
                            Some(sender) => {
                                if chunk.choices.len() == 1 {
                                    // we ignore the role for generating events

                                    // If we get `content` in the delta object we stream "tokens".
                                    match chunk.choices[0].delta.get("content") {
                                        None => (),
                                        Some(content) => match content.as_str() {
                                            None => (),
                                            Some(s) => {
                                                if s.len() > 0 {
                                                    let _ = sender.send(json!({
                                                        "type": "tokens",
                                                        "content": {
                                                            "text": s,
                                                        },
                                                    }));
                                                }
                                            }
                                        },
                                    };

                                    // Emit a `function_call` event per tool_call.
                                    if let Some(tool_calls) = chunk.choices[0]
                                        .delta
                                        .get("tool_calls")
                                        .and_then(|v| v.as_array())
                                    {
                                        tool_calls.iter().for_each(|tool_call| {
                                            match tool_call.get("function") {
                                                Some(f) => {
                                                    if let Some(Value::String(name)) = f.get("name")
                                                    {
                                                        let _ = sender.send(json!({
                                                            "type": "function_call",
                                                            "content": {
                                                                "name": name,
                                                            },
                                                        }));
                                                    }
                                                }
                                                _ => (),
                                            }
                                        });
                                    }
                                }
                            }
                            None => (),
                        };

                        if !chunk.choices.is_empty() {
                            chunks.lock().push(chunk);
                        }
                    }
                },
                None => {
                    println!("UNEXPECTED NONE");
                    break 'stream;
                }
            },
            Err(e) => {
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
                                        message: error.message(),
                                        retryable: Some(ModelErrorRetryOptions {
                                            sleep: Duration::from_millis(500),
                                            factor: 2,
                                            retries: 3,
                                        }),
                                    }),
                                    false => Err(ModelError {
                                        request_id,
                                        message: error.message(),
                                        retryable: None,
                                    }),
                                }
                            }?,
                            Err(_) => {
                                Err(anyhow!(
                                    "Error streaming tokens from OpenAI: status={} data={}",
                                    status,
                                    String::from_utf8_lossy(&b)
                                ))?;
                            }
                        }
                    }
                    _ => {
                        Err(anyhow!("Error streaming tokens from OpenAI: {:?}", e))?;
                    }
                }
                break 'stream;
            }
        }
    }

    let mut completion = {
        let guard = chunks.lock();
        let f = match guard.len() {
            0 => Err(anyhow!("No chunks received from OpenAI")),
            _ => Ok(guard[0].clone()),
        }?;
        let mut c = OpenAIChatCompletion {
            id: f.id.clone(),
            object: f.object.clone(),
            created: f.created,
            choices: f
                .choices
                .iter()
                .map(|c| OpenAIChatChoice {
                    message: OpenAICompletionChatMessage {
                        content: Some("".to_string()),
                        name: None,
                        role: OpenAIChatMessageRole::System,
                        tool_calls: None,
                        tool_call_id: None,
                    },
                    index: c.index,
                    finish_reason: None,
                })
                .collect::<Vec<_>>(),
            usage,
        };

        for i in 0..guard.len() {
            let a = guard[i].clone();
            if a.choices.len() != f.choices.len() {
                Err(anyhow!("Inconsistent number of choices in streamed chunks"))?;
            }
            for j in 0..a.choices.len() {
                match a.choices.get(j).unwrap().finish_reason.clone() {
                    None => (),
                    Some(f) => c.choices[j].finish_reason = Some(f),
                };

                match a.choices[j].delta.get("role") {
                    None => (),
                    Some(role) => match role.as_str() {
                        None => (),
                        Some(r) => {
                            c.choices[j].message.role = OpenAIChatMessageRole::from_str(r)?;
                        }
                    },
                };

                match a.choices[j].delta.get("content") {
                    None => (),
                    Some(content) => match content.as_str() {
                        None => (),
                        Some(s) => {
                            c.choices[j].message.content = Some(format!(
                                "{}{}",
                                c.choices[j]
                                    .message
                                    .content
                                    .as_ref()
                                    .unwrap_or(&String::new()),
                                s
                            ));
                        }
                    },
                };

                if let Some(tool_calls) = a.choices[j]
                    .delta
                    .get("tool_calls")
                    .and_then(|v| v.as_array())
                {
                    for tool_call in tool_calls {
                        match (
                            tool_call.get("type").and_then(|v| v.as_str()),
                            tool_call.get("id").and_then(|v| v.as_str()),
                            tool_call.get("function"),
                        ) {
                            (Some("function"), Some(id), Some(f)) => {
                                if let Some(Value::String(name)) = f.get("name") {
                                    c.choices[j]
                                        .message
                                        .tool_calls
                                        .get_or_insert_with(Vec::new)
                                        .push(OpenAIToolCall {
                                            id: Some(id.to_string()),
                                            r#type: OpenAIToolType::Function,
                                            function: OpenAIToolCallFunction {
                                                name: name.clone(),
                                                arguments: String::new(),
                                            },
                                        });
                                }
                            }
                            (None, None, Some(f)) => {
                                if let (Some(Value::Number(idx)), Some(Value::String(a))) =
                                    (tool_call.get("index"), f.get("arguments"))
                                {
                                    let index: usize = idx
                                        .as_u64()
                                        .ok_or_else(|| anyhow!("Missing index for tools"))?
                                        .try_into()
                                        .map_err(|e| {
                                            anyhow!("Invalid index value for tools: {:?}", e)
                                        })?;

                                    let tool_calls = c.choices[j]
                                        .message
                                        .tool_calls
                                        .as_mut()
                                        .ok_or(anyhow!("Missing tool calls"))?;

                                    if index >= tool_calls.len() {
                                        return Err(anyhow!(
                                            "Index out-of-bound for tool_calls: {}",
                                            index
                                        ));
                                    }

                                    tool_calls[index].function.arguments += a;
                                }
                            }
                            _ => (),
                        }
                    }
                }
            }
        }
        c
    };

    // for all messages, edit the content and strip leading and trailing spaces and \n
    for m in completion.choices.iter_mut() {
        m.message.content = match m.message.content.as_ref() {
            None => None,
            Some(c) => Some(c.trim().to_string()),
        };
    }

    Ok((completion, request_id))
}

pub async fn chat_completion(
    uri: Uri,
    api_key: String,
    organization_id: Option<String>,
    model_id: Option<String>,
    messages: &Vec<OpenAIChatMessage>,
    tools: Vec<OpenAITool>,
    tool_choice: Option<OpenAIToolChoice>,
    temperature: f32,
    top_p: f32,
    n: usize,
    stop: &Vec<String>,
    max_tokens: Option<i32>,
    presence_penalty: f32,
    frequency_penalty: f32,
    response_format: Option<String>,
    user: Option<String>,
) -> Result<(OpenAIChatCompletion, Option<String>)> {
    let mut body = json!({
        "messages": messages,
        "temperature": temperature,
        "top_p": top_p,
        "n": n,
        "presence_penalty": presence_penalty,
        "frequency_penalty": frequency_penalty,
    });
    if user.is_some() {
        body["user"] = json!(user);
    }
    if model_id.is_some() {
        body["model"] = json!(model_id);
    }
    if let Some(mt) = max_tokens {
        body["max_tokens"] = mt.into();
    }
    if !stop.is_empty() {
        body["stop"] = json!(stop);
    }

    if response_format.is_some() {
        body["response_format"] = json!({
            "type": response_format.unwrap(),
        });
    }
    if tools.len() > 0 {
        body["tools"] = json!(tools);
    }
    if tool_choice.is_some() {
        body["tool_choice"] = json!(tool_choice);
    }

    let mut req = reqwest::Client::new()
        .post(uri.to_string())
        .header("Content-Type", "application/json")
        // This one is for `openai`.
        .header("Authorization", format!("Bearer {}", api_key.clone()))
        // This one is for `azure_openai`.
        .header("api-key", api_key.clone());

    if let Some(organization_id) = organization_id {
        req = req.header(
            "OpenAI-Organization",
            &format!("{}", organization_id.clone()),
        );
    }

    let req = req.json(&body);

    let res = match timeout(Duration::new(180, 0), req.send()).await {
        Ok(Ok(res)) => res,
        Ok(Err(e)) => Err(e)?,
        Err(_) => Err(anyhow!("Timeout sending request to OpenAI after 180s"))?,
    };

    let res_headers = res.headers();
    let request_id = match res_headers.get("x-request-id") {
        Some(request_id) => Some(request_id.to_str()?.to_string()),
        None => None,
    };

    let body = match timeout(Duration::new(180, 0), res.bytes()).await {
        Ok(Ok(body)) => body,
        Ok(Err(e)) => Err(e)?,
        Err(_) => Err(anyhow!("Timeout reading response from OpenAI after 180s"))?,
    };

    let mut b: Vec<u8> = vec![];
    body.reader().read_to_end(&mut b)?;
    let c: &[u8] = &b;

    let mut completion: OpenAIChatCompletion = match serde_json::from_slice(c) {
        Ok(c) => Ok(c),
        Err(_) => {
            let error: OpenAIError = serde_json::from_slice(c)?;
            match error.retryable() {
                true => Err(ModelError {
                    request_id: request_id.clone(),
                    message: error.message(),
                    retryable: Some(ModelErrorRetryOptions {
                        sleep: Duration::from_millis(500),
                        factor: 2,
                        retries: 3,
                    }),
                }),
                false => Err(ModelError {
                    request_id: request_id.clone(),
                    message: error.message(),
                    retryable: Some(ModelErrorRetryOptions {
                        sleep: Duration::from_millis(500),
                        factor: 1,
                        retries: 1,
                    }),
                }),
            }
        }
    }?;

    // for all messages, edit the content and strip leading and trailing spaces and \n
    for m in completion.choices.iter_mut() {
        m.message.content = match m.message.content.as_ref() {
            None => None,
            Some(c) => Some(c.trim().to_string()),
        };
    }

    Ok((completion, request_id))
}

///
/// Shared streamed/non-streamed chat/completion handling code (used by both OpenAILLM and
/// AzureOpenAILLM).
///

fn get_model_id_from_internal_embeddings_id(model_id: &str) -> &str {
    match model_id {
        "text-embedding-3-large-1536" => "text-embedding-3-large",
        _ => model_id,
    }
}

pub async fn embed(
    uri: Uri,
    api_key: String,
    organization_id: Option<String>,
    model_id: Option<String>,
    text: Vec<&str>,
    user: Option<String>,
) -> Result<Embeddings> {
    let mut body = json!({
        "input": text,
    });
    if user.is_some() {
        body["user"] = json!(user);
    }
    match model_id {
        Some(model_id) => {
            body["model"] = json!(get_model_id_from_internal_embeddings_id(&model_id));
            match model_id.as_str() {
                "text-embedding-3-large-1536" => {
                    body["dimensions"] = json!(1536);
                }
                _ => (),
            }
        }
        None => (),
    }

    let mut req = reqwest::Client::new()
        .post(uri.to_string())
        .header("Content-Type", "application/json")
        // This one is for `openai`.
        .header("Authorization", format!("Bearer {}", api_key.clone()))
        // This one is for `azure_openai`.
        .header("api-key", api_key.clone());

    if let Some(organization_id) = organization_id {
        req = req.header("OpenAI-Organization", organization_id);
    }

    let req = req.json(&body);

    let res = match timeout(Duration::new(60, 0), req.send()).await {
        Ok(Ok(res)) => res,
        Ok(Err(e)) => Err(e)?,
        Err(_) => Err(anyhow!("Timeout sending request to OpenAI after 60s"))?,
    };

    let res_headers = res.headers();
    let request_id = match res_headers.get("x-request-id") {
        Some(request_id) => Some(request_id.to_str()?.to_string()),
        None => None,
    };

    let body = match timeout(Duration::new(60, 0), res.bytes()).await {
        Ok(Ok(body)) => body,
        Ok(Err(e)) => Err(e)?,
        Err(_) => Err(anyhow!("Timeout reading response from OpenAI after 60s"))?,
    };

    let mut b: Vec<u8> = vec![];
    body.reader().read_to_end(&mut b)?;
    let c: &[u8] = &b;

    let embeddings: Embeddings = match serde_json::from_slice(c) {
        Ok(c) => Ok(c),
        Err(_) => {
            let error: OpenAIError = serde_json::from_slice(c)?;
            match error.retryable() {
                true => Err(ModelError {
                    request_id,
                    message: error.message(),
                    retryable: Some(ModelErrorRetryOptions {
                        sleep: Duration::from_millis(500),
                        factor: 2,
                        retries: 3,
                    }),
                }),
                false => Err(ModelError {
                    request_id,
                    message: error.message(),
                    retryable: Some(ModelErrorRetryOptions {
                        sleep: Duration::from_millis(500),
                        factor: 1,
                        retries: 1,
                    }),
                }),
            }
        }
    }?;

    Ok(embeddings)
}

pub struct OpenAILLM {
    id: String,
    api_key: Option<String>,
}

impl OpenAILLM {
    pub fn new(id: String) -> Self {
        OpenAILLM { id, api_key: None }
    }

    fn uri(&self) -> Result<Uri> {
        Ok(format!("https://api.openai.com/v1/completions",).parse::<Uri>()?)
    }

    fn chat_uri(&self) -> Result<Uri> {
        Ok(format!("https://api.openai.com/v1/chat/completions",).parse::<Uri>()?)
    }

    fn tokenizer(&self) -> Arc<RwLock<CoreBPE>> {
        match self.id.as_str() {
            "code_davinci-002" | "code-cushman-001" => p50k_base_singleton(),
            "text-davinci-002" | "text-davinci-003" => p50k_base_singleton(),
            _ => {
                if self.id.starts_with("gpt-4o-") {
                    o200k_base_singleton()
                } else if self.id.starts_with("gpt-3.5-turbo") || self.id.starts_with("gpt-4") {
                    cl100k_base_singleton()
                } else {
                    r50k_base_singleton()
                }
            }
        }
    }

    pub fn openai_context_size(model_id: &str) -> usize {
        // Reference: https://platform.openai.com/docs/models

        // gpt-3.5-*
        if model_id.starts_with("gpt-3.5") {
            if model_id.starts_with("gpt-3.5-turbo-instruct") {
                return 4096;
            }
            if model_id == "gpt-3.5-turbo-0613" {
                return 4096;
            }
            return 16385;
        }

        // gpt-4*
        if model_id.starts_with("gpt-4") {
            if model_id.starts_with("gpt-4-32k") {
                return 32768;
            }
            if model_id == "gpt-4" || model_id == "gpt-4-0613" {
                return 8192;
            }
            return 128000;
        }

        // By default return 128000
        return 128000;
    }
}

pub fn to_openai_messages(
    messages: &Vec<ChatMessage>,
    model_id: &str,
) -> Result<Vec<OpenAIChatMessage>, anyhow::Error> {
    messages
        .iter()
        .filter_map(|m| match m {
            // [o1-preview] Hack for OpenAI `o1-*` models to exclude system messages.
            ChatMessage::System(_) if model_id.starts_with("o1-") => None,
            _ => Some(OpenAIChatMessage::try_from(m)),
        })
        .collect::<Result<Vec<_>>>()
}

#[async_trait]
impl LLM for OpenAILLM {
    fn id(&self) -> String {
        self.id.clone()
    }

    async fn initialize(&mut self, credentials: Credentials) -> Result<()> {
        match credentials.get("OPENAI_API_KEY") {
            Some(api_key) => {
                self.api_key = Some(api_key.clone());
            }
            None => match tokio::task::spawn_blocking(|| std::env::var("OPENAI_API_KEY")).await? {
                Ok(key) => {
                    self.api_key = Some(key);
                }
                Err(_) => Err(anyhow!(
                    "Credentials or environment variable `OPENAI_API_KEY` is not set."
                ))?,
            },
        }
        Ok(())
    }

    fn context_size(&self) -> usize {
        Self::openai_context_size(self.id.as_str())
    }

    async fn encode(&self, text: &str) -> Result<Vec<usize>> {
        encode_async(self.tokenizer(), text).await
    }

    async fn decode(&self, tokens: Vec<usize>) -> Result<String> {
        decode_async(self.tokenizer(), tokens).await
    }

    async fn tokenize(&self, texts: Vec<String>) -> Result<Vec<Vec<(usize, String)>>> {
        batch_tokenize_async(self.tokenizer(), texts).await
    }

    async fn generate(
        &self,
        prompt: &str,
        mut max_tokens: Option<i32>,
        temperature: f32,
        n: usize,
        stop: &Vec<String>,
        frequency_penalty: Option<f32>,
        presence_penalty: Option<f32>,
        top_p: Option<f32>,
        top_logprobs: Option<i32>,
        extras: Option<Value>,
        event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<LLMGeneration> {
        assert!(self.api_key.is_some());
        assert!(n > 0);

        // println!("STOP: {:?}", stop);

        if let Some(m) = max_tokens {
            if m == -1 {
                let tokens = self.encode(prompt).await?;
                max_tokens = Some((self.context_size() - tokens.len()) as i32);
                // println!("Using max_tokens = {}", max_tokens.unwrap());
            }
        }

        // [o1-preview] Hack for OpenAI `o1-*` models to not use streaming.
        let model_is_o1 = self.id.as_str().starts_with("o1-");
        let (c, request_id) = if !model_is_o1 && event_sender.is_some() {
            if n > 1 {
                return Err(anyhow!(
                    "Generating multiple variations in streaming mode is not supported."
                ))?;
            }
            streamed_completion(
                self.uri()?,
                self.api_key.clone().unwrap(),
                match &extras {
                    Some(ex) => match ex.get("openai_organization_id") {
                        Some(Value::String(o)) => Some(o.to_string().clone()),
                        _ => None,
                    },
                    None => None,
                },
                Some(self.id.clone()),
                prompt,
                max_tokens,
                temperature,
                n,
                match top_logprobs {
                    Some(l) => Some(l),
                    None => Some(0),
                },
                true,
                stop,
                match frequency_penalty {
                    Some(f) => f,
                    None => 0.0,
                },
                match presence_penalty {
                    Some(p) => p,
                    None => 0.0,
                },
                match top_p {
                    Some(t) => t,
                    None => 1.0,
                },
                match &extras {
                    Some(e) => match e.get("openai_user") {
                        Some(Value::String(u)) => Some(u.to_string()),
                        _ => None,
                    },
                    None => None,
                },
                event_sender,
            )
            .await?
        } else {
            completion(
                self.uri()?,
                self.api_key.clone().unwrap(),
                match &extras {
                    Some(e) => match e.get("openai_organization_id") {
                        Some(Value::String(o)) => Some(o.to_string()),
                        _ => None,
                    },
                    None => None,
                },
                Some(self.id.clone()),
                prompt,
                max_tokens,
                temperature,
                n,
                match top_logprobs {
                    Some(l) => Some(l),
                    None => Some(0),
                },
                true,
                stop,
                match frequency_penalty {
                    Some(f) => f,
                    None => 0.0,
                },
                match presence_penalty {
                    Some(p) => p,
                    None => 0.0,
                },
                match top_p {
                    Some(t) => t,
                    None => 1.0,
                },
                match &extras {
                    Some(e) => match e.get("openai_user") {
                        Some(Value::String(u)) => Some(u.to_string()),
                        _ => None,
                    },
                    None => None,
                },
            )
            .await?
        };

        // println!("COMPLETION: {:?}", c);

        assert!(c.choices.len() > 0);
        assert!(c.choices[0].logprobs.is_some());

        let logp = c.choices[0].logprobs.as_ref().unwrap();
        assert!(logp.tokens.len() == logp.token_logprobs.len());
        assert!(logp.tokens.len() == logp.text_offset.len());

        // UTF-8 length of the prompt (as used by the API for text_offset).
        let prompt_len = prompt.chars().count();

        let mut token_offset: usize = 0;

        let mut prompt_tokens = Tokens {
            text: String::from(prompt),
            tokens: Some(vec![]),
            logprobs: Some(vec![]),
            top_logprobs: match logp.top_logprobs {
                Some(_) => Some(vec![]),
                None => None,
            },
        };
        for (o, t, l) in izip!(
            logp.text_offset.clone(),
            logp.tokens.clone(),
            logp.token_logprobs.clone()
        ) {
            if o < prompt_len {
                prompt_tokens.tokens.as_mut().unwrap().push(t.clone());
                prompt_tokens.logprobs.as_mut().unwrap().push(l);
                token_offset += 1;
            }
        }
        if logp.top_logprobs.is_some() {
            for (o, t) in izip!(
                logp.text_offset.clone(),
                logp.top_logprobs.as_ref().unwrap().clone()
            ) {
                if o < prompt_len {
                    prompt_tokens.top_logprobs.as_mut().unwrap().push(t);
                }
            }
        }

        Ok(LLMGeneration {
            created: utils::now(),
            provider: ProviderID::OpenAI.to_string(),
            model: self.id.clone(),
            completions: c
                .choices
                .iter()
                .map(|c| {
                    let logp = c.logprobs.as_ref().unwrap();
                    assert!(logp.tokens.len() == logp.token_logprobs.len());
                    assert!(logp.tokens.len() == logp.text_offset.len());
                    assert!(
                        !logp.top_logprobs.is_some()
                            || logp.tokens.len() == logp.top_logprobs.as_ref().unwrap().len()
                    );
                    assert!(logp.tokens.len() >= token_offset);

                    Tokens {
                        text: c.text.chars().skip(prompt_len).collect::<String>(),
                        tokens: Some(logp.tokens[token_offset..].to_vec()),
                        logprobs: Some(logp.token_logprobs[token_offset..].to_vec()),
                        top_logprobs: match logp.top_logprobs {
                            Some(ref t) => Some(t[token_offset..].to_vec()),
                            None => None,
                        },
                    }
                })
                .collect::<Vec<_>>(),
            prompt: prompt_tokens,
            usage: c.usage.map(|usage| LLMTokenUsage {
                prompt_tokens: usage.prompt_tokens,
                completion_tokens: usage.completion_tokens.unwrap_or(0),
            }),
            provider_request_id: request_id,
        })
    }

    async fn chat(
        &self,
        messages: &Vec<ChatMessage>,
        functions: &Vec<ChatFunction>,
        function_call: Option<String>,
        temperature: f32,
        top_p: Option<f32>,
        n: usize,
        stop: &Vec<String>,
        mut max_tokens: Option<i32>,
        presence_penalty: Option<f32>,
        frequency_penalty: Option<f32>,
        extras: Option<Value>,
        event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<LLMChatGeneration> {
        if let Some(m) = max_tokens {
            if m == -1 {
                max_tokens = None;
            }
        }

        let (openai_org_id, openai_user, response_format) = match &extras {
            None => (None, None, None),
            Some(v) => (
                match v.get("openai_organization_id") {
                    Some(Value::String(o)) => Some(o.to_string()),
                    _ => None,
                },
                match v.get("openai_user") {
                    Some(Value::String(u)) => Some(u.to_string()),
                    _ => None,
                },
                match v.get("response_format") {
                    Some(Value::String(f)) => Some(f.to_string()),
                    _ => None,
                },
            ),
        };

        let tool_choice = match function_call.as_ref() {
            Some(fc) => Some(OpenAIToolChoice::from_str(fc)?),
            None => None,
        };

        let tools = functions
            .iter()
            .map(OpenAITool::try_from)
            .collect::<Result<Vec<OpenAITool>, _>>()?;

        let openai_messages = to_openai_messages(messages, &self.id)?;

        // [o1-preview] Hack for OpenAI `o1-*` models to simulate streaming.
        let is_streaming = event_sender.is_some();
        let model_is_o1 = self.id.as_str().starts_with("o1-");

        let (c, request_id) = if !model_is_o1 && is_streaming {
            streamed_chat_completion(
                self.chat_uri()?,
                self.api_key.clone().unwrap(),
                openai_org_id,
                Some(self.id.clone()),
                &openai_messages,
                tools,
                tool_choice,
                temperature,
                match top_p {
                    Some(t) => t,
                    None => 1.0,
                },
                n,
                stop,
                max_tokens,
                match presence_penalty {
                    Some(p) => p,
                    None => 0.0,
                },
                match frequency_penalty {
                    Some(f) => f,
                    None => 0.0,
                },
                response_format,
                openai_user,
                event_sender.clone(),
            )
            .await?
        } else {
            chat_completion(
                self.chat_uri()?,
                self.api_key.clone().unwrap(),
                openai_org_id,
                Some(self.id.clone()),
                &openai_messages,
                tools,
                tool_choice,
                temperature,
                match top_p {
                    Some(t) => t,
                    None => 1.0,
                },
                n,
                stop,
                max_tokens,
                match presence_penalty {
                    Some(p) => p,
                    None => 0.0,
                },
                match frequency_penalty {
                    Some(f) => f,
                    None => 0.0,
                },
                response_format,
                openai_user,
            )
            .await?
        };

        // [o1-preview] Hack for OpenAI `o1-*` models to simulate streaming.
        if model_is_o1 && is_streaming {
            let sender = event_sender.as_ref().unwrap();
            for choice in &c.choices {
                if let Some(content) = &choice.message.content {
                    // Split content into smaller chunks to simulate streaming.
                    for chunk in content
                        .chars()
                        .collect::<Vec<char>>()
                        .chunks(4)
                        .map(|c| c.iter().collect::<String>())
                    {
                        let _ = sender.send(json!({
                            "type": "tokens",
                            "content": {
                                "text": chunk,
                            },
                        }));
                        // Add a small delay to simulate real-time streaming.
                        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
                    }
                }
            }
        }

        assert!(c.choices.len() > 0);

        Ok(LLMChatGeneration {
            created: utils::now(),
            provider: ProviderID::OpenAI.to_string(),
            model: self.id.clone(),
            completions: c
                .choices
                .iter()
                .map(|c| AssistantChatMessage::try_from(&c.message))
                .collect::<Result<Vec<_>>>()?,
            usage: c.usage.map(|usage| LLMTokenUsage {
                prompt_tokens: usage.prompt_tokens,
                completion_tokens: usage.completion_tokens.unwrap_or(0),
            }),
            provider_request_id: request_id,
        })
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Embedding {
    pub embedding: Vec<f64>,
    pub index: u64,
    pub object: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Embeddings {
    pub model: String,
    pub usage: Usage,
    pub object: String,
    pub data: Vec<Embedding>,
}

pub struct OpenAIEmbedder {
    id: String,
    api_key: Option<String>,
}

impl OpenAIEmbedder {
    pub fn new(id: String) -> Self {
        OpenAIEmbedder { id, api_key: None }
    }

    fn uri(&self) -> Result<Uri> {
        Ok(format!("https://api.openai.com/v1/embeddings",).parse::<Uri>()?)
    }

    fn tokenizer(&self) -> Arc<RwLock<CoreBPE>> {
        match self.id.as_str() {
            "text-embedding-3-small" => cl100k_base_singleton(),
            "text-embedding-3-large-1536" => cl100k_base_singleton(),
            _ => r50k_base_singleton(),
        }
    }
}

#[async_trait]
impl Embedder for OpenAIEmbedder {
    fn id(&self) -> String {
        self.id.clone()
    }

    async fn initialize(&mut self, credentials: Credentials) -> Result<()> {
        if !(vec!["text-embedding-3-small", "text-embedding-3-large-1536"]
            .contains(&self.id.as_str()))
        {
            return Err(anyhow!(
                "Unexpected embedder model id (`{}`) for provider `openai`",
                self.id
            ));
        }

        // Give priority to `CORE_DATA_SOURCES_OPENAI_API_KEY` env variable
        match std::env::var("CORE_DATA_SOURCES_OPENAI_API_KEY") {
            Ok(key) => {
                self.api_key = Some(key);
            }
            Err(_) => match credentials.get("OPENAI_API_KEY") {
                Some(api_key) => {
                    self.api_key = Some(api_key.clone());
                }
                None => match std::env::var("OPENAI_API_KEY") {
                    Ok(key) => {
                        self.api_key = Some(key);
                    }
                    Err(_) => Err(anyhow!(
                        "Credentials or environment variable `OPENAI_API_KEY` is not set."
                    ))?,
                },
            },
        }
        Ok(())
    }

    fn context_size(&self) -> usize {
        match self.id.as_str() {
            "text-embedding-3-small" => 8191,
            "text-embedding-3-large-1536" => 8191,
            _ => unimplemented!(),
        }
    }

    fn embedding_size(&self) -> usize {
        match self.id.as_str() {
            "text-embedding-3-small" => 1536,
            "text-embedding-3-large-1536" => 1536,
            _ => unimplemented!(),
        }
    }

    async fn encode(&self, text: &str) -> Result<Vec<usize>> {
        encode_async(self.tokenizer(), text).await
    }

    async fn decode(&self, tokens: Vec<usize>) -> Result<String> {
        decode_async(self.tokenizer(), tokens).await
    }

    async fn tokenize(&self, texts: Vec<String>) -> Result<Vec<Vec<(usize, String)>>> {
        batch_tokenize_async(self.tokenizer(), texts).await
    }

    async fn embed(&self, text: Vec<&str>, extras: Option<Value>) -> Result<Vec<EmbedderVector>> {
        let e = embed(
            self.uri()?,
            self.api_key.clone().unwrap(),
            match &extras {
                Some(e) => match e.get("openai_organization_id") {
                    Some(Value::String(o)) => Some(o.to_string()),
                    _ => None,
                },
                None => None,
            },
            Some(self.id.clone()),
            text,
            match &extras {
                Some(e) => match e.get("openai_user") {
                    Some(Value::String(u)) => Some(u.to_string()),
                    _ => None,
                },
                None => None,
            },
        )
        .await?;

        assert!(e.data.len() > 0);
        // println!("EMBEDDING: {:?}", e);

        Ok(e.data
            .into_iter()
            .map(|v| EmbedderVector {
                created: utils::now(),
                provider: ProviderID::OpenAI.to_string(),
                model: self.id.clone(),
                vector: v.embedding.clone(),
            })
            .collect::<Vec<_>>())
    }
}

pub struct OpenAIProvider {}

impl OpenAIProvider {
    pub fn new() -> Self {
        OpenAIProvider {}
    }
}

#[async_trait]
impl Provider for OpenAIProvider {
    fn id(&self) -> ProviderID {
        ProviderID::OpenAI
    }

    fn setup(&self) -> Result<()> {
        utils::info("Setting up OpenAI:");
        utils::info("");
        utils::info(
            "To use OpenAI's models, you must set the environment variable `OPENAI_API_KEY`.",
        );
        utils::info("Your API key can be found at `https://platform.openai.com/account/api-keys`.");
        utils::info("");
        utils::info("Once ready you can check your setup with `dust provider test openai`");

        Ok(())
    }

    async fn test(&self) -> Result<()> {
        if !utils::confirm(
            "You are about to make a request for 1 token to `text-ada-001` on the OpenAI API.",
        )? {
            Err(anyhow!("User aborted OpenAI test."))?;
        }

        let mut llm = self.llm(String::from("text-ada-001"));
        llm.initialize(Credentials::new()).await?;

        let _ = llm
            .generate(
                "Hello 😊",
                Some(1),
                0.7,
                1,
                &vec![],
                None,
                None,
                None,
                None,
                None,
                None,
            )
            .await?;

        // let mut embedder = self.embedder(String::from("text-embedding-ada-002"));
        // embedder.initialize(Credentials::new()).await?;

        // let _v = embedder.embed("Hello 😊", None).await?;
        // println!("EMBEDDING SIZE: {}", v.vector.len());

        // llm = self.llm(String::from("gpt-3.5-turbo"));
        // llm.initialize(Credentials::new()).await?;

        // let messages = vec![
        //     // ChatMessage {
        //     //     role: String::from("system"),
        //     //     content: String::from(
        //     //         "You're a an assistant. Answer as concisely and precisely as possible.",
        //     //     ),
        //     // },
        //     ChatMessage {
        //         role: String::from("user"),
        //         content: String::from("How can I calculate the area of a circle?"),
        //     },
        // ];

        // let c = llm
        //     .chat(&messages, 0.7, None, 1, &vec![], None, None, None, None)
        //     .await?;
        // println!("CHAT COMPLETION SIZE: {:?}", c);

        utils::done("Test successfully completed! OpenAI is ready to use.");

        Ok(())
    }

    fn llm(&self, id: String) -> Box<dyn LLM + Sync + Send> {
        Box::new(OpenAILLM::new(id))
    }

    fn embedder(&self, id: String) -> Box<dyn Embedder + Sync + Send> {
        Box::new(OpenAIEmbedder::new(id))
    }
}
