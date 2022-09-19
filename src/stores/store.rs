use crate::dataset::Dataset;
use crate::providers::llm::{LLMGeneration, LLMRequest};
use crate::run::{Run, RunConfig};
use anyhow::Result;
use async_trait::async_trait;

#[async_trait]
pub trait Store {
    // Datasets
    async fn latest_dataset_hash(&self, dataset_id: &str) -> Result<Option<String>>;
    async fn register_dataset(&self, d: &Dataset) -> Result<()>;
    async fn load_dataset(&self, dataset_id: &str, hash: &str) -> Result<Option<Dataset>>;

    // Specifications
    async fn latest_specification_hash(&self) -> Result<Option<String>>;
    async fn register_specification(&self, hash: &str, spec: &str) -> Result<()>;

    // Runs
    async fn latest_run_id(&self) -> Result<Option<String>>;
    async fn all_runs(&self) -> Result<Vec<(String, u64, String, RunConfig)>>;
    async fn store_run(&self, run: &Run) -> Result<()>;
    async fn load_run(&self, run_id: &str) -> Result<Option<Run>>;

    // LLM Cache
    async fn llm_cache_get(&self, request: &LLMRequest) -> Result<Vec<LLMGeneration>>;
    async fn llm_cache_store(&self, request: &LLMRequest, generation: &LLMGeneration)
        -> Result<()>;

    // Cloning
    fn clone_box(&self) -> Box<dyn Store + Sync + Send>;
}

impl Clone for Box<dyn Store + Sync + Send> {
    fn clone(&self) -> Self {
        self.clone_box()
    }
}
