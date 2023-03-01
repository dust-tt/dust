use crate::providers::embedder::{Embedder, EmbedderVector};
use crate::providers::llm::Tokens;
use crate::providers::llm::{LLMGeneration, LLM, ChatGeneration, ChatMessage};
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
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc::UnboundedSender;
use tokio::time::timeout;

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

    fn tokenizer(&self) -> Arc<Mutex<CoreBPE>> {
        match self.id.as_str() {
            "code_davinci-002" | "code-cushman-001" => p50k_base_singleton(),
            "text-davinci-002" | "text-davinci-003" => p50k_base_singleton(),
            _ => r50k_base_singleton(),
        }
    }

    async fn streamed_completion(
        &self,
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
        assert!(self.api_key.is_some());

        let url = self.uri()?.to_string();

        let builder = match es::ClientBuilder::for_url(url.as_str()) {
            Ok(b) => b,
            Err(_) => return Err(anyhow!("Error creating streamed client to OpenAI")),
        };
        let builder = match builder.method(String::from("POST")).header(
            "Authorization",
            format!("Bearer {}", self.api_key.clone().unwrap()).as_str(),
        ) {
            Ok(b) => b,
            Err(_) => return Err(anyhow!("Error creating streamed client to OpenAI")),
        };
        let builder = match builder.header("Content-Type", "application/json") {
            Ok(b) => b,
            Err(_) => return Err(anyhow!("Error creating streamed client to OpenAI")),
        };

        let mut body = json!({
            "model": self.id.clone(),
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

                            let completion: Completion = match serde_json::from_str(e.data.as_str())
                            {
                                Ok(c) => c,
                                Err(err) => {
                                    let error: Result<Error, _> =
                                        serde_json::from_str(e.data.as_str());
                                    match error {
                                        Ok(error) => {
                                            println!("ERROR HERE1: {:?}", error);
                                            match error.retryable_streamed() && index == 0 {
                                                true => {
                                                    println!("ERROR HERE2: {:?}", error);
                                                    Err(ModelError {
                                                        message: error.message(),
                                                        retryable: Some(ModelErrorRetryOptions {
                                                            sleep: Duration::from_millis(100),
                                                            factor: 2,
                                                            retries: 3,
                                                        }),
                                                    })?
                                                }
                                                false => {
                                                    println!("ERROR HERE3: {:?}", error);
                                                    Err(ModelError {
                                                        message: error.message(),
                                                        retryable: None,
                                                    })?
                                                }
                                            }
                                            break 'stream;
                                        }
                                        Err(_) => {
                                            println!("ERROR HERE4: {:?}", error);
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
                                    let mut logprobs = match completion.choices[0].logprobs.as_ref()
                                    {
                                        Some(l) => Some(l.token_logprobs.clone()),
                                        None => None,
                                    };
                                    let text_offset = match completion.choices[0].logprobs.as_ref()
                                    {
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
                    println!("ERROR HERE5: {:?}", e);
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
                                    Some(c_top_logprobs) => {
                                        match a_logprobs.top_logprobs.as_ref() {
                                            Some(a_top_logprobs) => {
                                                c_top_logprobs.extend(a_top_logprobs.clone());
                                            }
                                            None => (),
                                        }
                                    }
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

    async fn completion(
        &self,
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
        assert!(self.api_key.is_some());

        let https = HttpsConnector::new();
        let cli = Client::builder().build::<_, hyper::Body>(https);

        let mut body = json!({
            "model": self.id.clone(),
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
        });
        if user.is_some() {
            body["user"] = json!(user);
        }

        // println!("BODY: {}", body.to_string());

        let req = Request::builder()
            .method(Method::POST)
            .uri(self.uri()?)
            .header("Content-Type", "application/json")
            .header(
                "Authorization",
                format!("Bearer {}", self.api_key.clone().unwrap()),
            )
            // TODO(spolu): add support for custom organizations
            // .header("OpenAI-Organization", "openai")
            .body(Body::from(body.to_string()))?;

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
        match self.id.as_str() {
            "code-davinci-002" => 8000,
            "text-davinci-002" => 4000,
            "text-davinci-003" => 4000,
            _ => 2048,
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
                self.streamed_completion(
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
                self.completion(
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
        messages: Vec<ChatMessage>,
        temperature: f32,
        top_p: Option<f32>,
        n: usize,
        stop: &Vec<String>,
        presence_penalty: Option<f32>,
        frequency_penalty: Option<f32>,
        extras: Option<Value>,
        event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<ChatGeneration> {
        unimplemented!()
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Embedding {
    pub embedding: Vec<f64>,
    pub index: u64,
    pub object: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Usage {
    pub prompt_tokens: u64,
    pub total_tokens: u64,
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

    async fn embed(&self, text: &str, user: Option<String>) -> Result<Embeddings> {
        assert!(self.api_key.is_some());

        let https = HttpsConnector::new();
        let cli = Client::builder().build::<_, hyper::Body>(https);

        let mut body = json!({
            "model": self.id.clone(),
            "input": text,
        });
        if user.is_some() {
            body["user"] = json!(user);
        }

        // println!("BODY: {}", body.to_string());

        let req = Request::builder()
            .method(Method::POST)
            .uri(self.uri()?)
            .header("Content-Type", "application/json")
            .header(
                "Authorization",
                format!("Bearer {}", self.api_key.clone().unwrap()),
            )
            // TODO(spolu): add support for custom organizations
            // .header("OpenAI-Organization", "openai")
            .body(Body::from(body.to_string()))?;

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
        let tokens = { self.tokenizer().lock().encode_with_special_tokens(text) };
        Ok(tokens)
    }

    async fn decode(&self, tokens: Vec<usize>) -> Result<String> {
        let str = { self.tokenizer().lock().decode(tokens)? };
        Ok(str)
    }

    async fn embed(&self, text: &str, extras: Option<Value>) -> Result<EmbedderVector> {
        let e = self
            .embed(
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
        // println!("EMBEDDING: {:?}", e);

        Ok(EmbedderVector {
            created: utils::now(),
            provider: ProviderID::OpenAI.to_string(),
            model: self.id.clone(),
            vector: e.data[0].embedding.clone(),
        })
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

        let mut embedder = self.embedder(String::from("text-embedding-ada-002"));
        embedder.initialize(Credentials::new()).await?;

        let _v = embedder.embed("Hello 😊", None).await?;
        // println!("EMBEDDING SIZE: {}", v.vector.len());

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
