use anyhow::{anyhow, Result};
use async_std::stream::StreamExt;
use cloud_storage::{ListRequest, Object};
use std::collections::HashMap;
use tracing::error;

use crate::{
    databases::{
        csv::GoogleCloudStorageCSVContent,
        table::{Row, Table},
        table_schema::TableSchema,
    },
    databases_store::gcs::write_rows_to_csv_helper,
    utils,
};

// This Store is used to pass upsert and delete call info from the APIs to the background worker
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

    pub async fn get_files_for_table(table: &Table) -> Result<Vec<String>> {
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

        let mut pinned_stream = Box::pin(stream);
        let mut files = Vec::new();

        while let Some(result) = pinned_stream.next().await {
            match result {
                Ok(object_list) => {
                    for object in object_list.items {
                        files.push((object.name, object.time_created));
                    }
                }
                Err(e) => {
                    error!("Failed to list objects in GCS: {}", e);
                }
            }
        }

        // Sort files by time_created (oldest first)
        files.sort_by_key(|(_, time_created)| *time_created);

        // Extract only the file names
        Ok(files.into_iter().map(|(name, _)| name).collect())
    }

    pub async fn get_rows_from_all_files(files: &Vec<String>) -> Result<Vec<Row>> {
        let mut all_rows = Vec::new();

        for file in files {
            let rows = Self::get_rows_from_csv(file.clone()).await?;
            all_rows.extend(rows);
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

    pub async fn delete_files(files: &Vec<String>) -> Result<()> {
        let bucket = Self::get_bucket()?;
        for file in files {
            if let Err(e) = Object::delete(&bucket, file).await {
                error!("Failed to delete file {}: {}", file, e);
            }
        }
        Ok(())
    }
}
