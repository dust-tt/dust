use lazy_static::lazy_static;
use redis::{AsyncCommands, Client as RedisClient};
use rslock::LockManager;
use std::{collections::HashMap, env, sync::Arc, time::Duration};
use tracing::{error, info};

use crate::{
    databases::table::{LocalTable, Table},
    databases_store::{
        self, gcs::GoogleCloudStorageDatabasesStore,
        gcs_background::GoogleCloudStorageBackgroundProcessingStore, store::SAVE_TABLES_TO_GCS,
    },
    project::Project,
    stores::{postgres, store},
    utils,
};

// Define a static Redis client with lazy initialization
lazy_static! {
    pub static ref REDIS_URI: String = env::var("REDIS_URI").unwrap();
    pub static ref REDIS_CLIENT: Arc<RedisClient> = {
        match RedisClient::open(&**REDIS_URI) {
            Ok(client) => Arc::new(client),
            Err(e) => panic!(
                "Failed to connect to Redis: {}. Redis client must be initialized.",
                e
            ),
        }
    };
}

pub const REDIS_TABLE_UPSERT_HASH_NAME: &str = "TABLE_UPSERT";
pub const REDIS_LOCK_TTL_SECONDS: u64 = 15;

const UPSERT_DEBOUNCE_TIME_MS: u64 = 10_000;

#[derive(serde::Serialize, serde::Deserialize)]
pub struct TableUpsertActivityData {
    pub time: u64,
    pub project_id: i64,
    pub data_source_id: String,
    pub table_id: String,
}

pub struct TableUpsertsBackgroundWorker {
    store: Box<dyn store::Store + Sync + Send>,
    gcs_db_store: Box<dyn databases_store::store::DatabasesStore + Sync + Send>,
    redis_conn: redis::aio::Connection,
}

impl TableUpsertsBackgroundWorker {
    pub async fn new() -> Result<Self, anyhow::Error> {
        let store: Box<dyn store::Store + Sync + Send> = match std::env::var("CORE_DATABASE_URI") {
            Ok(db_uri) => {
                let store = postgres::PostgresStore::new(&db_uri).await;
                Box::new(store.unwrap())
            }
            Err(_) => {
                return Err(anyhow::anyhow!("CORE_DATABASE_URI is required (postgres)"));
            }
        };

        let gcs_db_store: Box<dyn databases_store::store::DatabasesStore + Sync + Send> =
            Box::new(GoogleCloudStorageDatabasesStore::new());

        let redis_conn = REDIS_CLIENT.get_async_connection().await?;

        Ok(Self {
            store,
            gcs_db_store,
            redis_conn,
        })
    }

    async fn process_table(
        &mut self,
        table: &Table,
        key: String,
        table_data: TableUpsertActivityData,
    ) -> Result<(), anyhow::Error> {
        let files =
            GoogleCloudStorageBackgroundProcessingStore::get_gcs_csv_file_names_for_table(&table)
                .await?;
        let rows =
            GoogleCloudStorageBackgroundProcessingStore::get_deduped_rows_from_all_files(&files)
                .await?;
        info!(
            project_id = table_data.project_id,
            data_source_id = table_data.data_source_id,
            table_id = table_data.table_id,
            file_count = files.len(),
            row_count = rows.len(),
            "TableUpsertsBackgroundWorker: Processing upserts"
        );

        let local_table = LocalTable::from_table(table.clone())?;
        local_table
            .upsert_rows_gcs(&self.store, &self.gcs_db_store, rows, false)
            .await?;

        let _: () = self
            .redis_conn
            .hdel(REDIS_TABLE_UPSERT_HASH_NAME, key)
            .await?;

        GoogleCloudStorageBackgroundProcessingStore::delete_files(&files).await?;

        Ok(())
    }

    async fn loop_iteration(&mut self) -> Result<(), anyhow::Error> {
        let all_values: HashMap<String, String> = self
            .redis_conn
            .hgetall(REDIS_TABLE_UPSERT_HASH_NAME)
            .await?;

        // Get the list of tables for which there has been non-truncate activity (upserts or deletes)
        let active_tables = tokio::task::spawn_blocking(move || {
            let mut active_tables: Vec<(String, TableUpsertActivityData)> = all_values
                .into_iter()
                .filter_map(|(key, json_value)| {
                    serde_json::from_str(&json_value)
                        .ok()
                        .map(|call_data| (key, call_data))
                })
                .collect();
            active_tables.sort_by(|a, b| a.1.time.cmp(&b.1.time));
            active_tables
        })
        .await?;

        if !active_tables.is_empty() {
            info!(
                table_count = active_tables.len(),
                "TableUpsertsBackgroundWorker: active tables to process",
            );
        }
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
                            table.get_background_processing_lock_name().as_bytes(),
                            Duration::from_secs(REDIS_LOCK_TTL_SECONDS),
                        )
                        .await?;

                    info!(
                        lock_acquisition_duration = utils::now() - now,
                        "TableUpsertsBackgroundWorker: Upsert lock acquired"
                    );

                    self.process_table(&table, key.clone(), table_data).await?;

                    lock_manager.unlock(&lock).await;
                }
                None => {
                    error!(
                        "TableUpsertsBackgroundWorker: Table not found for project_id: {}, data_source_id: {}, table_id: {}",
                        table_data.project_id, table_data.data_source_id, table_data.table_id
                    );
                }
            }
        }

        Ok(())
    }

    pub async fn main_loop(&mut self) {
        if !SAVE_TABLES_TO_GCS {
            info!("TableUpsertsBackgroundWorker: We're not saving tables to GCS, skipping loop");
            return;
        }

        info!("TableUpsertsBackgroundWorker: starting main loop");

        loop {
            if let Err(e) = self.loop_iteration().await {
                error!("TableUpsertsBackgroundWorker: Error in loop: {}", e);
            }
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        }
    }

    pub async fn start_loop() {
        match TableUpsertsBackgroundWorker::new().await {
            Ok(mut worker) => worker.main_loop().await,
            Err(e) => {
                error!(
                    "TableUpsertsBackgroundWorker: Failed to start worker: {}",
                    e
                );
            }
        }
    }
}
