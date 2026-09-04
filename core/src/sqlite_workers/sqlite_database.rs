use crate::{
    databases::{
        database::QueryResult, table::LocalTable, table_schema::quote_sqlite_identifier,
        transient_database::get_transient_database_unique_table_names,
    },
    databases_store::{gcs::GoogleCloudStorageDatabasesStore, store::DatabasesStore},
    gcs_client::gcs_client,
    utils,
};
use anyhow::{anyhow, Result};
use futures::future::try_join_all;
use parking_lot::Mutex;
use rayon::prelude::*;
use rusqlite::{
    config::DbConfig,
    hooks::{AuthAction, AuthContext, Authorization},
    Batch, Connection, InterruptHandle,
};
use std::{collections::HashMap, io::Write, sync::Arc};
use tempfile::NamedTempFile;
use thiserror::Error;
use tokio::{task, time::timeout};
use tokio_stream::StreamExt;
use tracing::{error, info};

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

            let mut statements = Batch::new(&conn, &query);
            let stmt = statements
                .next()
                .map_err(|e| SqliteDatabaseError::QueryExecutionError(anyhow::Error::new(e)))?;
            let mut stmt = stmt.ok_or_else(|| {
                SqliteDatabaseError::QueryExecutionError(anyhow!("Query must contain a statement"))
            })?;

            if statements
                .next()
                .map_err(|e| SqliteDatabaseError::QueryExecutionError(anyhow::Error::new(e)))?
                .is_some()
            {
                return Err(SqliteDatabaseError::QueryExecutionError(anyhow!(
                    "Query must contain a single statement"
                )));
            }

            if !stmt.readonly() {
                return Err(SqliteDatabaseError::QueryExecutionError(anyhow!(
                    "Query must be read-only"
                )));
            }

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
    _: Box<dyn DatabasesStore + Sync + Send>,
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

    configure_connection_for_user_queries(&conn.lock())?;

    Ok((conn, temporary_files))
}

fn configure_connection_for_user_queries(conn: &Connection) -> Result<()> {
    conn.set_db_config(DbConfig::SQLITE_DBCONFIG_DEFENSIVE, true)?;
    conn.pragma_update(None, "query_only", true)?;
    conn.authorizer(Some(authorize_user_query));
    Ok(())
}

fn authorize_user_query(context: AuthContext<'_>) -> Authorization {
    match context.action {
        AuthAction::Select | AuthAction::Read { .. } | AuthAction::Recursive => {
            Authorization::Allow
        }
        AuthAction::Function { function_name } if function_name != "load_extension" => {
            Authorization::Allow
        }
        _ => Authorization::Deny,
    }
}

fn quote_sqlite_string_literal(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

fn create_csv_virtual_table(
    conn: &Connection,
    table_name: &str,
    temp_file_path: &str,
    create_sql: &str,
) -> Result<()> {
    let schema = format!(
        "CREATE VIRTUAL TABLE {} USING csv(filename={}, header=yes, schema={})",
        quote_sqlite_identifier(table_name),
        quote_sqlite_string_literal(temp_file_path),
        quote_sqlite_string_literal(create_sql)
    );
    let mut statements = Batch::new(conn, &schema);
    let mut statement = statements
        .next()?
        .ok_or_else(|| anyhow!("Failed to prepare CSV virtual table statement"))?;

    if statements.next()?.is_some() {
        return Err(anyhow!(
            "CSV virtual table schema must contain a single statement"
        ));
    }

    statement.execute([])?;
    Ok(())
}

async fn create_in_memory_sqlite_db_with_csv(
    conn: Arc<Mutex<Connection>>,
    tables: Vec<LocalTable>,
    unique_table_names: HashMap<String, String>,
) -> Result<Option<Vec<NamedTempFile>>> {
    // Load the csvtab module early but don't hold the lock
    {
        let conn_guard = conn.lock();
        rusqlite::vtab::csvtab::load_module(&conn_guard)?;
    } // Lock is released here

    let now = utils::now();

    info!(
        table_count = tables.len(),
        "DSSTRUCTSTAT - WORKER downloading CSV files"
    );

    // Process CSV files and create tables in parallel
    let csv_tasks: Vec<_> = tables
        .into_iter()
        .map(|table| {
            let table_name = unique_table_names
                .get(&table.table.unique_id())
                .expect("Unreachable: table name not found in unique_table_names")
                .clone();

            // csvtab only uses the declared columns, so don't duplicate the user-controlled
            // virtual table name inside its nested schema.
            let create_sql = table
                .table
                .schema_cached()
                .unwrap()
                .get_create_table_sql_string("x");

            if table.table.is_schema_stale() {
                error!("Schema is stale for table {} but it should never happen as get_database_schema() should have been called first and recomputed the schema.", table.table.unique_id());
            }

            async move {
                let mut stream = gcs_client()
                    .await?
                    .object()
                    .download_streamed(
                        &GoogleCloudStorageDatabasesStore::get_bucket()?,
                        &GoogleCloudStorageDatabasesStore::get_csv_storage_file_path(&table.table),
                    )
                    .await?;
                let mut temp_file = NamedTempFile::new()?;

                // Buffer bytes to avoid writing one byte at a time
                const BUFFER_SIZE: usize = 64 * 1024; // 64KB buffer
                let mut buffer = Vec::with_capacity(BUFFER_SIZE);

                while let Some(byte_result) = stream.next().await {
                    let byte = byte_result?;
                    buffer.push(byte);

                    // Write buffer when it's full
                    if buffer.len() >= BUFFER_SIZE {
                        temp_file.write_all(&buffer)?;
                        buffer.clear();
                    }
                }

                // Write any remaining bytes in the buffer
                if !buffer.is_empty() {
                    temp_file.write_all(&buffer)?;
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
            let temp_file_path = temp_file
                .path()
                .to_str()
                .ok_or_else(|| anyhow!("Temporary CSV file path is not valid UTF-8"))?;
            create_csv_virtual_table(&conn, &table_name, temp_file_path, &create_sql)?;
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::databases::table_schema::{TableSchema, TableSchemaColumn, TableSchemaFieldType};
    use std::path::Path;

    fn create_test_database() -> Result<SqliteDatabase> {
        let conn = Connection::open_in_memory()?;
        rusqlite::vtab::csvtab::load_module(&conn)?;
        conn.execute_batch("CREATE TABLE data (value TEXT); INSERT INTO data VALUES ('allowed');")?;
        configure_connection_for_user_queries(&conn)?;

        let interrupt_handle = conn.get_interrupt_handle();
        Ok(SqliteDatabase {
            conn: Some(Arc::new(Mutex::new(conn))),
            interrupt_handle: Some(Arc::new(tokio::sync::Mutex::new(interrupt_handle))),
            temporary_files: None,
        })
    }

    #[tokio::test]
    async fn allows_read_only_queries() -> Result<()> {
        let database = create_test_database()?;

        let result = database
            .query("SELECT upper(value) AS value FROM data", 1_000)
            .await?;

        assert_eq!(result.len(), 1);
        assert_eq!(result[0].value["value"], "ALLOWED");
        Ok(())
    }

    #[tokio::test]
    async fn rejects_file_reads_through_csv_virtual_tables() -> Result<()> {
        let database = create_test_database()?;
        let mut target_file = NamedTempFile::new()?;
        target_file.write_all(b"secret")?;
        let query = format!(
            "CREATE VIRTUAL TABLE stolen USING csv(filename='{}', header=no)",
            target_file.path().display()
        );

        let result = database.query(&query, 1_000).await;

        assert!(matches!(
            result,
            Err(SqliteDatabaseError::QueryExecutionError(_))
        ));
        Ok(())
    }

    #[tokio::test]
    async fn rejects_file_writes() -> Result<()> {
        let database = create_test_database()?;
        let output_directory = tempfile::tempdir()?;
        let attached_database_path = output_directory.path().join("attached-database");
        let vacuum_output_path = output_directory.path().join("vacuum-output");

        let attach_result = database
            .query(
                &format!(
                    "ATTACH DATABASE '{}' AS writable",
                    attached_database_path.display()
                ),
                1_000,
            )
            .await;
        let vacuum_result = database
            .query(
                &format!("VACUUM INTO '{}'", vacuum_output_path.display()),
                1_000,
            )
            .await;

        assert!(matches!(
            attach_result,
            Err(SqliteDatabaseError::QueryExecutionError(_))
        ));
        assert!(matches!(
            vacuum_result,
            Err(SqliteDatabaseError::QueryExecutionError(_))
        ));
        assert!(!attached_database_path.exists());
        assert!(!vacuum_output_path.exists());
        Ok(())
    }

    #[tokio::test]
    async fn rejects_multiple_statements() -> Result<()> {
        let database = create_test_database()?;

        let result = database.query("SELECT 1; SELECT 2", 1_000).await;

        assert!(matches!(
            result,
            Err(SqliteDatabaseError::QueryExecutionError(_))
        ));
        Ok(())
    }

    fn assert_csv_identifiers_are_safe(
        table_name: &str,
        column_name: &str,
        marker_path: &Path,
    ) -> Result<()> {
        let conn = Connection::open_in_memory()?;
        rusqlite::vtab::csvtab::load_module(&conn)?;
        let mut csv_file = NamedTempFile::new()?;
        {
            let mut writer = csv::Writer::from_writer(csv_file.as_file_mut());
            writer.write_record([column_name])?;
            writer.write_record(["safe"])?;
            writer.flush()?;
        }
        let schema = TableSchema::from_columns(vec![TableSchemaColumn::new(
            column_name,
            TableSchemaFieldType::Text,
            None,
            None,
        )]);
        let create_sql = schema.get_create_table_sql_string("x");
        let csv_file_path = csv_file
            .path()
            .to_str()
            .ok_or_else(|| anyhow!("Temporary CSV file path is not valid UTF-8"))?;

        create_csv_virtual_table(&conn, table_name, csv_file_path, &create_sql)?;

        let _value: String = conn.query_row(
            &format!(
                "SELECT {} FROM {} LIMIT 1",
                quote_sqlite_identifier(column_name),
                quote_sqlite_identifier(table_name)
            ),
            [],
            |row| row.get(0),
        )?;
        assert!(!marker_path.exists());
        Ok(())
    }

    #[test]
    fn table_name_cannot_inject_setup_statements() -> Result<()> {
        let output_directory = tempfile::tempdir()?;
        let marker_path = output_directory.path().join("table-name-marker");
        let table_name = format!(
            "data\" USING csv(filename='/etc/hosts', header=no); ATTACH DATABASE '{}' AS injected; CREATE TABLE injected.t(c); --",
            marker_path.display()
        );

        assert_csv_identifiers_are_safe(&table_name, "value", &marker_path)
    }

    #[test]
    fn column_name_cannot_inject_setup_statements() -> Result<()> {
        let output_directory = tempfile::tempdir()?;
        let marker_path = output_directory.path().join("column-name-marker");
        let column_name = format!(
            "value\" TEXT)' ); ATTACH DATABASE '{}' AS injected; CREATE TABLE injected.t(c); --",
            marker_path.display()
        );

        assert_csv_identifiers_are_safe("data", &column_name, &marker_path)
    }
}
