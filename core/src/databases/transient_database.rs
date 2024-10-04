use std::{collections::HashMap, sync::Arc};

use anyhow::{anyhow, Result};
use itertools::Itertools;
use serde::Serialize;
use tracing::info;

use crate::{
    databases::{
        database::{QueryDatabaseError, QueryResult},
        table::LocalTable,
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
    tables: &Vec<LocalTable>,
    store: Box<dyn Store + Sync + Send>,
    query: &str,
) -> Result<(Vec<QueryResult>, TableSchema), QueryDatabaseError> {
    let table_ids_hash = tables
        .iter()
        .map(|lt| lt.table.unique_id())
        .sorted()
        .join("/");

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

    let result_rows = Arc::new(result_rows);

    info!(
        duration = utils::now() - time_query_start,
        "DSSTRUCTSTAT Finished executing user query on worker"
    );

    let infer_result_schema_start = utils::now();
    let table_schema = TableSchema::from_rows_async(result_rows.clone()).await?;

    info!(
        duration = utils::now() - infer_result_schema_start,
        "DSSTRUCTSTAT Finished inferring schema"
    );
    info!(
        duration = utils::now() - time_query_start,
        "DSSTRUCTSTAT Finished query database"
    );

    let result_rows = match Arc::try_unwrap(result_rows) {
        Ok(result_rows) => result_rows,
        Err(_) => Err(anyhow!(
            "Unexpected error: could not unwrap Arc result_rows for database {}",
            database.unique_id()
        ))?,
    };

    Ok((result_rows, table_schema))
}

pub fn get_transient_database_unique_table_names(
    tables: &Vec<LocalTable>,
) -> HashMap<String, String> {
    let mut name_count: HashMap<&str, usize> = HashMap::new();

    tables
        .iter()
        .sorted_by_key(|lt| lt.table.unique_id())
        .map(|lt| {
            let base_name = lt.table.name();
            let count = name_count.entry(base_name).or_insert(0);
            *count += 1;

            (
                lt.table.unique_id(),
                match *count {
                    1 => base_name.to_string(),
                    _ => format!("{}_{}", base_name, *count - 1),
                },
            )
        })
        .collect()
}

pub struct TransientDatabaseTableInfo {
    pub unique_name: String,
    pub head: Vec<QueryResult>,
}

pub async fn get_transient_database_tables_info(
    tables: &Vec<LocalTable>,
    store: Box<dyn Store + Sync + Send>,
) -> Result<Vec<TransientDatabaseTableInfo>> {
    let table_ids_hash = tables
        .iter()
        .map(|lt| lt.table.unique_id())
        .sorted()
        .join("/");

    let database = store
        .upsert_database(&table_ids_hash, HEARTBEAT_INTERVAL_MS)
        .await?;

    let time_query_start = utils::now();
    let mut results: Vec<TransientDatabaseTableInfo> = Vec::new();

    let unique_table_names = get_transient_database_unique_table_names(tables);

    for lt in tables {
        let unique_name = unique_table_names.get(&lt.table.unique_id()).expect(
            "Unreachable: unique_table_names should have an entry for each table in tables",
        );

        let result = match database.sqlite_worker() {
            Some(sqlite_worker) => {
                let result = sqlite_worker
                    .execute_query(
                        &table_ids_hash,
                        tables,
                        &format!(
                            "SELECT * FROM \"{}\" ORDER BY RANDOM() LIMIT 16",
                            unique_name
                        ),
                    )
                    .await?;
                result
            }
            None => Err(anyhow!(
                "No live SQLite worker found for database {}",
                database.unique_id()
            ))?,
        };

        results.push(TransientDatabaseTableInfo {
            unique_name: unique_name.to_string(),
            head: result,
        });
    }

    info!(
        duration = utils::now() - time_query_start,
        "DSSTRUCTSTAT Finished retrieving tables info from worker"
    );

    Ok(results)
}
