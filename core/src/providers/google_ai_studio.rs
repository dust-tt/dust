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
        chat_messages::AssistantChatMessage,
        llm::Tokens,
        provider::{ModelError, ModelErrorRetryOptions},
    },
    run::Credentials,
    utils,
};

use super::{
    chat_messages::{ChatMessage, ContentBlock, FunctionChatMessage, MixedContent},
    embedder::Embedder,
    llm::{
        ChatFunction, ChatFunctionCall, ChatMessageRole, LLMChatGeneration, LLMGeneration,
        LLMTokenUsage, LLM,
    },
    provider::{Provider, ProviderID},
    tiktoken::tiktoken::{
        batch_tokenize_async, cl100k_base_singleton, decode_async, encode_async, CoreBPE,
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

impl TryFrom<&FunctionChatMessage> for GoogleAIStudioFunctionResponse {
    type Error = anyhow::Error;

    fn try_from(m: &FunctionChatMessage) -> Result<Self, Self::Error> {
        let name = m.name.clone().unwrap_or_default();
        Ok(GoogleAIStudioFunctionResponse {
            name: name.clone(),
            response: GoogleAiStudioFunctionResponseContent {
                name,
                content: m.content.clone(),
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
            description: f.description.clone().unwrap_or_else(|| String::from("")),
            parameters: match f.parameters.clone() {
                // The API rejects empty 'properties'. If 'properties' is empty, return None.
                // Otherwise, return the object wrapped in Some.
                Some(serde_json::Value::Object(obj)) => {
                    if obj.get("properties").map_or(false, |props| {
                        props.as_object().map_or(false, |p| p.is_empty())
                    }) {
                        None
                    } else {
                        Some(serde_json::Value::Object(obj))
                    }
                }
                p => p,
            },
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
    #[serde(skip_serializing_if = "Option::is_none")]
    function_call: Option<GoogleAIStudioFunctionCall>,
    #[serde(skip_serializing_if = "Option::is_none")]
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

    fn try_from(cm: &ChatMessage) -> Result<Self, Self::Error> {
        match cm {
            ChatMessage::Assistant(assistant_msg) => {
                let parts = match assistant_msg.function_calls {
                    Some(ref fcs) => fcs
                        .iter()
                        .map(|fc| {
                            Ok(Part {
                                text: assistant_msg.content.clone(),
                                function_call: Some(GoogleAIStudioFunctionCall::try_from(fc)?),
                                function_response: None,
                            })
                        })
                        .collect::<Result<Vec<Part>, anyhow::Error>>()?,
                    None => {
                        if let Some(ref fc) = assistant_msg.function_call {
                            vec![Part {
                                text: assistant_msg.content.clone(),
                                function_call: Some(GoogleAIStudioFunctionCall::try_from(fc)?),
                                function_response: None,
                            }]
                        } else {
                            vec![Part {
                                text: assistant_msg.content.clone(),
                                function_call: None,
                                function_response: None,
                            }]
                        }
                    }
                };

                Ok(Content {
                    role: String::from("model"),
                    parts: Some(parts),
                })
            }
            ChatMessage::Function(function_msg) => Ok(Content {
                role: String::from("function"),
                parts: Some(vec![Part {
                    text: None,
                    function_call: None,
                    function_response: GoogleAIStudioFunctionResponse::try_from(function_msg).ok(),
                }]),
            }),
            ChatMessage::User(user_msg) => {
                let text = match &user_msg.content {
                    ContentBlock::Mixed(m) => {
                        let result = m.iter().enumerate().try_fold(
                            String::new(),
                            |mut acc, (i, content)| {
                                match content {
                                    MixedContent::ImageContent(_) => Err(anyhow!(
                                        "Vision is not supported for Google AI Studio."
                                    )),
                                    MixedContent::TextContent(tc) => {
                                        acc.push_str(&tc.text.trim());
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
                            Ok(text) if !text.is_empty() => Ok(text),
                            Ok(_) => Err(anyhow!("Text is required.")), // Empty string.
                            Err(e) => Err(e),
                        }
                    }
                    ContentBlock::Text(t) => Ok(t.clone()),
                }?;

                Ok(Content {
                    role: String::from("user"),
                    parts: Some(vec![Part {
                        text: Some(text),
                        function_call: None,
                        function_response: None,
                    }]),
                })
            }
            ChatMessage::System(system_msg) => Ok(Content {
                role: String::from("user"),
                parts: Some(vec![Part {
                    // System is passed as a Content. We transform it here but it will be removed
                    // from the list of messages and passed as separate argument to the API.
                    text: Some(system_msg.content.clone()),
                    function_call: None,
                    function_response: None,
                }]),
            }),
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Candidate {
    content: Option<Content>,
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
                // Get candidates?.[0]?.content?.parts?.[0]?.text ?? "".
                text: c
                    .candidates
                    .as_ref()
                    .and_then(|c| c.first())
                    .and_then(|c| c.content.as_ref())
                    .and_then(|c| c.parts.as_ref())
                    .and_then(|p| p.first())
                    .and_then(|p| p.text.as_ref())
                    .map(|t| t.to_string())
                    .unwrap_or_else(|| String::from("")),

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
            provider_request_id: None,
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
            Some(cm) => match cm {
                ChatMessage::System(_) => Some(Content::try_from(cm)?),
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

        // Get candidates?.[0]?.content?.parts.
        if let Some(parts) = c
            .candidates
            .as_ref()
            .and_then(|c| c.first())
            .and_then(|c| c.content.as_ref())
            .and_then(|c| c.parts.as_ref())
        {
            for p in parts.iter() {
                // If the part has text, either append it to the content if we already have some
                //  or set it as the content.
                if let Some(t) = p.text.as_ref() {
                    content = content.map(|c| c + t).or_else(|| Some(t.clone()));
                }

                // If the part has a function call, add it to the list of function calls.
                if let Some(fc) = p.function_call.as_ref() {
                    function_calls.push(ChatFunctionCall {
                        id: format!("fc_{}", utils::new_id()[0..9].to_string()),
                        name: fc.name.clone(),
                        arguments: match fc.args {
                            Some(ref args) => serde_json::to_string(args)?,
                            None => String::from("{}"),
                        },
                    });
                }
            }
        }

        Ok(LLMChatGeneration {
            created: utils::now(),
            provider: ProviderID::GoogleAiStudio.to_string(),
            model: self.id().clone(),
            completions: vec![AssistantChatMessage {
                name: None,
                function_call: match function_calls.first() {
                    Some(fc) => Some(fc.clone()),
                    None => None,
                },
                function_calls: match function_calls.len() {
                    0 => None,
                    _ => Some(function_calls),
                },
                role: ChatMessageRole::Assistant,
                content,
            }],
            usage: c.usage_metadata.map(|c| LLMTokenUsage {
                prompt_tokens: c.prompt_token_count.unwrap_or(0) as u64,
                completion_tokens: c.candidates_token_count.unwrap_or(0) as u64,
            }),
            provider_request_id: None,
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
        "contents": json!(messages),
        "generation_config": {
            "temperature": temperature,
            "topP": top_p,
            "topK": top_k,
            "maxOutputTokens": max_tokens,
            "stopSequences": match stop.len() {
                0 => None,
                _ => Some(stop),
            },
        },
        "safety_settings": [
            { "category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_ONLY_HIGH" },
            { "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_ONLY_HIGH" },
            { "category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_ONLY_HIGH" },
            { "category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_ONLY_HIGH" }
        ]
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
                Some(es::SSE::Connected(_)) => {
                    // GoogleAISudio does not return a request id in headers.
                    // Nothing to do.
                }
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

                    if let (Some(parts), Some(sender)) = (
                        completion_candidates[0]
                            .content
                            .as_ref()
                            .and_then(|c| c.parts.as_ref()),
                        event_sender.as_ref(),
                    ) {
                        parts.iter().for_each(|p| {
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
                        });
                    }

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

    let mut full_candidate = Candidate {
        content: Some(Content {
            role: String::from("MODEL"),
            parts: Some(vec![]),
        }),
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

        // Check that we don't have more than one candidate.
        match c
            .candidates
            .as_ref()
            .map(|candidates| candidates.len())
            .unwrap_or_default()
        {
            0 => (),
            1 => (),
            n => Err(anyhow!("Unexpected number of candidates >1: {}", n))?,
        }

        if let Some(candidate) = c.candidates.as_ref().map(|c| c.first()).flatten() {
            // Validate that the role (if any) is MODEL.

            if let Some(c) = candidate.content.as_ref() {
                match c.role.to_uppercase().as_str() {
                    "MODEL" => (),
                    r => Err(anyhow!("Unexpected role in completion: {}", r))?,
                }
            }

            if let Some(r) = candidate.finish_reason.as_ref() {
                full_candidate.finish_reason = Some(r.clone());
            }

            if let Some(parts) = candidate.content.as_ref().and_then(|c| c.parts.as_ref()) {
                for p in parts.iter() {
                    if let Some(t) = p.text.as_ref() {
                        match text_parts.as_mut() {
                            Some(tp) => {
                                tp.text = Some(tp.text.clone().unwrap_or_default() + t.as_str());
                            }
                            None => {
                                text_parts = Some(p.clone());
                            }
                        }
                    }

                    if p.function_call.is_some() {
                        function_call_parts.push(p.clone());
                    }

                    if p.function_response.is_some() {
                        Err(anyhow!("Unexpected function response part in completion"))?;
                    }
                }
            }
        }
    }

    match full_candidate
        .content
        .as_mut()
        .and_then(|c| c.parts.as_mut())
    {
        Some(parts) => {
            if let Some(tp) = text_parts {
                parts.push(tp);
            }
            parts.extend(function_call_parts);
        }
        // This should never happen since we define the `full_candidate` above.
        None => unreachable!(),
    }

    Ok(Completion {
        candidates: Some(vec![full_candidate]),
        usage_metadata,
    })
}
