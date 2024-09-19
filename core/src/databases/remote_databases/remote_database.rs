use anyhow::Result;

use async_trait::async_trait;

#[async_trait]
pub trait RemoteDatabase {
    async fn get_tables_used_by_query(&self, query: &str) -> Result<Vec<String>>;
}
