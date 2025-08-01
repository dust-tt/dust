use crate::error;
use anyhow::{anyhow, Result};
use async_std::stream::StreamExt;
use cloud_storage::{ListRequest, Object};
use futures::future::try_join_all;
use std::collections::HashMap;
use uuid::Uuid;

use crate::{
    databases::{
        csv::GoogleCloudStorageCSVContent,
        table::{CsvTable, Row, Table},
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

    async fn get_csv_table_from_csv(csv_path: String) -> Result<CsvTable> {
        let is_delete = csv_path.ends_with(".delete.csv");
        let csv = GoogleCloudStorageCSVContent {
            bucket: Self::get_bucket()?,
            bucket_csv_path: csv_path,
        };
        let mut table = csv.parse_to_table().await?;

        // If it's a 'deleted rows' file, mark all rows as deleted
        if is_delete {
            for row in &mut table.rows {
                row.is_delete = true;
            }
        }
        Ok(table)
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

    pub async fn get_deduped_csv_table_from_all_files(files: &Vec<String>) -> Result<CsvTable> {
        // We read all the files concurrently to speed up the process
        let table_futures = files
            .iter()
            .map(|file| Self::get_csv_table_from_csv(file.clone()));

        let tables = try_join_all(table_futures).await?;

        // If no tables, return empty
        if tables.is_empty() {
            return Ok(CsvTable::new(Vec::new()));
        }

        // Use the first table's headers as reference and verify all tables have the same headers
        let headers = tables[0].headers.clone();

        // Verify all tables have identical headers
        for (i, table) in tables.iter().enumerate().skip(1) {
            if table.headers != headers {
                return Err(anyhow!(
                    "Inconsistent headers found in CSV files. File {} has headers {:?} but expected {:?}",
                    i,
                    table.headers,
                    headers
                ));
            }
        }

        // Collect all rows with deduplication
        let mut seen_ids = HashMap::new();
        let mut unique_rows = Vec::new();

        // Process all tables, keeping only the last occurrence of each row_id
        for table in tables {
            for csv_row in table.rows {
                if let Some(existing_idx) = seen_ids.get(&csv_row.row_id) {
                    // Replace the existing row with the newer one
                    unique_rows[*existing_idx] = csv_row;
                } else {
                    // New row_id, add it
                    seen_ids.insert(csv_row.row_id.clone(), unique_rows.len());
                    unique_rows.push(csv_row);
                }
            }
        }

        Ok(CsvTable {
            headers,
            rows: unique_rows,
        })
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
