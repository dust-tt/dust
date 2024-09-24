use anyhow::Result;
use async_trait::async_trait;

use crate::databases::{
    database::{QueryDatabaseError, QueryResult},
    table_schema::TableSchema,
};

#[async_trait]
pub trait RemoteDatabase {
    async fn get_tables_used_by_query(&self, query: &str) -> Result<Vec<String>>;
    async fn execute_query(
        &self,
        query: &str,
    ) -> Result<(Vec<QueryResult>, TableSchema), QueryDatabaseError>;
}
