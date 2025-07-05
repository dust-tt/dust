use std::{collections::HashMap, sync::Arc};

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use cloud_storage::Object;
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
        csv.parse().await
    }

    pub async fn write_rows_to_csv(
        table: &Table,
        schema: &TableSchema,
        rows: &Vec<Row>,
    ) -> Result<(), anyhow::Error> {
        let field_names = schema
            .columns()
            .iter()
            .map(|c| c.name.clone())
            .collect::<Vec<_>>();

        // Read all rows and upload to GCS
        let mut wtr = Writer::from_writer(vec![]);

        // Write the header row.
        wtr.write_record(field_names.as_slice())?;
        for row in rows.iter() {
            wtr.write_record(row.to_csv_record(&field_names)?.as_slice())?;
        }

        let csv = wtr.into_inner()?;

        Object::create(
            &Self::get_bucket()?,
            csv,
            &Self::get_csv_storage_file_path(table),
            "text/csv",
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
        let mut new_rows = rows.clone();
        let mut merge_rows_duration = 0;

        // We need to merge the existing rows with the new rows based on the row_id.
        if !truncate {
            if !table.migrated_to_csv() {
                return Err(anyhow!(
                    "Table is not migrated to CSV so we cannot merge with existing data. It should be migrated before upserting."
                ));
            }

            // We download all the rows from the CSV and merge them with the new rows.
            // This is not super efficient if we get rows one by one but it's simple and works.
            // Non-truncate upserts are < 4% of our total upserts.

            let previous_rows = Self::get_rows_from_csv(table).await?;

            // Use Hashmaps with the row_id as the key.
            let previous_rows_map = previous_rows
                .into_iter()
                .map(|r| (r.row_id.clone(), r.clone()))
                .collect::<HashMap<_, _>>();

            let new_rows_map = new_rows
                .into_iter()
                .map(|r| (r.row_id.clone(), r.clone()))
                .collect::<HashMap<_, _>>();

            // Merge the two maps to get the final rows.
            // New ones take precedence.
            let merged_rows_map = previous_rows_map
                .into_iter()
                .chain(new_rows_map.into_iter())
                .collect::<HashMap<_, _>>();

            new_rows = merged_rows_map.into_values().collect();

            merge_rows_duration = utils::now() - now;
            now = utils::now();
        }

        // Write the rows to the CSV file.
        Self::write_rows_to_csv(table, &schema, &new_rows).await?;
        let write_rows_to_csv_duration = utils::now() - now;

        info!(
            truncate,
            rows_count = new_rows.len(),
            duration = merge_rows_duration + write_rows_to_csv_duration,
            merge_rows_duration,
            write_rows_to_csv_duration,
            table_id = table.unique_id(),
            "DSSTRUCTSTAT [upsert_rows CSV] operation completed"
        );

        Ok(())
    }

    async fn delete_table_data(&self, table: &Table) -> Result<()> {
        if table.migrated_to_csv() {
            match Object::delete(
                &Self::get_bucket()?,
                &Self::get_csv_storage_file_path(table),
            )
            .await
            {
                Ok(_) => {}
                Err(e) => {
                    info!(
                        "Failed to delete CSV file for table {}. {:#?}",
                        table.unique_id(),
                        e
                    );
                }
            }
        }
        Ok(())
    }
    async fn delete_table_row(&self, table: &Table, row_id: &str) -> Result<()> {
        if table.migrated_to_csv() {
            match Self::get_rows_from_csv(table).await {
                Ok(rows) => {
                    let previous_rows_count = rows.len();
                    let new_rows = rows
                        .iter()
                        .filter(|r| r.row_id != row_id)
                        .cloned()
                        .collect::<Vec<_>>();

                    if previous_rows_count != new_rows.len() {
                        let rows = Arc::new(new_rows.clone());
                        let schema = TableSchema::from_rows_async(rows).await?;
                        Self::write_rows_to_csv(table, &schema, &new_rows).await?;
                    }
                }
                Err(e) => {
                    info!(
                        "Failed to update CSV file after row deletion for table {}. {:#?}",
                        table.unique_id(),
                        e
                    );
                }
            }
        }

        Ok(())
    }

    fn clone_box(&self) -> Box<dyn DatabasesStore + Sync + Send> {
        Box::new(self.clone())
    }
}
