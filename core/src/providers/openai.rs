use crate::providers::llm::Tokens;
use crate::providers::llm::{LLMGeneration, LLM};
use crate::providers::provider::{ModelError, ModelErrorRetryOptions, Provider, ProviderID};
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
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Error {
    pub error: InnerError,
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
            "user": user,
            "stream": true,
        });
        if user.is_some() {
            body["user"] = json!(user);
        }

        // println!("BODY: {}", body.to_string());

        let client = builder
            .body(body.to_string())
            .reconnect(
                es::ReconnectOptions::reconnect(false)
                    .retry_initial(false)
                    .delay(Duration::from_secs(1))
                    .backoff_factor(2)
                    .delay_max(Duration::from_secs(30))
                    .build(),
            )
            .build();

        let mut stream = client.stream();

        let completions: Arc<Mutex<Vec<Completion>>> = Arc::new(Mutex::new(Vec::new()));

        loop {
            match stream.try_next().await {
                Ok(e) => match e {
                    Some(es::SSE::Comment(_)) => {}
                    Some(es::SSE::Event(e)) => match e.data.as_str() {
                        "[DONE]" => {
                            break;
                        }
                        _ => {
                            let completion: Completion = match serde_json::from_str(e.data.as_str())
                            {
                                Ok(c) => Ok(c),
                                Err(e) => Err(anyhow!(
                                    "Error parsing streamed completion from OpenAI: {}",
                                    e
                                )),
                            }?;

                            let index = {
                                let guard = completions.lock();
                                guard.len()
                            };

                            // Only stream if choices is length 1 but should always be the case.
                            if index > 0 {
                                match completion.choices.len() {
                                    1 => {
                                        match event_sender.as_ref() {
                                            Some(sender) => {
                                                let tokens =
                                                    match completion.choices[0].logprobs.as_ref() {
                                                        Some(l) => Some(l.tokens.clone()),
                                                        None => None,
                                                    };
                                                let logprobs =
                                                    match completion.choices[0].logprobs.as_ref() {
                                                        Some(l) => Some(l.token_logprobs.clone()),
                                                        None => None,
                                                    };
                                                let _ = sender.send(json!({
                                                    "type": "tokens",
                                                    "content": {
                                                        "text": completion.choices[0].text.clone(),
                                                        "tokens": tokens,
                                                        "logprobs": logprobs,
                                                    },
                                                }));
                                            }
                                            None => (),
                                        };
                                    }
                                    _ => (),
                                }
                            }
                            completions.lock().push(completion);
                        }
                    },
                    None => {
                        break;
                    }
                },
                Err(e) => {
                    Err(anyhow!("Error streaming tokens from OpenAI: {:?}", e))?;
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

        let res = cli.request(req).await?;

        let body = hyper::body::aggregate(res).await?;
        let mut b: Vec<u8> = vec![];
        body.reader().read_to_end(&mut b)?;
        let c: &[u8] = &b;

        let completion: Completion = match serde_json::from_slice(c) {
            Ok(c) => Ok(c),
            Err(_) => {
                let error: Error = serde_json::from_slice(c)?;
                match error.error._type.as_str() {
                    "requests" => Err(ModelError {
                        message: format!(
                            "OpenAIAPIError: [{}] {}",
                            error.error._type, error.error.message,
                        ),
                        retryable: Some(ModelErrorRetryOptions {
                            sleep: Duration::from_millis(2000),
                            factor: 2,
                            retries: 8,
                        }),
                    }),
                    _ => Err(ModelError {
                        message: format!(
                            "OpenAIAPIError: [{}] {}",
                            error.error._type, error.error.message,
                        ),
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

    async fn generate(
        &self,
        prompt: &str,
        max_tokens: Option<i32>,
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
        utils::info("Your API key can be found at `https://beta.openai.com/account/api-keys`.");
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

        utils::done("Test successfully completed! OpenAI is ready to use.");

        Ok(())
    }

    fn llm(&self, id: String) -> Box<dyn LLM + Sync + Send> {
        Box::new(OpenAILLM::new(id))
    }
}
