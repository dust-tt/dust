use anyhow::{anyhow, Result};
use async_trait::async_trait;
use eventsource_client as es;
use eventsource_client::Client as ESClient;
use futures::TryStreamExt;
use hyper_tls::HttpsConnector;
use parking_lot::{Mutex, RwLock};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc::UnboundedSender;

use crate::{providers::llm::Tokens, run::Credentials, utils};

use super::{
    embedder::Embedder,
    llm::{
        ChatFunction, ChatFunctionCall, ChatMessage, ChatMessageRole, LLMChatGeneration,
        LLMGeneration, LLM,
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
    prompt_token_count: usize,
    candidates_token_count: Option<usize>,
    total_token_count: usize,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GoogleAiStudioFunctionResponseContent {
    name: String,
    content: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GoogleAiStudioFunctionResponse {
    name: String,
    response: GoogleAiStudioFunctionResponseContent,
}

impl TryFrom<&ChatMessage> for GoogleAiStudioFunctionResponse {
    type Error = anyhow::Error;

    fn try_from(m: &ChatMessage) -> Result<Self, Self::Error> {
        let name = m.name.clone().unwrap_or_default();
        Ok(GoogleAiStudioFunctionResponse {
            name: name.clone(),
            response: GoogleAiStudioFunctionResponseContent {
                name: name,
                content: m.content.clone().unwrap_or_default(),
            },
        })
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GoogleAiStudioFunctionCall {
    name: String,
    args: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Part {
    text: Option<String>,
    function_call: Option<GoogleAiStudioFunctionCall>,
    function_response: Option<GoogleAiStudioFunctionResponse>,
}

impl TryFrom<&ChatFunctionCall> for GoogleAiStudioFunctionCall {
    type Error = anyhow::Error;

    fn try_from(f: &ChatFunctionCall) -> Result<Self, Self::Error> {
        Ok(GoogleAiStudioFunctionCall {
            name: f.name.clone(),
            args: f.arguments.clone(),
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
        Ok(Content {
            role: match m.role {
                ChatMessageRole::Assistant => String::from("MODEL"),
                ChatMessageRole::Function => match m.function_call {
                    // Role "function" is reserved for function responses.
                    None if USE_FUNCTION_CALLING => String::from("FUNCTION"),
                    None => String::from("USER"),
                    // Function calls are done as role "model".
                    Some(_) => String::from("MODEL"),
                },
                _ => String::from("USER"),
            },
            parts: Some(vec![Part {
                text: match m.role {
                    ChatMessageRole::System => Some(format!(
                        "[user: SYSTEM] {}\n",
                        m.content.clone().unwrap_or(String::from(""))
                    )),
                    ChatMessageRole::User => match m.name {
                        Some(ref name) => Some(format!(
                            "[user: {}] {}",
                            name,
                            m.content.clone().unwrap_or(String::from(""))
                        )),
                        None => Some(m.content.clone().unwrap_or(String::from(""))),
                    },
                    ChatMessageRole::Function if USE_FUNCTION_CALLING => None,
                    ChatMessageRole::Function => match m.name {
                        Some(ref name) => Some(format!(
                            "[function_result: {}] {}",
                            name,
                            m.content.clone().unwrap_or(String::from(""))
                        )),
                        None => Some(format!(
                            "[function_result] {}",
                            m.content.clone().unwrap_or(String::from(""))
                        )),
                    },
                    ChatMessageRole::Assistant => {
                        Some(m.content.clone().unwrap_or(String::from("")))
                    }
                },
                function_call: match m.function_call.clone() {
                    Some(function_call) if USE_FUNCTION_CALLING => {
                        GoogleAiStudioFunctionCall::try_from(&function_call).ok()
                    }
                    _ => None,
                },
                function_response: match m.role {
                    ChatMessageRole::Function if USE_FUNCTION_CALLING => {
                        GoogleAiStudioFunctionResponse::try_from(m).ok()
                    }
                    _ => None,
                },
            }]),
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
        utils::info("You cannot setup Google AI Studio from the CLI, sorry.");

        Ok(())
    }

    async fn test(&self) -> Result<()> {
        Err(anyhow!(
            "You cannot test Google AI Studio from the CLI, sorry."
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
            Err(anyhow!(
                "Frequency penalty not supported by Google AI Studio"
            ))?;
        }
        if presence_penalty.is_some() {
            Err(anyhow!(
                "Presence penalty not supported by Google AI Studio"
            ))?;
        }
        if top_logprobs.is_some() {
            Err(anyhow!("Top logprobs not supported by Google AI Studio"))?;
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
            &vec![],
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
            Err(anyhow!(
                "Frequency penalty not supported by Google AI Studio"
            ))?;
        }
        if presence_penalty.is_some() {
            Err(anyhow!(
                "Presence penalty not supported by Google AI Studio"
            ))?;
        }

        if let Some(m) = max_tokens {
            if m == -1 {
                max_tokens = None;
            }
        }

        if functions.len() > 0 || function_call.is_some() {
            if USE_FUNCTION_CALLING {
                unimplemented!("Functions on Google AI Studio are not implemented yet.");
            }
            Err(anyhow!("Functions on Google AI Studio are disabled."))?;
        }

        if frequency_penalty.is_some() {
            Err(anyhow!(
                "Frequency penalty not supported by Google AI Studio"
            ))?;
        }
        if presence_penalty.is_some() {
            Err(anyhow!(
                "Presence penalty not supported by Google AI Studio"
            ))?;
        }

        let uri = self.model_endpoint();

        let c = streamed_chat_completion(
            uri,
            api_key,
            &messages
                .iter()
                .map(|m| Content::try_from(m))
                .collect::<Result<Vec<Content>>>()?,
            &vec![],
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

        Ok(LLMChatGeneration {
            created: utils::now(),
            provider: ProviderID::GoogleAiStudio.to_string(),
            model: self.id().clone(),
            completions: vec![ChatMessage {
                name: None,
                function_call: None,
                role: ChatMessageRole::Assistant,
                content: match c.candidates {
                    None => None,
                    Some(candidates) => match candidates.len() {
                        0 => None,
                        _ => match &candidates[0].content.parts {
                            None => None,
                            Some(parts) => match parts.len() {
                                0 => None,
                                _ => match &parts[0].text {
                                    None => None,
                                    Some(text) => Some(text.clone()),
                                },
                            },
                        },
                    },
                },
            }],
        })
    }
}

pub async fn streamed_chat_completion(
    uri: String,
    api_key: String,
    messages: &Vec<Content>,
    _functions: &Vec<ChatFunction>,
    _function_call: Option<String>,
    temperature: f32,
    stop: &Vec<String>,
    max_tokens: Option<i32>,
    top_p: f32,
    top_k: Option<usize>,
    event_sender: Option<UnboundedSender<Value>>,
    use_header_auth: bool,
) -> Result<Completion> {
    let https = HttpsConnector::new();
    let url = match use_header_auth {
        true => uri.to_string(),
        false => format!("{}&key={}", uri, api_key),
    };

    // Ensure that all input message have one single part.
    messages
        .iter()
        .map(|m| match &m.parts {
            None => Err(anyhow!("Message has no parts")),
            Some(parts) => match parts.len() {
                0 => Err(anyhow!("Message has no parts")),
                1 => Ok(()),
                _ => Err(anyhow!("Message has more than one part")),
            },
        })
        .collect::<Result<Vec<()>>>()?;

    // Squash user messages.
    // Gemini doesn't allow multiple user or assistant messages in a row.
    let messages: Vec<Content> = messages
        .iter()
        .fold(
            // First we merge consecutive user/assistant messages by making them a multi-part message.
            Vec::<Content>::new(),
            |mut acc: Vec<Content>, m: &Content| {
                match acc.last_mut() {
                    Some(last)
                        if last.role == m.role
                            && ["MODEL", "USER"].contains(&m.role.to_uppercase().as_str()) =>
                    {
                        if last.parts.is_none() {
                            last.parts = Some(vec![]);
                        }
                        if let Some(last_parts) = &mut last.parts {
                            if let Some(m_parts) = &m.parts {
                                last_parts.extend(m_parts.iter().cloned());
                            }
                        }
                    }
                    _ => {
                        acc.push(m.clone());
                    }
                }
                acc
            },
        )
        .iter()
        // Then we squash the parts together.
        .map(|m| match m.role.to_uppercase().as_str() {
            "USER" | "MODEL" => {
                let parts_text = m.parts.as_ref().map(|parts| {
                    parts
                        .iter()
                        .map(|p| p.text.clone().unwrap_or_default())
                        .collect::<Vec<String>>()
                        .join("\n")
                });

                Content {
                    role: m.role.clone(),
                    parts: Some(vec![Part {
                        text: parts_text,
                        function_call: None,
                        function_response: None,
                    }]),
                }
            }
            _ => m.clone(),
        })
        .collect::<Vec<Content>>();

    let mut builder = match es::ClientBuilder::for_url(url.as_str()) {
        Ok(builder) => builder,
        Err(e) => {
            return Err(anyhow!(
                "Error creating Google AI Studio streaming client: {:?}",
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
            Err(_) => {
                return Err(anyhow!(
                    "Error creating streamed client to Google AI Studio"
                ))
            }
        };
    }

    builder = match builder.header("Content-Type", "application/json") {
        Ok(b) => b,
        Err(_) => {
            return Err(anyhow!(
                "Error creating streamed client to Google AI Studio"
            ))
        }
    };

    let body = json!({
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
        .build_with_conn(https);

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

                    match parts.len() {
                        0 => {
                            completions.lock().push(completion);
                            continue 'stream;
                        }
                        1 => (),
                        n => {
                            Err(anyhow!("Unexpected number of parts: {}", n))?;
                        }
                    };

                    match event_sender.as_ref() {
                        Some(sender) => {
                            let text = parts[0].text.clone();
                            match text {
                                Some(t) => {
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

                            let function_call = parts[0].function_call.clone();
                            match function_call {
                                Some(f) => {
                                    let _ = sender.send(json!({
                                        "type": "function_call",
                                        "content": {
                                            "name": f.name,
                                        }
                                    }));
                                    let _ = sender.send(json!({
                                        "type": "function_call_arguments_tokens",
                                        "content": {
                                            "text": f.args,
                                        }
                                    }));
                                }
                                None => (),
                            }
                        }

                        _ => (),
                    };

                    completions.lock().push(completion);
                }
                None => {
                    break 'stream;
                }
            },
            Err(e) => match e {
                es::Error::Eof => break 'stream,
                _ => {
                    Err(anyhow!(
                        "Error streaming tokens from Google AI Studio: {:?}",
                        e
                    ))?;
                    break 'stream;
                }
            },
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

    // Ensure that we don't have a mix of `function_call` and `text` in the same completion.
    // Ensure that all the roles are "MODEL"
    // We merge all the completions texts together.
    let mut full_completion_text = String::from("");
    let mut function_call_name = String::from("");
    let mut function_call_args = String::from("");
    let mut finish_reason = String::from("");
    let mut usage_metadata = UsageMetadata {
        prompt_token_count: 0,
        candidates_token_count: None,
        total_token_count: 0,
    };
    for c in completions_lock.iter() {
        match &c.usage_metadata {
            None => (),
            Some(um) => {
                usage_metadata.prompt_token_count = um.prompt_token_count;
                usage_metadata.candidates_token_count = um.candidates_token_count;
                usage_metadata.total_token_count = um.total_token_count;
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
                            finish_reason = r.clone();
                        }
                    }

                    let parts = candidates[0].content.parts.clone().unwrap_or_default();

                    match &parts.len() {
                        0 => (),
                        1 => {
                            match &parts[0].text.clone() {
                                Some(t) => {
                                    if function_call_name.len() > 0 || function_call_args.len() > 0
                                    {
                                        Err(anyhow!("Unexpected text in function call"))?;
                                    }
                                    full_completion_text.push_str(t.as_str());
                                }
                                None => (),
                            };
                            match parts[0].function_call.clone() {
                                Some(f) => {
                                    if full_completion_text.len() > 0 {
                                        Err(anyhow!("Unexpected function call in text"))?;
                                    }
                                    match f.name.len() {
                                        0 => (),
                                        _ if function_call_name.is_empty() => {
                                            function_call_name = f.name.clone();
                                        }
                                        _ => {
                                            if function_call_name != f.name {
                                                Err(anyhow!("Function call name mismatch"))?;
                                            }
                                        }
                                    }
                                    match f.args.len() {
                                        0 => (),
                                        _ if function_call_args.is_empty() => {
                                            function_call_args.push_str(f.args.as_str());
                                        }
                                        _ => (),
                                    }
                                }
                                None => (),
                            }
                        }
                        _ => (),
                    }
                }
                _ => Err(anyhow!("Unexpected number of candidates"))?,
            },
        }
    }

    if finish_reason.len() == 0 {
        Err(anyhow!("No finish reason"))?;
    }

    if function_call_name.len() == 0 && full_completion_text.len() == 0 {
        Err(anyhow!("No text and no function call"))?;
    }

    Ok(Completion {
        candidates: Some(vec![Candidate {
            content: Content {
                role: String::from("MODEL"),
                parts: Some(vec![Part {
                    text: match full_completion_text.len() {
                        0 => None,
                        _ => Some(full_completion_text),
                    },
                    function_call: match function_call_name.len() {
                        0 => None,
                        _ => Some(GoogleAiStudioFunctionCall {
                            name: function_call_name,
                            args: function_call_args,
                        }),
                    },
                    function_response: None,
                }]),
            },
            finish_reason: Some(finish_reason),
        }]),
        usage_metadata: Some(usage_metadata),
    })
}
