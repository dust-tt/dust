use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::{
    databases::{
        remote_databases::get_remote_database::get_remote_database,
        table::{get_table_type_for_tables, Table, TableType},
        table_schema::TableSchema,
        transient_database::execute_query_on_transient_database,
    },
    stores::store::Store,
};

#[derive(Debug, Error)]
pub enum QueryDatabaseError {
    #[error("{0}")]
    GenericError(#[from] anyhow::Error),
    #[error("Too many result rows")]
    TooManyResultRows,
    #[error("Result is too large: {0}")]
    ResultTooLarge(String),
    #[error("Query execution error: {0}")]
    ExecutionError(String),
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct QueryResult {
    pub value: serde_json::Value,
}

pub trait HasValue {
    fn value(&self) -> &serde_json::Value;
}

impl HasValue for QueryResult {
    fn value(&self) -> &serde_json::Value {
        &self.value
    }
}

pub async fn execute_query(
    tables: &Vec<Table>,
    query: &str,
    store: Box<dyn Store + Sync + Send>,
) -> Result<(Vec<QueryResult>, TableSchema), QueryDatabaseError> {
    match get_table_type_for_tables(tables.iter().collect()) {
        Err(e) => Err(QueryDatabaseError::GenericError(anyhow!(
            "Failed to get table type for tables: {}",
            e
        ))),
        Ok(TableType::Remote(credential_id)) => match get_remote_database(&credential_id).await {
            Ok(remote_db) => remote_db.execute_query(&tables, query).await,
            Err(e) => Err(QueryDatabaseError::GenericError(anyhow!(
                "Failed to get remote database: {}",
                e
            ))),
        },
        Ok(TableType::Local) => execute_query_on_transient_database(&tables, store, query).await,
    }
}
