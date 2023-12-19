use anyhow::{anyhow, Result};
use async_trait::async_trait;
use eventsource_client as es;
use eventsource_client::Client as ESClient;
use futures::TryStreamExt;
use hyper_tls::HttpsConnector;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc::UnboundedSender;
use yup_oauth2::{ServiceAccountAuthenticator, ServiceAccountKey};

use crate::{
    providers::llm::{ChatMessageRole, Tokens},
    run::Credentials,
    utils,
};

use super::{
    embedder::Embedder,
    llm::{ChatFunction, ChatFunctionCall, ChatMessage, LLMChatGeneration, LLMGeneration, LLM},
    provider::{Provider, ProviderID},
    tiktoken::tiktoken::{
        cl100k_base_singleton, decode_async, encode_async, tokenize_async, CoreBPE,
    },
};

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UsageMetadata {
    prompt_token_count: usize,
    candidates_token_count: usize,
    total_token_count: usize,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct VertexAiFunctionResponseContent {
    name: String,
    content: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct VertexAiFunctionResponse {
    name: String,
    response: VertexAiFunctionResponseContent,
}

impl TryFrom<&ChatMessage> for VertexAiFunctionResponse {
    type Error = anyhow::Error;

    fn try_from(m: &ChatMessage) -> Result<Self, Self::Error> {
        Ok(VertexAiFunctionResponse {
            name: m.name.clone().unwrap_or_default(),
            response: VertexAiFunctionResponseContent {
                name: String::from(""),
                content: m.content.clone().unwrap_or_default(),
            },
        })
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct VertexAiFunctionCall {
    name: String,
    args: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Part {
    text: Option<String>,
    function_call: Option<VertexAiFunctionCall>,
    function_response: Option<VertexAiFunctionResponse>,
}

impl TryFrom<&ChatFunctionCall> for VertexAiFunctionCall {
    type Error = anyhow::Error;

    fn try_from(f: &ChatFunctionCall) -> Result<Self, Self::Error> {
        Ok(VertexAiFunctionCall {
            name: f.name.clone(),
            args: f.arguments.clone(),
        })
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Content {
    role: String,
    parts: Vec<Part>,
}

impl TryFrom<&ChatMessage> for Content {
    type Error = anyhow::Error;

    fn try_from(m: &ChatMessage) -> Result<Self, Self::Error> {
        Ok(Content {
            role: match m.role {
                ChatMessageRole::Assistant => String::from("MODEL"),
                ChatMessageRole::Function => match m.function_call {
                    // Role "function" is reserved for function responses.
                    None => String::from("FUNCTION"),
                    // Function calls are done as role "model".
                    Some(_) => String::from("MODEL"),
                },
                _ => String::from("USER"),
            },
            parts: vec![Part {
                text: match m.role {
                    ChatMessageRole::System => Some(format!(
                        "[user: SYSTEM] {}\n",
                        m.content.clone().unwrap_or(String::from(""))
                    )),
                    _ => match m.name {
                        Some(ref name) => Some(format!(
                            "[user: {}] {}",
                            name,
                            m.content.clone().unwrap_or(String::from(""))
                        )),
                        None => Some(m.content.clone().unwrap_or(String::from(""))),
                    },
                },
                function_call: match m.function_call.clone() {
                    Some(function_call) => VertexAiFunctionCall::try_from(&function_call).ok(),
                    None => None,
                },
                function_response: match m.role {
                    ChatMessageRole::Function => VertexAiFunctionResponse::try_from(m).ok(),
                    _ => None,
                },
            }],
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
    candidates: Vec<Candidate>,
    usage_metadata: Option<UsageMetadata>,
}

pub struct GoogleVertexAiProvider {}

impl GoogleVertexAiProvider {
    pub fn new() -> Self {
        GoogleVertexAiProvider {}
    }
}

#[async_trait]
impl Provider for GoogleVertexAiProvider {
    fn id(&self) -> ProviderID {
        ProviderID::GoogleVertexAi
    }

    fn setup(&self) -> Result<()> {
        utils::info("You cannot setup Google Vertex AI from the CLI, sorry.");

        Ok(())
    }

    async fn test(&self) -> Result<()> {
        Err(anyhow!(
            "You cannot test Google Vertex AI from the CLI, sorry."
        ))
    }

    fn llm(&self, id: String) -> Box<dyn LLM + Sync + Send> {
        Box::new(GoogleVertexAiLLM::new(id))
    }

    fn embedder(&self, _id: String) -> Box<dyn Embedder + Sync + Send> {
        unimplemented!()
    }
}

pub struct GoogleVertexAiLLM {
    id: String,
    uri: Option<String>,
    service_account_json: Option<String>,
}

impl GoogleVertexAiLLM {
    pub fn new(id: String) -> Self {
        GoogleVertexAiLLM {
            id,
            uri: None,
            service_account_json: None,
        }
    }

    fn model_endpoint(&self) -> Result<String> {
        match self.uri {
            Some(ref uri) => Ok(format!(
                "{}/publishers/google/models/{}:streamGenerateContent?alt=sse",
                uri, self.id
            )),
            None => Err(anyhow!("URI not set")),
        }
    }

    async fn access_token(&self) -> Result<String> {
        match self.service_account_json {
            None => Err(anyhow!("Service account JSON not set")),
            Some(ref service_account_json) => {
                let service_account_key: ServiceAccountKey =
                    serde_json::from_str(service_account_json)?;

                let auth = ServiceAccountAuthenticator::builder(service_account_key)
                    .build()
                    .await?;

                let scopes = &["https://www.googleapis.com/auth/cloud-platform"];
                let token = auth.token(scopes).await?;

                match token.token() {
                    Some(t) => Ok(t.into()),
                    None => Err(anyhow!("Error getting access token from Google")),
                }
            }
        }
    }

    fn tokenizer(&self) -> Arc<Mutex<CoreBPE>> {
        cl100k_base_singleton()
    }
}

#[async_trait]
impl LLM for GoogleVertexAiLLM {
    fn id(&self) -> String {
        self.id.clone()
    }

    async fn initialize(&mut self, credentials: Credentials) -> Result<()> {
        match credentials.get("GOOGLE_VERTEX_AI_SERVICE_ACCOUNT_JSON") {
            Some(service_account_json) => {
                self.service_account_json = Some(service_account_json.clone());
            }
            None => Err(anyhow!(
                "GOOGLE_VERTEX_AI_SERVICE_ACCOUNT_JSON not found in credentials"
            ))?,
        }
        match credentials.get("GOOGLE_VERTEX_AI_ENDPOINT") {
            Some(uri) => {
                self.uri = Some(uri.clone());
            }
            None => Err(anyhow!("GOOGLE_VERTEX_AI_URI not found in credentials"))?,
        }
        Ok(())
    }

    fn context_size(&self) -> usize {
        8192
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
        assert!(self.service_account_json.is_some());
        assert!(self.uri.is_some());
        assert!(n == 1);

        if frequency_penalty.is_some() {
            Err(anyhow!(
                "Frequency penalty not supported by Google Vertex AI"
            ))?;
        }
        if presence_penalty.is_some() {
            Err(anyhow!(
                "Presence penalty not supported by Google Vertex AI"
            ))?;
        }
        if top_logprobs.is_some() {
            Err(anyhow!("Top logprobs not supported by Google Vertex AI"))?;
        }

        if let Some(m) = max_tokens {
            if m == -1 {
                let tokens = self.encode(prompt).await?;
                max_tokens = Some((self.context_size() - tokens.len()) as i32);
            }
        }

        let api_key = self.access_token().await?;

        let uri = self.model_endpoint()?;

        let c = streamed_chat_completion(
            uri,
            api_key,
            &vec![Content {
                role: String::from("USER"),
                parts: vec![Part {
                    text: Some(String::from(prompt)),
                    function_call: None,
                    function_response: None,
                }],
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
        )
        .await?;

        Ok(LLMGeneration {
            created: utils::now(),
            provider: ProviderID::GoogleVertexAi.to_string(),
            model: self.id().clone(),
            completions: vec![Tokens {
                text: c.candidates[0].content.parts[0]
                    .text
                    .clone()
                    .unwrap_or_default(),
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
        assert!(self.service_account_json.is_some());
        assert!(self.uri.is_some());
        assert!(n == 1);

        if let Some(m) = max_tokens {
            if m == -1 {
                max_tokens = None;
            }
        }

        if functions.len() > 0 || function_call.is_some() {
            Err(anyhow!(
                "Functions on Google Vertex AI are not implemented yet."
            ))?;
        }
        if frequency_penalty.is_some() {
            Err(anyhow!(
                "Frequency penalty not supported by Google Vertex AI"
            ))?;
        }
        if presence_penalty.is_some() {
            Err(anyhow!(
                "Presence penalty not supported by Google Vertex AI"
            ))?;
        }

        let api_key = self.access_token().await?;

        let uri = self.model_endpoint()?;

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
        )
        .await?;

        Ok(LLMChatGeneration {
            created: utils::now(),
            provider: ProviderID::GoogleVertexAi.to_string(),
            model: self.id().clone(),
            completions: vec![ChatMessage {
                name: None,
                function_call: None,
                role: ChatMessageRole::Assistant,
                content: c.candidates[0].content.parts[0].text.clone(),
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
) -> Result<Completion> {
    let https = HttpsConnector::new();
    let url = uri.to_string();

    // Ensure that all input message have one single part.
    messages
        .iter()
        .map(|m| match m.parts.len() {
            0 => Err(anyhow!("Message has no parts")),
            1 => Ok(()),
            _ => Err(anyhow!("Message has more than one part")),
        })
        .collect::<Result<Vec<()>>>()?;

    // Squash user messages.
    // Gemini doesn't allow multiple user messages in a row.
    let messages: Vec<Content> = messages
        .iter()
        .fold(
            // First we merge consecutive user messages by making them a multi-part message.
            Vec::<Content>::new(),
            |mut acc: Vec<Content>, m: &Content| {
                match acc.last_mut() {
                    Some(last) if last.role == m.role && m.role == "USER" => {
                        last.parts.push(Part {
                            text: m.parts[0].text.clone(),
                            function_call: None,
                            function_response: None,
                        });
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
        .map(|m| match m.role.as_str() {
            "USER" => Content {
                role: m.role.clone(),
                parts: vec![Part {
                    text: Some(
                        m.parts
                            .iter()
                            .map(|p| p.text.clone().unwrap_or_default())
                            .collect::<Vec<String>>()
                            .join("\n"),
                    ),
                    function_call: None,
                    function_response: None,
                }],
            },
            _ => m.clone(),
        })
        .collect::<Vec<Content>>();

    let mut builder = match es::ClientBuilder::for_url(url.as_str()) {
        Ok(builder) => builder,
        Err(e) => {
            return Err(anyhow!(
                "Error creating Google Vertex AI streaming client: {:?}",
                e
            ))
        }
    };

    builder = match builder.method(String::from("POST")).header(
        "Authorization",
        format!("Bearer {}", api_key.clone()).as_str(),
    ) {
        Ok(b) => b,
        Err(_) => return Err(anyhow!("Error creating streamed client to Vertex AI")),
    };

    builder = match builder.header("Content-Type", "application/json") {
        Ok(b) => b,
        Err(_) => return Err(anyhow!("Error creating streamed client to Vertex AI")),
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
                    if completion.candidates.len() != 1 {
                        Err(anyhow!(
                            "Unexpected number of candidates: {}",
                            completion.candidates.len()
                        ))?;
                    }
                    if completion.candidates[0].content.parts.len() != 1 {
                        Err(anyhow!(
                            "Unexpected number of parts: {}",
                            completion.candidates[0].content.parts.len()
                        ))?;
                    }

                    match event_sender.as_ref() {
                        Some(sender) => {
                            // let text = completion.candidates[0].content.parts[0].text.clone();
                            match completion.candidates[0].content.parts[0].text.clone() {
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
                            match completion.candidates[0].content.parts[0]
                                .function_call
                                .clone()
                            {
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
                    }

                    completions.lock().push(completion);
                }
                None => {
                    break 'stream;
                }
            },
            Err(e) => match e {
                es::Error::Eof => break 'stream,
                _ => {
                    Err(anyhow!("Error streaming tokens from Vertex AI: {:?}", e))?;
                    break 'stream;
                }
            },
        }
    }

    let candidate = completions.lock()[0].candidates[0].clone();
    let completions_lock = completions.lock();

    Ok(Completion {
        candidates: vec![Candidate {
            content: Content {
                role: candidate.content.role.clone(),
                parts: vec![completions_lock.iter().fold(
                    Part {
                        text: None,
                        function_call: None,
                        function_response: None,
                    },
                    |mut acc, c| {
                        // If there is text, we merge it.
                        if c.candidates[0].content.parts[0].text.is_some() {
                            acc.text = c.candidates[0].content.parts[0].text.clone();
                        }
                        // If there is a function call, we use the name if we don't have one,
                        // and we append the arguments.
                        if let Some(f) = c.candidates[0].content.parts[0].function_call.clone() {
                            let mut function_call = acc.function_call.clone().unwrap_or(f.clone());
                            if function_call.name.len() == 0 {
                                function_call.name = f.name.clone();
                            }
                            if f.args.len() > 0 {
                                function_call.args.push_str(format!(" {}", f.args).as_str());
                            }
                            acc.function_call = function_call.into();
                        }

                        acc
                    },
                )],
            },
            finish_reason: completions_lock
                .iter()
                .find_map(|c| c.candidates[0].finish_reason.clone()),
        }],
        usage_metadata: completions_lock
            .iter()
            .find_map(|c| c.usage_metadata.clone()),
    })
}
