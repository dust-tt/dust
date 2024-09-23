use std::collections::HashMap;

use anyhow::{anyhow, Result};
use itertools::Itertools;
use serde::Serialize;
use tracing::info;

use crate::{
    databases::{
        database::{QueryDatabaseError, QueryResult, Table},
        table_schema::TableSchema,
    },
    sqlite_workers::client::{SqliteWorker, SqliteWorkerError, HEARTBEAT_INTERVAL_MS},
    stores::store::Store,
    utils,
};

impl From<SqliteWorkerError> for QueryDatabaseError {
    fn from(e: SqliteWorkerError) -> Self {
        match &e {
            SqliteWorkerError::TooManyResultRows => QueryDatabaseError::TooManyResultRows,
            SqliteWorkerError::QueryExecutionError(msg) => {
                QueryDatabaseError::ExecutionError(msg.clone())
            }
            _ => QueryDatabaseError::GenericError(e.into()),
        }
    }
}

#[derive(Debug, Serialize, Clone)]
pub struct TransientDatabase {
    created: u64,
    table_ids_hash: String,
    sqlite_worker: Option<SqliteWorker>,
}

impl TransientDatabase {
    pub fn new(created: u64, table_ids_hash: &str, sqlite_worker: &Option<SqliteWorker>) -> Self {
        TransientDatabase {
            created,
            table_ids_hash: table_ids_hash.to_string(),
            sqlite_worker: sqlite_worker.clone(),
        }
    }

    pub async fn invalidate(&self, store: Box<dyn Store + Sync + Send>) -> Result<()> {
        if let Some(worker) = self.sqlite_worker() {
            worker.invalidate_database(self.unique_id()).await?;
        } else {
            // If the worker is not alive, we delete the database row in case the worker becomes alive again.
            store.delete_database(self.unique_id()).await?;
        }

        Ok(())
    }

    pub fn sqlite_worker(&self) -> &Option<SqliteWorker> {
        &self.sqlite_worker
    }

    pub fn unique_id(&self) -> &str {
        &self.table_ids_hash
    }
}

pub async fn execute_query_on_transient_database(
    tables: &Vec<Table>,
    store: Box<dyn Store + Sync + Send>,
    query: &str,
) -> Result<(Vec<QueryResult>, TableSchema), QueryDatabaseError> {
    let table_ids_hash = tables.iter().map(|t| t.unique_id()).sorted().join("/");

    let database = store
        .upsert_database(&table_ids_hash, HEARTBEAT_INTERVAL_MS)
        .await?;

    let time_query_start = utils::now();

    let result_rows = match database.sqlite_worker() {
        Some(sqlite_worker) => {
            let result_rows = sqlite_worker
                .execute_query(&table_ids_hash, tables, query)
                .await?;
            result_rows
        }
        None => Err(anyhow!(
            "No live SQLite worker found for database {}",
            database.unique_id()
        ))?,
    };

    info!(
        duration = utils::now() - time_query_start,
        "DSSTRUCTSTAT Finished executing user query on worker"
    );

    let infer_result_schema_start = utils::now();
    let table_schema = TableSchema::from_rows(&result_rows)?;

    info!(
        duration = utils::now() - infer_result_schema_start,
        "DSSTRUCTSTAT Finished inferring schema"
    );
    info!(
        duration = utils::now() - time_query_start,
        "DSSTRUCTSTAT Finished query database"
    );

    Ok((result_rows, table_schema))
}

pub fn get_unique_table_names_for_transient_database(tables: &[Table]) -> HashMap<String, String> {
    let mut name_count: HashMap<&str, usize> = HashMap::new();

    tables
        .iter()
        .sorted_by_key(|table| table.unique_id())
        .map(|table| {
            let base_name = table.name();
            let count = name_count.entry(base_name).or_insert(0);
            *count += 1;

            (
                table.unique_id(),
                match *count {
                    1 => base_name.to_string(),
                    _ => format!("{}_{}", base_name, *count - 1),
                },
            )
        })
        .collect()
}
