use crate::providers::embedder::{Embedder, EmbedderVector};
use crate::providers::llm::Tokens;
use crate::providers::llm::{ChatMessage, ChatMessageRole, LLMChatGeneration, LLMGeneration, LLM};
use crate::providers::openai::{completion, streamed_completion};
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
        Ok(format!("https://api.openai.com/v1/completions",).parse::<Uri>()?)
    }

    fn chat_uri(&self) -> Result<Uri> {
        Ok(format!("https://api.openai.com/v1/chat/completions",).parse::<Uri>()?)
    }

    fn tokenizer(&self) -> Arc<Mutex<CoreBPE>> {
        match self.model_id {
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
            None => match tokio::task::spawn_blocking(|| std::env::var("OPENAI_API_KEY")).await? {
                Ok(key) => {
                    self.api_key = Some(key);
                }
                Err(_) => Err(anyhow!(
                    "Credentials or environment variable `AZURE_OPENAI_API_KEY` is not set."
                ))?,
            },
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
        Ok(())
    }

    fn context_size(&self) -> usize {
        match self.model_id {
            Some(model_id) => {
                if model_id.starts_with("gpt-3.5-turbo") {
                    return 4096;
                }
                if model_id.starts_with("gpt-4-32k") {
                    return 32768;
                }
                if model_id.starts_with("gpt-4") {
                    return 8192;
                }
                match model_id.as_str() {
                    "code-davinci-002" => 8000,
                    "text-davinci-002" => 4000,
                    "text-davinci-003" => 4000,
                    _ => 2048,
                }
            }
            None => 2048,
        }
    }

    async fn encode(&self, text: &str) -> Result<Vec<usize>> {
        let tokens = { self.tokenizer().lock().encode_with_special_tokens(text) };
        Ok(tokens)
    }

    async fn decode(&self, tokens: Vec<usize>) -> Result<String> {
        let str = { self.tokenizer().lock().decode(tokens)? };
        Ok(str)
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
                streamed_completion(
                    self.uri()?,
                    self.api_key.clone().unwrap(),
                    None,
                    prompt.clone(),
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
                    prompt.clone(),
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
        })
    }

    async fn chat(
        &self,
        _messages: &Vec<ChatMessage>,
        _temperature: f32,
        _top_p: Option<f32>,
        _n: usize,
        _stop: &Vec<String>,
        _max_tokens: Option<i32>,
        _presence_penalty: Option<f32>,
        _frequency_penalty: Option<f32>,
        _extras: Option<Value>,
        _event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<LLMChatGeneration> {
        Err(anyhow!(
            "Chat capabilties are not implemented for provider `azure_openai`"
        ))
}

pub struct AzureOpenAIProvider {}

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
             (Keys and Endpoint)",
        );
        utils::info("");
        utils::info("Once ready you can check your setup with `dust provider test azure`");

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
        Box::new(AzureOpenAILLM::new(id))
    }

    fn embedder(&self, id: String) -> Box<dyn Embedder + Sync + Send> {
        Box::new(AzureOpenAIEmbedder::new(id))
    }
}
