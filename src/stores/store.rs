use crate::blocks::block::BlockType;
use crate::dataset::Dataset;
use crate::project::Project;
use crate::providers::llm::{LLMGeneration, LLMRequest};
use crate::run::{Run, RunConfig, RunStatus};
use anyhow::Result;
use async_trait::async_trait;
use std::collections::HashMap;

#[async_trait]
pub trait Store {
    // Projects
    async fn create_project(&self) -> Result<Project>;

    // Datasets
    async fn latest_dataset_hash(
        &self,
        project: &Project,
        dataset_id: &str,
    ) -> Result<Option<String>>;
    async fn register_dataset(&self, project: &Project, d: &Dataset) -> Result<()>;
    async fn load_dataset(
        &self,
        project: &Project,
        dataset_id: &str,
        hash: &str,
    ) -> Result<Option<Dataset>>;
    async fn list_datasets(&self, project: &Project)
        -> Result<HashMap<String, Vec<(String, u64)>>>;

    // Specifications
    async fn latest_specification_hash(&self, project: &Project) -> Result<Option<String>>;
    async fn register_specification(&self, project: &Project, hash: &str, spec: &str)
        -> Result<()>;

    // Runs
    async fn latest_run_id(&self, project: &Project) -> Result<Option<String>>;
    async fn all_runs(&self, project: &Project) -> Result<Vec<(String, u64, String, RunConfig)>>;

    async fn create_run_empty(&self, project: &Project, run: &Run) -> Result<()>;
    async fn update_run_status(
        &self,
        project: &Project,
        run_id: &str,
        run_status: &RunStatus,
    ) -> Result<()>;
    async fn append_run_block(
        &self,
        project: &Project,
        run: &Run,
        block_type: &BlockType,
        block_name: &String,
    ) -> Result<()>;

    async fn load_run(
        &self,
        project: &Project,
        run_id: &str,
        // None return all, Some(None), return none, Some(Some(_)) return that block.
        block: Option<Option<(BlockType, String)>>,
    ) -> Result<Option<Run>>;

    // LLM Cache
    async fn llm_cache_get(
        &self,
        project: &Project,
        request: &LLMRequest,
    ) -> Result<Vec<LLMGeneration>>;
    async fn llm_cache_store(
        &self,
        project: &Project,
        request: &LLMRequest,
        generation: &LLMGeneration,
    ) -> Result<()>;

    // Cloning
    fn clone_box(&self) -> Box<dyn Store + Sync + Send>;
}

impl Clone for Box<dyn Store + Sync + Send> {
    fn clone(&self) -> Self {
        self.clone_box()
    }
}
