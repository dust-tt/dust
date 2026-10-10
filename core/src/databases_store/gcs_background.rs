use anyhow::{anyhow, Result};
use async_std::stream::StreamExt;
use cloud_storage::ListRequest;
use std::{collections::HashMap, future::Future};
use tracing::error;
use uuid::Uuid;

use crate::{
    databases::{
        csv::{
            GoogleCloudStorageCSVContent, MAX_CSV_FILE_SIZE_BYTES, MAX_TABLE_CELLS, MAX_TABLE_ROWS,
        },
        table::{Row, Table},
        table_schema::TableSchema,
    },
    databases_store::gcs::write_rows_to_bucket,
    gcs_client::gcs_client,
};

// Upper bounds on the pending CSV content merged in a single background pass for a table. They
// match the limits of a single CSV file, which the worker must be able to handle anyway.
const MAX_BATCH_BYTES: u64 = MAX_CSV_FILE_SIZE_BYTES;
const MAX_BATCH_ROWS: usize = MAX_TABLE_ROWS;
const MAX_BATCH_CELLS: usize = MAX_TABLE_CELLS;

pub struct PendingCsvFile {
    pub name: String,
    pub size: u64,
}

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

    pub async fn get_gcs_csv_files_for_table(table: &Table) -> Result<Vec<PendingCsvFile>> {
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
        let stream = gcs_client()
            .await?
            .object()
            .list(&bucket, list_request)
            .await?;

        let mut pinned_stream = Box::pin(stream);
        let mut files = Vec::new();

        while let Some(result) = pinned_stream.next().await {
            match result {
                Ok(object_list) => {
                    for object in object_list.items {
                        files.push((object.time_created, object.name, object.size));
                    }
                }
                Err(e) => {
                    error!("Failed to list objects in GCS: {}", e);
                }
            }
        }

        // Sort files by time_created (oldest first)
        files.sort_by_key(|(time_created, _, _)| *time_created);

        Ok(files
            .into_iter()
            .map(|(_, name, size)| PendingCsvFile { name, size })
            .collect())
    }

    /**
     * @cc [owner:davidebbo,label:performance;security] bounded-batch
     * Only a prefix of `files` (expected oldest first) is read, and the returned count is its
     * length. The prefix MUST NOT exceed `MAX_BATCH_BYTES` (by listed size), `MAX_BATCH_ROWS`
     * (parsed rows) or `MAX_BATCH_CELLS` (parsed row columns), except that the first file is
     * always included when `files` is non-empty so the queue keeps draining. Files past the prefix
     * MUST NOT be read beyond the one file whose rows overflow the row or cell budget.
     */
    /**
     * @cc [owner:davidebbo,label:product] dedup-last-wins
     * Rows are deduped by `row_id`, keeping the row from the latest file in the prefix.
     */
    pub async fn get_deduped_rows_from_next_batch(
        files: &[PendingCsvFile],
    ) -> Result<(Vec<Row>, usize)> {
        Self::get_deduped_rows_from_next_batch_with(files, Self::get_rows_from_csv).await
    }

    async fn get_deduped_rows_from_next_batch_with<F, Fut>(
        files: &[PendingCsvFile],
        get_rows: F,
    ) -> Result<(Vec<Row>, usize)>
    where
        F: Fn(String) -> Fut,
        Fut: Future<Output = Result<Vec<Row>>>,
    {
        let mut unique_rows = HashMap::new();
        let mut batch_bytes: u64 = 0;
        let mut batch_rows: usize = 0;
        let mut batch_cells: usize = 0;
        let mut batch_file_count: usize = 0;

        // Files are read one at a time so that the row and cell budgets are enforced as we go,
        // rather than materialising every pending file before checking them.
        for file in files {
            if batch_file_count > 0 && batch_bytes + file.size > MAX_BATCH_BYTES {
                break;
            }
            let rows = get_rows(file.name.clone()).await?;
            let cells: usize = rows.iter().map(|row| row.columns.len()).sum();
            if batch_file_count > 0
                && (batch_rows + rows.len() > MAX_BATCH_ROWS
                    || batch_cells + cells > MAX_BATCH_CELLS)
            {
                break;
            }

            batch_bytes += file.size;
            batch_rows += rows.len();
            batch_cells += cells;
            batch_file_count += 1;

            // Dedup rows by row_id, keeping only the last one
            for row in rows {
                unique_rows.insert(row.row_id.clone(), row);
            }
        }

        Ok((unique_rows.into_values().collect(), batch_file_count))
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

    pub async fn delete_files(files: &[String]) -> Result<()> {
        // We delete the files concurrently to speed up the process
        let bucket = Self::get_bucket()?;
        let client = gcs_client().await?;
        let delete_futures = files.iter().map(|file| {
            let bucket = bucket.clone();
            async move {
                match client.object().delete(&bucket, file).await {
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
        let files = Self::get_gcs_csv_files_for_table(table).await?;
        let file_names: Vec<String> = files.into_iter().map(|file| file.name).collect();
        Self::delete_files(&file_names).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{cell::RefCell, sync::Arc};

    fn file(name: &str, size: u64) -> PendingCsvFile {
        PendingCsvFile {
            name: name.to_string(),
            size,
        }
    }

    fn rows(id_prefix: &str, count: usize, value: &str) -> Vec<Row> {
        wide_rows(id_prefix, count, 1, value)
    }

    fn wide_rows(id_prefix: &str, count: usize, column_count: usize, value: &str) -> Vec<Row> {
        let headers: Arc<Vec<String>> =
            Arc::new((0..column_count).map(|i| format!("c{}", i)).collect());
        (0..count)
            .map(|i| {
                Row::new(
                    format!("{}-{}", id_prefix, i),
                    headers.clone(),
                    vec![serde_json::Value::String(value.to_string()); column_count],
                )
            })
            .collect()
    }

    // Runs the batch over in-memory file contents and also returns the names of the files read.
    async fn run_batch(
        files: &[PendingCsvFile],
        contents: HashMap<String, Vec<Row>>,
    ) -> Result<(Vec<Row>, usize, Vec<String>)> {
        let read_files = RefCell::new(Vec::new());
        let (batch_rows, batch_file_count) =
            GoogleCloudStorageBackgroundProcessingStore::get_deduped_rows_from_next_batch_with(
                files,
                |name| {
                    read_files.borrow_mut().push(name.clone());
                    let rows = contents.get(&name).cloned();
                    async move { rows.ok_or_else(|| anyhow!("unknown file {}", name)) }
                },
            )
            .await?;
        Ok((batch_rows, batch_file_count, read_files.into_inner()))
    }

    #[tokio::test]
    async fn test_next_batch_takes_all_files_within_budget() -> Result<()> {
        let files = vec![file("a", 10), file("b", 10)];
        let contents = HashMap::from([
            ("a".to_string(), rows("a", 2, "a")),
            ("b".to_string(), rows("b", 3, "b")),
        ]);

        let (batch_rows, batch_file_count, _) = run_batch(&files, contents).await?;

        assert_eq!(batch_file_count, 2);
        assert_eq!(batch_rows.len(), 5);
        Ok(())
    }

    #[tokio::test]
    async fn test_next_batch_stops_at_byte_budget_without_reading() -> Result<()> {
        let files = vec![
            file("a", MAX_BATCH_BYTES / 2),
            file("b", MAX_BATCH_BYTES / 2),
            file("c", 1),
        ];
        let contents = HashMap::from([
            ("a".to_string(), rows("a", 1, "a")),
            ("b".to_string(), rows("b", 1, "b")),
            ("c".to_string(), rows("c", 1, "c")),
        ]);

        let (batch_rows, batch_file_count, read_files) = run_batch(&files, contents).await?;

        assert_eq!(batch_file_count, 2);
        assert_eq!(batch_rows.len(), 2);
        assert_eq!(read_files, vec!["a".to_string(), "b".to_string()]);
        Ok(())
    }

    #[tokio::test]
    async fn test_next_batch_stops_at_row_budget() -> Result<()> {
        let files = vec![file("a", 1), file("b", 1), file("c", 1)];
        let contents = HashMap::from([
            ("a".to_string(), rows("a", MAX_BATCH_ROWS - 1, "a")),
            ("b".to_string(), rows("b", 2, "b")),
            ("c".to_string(), rows("c", 1, "c")),
        ]);

        let (batch_rows, batch_file_count, read_files) = run_batch(&files, contents).await?;

        assert_eq!(batch_file_count, 1);
        assert_eq!(batch_rows.len(), MAX_BATCH_ROWS - 1);
        assert_eq!(read_files, vec!["a".to_string(), "b".to_string()]);
        Ok(())
    }

    #[tokio::test]
    async fn test_next_batch_stops_at_cell_budget() -> Result<()> {
        // Each file stays well within the row budget but holds half of the cell budget.
        let column_count = 100;
        let row_count = MAX_BATCH_CELLS / column_count / 2;
        let files = vec![file("a", 1), file("b", 1), file("c", 1)];
        let contents = HashMap::from([
            (
                "a".to_string(),
                wide_rows("a", row_count, column_count, "a"),
            ),
            (
                "b".to_string(),
                wide_rows("b", row_count, column_count, "b"),
            ),
            ("c".to_string(), wide_rows("c", 1, column_count, "c")),
        ]);

        let (batch_rows, batch_file_count, read_files) = run_batch(&files, contents).await?;

        assert_eq!(batch_file_count, 2);
        assert_eq!(batch_rows.len(), 2 * row_count);
        assert_eq!(
            read_files,
            vec!["a".to_string(), "b".to_string(), "c".to_string()]
        );
        Ok(())
    }

    #[tokio::test]
    async fn test_next_batch_always_takes_first_file() -> Result<()> {
        let files = vec![file("a", MAX_BATCH_BYTES + 1), file("b", 1)];
        let contents = HashMap::from([
            ("a".to_string(), rows("a", 1, "a")),
            ("b".to_string(), rows("b", 1, "b")),
        ]);

        let (_, batch_file_count, read_files) = run_batch(&files, contents).await?;

        assert_eq!(batch_file_count, 1);
        assert_eq!(read_files, vec!["a".to_string()]);
        Ok(())
    }

    #[tokio::test]
    async fn test_next_batch_dedups_keeping_latest_file() -> Result<()> {
        let files = vec![file("a", 1), file("b", 1)];
        let contents = HashMap::from([
            ("a".to_string(), rows("r", 1, "old")),
            ("b".to_string(), rows("r", 1, "new")),
        ]);

        let (batch_rows, batch_file_count, _) = run_batch(&files, contents).await?;

        assert_eq!(batch_file_count, 2);
        assert_eq!(batch_rows.len(), 1);
        assert_eq!(
            batch_rows[0].columns,
            vec![serde_json::Value::String("new".to_string())]
        );
        Ok(())
    }
}
