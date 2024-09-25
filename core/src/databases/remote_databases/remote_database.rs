use anyhow::Result;
use async_trait::async_trait;
use std::collections::HashMap;

use crate::databases::{error::QueryDatabaseError, table::QueryResult, table_schema::TableSchema};

#[async_trait]
pub trait RemoteDatabase {
    async fn get_tables_used_by_query(&self, query: &str) -> Result<Vec<String>>;
    async fn execute_query(
        &self,
        query: &str,
    ) -> Result<(Vec<QueryResult>, TableSchema), QueryDatabaseError>;
    async fn get_tables_schema(
        &self,
        opaque_ids: Vec<String>,
    ) -> Result<HashMap<String, TableSchema>>;
}
