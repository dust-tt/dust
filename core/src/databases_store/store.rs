use anyhow::Result;
use async_trait::async_trait;

use crate::databases::table::Row;

#[async_trait]
pub trait DatabasesStore {
    async fn load_table_row(&self, table_id: &str, row_id: &str) -> Result<Option<Row>>;
    async fn list_table_rows(
        &self,
        table_id: &str,
        limit_offset: Option<(usize, usize)>,
    ) -> Result<(Vec<Row>, usize)>;
    async fn batch_upsert_table_rows(
        &self,
        table_id: &str,
        rows: &Vec<Row>,
        truncate: bool,
    ) -> Result<()>;
    async fn delete_table_rows(&self, table_id: &str) -> Result<()>;
    async fn delete_table_row(&self, table_id: &str, row_id: &str) -> Result<()>;

    fn clone_box(&self) -> Box<dyn DatabasesStore + Sync + Send>;
}

impl Clone for Box<dyn DatabasesStore + Sync + Send> {
    fn clone(&self) -> Self {
        self.clone_box()
    }
}
