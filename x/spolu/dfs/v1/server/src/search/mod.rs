mod index;
mod query;
pub(crate) mod queue;
mod worker;

use crate::{State, storage::failed};
use clap::Args;
use dfs_protocol::{error::status, rpc::ErrorCode};
use lancedb::{Connection, Table};
use sha2::{Digest, Sha256};
use std::{collections::VecDeque, sync::Arc};
use tokio::sync::{Mutex, Semaphore, watch};
use tonic::Status;

#[derive(Args, Clone, Debug)]
pub struct SearchConfig {
    #[arg(long, env = "DFS_SEARCH_CACHE_MIB", default_value_t = 256)]
    pub cache_mib: usize,
    #[arg(long, env = "DFS_SEARCH_TABLES", default_value_t = 32)]
    pub tables: usize,
}
impl Default for SearchConfig {
    fn default() -> Self {
        Self {
            cache_mib: 256,
            tables: 32,
        }
    }
}

pub struct Search {
    connection: Connection,
    tables: Mutex<VecDeque<(String, Table)>>,
    table_limit: usize,
    admission: Semaphore,
    stop: watch::Sender<bool>,
    task: Mutex<Option<tokio::task::JoinHandle<()>>>,
}
impl Search {
    /// @cc [owner:spolu,label:security] clean-gcs-environment
    /// GCS callers MUST launch without service-account environment aliases. The dfs-server entry
    /// point enforces this before starting its runtime; local-store callers do not use GCS identity.
    pub async fn open(
        uri: &str,
        credentials: Option<&str>,
        config: SearchConfig,
    ) -> anyhow::Result<Arc<Self>> {
        anyhow::ensure!(
            config.tables > 0 && config.tables <= 1024,
            "search tables must be 1..1024"
        );
        let bytes = config
            .cache_mib
            .checked_mul(1024 * 1024)
            .ok_or_else(|| anyhow::anyhow!("search cache overflow"))?;
        let session = Arc::new(lancedb::Session::new(
            bytes - bytes / 4,
            bytes / 4,
            Arc::new(lancedb::ObjectStoreRegistry::default()),
        ));
        let mut builder = lancedb::connect(uri).session(session);
        if let Some(path) = credentials {
            builder = builder.storage_option("google_application_credentials", path);
        }
        let connection = builder.execute().await?;
        let (stop, _) = watch::channel(false);
        Ok(Arc::new(Self {
            connection,
            tables: Mutex::new(VecDeque::new()),
            table_limit: config.tables,
            admission: Semaphore::new(4),
            stop,
            task: Mutex::new(None),
        }))
    }
    fn name(workspace: &str) -> String {
        format!("w_{}", hex::encode(Sha256::digest(workspace.as_bytes())))
    }
    async fn table(&self, workspace: &str) -> Result<Table, Status> {
        let mut cache = self.tables.lock().await;
        if let Some(position) = cache.iter().position(|(key, _)| key == workspace)
            && let Some(entry) = cache.remove(position)
        {
            let table = entry.1.clone();
            cache.push_back(entry);
            return Ok(table);
        }
        let table = self
            .connection
            .open_table(Self::name(workspace))
            .execute()
            .await
            .map_err(|_| status(ErrorCode::Unavailable))?;
        Self::remember(&mut cache, self.table_limit, workspace, table.clone());
        Ok(table)
    }
    fn remember(
        cache: &mut VecDeque<(String, Table)>,
        limit: usize,
        workspace: &str,
        table: Table,
    ) {
        cache.retain(|(key, _)| key != workspace);
        while cache.len() >= limit {
            cache.pop_front();
        }
        cache.push_back((workspace.to_owned(), table));
    }
    async fn create_table(&self, workspace: &str) -> Result<Table, Status> {
        let mut cache = self.tables.lock().await;
        let table = self
            .connection
            .create_empty_table(Self::name(workspace), index::schema())
            .execute()
            .await
            .map_err(failed)?;
        Self::remember(&mut cache, self.table_limit, workspace, table.clone());
        Ok(table)
    }
    pub async fn start(self: &Arc<Self>, state: &Arc<State>) -> anyhow::Result<()> {
        let mut task = self.task.lock().await;
        anyhow::ensure!(task.is_none(), "search worker already started");
        let search = self.clone();
        let state = Arc::downgrade(state);
        *task = Some(tokio::spawn(async move { search.run(state).await }));
        Ok(())
    }
    pub async fn stop(&self) -> anyhow::Result<()> {
        self.stop.send_replace(true);
        if let Some(task) = self.task.lock().await.take() {
            task.await?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests;
