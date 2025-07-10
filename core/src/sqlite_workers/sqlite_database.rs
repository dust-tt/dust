use crate::{
    databases::{
        database::QueryResult,
        table::{LocalTable, Row, Table},
        transient_database::get_transient_database_unique_table_names,
    },
    databases_store::{gcs::GoogleCloudStorageDatabasesStore, store::DatabasesStore},
    utils,
};
use anyhow::{anyhow, Result};
use cloud_storage::Object;
use futures::future::try_join_all;
use parking_lot::Mutex;
use rayon::prelude::*;
use rusqlite::{params_from_iter, Connection, InterruptHandle};
use std::{collections::HashMap, io::Write, sync::Arc};
use tempfile::NamedTempFile;
use thiserror::Error;
use tokio::{task, time::timeout};
use tokio_stream::StreamExt;
use tracing::info;

pub struct SqliteDatabase {
    conn: Option<Arc<Mutex<Connection>>>,
    interrupt_handle: Option<Arc<tokio::sync::Mutex<InterruptHandle>>>,
    temporary_files: Option<Vec<NamedTempFile>>,
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

const MAX_ROWS: usize = 2048;

// Switch to false to use the in-memory database without CSV files.
const ALLOW_USAGE_OF_CSV_FILES: bool = false;

impl SqliteDatabase {
    pub fn new() -> Self {
        Self {
            conn: None,
            interrupt_handle: None,
            temporary_files: None,
        }
    }

    pub async fn init(
        &mut self,
        tables: Vec<LocalTable>,
        databases_store: Box<dyn DatabasesStore + Sync + Send>,
    ) -> Result<()> {
        match &self.conn {
            Some(_) => Ok(()),
            None => {
                let (conn, temporary_files) =
                    create_in_memory_sqlite_db(databases_store, tables).await?;

                let interrupt_handle = {
                    let conn = conn.lock();
                    conn.get_interrupt_handle()
                };
                self.conn = Some(conn);
                self.interrupt_handle = Some(Arc::new(tokio::sync::Mutex::new(interrupt_handle)));
                self.temporary_files = temporary_files;

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
                        .collect::<Result<serde_json::Map<String, serde_json::Value>>>()
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
    tables: Vec<LocalTable>,
) -> Result<(Arc<Mutex<Connection>>, Option<Vec<NamedTempFile>>)> {
    let conn = Connection::open_in_memory()?;
    let unique_table_names = get_transient_database_unique_table_names(&tables);

    let conn = Arc::new(Mutex::new(conn));

    let temporary_files = create_in_memory_sqlite_db_with_csv(
        conn.clone(),
        tables.clone(),
        unique_table_names.clone(),
    )
    .await?;
    create_in_memory_sqlite_db_without_csv(
        conn.clone(),
        databases_store.clone(),
        tables.clone(),
        unique_table_names.clone(),
    )
    .await?;

    Ok((conn, temporary_files))
}

async fn create_in_memory_sqlite_db_with_csv(
    conn: Arc<Mutex<Connection>>,
    tables: Vec<LocalTable>,
    unique_table_names: HashMap<String, String>,
) -> Result<Option<Vec<NamedTempFile>>> {
    if !ALLOW_USAGE_OF_CSV_FILES {
        return Ok(None);
    }

    let tables_with_csv = tables
        .iter()
        .filter(|lt| lt.table.migrated_to_csv())
        .map(|lt| lt.clone())
        .collect::<Vec<_>>();

    if tables_with_csv.is_empty() {
        return Ok(None);
    }

    // Load the csvtab module early but don't hold the lock
    {
        let conn_guard = conn.lock();
        rusqlite::vtab::csvtab::load_module(&conn_guard)?;
    } // Lock is released here

    let now = utils::now();

    // Process CSV files and create tables in parallel
    let csv_tasks: Vec<_> = tables_with_csv
        .into_iter()
        .map(|table| {
            let table_name = unique_table_names
                .get(&table.table.unique_id())
                .expect("Unreachable: table name not found in unique_table_names")
                .clone();

            let create_sql = table
                .table
                .schema_cached()
                .unwrap()
                .get_create_table_sql_string(&table_name);

            async move {
                let mut stream = Object::download_streamed(
                    &GoogleCloudStorageDatabasesStore::get_bucket()?,
                    &GoogleCloudStorageDatabasesStore::get_new_csv_storage_file_path(&table.table),
                )
                .await?;
                let mut temp_file = NamedTempFile::new()?;
                while let Some(byte) = stream.next().await {
                    temp_file.write_all(&[byte.unwrap()]).unwrap();
                }

                Ok::<_, anyhow::Error>((table_name, temp_file, create_sql))
            }
        })
        .collect();

    let csv_results = try_join_all(csv_tasks).await?;

    info!(
        duration = utils::now() - now,
        "DSSTRUCTSTAT - WORKER Finished downloading CSV files"
    );

    let now = utils::now();

    // Execute SQLite operations in spawn_blocking
    let temporary_files = task::spawn_blocking(move || {
        let mut temporary_files: Vec<NamedTempFile> = Vec::new();
        let conn = conn.lock(); // Lock inside the spawn_blocking

        for (table_name, temp_file, create_sql) in csv_results {
            let temp_file_path = temp_file.path().to_str().unwrap().to_string();
            let schema = format!(
                r#"
                CREATE VIRTUAL TABLE "{table_name}"
                USING csv(filename='{temp_file_path}', header=yes, schema='{create_sql}')
                "#
            );
            conn.execute_batch(schema.as_str())?;
            temporary_files.push(temp_file);
        }
        Ok::<_, anyhow::Error>(temporary_files)
    })
    .await??;

    info!(
        duration = utils::now() - now,
        "DSSTRUCTSTAT - WORKER Finished creating tables from CSV files"
    );

    Ok(Some(temporary_files))
}

async fn create_in_memory_sqlite_db_without_csv(
    conn: Arc<Mutex<Connection>>,
    databases_store: Box<dyn DatabasesStore + Sync + Send>,
    tables: Vec<LocalTable>,
    unique_table_names: HashMap<String, String>,
) -> Result<()> {
    let tables_without_csv = match ALLOW_USAGE_OF_CSV_FILES {
        true => tables
            .iter()
            .filter(|lt| !lt.table.migrated_to_csv())
            .map(|lt| lt.clone())
            .collect::<Vec<_>>(),
        false => tables.clone(),
    };

    if tables_without_csv.is_empty() {
        return Ok(());
    }

    let time_get_rows_start = utils::now();
    let tables_with_rows: Vec<(Table, Vec<Row>)> = try_join_all(tables.iter().map(|lt| {
        let databases_store = databases_store.clone();
        async move {
            let (rows, _) = databases_store.list_table_rows(&lt.table, None).await?;
            Ok::<_, anyhow::Error>((lt.table.clone(), rows))
        }
    }))
    .await?;

    let total_rows: usize = tables_with_rows.iter().map(|(_, rows)| rows.len()).sum();

    // Log table details including IDs and row counts
    for (table, rows) in &tables_with_rows {
        info!(
            project_id = table.project().project_id(),
            datasource_id = table.data_source_id(),
            table_id = table.unique_id(),
            row_count = rows.len(),
            "DSSTRUCTSTAT - WORKER Table statistics"
        );
    }

    info!(
        duration = utils::now() - time_get_rows_start,
        total_row_count = total_rows,
        table_count = tables_with_rows.len(),
        "DSSTRUCTSTAT - WORKER Finished retrieving rows"
    );

    // Create the in-memory database in a blocking thread (in-memory rusqlite is CPU).
    task::spawn_blocking(move || {
        let generate_create_table_sql_start = utils::now();
        let create_tables_sql: String = tables
            .into_iter()
            .filter_map(|lt| match lt.table.schema_cached() {
                Some(s) => {
                    if s.is_empty() {
                        None
                    } else {
                        let table_name = unique_table_names
                            .get(&lt.table.unique_id())
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

        let create_tables_execute_start = utils::now();
        let conn = conn.lock();
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

        Result::<_>::Ok(())
    })
    .await?
}
