use anyhow::{anyhow, Result};
use async_std::stream::StreamExt;
use cloud_storage::{ListRequest, Object};
use redis::AsyncCommands;
use std::collections::HashMap;
use tracing::error;

use crate::{
    cache,
    databases::{
        csv::GoogleCloudStorageCSVContent,
        table::{LocalTable, Row, Table},
        table_schema::TableSchema,
    },
    databases_store::{
        self,
        gcs::{write_rows_to_csv_helper, GoogleCloudStorageDatabasesStore},
        store::{DatabasesStoreStrategy, CURRENT_STRATEGY},
    },
    project::Project,
    stores::{postgres, store},
    utils,
};

pub const REDIS_TABLE_UPSERT_HASH_NAME: &str = "TABLE_UPSERT";

#[derive(serde::Serialize, serde::Deserialize)]
pub struct TableUpsertCall {
    pub time: u64,
    pub project_id: i64,
    pub data_source_id: String,
    pub table_id: String,
}

#[derive(Clone)]
pub struct GoogleCloudStorageBackgroundProcessingStore {}

impl GoogleCloudStorageBackgroundProcessingStore {
    fn get_bucket() -> Result<String> {
        match std::env::var("DUST_UPSERT_QUEUE_BUCKET") {
            Ok(bucket) => Ok(bucket),
            Err(_) => Err(anyhow!("DUST_UPSERT_QUEUE_BUCKET is not set")),
        }
    }

    fn get_csv_storage_folder_path(table: &Table) -> String {
        format!(
            "project-{}__{}__{}/",
            table.project().project_id(),
            table.data_source_id(),
            table.table_id(),
        )
    }

    fn get_csv_storage_file_path(table: &Table) -> String {
        format!(
            "project-{}__{}__{}/{}.csv",
            table.project().project_id(),
            table.data_source_id(),
            table.table_id(),
            utils::now()
        )
    }

    async fn get_rows_from_csv(csv_path: String) -> Result<Vec<Row>> {
        let csv = GoogleCloudStorageCSVContent {
            bucket: Self::get_bucket()?,
            bucket_csv_path: csv_path,
        };
        csv.parse().await
    }

    pub async fn get_rows_from_all_csvs(table: &Table) -> Result<Vec<Row>> {
        let bucket = Self::get_bucket()?;
        let bucket_folder_path = Self::get_csv_storage_folder_path(table);
        let list_request = ListRequest {
            prefix: Some(bucket_folder_path),
            delimiter: None,
            end_offset: None,
            include_trailing_delimiter: None,
            max_results: None,
            page_token: None,
            projection: None,
            start_offset: None,
            versions: None,
        };
        let stream = Object::list(&bucket, list_request).await?;

        let mut s = Box::pin(stream);
        let mut all_rows = Vec::new();

        while let Some(result) = s.next().await {
            match result {
                Ok(object_list) => {
                    for object in object_list.items {
                        let rows = Self::get_rows_from_csv(object.name).await?;
                        all_rows.extend(rows);
                    }
                }
                Err(e) => {
                    error!("Failed to list objects in GCS: {}", e);
                }
            }
        }

        // Dedup rows by row_id, keeping only the last one
        let mut unique_rows = HashMap::new();
        for row in all_rows.into_iter() {
            unique_rows.insert(row.row_id.clone(), row);
        }

        Ok(unique_rows.into_values().collect())
    }

    pub async fn write_rows_to_csv(
        table: &Table,
        schema: &TableSchema,
        rows: &Vec<Row>,
    ) -> Result<(), anyhow::Error> {
        write_rows_to_csv_helper(
            schema,
            rows,
            &Self::get_bucket()?,
            &Self::get_csv_storage_file_path(table),
        )
        .await?;

        Ok(())
    }
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
            Ok(mut conn) => loop {
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
                            let rows = GoogleCloudStorageBackgroundProcessingStore::get_rows_from_all_csvs(&table)
                                .await
                                .unwrap_or_else(|e| {
                                    error!("Error getting rows from all CSVs: {}", e);
                                    vec![]
                                });
                            let table = LocalTable::from_table(table).unwrap();
                            table
                                .upsert_rows_now(&store, &databases_store, rows, false)
                                .await
                                .unwrap_or_else(|e| {
                                    error!("Error upserting rows: {}", e);
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
            },
            Err(e) => {
                error!("Error connecting to Redis: {}.", e);
            }
        }
    }
}
