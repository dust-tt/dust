use super::llm::{ChatFunction, ChatFunctionCall, ChatMessage};
use super::tiktoken::tiktoken::{decode_async, encode_async, tokenize_async};
use crate::providers::embedder::Embedder;
use crate::providers::llm::{ChatMessageRole, LLMChatGeneration, LLMGeneration, LLM};
use crate::providers::provider::{ModelError, ModelErrorRetryOptions, Provider, ProviderID};
use crate::providers::tiktoken::tiktoken::{p50k_base_singleton, CoreBPE};
use crate::run::Credentials;
use crate::utils::ParseError;
use crate::utils::{self, now};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use eventsource_client as es;
use eventsource_client::Client as ESClient;
use futures::TryStreamExt;
use hyper::{body::Buf, Uri};
use parking_lot::{Mutex, RwLock};
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

impl TryFrom<&ChatMessageRole> for MistralChatMessageRole {
    type Error = anyhow::Error;

    fn try_from(value: &ChatMessageRole) -> Result<Self, Self::Error> {
        match value {
            ChatMessageRole::Assistant => Ok(MistralChatMessageRole::Assistant),
            ChatMessageRole::System => Ok(MistralChatMessageRole::System),
            ChatMessageRole::User => Ok(MistralChatMessageRole::User),
            ChatMessageRole::Function => Ok(MistralChatMessageRole::Tool),
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
    pub function: MistralToolCallFunction,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
struct MistralChatMessage {
    pub role: MistralChatMessageRole,
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<MistralToolCall>>,
}

impl TryFrom<&ChatFunctionCall> for MistralToolCall {
    type Error = anyhow::Error;

    fn try_from(cf: &ChatFunctionCall) -> Result<Self, Self::Error> {
        Ok(MistralToolCall {
            function: MistralToolCallFunction {
                name: cf.name.clone(),
                arguments: cf.arguments.clone(),
            },
        })
    }
}

impl TryFrom<&ChatMessage> for MistralChatMessage {
    type Error = anyhow::Error;

    fn try_from(cm: &ChatMessage) -> Result<Self, Self::Error> {
        let mistral_role = MistralChatMessageRole::try_from(&cm.role)
            .map_err(|e| anyhow!("Error converting role: {:?}", e))?;

        // `name` is taken into account by Mistral only for tool roles. We therefore inject it for
        // `user` messages to indicate to the model who is the user since name is not taken into
        // account there. For `assistant` message we don't inject it to avoid having the model
        // injecting similar prefixes.
        let meta_prompt = match cm.role {
            ChatMessageRole::User => match cm.name.as_ref() {
                Some(name) => format!("[user: {}] ", name), // Include space here.
                None => String::from(""),
            },
            _ => String::from(""),
        };

        Ok(MistralChatMessage {
            content: Some(format!(
                "{}{}",
                meta_prompt,
                cm.content.clone().unwrap_or(String::from(""))
            )),
            name: cm.name.clone(),
            role: mistral_role,
            tool_calls: match cm.function_call.as_ref() {
                Some(fc) => Some(vec![MistralToolCall::try_from(fc)?]),
                None => None,
            },
        })
    }
}

impl TryFrom<&MistralChatMessage> for ChatMessage {
    type Error = anyhow::Error;

    fn try_from(cm: &MistralChatMessage) -> Result<Self, Self::Error> {
        let role = ChatMessageRole::from(cm.role.clone());
        let content = match cm.content.as_ref() {
            Some(c) => Some(c.clone()),
            None => None,
        };

        let function_call = match cm.tool_calls.as_ref() {
            Some(tc) => {
                if tc.len() > 0 {
                    Some(ChatFunctionCall {
                        name: tc[0].function.name.clone(),
                        arguments: tc[0].function.arguments.clone(),
                    })
                } else {
                    None
                }
            }
            None => None,
        };

        Ok(ChatMessage {
            content,
            role,
            name: None,
            function_call,
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
struct MistralUsage {
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

#[derive(Serialize, Deserialize, Debug, Clone)]
struct MistralAPIError {
    #[serde(alias = "type")]
    pub _type: Option<String>,
    pub code: Option<String>,
    pub message: String,
    pub object: Option<String>,
    pub param: Option<String>,
}

impl MistralAPIError {
    pub fn message(&self) -> String {
        match self._type.as_ref() {
            Some(t) => format!("MistralAIError: [{}] {}", t, self.message),
            None => format!("MistralAIError: {}", self.message),
        }
    }

    pub fn retryable(&self) -> bool {
        match self.object.as_ref() {
            Some(o) => match o.as_str() {
                "error" => match self._type {
                    Some(_) => self.message.contains("retry"),
                    None => false,
                },
                _ => false,
            },
            None => false,
        }
    }

    pub fn retryable_streamed(&self) -> bool {
        self.retryable()
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
        let mistral_messages: Result<Vec<MistralChatMessage>, _> = messages
            .iter()
            .map(|m| MistralChatMessage::try_from(m))
            .collect();

        // If mistral_messages is Err, the error will be returned from the function.
        // If it's Ok, the inner Vec<ChatMessage> will be returned.
        mistral_messages
    }

    fn tokenizer(&self) -> Arc<RwLock<CoreBPE>> {
        return p50k_base_singleton();
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
    ) -> Result<MistralChatCompletion> {
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

                            let chunk: MistralChatChunk =
                                match serde_json::from_str(e.data.as_str()) {
                                    Ok(c) => c,
                                    Err(err) => {
                                        let error: Result<MistralAPIError, _> =
                                            serde_json::from_str(e.data.as_str());
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

                            // Only stream if choices is length 1 but should always be the case.
                            match event_sender.as_ref() {
                                Some(sender) => {
                                    if chunk.choices.len() == 1 {
                                        // We ignore the role for generating events.
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
                    Err(anyhow!("Error streaming tokens from Mistral AI: {:?}", e))?;
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
                            name: None,
                            role: MistralChatMessageRole::Assistant,
                            tool_calls: None,
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
                usage: None,
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
                                serde_json::from_value(tc.clone()).unwrap_or_else(|_| None);
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

        Ok(completion)
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
    ) -> Result<MistralChatCompletion> {
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
        let body = match timeout(Duration::new(180, 0), res.bytes()).await {
            Ok(Ok(body)) => body,
            Ok(Err(e)) => Err(e)?,
            Err(_) => Err(anyhow!(
                "Timeout reading response from Mistral AI after 180s"
            ))?,
        };

        let mut b: Vec<u8> = vec![];
        body.reader().read_to_end(&mut b)?;
        let c: &[u8] = &b;

        let mut completion: MistralChatCompletion = match serde_json::from_slice(c) {
            Ok(c) => Ok(c),
            Err(_) => {
                let error: MistralAPIError = serde_json::from_slice(c)?;
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

        // For all messages, edit the content and strip leading and trailing spaces and \n.
        for m in completion.choices.iter_mut() {
            m.message.content = match m.message.content.as_ref() {
                None => None,
                Some(c) => Some(c.trim().to_string()),
            };
        }

        Ok(completion)
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

    async fn tokenize(&self, text: &str) -> Result<Vec<(usize, String)>> {
        tokenize_async(self.tokenizer(), text).await
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

        let c = match event_sender {
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
                .map(|c| ChatMessage::try_from(&c.message))
                .collect::<Result<Vec<_>>>()?,
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
        // TODO(flav): Update the link.
        // utils::info("Your API key can be found at `https://platform.openai.com/account/api-keys`.");
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

    fn embedder(&self, _id: String) -> Box<dyn Embedder + Sync + Send> {
        unimplemented!()
    }
}
