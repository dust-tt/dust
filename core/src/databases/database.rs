use std::collections::HashMap;

use anyhow::{anyhow, Result};
use futures::future::try_join_all;
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::{
    databases::{
        remote_databases::remote_database::get_remote_database,
        table::{get_table_type_for_tables, LocalTable, Table, TableType},
        table_schema::TableSchema,
        transient_database::{
            execute_query_on_transient_database, get_transient_database_tables_info,
        },
    },
    databases_store::store::DatabasesStore,
    stores::store::Store,
    utils::now,
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

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SqlDialect {
    DustSqlite,
    Snowflake,
    Bigquery,
    SalesforceSoql,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct QueryResult {
    pub value: serde_json::Map<String, serde_json::Value>,
}

pub trait HasValue {
    fn value(&self) -> &serde_json::Map<String, serde_json::Value>;
}

impl HasValue for QueryResult {
    fn value(&self) -> &serde_json::Map<String, serde_json::Value> {
        &self.value
    }
}

pub async fn execute_query(
    tables: Vec<Table>,
    query: &str,
    store: Box<dyn Store + Sync + Send>,
) -> Result<(Vec<QueryResult>, TableSchema, String), QueryDatabaseError> {
    match get_table_type_for_tables(tables.iter().collect()) {
        Err(e) => Err(QueryDatabaseError::GenericError(anyhow!(
            "Failed to get table type for tables: {}",
            e
        ))),
        Ok(TableType::Remote(credential_or_connection_id)) => {
            match get_remote_database(&credential_or_connection_id).await {
                Ok(remote_db) => remote_db.authorize_and_execute_query(&tables, query).await,
                Err(e) => Err(QueryDatabaseError::GenericError(anyhow!(
                    "Failed to get remote database: {}",
                    e
                ))),
            }
        }
        Ok(TableType::Local) => {
            execute_query_on_transient_database(
                &tables
                    .into_iter()
                    .map(|t| LocalTable::from_table(t))
                    .collect::<Result<Vec<_>>>()?,
                store,
                query,
            )
            .await
        }
    }
}

pub struct GetTableSchemaResult {
    pub schema: Option<TableSchema>,
    pub dbml: String,
    pub head: Option<Vec<QueryResult>>,
}

async fn get_local_tables_schema(
    tables: Vec<Table>,
    store: Box<dyn Store + Sync + Send>,
    databases_store: Box<dyn DatabasesStore + Sync + Send>,
) -> Result<(SqlDialect, Vec<GetTableSchemaResult>)> {
    let mut local_tables = tables
        .into_iter()
        .map(LocalTable::from_table)
        .collect::<Result<Vec<_>>>()?;

    // Load the schema for each table.
    // If the schema cache is stale, this will update it in place.
    try_join_all(
        local_tables
            .iter_mut()
            .map(|t| t.schema(store.clone(), databases_store.clone())),
    )
    .await?;

    let tables_info = get_transient_database_tables_info(&local_tables, store).await?;

    Ok((
        SqlDialect::DustSqlite,
        local_tables
            .into_iter()
            .zip(tables_info)
            .map(|(lt, ti)| GetTableSchemaResult {
                schema: lt.table.schema_cached().cloned(),
                dbml: lt.render_dbml(Some(&ti.unique_name)),
                head: Some(ti.head),
            })
            .collect(),
    ))
}

async fn get_remote_tables_schema(
    tables: Vec<Table>,
    store: Box<dyn Store + Sync + Send>,
    credential_id: String,
) -> Result<(SqlDialect, Vec<GetTableSchemaResult>)> {
    let remote_db = get_remote_database(&credential_id).await?;
    // Get schemas for tables that need updating
    let uncached_tables: Vec<_> = tables
        .clone()
        .into_iter()
        .filter(|t| {
            t.schema_cached().is_none() || t.schema_stale_at().map_or(false, |ts| ts <= now())
        })
        .collect();

    let remote_ids_to_fetch: Vec<_> = uncached_tables
        .iter()
        .filter_map(|t| t.remote_database_table_id())
        .collect();

    let fetched_schemas = if !remote_ids_to_fetch.is_empty() {
        let schemas = remote_db.get_tables_schema(&remote_ids_to_fetch).await?;

        try_join_all(uncached_tables.iter().zip(&schemas).map(|(table, schema)| {
            store.update_data_source_table_schema(
                table.project(),
                table.data_source_id(),
                table.table_id(),
                schema,
                Some(now() + remote_db.schema_expiration_time()),
            )
        }))
        .await?;

        // Map remote IDs to schemas
        remote_ids_to_fetch
            .iter()
            .zip(&schemas)
            .map(|(id, s)| (*id, s.clone()))
            .collect()
    } else {
        HashMap::new()
    };

    Ok((
        remote_db.dialect(),
        tables
            .into_iter()
            .map(|table| GetTableSchemaResult {
                schema: table
                    .remote_database_table_id()
                    .and_then(|id| fetched_schemas.get(&id).cloned())
                    .or_else(|| table.schema_cached().cloned()),
                dbml: table
                    .schema_cached()
                    .unwrap()
                    .render_dbml(table.name(), table.description()),
                head: None,
            })
            .collect(),
    ))
}

pub async fn get_tables_schema(
    tables: Vec<Table>,
    store: Box<dyn Store + Sync + Send>,
    databases_store: Box<dyn DatabasesStore + Sync + Send>,
) -> Result<(SqlDialect, Vec<GetTableSchemaResult>)> {
    match get_table_type_for_tables(tables.iter().collect::<Vec<_>>())? {
        TableType::Remote(credential_id) => {
            get_remote_tables_schema(tables, store, credential_id).await
        }
        TableType::Local => get_local_tables_schema(tables, store, databases_store).await,
    }
}
