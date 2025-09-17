use crate::providers::anthropic::anthropic::AnthropicProvider;
use crate::providers::azure_openai::AzureOpenAIProvider;
use crate::providers::embedder::Embedder;
use crate::providers::google_ai_studio::GoogleAiStudioProvider;
use crate::providers::llm::LLM;
use crate::providers::mistral::MistralProvider;
use crate::providers::openai::OpenAIProvider;
use crate::utils::ParseError;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use clap::ValueEnum;
use futures::prelude::*;
use serde::{Deserialize, Serialize};
use std::fmt;
use std::str::FromStr;
use std::time::Duration;

use super::deepseek::DeepseekProvider;
use super::fireworks::FireworksProvider;
use super::togetherai::TogetherAIProvider;
use super::xai::XaiProvider;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, ValueEnum, Deserialize)]
#[serde(rename_all = "lowercase")]
#[clap(rename_all = "lowercase")]
pub enum ProviderID {
    OpenAI,
    #[serde(rename = "azure_openai")]
    AzureOpenAI,
    Anthropic,
    Mistral,
    #[serde(rename = "google_ai_studio")]
    GoogleAiStudio,
    TogetherAI,
    Deepseek,
    Fireworks,
    Xai,
}

impl fmt::Display for ProviderID {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ProviderID::OpenAI => write!(f, "openai"),
            ProviderID::AzureOpenAI => write!(f, "azure_openai"),
            ProviderID::Anthropic => write!(f, "anthropic"),
            ProviderID::Mistral => write!(f, "mistral"),
            ProviderID::GoogleAiStudio => write!(f, "google_ai_studio"),
            ProviderID::TogetherAI => write!(f, "togetherai"),
            ProviderID::Deepseek => write!(f, "deepseek"),
            ProviderID::Fireworks => write!(f, "fireworks"),
            ProviderID::Xai => write!(f, "xai"),
        }
    }
}

impl FromStr for ProviderID {
    type Err = ParseError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "openai" => Ok(ProviderID::OpenAI),
            "azure_openai" => Ok(ProviderID::AzureOpenAI),
            "anthropic" => Ok(ProviderID::Anthropic),
            "mistral" => Ok(ProviderID::Mistral),
            "google_ai_studio" => Ok(ProviderID::GoogleAiStudio),
            "togetherai" => Ok(ProviderID::TogetherAI),
            "deepseek" => Ok(ProviderID::Deepseek),
            "fireworks" => Ok(ProviderID::Fireworks),
            "xai" => Ok(ProviderID::Xai),
            _ => Err(ParseError::with_message(
                "Unknown provider ID \
                 (possible values: openai, azure_openai, anthropic, mistral, google_ai_studio, togetherai, deepseek, fireworks, xai)",
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
    pub request_id: Option<String>,
}

impl std::fmt::Display for ModelError {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        write!(
            f,
            "[model_error(retryable={}{})] {}",
            self.retryable.is_some(),
            match self.request_id.as_ref() {
                Some(r) => format!(", request_id={}", r),
                None => String::from(""),
            },
            self.message
        )
    }
}

impl std::error::Error for ModelError {}

pub async fn with_retryable_back_off<F, O>(
    mut f: impl FnMut() -> F,
    log_retry: impl Fn(&str, &Duration, usize) -> (),
    log_model_error: impl Fn(&ModelError) -> (),
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
                    log_model_error(&err);
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
    fn embedder(&self, id: String) -> Box<dyn Embedder + Sync + Send>;
}

pub fn provider(t: ProviderID) -> Box<dyn Provider + Sync + Send> {
    match t {
        ProviderID::Anthropic => Box::new(AnthropicProvider::new()),
        ProviderID::AzureOpenAI => Box::new(AzureOpenAIProvider::new()),
        ProviderID::GoogleAiStudio => Box::new(GoogleAiStudioProvider::new()),
        ProviderID::Mistral => Box::new(MistralProvider::new()),
        ProviderID::OpenAI => Box::new(OpenAIProvider::new()),
        ProviderID::TogetherAI => Box::new(TogetherAIProvider::new()),
        ProviderID::Deepseek => Box::new(DeepseekProvider::new()),
        ProviderID::Fireworks => Box::new(FireworksProvider::new()),
        ProviderID::Xai => Box::new(XaiProvider::new()),
    }
}
