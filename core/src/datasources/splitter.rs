use crate::providers::provider::{provider, ProviderID};
use crate::run::Credentials;
use crate::utils::ParseError;
use anyhow::Result;
use async_trait::async_trait;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::str::FromStr;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Deserialize)]
pub enum SplitterID {
    BaseV0,
}

impl ToString for SplitterID {
    fn to_string(&self) -> String {
        match self {
            SplitterID::BaseV0 => String::from("base_v0"),
        }
    }
}

impl FromStr for SplitterID {
    type Err = ParseError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "base_v0" => Ok(SplitterID::BaseV0),
            _ => Err(ParseError::with_message(
                "Unknown splitter ID (possible values: base_v0)",
            ))?,
        }
    }
}

#[async_trait]
pub trait Splitter {
    fn id(&self) -> SplitterID;

    async fn split(
        &self,
        credentials: Credentials,
        provider_id: ProviderID,
        model_id: &str,
        max_chunk_size: usize,
        text: &str,
    ) -> Result<Vec<String>>;
}

pub fn splitter(s: SplitterID) -> Box<dyn Splitter + Sync + Send> {
    match s {
        SplitterID::BaseV0 => Box::new(BaseV0Splitter::new()),
    }
}

pub struct BaseV0Splitter {}

impl BaseV0Splitter {
    pub fn new() -> Self {
        BaseV0Splitter {}
    }
}

#[async_trait]
impl Splitter for BaseV0Splitter {
    fn id(&self) -> SplitterID {
        SplitterID::BaseV0
    }

    async fn split(
        &self,
        credentials: Credentials,
        provider_id: ProviderID,
        model_id: &str,
        max_chunk_size: usize,
        text: &str,
    ) -> Result<Vec<String>> {
        // Replace all \s+ with " " and trim.
        let re = Regex::new(r"\s+").unwrap();
        let clean = re.replace_all(text, " ");
        let clean = clean.trim();

        // Get the embedder and initialize.
        let mut embedder = provider(provider_id).embedder(model_id.to_string());
        embedder.initialize(credentials).await?;

        // Encode the clean text.
        let encoded = embedder.encode(clean).await?;

        // Split the encoded text into chunks of size max_chunk_size.
        let mut chunks = Vec::new();
        let mut chunk = Vec::new();
        let mut chunk_size = 0;
        for token in encoded {
            chunk.push(token);
            chunk_size += 1;
            if chunk_size >= max_chunk_size {
                chunks.push(chunk);
                chunk = Vec::new();
                chunk_size = 0;
            }
        }
        if chunk.len() > 0 {
            chunks.push(chunk);
        }

        // Decode the chunks in parallel.
        let mut futures = Vec::new();
        for chunk in chunks {
            futures.push(embedder.decode(chunk));
        }

        futures::future::try_join_all(futures).await
    }
}
