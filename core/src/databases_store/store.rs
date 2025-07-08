use anyhow::Result;
use async_trait::async_trait;

use crate::databases::table::{Row, Table};
use crate::databases::table_schema::TableSchema;

#[derive(Debug)]
pub enum DatabasesStoreStrategy {
    PostgresOnly,
    PostgresAndWriteToGCS,

    // Migration MUST be completed for this to work in production.
    GCSAndWriteToPostgres,

    // Useful for testing but in production there would be no going back to postgres with a migration to re-insert the missing data in postgres.
    // Make sure that ALLOW_USAGE_OF_CSV_FILES is set to true in sqlite_workers/sqlite_database.rs to use this strategy.
    GCSOnly,
}

pub const CURRENT_STRATEGY: DatabasesStoreStrategy = DatabasesStoreStrategy::PostgresOnly;

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
