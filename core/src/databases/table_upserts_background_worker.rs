use redis::AsyncCommands;
use std::collections::HashMap;
use tracing::error;

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
};

pub const REDIS_TABLE_UPSERT_HASH_NAME: &str = "TABLE_UPSERT";

#[derive(serde::Serialize, serde::Deserialize)]
pub struct TableUpsertCall {
    pub time: u64,
    pub project_id: i64,
    pub data_source_id: String,
    pub table_id: String,
}

pub async fn table_upserts_and_deletes_loop() {
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

    if let Some(client) = &*cache::REDIS_CLIENT {
        match client.get_async_connection().await {
            Ok(mut conn) => {
                loop {
                    let all_values: HashMap<String, String> =
                        conn.hgetall(REDIS_TABLE_UPSERT_HASH_NAME).await.unwrap();

                    let mut values: Vec<TableUpsertCall> = all_values
                        .values()
                        .filter_map(|json_value| serde_json::from_str(json_value).ok())
                        .collect();
                    values.sort_by(|a, b| b.time.cmp(&a.time));

                    for call in values {
                        let table = store
                            .load_data_source_table(
                                &Project::new_from_id(call.project_id),
                                &call.data_source_id,
                                &call.table_id,
                            )
                            .await
                            .unwrap();

                        match table {
                            Some(table) => {
                                let files = GoogleCloudStorageBackgroundProcessingStore::get_files_for_table(&table)
                                .await
                                .unwrap_or_else(|e| {
                                    error!("Error getting files for table: {}", e);
                                    vec![]
                                });
                                let rows = GoogleCloudStorageBackgroundProcessingStore::get_rows_from_all_files(&files).await
                                .unwrap_or_else(|e| {
                                    error!("Error getting rows from all files: {}", e);
                                    vec![]
                                });
                                let table = LocalTable::from_table(table).unwrap();
                                table
                                    .upsert_rows_now(&store, &databases_store, rows, false)
                                    .await
                                    .unwrap_or_else(|e| {
                                        error!("Error upserting rows: {}", e);
                                    });
                                // Delete the files after processing
                                GoogleCloudStorageBackgroundProcessingStore::delete_files(&files)
                                    .await
                                    .unwrap_or_else(|e| {
                                        error!("Error deleting files: {}", e);
                                    });
                            }
                            None => {
                                println!("Table not found for project_id: {}, data_source_id: {}, table_id: {}",
                                    call.project_id, call.data_source_id, call.table_id);
                                continue;
                            }
                        }
                    }

                    tokio::time::sleep(std::time::Duration::from_millis(1024 * 60)).await;
                }
            }
            Err(e) => {
                error!("Error connecting to Redis: {}.", e);
            }
        }
    }
}
