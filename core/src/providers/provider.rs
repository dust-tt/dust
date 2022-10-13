use crate::providers::llm::LLM;
use crate::providers::openai::OpenAIProvider;
use crate::providers::cohere::CohereProvider;
use crate::utils::ParseError;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use futures::prelude::*;
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use std::time::Duration;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Deserialize)]
pub enum ProviderID {
    OpenAI,
    Cohere,
}

impl ToString for ProviderID {
    fn to_string(&self) -> String {
        match self {
            ProviderID::OpenAI => String::from("openai"),
            ProviderID::Cohere => String::from("cohere"),
        }
    }
}

impl FromStr for ProviderID {
    type Err = ParseError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "openai" => Ok(ProviderID::OpenAI),
            "cohere" => Ok(ProviderID::Cohere),
            _ => Err(ParseError::with_message(
                "Unknown provider ID (possible values: openai)",
            ))?,
        }
    }
}

#[derive(Debug, Clone)]
pub struct ModelErrorRetryOptions {
    pub sleep: Duration,
    pub factor: u32,
    pub retries: usize,
}

#[derive(Debug)]
pub struct ModelError {
    pub message: String,
    pub retryable: Option<ModelErrorRetryOptions>,
}

impl std::fmt::Display for ModelError {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        write!(
            f,
            "[model_error(retryable={})] {}",
            self.retryable.is_some(),
            self.message
        )
    }
}

impl std::error::Error for ModelError {}

pub async fn with_retryable_back_off<F, O>(
    mut f: impl FnMut() -> F,
    log_retry: impl Fn(&str, &Duration, usize) -> (),
) -> Result<O>
where
    F: Future<Output = Result<O, anyhow::Error>>,
{
    let mut attempts = 0_usize;
    let mut sleep: Option<Duration> = None;
    let out = loop {
        match f().await {
            Err(e) => match e.downcast::<ModelError>() {
                Ok(err) => {
                    match err.retryable.clone() {
                        Some(retry) => {
                            attempts += 1;
                            sleep = match sleep {
                                None => Some(retry.sleep),
                                Some(b) => Some(b * retry.factor),
                            };
                            log_retry(&err.message, sleep.as_ref().unwrap(), attempts);
                            tokio::time::sleep(sleep.unwrap()).await;
                            if attempts > retry.retries {
                                break Err(anyhow!(
                                    "Too many retries ({}): {}",
                                    retry.retries,
                                    err
                                ));
                            }
                        }
                        None => {
                            break Err(anyhow!("{}", err));
                        }
                    };
                }
                Err(err) => break Err(err),
            },
            Ok(out) => break Ok(out),
        }
    };
    out
}

#[async_trait]
pub trait Provider {
    fn id(&self) -> ProviderID;

    fn setup(&self) -> Result<()>;
    async fn test(&self) -> Result<()>;

    fn llm(&self, id: String) -> Box<dyn LLM + Sync + Send>;
}

pub fn provider(t: ProviderID) -> Box<dyn Provider + Sync + Send> {
    match t {
        ProviderID::OpenAI => Box::new(OpenAIProvider::new()),
        ProviderID::Cohere => Box::new(CohereProvider::new()),
    }
}

pub async fn cmd_setup(t: ProviderID) -> Result<()> {
    provider(t).setup()
}

pub async fn cmd_test(t: ProviderID) -> Result<()> {
    provider(t).test().await
}
