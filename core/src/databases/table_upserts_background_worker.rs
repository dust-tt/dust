use redis::AsyncCommands;
use std::collections::HashMap;
use tracing::{error, info};

use crate::{
    cache,
    databases::table::LocalTable,
    databases_store::{
        self,
        gcs::GoogleCloudStorageDatabasesStore,
        gcs_background::GoogleCloudStorageBackgroundProcessingStore,
        store::{DatabasesStoreStrategy, CURRENT_STRATEGY},
    },
    project::Project,
    stores::{postgres, store},
    utils,
};

pub const REDIS_TABLE_UPSERT_HASH_NAME: &str = "TABLE_UPSERT";

const UPSERT_DEBOUNCE_TIME_MS: u64 = 30_000;

#[derive(serde::Serialize, serde::Deserialize)]
pub struct TableUpsertCallData {
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

    async fn loop_iteration(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        let all_values: HashMap<String, String> = self
            .redis_conn
            .hgetall(REDIS_TABLE_UPSERT_HASH_NAME)
            .await?;

        // This includes both upserts and deletes
        let mut upsert_calls: Vec<TableUpsertCallData> = all_values
            .values()
            .filter_map(|json_value| serde_json::from_str(json_value).ok())
            .collect();
        upsert_calls.sort_by(|a, b| a.time.cmp(&b.time));

        for call in upsert_calls {
            // They're ordered from oldest to newest, meaning we first see those that are most
            // likely to be past the debounce time. As soon as we find one that is not
            // past the debounce time, we can stop processing.
            // TODO: consider supporting a maximum wait time to prevent starvation
            let time_since_last_upsert = utils::now() - call.time; // time is in milliseconds, so we can compare directly
            if time_since_last_upsert < UPSERT_DEBOUNCE_TIME_MS {
                break;
            }

            let table = self
                .store
                .load_data_source_table(
                    &Project::new_from_id(call.project_id),
                    &call.data_source_id,
                    &call.table_id,
                )
                .await?;

            match table {
                Some(table) => {
                    info!(
                        "Processing upsert for project_id: {}, data_source_id: {}, table_id: {} ({}s since last upsert)",
                        call.project_id,
                        call.data_source_id,
                        call.table_id,
                        time_since_last_upsert / 1000
                    );

                    let files =
                        GoogleCloudStorageBackgroundProcessingStore::get_files_for_table(&table)
                            .await?;
                    let rows =
                        GoogleCloudStorageBackgroundProcessingStore::get_dedupped_rows_from_all_files(
                            &files,
                        )
                        .await?;
                    let local_table = LocalTable::from_table(table).unwrap();
                    local_table
                        .upsert_rows_now(&self.store, &self.databases_store, rows, false)
                        .await?;

                    // Remove the redist hash key for this table
                    let _: () = self
                        .redis_conn
                        .hdel(REDIS_TABLE_UPSERT_HASH_NAME, local_table.table.unique_id())
                        .await?;

                    GoogleCloudStorageBackgroundProcessingStore::delete_files(&files).await?;
                }
                None => {
                    error!(
                        "Table not found for project_id: {}, data_source_id: {}, table_id: {}",
                        call.project_id, call.data_source_id, call.table_id
                    );
                    continue;
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
