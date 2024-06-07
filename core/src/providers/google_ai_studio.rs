use anyhow::{anyhow, Result};
use async_trait::async_trait;
use eventsource_client as es;
use eventsource_client::Client as ESClient;
use futures::TryStreamExt;
use hyper::StatusCode;
use parking_lot::{Mutex, RwLock};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc::UnboundedSender;

use crate::{
    providers::{
        llm::Tokens,
        provider::{ModelError, ModelErrorRetryOptions},
    },
    run::Credentials,
    utils,
};

use super::{
    embedder::Embedder,
    llm::{
        ChatFunction, ChatFunctionCall, ChatMessage, ChatMessageRole, LLMChatGeneration,
        LLMGeneration, LLMTokenUsage, LLM,
    },
    provider::{Provider, ProviderID},
    tiktoken::tiktoken::{
        cl100k_base_singleton, decode_async, encode_async, tokenize_async, CoreBPE,
    },
};

// Disabled for now as it requires using a "tools" API which we don't support yet.
pub const USE_FUNCTION_CALLING: bool = false;

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UsageMetadata {
    prompt_token_count: Option<usize>,
    candidates_token_count: Option<usize>,
    total_token_count: Option<usize>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GoogleAiStudioFunctionResponseContent {
    name: String,
    content: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GoogleAIStudioFunctionResponse {
    name: String,
    response: GoogleAiStudioFunctionResponseContent,
}

impl TryFrom<&ChatMessage> for GoogleAIStudioFunctionResponse {
    type Error = anyhow::Error;

    fn try_from(m: &ChatMessage) -> Result<Self, Self::Error> {
        let name = m.name.clone().unwrap_or_default();
        Ok(GoogleAIStudioFunctionResponse {
            name: name.clone(),
            response: GoogleAiStudioFunctionResponseContent {
                name,
                content: m.content.clone().unwrap_or_default(),
            },
        })
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GoogleAIStudioFunctionCall {
    name: String,
    args: Option<Value>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GoogleAIStudioFunctionDeclaration {
    name: String,
    description: String,
    parameters: Option<Value>,
}

impl TryFrom<&ChatFunction> for GoogleAIStudioFunctionDeclaration {
    type Error = anyhow::Error;

    fn try_from(f: &ChatFunction) -> Result<Self, Self::Error> {
        Ok(GoogleAIStudioFunctionDeclaration {
            name: f.name.clone(),
            description: f.description.clone().unwrap_or(String::from("")),
            parameters: f.parameters.clone(),
        })
    }
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
#[serde(rename_all = "UPPERCASE")]
pub enum GoogleAIStudioTooConfigMode {
    Auto,
    Any,
    None,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GoogleAIStudioFunctionCallingConfig {
    mode: GoogleAIStudioTooConfigMode,
    allowed_function_names: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Part {
    text: Option<String>,
    function_call: Option<GoogleAIStudioFunctionCall>,
    function_response: Option<GoogleAIStudioFunctionResponse>,
}

impl TryFrom<&ChatFunctionCall> for GoogleAIStudioFunctionCall {
    type Error = anyhow::Error;

    fn try_from(f: &ChatFunctionCall) -> Result<Self, Self::Error> {
        let args = match serde_json::from_str(f.arguments.as_str()) {
            Ok(v) => v,
            Err(_) => Err(anyhow!(
                "GoogleAISudio function call arguments must be valid JSON"
            ))?,
        };
        Ok(GoogleAIStudioFunctionCall {
            name: f.name.clone(),
            args,
        })
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Content {
    role: String,
    parts: Option<Vec<Part>>,
}

impl TryFrom<&ChatMessage> for Content {
    type Error = anyhow::Error;

    fn try_from(m: &ChatMessage) -> Result<Self, Self::Error> {
        let role = match m.role {
            ChatMessageRole::Assistant => String::from("model"),
            ChatMessageRole::Function => String::from("function"),
            _ => String::from("user"),
        };

        let parts = match m.function_calls {
            Some(ref fcs) => fcs
                .iter()
                .map(|fc| {
                    Ok(Part {
                        text: m.content.clone(),
                        function_call: Some(GoogleAIStudioFunctionCall::try_from(fc)?),
                        function_response: None,
                    })
                })
                .collect::<Result<Vec<Part>>>()?,
            None => {
                vec![Part {
                    text: match m.role {
                        // System is passed as a Content. We transform it here but it will be removed
                        // from the list of messages and passed as separate argument to the API.
                        ChatMessageRole::System => m.content.clone(),
                        ChatMessageRole::User => m.content.clone(),
                        ChatMessageRole::Assistant => m.content.clone(),
                        _ => None,
                    },

                    function_call: None,
                    function_response: match m.role {
                        ChatMessageRole::Function => {
                            GoogleAIStudioFunctionResponse::try_from(m).ok()
                        }
                        _ => None,
                    },
                }]
            }
        };

        Ok(Content {
            role,
            parts: Some(parts),
        })
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Candidate {
    content: Content,
    finish_reason: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Completion {
    candidates: Option<Vec<Candidate>>,
    usage_metadata: Option<UsageMetadata>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct InnerError {
    pub message: String,
    pub code: Option<usize>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GoogleAIStudioError {
    pub error: InnerError,
}

impl GoogleAIStudioError {
    pub fn message(&self) -> String {
        format!("GoogleAIStudio: {}", self.error.message)
    }

    pub fn retryable(&self) -> bool {
        return false;
    }

    pub fn retryable_streamed(&self, status: StatusCode) -> bool {
        if status == StatusCode::TOO_MANY_REQUESTS {
            return true;
        }
        if status.is_server_error() {
            return true;
        }
        return false;
    }
}

pub struct GoogleAiStudioProvider {}

impl GoogleAiStudioProvider {
    pub fn new() -> Self {
        Self {}
    }
}

#[async_trait]
impl Provider for GoogleAiStudioProvider {
    fn id(&self) -> ProviderID {
        ProviderID::GoogleAiStudio
    }

    fn setup(&self) -> Result<()> {
        utils::info("You cannot setup GoogleAIStudio from the CLI, sorry.");

        Ok(())
    }

    async fn test(&self) -> Result<()> {
        Err(anyhow!(
            "You cannot test GoogleAIStudio from the CLI, sorry."
        ))
    }

    fn llm(&self, id: String) -> Box<dyn LLM + Sync + Send> {
        Box::new(GoogleAiStudioLLM::new(id))
    }

    fn embedder(&self, _id: String) -> Box<dyn Embedder + Sync + Send> {
        unimplemented!()
    }
}

pub struct GoogleAiStudioLLM {
    id: String,
    api_key: Option<String>,
}

impl GoogleAiStudioLLM {
    pub fn new(id: String) -> Self {
        Self { id, api_key: None }
    }

    fn model_endpoint(&self) -> String {
        format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:streamGenerateContent?alt=sse",
            self.id
        )
    }

    fn tokenizer(&self) -> Arc<RwLock<CoreBPE>> {
        // TODO: use countTokens API
        // "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:countTokens"
        cl100k_base_singleton()
    }
}

#[async_trait]
impl LLM for GoogleAiStudioLLM {
    fn id(&self) -> String {
        self.id.clone()
    }

    async fn initialize(&mut self, credentials: Credentials) -> Result<()> {
        match credentials.get("GOOGLE_AI_STUDIO_API_KEY") {
            Some(api_key) => {
                self.api_key = Some(api_key.clone());
            }
            None => Err(anyhow!("GOOGLE_AI_STUDIO_API_KEY not found in credentials"))?,
        }
        Ok(())
    }

    fn context_size(&self) -> usize {
        1_000_000
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
        presence_penalty: Option<f32>,
        frequency_penalty: Option<f32>,
        top_p: Option<f32>,
        top_logprobs: Option<i32>,
        _extras: Option<Value>,
        event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<LLMGeneration> {
        assert!(n == 1);

        let api_key = match &self.api_key {
            Some(k) => k.to_string(),
            None => Err(anyhow!("API key not found"))?,
        };

        if frequency_penalty.is_some() {
            Err(anyhow!("Frequency penalty not supported by GoogleAIStudio"))?;
        }
        if presence_penalty.is_some() {
            Err(anyhow!("Presence penalty not supported by GoogleAIStudio"))?;
        }
        if top_logprobs.is_some() {
            Err(anyhow!("Top logprobs not supported by GoogleAIStudio"))?;
        }

        if let Some(m) = max_tokens {
            if m == -1 {
                let tokens = self.encode(prompt).await?;
                max_tokens = Some((self.context_size() - tokens.len()) as i32);
            }
        }

        let uri = self.model_endpoint();

        let c = streamed_chat_completion(
            uri,
            api_key,
            &vec![Content {
                role: String::from("user"),
                parts: Some(vec![Part {
                    text: Some(String::from(prompt)),
                    function_call: None,
                    function_response: None,
                }]),
            }],
            vec![],
            None,
            None,
            temperature,
            stop,
            max_tokens,
            match top_p {
                Some(t) => t,
                None => 1.0,
            },
            None,
            event_sender,
            false,
        )
        .await?;

        Ok(LLMGeneration {
            created: utils::now(),
            provider: ProviderID::GoogleAiStudio.to_string(),
            model: self.id().clone(),
            completions: vec![Tokens {
                text: match c.candidates {
                    None => String::from(""),
                    Some(candidates) => match candidates.len() {
                        0 => String::from(""),
                        _ => match &candidates[0].content.parts {
                            None => String::from(""),
                            Some(parts) => match parts.len() {
                                0 => String::from(""),
                                _ => match &parts[0].text {
                                    None => String::from(""),
                                    Some(text) => text.clone(),
                                },
                            },
                        },
                    },
                },
                tokens: Some(vec![]),
                logprobs: Some(vec![]),
                top_logprobs: None,
            }],
            prompt: Tokens {
                text: prompt.to_string(),
                tokens: Some(vec![]),
                logprobs: Some(vec![]),
                top_logprobs: None,
            },
            usage: c.usage_metadata.map(|c| LLMTokenUsage {
                prompt_tokens: c.prompt_token_count.unwrap_or(0) as u64,
                completion_tokens: c.candidates_token_count.unwrap_or(0) as u64,
            }),
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
        _extras: Option<Value>,
        event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<LLMChatGeneration> {
        assert!(n == 1);

        let api_key = match &self.api_key {
            Some(k) => k.to_string(),
            None => Err(anyhow!("API key not found"))?,
        };

        if frequency_penalty.is_some() {
            Err(anyhow!("Frequency penalty not supported by GoogleAIStudio"))?;
        }
        if presence_penalty.is_some() {
            Err(anyhow!("Presence penalty not supported by GoogleAIStudio"))?;
        }

        if let Some(m) = max_tokens {
            if m == -1 {
                max_tokens = None;
            }
        }

        if frequency_penalty.is_some() {
            Err(anyhow!("Frequency penalty not supported by GoogleAIStudio"))?;
        }
        if presence_penalty.is_some() {
            Err(anyhow!("Presence penalty not supported by GoogleAIStudio"))?;
        }

        let uri = self.model_endpoint();

        // Remove system message if first.
        let system = match messages.get(0) {
            Some(cm) => match cm.role {
                ChatMessageRole::System => Some(Content::try_from(cm)?),
                _ => None,
            },
            None => None,
        };

        let messages = messages
            .iter()
            .skip(match system.as_ref() {
                Some(_) => 1,
                None => 0,
            })
            .map(|cm| Content::try_from(cm))
            .collect::<Result<Vec<Content>>>()?;

        // TODO: backward comp for non alternated messages

        let tools = functions
            .iter()
            .map(GoogleAIStudioFunctionDeclaration::try_from)
            .collect::<Result<Vec<GoogleAIStudioFunctionDeclaration>, _>>()?;

        let tool_config = match function_call {
            Some(fc) => Some(match fc.as_str() {
                "auto" => GoogleAIStudioFunctionCallingConfig {
                    mode: GoogleAIStudioTooConfigMode::Auto,
                    allowed_function_names: None,
                },
                "none" => GoogleAIStudioFunctionCallingConfig {
                    mode: GoogleAIStudioTooConfigMode::None,
                    allowed_function_names: None,
                },
                "any" => GoogleAIStudioFunctionCallingConfig {
                    mode: GoogleAIStudioTooConfigMode::Any,
                    allowed_function_names: None,
                },
                _ => GoogleAIStudioFunctionCallingConfig {
                    mode: GoogleAIStudioTooConfigMode::Any,
                    allowed_function_names: Some(vec![fc.clone()]),
                },
            }),
            None => None,
        };

        let c = streamed_chat_completion(
            uri,
            api_key,
            &messages,
            tools,
            tool_config,
            system,
            temperature,
            stop,
            max_tokens,
            match top_p {
                Some(t) => t,
                None => 1.0,
            },
            None,
            event_sender,
            false,
        )
        .await?;

        let mut content: Option<String> = None;
        let mut function_calls: Vec<ChatFunctionCall> = vec![];

        match c.candidates {
            None => (),
            Some(candidates) => match candidates.len() {
                0 => (),
                _ => match &candidates[0].content.parts {
                    None => (),
                    Some(parts) => {
                        for p in parts.iter() {
                            match p.text.as_ref() {
                                Some(t) => match content.as_mut() {
                                    Some(c) => {
                                        *c = c.clone() + t.as_str();
                                    }
                                    None => {
                                        content = Some(t.clone());
                                    }
                                },
                                None => (),
                            }
                            match p.function_call.as_ref() {
                                Some(fc) => {
                                    function_calls.push(ChatFunctionCall {
                                        id: format!("fc_{}", utils::new_id()[0..9].to_string()),
                                        name: fc.name.clone(),
                                        arguments: match fc.args {
                                            Some(ref args) => serde_json::to_string(args)?,
                                            None => String::from("{}"),
                                        },
                                    });
                                }
                                None => (),
                            }
                        }
                    }
                },
            },
        }

        Ok(LLMChatGeneration {
            created: utils::now(),
            provider: ProviderID::GoogleAiStudio.to_string(),
            model: self.id().clone(),
            completions: vec![ChatMessage {
                name: None,
                function_call: match function_calls.first() {
                    Some(fc) => Some(fc.clone()),
                    None => None,
                },
                function_calls: match function_calls.len() {
                    0 => None,
                    _ => Some(function_calls),
                },
                function_call_id: None,
                role: ChatMessageRole::Assistant,
                content,
            }],
            usage: c.usage_metadata.map(|c| LLMTokenUsage {
                prompt_tokens: c.prompt_token_count.unwrap_or(0) as u64,
                completion_tokens: c.candidates_token_count.unwrap_or(0) as u64,
            }),
        })
    }
}

pub async fn streamed_chat_completion(
    uri: String,
    api_key: String,
    messages: &Vec<Content>,
    tools: Vec<GoogleAIStudioFunctionDeclaration>,
    tool_config: Option<GoogleAIStudioFunctionCallingConfig>,
    system_instruction: Option<Content>,
    temperature: f32,
    stop: &Vec<String>,
    max_tokens: Option<i32>,
    top_p: f32,
    top_k: Option<usize>,
    event_sender: Option<UnboundedSender<Value>>,
    use_header_auth: bool,
) -> Result<Completion> {
    let url = match use_header_auth {
        true => uri.to_string(),
        false => format!("{}&key={}", uri, api_key),
    };

    let mut builder = match es::ClientBuilder::for_url(url.as_str()) {
        Ok(builder) => builder,
        Err(e) => {
            return Err(anyhow!(
                "Error creating GoogleAIStudio streaming client: {:?}",
                e
            ))
        }
    };

    if use_header_auth {
        builder = match builder.method(String::from("POST")).header(
            "Authorization",
            format!("Bearer {}", api_key.clone()).as_str(),
        ) {
            Ok(b) => b,
            Err(_) => return Err(anyhow!("Error creating streamed client to GoogleAIStudio")),
        };
    }

    builder = match builder.header("Content-Type", "application/json") {
        Ok(b) => b,
        Err(_) => return Err(anyhow!("Error creating streamed client to GoogleAIStudio")),
    };

    let mut body = json!({
        "contents": vec![json!(messages)],
        "generation_config": {
            "temperature": temperature,
            "topP": top_p,
            "topK": top_k,
            "maxOutputTokens": max_tokens,
            "stopSequences": match stop.len() {
                0 => None,
                _ => Some(stop),
            },
        }
    });

    if tools.len() > 0 {
        body["tools"] = json!(vec![json!({
            "functionDeclarations": tools
        })]);
    }

    if tool_config.is_some() {
        body["toolConfig"] = json!({
            "functionCallingConfig": tool_config
        });
    }

    if system_instruction.is_some() {
        body["systemInstruction"] = json!(system_instruction);
    }

    let client = builder
        .body(body.to_string())
        .method("POST".to_string())
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
                Some(es::SSE::Event(e)) => {
                    let completion: Completion = serde_json::from_str(e.data.as_str())?;
                    let completion_candidates = completion.candidates.clone().unwrap_or_default();

                    match completion_candidates.len() {
                        0 => {
                            break 'stream;
                        }
                        1 => (),
                        n => {
                            Err(anyhow!("Unexpected number of candidates: {}", n))?;
                        }
                    };

                    let parts = completion_candidates[0]
                        .content
                        .parts
                        .clone()
                        .unwrap_or_default();

                    match event_sender.as_ref() {
                        Some(sender) => parts.iter().for_each(|p| {
                            match p.text {
                                Some(ref t) => {
                                    if t.len() > 0 {
                                        let _ = sender.send(json!({
                                            "type": "tokens",
                                            "content": {
                                                "text": t,
                                            }
                                        }));
                                    }
                                }
                                None => (),
                            }

                            match p.function_call {
                                Some(ref f) => {
                                    let _ = sender.send(json!({
                                        "type": "function_call",
                                        "content": {
                                            "name": f.name,
                                        }
                                    }));
                                }
                                None => (),
                            }
                        }),

                        _ => (),
                    };

                    completions.lock().push(completion);
                }
                None => {
                    break 'stream;
                }
            },
            Err(e) => {
                match e {
                    // Nothing to do, go direclty to break stream.
                    es::Error::Eof => (),
                    es::Error::UnexpectedResponse(r) => {
                        let status = StatusCode::from_u16(r.status())?;
                        // GogoleAIStudio currently has no request id in headers.
                        // let headers = r.headers()?;
                        // let request_id = match headers.get("request-id") {
                        //     Some(v) => Some(v.to_string()),
                        //     None => None,
                        // };
                        let b = r.body_bytes().await?;

                        let error: Result<GoogleAIStudioError, _> = serde_json::from_slice(&b);
                        match error {
                            Ok(error) => {
                                match error.retryable_streamed(status) {
                                    true => Err(ModelError {
                                        request_id: None,
                                        message: error.message(),
                                        retryable: Some(ModelErrorRetryOptions {
                                            sleep: Duration::from_millis(500),
                                            factor: 2,
                                            retries: 3,
                                        }),
                                    }),
                                    false => Err(ModelError {
                                        request_id: None,
                                        message: error.message(),
                                        retryable: None,
                                    }),
                                }
                            }?,
                            Err(_) => Err(anyhow!(
                                "Error streaming tokens from GoogleAIStudio: status={} data={}",
                                status,
                                String::from_utf8_lossy(&b)
                            ))?,
                        }
                    }
                    _ => {
                        Err(anyhow!(
                            "Error streaming tokens from GoogleAIStudio: {:?}",
                            e
                        ))?;
                        break 'stream;
                    }
                }
                break 'stream;
            }
        }
    }

    let completions_lock = completions.lock();

    // Sometimes (usually when last message is Assistant), the AI decides not to respond.
    if completions_lock.len() == 0 {
        return Ok(Completion {
            candidates: None,
            usage_metadata: None,
        });
    }

    let mut usage_metadata: Option<UsageMetadata> = None;

    let mut candidate = Candidate {
        content: Content {
            role: String::from("MODEL"),
            parts: Some(vec![]),
        },
        finish_reason: None,
    };

    let mut text_parts: Option<Part> = None;
    let mut function_call_parts: Vec<Part> = vec![];

    for c in completions_lock.iter() {
        match &c.usage_metadata {
            None => (),
            Some(usage) => {
                usage_metadata = Some(usage.clone());
            }
        }

        match &c.candidates {
            None => (),
            Some(candidates) => match candidates.len() {
                0 => (),
                1 => {
                    match candidates[0].content.role.to_uppercase().as_str() {
                        "MODEL" => (),
                        _ => Err(anyhow!(format!(
                            "Unexpected role in completion: {}",
                            candidates[0].content.role
                        )))?,
                    };
                    match &candidates[0].finish_reason {
                        None => (),
                        Some(r) => {
                            candidate.finish_reason = Some(r.clone());
                        }
                    }

                    let parts = candidates[0].content.parts.clone().unwrap_or_default();

                    for p in parts.iter() {
                        match p.text.as_ref() {
                            Some(t) => match text_parts.as_mut() {
                                Some(tp) => {
                                    tp.text =
                                        Some(tp.text.clone().unwrap_or_default() + t.as_str());
                                }
                                None => {
                                    text_parts = Some(p.clone());
                                }
                            },
                            None => (),
                        }
                        match p.function_call.as_ref() {
                            Some(_) => {
                                function_call_parts.push(p.clone());
                            }
                            None => (),
                        }
                        match p.function_response.as_ref() {
                            Some(_) => {
                                Err(anyhow!("Unexpected function response part in completion"))?;
                            }
                            None => (),
                        }
                    }
                }
                _ => Err(anyhow!("Unexpected number of candidates >1"))?,
            },
        }
    }

    match text_parts {
        Some(tp) => {
            candidate.content.parts.as_mut().unwrap().push(tp);
        }
        None => (),
    }
    candidate
        .content
        .parts
        .as_mut()
        .unwrap()
        .extend(function_call_parts);

    Ok(Completion {
        candidates: Some(vec![candidate]),
        usage_metadata,
    })
}
