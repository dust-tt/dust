use crate::project::Project;
use crate::providers::provider::{provider, with_retryable_back_off, ProviderID};
use crate::run::Credentials;
use crate::stores::store::Store;
use crate::utils;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;

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

    async fn embed(&self, text: &str, extras: Option<Value>) -> Result<EmbedderVector>;
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct EmbedderRequest {
    hash: String,
    provider_id: ProviderID,
    model_id: String,
    text: String,
    extras: Option<Value>,
}

impl EmbedderRequest {
    pub fn new(provider_id: ProviderID, model_id: &str, text: &str, extras: Option<Value>) -> Self {
        let mut hasher = blake3::Hasher::new();
        hasher.update(provider_id.to_string().as_bytes());
        hasher.update(model_id.as_bytes());
        hasher.update(text.as_bytes());
        if !extras.is_none() {
            hasher.update(extras.clone().unwrap().to_string().as_bytes());
        }

        Self {
            hash: format!("{}", hasher.finalize().to_hex()),
            provider_id,
            model_id: String::from(model_id),
            text: String::from(text),
            extras,
        }
    }

    pub fn hash(&self) -> &str {
        &self.hash
    }

    pub async fn execute(&self, credentials: Credentials) -> Result<EmbedderVector> {
        let mut embedder = provider(self.provider_id).embedder(self.model_id.clone());
        embedder.initialize(credentials).await?;

        let out = with_retryable_back_off(
            || embedder.embed(self.text.as_str(), self.extras.clone()),
            |err_msg, sleep, attempts| {
                utils::info(&format!(
                    "Retry querying `{}:{}`: attempts={} sleep={}ms err_msg={}",
                    self.provider_id.to_string(),
                    self.model_id,
                    attempts,
                    sleep.as_millis(),
                    err_msg,
                ));
            },
        )
        .await;

        match out {
            Ok(c) => {
                utils::done(&format!(
                    "Success querying `{}:{}`: text_length={}",
                    self.provider_id.to_string(),
                    self.model_id,
                    self.text.len(),
                ));
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

    pub async fn execute_with_cache(
        &self,
        credentials: Credentials,
        project: Project,
        store: Box<dyn Store + Send + Sync>,
        use_cache: bool,
    ) -> Result<EmbedderVector> {
        let embedding = {
            match use_cache {
                false => None,
                true => {
                    let mut embeddings = store.embedder_cache_get(&project, self).await?;
                    match embeddings.len() {
                        0 => None,
                        _ => Some(embeddings.remove(0)),
                    }
                }
            }
        };

        match embedding {
            Some(embedding) => Ok(embedding),
            None => {
                let embedding = self.execute(credentials).await?;
                store
                    .embedder_cache_store(&project, self, &embedding)
                    .await?;
                Ok(embedding)
            }
        }
    }
}
