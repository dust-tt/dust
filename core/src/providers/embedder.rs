use std::fmt;

use crate::cached_request::CachedRequest;
use crate::providers::provider::{provider, with_retryable_back_off, ProviderID};
use crate::run::Credentials;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use clap::ValueEnum;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tracing::{error, info};

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct EmbedderVector {
    pub created: u64,
    pub provider: String,
    pub model: String,
    pub vector: Vec<f64>,
}

#[async_trait]
pub trait Embedder {
    fn id(&self) -> String;

    async fn initialize(&mut self, credentials: Credentials) -> Result<()>;

    fn context_size(&self) -> usize;
    fn embedding_size(&self) -> usize;

    async fn encode(&self, text: &str) -> Result<Vec<usize>>;
    async fn decode(&self, tokens: Vec<usize>) -> Result<String>;
    async fn tokenize(&self, texts: Vec<String>) -> Result<Vec<Vec<(usize, String)>>>;

    async fn embed(&self, text: Vec<&str>, extras: Option<Value>) -> Result<Vec<EmbedderVector>>;
}

impl CachedRequest for EmbedderRequest {
    /// The version of the cache. This should be incremented whenever the inputs or
    /// outputs of the request are changed, to ensure that the cached data is invalidated.
    const VERSION: i32 = 1;

    const REQUEST_TYPE: &'static str = "embedder";
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct EmbedderRequest {
    hash: String,
    provider_id: ProviderID,
    model_id: String,
    text: Vec<String>,
    extras: Option<Value>,
}

impl EmbedderRequest {
    pub fn new(
        provider_id: ProviderID,
        model_id: &str,
        text: Vec<&str>,
        extras: Option<Value>,
    ) -> Self {
        let mut hasher = blake3::Hasher::new();
        hasher.update(provider_id.to_string().as_bytes());
        hasher.update(model_id.as_bytes());
        hasher.update(EmbedderRequest::version().to_string().as_bytes());

        text.iter().for_each(|s| {
            hasher.update(s.as_bytes());
        });
        if !extras.is_none() {
            hasher.update(extras.clone().unwrap().to_string().as_bytes());
        }

        Self {
            hash: format!("{}", hasher.finalize().to_hex()),
            provider_id,
            model_id: String::from(model_id),
            text: text
                .into_iter()
                .map(|s| String::from(s))
                .collect::<Vec<_>>(),
            extras,
        }
    }

    pub fn hash(&self) -> &str {
        &self.hash
    }

    pub async fn execute(&self, credentials: Credentials) -> Result<Vec<EmbedderVector>> {
        let mut embedder = provider(self.provider_id).embedder(self.model_id.clone());
        embedder.initialize(credentials).await?;

        let out = with_retryable_back_off(
            || {
                embedder.embed(
                    self.text.iter().map(|s| s.as_str()).collect::<Vec<_>>(),
                    self.extras.clone(),
                )
            },
            |err_msg, sleep, attempts| {
                info!(
                    provider_id = self.provider_id.to_string(),
                    model_id = self.model_id,
                    attempts = attempts,
                    sleep = sleep.as_millis(),
                    err_msg = err_msg,
                    "Retry querying"
                );
            },
            |err| {
                error!(
                    provider_id = self.provider_id.to_string(),
                    model_id = self.model_id,
                    err_msg = err.message,
                    request_id = err.request_id.as_deref().unwrap_or(""),
                    "EmbedderRequest model error",
                );
            },
        )
        .await;

        match out {
            Ok(c) => {
                info!(
                    provider_id = self.provider_id.to_string(),
                    model_id = self.model_id,
                    chunk_count = self.text.len(),
                    total_text_length = self.text.iter().fold(0, |acc, s| acc + s.len()),
                    "Success querying"
                );
                Ok(c)
            }
            Err(e) => Err(anyhow!(
                "Error querying `{}:{}`: error={}",
                self.provider_id.to_string(),
                self.model_id,
                e.to_string(),
            )),
        }
    }

    // pub async fn execute_with_cache(
    //     &self,
    //     credentials: Credentials,
    //     project: Project,
    //     store: Box<dyn Store + Send + Sync>,
    //     use_cache: bool,
    // ) -> Result<EmbedderVector> {
    //     let embedding = {
    //         match use_cache {
    //             false => None,
    //             true => {
    //                 let mut embeddings = store.embedder_cache_get(&project, self).await?;
    //                 match embeddings.len() {
    //                     0 => None,
    //                     _ => Some(embeddings.remove(0)),
    //                 }
    //             }
    //         }
    //     };

    //     match embedding {
    //         Some(embedding) => Ok(embedding),
    //         None => {
    //             let embedding = self.execute(credentials).await?;
    //             store
    //                 .embedder_cache_store(&project, self, &embedding)
    //                 .await?;
    //             Ok(embedding)
    //         }
    //     }
    // }
}

#[derive(Debug, ValueEnum, Clone, PartialEq)]
pub enum SupportedEmbedderModels {
    #[clap(name = "text-embedding-3-large-1536")]
    TextEmbedding3Large1536,
    #[clap(name = "mistral-embed")]
    MistralEmbed,
}

impl fmt::Display for SupportedEmbedderModels {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SupportedEmbedderModels::TextEmbedding3Large1536 => {
                write!(f, "text-embedding-3-large-1536")
            }
            SupportedEmbedderModels::MistralEmbed => {
                write!(f, "mistral-embed")
            }
        }
    }
}

// Custom type to map provider to models.
pub struct EmbedderProvidersModelMap;

impl EmbedderProvidersModelMap {
    fn get_models(provider: &ProviderID) -> Result<Vec<SupportedEmbedderModels>> {
        match provider {
            &ProviderID::OpenAI => Ok(vec![SupportedEmbedderModels::TextEmbedding3Large1536]),
            &ProviderID::Mistral => Ok(vec![SupportedEmbedderModels::MistralEmbed]),
            _ => Err(anyhow!("Provider not supported for embeddings.")),
        }
    }

    pub fn is_model_supported(provider: &ProviderID, model: &SupportedEmbedderModels) -> bool {
        if let Ok(models) = Self::get_models(provider) {
            models.contains(model)
        } else {
            false
        }
    }
}
