use anyhow::Result;
use async_trait::async_trait;

use crate::databases::table::{Row, Table};
use crate::databases::table_schema::TableSchema;

// These flags are transitional while we migrate to GCS. Eventually, we will only use GCS.
pub const SAVE_TABLES_TO_POSTGRES: bool = true;
pub const SAVE_TABLES_TO_GCS: bool = false;

#[async_trait]
pub trait DatabasesStore {
    async fn load_table_row(&self, table: &Table, row_id: &str) -> Result<Option<Row>>;
    async fn list_table_rows(
        &self,
        table: &Table,
        limit_offset: Option<(usize, usize)>,
    ) -> Result<(Vec<Row>, usize)>;
    async fn batch_upsert_table_rows(
        &self,
        table: &Table,
        schema: &TableSchema,
        rows: &Vec<Row>,
        truncate: bool,
    ) -> Result<()>;
    async fn delete_table_data(&self, table: &Table) -> Result<()>;
    async fn delete_table_row(&self, table: &Table, row_id: &str) -> Result<()>;

    fn clone_box(&self) -> Box<dyn DatabasesStore + Sync + Send>;
}

impl Clone for Box<dyn DatabasesStore + Sync + Send> {
    fn clone(&self) -> Self {
        self.clone_box()
    }
}
