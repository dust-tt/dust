use lazy_static::lazy_static;
use redis::{AsyncCommands, Client as RedisClient};
use rslock::LockManager;
use std::{collections::HashMap, env, sync::Arc, time::Duration};
use tracing::{error, info};

use crate::{
    databases::table::{LocalTable, Table},
    databases_store::{
        self, gcs::GoogleCloudStorageDatabasesStore,
        gcs_background::GoogleCloudStorageBackgroundProcessingStore,
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
pub const REDIS_LOCK_TTL_SECONDS: u64 = 60;

const UPSERT_DEBOUNCE_TIME_MS: u64 = 10_000;

// Entries that have been stuck in the queue far past the debounce window are
// poison items (consistently failing), which we'd otherwise retry forever.
// Drop them once they exceed this age.
const MAX_UPSERT_AGE_MS: u64 = 60 * 60 * 1_000; // 1 hour

#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct TableUpsertActivityData {
    pub time: u64,
    pub project_id: i64,
    pub data_source_id: String,
    pub table_id: String,
    // Number of times we've started processing this entry without completing it. Bumped before
    // each attempt, so that an attempt killed mid-way (e.g. the process OOMs) still counts, and
    // used to ensure we never drop an entry that has never been tried (e.g. after the worker was
    // down longer than MAX_UPSERT_AGE_MS). Existing entries written before this field existed
    // default to 0.
    #[serde(default)]
    pub attempts: u32,
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
        key: &str,
        table_data: &TableUpsertActivityData,
    ) -> Result<(), anyhow::Error> {
        let files =
            GoogleCloudStorageBackgroundProcessingStore::get_gcs_csv_files_for_table(&table)
                .await?;
        // Only a bounded batch of the oldest files is merged per pass; the rest are left for the
        // next passes so memory use doesn't grow with the number of queued files.
        let (rows, batch_file_count) =
            GoogleCloudStorageBackgroundProcessingStore::get_deduped_rows_from_next_batch(&files)
                .await?;
        let batch_files: Vec<String> = files[..batch_file_count]
            .iter()
            .map(|file| file.name.clone())
            .collect();
        let remaining_file_count = files.len() - batch_file_count;
        info!(
            project_id = table_data.project_id,
            data_source_id = table_data.data_source_id,
            table_id = table_data.table_id,
            file_count = batch_file_count,
            remaining_file_count,
            row_count = rows.len(),
            "TableUpsertsBackgroundWorker: Processing upserts"
        );

        if !rows.is_empty() {
            let local_table = LocalTable::from_table(table.clone())?;
            if let Err(e) = local_table
                .upsert_rows_gcs(&self.store, &self.gcs_db_store, rows, false)
                .await
            {
                // If the csv file in GCS already has too many columns, we're in a state
                // where the background worker keeps failing and retrying.
                // It's best to ignore those errors, since there isn't much we can do about them.
                // Checking by error string is not ideal, but this is a tactical fix.
                if e.to_string().contains("Too many columns in CSV file") {
                    error!(
                        project_id = table_data.project_id,
                        data_source_id = table_data.data_source_id,
                        table_id = table_data.table_id,
                        "TableUpsertsBackgroundWorker: Too many columns in CSV file, ignoring: {}",
                        e
                    );
                } else if e.to_string().contains("CSV file is too large") {
                    // Likewise, if the csv file is too large, it's best to ignore those errors to prevent constant retries.
                    error!(
                        project_id = table_data.project_id,
                        data_source_id = table_data.data_source_id,
                        table_id = table_data.table_id,
                        "TableUpsertsBackgroundWorker: CSV file is too large, ignoring: {}",
                        e
                    );
                } else {
                    return Err(e);
                }
            }
        }

        if remaining_file_count == 0 {
            let _: () = self
                .redis_conn
                .hdel(REDIS_TABLE_UPSERT_HASH_NAME, key)
                .await?;
        } else {
            // Keep the entry (and its age anchor) so the next pass picks up the remaining files,
            // but reset attempts since this pass succeeded.
            let progressed_data = TableUpsertActivityData {
                attempts: 0,
                ..table_data.clone()
            };
            let _: () = self
                .redis_conn
                .hset(
                    REDIS_TABLE_UPSERT_HASH_NAME,
                    key,
                    serde_json::to_string(&progressed_data)?,
                )
                .await?;
        }

        GoogleCloudStorageBackgroundProcessingStore::delete_files(&batch_files).await?;

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

        if active_tables.is_empty() {
            return Ok(());
        }

        // This can get noisy, so only log if there are more than 10 pending tables
        if active_tables.len() >= 10 {
            info!(
                table_count = active_tables.len(),
                "TableUpsertsBackgroundWorker: active tables to process",
            );
        }

        let lock_manager = LockManager::new(vec![REDIS_URI.clone()]);
        for (key, mut table_data) in active_tables {
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
                    // Drop entries that have been stuck far past the debounce window AND have
                    // already failed at least once. These are poison items (consistently failing)
                    // that we'd otherwise retry forever. The attempts > 0 guard ensures we never
                    // drop an entry that has never been tried (e.g. if the worker was down for a
                    // long time, every queued entry would be old but untried).
                    // We also delete the table's CSV files; otherwise they stay orphaned in GCS
                    // and keep the pending-file count high, which would make the producer-side
                    // backpressure reject all future upserts for this table forever.
                    if time_since_last_upsert > MAX_UPSERT_AGE_MS && table_data.attempts > 0 {
                        error!(
                            table_id = table.table_id(),
                            age_ms = time_since_last_upsert,
                            attempts = table_data.attempts,
                            "TableUpsertsBackgroundWorker: Entry exceeded max age after failed attempts, dropping"
                        );
                        if let Err(e) =
                            GoogleCloudStorageBackgroundProcessingStore::delete_all_files_for_table(
                                &table,
                            )
                            .await
                        {
                            error!(
                                table_id = table.table_id(),
                                "TableUpsertsBackgroundWorker: Failed to delete files for dropped entry: {}",
                                e
                            );
                        }
                        let _: () = self
                            .redis_conn
                            .hdel(REDIS_TABLE_UPSERT_HASH_NAME, key)
                            .await?;
                        continue;
                    }

                    let mut now = utils::now();

                    let lock = match lock_manager
                        .lock(
                            table.get_background_processing_lock_name().as_bytes(),
                            Duration::from_secs(REDIS_LOCK_TTL_SECONDS),
                        )
                        .await
                    {
                        Ok(lock) => lock,
                        Err(e) => {
                            info!(
                                table_id = table.table_id(),
                                "TableUpsertsBackgroundWorker: Could not acquire upsert lock, skipping: {}",
                                e,
                            );
                            continue;
                        }
                    };

                    info!(
                        table_id = table.table_id(),
                        duration_ms = utils::now() - now,
                        "TableUpsertsBackgroundWorker: Upsert lock acquired"
                    );
                    now = utils::now();

                    // Record the attempt before processing so that, once this entry exceeds the
                    // max age, it gets dropped instead of being retried forever, even if
                    // processing kills the process (e.g. OOM) before it can record a failure. We
                    // keep `time` unchanged so the age anchor is preserved. Successful processing
                    // removes the entry or resets attempts, and new activity from the producer
                    // overwrites this entry and resets attempts to 0.
                    table_data.attempts += 1;
                    let _: () = self
                        .redis_conn
                        .hset(
                            REDIS_TABLE_UPSERT_HASH_NAME,
                            &key,
                            serde_json::to_string(&table_data)?,
                        )
                        .await?;

                    // If it fails, log an error but continue processing other tables.
                    // Also, we need to make sure the lock is always released.
                    if let Err(e) = self.process_table(&table, &key, &table_data).await {
                        error!(
                            table_id = table.table_id(),
                            "TableUpsertsBackgroundWorker: Failed to process table: {}", e
                        );
                    }

                    lock_manager.unlock(&lock).await;
                    info!(
                        table_id = table.table_id(),
                        duration_ms = utils::now() - now,
                        "TableUpsertsBackgroundWorker: Upsert lock released"
                    );
                }
                None => {
                    error!(
                        project_id = table_data.project_id,
                        data_source_id = table_data.data_source_id,
                        table_id = table_data.table_id,
                        "TableUpsertsBackgroundWorker: Table not found"
                    );

                    // Must have been some old leftover entry, so delete it from Redis so we don't keep trying
                    let _: () = self
                        .redis_conn
                        .hdel(REDIS_TABLE_UPSERT_HASH_NAME, key)
                        .await?;
                }
            }
        }

        Ok(())
    }

    pub async fn main_loop(&mut self) {
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
