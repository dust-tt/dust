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
    ExecutionError(String),
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
    tables: Vec<Table>,
    query: &str,
    store: Box<dyn Store + Sync + Send>,
) -> Result<(Vec<QueryResult>, TableSchema), QueryDatabaseError> {
    match get_table_type_for_tables(tables.iter().collect()) {
        Err(e) => Err(QueryDatabaseError::GenericError(anyhow!(
            "Failed to get table type for tables: {}",
            e
        ))),
        Ok(TableType::Remote(credential_id)) => match get_remote_database(&credential_id).await {
            Ok(remote_db) => remote_db.authorize_and_execute_query(&tables, query).await,
            Err(e) => Err(QueryDatabaseError::GenericError(anyhow!(
                "Failed to get remote database: {}",
                e
            ))),
        },
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
                .map(|(table, schema)| schema.render_dbml(table.name(), table.description()))
                .collect::<Vec<_>>();

            Ok((
                remote_db.dialect(),
                schemas
                    .into_iter()
                    .zip(dbmls.into_iter())
                    .map(|(schema, dbml)| GetTableSchemaResult {
                        schema: Some(schema),
                        dbml,
                        head: None,
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
