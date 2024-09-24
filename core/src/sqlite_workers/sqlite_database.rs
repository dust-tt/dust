use anyhow::{anyhow, Result};
use futures::future::try_join_all;
use parking_lot::Mutex;
use rayon::prelude::*;
use rusqlite::{params_from_iter, Connection, InterruptHandle};
use std::sync::Arc;
use thiserror::Error;
use tokio::{task, time::timeout};
use tracing::info;

use crate::{
    databases::{
        database::{QueryResult, Row, Table},
        transient_database::get_unique_table_names_for_transient_database,
    },
    databases_store::store::DatabasesStore,
    utils,
};

#[derive(Clone)]
pub struct SqliteDatabase {
    conn: Option<Arc<Mutex<Connection>>>,
    interrupt_handle: Option<Arc<tokio::sync::Mutex<InterruptHandle>>>,
}

#[derive(Debug, Error)]
pub enum SqliteDatabaseError {
    #[error("Query returned more than {0} rows")]
    ExceededMaxRows(usize),
    #[error("SQLite Worker Internal error: {0}")]
    InternalError(anyhow::Error),
    #[error("Query execution error: {0}")]
    QueryExecutionError(anyhow::Error),
}

impl From<rusqlite::Error> for SqliteDatabaseError {
    fn from(e: rusqlite::Error) -> Self {
        SqliteDatabaseError::QueryExecutionError(anyhow!(e))
    }
}

impl From<anyhow::Error> for SqliteDatabaseError {
    fn from(e: anyhow::Error) -> Self {
        SqliteDatabaseError::InternalError(e)
    }
}

const MAX_ROWS: usize = 128;

impl SqliteDatabase {
    pub fn new() -> Self {
        Self {
            conn: None,
            interrupt_handle: None,
        }
    }

    pub async fn init(
        &mut self,
        tables: Vec<Table>,
        databases_store: Box<dyn DatabasesStore + Sync + Send>,
    ) -> Result<()> {
        match &self.conn {
            Some(_) => Ok(()),
            None => {
                let conn = create_in_memory_sqlite_db(databases_store, tables).await?;
                let interrupt_handle = conn.get_interrupt_handle();
                self.conn = Some(Arc::new(Mutex::new(conn)));
                self.interrupt_handle = Some(Arc::new(tokio::sync::Mutex::new(interrupt_handle)));

                Ok(())
            }
        }
    }

    pub async fn query(
        &self,
        query: &str,
        timeout_ms: u64,
    ) -> Result<Vec<QueryResult>, SqliteDatabaseError> {
        let query = query.to_string();
        let conn = self.conn.clone();

        let query_future = task::spawn_blocking(move || {
            let conn = conn.ok_or(SqliteDatabaseError::InternalError(anyhow!(
                "Database not initialized"
            )))?;

            let conn = conn.lock();
            let time_query_start = utils::now();

            let mut stmt = conn
                .prepare(&query)
                .map_err(|e| SqliteDatabaseError::QueryExecutionError(anyhow::Error::new(e)))?;

            let column_names = stmt
                .column_names()
                .into_iter()
                .map(|x| x.to_string())
                .collect::<Vec<String>>();
            let result_rows = stmt
                .query_and_then([], |row| {
                    column_names
                        .iter()
                        .enumerate()
                        .map(|(i, column_name)| {
                            Ok((
                                column_name.clone(),
                                match row.get(i) {
                                    Err(e) => Err(anyhow!(
                                        "Failed to retrieve value for column {}: {}",
                                        column_name,
                                        e
                                    )),
                                    Ok(v) => match v {
                                        rusqlite::types::Value::Integer(i) => {
                                            Ok(serde_json::Value::Number(i.into()))
                                        }
                                        rusqlite::types::Value::Real(f) => {
                                            match serde_json::Number::from_f64(f) {
                                                Some(n) => Ok(serde_json::Value::Number(n)),
                                                None => Err(anyhow!(
                                                    "Invalid float value for column {}",
                                                    column_name
                                                )),
                                            }
                                        }
                                        rusqlite::types::Value::Text(t) => {
                                            Ok(serde_json::Value::String(t.clone()))
                                        }
                                        rusqlite::types::Value::Blob(b) => {
                                            match String::from_utf8(b.clone()) {
                                                Err(_) => Err(anyhow!(
                                                    "Invalid UTF-8 sequence for column {}",
                                                    column_name
                                                )),
                                                Ok(s) => Ok(serde_json::Value::String(s)),
                                            }
                                        }
                                        rusqlite::types::Value::Null => Ok(serde_json::Value::Null),
                                    },
                                }?,
                            ))
                        })
                        .collect::<Result<serde_json::Value>>()
                })?
                .take(MAX_ROWS + 1)
                .collect::<Result<Vec<_>, _>>()?
                .into_par_iter()
                .map(|value| QueryResult { value })
                .collect::<Vec<_>>();

            if result_rows.len() > MAX_ROWS {
                return Err(SqliteDatabaseError::ExceededMaxRows(MAX_ROWS));
            }

            info!(
                duration = utils::now() - time_query_start,
                "DSSTRUCTSTAT - WORKER Finished executing user query"
            );

            Ok(result_rows)
        });

        match timeout(std::time::Duration::from_millis(timeout_ms), query_future)
            .await
            .map_err(|_| SqliteDatabaseError::InternalError(anyhow!("Query timed-out")))?
        {
            Ok(r) => r,
            Err(_) => {
                let interrupt_handle =
                    self.interrupt_handle
                        .as_ref()
                        .ok_or(SqliteDatabaseError::InternalError(anyhow!(
                            "Database is not initialized"
                        )))?;

                let interrupt_handle = interrupt_handle.lock().await;
                interrupt_handle.interrupt();

                Err(SqliteDatabaseError::InternalError(anyhow!(format!(
                    "Query execution timed out after {} ms",
                    timeout_ms
                ))))
            }
        }
    }
}

async fn create_in_memory_sqlite_db(
    databases_store: Box<dyn DatabasesStore + Sync + Send>,
    tables: Vec<Table>,
) -> Result<Connection> {
    let time_get_rows_start = utils::now();

    let tables_with_rows: Vec<(Table, Vec<Row>)> = try_join_all(tables.iter().map(|table| {
        let databases_store = databases_store.clone();
        async move {
            let (rows, _) = databases_store
                .list_table_rows(&table.unique_id(), None)
                .await?;
            Ok::<_, anyhow::Error>((table.clone(), rows))
        }
    }))
    .await?;
    info!(
        duration = utils::now() - time_get_rows_start,
        "DSSTRUCTSTAT - WORKER Finished retrieving rows"
    );

    // Create the in-memory database in a blocking thread (in-memory rusqlite is CPU).
    task::spawn_blocking(move || {
        let generate_create_table_sql_start = utils::now();
        let unique_table_names = get_unique_table_names_for_transient_database(&tables);
        let create_tables_sql: String = tables
            .into_iter()
            .filter_map(|t| match t.schema_cached() {
                Some(s) => {
                    if s.is_empty() {
                        None
                    } else {
                        let table_name = unique_table_names
                            .get(&t.unique_id())
                            .expect("Unreachable: table name not found in unique_table_names");
                        Some(s.get_create_table_sql_string(table_name))
                    }
                }
                None => None,
            })
            .collect::<Vec<_>>()
            .join(";\n");

        info!(
            duration = utils::now() - generate_create_table_sql_start,
            "DSSTRUCTSTAT - WORKER Finished generating create table SQL"
        );

        let conn = Connection::open_in_memory()?;

        let create_tables_execute_start = utils::now();
        conn.execute_batch(&create_tables_sql)?;
        info!(
            duration = utils::now() - create_tables_execute_start,
            "DSSTRUCTSTAT - WORKER Finished creating tables"
        );

        let insert_execute_start = utils::now();
        tables_with_rows
            .iter()
            .filter(|(_, rows)| !rows.is_empty())
            .map(|(table, rows)| {
                let table_name = unique_table_names
                    .get(&table.unique_id())
                    .expect("Unreachable: table name not found in unique_table_names");
                if table.schema_cached().is_none() {
                    Err(anyhow!("No cached schema found for table {}", table_name))?;
                }
                let table_schema = table.schema_cached().unwrap();
                let (sql, field_names) = table_schema.get_insert_sql(table_name);
                let mut stmt = conn.prepare(&sql)?;

                rows.par_iter()
                    .map(|r| match table_schema.get_insert_params(&field_names, r) {
                        Ok(params) => Ok(params_from_iter(params)),
                        Err(e) => Err(anyhow!(
                            "Error getting insert params for row {}: {}",
                            r.row_id(),
                            e
                        )),
                    })
                    .collect::<Result<Vec<_>>>()?
                    .into_iter()
                    .map(|params| match stmt.execute(params) {
                        Ok(_) => Ok(()),
                        Err(e) => Err(anyhow!("Error inserting row: {}", e)),
                    })
                    .collect::<Result<Vec<_>>>()
            })
            .collect::<Result<Vec<_>>>()?;
        info!(
            duration = utils::now() - insert_execute_start,
            "DSSTRUCTSTAT - WORKER Finished inserting rows"
        );

        Result::<_>::Ok(conn)
    })
    .await?
}
