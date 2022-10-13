use crate::providers::llm::Tokens;
use crate::providers::llm::{LLMGeneration, LLM};
use crate::providers::provider::{ModelError, ModelErrorRetryOptions, Provider, ProviderID};
use crate::run::Credentials;
use crate::utils;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use hyper::{body::Buf, Body, Client, Method, Request, Uri};
use hyper_tls::HttpsConnector;
use itertools::izip;
use lazy_static::lazy_static;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::io::prelude::*;
use std::time::Duration;

// {
//  "id":"4b78fb74-a631-4370-9fd0-d7fba5b4a42c",
//  "generations":[
//    {
//      "text":", an album by Chatham House on Spotify\nHuguenots of New England, an album",
//      "likelihood":-3.063711,
//      "token_likelihoods":[{"token":"hello"},{"token":" world","likelihood":-5.876836},{"token":",","likelihood":-4.151756},{"token":" an","likelihood":-6.5982795},{"token":" album","likelihood":-7.2390523},{"token":" by","likelihood":-0.45501173},{"token":" Ch","likelihood":-6.037514},{"token":"atham","likelihood":-5.3197503},{"token":" House","likelihood":-4.6671867},{"token":" on","likelihood":-1.3503187},{"token":" Spotify","likelihood":-0.048749793},{"token":"\n","likelihood":-0.63467366},{"token":"H","likelihood":-4.282529},{"token":"ug","likelihood":-5.4297037},{"token":"uen","likelihood":-2.9047787},{"token":"ots","likelihood":-0.5460036},{"token":" of","likelihood":-3.0726528},{"token":" New","likelihood":-2.2586355},{"token":" England","likelihood":-2.0952332},{"token":",","likelihood":-0.71053344},{"token":" an","likelihood":-0.4245346},{"token":" album","likelihood":-0.23419714}]
//    }
//  ],
//  "prompt":"hello world"
// }

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TokenLikelihood {
    pub token: String,
    pub likelihood: Option<f32>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Generation {
    pub text: String,
    pub likelihood: Option<f32>,
    pub token_likelihoods: Option<Vec<TokenLikelihood>>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Response {
    pub id: String,
    pub generations: Vec<Generation>,
    pub prompt: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Error {
    pub message: String,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub enum ReturnLikelihoods {
    NONE,
    GENERATION,
    ALL,
}

pub struct CohereLLM {
    id: String,
    api_key: Option<String>,
}

impl CohereLLM {
    pub fn new(id: String) -> Self {
        CohereLLM { id, api_key: None }
    }

    fn uri(&self) -> Result<Uri> {
        Ok(format!("https://api.cohere.ai/generate",).parse::<Uri>()?)
    }

    async fn generate(
        &self,
        prompt: &str,
        max_tokens: Option<i32>,
        temperature: f32,
        num_generations: usize,
        return_likelihoods: ReturnLikelihoods,
        stop: &Vec<String>,
    ) -> Result<Response> {
        assert!(self.api_key.is_some());

        let https = HttpsConnector::new();
        let cli = Client::builder().build::<_, hyper::Body>(https);

        let req = Request::builder()
            .method(Method::POST)
            .uri(self.uri()?)
            .header("Content-Type", "application/json")
            .header("Cohere-Version", "2021-11-08")
            .header(
                "Authorization",
                format!("Bearer {}", self.api_key.clone().unwrap()),
            )
            .body(Body::from(
                json!({
                    "model": self.id.clone(),
                    "prompt": prompt,
                    "max_tokens": max_tokens,
                    "temperature": temperature,
                    "num_generations": num_generations,
                    "return_likelihoods": return_likelihoods,
                    "stop_sequences": match stop.len() {
                        0 => None,
                        _ => Some(stop),
                    },
                })
                .to_string(),
            ))?;

        let res = cli.request(req).await?;

        let body = hyper::body::aggregate(res).await?;
        let mut b: Vec<u8> = vec![];
        body.reader().read_to_end(&mut b)?;
        let c: &[u8] = &b;

        let response: Response = match serde_json::from_slice(c) {
            Ok(c) => Ok(c),
            Err(_) => {
                let error: Error = serde_json::from_slice(c)?;
                match error.message.as_str() {
                    // "requests" => Err(ModelError {
                    //     message: format!(
                    //         "CohereAPIError: {}",
                    //         error.error.message,
                    //     ),
                    //     retryable: Some(ModelErrorRetryOptions {
                    //         sleep: Duration::from_millis(2000),
                    //         factor: 2,
                    //         retries: 8,
                    //     }),
                    // }),
                    _ => Err(ModelError {
                        message: format!("CohereAPIError: {}", error.message,),
                        retryable: None,
                    }),
                }
            }
        }?;

        Ok(response)
    }
}

#[async_trait]
impl LLM for CohereLLM {
    fn id(&self) -> String {
        self.id.clone()
    }

    async fn initialize(&mut self, credentials: Credentials) -> Result<()> {
        match credentials.get("COHERE_API_KEY") {
            Some(api_key) => {
                self.api_key = Some(api_key.clone());
            }
            None => match tokio::task::spawn_blocking(|| std::env::var("COHERE_API_KEY")).await? {
                Ok(key) => {
                    self.api_key = Some(key);
                }
                Err(_) => Err(anyhow!(
                    "Credentials or environment variable `COHERE_API_KEY` is not set."
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
    ) -> Result<LLMGeneration> {
        assert!(n > 0);

        // println!("STOP: {:?}", stop);

        let r = self
            .generate(
                prompt.clone(),
                max_tokens,
                temperature,
                n,
                ReturnLikelihoods::GENERATION,
                stop,
            )
            .await?;

        // println!("RESPONSE: {:?}", r);

        assert!(r.generations.len() > 0);
        assert!(r.generations[0].token_likelihoods.is_some());

        Ok(LLMGeneration {
            created: utils::now(),
            provider: ProviderID::OpenAI.to_string(),
            model: self.id.clone(),
            completions: r
                .generations
                .iter()
                .map(|g| {
                    let logp = g.token_likelihoods.as_ref().unwrap();

                    Tokens {
                        text: g.text.clone(),
                        tokens: Some(logp.iter().map(|l| l.token.clone()).collect()),
                        logprobs: Some(logp.iter().map(|l| l.likelihood).collect()),
                    }
                })
                .collect::<Vec<_>>(),
            prompt: Tokens {
                text: r.prompt,
                tokens: None,
                logprobs: None,
            },
        })
    }
}

pub struct CohereProvider {}

impl CohereProvider {
    pub fn new() -> Self {
        CohereProvider {}
    }
}

#[async_trait]
impl Provider for CohereProvider {
    fn id(&self) -> ProviderID {
        ProviderID::Cohere
    }

    fn setup(&self) -> Result<()> {
        utils::info("Setting up Cohere:");
        utils::info("");
        utils::info(
            "To use Cohere's models, you must set the environment variable `COHERE_API_KEY`.",
        );
        utils::info("Your API key can be found at `https://os.cohere.ai`.");
        utils::info("");
        utils::info("Once ready you can check your setup with `dust provider test cohere`");

        Ok(())
    }

    async fn test(&self) -> Result<()> {
        if !utils::confirm(
            "You are about to make a request for 1 token to `small` on the Cohere API.",
        )? {
            Err(anyhow!("User aborted Cohere test."))?;
        }

        let mut llm = self.llm(String::from("small"));
        llm.initialize(Credentials::new()).await?;

        let _ = llm.generate("Hello 😊", Some(1), 0.7, 1, &vec![]).await?;

        utils::done("Test successfully completed! Cohere is ready to use.");

        Ok(())
    }

    fn llm(&self, id: String) -> Box<dyn LLM + Sync + Send> {
        Box::new(CohereLLM::new(id))
    }
}
