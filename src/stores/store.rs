use crate::dataset::Dataset;
use crate::run::{Run, RunConfig};
use anyhow::Result;
use async_trait::async_trait;

#[async_trait]
pub trait Store {
    async fn latest_dataset_hash(&self, dataset_id: &str) -> Result<Option<String>>;
    async fn register_dataset(&self, d: &Dataset) -> Result<()>;
    async fn load_dataset(&self, dataset_id: &str, hash: &str) -> Result<Option<Dataset>>;

    async fn latest_specification_hash(&self) -> Result<Option<String>>;
    async fn register_specification(&self, hash: &str, spec: &str) -> Result<()>;

    async fn latest_run_id(&self) -> Result<Option<String>>;
    /// Returns (run_id, created, app_hash, run_config)
    async fn all_runs(&self) -> Result<Vec<(String, u64, String, RunConfig)>>;
    async fn store_run(&self, run: &Run) -> Result<()>;
    async fn load_run(&self, run_id: &str) -> Result<Option<Run>>;

    fn clone_box(&self) -> Box<dyn Store + Sync + Send>;
}

impl Clone for Box<dyn Store + Sync + Send> {
    fn clone(&self) -> Self {
        self.clone_box()
    }
}
