use redis::AsyncCommands;
use rslock::LockManager;
use std::{collections::HashMap, time::Duration};
use tracing::{error, info};

use crate::{
    cache,
    databases::table::{LocalTable, Table},
    databases_store::{
        self,
        gcs::GoogleCloudStorageDatabasesStore,
        gcs_background::GoogleCloudStorageBackgroundProcessingStore,
        store::{DatabasesStoreStrategy, CURRENT_STRATEGY},
    },
    oauth::connection::REDIS_URI,
    project::Project,
    stores::{postgres, store},
    utils,
};

pub const REDIS_TABLE_UPSERT_HASH_NAME: &str = "TABLE_UPSERT";
static REDIS_LOCK_TTL_SECONDS: u64 = 15;

const UPSERT_DEBOUNCE_TIME_MS: u64 = 30_000;

#[derive(serde::Serialize, serde::Deserialize)]
pub struct TableUpsertActivityData {
    pub time: u64,
    pub project_id: i64,
    pub data_source_id: String,
    pub table_id: String,
}

pub struct TableUpsertsBackgroundWorker {
    store: Box<dyn store::Store + Sync + Send>,
    databases_store: Box<dyn databases_store::store::DatabasesStore + Sync + Send>,
    redis_conn: redis::aio::Connection,
}

impl TableUpsertsBackgroundWorker {
    pub async fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let store: Box<dyn store::Store + Sync + Send> = match std::env::var("CORE_DATABASE_URI") {
            Ok(db_uri) => {
                let store = postgres::PostgresStore::new(&db_uri).await;
                Box::new(store.unwrap())
            }
            Err(_) => panic!("CORE_DATABASE_URI is required (postgres)"),
        };

        let databases_store: Box<dyn databases_store::store::DatabasesStore + Sync + Send> =
            match CURRENT_STRATEGY {
                DatabasesStoreStrategy::PostgresOnly
                | DatabasesStoreStrategy::PostgresAndWriteToGCS => {
                    let store = databases_store::postgres::get_postgres_store()
                        .await
                        .unwrap();
                    Box::new(store)
                }
                DatabasesStoreStrategy::GCSOnly | DatabasesStoreStrategy::GCSAndWriteToPostgres => {
                    let store = GoogleCloudStorageDatabasesStore::new();
                    Box::new(store)
                }
            };

        let redis_conn = if let Some(client) = &*cache::REDIS_CLIENT {
            client.get_async_connection().await?
        } else {
            return Err("Redis client is not initialized".into());
        };

        Ok(Self {
            store,
            databases_store,
            redis_conn,
        })
    }

    async fn process_table(
        &mut self,
        table: &Table,
        key: String,
        table_data: TableUpsertActivityData,
    ) -> Result<(), Box<dyn std::error::Error>> {
        info!(
            "Processing upsert for project_id: {}, data_source_id: {}, table_id: {}",
            table_data.project_id, table_data.data_source_id, table_data.table_id
        );

        let files =
            GoogleCloudStorageBackgroundProcessingStore::get_gcs_csv_file_names_for_table(&table)
                .await?;
        let rows =
            GoogleCloudStorageBackgroundProcessingStore::get_dedupped_rows_from_all_files(&files)
                .await?;
        let local_table = LocalTable::from_table(table.clone()).unwrap();
        local_table
            .upsert_rows_now(
                &self.store,
                &self.databases_store,
                rows,
                false,
                false, /*postgres*/
                true,  /*gcs*/
            )
            .await?;

        let _: () = self
            .redis_conn
            .hdel(REDIS_TABLE_UPSERT_HASH_NAME, key)
            .await?;

        GoogleCloudStorageBackgroundProcessingStore::delete_files(&files).await?;

        Ok(())
    }

    async fn loop_iteration(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        let all_values: HashMap<String, String> = self
            .redis_conn
            .hgetall(REDIS_TABLE_UPSERT_HASH_NAME)
            .await?;

        // This includes both upserts and deletes
        let mut active_tables: Vec<(String, TableUpsertActivityData)> = all_values
            .into_iter()
            .filter_map(|(key, json_value)| {
                serde_json::from_str(&json_value)
                    .ok()
                    .map(|call_data| (key, call_data))
            })
            .collect();
        active_tables.sort_by(|a, b| a.1.time.cmp(&b.1.time));

        for (key, table_data) in active_tables {
            // They're ordered from oldest to newest, meaning we first see those that are most
            // likely to be past the debounce time. As soon as we find one that is not
            // past the debounce time, we can stop processing.
            // TODO: consider supporting a maximum wait time to prevent starvation
            let time_since_last_upsert = utils::now() - table_data.time; // time is in milliseconds, so we can compare directly
            if time_since_last_upsert < UPSERT_DEBOUNCE_TIME_MS {
                break;
            }

            let table = self
                .store
                .load_data_source_table(
                    &Project::new_from_id(table_data.project_id),
                    &table_data.data_source_id,
                    &table_data.table_id,
                )
                .await?;

            match table {
                Some(table) => {
                    let now = utils::now();
                    let lock_manager = LockManager::new(vec![REDIS_URI.clone()]);

                    let lock = lock_manager
                        .acquire_no_guard(
                            format!("upsert:{}", table.unique_id()).as_bytes(),
                            Duration::from_secs(REDIS_LOCK_TTL_SECONDS),
                        )
                        .await?;

                    info!(
                        lock_acquisition_duration = utils::now() - now,
                        "Upsert lock acquired"
                    );

                    self.process_table(&table, key.clone(), table_data).await?;

                    lock_manager.unlock(&lock).await;
                }
                None => {
                    error!(
                        "Table not found for project_id: {}, data_source_id: {}, table_id: {}",
                        table_data.project_id, table_data.data_source_id, table_data.table_id
                    );
                }
            }
        }

        Ok(())
    }

    pub async fn main_loop(&mut self) {
        loop {
            if let Err(e) = self.loop_iteration().await {
                error!("Error in TableUpsertsBackgroundWorker loop: {}", e);
            }
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        }
    }

    pub async fn start_loop() {
        let mut worker = TableUpsertsBackgroundWorker::new().await.unwrap();
        worker.main_loop().await;
    }
}
