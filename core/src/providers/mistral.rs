use crate::providers::chat_messages::{
    AssistantChatMessage, ChatMessage, ContentBlock, MixedContent,
};
use crate::providers::embedder::{Embedder, EmbedderVector};
use crate::providers::llm::{ChatFunction, ChatFunctionCall};
use crate::providers::llm::{
    ChatMessageRole, LLMChatGeneration, LLMGeneration, LLMTokenUsage, LLM,
};
use crate::providers::provider::{ModelError, ModelErrorRetryOptions, Provider, ProviderID};
use crate::providers::sentencepiece::sentencepiece::{
    batch_tokenize_async, decode_async, encode_async,
    mistral_instruct_tokenizer_240216_model_v2_base_singleton,
    mistral_instruct_tokenizer_240216_model_v3_base_singleton,
    mistral_tokenizer_model_v1_base_singleton,
};
use crate::run::Credentials;
use crate::utils::{self, now, ParseError};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use eventsource_client as es;
use eventsource_client::Client as ESClient;
use futures::TryStreamExt;
use hyper::StatusCode;
use hyper::{body::Buf, Uri};
use parking_lot::{Mutex, RwLock};
use sentencepiece::SentencePieceProcessor;
use serde::{Deserialize, Serialize};
use serde_json::json;
use serde_json::Value;
use std::io::prelude::*;
use std::str::FromStr;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc::UnboundedSender;
use tokio::time::timeout;

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
#[serde(rename_all = "lowercase")]
pub enum MistralChatMessageRole {
    Assistant,
    System,
    User,
    Tool,
}

impl FromStr for MistralChatMessageRole {
    type Err = ParseError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "system" => Ok(MistralChatMessageRole::System),
            "user" => Ok(MistralChatMessageRole::User),
            "assistant" => Ok(MistralChatMessageRole::Assistant),
            "tool" => Ok(MistralChatMessageRole::Tool),
            _ => Err(ParseError::with_message("Unknown MistralChatMessageRole"))?,
        }
    }
}

impl From<MistralChatMessageRole> for ChatMessageRole {
    fn from(value: MistralChatMessageRole) -> Self {
        match value {
            MistralChatMessageRole::Assistant => ChatMessageRole::Assistant,
            MistralChatMessageRole::System => ChatMessageRole::System,
            MistralChatMessageRole::User => ChatMessageRole::User,
            MistralChatMessageRole::Tool => ChatMessageRole::Function,
        }
    }
}

impl ToString for MistralChatMessageRole {
    fn to_string(&self) -> String {
        match self {
            MistralChatMessageRole::Assistant => String::from("assistant"),
            MistralChatMessageRole::System => String::from("system"),
            MistralChatMessageRole::User => String::from("user"),
            MistralChatMessageRole::Tool => String::from("tool"),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
struct MistralToolCallFunction {
    name: String,
    arguments: String,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
struct MistralToolCall {
    pub id: String,
    pub function: MistralToolCallFunction,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
struct MistralChatMessage {
    pub role: MistralChatMessageRole,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<MistralToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

fn sanitize_tool_call_id(id: &str) -> String {
    // Replace anything not a-zA-Z-0-9 with 0 as mistral enforces that but function_call_id can
    // come from other providers. Also enforces length 9.
    let mut s = id
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '0' })
        .collect::<String>();

    if s.len() > 9 {
        s = s[0..9].to_string();
    }
    if s.len() < 9 {
        s = format!("{:0>9}", s);
    }
    s
}

impl TryFrom<&ChatFunctionCall> for MistralToolCall {
    type Error = anyhow::Error;

    fn try_from(cf: &ChatFunctionCall) -> Result<Self, Self::Error> {
        Ok(MistralToolCall {
            id: sanitize_tool_call_id(&cf.id),
            function: MistralToolCallFunction {
                name: cf.name.clone(),
                arguments: cf.arguments.clone(),
            },
        })
    }
}

impl TryFrom<&MistralToolCall> for ChatFunctionCall {
    type Error = anyhow::Error;

    fn try_from(tc: &MistralToolCall) -> Result<Self, Self::Error> {
        Ok(ChatFunctionCall {
            id: tc.id.clone(),
            name: tc.function.name.clone(),
            arguments: tc.function.arguments.clone(),
        })
    }
}

impl TryFrom<&ChatMessage> for MistralChatMessage {
    type Error = anyhow::Error;

    fn try_from(cm: &ChatMessage) -> Result<Self, Self::Error> {
        match cm {
            ChatMessage::Assistant(assistant_msg) => Ok(MistralChatMessage {
                role: MistralChatMessageRole::Assistant,
                content: match assistant_msg.function_calls {
                    Some(_) => None,
                    None => assistant_msg.content.clone(),
                },
                tool_calls: assistant_msg
                    .function_calls
                    .as_ref()
                    .map(|fc| {
                        fc.iter()
                            .map(|f| MistralToolCall::try_from(f))
                            .collect::<Result<Vec<_>>>()
                    })
                    .transpose()?,
                tool_call_id: None,
            }),
            ChatMessage::Function(function_msg) => Ok(MistralChatMessage {
                role: MistralChatMessageRole::Tool,
                content: Some(function_msg.content.clone()),
                tool_calls: None,
                tool_call_id: Some(sanitize_tool_call_id(&function_msg.function_call_id)),
            }),
            ChatMessage::User(user_msg) => Ok(MistralChatMessage {
                role: MistralChatMessageRole::User,
                content: match &user_msg.content {
                    ContentBlock::Mixed(m) => {
                        let result = m.iter().enumerate().try_fold(
                            String::new(),
                            |mut acc, (i, content)| {
                                match content {
                                    MixedContent::ImageContent(_) => {
                                        Err(anyhow!("Vision is not supported for Mistral."))
                                    }
                                    MixedContent::TextContent(tc) => {
                                        acc.push_str(&tc.text);
                                        if i != m.len() - 1 {
                                            // Add newline if it's not the last item.
                                            acc.push('\n');
                                        }
                                        Ok(acc)
                                    }
                                }
                            },
                        );

                        match result {
                            Ok(text) if !text.is_empty() => Some(text),
                            Ok(_) => None, // Empty string.
                            Err(e) => return Err(e),
                        }
                    }
                    ContentBlock::Text(t) => Some(t.clone()),
                },
                tool_calls: None,
                tool_call_id: None,
            }),
            ChatMessage::System(system_msg) => Ok(MistralChatMessage {
                role: MistralChatMessageRole::System,
                content: Some(system_msg.content.clone()),
                tool_calls: None,
                tool_call_id: None,
            }),
        }
    }
}

impl TryFrom<&MistralChatMessage> for AssistantChatMessage {
    type Error = anyhow::Error;

    fn try_from(cm: &MistralChatMessage) -> Result<Self, Self::Error> {
        let role = ChatMessageRole::from(cm.role.clone());

        let (content, function_calls) = match cm.tool_calls.as_ref() {
            None => (cm.content.clone(), None),
            Some(tool_calls) => {
                let function_calls = tool_calls
                    .iter()
                    .map(|tc| ChatFunctionCall::try_from(tc))
                    .collect::<Result<Vec<ChatFunctionCall>, _>>()?;
                (None, Some(function_calls))
            }
        };

        let function_call = function_calls.as_ref().and_then(|fc| fc.first().cloned());

        Ok(AssistantChatMessage {
            content,
            role,
            name: None,
            function_call,
            function_calls,
        })
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct MistralChatChoice {
    pub finish_reason: Option<String>,
    pub index: usize,
    pub message: MistralChatMessage,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MistralUsage {
    pub completion_tokens: Option<u64>,
    pub prompt_tokens: u64,
    pub total_tokens: u64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct MistralChatCompletion {
    pub id: String,
    pub object: String,
    pub created: u64,
    pub model: String,
    pub choices: Vec<MistralChatChoice>,
    pub usage: Option<MistralUsage>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct MistralChatDelta {
    pub delta: Value,
    pub finish_reason: Option<String>,
    pub index: usize,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct MistralChatChunk {
    pub choices: Vec<MistralChatDelta>,
    pub created: Option<u64>,
    pub id: String,
    pub model: String,
    pub object: Option<String>,
    pub usage: Option<MistralUsage>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
#[serde(rename_all = "lowercase")]
pub enum MistralToolType {
    Function,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
#[serde(rename_all = "lowercase")]
pub enum MistralToolChoice {
    None,
    Auto,
    Any,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct MistralToolFunction {
    pub name: String,
    pub description: Option<String>,
    pub parameters: Option<Value>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct MistralTool {
    pub r#type: MistralToolType,
    pub function: MistralToolFunction,
}

// There are at least 3 format of errors coming from Mistral:
// ```
// {
//   "object":"error",
//   "message":{
//     "detail":[
//       {
//         "type":"enum",
//         "loc":["body","messages",3,"role"],
//         "msg":"Input should be 'system', 'user' or 'assistant'",
//         "input":"tool",
//         "ctx":{"expected":"'system', 'user' or 'assistant'"}
//       }
//     ]
//   },
//   "type":"invalid_request_error",
//   "param":null,
//   "code":null
// }
//
// {
//   "param":null,
//   "code":2201,
//   "type":"invalid_request_filter",
//   "message":"Request body is not a valid query",
//   "object":"error"
// }
//
// {
//   "object":"error",
//   "message":"Expected last role to be user but got assistant",
//   "type":"invalid_request_error",
//   "param":null,
//   "code":null
// }
// ```
// So we just take message as a Value and dump it for now. A bit ugly but easy.

#[derive(Serialize, Deserialize, Debug, Clone)]
struct MistralAPIError {
    #[serde(alias = "type")]
    pub _type: Option<String>,
    // pub code: Option<String>, (can be number or string)
    pub message: Value,
    pub object: Option<String>,
    pub param: Option<String>,
}

impl MistralAPIError {
    pub fn message(&self) -> String {
        self.message.to_string()
    }

    pub fn retryable(&self) -> bool {
        match self.object.as_ref() {
            Some(o) => match o.as_str() {
                "error" => match self._type {
                    Some(_) => self.message().contains("retry"),
                    None => false,
                },
                _ => false,
            },
            None => false,
        }
    }

    pub fn retryable_streamed(&self, status: StatusCode) -> bool {
        if status == StatusCode::TOO_MANY_REQUESTS {
            return true;
        }
        // We retry on 5xx errors (which means the streaming didn't start).
        return status.is_server_error();
    }
}

pub struct MistralAILLM {
    id: String,
    api_key: Option<String>,
}

impl MistralAILLM {
    pub fn new(id: String) -> Self {
        MistralAILLM { id, api_key: None }
    }

    fn chat_uri(&self) -> Result<Uri> {
        Ok(format!("https://api.mistral.ai/v1/chat/completions",).parse::<Uri>()?)
    }

    fn to_mistral_messages(
        &self,
        messages: &Vec<ChatMessage>,
    ) -> Result<Vec<MistralChatMessage>, anyhow::Error> {
        let mistral_messages = messages
            .iter()
            .map(|m| MistralChatMessage::try_from(m))
            .collect::<Result<Vec<_>>>()?;

        Ok(mistral_messages)
    }

    fn tokenizer(&self) -> Arc<RwLock<SentencePieceProcessor>> {
        if self.id.starts_with("mistral-tiny")
            || self.id.starts_with("open-mistral-7b")
            || self.id.starts_with("open-mixtral-8x7b")
        {
            return mistral_tokenizer_model_v1_base_singleton();
        }

        if self.id.starts_with("open-mixtral-8x22b") {
            return mistral_instruct_tokenizer_240216_model_v3_base_singleton();
        }

        // default to v2 tokenizer (mistral-small, mistral-medium, mistral-large)
        return mistral_instruct_tokenizer_240216_model_v2_base_singleton();
    }

    async fn streamed_chat_completion(
        &self,
        uri: Uri,
        api_key: String,
        model_id: Option<String>,
        messages: &Vec<MistralChatMessage>,
        temperature: f32,
        top_p: f32,
        max_tokens: Option<i32>,
        tools: Vec<MistralTool>,
        tool_choice: Option<MistralToolChoice>,
        event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<(MistralChatCompletion, Option<String>)> {
        let url = uri.to_string();

        let mut builder = match es::ClientBuilder::for_url(url.as_str()) {
            Ok(b) => b,
            Err(_) => return Err(anyhow!("Error creating streamed client to Mistral AI")),
        };
        builder = match builder.method(String::from("POST")).header(
            "Authorization",
            format!("Bearer {}", api_key.clone()).as_str(),
        ) {
            Ok(b) => b,
            Err(_) => return Err(anyhow!("Error creating streamed client to Mistral AI")),
        };
        builder = match builder.header("Content-Type", "application/json") {
            Ok(b) => b,
            Err(_) => return Err(anyhow!("Error creating streamed client to Mistral AI")),
        };

        let mut body = json!({
            "messages": messages,
            "temperature": temperature,
            "top_p": top_p,
            "max_tokens": max_tokens,
            "stream": true,
        });

        if model_id.is_some() {
            body["model"] = json!(model_id);
        }

        if tool_choice.is_some() && tools.len() > 0 {
            body["tool_choice"] = json!(tool_choice);
            body["tools"] = json!(tools);
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

        let chunks: Arc<Mutex<Vec<MistralChatChunk>>> = Arc::new(Mutex::new(Vec::new()));
        let mut usage = None;
        let mut request_id: Option<String> = None;

        'stream: loop {
            match stream.try_next().await {
                Ok(e) => match e {
                    Some(es::SSE::Connected((_, headers))) => {
                        request_id = match headers.get("x-kong-request-id") {
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

                            let chunk: MistralChatChunk =
                                match serde_json::from_str(e.data.as_str()) {
                                    Ok(c) => c,
                                    Err(err) => {
                                        let error: Result<MistralAPIError, _> =
                                            serde_json::from_str(e.data.as_str());
                                        match error {
                                            Ok(error) => {
                                                match error.retryable_streamed(StatusCode::OK)
                                                    && index == 0
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
                                                    "MistralAIError: failed parsing streamed \
                                                     completion from Mistral AI err={} data={}",
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
                                        // We ignore the role for generating events. If we get
                                        // `content` in the delta object we stream "tokens".
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
                                            tool_calls.iter().for_each(|tool_call| match tool_call
                                                .get("function")
                                            {
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
                                            });
                                        }
                                    }
                                }
                                None => (),
                            };
                            chunks.lock().push(chunk);
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
                            let request_id = match headers.get("x-kong-request-id") {
                                Some(v) => Some(v.to_string()),
                                None => None,
                            };
                            let b = r.body_bytes().await?;

                            let error: Result<MistralAPIError, _> = serde_json::from_slice(&b);
                            match error {
                                Ok(error) => match error.retryable_streamed(status) {
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
                                }?,
                                Err(_) => Err(anyhow!(
                                    "Error streaming tokens from Mistral AI: status={} data={}",
                                    status,
                                    String::from_utf8_lossy(&b)
                                ))?,
                            }
                        }
                        _ => {
                            Err(anyhow!("Error streaming tokens from Mistral AI: {:?}", e))?;
                        }
                    }
                    break 'stream;
                }
            }
        }

        let mut completion = {
            let guard = chunks.lock();
            let f = match guard.len() {
                0 => Err(anyhow!("No chunks received from Mistral AI")),
                _ => Ok(guard[0].clone()),
            }?;
            let mut c = MistralChatCompletion {
                choices: f
                    .choices
                    .iter()
                    .map(|c| MistralChatChoice {
                        message: MistralChatMessage {
                            content: Some("".to_string()),
                            role: MistralChatMessageRole::Assistant,
                            tool_calls: None,
                            tool_call_id: None,
                        },
                        index: c.index,
                        finish_reason: None,
                    })
                    .collect::<Vec<_>>(),
                // The `created` timestamp is absent in the initial stream chunk (in ms),
                // defaulting to the current time (in seconds).
                created: f.created.map(|s| s * 1000).unwrap_or_else(now),
                id: f.id.clone(),
                model: f.model,
                // The `object` field defaults to "start" when not present in the initial stream
                // chunk.
                object: f.object.unwrap_or(String::from("start")),
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
                                c.choices[j].message.role = MistralChatMessageRole::from_str(r)?;
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

                    match a.choices[j].delta.get("tool_calls") {
                        None => (),
                        Some(tc) => {
                            c.choices[j].message.tool_calls =
                                serde_json::from_value(tc.clone()).unwrap();
                            c.choices[j].message.content = None; // Ensure content is None when tool_calls are present
                        }
                    };
                }
            }
            c
        };

        // For all messages, edit the content and strip leading and trailing spaces and \n.
        for m in completion.choices.iter_mut() {
            m.message.content = match m.message.content.as_ref() {
                None => None,
                Some(c) => Some(c.trim().to_string()),
            };
        }

        Ok((completion, request_id))
    }

    async fn chat_completion(
        &self,
        uri: Uri,
        api_key: String,
        model_id: Option<String>,
        messages: &Vec<MistralChatMessage>,
        temperature: f32,
        top_p: f32,
        max_tokens: Option<i32>,
        tools: Vec<MistralTool>,
        tool_choice: Option<MistralToolChoice>,
    ) -> Result<(MistralChatCompletion, Option<String>)> {
        let mut body = json!({
            "messages": messages,
            "temperature": temperature,
            "top_p": top_p,
            "max_tokens": max_tokens,
            "stream": false
        });

        if model_id.is_some() {
            body["model"] = json!(model_id);
        }

        if tool_choice.is_some() && tools.len() > 0 {
            body["tool_choice"] = json!(tool_choice);
            body["tools"] = json!(tools);
        }

        let req = reqwest::Client::new()
            .post(uri.to_string())
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", api_key.clone()))
            .json(&body);

        let res = match timeout(Duration::new(180, 0), req.send()).await {
            Ok(Ok(res)) => res,
            Ok(Err(e)) => Err(e)?,
            Err(_) => Err(anyhow!("Timeout sending request to Mistral AI after 180s"))?,
        };

        let res_headers = res.headers();
        let request_id = match res_headers.get("x-kong-request-id") {
            Some(v) => Some(v.to_str()?.to_string()),
            None => None,
        };

        let body = match timeout(Duration::new(180, 0), res.bytes()).await {
            Ok(Ok(body)) => body,
            Ok(Err(e)) => Err(e)?,
            Err(_) => Err(anyhow!(
                "Timeout reading response from Mistral AI after 180s"
            ))?,
        };

        let mut b: Vec<u8> = vec![];
        body.reader().read_to_end(&mut b)?;

        let mut completion: MistralChatCompletion = match serde_json::from_slice(&b) {
            Ok(c) => c,
            Err(err) => {
                let error: Result<MistralAPIError, _> = serde_json::from_slice(&b);
                match error {
                    Ok(error) => match error.retryable() {
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
                    }?,
                    Err(_) => Err(anyhow!(
                        "MistralAIError: failed parsing completion from Mistral AI err={} data={}",
                        err,
                        String::from_utf8_lossy(&b),
                    ))?,
                };
                unreachable!()
            }
        };

        // For all messages, edit the content and strip leading and trailing spaces and \n.
        for m in completion.choices.iter_mut() {
            m.message.content = match m.message.content.as_ref() {
                None => None,
                Some(c) => Some(c.trim().to_string()),
            };
        }

        Ok((completion, request_id))
    }
}

#[async_trait]
impl LLM for MistralAILLM {
    fn id(&self) -> String {
        self.id.clone()
    }
    async fn initialize(&mut self, credentials: Credentials) -> Result<()> {
        match credentials.get("MISTRAL_API_KEY") {
            Some(api_key) => {
                self.api_key = Some(api_key.clone());
            }
            None => match tokio::task::spawn_blocking(|| std::env::var("MISTRAL_API_KEY")).await? {
                Ok(key) => {
                    self.api_key = Some(key);
                }
                Err(_) => Err(anyhow!(
                    "Credentials or environment variable `MISTRAL_API_KEY` is not set."
                ))?,
            },
        }

        Ok(())
    }

    fn context_size(&self) -> usize {
        return 32768;
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

    async fn chat(
        &self,
        messages: &Vec<ChatMessage>,
        functions: &Vec<ChatFunction>,
        function_call: Option<String>,
        temperature: f32,
        top_p: Option<f32>,
        _n: usize,
        stop: &Vec<String>,
        max_tokens: Option<i32>,
        presence_penalty: Option<f32>,
        frequency_penalty: Option<f32>,
        _extras: Option<Value>,
        event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<LLMChatGeneration> {
        if stop.len() > 0 {
            return Err(anyhow!("Mistral AI does not support stop sequence."));
        }

        if presence_penalty.is_some() || frequency_penalty.is_some() {
            return Err(anyhow!("Mistral AI does not support penalties."));
        }

        // If max_tokens is not set or is -1, compute the max tokens based on the first message.
        let computed_max_tokens = match max_tokens.unwrap_or(-1) {
            -1 => None,
            _ => max_tokens,
        };

        let mistral_messages = self.to_mistral_messages(messages)?;

        // Function calls / Tools logic.
        let (tool_choice, tools) = match function_call {
            Some(fc) => {
                let choice = match fc.as_str() {
                    "auto" => MistralToolChoice::Auto,
                    "none" => MistralToolChoice::None,
                    "any" => MistralToolChoice::Any,
                    // This string is validated in the block to match at least one function.
                    // Mistral semantic of `any` is to force the model to make a function call (but
                    // can be any of the functions passed). The two semantics only match if there
                    // is one function.
                    _ if functions.len() == 1 => MistralToolChoice::Any,
                    _ => Err(anyhow!(
                        "Mistral only supports specified function when there \
                            is exactly one function possible."
                    ))?,
                };

                (
                    Some(choice),
                    functions
                        .iter()
                        .map(|f| MistralTool {
                            r#type: MistralToolType::Function,
                            function: MistralToolFunction {
                                name: f.name.clone(),
                                description: f.description.clone(),
                                parameters: f.parameters.clone(),
                            },
                        })
                        .collect(),
                )
            }
            None => (None, vec![]),
        };

        let (c, request_id) = match event_sender {
            Some(_) => {
                self.streamed_chat_completion(
                    self.chat_uri()?,
                    self.api_key.clone().unwrap(),
                    Some(self.id.clone()),
                    &mistral_messages,
                    temperature,
                    match top_p {
                        Some(t) => t,
                        None => 1.0,
                    },
                    computed_max_tokens,
                    tools,
                    tool_choice,
                    event_sender,
                )
                .await?
            }
            None => {
                self.chat_completion(
                    self.chat_uri()?,
                    self.api_key.clone().unwrap(),
                    Some(self.id.clone()),
                    &mistral_messages,
                    temperature,
                    match top_p {
                        Some(t) => t,
                        None => 1.0,
                    },
                    computed_max_tokens,
                    tools,
                    tool_choice,
                )
                .await?
            }
        };

        assert!(c.choices.len() > 0);

        Ok(LLMChatGeneration {
            created: utils::now(),
            provider: ProviderID::Mistral.to_string(),
            model: self.id.clone(),
            completions: c
                .choices
                .iter()
                .map(|c| AssistantChatMessage::try_from(&c.message))
                .collect::<Result<Vec<_>>>()?,
            usage: c.usage.map(|u| LLMTokenUsage {
                completion_tokens: u.completion_tokens.unwrap_or(0),
                prompt_tokens: u.prompt_tokens,
            }),
            provider_request_id: request_id,
        })
    }

    async fn generate(
        &self,
        _prompt: &str,
        _max_tokens: Option<i32>,
        _temperature: f32,
        _n: usize,
        _stop: &Vec<String>,
        _frequency_penalty: Option<f32>,
        _presence_penalty: Option<f32>,
        _top_p: Option<f32>,
        _top_logprobs: Option<i32>,
        _extras: Option<Value>,
        _event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<LLMGeneration> {
        unimplemented!();
    }
}
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MistralEmbedding {
    pub embedding: Vec<f64>,
    pub index: u64,
    pub object: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MistralEmbeddings {
    pub model: String,
    pub usage: MistralUsage,
    pub object: String,
    pub data: Vec<MistralEmbedding>,
}

pub struct MistralEmbedder {
    id: String,
    api_key: Option<String>,
}

impl MistralEmbedder {
    pub fn new(id: String) -> Self {
        MistralEmbedder { id, api_key: None }
    }

    fn uri(&self) -> Result<Uri> {
        Ok(format!("https://api.mistral.ai/v1/embeddings",).parse::<Uri>()?)
    }

    fn tokenizer(&self) -> Arc<RwLock<SentencePieceProcessor>> {
        // Tokenizer for the `mistral-embed` model.
        return mistral_tokenizer_model_v1_base_singleton();
    }
}

#[async_trait]
impl Embedder for MistralEmbedder {
    fn id(&self) -> String {
        self.id.clone()
    }

    async fn initialize(&mut self, credentials: Credentials) -> Result<()> {
        if !(vec!["mistral-embed"].contains(&self.id.as_str())) {
            return Err(anyhow!(
                "Unexpected embedder model id (`{}`) for provider `mistral`",
                self.id
            ));
        }

        match std::env::var("CORE_DATA_SOURCES_MISTRAL_API_KEY") {
            Ok(key) => {
                self.api_key = Some(key);
            }
            Err(_) => match credentials.get("MISTRAL_API_KEY") {
                Some(api_key) => {
                    self.api_key = Some(api_key.clone());
                }
                None => match std::env::var("MISTRAL_API_KEY") {
                    Ok(key) => {
                        self.api_key = Some(key);
                    }
                    Err(_) => Err(anyhow!(
                        "Credentials or environment variable `MISTRAL_API_KEY` is not set."
                    ))?,
                },
            },
        }
        Ok(())
    }

    fn context_size(&self) -> usize {
        match self.id.as_str() {
            "mistral-embed" => 8000,
            _ => unimplemented!(),
        }
    }

    fn embedding_size(&self) -> usize {
        match self.id.as_str() {
            "mistral-embed" => 1024,
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

    async fn embed(&self, text: Vec<&str>, _extras: Option<Value>) -> Result<Vec<EmbedderVector>> {
        let body = json!({
            "input": text,
            "encoding_format": "float",
            "model": self.id,
        });

        let req = reqwest::Client::new()
            .post(self.uri()?.to_string())
            .header("Content-Type", "application/json")
            .header(
                "Authorization",
                format!("Bearer {}", self.api_key.clone().unwrap()),
            );

        let req = req.json(&body);

        let res = match timeout(Duration::new(60, 0), req.send()).await {
            Ok(Ok(res)) => res,
            Ok(Err(e)) => Err(e)?,
            Err(_) => Err(anyhow!("Timeout sending request to Mistral after 60s"))?,
        };

        let res_headers = res.headers();
        let request_id = match res_headers.get("x-kong-request-id") {
            Some(v) => Some(v.to_str()?.to_string()),
            None => None,
        };

        let body = match timeout(Duration::new(60, 0), res.bytes()).await {
            Ok(Ok(body)) => body,
            Ok(Err(e)) => Err(e)?,
            Err(_) => Err(anyhow!("Timeout reading response from Mistral after 60s"))?,
        };

        let mut b: Vec<u8> = vec![];
        body.reader().read_to_end(&mut b)?;
        let c: &[u8] = &b;

        let embeddings: MistralEmbeddings = match serde_json::from_slice(c) {
            Ok(c) => c,
            Err(err) => {
                let error: Result<MistralAPIError, _> = serde_json::from_slice(c);
                match error {
                    Ok(error) => match error.retryable() {
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
                    }?,
                    Err(_) => Err(anyhow!(
                        "MistralAIError: failed parsing embeddings from Mistral AI err={} data={}",
                        err,
                        String::from_utf8_lossy(c),
                    ))?,
                };
                unreachable!()
            }
        };

        assert!(embeddings.data.len() > 0);

        Ok(embeddings
            .data
            .into_iter()
            .map(|v| EmbedderVector {
                created: utils::now(),
                provider: ProviderID::Mistral.to_string(),
                model: self.id.clone(),
                vector: v.embedding.clone(),
            })
            .collect::<Vec<_>>())
    }
}

pub struct MistralProvider {}

impl MistralProvider {
    pub fn new() -> Self {
        MistralProvider {}
    }
}

#[async_trait]
impl Provider for MistralProvider {
    fn id(&self) -> ProviderID {
        ProviderID::OpenAI
    }

    fn setup(&self) -> Result<()> {
        utils::info("Setting up Mistral AI:");
        utils::info("");
        utils::info(
            "To use Mistral AI's models, you must set the environment variable `MISTRAL_API_KEY`.",
        );
        utils::info("Your API key can be found at `https://console.mistral.ai/api-keys/`.");
        utils::info("");
        utils::info("Once ready you can check your setup with `dust provider test mistral_ai`");

        Ok(())
    }

    async fn test(&self) -> Result<()> {
        if !utils::confirm(
            "You are about to make a request for 1 token to `mistral-tiny` on the Mistral AI API.",
        )? {
            Err(anyhow!("User aborted Mistral AI test."))?;
        }

        let mut llm = self.llm(String::from("mistral-tiny"));
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

        // TODO(flav): Test embedder.

        utils::done("Test successfully completed! MistralAI is ready to use.");

        Ok(())
    }

    fn llm(&self, id: String) -> Box<dyn LLM + Sync + Send> {
        Box::new(MistralAILLM::new(id))
    }

    fn embedder(&self, id: String) -> Box<dyn Embedder + Sync + Send> {
        Box::new(MistralEmbedder::new(id))
    }
}
