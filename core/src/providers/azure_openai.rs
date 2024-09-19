use crate::providers::chat_messages::AssistantChatMessage;
use crate::providers::chat_messages::ChatMessage;
use crate::providers::embedder::{Embedder, EmbedderVector};
use crate::providers::llm::ChatFunction;
use crate::providers::llm::Tokens;
use crate::providers::llm::{LLMChatGeneration, LLMGeneration, LLMTokenUsage, LLM};
use crate::providers::openai::{
    chat_completion, completion, embed, streamed_chat_completion, streamed_completion,
    to_openai_messages, OpenAILLM, OpenAITool, OpenAIToolChoice,
};
use crate::providers::provider::{Provider, ProviderID};
use crate::providers::tiktoken::tiktoken::{batch_tokenize_async, decode_async, encode_async};
use crate::providers::tiktoken::tiktoken::{
    cl100k_base_singleton, p50k_base_singleton, r50k_base_singleton, CoreBPE,
};
use crate::run::Credentials;
use crate::utils;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use hyper::{body::Buf, Uri};
use itertools::izip;
use parking_lot::RwLock;
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::prelude::*;
use std::str::FromStr;
use std::sync::Arc;
use tokio::sync::mpsc::UnboundedSender;

#[derive(Serialize, Deserialize, Debug, Clone)]
struct AzureOpenAIScaleSettings {
    scale_type: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct AzureOpenAIDeployment {
    model: String,
    owner: String,
    id: String,
    status: String,
    created_at: u64,
    updated_at: u64,
    object: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct AzureOpenAIDeployments {
    data: Vec<AzureOpenAIDeployment>,
}

async fn get_deployments(endpoint: &str, api_key: &str) -> Result<Vec<AzureOpenAIDeployment>> {
    let url = format!("{}openai/deployments?api-version=2022-12-01", endpoint);

    let res = reqwest::Client::new()
        .get(url)
        .header("api-key", api_key)
        .send()
        .await?;

    let status = res.status();
    if status != StatusCode::OK {
        Err(anyhow!(
            "Failed to retrieve `azure_openai` Deployments: status_code={}",
            status
        ))?;
    }

    let body = res.bytes().await?;
    let mut b: Vec<u8> = vec![];
    body.reader().read_to_end(&mut b)?;
    let c: &[u8] = &b;

    let deployments: AzureOpenAIDeployments = match serde_json::from_slice(c) {
        Ok(d) => d,
        Err(_) => Err(anyhow!("Failed to retrieve `azure_openai` Deployments"))?,
    };

    Ok(deployments.data)
}

async fn get_deployment(
    endpoint: &str,
    api_key: &str,
    deployment_id: &str,
) -> Result<AzureOpenAIDeployment> {
    let url = format!(
        "{}openai/deployments/{}?api-version=2022-12-01",
        endpoint, deployment_id
    );

    let res = reqwest::Client::new()
        .get(url)
        .header("api-key", api_key)
        .send()
        .await?;

    let status = res.status();
    if status != StatusCode::OK {
        Err(anyhow!(
            "Failed to retrieve `azure_openai` Deployments: status_code={}",
            status
        ))?;
    }
    let body = res.bytes().await?;

    let mut b: Vec<u8> = vec![];
    body.reader().read_to_end(&mut b)?;
    let c: &[u8] = &b;

    let deployment: AzureOpenAIDeployment = match serde_json::from_slice(c) {
        Ok(d) => d,
        Err(_) => Err(anyhow!(
            "Failed to retrieve `azure_openai` Deployment `{}`",
            deployment_id
        ))?,
    };

    Ok(deployment)
}

pub struct AzureOpenAILLM {
    deployment_id: String,
    model_id: Option<String>,
    endpoint: Option<String>,
    api_key: Option<String>,
}

impl AzureOpenAILLM {
    pub fn new(deployment_id: String) -> Self {
        AzureOpenAILLM {
            deployment_id,
            model_id: None,
            endpoint: None,
            api_key: None,
        }
    }

    fn uri(&self) -> Result<Uri> {
        assert!(self.endpoint.is_some());

        Ok(format!(
            "{}openai/deployments/{}/completions?api-version=2023-08-01-preview",
            self.endpoint.as_ref().unwrap(),
            self.deployment_id
        )
        .parse::<Uri>()?)
    }

    #[allow(dead_code)]
    fn chat_uri(&self) -> Result<Uri> {
        Ok(format!(
            "{}openai/deployments/{}/chat/completions?api-version=2023-08-01-preview",
            self.endpoint.as_ref().unwrap(),
            self.deployment_id
        )
        .parse::<Uri>()?)
    }

    fn tokenizer(&self) -> Arc<RwLock<CoreBPE>> {
        match self.model_id.as_ref() {
            Some(model_id) => match model_id.as_str() {
                "code_davinci-002" | "code-cushman-001" => p50k_base_singleton(),
                "text-davinci-002" | "text-davinci-003" => p50k_base_singleton(),
                _ => match model_id.starts_with("gpt-3.5-turbo") || model_id.starts_with("gpt-4") {
                    true => cl100k_base_singleton(),
                    false => r50k_base_singleton(),
                },
            },
            None => r50k_base_singleton(),
        }
    }
}

#[async_trait]
impl LLM for AzureOpenAILLM {
    fn id(&self) -> String {
        self.deployment_id.clone()
    }

    async fn initialize(&mut self, credentials: Credentials) -> Result<()> {
        match credentials.get("AZURE_OPENAI_API_KEY") {
            Some(api_key) => {
                self.api_key = Some(api_key.clone());
            }
            None => {
                match tokio::task::spawn_blocking(|| std::env::var("AZURE_OPENAI_API_KEY")).await? {
                    Ok(key) => {
                        self.api_key = Some(key);
                    }
                    Err(_) => Err(anyhow!(
                        "Credentials or environment variable `AZURE_OPENAI_API_KEY` is not set."
                    ))?,
                }
            }
        }
        match credentials.get("AZURE_OPENAI_ENDPOINT") {
            Some(endpoint) => {
                self.endpoint = Some(endpoint.clone());
            }
            None => match tokio::task::spawn_blocking(|| std::env::var("AZURE_OPENAI_ENDPOINT"))
                .await?
            {
                Ok(endpoint) => {
                    self.endpoint = Some(endpoint);
                }
                Err(_) => Err(anyhow!(
                    "Credentials or environment variable `AZURE_OPENAI_ENDPOINT` is not set."
                ))?,
            },
        }

        let d = get_deployment(
            self.endpoint.as_ref().unwrap(),
            self.api_key.as_ref().unwrap(),
            &self.deployment_id,
        )
        .await?;

        self.model_id = Some(d.model);

        Ok(())
    }

    fn context_size(&self) -> usize {
        match self.model_id.as_ref() {
            Some(model_id) => OpenAILLM::openai_context_size(model_id),
            None => 128000,
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
        assert!(self.model_id.is_some());
        assert!(n > 0);

        if let Some(m) = max_tokens {
            if m == -1 {
                let tokens = self.encode(prompt).await?;
                max_tokens = Some((self.context_size() - tokens.len()) as i32);
            }
        }

        let (c, request_id) = match event_sender {
            Some(_) => {
                streamed_completion(
                    self.uri()?,
                    self.api_key.clone().unwrap(),
                    None,
                    None,
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
                    match extras {
                        Some(e) => match e.get("openai_user") {
                            Some(u) => Some(u.to_string()),
                            None => None,
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
                    None,
                    None,
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
                    match extras {
                        Some(e) => match e.get("openai_user") {
                            Some(u) => Some(u.to_string()),
                            None => None,
                        },
                        None => None,
                    },
                )
                .await?
            }
        };

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
            provider: ProviderID::AzureOpenAI.to_string(),
            model: self.model_id.clone().unwrap(),
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

        let (openai_user, response_format) = match &extras {
            None => (None, None),
            Some(v) => (
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

        let openai_messages = to_openai_messages(messages, &self.model_id.clone().unwrap())?;

        let (c, request_id) = match event_sender {
            Some(_) => {
                streamed_chat_completion(
                    self.chat_uri()?,
                    self.api_key.clone().unwrap(),
                    None,
                    None,
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
                    event_sender,
                )
                .await?
            }
            None => {
                chat_completion(
                    self.chat_uri()?,
                    self.api_key.clone().unwrap(),
                    None,
                    None,
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
            }
        };

        // println!("COMPLETION: {:?}", c);

        assert!(c.choices.len() > 0);

        Ok(LLMChatGeneration {
            created: utils::now(),
            provider: ProviderID::AzureOpenAI.to_string(),
            model: self.model_id.clone().unwrap(),
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

pub struct AzureOpenAIEmbedder {
    deployment_id: String,
    model_id: Option<String>,
    endpoint: Option<String>,
    api_key: Option<String>,
}

impl AzureOpenAIEmbedder {
    pub fn new(deployment_id: String) -> Self {
        AzureOpenAIEmbedder {
            deployment_id,
            model_id: None,
            endpoint: None,
            api_key: None,
        }
    }

    fn uri(&self) -> Result<Uri> {
        assert!(self.endpoint.is_some());

        Ok(format!(
            "{}openai/deployments/{}/embeddings?api-version=2023-08-01-preview",
            self.endpoint.as_ref().unwrap(),
            self.deployment_id
        )
        .parse::<Uri>()?)
    }

    fn tokenizer(&self) -> Arc<RwLock<CoreBPE>> {
        match self.model_id.as_ref() {
            Some(model_id) => match model_id.as_str() {
                "text-embedding-3-small" => cl100k_base_singleton(),
                "text-embedding-3-large-1536" => cl100k_base_singleton(),
                _ => unimplemented!(),
            },
            None => unimplemented!(),
        }
    }
}

#[async_trait]
impl Embedder for AzureOpenAIEmbedder {
    fn id(&self) -> String {
        self.deployment_id.clone()
    }

    async fn initialize(&mut self, credentials: Credentials) -> Result<()> {
        match credentials.get("AZURE_OPENAI_API_KEY") {
            Some(api_key) => {
                self.api_key = Some(api_key.clone());
            }
            None => {
                match tokio::task::spawn_blocking(|| std::env::var("AZURE_OPENAI_API_KEY")).await? {
                    Ok(key) => {
                        self.api_key = Some(key);
                    }
                    Err(_) => Err(anyhow!(
                        "Credentials or environment variable `AZURE_OPENAI_API_KEY` is not set."
                    ))?,
                }
            }
        }
        match credentials.get("AZURE_OPENAI_ENDPOINT") {
            Some(endpoint) => {
                self.endpoint = Some(endpoint.clone());
            }
            None => match tokio::task::spawn_blocking(|| std::env::var("AZURE_OPENAI_ENDPOINT"))
                .await?
            {
                Ok(endpoint) => {
                    self.endpoint = Some(endpoint);
                }
                Err(_) => Err(anyhow!(
                    "Credentials or environment variable `AZURE_OPENAI_ENDPOINT` is not set."
                ))?,
            },
        }

        let d = get_deployment(
            self.endpoint.as_ref().unwrap(),
            self.api_key.as_ref().unwrap(),
            &self.deployment_id,
        )
        .await?;

        // We ensure at initialize that we only use supported models.
        match d.model.as_str() {
            "text-embedding-3-small" => (),
            "text-embedding-3-large-1536" => (),
            _ => Err(anyhow!("Unsupported model: {}", d.model))?,
        }

        self.model_id = Some(d.model);

        Ok(())
    }

    fn context_size(&self) -> usize {
        match self.model_id.as_ref() {
            Some(model_id) => match model_id.as_str() {
                "text-embedding-3-small" => 8191,
                "text-embedding-3-large-1536" => 8191,
                _ => unimplemented!(),
            },
            None => unimplemented!(),
        }
    }

    fn embedding_size(&self) -> usize {
        match self.model_id.as_ref() {
            Some(model_id) => match model_id.as_str() {
                "text-embedding-3-small" => 1536,
                "text-embedding-3-large-1536" => 1536,
                _ => unimplemented!(),
            },
            None => unimplemented!(),
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
            None,
            None,
            text,
            match extras {
                Some(e) => match e.get("openai_user") {
                    Some(u) => Some(u.to_string()),
                    None => None,
                },
                None => None,
            },
        )
        .await?;

        assert!(e.data.len() > 0);

        Ok(e.data
            .into_iter()
            .map(|v| EmbedderVector {
                created: utils::now(),
                provider: ProviderID::OpenAI.to_string(),
                model: match self.model_id {
                    Some(ref model_id) => model_id.clone(),
                    None => unimplemented!(),
                },
                vector: v.embedding,
            })
            .collect::<Vec<_>>())
    }
}

pub struct AzureOpenAIProvider {}

impl AzureOpenAIProvider {
    pub fn new() -> Self {
        AzureOpenAIProvider {}
    }
}

#[async_trait]
impl Provider for AzureOpenAIProvider {
    fn id(&self) -> ProviderID {
        ProviderID::AzureOpenAI
    }

    fn setup(&self) -> Result<()> {
        utils::info("Setting up Azure/OpenAI:");
        utils::info("");
        utils::info(
            "To use Azure OpenAI's models, you must set the environment variables \
             `AZURE_OPENAI_ENDPOINT` and `AZURE_OPENAI_API_KEY`.",
        );
        utils::info(
            "Your endpoint and API key can be found at in your Azure portal \
             (Keys and Endpoint).",
        );
        utils::info("");
        utils::info("Note that Deployment Ids should be used as model Id with `azure_openai`.");
        utils::info("");
        utils::info("Once ready you can check your setup with `dust provider test azure_openai`");

        Ok(())
    }

    async fn test(&self) -> Result<()> {
        // TODO(spolu): list deployments, initialize with deployment ID

        let api_key =
            match tokio::task::spawn_blocking(|| std::env::var("AZURE_OPENAI_API_KEY")).await? {
                Ok(key) => key,
                Err(_) => Err(anyhow!(
                    "Environment variable `AZURE_OPENAI_API_KEY` is not set."
                ))?,
            };

        let endpoint =
            match tokio::task::spawn_blocking(|| std::env::var("AZURE_OPENAI_ENDPOINT")).await? {
                Ok(endpoint) => endpoint,
                Err(_) => Err(anyhow!(
                    "Environment variable `AZURE_OPENAI_ENDPOINT` is not set."
                ))?,
            };

        utils::info("Retrieving deployments...");
        get_deployments(&endpoint, &api_key)
            .await?
            .iter()
            .for_each(|d| {
                utils::info(format!("> Deployment: id={} model={}", d.id, d.model).as_str());
            });

        utils::done("Test successfully completed! Azure OpenAI is ready to use.");

        Ok(())
    }

    fn llm(&self, id: String) -> Box<dyn LLM + Sync + Send> {
        Box::new(AzureOpenAILLM::new(id))
    }

    fn embedder(&self, id: String) -> Box<dyn Embedder + Sync + Send> {
        Box::new(AzureOpenAIEmbedder::new(id))
    }
}
