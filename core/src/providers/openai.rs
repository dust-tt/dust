use crate::providers::embedder::{Embedder, EmbedderVector};
use crate::providers::llm::Tokens;
use crate::providers::llm::{ChatMessage, ChatMessageRole, LLMChatGeneration, LLMGeneration, LLM};
use crate::providers::provider::{ModelError, ModelErrorRetryOptions, Provider, ProviderID};
use crate::providers::tiktoken::tiktoken::{
    cl100k_base_singleton, p50k_base_singleton, r50k_base_singleton, CoreBPE,
};
use crate::run::Credentials;
use crate::utils;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use eventsource_client as es;
use eventsource_client::Client as ESClient;
use futures::TryStreamExt;
use hyper::{body::Buf, Body, Client, Method, Request, Uri};
use hyper_tls::HttpsConnector;
use itertools::izip;
use parking_lot::Mutex;
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

use super::llm::{ChatFunction, ChatFunctionCall};
use super::tiktoken::tiktoken::{decode_async, encode_async, tokenize_async};

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
    // Usage is not returned by the Completion endpoint when streamed.
    // pub usage: Usage,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ChatChoice {
    pub message: ChatMessage,
    pub index: usize,
    pub finish_reason: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ChatCompletion {
    pub id: String,
    pub object: String,
    pub created: u64,
    pub choices: Vec<ChatChoice>,
    // Usage is not returned by the Chat/Completion endpoint when streamed.
    // pub usage: Usage,
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
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct InnerError {
    pub message: String,
    #[serde(alias = "type")]
    pub _type: String,
    pub param: Option<String>,
    pub code: Option<usize>,
    pub internal_message: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Error {
    pub error: InnerError,
}

impl Error {
    pub fn message(&self) -> String {
        match self.error.internal_message {
            Some(ref msg) => format!(
                "OpenAIAPIError: [{}] {} internal_message={}",
                self.error._type, self.error.message, msg,
            ),
            None => format!(
                "OpenAIAPIError: [{}] {}",
                self.error._type, self.error.message,
            ),
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

    pub fn retryable_streamed(&self) -> bool {
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
) -> Result<Completion> {
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
        "max_tokens": max_tokens,
        "temperature": temperature,
        "n": n,
        "logprobs": logprobs,
        "echo": echo,
        "stop": match stop.len() {
            0 => None,
            _ => Some(stop),
        },
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

    'stream: loop {
        match stream.try_next().await {
            Ok(e) => match e {
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
                                let error: Result<Error, _> = serde_json::from_str(e.data.as_str());
                                match error {
                                    Ok(error) => {
                                        match error.retryable_streamed() && index == 0 {
                                            true => Err(ModelError {
                                                message: error.message(),
                                                retryable: Some(ModelErrorRetryOptions {
                                                    sleep: Duration::from_millis(100),
                                                    factor: 2,
                                                    retries: 3,
                                                }),
                                            })?,
                                            false => Err(ModelError {
                                                message: error.message(),
                                                retryable: None,
                                            })?,
                                        }
                                        break 'stream;
                                    }
                                    Err(_) => {
                                        Err(anyhow!(
                                            "OpenAIAPIError: failed parsing streamed \
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
                    println!("UNEXPECED NONE");
                    break 'stream;
                }
            },
            Err(e) => {
                Err(anyhow!("Error streaming tokens from OpenAI: {:?}", e))?;
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

    Ok(completion)
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
) -> Result<Completion> {
    let https = HttpsConnector::new();
    let cli = Client::builder().build::<_, hyper::Body>(https);

    let mut body = json!({
        "prompt": prompt,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "n": n,
        "logprobs": logprobs,
        "stop": match stop.len() {
            0 => None,
            _ => Some(stop),
        },
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

    // println!("BODY: {}", body.to_string());

    let mut req_builder = Request::builder()
        .method(Method::POST)
        .uri(uri)
        .header("Content-Type", "application/json")
        // This one is for `openai`.
        .header("Authorization", format!("Bearer {}", api_key.clone()))
        // This one is for `azure_openai`.
        .header("api-key", api_key.clone());

    if let Some(organization_id) = organization_id {
        req_builder = req_builder.header("OpenAI-Organization", organization_id);
    }

    let req = req_builder.body(Body::from(body.to_string()))?;

    let res = match timeout(Duration::new(180, 0), cli.request(req)).await {
        Ok(Ok(res)) => res,
        Ok(Err(e)) => Err(e)?,
        Err(_) => Err(anyhow!("Timeout sending request to OpenAI after 180s"))?,
    };
    let body = match timeout(Duration::new(180, 0), hyper::body::aggregate(res)).await {
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
            let error: Error = serde_json::from_slice(c)?;
            match error.retryable() {
                true => Err(ModelError {
                    message: error.message(),
                    retryable: Some(ModelErrorRetryOptions {
                        sleep: Duration::from_millis(2000),
                        factor: 2,
                        retries: 8,
                    }),
                }),
                false => Err(ModelError {
                    message: error.message(),
                    retryable: None,
                }),
            }
        }
    }?;

    Ok(completion)
}

pub async fn streamed_chat_completion(
    uri: Uri,
    api_key: String,
    organization_id: Option<String>,
    model_id: Option<String>,
    messages: &Vec<ChatMessage>,
    functions: &Vec<ChatFunction>,
    function_call: Option<String>,
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
) -> Result<ChatCompletion> {
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

    // Re-adapt to OpenAI string || object format.
    let function_call: Option<Value> = match function_call {
        None => None,
        Some(s) => match s.as_str() {
            "none" => Some(Value::String(s)),
            "auto" => Some(Value::String(s)),
            _ => Some(json!({
                "name": s,
            })),
        },
    };

    let mut body = json!({
        "messages": messages,
        "temperature": temperature,
        "top_p": top_p,
        "n": n,
        "stop": match stop.len() {
            0 => None,
            _ => Some(stop),
        },
        "max_tokens": max_tokens,
        "presence_penalty": presence_penalty,
        "frequency_penalty": frequency_penalty,
        "stream": true,
    });
    if user.is_some() {
        body["user"] = json!(user);
    }
    if model_id.is_some() {
        body["model"] = json!(model_id);
    }
    if functions.len() > 0 {
        body["functions"] = json!(functions);
    }
    if function_call.is_some() {
        body["function_call"] = function_call.unwrap();
    }
    if response_format.is_some() {
        body["response_format"] = json!({
            "type": response_format.unwrap(),
        });
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

    let chunks: Arc<Mutex<Vec<ChatChunk>>> = Arc::new(Mutex::new(Vec::new()));

    'stream: loop {
        match stream.try_next().await {
            Ok(e) => match e {
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
                                let error: Result<Error, _> = serde_json::from_str(e.data.as_str());
                                match error {
                                    Ok(error) => {
                                        match error.retryable_streamed() && index == 0 {
                                            true => Err(ModelError {
                                                message: error.message(),
                                                retryable: Some(ModelErrorRetryOptions {
                                                    sleep: Duration::from_millis(100),
                                                    factor: 2,
                                                    retries: 3,
                                                }),
                                            })?,
                                            false => Err(ModelError {
                                                message: error.message(),
                                                retryable: None,
                                            })?,
                                        }
                                        break 'stream;
                                    }
                                    Err(_) => {
                                        Err(anyhow!(
                                            "OpenAIAPIError: failed parsing streamed \
                                                 completion from OpenAI err={} data={}",
                                            err,
                                            e.data.as_str(),
                                        ))?;
                                        break 'stream;
                                    }
                                }
                            }
                        };

                        // println!("CHUNK: {:?}", chunk);

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

                                    // If we a `function_call.name` in the delta object we stream a
                                    // "function_call" event.
                                    match chunk.choices[0].delta.get("function_call") {
                                        None => (),
                                        Some(function_call) => match function_call.get("name") {
                                            None => (),
                                            Some(name) => match name.as_str() {
                                                None => (),
                                                Some(n) => {
                                                    let _ = sender.send(json!({
                                                        "type": "function_call",
                                                        "content": {
                                                            "name": n,
                                                        },
                                                    }));
                                                }
                                            },
                                        },
                                    };

                                    // If we a `function_call.arguments` in the delta object we stream
                                    // a "function_call_arguments_tokens" event.
                                    match chunk.choices[0].delta.get("function_call") {
                                        None => (),
                                        Some(function_call) => {
                                            match function_call.get("arguments") {
                                                None => (),
                                                Some(name) => match name.as_str() {
                                                    None => (),
                                                    Some(n) => {
                                                        let _ = sender.send(json!({
                                                            "type": "function_call_arguments_tokens",
                                                            "content": {
                                                                "text": n,
                                                            },
                                                        }));
                                                    }
                                                },
                                            }
                                        }
                                    }
                                }
                            }
                            None => (),
                        };
                        chunks.lock().push(chunk);
                    }
                },
                None => {
                    println!("UNEXPECED NONE");
                    break 'stream;
                }
            },
            Err(e) => {
                Err(anyhow!("Error streaming tokens from OpenAI: {:?}", e))?;
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
        let mut c = ChatCompletion {
            id: f.id.clone(),
            object: f.object.clone(),
            created: f.created,
            choices: f
                .choices
                .iter()
                .map(|c| ChatChoice {
                    message: ChatMessage {
                        role: ChatMessageRole::System,
                        name: None,
                        content: Some("".to_string()),
                        function_call: None,
                    },
                    index: c.index,
                    finish_reason: None,
                })
                .collect::<Vec<_>>(),
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
                            c.choices[j].message.role = ChatMessageRole::from_str(r)?;
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

                match a.choices[j].delta.get("function_call") {
                    None => (),
                    Some(function_call) => {
                        match function_call.get("name") {
                            Some(Value::String(s)) => {
                                if !c.choices[j].message.function_call.is_some() {
                                    c.choices[j].message.function_call = Some(ChatFunctionCall {
                                        name: s.clone(),
                                        arguments: String::new(),
                                    });
                                }
                            }
                            _ => (),
                        };
                        match function_call.get("arguments") {
                            Some(Value::String(s)) => {
                                if c.choices[j].message.function_call.is_some() {
                                    c.choices[j]
                                        .message
                                        .function_call
                                        .as_mut()
                                        .unwrap()
                                        .arguments = format!(
                                        "{}{}",
                                        c.choices[j]
                                            .message
                                            .function_call
                                            .as_mut()
                                            .unwrap()
                                            .arguments,
                                        s
                                    );
                                }
                            }
                            _ => (),
                        };
                    }
                };
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

    Ok(completion)
}

pub async fn chat_completion(
    uri: Uri,
    api_key: String,
    organization_id: Option<String>,
    model_id: Option<String>,
    messages: &Vec<ChatMessage>,
    functions: &Vec<ChatFunction>,
    function_call: Option<String>,
    temperature: f32,
    top_p: f32,
    n: usize,
    stop: &Vec<String>,
    max_tokens: Option<i32>,
    presence_penalty: f32,
    frequency_penalty: f32,
    response_format: Option<String>,
    user: Option<String>,
) -> Result<ChatCompletion> {
    let https = HttpsConnector::new();
    let cli = Client::builder().build::<_, hyper::Body>(https);

    // Re-adapt to OpenAI string || object format.
    let function_call: Option<Value> = match function_call {
        None => None,
        Some(s) => match s.as_str() {
            "none" => Some(Value::String(s)),
            "auto" => Some(Value::String(s)),
            _ => Some(json!({
                "name": s,
            })),
        },
    };

    let mut body = json!({
        "messages": messages,
        "temperature": temperature,
        "top_p": top_p,
        "n": n,
        "stop": match stop.len() {
            0 => None,
            _ => Some(stop),
        },
        "max_tokens": max_tokens,
        "presence_penalty": presence_penalty,
        "frequency_penalty": frequency_penalty,
    });
    if user.is_some() {
        body["user"] = json!(user);
    }
    if model_id.is_some() {
        body["model"] = json!(model_id);
    }
    if response_format.is_some() {
        body["response_format"] = json!({
            "type": response_format.unwrap(),
        });
    }
    if functions.len() > 0 {
        body["functions"] = json!(functions);
    }
    if function_call.is_some() {
        body["function_call"] = function_call.unwrap();
    }

    let mut req_builder = Request::builder()
        .method(Method::POST)
        .uri(uri)
        .header("Content-Type", "application/json")
        // This one is for `openai`.
        .header("Authorization", format!("Bearer {}", api_key.clone()))
        // This one is for `azure_openai`.
        .header("api-key", api_key.clone());

    if let Some(organization_id) = organization_id {
        req_builder = req_builder.header(
            "OpenAI-Organization",
            &format!("{}", organization_id.clone()),
        );
    }

    let req = req_builder.body(Body::from(body.to_string()))?;

    let res = match timeout(Duration::new(180, 0), cli.request(req)).await {
        Ok(Ok(res)) => res,
        Ok(Err(e)) => Err(e)?,
        Err(_) => Err(anyhow!("Timeout sending request to OpenAI after 180s"))?,
    };
    let body = match timeout(Duration::new(180, 0), hyper::body::aggregate(res)).await {
        Ok(Ok(body)) => body,
        Ok(Err(e)) => Err(e)?,
        Err(_) => Err(anyhow!("Timeout reading response from OpenAI after 180s"))?,
    };

    let mut b: Vec<u8> = vec![];
    body.reader().read_to_end(&mut b)?;
    let c: &[u8] = &b;

    let mut completion: ChatCompletion = match serde_json::from_slice(c) {
        Ok(c) => Ok(c),
        Err(_) => {
            let error: Error = serde_json::from_slice(c)?;
            match error.retryable() {
                true => Err(ModelError {
                    message: error.message(),
                    retryable: Some(ModelErrorRetryOptions {
                        sleep: Duration::from_millis(2000),
                        factor: 2,
                        retries: 8,
                    }),
                }),
                false => Err(ModelError {
                    message: error.message(),
                    retryable: None,
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

    Ok(completion)
}

///
/// Shared streamed/non-streamed chat/completion handling code (used by both OpenAILLM and
/// AzureOpenAILLM).
///

pub async fn embed(
    uri: Uri,
    api_key: String,
    organization_id: Option<String>,
    model_id: Option<String>,
    text: Vec<&str>,
    user: Option<String>,
) -> Result<Embeddings> {
    let https = HttpsConnector::new();
    let cli = Client::builder().build::<_, hyper::Body>(https);

    let mut body = json!({
        "input": text,
    });
    if user.is_some() {
        body["user"] = json!(user);
    }
    if model_id.is_some() {
        body["model"] = json!(model_id);
    }

    // println!("BODY: {}", body.to_string());

    let mut req_builder = Request::builder()
        .method(Method::POST)
        .uri(uri)
        .header("Content-Type", "application/json")
        // This one is for `openai`.
        .header("Authorization", format!("Bearer {}", api_key.clone()))
        // This one is for `azure_openai`.
        .header("api-key", api_key.clone());

    if let Some(organization_id) = organization_id {
        req_builder = req_builder.header("OpenAI-Organization", organization_id);
    }

    let req = req_builder.body(Body::from(body.to_string()))?;

    let res = match timeout(Duration::new(60, 0), cli.request(req)).await {
        Ok(Ok(res)) => res,
        Ok(Err(e)) => Err(e)?,
        Err(_) => Err(anyhow!("Timeout sending request to OpenAI after 60s"))?,
    };
    let body = match timeout(Duration::new(60, 0), hyper::body::aggregate(res)).await {
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
            let error: Error = serde_json::from_slice(c)?;
            match error.retryable() {
                true => Err(ModelError {
                    message: error.message(),
                    retryable: Some(ModelErrorRetryOptions {
                        sleep: Duration::from_millis(2000),
                        factor: 2,
                        retries: 8,
                    }),
                }),
                false => Err(ModelError {
                    message: error.message(),
                    retryable: None,
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

    fn tokenizer(&self) -> Arc<Mutex<CoreBPE>> {
        match self.id.as_str() {
            "code_davinci-002" | "code-cushman-001" => p50k_base_singleton(),
            "text-davinci-002" | "text-davinci-003" => p50k_base_singleton(),
            _ => match self.id.starts_with("gpt-3.5-turbo") || self.id.starts_with("gpt-4") {
                true => cl100k_base_singleton(),
                false => r50k_base_singleton(),
            },
        }
    }
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
        if self.id.starts_with("gpt-3.5-turbo") {
            return 4096;
        }
        if self.id.starts_with("gpt-4-32k") {
            return 32768;
        }
        if self.id.starts_with("gpt-4-1106-preview") {
            return 128000;
        }
        if self.id.starts_with("gpt-4") {
            return 8192;
        }
        match self.id.as_str() {
            "code-davinci-002" => 8000,
            "text-davinci-002" => 4000,
            "text-davinci-003" => 4000,
            _ => 2048,
        }
    }

    async fn encode(&self, text: &str) -> Result<Vec<usize>> {
        encode_async(self.tokenizer(), text).await
    }

    async fn decode(&self, tokens: Vec<usize>) -> Result<String> {
        decode_async(self.tokenizer(), tokens).await
    }

    async fn tokenize(&self, text: &str) -> Result<Vec<(usize, String)>> {
        tokenize_async(self.tokenizer(), text).await
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

        let c = match event_sender {
            Some(_) => {
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
            }
            None => {
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
            }
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

        let c = match event_sender {
            Some(_) => {
                streamed_chat_completion(
                    self.chat_uri()?,
                    self.api_key.clone().unwrap(),
                    openai_org_id,
                    Some(self.id.clone()),
                    messages,
                    functions,
                    function_call,
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
                    event_sender,
                )
                .await?
            }
            None => {
                chat_completion(
                    self.chat_uri()?,
                    self.api_key.clone().unwrap(),
                    openai_org_id,
                    Some(self.id.clone()),
                    messages,
                    functions,
                    function_call,
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
            }
        };

        // println!("COMPLETION: {:?}", c);

        assert!(c.choices.len() > 0);

        Ok(LLMChatGeneration {
            created: utils::now(),
            provider: ProviderID::OpenAI.to_string(),
            model: self.id.clone(),
            completions: c
                .choices
                .iter()
                .map(|c| c.message.clone())
                .collect::<Vec<_>>(),
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

    fn tokenizer(&self) -> Arc<Mutex<CoreBPE>> {
        match self.id.as_str() {
            "text-embedding-ada-002" => cl100k_base_singleton(),
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
        if !(vec!["text-embedding-ada-002"].contains(&self.id.as_str())) {
            return Err(anyhow!(
                "Unexpected embedder model id (`{}`) for provider `openai`, \
                  expected: `text-embedding-ada-002`",
                self.id
            ));
        }

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
        match self.id.as_str() {
            "text-embedding-ada-002" => 8191,
            _ => unimplemented!(),
        }
    }

    fn embedding_size(&self) -> usize {
        match self.id.as_str() {
            "text-embedding-ada-002" => 1536,
            _ => unimplemented!(),
        }
    }

    async fn encode(&self, text: &str) -> Result<Vec<usize>> {
        encode_async(self.tokenizer(), text).await
    }

    async fn decode(&self, tokens: Vec<usize>) -> Result<String> {
        decode_async(self.tokenizer(), tokens).await
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
