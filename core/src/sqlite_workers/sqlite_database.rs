use std::sync::Arc;

use crate::{
    databases::database::{QueryResult, Row, Table},
    databases_store::store::DatabasesStore,
    utils,
};
use anyhow::{anyhow, Result};
use futures::future::try_join_all;
use parking_lot::Mutex;
use rayon::prelude::*;
use rusqlite::{params_from_iter, Connection, InterruptHandle};
use tokio::{task, time::timeout};

#[derive(Clone)]
pub struct SqliteDatabase {
    conn: Option<Arc<Mutex<Connection>>>,
    interrupt_handle: Option<Arc<tokio::sync::Mutex<InterruptHandle>>>,
}

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

    pub async fn query(&self, query: &str, timeout_ms: u64) -> Result<Vec<QueryResult>> {
        let query = query.to_string();
        let conn = self.conn.clone();

        let query_future = task::spawn_blocking(move || {
            let conn = match conn {
                Some(conn) => conn.clone(),
                None => Err(anyhow!("Database not initialized"))?,
            };

            // This lock is a parking_lot so it's blocking but we're in a spawn_blocking, so OK.
            let conn = conn.lock();
            let time_query_start = utils::now();

            // Execute the query and collect results
            let mut stmt = conn.prepare(&query)?;
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
                .collect::<Result<Vec<_>>>()?
                .into_par_iter()
                .map(|value| QueryResult { value })
                .collect::<Vec<_>>();

            utils::done(&format!(
                "DSSTRUCTSTAT - WORKER Finished executing user query: duration={}ms",
                utils::now() - time_query_start
            ));

            Ok(result_rows)
        });

        match timeout(std::time::Duration::from_millis(timeout_ms), query_future).await {
            Ok(r) => r?,
            Err(_) => {
                let interrupt_handle = match &self.interrupt_handle {
                    Some(interrupt_handle) => interrupt_handle.clone(),
                    None => Err(anyhow!("Database not initialized"))?,
                };
                let interrupt_handle = interrupt_handle.lock().await;
                interrupt_handle.interrupt();
                Err(anyhow!("Query execution timed out after {}ms", timeout_ms))?
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

    utils::done(&format!(
        "DSSTRUCTSTAT - WORKER Finished retrieving rows: duration={}ms",
        utils::now() - time_get_rows_start
    ));

    // Create the in-memory database in a blocking thread (in-memory rusqlite is CPU).
    task::spawn_blocking(move || {
        let generate_create_table_sql_start = utils::now();
        let create_tables_sql: String = tables
            .into_iter()
            .filter_map(|t| match t.schema() {
                Some(s) => {
                    if s.is_empty() {
                        None
                    } else {
                        Some(s.get_create_table_sql_string(t.name()))
                    }
                }
                None => None,
            })
            .collect::<Vec<_>>()
            .join("\n");
        utils::done(&format!(
            "DSSTRUCTSTAT - WORKER Finished generating create table SQL: duration={}ms",
            utils::now() - generate_create_table_sql_start
        ));

        let conn = Connection::open_in_memory()?;

        let create_tables_execute_start = utils::now();
        conn.execute_batch(&create_tables_sql)?;
        utils::done(&format!(
            "DSSTRUCTSTAT - WORKER Finished creating tables: duration={}ms",
            utils::now() - create_tables_execute_start
        ));

        let insert_execute_start = utils::now();
        tables_with_rows
            .iter()
            .filter(|(_, rows)| !rows.is_empty())
            .map(|(table, rows)| {
                if table.schema().is_none() {
                    Err(anyhow!("No schema found for table {}", table.name()))?;
                }
                let table_schema = table.schema().unwrap();
                let (sql, field_names) = table_schema.get_insert_sql(table.name());
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
        utils::done(&format!(
            "DSSTRUCTSTAT - WORKER Finished inserting rows: duration={}ms",
            utils::now() - insert_execute_start
        ));

        Result::<_>::Ok(conn)
    })
    .await?
}
