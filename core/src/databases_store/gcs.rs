use std::{collections::HashMap, sync::Arc};

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use cloud_storage::{ErrorList, GoogleErrorResponse, Object};
use csv::Writer;
use tracing::info;

use crate::{
    databases::{
        csv::GoogleCloudStorageCSVContent,
        table::{Row, Table},
        table_schema::TableSchema,
    },
    utils::{self},
};

use super::store::DatabasesStore;

#[derive(Clone)]
pub struct GoogleCloudStorageDatabasesStore {}

pub async fn write_rows_to_bucket(
    schema: &TableSchema,
    rows: &Vec<Row>,
    bucket: &str,
    bucket_csv_path: &str,
) -> Result<(), anyhow::Error> {
    let mut field_names = schema
        .columns()
        .iter()
        .map(|c| c.name.clone())
        .collect::<Vec<_>>();

    // Read all rows and upload to GCS
    let mut wtr = Writer::from_writer(vec![]);

    // We need to append the row_id in a __dust_id field
    // It's important to have it LAST in the headers as the table schema do not show it
    // and when the csv will be used as-is for the sqlite database, the dust_id will be completely ignored (as it should).
    // See Row.to_csv_record
    field_names.push("__dust_id".to_string());

    // Write the header.
    wtr.write_record(field_names.iter().map(String::as_str))?;

    // Write the rows.
    for row in rows {
        wtr.write_record(row.to_csv_record(&field_names)?)?;
    }

    let csv = wtr.into_inner()?;

    Object::create(bucket, csv, bucket_csv_path, "text/csv").await?;

    Ok(())
}

impl GoogleCloudStorageDatabasesStore {
    pub fn new() -> Self {
        Self {}
    }

    pub fn get_bucket() -> Result<String> {
        match std::env::var("DUST_TABLES_BUCKET") {
            Ok(bucket) => Ok(bucket),
            Err(_) => Err(anyhow!("DUST_TABLES_BUCKET is not set")),
        }
    }

    pub fn get_csv_storage_file_path(table: &Table) -> String {
        format!(
            "project-{}/{}/{}.csv",
            table.project().project_id(),
            table.data_source_id(),
            table.table_id()
        )
    }

    pub async fn get_rows_from_csv(table: &Table) -> Result<Vec<Row>> {
        let csv = GoogleCloudStorageCSVContent {
            bucket: Self::get_bucket()?,
            bucket_csv_path: Self::get_csv_storage_file_path(table),
        };
        match csv.parse().await {
            Ok(rows) => Ok(rows),
            Err(e) => match e.downcast_ref::<cloud_storage::Error>() {
                // Treat a non-existing file as an empty table
                // Checking for this is trickier than it should be, due to how the cloud_storage crate handles errors.
                // In particular, when it can't download a file because it doesn't exist, it returns an 'Other' error,
                // instead of the more meaningful Google(GoogleErrorResponse) with a 404 (which it correctly uses
                // when trying to *delete* a non-existing file).
                Some(cloud_storage::Error::Other(s)) if s.contains("No such object") => {
                    info!(
                        table_id = table.table_id(),
                        "DSSTRUCTSTAT [get_rows_from_csv] no GCS file, treating as empty table"
                    );
                    Ok(Vec::new())
                }
                _ => Err(e),
            },
        }
    }

    pub async fn write_rows_to_csv(
        table: &Table,
        schema: &TableSchema,
        rows: &Vec<Row>,
    ) -> Result<(), anyhow::Error> {
        write_rows_to_bucket(
            schema,
            rows,
            &Self::get_bucket()?,
            &Self::get_csv_storage_file_path(table),
        )
        .await?;

        Ok(())
    }
}

#[async_trait]
impl DatabasesStore for GoogleCloudStorageDatabasesStore {
    async fn load_table_row(&self, table: &Table, row_id: &str) -> Result<Option<Row>> {
        let rows = Self::get_rows_from_csv(table).await?;
        let row = rows.iter().find(|r| r.row_id == row_id);
        Ok(row.cloned())
    }

    async fn list_table_rows(
        &self,
        table: &Table,
        limit_offset: Option<(usize, usize)>,
    ) -> Result<(Vec<Row>, usize)> {
        let rows = Self::get_rows_from_csv(table).await?;
        match limit_offset {
            Some((limit, offset)) => {
                let total = rows.len();
                let rows = rows.into_iter().skip(offset).take(limit).collect();
                Ok((rows, total))
            }
            None => {
                let total = rows.len();
                Ok((rows, total))
            }
        }
    }

    async fn batch_upsert_table_rows(
        &self,
        table: &Table,
        schema: &TableSchema,
        rows: &Vec<Row>,
        truncate: bool,
    ) -> Result<()> {
        let mut now = utils::now();
        let mut merge_rows_duration = 0;

        let merged_rows: Vec<Row>;
        let mut rows_ref: &Vec<Row> = rows;

        // We need to merge the existing rows with the new rows based on the row_id.
        if !truncate {
            // We download all the rows from the CSV and merge them with the new rows.
            // This is not super efficient if we get rows one by one but it's simple and works.
            // Non-truncate upserts are < 4% of our total upserts.

            let previous_rows = Self::get_rows_from_csv(table).await?;

            // Use spawn_blocking to offload the merge operation to a blocking thread.
            merged_rows = tokio::task::spawn_blocking({
                let rows = rows.clone();
                move || {
                    // Use Hashmaps with the row_id as the key.
                    let previous_rows_map = previous_rows
                        .into_iter()
                        .map(|r| (r.row_id.clone(), r.clone()))
                        .collect::<HashMap<_, _>>();

                    let new_rows_map = rows
                        .into_iter()
                        .map(|r| (r.row_id.clone(), r.clone()))
                        .collect::<HashMap<_, _>>();

                    // Merge the two maps to get the final rows.
                    // New ones take precedence, which includes the case where a 'delete' row
                    // replaces a regular row.
                    let merged_rows_map = previous_rows_map
                        .into_iter()
                        .chain(new_rows_map.into_iter())
                        .collect::<HashMap<_, _>>();

                    // Remove all rows marked as is_delete. Note that there is no delete action to
                    // take here, as the row is simply not included in the final result.
                    let merged_rows_map = merged_rows_map
                        .into_iter()
                        .filter(|(_, row)| !row.is_delete)
                        .collect::<HashMap<_, _>>();

                    merged_rows_map.into_values().collect::<Vec<Row>>()
                }
            })
            .await?;
            rows_ref = &merged_rows;
            merge_rows_duration = utils::now() - now;
            now = utils::now();
        }

        // Write the rows to the CSV file.
        Self::write_rows_to_csv(table, &schema, rows_ref).await?;
        let write_rows_to_csv_duration = utils::now() - now;

        info!(
            truncate,
            row_count = rows_ref.len(),
            duration = merge_rows_duration + write_rows_to_csv_duration,
            merge_rows_duration,
            write_rows_to_csv_duration,
            table_id = table.table_id(),
            "DSSTRUCTSTAT [upsert_rows CSV] operation completed"
        );

        Ok(())
    }

    async fn delete_table_data(&self, table: &Table) -> Result<()> {
        match Object::delete(
            &Self::get_bucket()?,
            &Self::get_csv_storage_file_path(table),
        )
        .await
        {
            Ok(_) => {}
            Err(e) => match e {
                cloud_storage::Error::Google(GoogleErrorResponse {
                    error: ErrorList { code: 404, .. },
                    ..
                }) => {
                    // Silently ignore 404 errors which means the object does not exist
                    // anymore.
                }
                e => Err(e)?,
            },
        }
        Ok(())
    }

    async fn delete_table_row(&self, table: &Table, row_id: &str) -> Result<()> {
        let rows = Self::get_rows_from_csv(table).await?;
        let previous_rows_count = rows.len();
        let new_rows = rows
            .iter()
            .filter(|r| r.row_id != row_id)
            .cloned()
            .collect::<Vec<_>>();

        if previous_rows_count != new_rows.len() {
            let rows = Arc::new(new_rows);
            let schema = TableSchema::from_rows_async(rows.clone()).await?;
            Self::write_rows_to_csv(table, &schema, &rows).await?;
        }

        Ok(())
    }

    fn clone_box(&self) -> Box<dyn DatabasesStore + Sync + Send> {
        Box::new(self.clone())
    }
}
