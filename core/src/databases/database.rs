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
    ExecutionError(String, Option<String>),
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SqlDialect {
    DustSqlite,
    Snowflake,
    Bigquery,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct QueryResult {
    pub value: serde_json::Map<String, serde_json::Value>,
}

pub trait HasValue {
    /// Returns the headers (column names) and values for this item.
    ///
    /// # Returns
    /// A tuple containing:
    /// - `Vec<&String>`: Vector of references to column header names
    /// - `Vec<&serde_json::Value>`: Vector of references to the corresponding column values
    fn value(&self) -> (Vec<&String>, Vec<&serde_json::Value>);
}

impl HasValue for QueryResult {
    fn value(&self) -> (Vec<&String>, Vec<&serde_json::Value>) {
        (self.value.keys().collect(), self.value.values().collect())
    }
}

pub async fn execute_query(
    tables: Vec<Table>,
    query: &str,
    store: Box<dyn Store + Sync + Send>,
    databases_store: Box<dyn DatabasesStore + Sync + Send>,
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
            let mut local_tables = tables
                .into_iter()
                .map(|t| LocalTable::from_table(t))
                .collect::<Result<Vec<_>>>()?;

            // Load the schema for each table.
            // If the schema cache is stale, this will update it in place.
            try_join_all(
                local_tables
                    .iter_mut()
                    .map(|t| t.schema(store.clone(), databases_store.clone())),
            )
            .await?;

            execute_query_on_transient_database(&local_tables, store, query).await
        }
    }
}

pub struct GetTableSchemaResult {
    pub schema: Option<TableSchema>,
    pub dbml: String,
    pub head: Option<Vec<QueryResult>>,
}

pub async fn get_tables_schema(
    tables: Vec<Table>,
    store: Box<dyn Store + Sync + Send>,
    databases_store: Box<dyn DatabasesStore + Sync + Send>,
) -> Result<(SqlDialect, Vec<GetTableSchemaResult>)> {
    match get_table_type_for_tables(tables.iter().collect::<Vec<_>>())? {
        TableType::Remote(credential_id) => {
            let remote_db = get_remote_database(&credential_id).await?;
            let remote_table_ids = tables
                .iter()
                .map(|t| {
                    t.remote_database_table_id().ok_or(anyhow!(
                        "Remote table unexpectedly missing remote database table ID."
                    ))
                })
                .collect::<Result<Vec<_>>>()?;
            let schemas = remote_db.get_tables_schema(&remote_table_ids).await?;

            let dbmls = tables
                .iter()
                .zip(schemas.iter())
                .map(|(table, schema)| {
                    let table_id = table.table_id_for_dbml().replace("__DUST_DOT__", ".");
                    schema.as_ref().map(|s| {
                        s.render_dbml(
                            &table_id,
                            table.description(),
                            remote_db.should_use_column_description(table),
                        )
                    })
                })
                .collect::<Vec<_>>();

            Ok((
                remote_db.dialect(),
                schemas
                    .into_iter()
                    .zip(dbmls.into_iter())
                    .filter_map(|(schema, dbml)| {
                        if let (Some(schema), Some(dbml)) = (schema, dbml) {
                            Some(GetTableSchemaResult {
                                schema: Some(schema),
                                dbml,
                                head: None,
                            })
                        } else {
                            None
                        }
                    })
                    .collect::<Vec<_>>(),
            ))
        }
        TableType::Local => {
            let mut local_tables = tables
                .into_iter()
                .map(|t| LocalTable::from_table(t))
                .collect::<Result<Vec<_>>>()?;

            // Load the schema for each table.
            // If the schema cache is stale, this will update it in place.
            try_join_all(
                local_tables
                    .iter_mut()
                    .map(|t| t.schema(store.clone(), databases_store.clone())),
            )
            .await?;

            let tables_info =
                get_transient_database_tables_info(&local_tables, store.clone()).await?;

            Ok((
                SqlDialect::DustSqlite,
                local_tables
                    .into_iter()
                    .zip(tables_info.into_iter())
                    .map(|(lt, ti)| {
                        let unique_table_name = ti.unique_name;
                        let head = ti.head;
                        let schema = lt.table.schema_cached().map(|s| s.clone());
                        let dbml = lt.render_dbml(Some(&unique_table_name));

                        GetTableSchemaResult {
                            schema,
                            dbml,
                            head: Some(head),
                        }
                    })
                    .collect::<Vec<_>>(),
            ))
        }
    }
}
