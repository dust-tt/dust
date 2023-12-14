use std::sync::Arc;

use crate::{
    databases::database::{DatabaseResult, DatabaseRow, DatabaseTable},
    utils,
};
use anyhow::{anyhow, Result};
use futures::future::try_join_all;
use rayon::prelude::*;
use rusqlite::{params_from_iter, Connection};

use tokio::{sync::Mutex, task};

use super::store::DatabasesStore;

pub struct SqliteDatabase {
    database_id: String,
    conn: Option<Arc<Mutex<Connection>>>,
}

impl SqliteDatabase {
    pub fn new(database_id: String) -> Self {
        Self {
            database_id: database_id,
            conn: None,
        }
    }

    pub async fn init(
        &mut self,
        tables: Vec<DatabaseTable>,
        databases_store: Box<dyn DatabasesStore + Sync + Send>,
    ) -> Result<()> {
        match &self.conn {
            Some(_) => Ok(()),
            None => {
                self.conn = Some(
                    create_in_memory_sqlite_db(databases_store, &self.database_id, &tables).await?,
                );

                Ok(())
            }
        }
    }

    pub async fn query(&self, query: String) -> Result<Vec<DatabaseResult>> {
        match &self.conn {
            Some(conn) => execute_query_on_conn(conn.clone(), query).await,
            None => Err(anyhow!("Database not initialized")),
        }
    }
}

async fn create_in_memory_sqlite_db(
    databases_store: Box<dyn DatabasesStore + Sync + Send>,
    database_id: &str,
    tables: &Vec<DatabaseTable>,
) -> Result<Arc<Mutex<Connection>>> {
    let time_get_rows_start = utils::now();

    let tables_with_rows: Vec<(DatabaseTable, Vec<DatabaseRow>)> =
        try_join_all(tables.iter().map(|table| {
            let databases_store = databases_store.clone();
            async move {
                let (rows, _) = databases_store
                    .list_database_rows(&database_id, table.table_id(), None)
                    .await?;
                Ok::<_, anyhow::Error>((table.clone(), rows))
            }
        }))
        .await?;

    utils::done(&format!(
        "DSSTRUCTSTAT - WORKER Finished retrieving rows: duration={}ms",
        utils::now() - time_get_rows_start
    ));

    // Create the in-memory database in a blocking thread (in-memory rusqlite is CPU)
    let tables_clone = tables.clone();
    let conn = task::spawn_blocking(move || {
        let generate_create_table_sql_start = utils::now();
        let create_tables_sql: String = tables_clone
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

        let conn = Connection::open_in_memory().unwrap();

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
    .await?;

    Ok(Arc::new(Mutex::new(conn?)))
}

pub async fn execute_query_on_conn(
    conn: Arc<Mutex<Connection>>,
    query: String,
) -> Result<Vec<DatabaseResult>> {
    let time_query_start = utils::now();
    // Execute the query and collect results

    let conn = conn.lock_owned().await;

    let result_rows: Result<Vec<DatabaseResult>> = task::spawn_blocking(move || {
        let mut stmt = conn.prepare(&query).unwrap();
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
            .map(|value| DatabaseResult { value })
            .collect::<Vec<_>>();

        utils::done(&format!(
            "DSSTRUCTSTAT - WORKER Finished executing user query: duration={}ms",
            utils::now() - time_query_start
        ));

        Ok(result_rows)
    })
    .await?;

    Ok(result_rows?)
}
