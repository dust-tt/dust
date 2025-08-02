use anyhow::{anyhow, Result};
use async_std::stream::StreamExt;
use cloud_storage::{ListRequest, Object};
use futures::future::try_join_all;
use std::collections::HashMap;
use tracing::error;
use uuid::Uuid;

use crate::{
    databases::{
        csv::GoogleCloudStorageCSVContent,
        table::{Row, Table},
        table_schema::TableSchema,
    },
    databases_store::gcs::write_rows_to_bucket,
};

// This Store is used to pass upsert and delete call info from the APIs to the background worker
pub struct GoogleCloudStorageBackgroundProcessingStore {}

impl GoogleCloudStorageBackgroundProcessingStore {
    fn get_bucket() -> Result<String> {
        match std::env::var("DUST_TABLE_UPDATES_BUCKET") {
            Ok(bucket) => Ok(bucket),
            Err(_) => Err(anyhow!("DUST_TABLE_UPDATES_BUCKET is not set")),
        }
    }

    fn get_csv_storage_folder_path(table: &Table) -> String {
        format!(
            "project-{}/{}/{}/",
            table.project().project_id(),
            table.data_source_id(),
            table.table_id(),
        )
    }

    fn get_new_csv_storage_file_path(table: &Table, is_delete: bool) -> String {
        // We save the file differently if it's a delete operation
        let extension = if is_delete { "delete.csv" } else { "csv" };
        format!(
            "project-{}/{}/{}/{}.{}",
            table.project().project_id(),
            table.data_source_id(),
            table.table_id(),
            Uuid::new_v4().to_string(),
            extension
        )
    }

    async fn get_rows_from_csv(csv_path: String) -> Result<Vec<Row>> {
        let is_delete = csv_path.ends_with(".delete.csv");
        let csv = GoogleCloudStorageCSVContent {
            bucket: Self::get_bucket()?,
            bucket_csv_path: csv_path,
        };
        let mut rows = csv.parse().await?;

        // If it's a 'deleted rows' file, mark all rows as deleted
        if is_delete {
            for row in &mut rows {
                row.is_delete = true;
            }
        }
        Ok(rows)
    }

    pub async fn get_gcs_csv_file_names_for_table(table: &Table) -> Result<Vec<String>> {
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

    pub async fn get_deduped_rows_from_all_files(files: &Vec<String>) -> Result<Vec<Row>> {
        let mut all_rows = Vec::new();

        // We read all the files concurrently to speed up the process
        let row_futures = files
            .iter()
            .map(|file| Self::get_rows_from_csv(file.clone()));

        let rows_vec = try_join_all(row_futures).await?;
        for rows in rows_vec {
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
        // If this csv is for delete operations, we'll save the file with a different extension
        let is_delete = rows.get(0).map(|row| row.is_delete).unwrap_or(false);

        write_rows_to_bucket(
            schema,
            rows,
            &Self::get_bucket()?,
            &Self::get_new_csv_storage_file_path(table, is_delete),
        )
        .await?;

        Ok(())
    }

    pub async fn delete_files(files: &Vec<String>) -> Result<()> {
        // We delete the files concurrently to speed up the process
        let bucket = Self::get_bucket()?;
        let delete_futures = files.iter().map(|file| {
            let bucket = bucket.clone();
            async move {
                match Object::delete(&bucket, &file).await {
                    Ok(_) => Ok::<(), ()>(()),
                    Err(e) => {
                        error!("Failed to delete file {}: {}", file, e);
                        Ok::<(), ()>(())
                    }
                }
            }
        });

        // We ignore any deletion errors, other than logging them above
        let _results: Vec<Result<(), ()>> = futures::future::join_all(delete_futures).await;
        Ok(())
    }

    pub async fn delete_all_files_for_table(table: &Table) -> Result<()> {
        let files = Self::get_gcs_csv_file_names_for_table(table).await?;
        Self::delete_files(&files).await
    }
}
