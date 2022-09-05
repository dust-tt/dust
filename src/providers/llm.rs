use crate::providers::provider::{provider, ProviderID};
use crate::utils;
use anyhow::Result;
use async_fs::File;
use async_trait::async_trait;
use futures::prelude::*;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

#[derive(Debug, Serialize, PartialEq, Clone, Deserialize)]
pub struct Tokens {
    pub text: String,
    pub tokens: Option<Vec<String>>,
    pub logprobs: Option<Vec<Option<f32>>>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct LLMGeneration {
    pub provider: String,
    pub model: String,
    pub completions: Vec<Tokens>,
    pub prompt: Tokens,
}

#[async_trait]
pub trait LLM {
    fn id(&self) -> String;

    async fn initialize(&mut self) -> Result<()>;

    async fn generate(
        &self,
        prompt: &str,
        max_tokens: Option<i32>,
        temperature: f32,
        n: usize,
        stop: &Vec<String>,
    ) -> Result<LLMGeneration>;
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct LLMRequest {
    hash: String,
    provider_id: ProviderID,
    model_id: String,
    prompt: String,
    max_tokens: Option<i32>,
    temperature: f32,
    n: usize,
    stop: Vec<String>,
}

impl LLMRequest {
    pub fn new(
        provider_id: ProviderID,
        model_id: &str,
        prompt: &str,
        max_tokens: Option<i32>,
        temperature: f32,
        n: usize,
        stop: &Vec<String>,
    ) -> Self {
        let mut hasher = blake3::Hasher::new();
        hasher.update(provider_id.to_string().as_bytes());
        hasher.update(model_id.as_bytes());
        hasher.update(prompt.as_bytes());
        if !max_tokens.is_none() {
            hasher.update(max_tokens.unwrap().to_string().as_bytes());
        }
        hasher.update(temperature.to_string().as_bytes());
        hasher.update(n.to_string().as_bytes());
        stop.iter().for_each(|s| {
            hasher.update(s.as_bytes());
        });

        Self {
            hash: format!("{}", hasher.finalize().to_hex()),
            provider_id,
            model_id: String::from(model_id),
            prompt: String::from(prompt),
            max_tokens,
            temperature,
            n,
            stop: stop.clone(),
        }
    }

    pub async fn execute(&self) -> Result<LLMGeneration> {
        let mut llm = provider(self.provider_id).llm(self.model_id.clone());
        llm.initialize().await?;
        llm.generate(
            self.prompt.as_str(),
            self.max_tokens,
            self.temperature,
            self.n,
            &self.stop,
        )
        .await
    }

    pub async fn execute_with_cache(&self, cache: Arc<RwLock<LLMCache>>) -> Result<LLMGeneration> {
        let generation = {
            match cache.read().get(self) {
                Some(generations) => {
                    assert!(generations.len() > 0);
                    Some(generations.last().unwrap().clone())
                }
                None => None,
            }
        };

        match generation {
            Some(generation) => Ok(generation),
            None => {
                let generation = self.execute().await?;
                cache.write().store(self, &generation)?;
                Ok(generation)
            }
        }
    }
}

#[derive(Serialize, PartialEq, Deserialize)]
pub struct LLMCacheEntry {
    pub request: LLMRequest,
    pub generation: LLMGeneration,
}

pub struct LLMCache {
    data: HashMap<String, (LLMRequest, Vec<LLMGeneration>)>,
}

impl LLMCache {
    pub fn new() -> Self {
        Self {
            data: HashMap::new(),
        }
    }

    pub async fn warm_up() -> Result<Self> {
        let root_path = utils::init_check().await?;
        let cache_path = root_path.join(".cache").join("llm.jsonl");

        let mut data: HashMap<String, (LLMRequest, Vec<LLMGeneration>)> = HashMap::new();

        if cache_path.exists().await {
            let file = File::open(cache_path).await?;
            let reader = futures::io::BufReader::new(file);

            let mut count = 0_usize;

            reader
                .lines()
                .map(|line| {
                    let line = line.unwrap();
                    let entry: LLMCacheEntry = serde_json::from_str(&line)?;
                    Ok(entry)
                })
                .collect::<Vec<_>>()
                .await
                .into_iter()
                .collect::<Result<Vec<_>>>()?
                .into_iter()
                .for_each(|entry| {
                    count += 1;
                    data.entry(entry.request.hash.clone())
                        .or_insert((entry.request, Vec::new()))
                        .1
                        .push(entry.generation);
                });

            utils::info(format!("Retrieved {} cached LLM records.", count).as_str());
        }

        Ok(LLMCache { data })
    }

    pub async fn flush(&self) -> Result<()> {
        let root_path = utils::init_check().await?;
        let cache_path = root_path.join(".cache").join("llm.jsonl");

        let mut file = File::create(cache_path).await?;
        let mut count = 0;
        for (_, (request, generations)) in self.data.iter() {
            for generation in generations {
                count += 1;
                let entry = LLMCacheEntry {
                    request: request.clone(),
                    generation: generation.clone(),
                };
                let line = serde_json::to_string(&entry)?;
                file.write_all(line.as_bytes()).await?;
                file.write_all(b"\n").await?;
            }
        }

        utils::action(format!("Flushed {} cached LLM records.", count).as_str());

        Ok(())
    }

    pub fn get(&self, request: &LLMRequest) -> Option<&Vec<LLMGeneration>> {
        match self.data.get(&request.hash) {
            Some((_, generations)) => Some(generations),
            None => None,
        }
    }

    pub fn store(&mut self, request: &LLMRequest, generation: &LLMGeneration) -> Result<()> {
        self.data
            .entry(request.hash.clone())
            .or_insert((request.clone(), Vec::new()))
            .1
            .push(generation.clone());
        Ok(())
    }
}
