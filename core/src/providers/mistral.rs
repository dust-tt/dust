use super::llm::{ChatFunction, ChatMessage as BaseChatMessage};
use super::tiktoken::tiktoken::{decode_async, encode_async, tokenize_async};
use crate::providers::embedder::Embedder;
use crate::providers::llm::{ChatMessageRole, LLMChatGeneration, LLMGeneration, LLM};
use crate::providers::provider::{ModelError, ModelErrorRetryOptions, Provider, ProviderID};
use crate::providers::tiktoken::tiktoken::{p50k_base_singleton, CoreBPE};
use crate::run::Credentials;
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
pub enum MistralAIChatMessageRole {
    Assistant,
    System,
    User,
}

impl From<MistralAIChatMessageRole> for ChatMessageRole {
    fn from(value: MistralAIChatMessageRole) -> Self {
        match value {
            MistralAIChatMessageRole::Assistant => ChatMessageRole::Assistant,
            MistralAIChatMessageRole::System => ChatMessageRole::System,
            MistralAIChatMessageRole::User => ChatMessageRole::User,
        }
    }
}

impl TryFrom<&ChatMessageRole> for MistralAIChatMessageRole {
    type Error = anyhow::Error;

    fn try_from(value: &ChatMessageRole) -> Result<Self, Self::Error> {
        match value {
            ChatMessageRole::Assistant => Ok(MistralAIChatMessageRole::Assistant),
            ChatMessageRole::System => Ok(MistralAIChatMessageRole::System),
            ChatMessageRole::User => Ok(MistralAIChatMessageRole::User),
            ChatMessageRole::Function => Ok(MistralAIChatMessageRole::User),
        }
    }
}

impl ToString for MistralAIChatMessageRole {
    fn to_string(&self) -> String {
        match self {
            MistralAIChatMessageRole::Assistant => String::from("assistant"),
            MistralAIChatMessageRole::System => String::from("system"),
            MistralAIChatMessageRole::User => String::from("user"),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
struct ChatMessage {
    pub content: Option<String>,
    pub role: MistralAIChatMessageRole,
}

impl TryFrom<&BaseChatMessage> for ChatMessage {
    type Error = anyhow::Error;

    fn try_from(cm: &BaseChatMessage) -> Result<Self, Self::Error> {
        let mistral_role = MistralAIChatMessageRole::try_from(&cm.role)
            .map_err(|e| anyhow!("Error converting role: {:?}", e))?;

        let meta_prompt = match cm.role {
            ChatMessageRole::User => match cm.name.as_ref() {
                Some(name) => format!("[user: {}] ", name), // Include space here.
                None => String::from(""),
            },
            ChatMessageRole::Function => match cm.name.as_ref() {
                Some(name) => format!("[function_result: {}] ", name), // Include space here.
                None => "[function_result]".to_string(),
            },
            _ => String::from(""),
        };

        Ok(ChatMessage {
            content: Some(format!(
                "{}{}",
                meta_prompt,
                cm.content.clone().unwrap_or(String::from(""))
            )),
            role: mistral_role,
        })
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct ChatChoice {
    pub finish_reason: Option<String>,
    pub index: usize,
    pub message: BaseChatMessage,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct Usage {
    pub completion_tokens: Option<u64>,
    pub prompt_tokens: u64,
    pub total_tokens: u64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct ChatCompletion {
    pub id: String,
    pub object: String,
    pub created: u64,
    pub model: String,
    pub choices: Vec<ChatChoice>,
    pub usage: Option<Usage>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct ChatDelta {
    pub delta: Value,
    pub finish_reason: Option<String>,
    pub index: usize,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct ChatChunk {
    pub choices: Vec<ChatDelta>,
    pub created: Option<u64>,
    pub id: String,
    pub model: String,
    pub object: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct APIError {
    #[serde(alias = "type")]
    pub _type: Option<String>,
    pub code: Option<String>,
    pub message: String,
    pub object: String,
    pub param: Option<String>,
}

impl APIError {
    pub fn message(&self) -> String {
        format!("MistralAIError: [{:?}] {}", self._type, self.message,)
    }

    pub fn retryable(&self) -> bool {
        match self.object.as_str() {
            "error" => match self._type {
                Some(_) => self.message.contains("retry"),
                None => false,
            },
            _ => false,
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
        messages: &Vec<BaseChatMessage>,
    ) -> Result<Vec<ChatMessage>, anyhow::Error> {
        let mistral_messages: Result<Vec<ChatMessage>, _> =
            messages.iter().map(|m| ChatMessage::try_from(m)).collect();

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
        messages: &Vec<ChatMessage>,
        temperature: f32,
        top_p: f32,
        max_tokens: i32,
        event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<ChatCompletion> {
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

        // TODO(flav): Handle `safe_mode`.

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
                                    let error: Result<APIError, _> =
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
            let mut c = ChatCompletion {
                choices: f
                    .choices
                    .iter()
                    .map(|c| ChatChoice {
                        message: BaseChatMessage {
                            content: Some("".to_string()),
                            function_call: None,
                            name: None,
                            role: ChatMessageRole::from(MistralAIChatMessageRole::Assistant),
                        },
                        index: c.index,
                        finish_reason: None,
                    })
                    .collect::<Vec<_>>(),
                // The `created` timestamp is absent in the initial stream chunk (in ms), defaulting to the current time (in seconds).
                created: f.created.map(|s| s * 1000).unwrap_or_else(now),
                id: f.id.clone(),
                model: f.model,
                // The `object` field defaults to "start" when not present in the initial stream chunk.
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
        messages: &Vec<ChatMessage>,
        temperature: f32,
        top_p: f32,
        max_tokens: i32,
    ) -> Result<ChatCompletion> {
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

        let mut completion: ChatCompletion = match serde_json::from_slice(c) {
            Ok(c) => Ok(c),
            Err(_) => {
                let error: APIError = serde_json::from_slice(c)?;
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
        messages: &Vec<BaseChatMessage>,
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
        if functions.len() > 0 || function_call.is_some() {
            return Err(anyhow!("Mistral AI does not support chat functions."));
        }

        if stop.len() > 0 {
            return Err(anyhow!("Mistral AI does not support stop sequence."));
        }

        if presence_penalty.is_some() || frequency_penalty.is_some() {
            return Err(anyhow!("Mistral AI does not support penalties."));
        }

        // If max_tokens is not set or is -1, compute the max tokens based on the first message.
        let first_message = &messages[0];
        let computed_max_tokens = match max_tokens.unwrap_or(-1) {
            -1 => match &first_message.content {
                Some(content) => {
                    let tokens = self.encode(content).await?;
                    (self.context_size() - tokens.len()) as i32
                }
                None => self.context_size() as i32,
            },
            _ => max_tokens.unwrap(),
        };

        // TODO(flav): Handle `extras`.

        let mistral_messages = self.to_mistral_messages(messages)?;

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
                .map(|c| c.message.clone())
                .collect::<Vec<_>>(),
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
