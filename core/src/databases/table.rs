use std::sync::Arc;
use std::time::Duration;

use anyhow::{anyhow, Result};
use chrono::{DateTime, NaiveDate, NaiveTime, Utc};
use futures::future::try_join_all;
use redis::AsyncCommands;
use rslock::LockManager;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tracing::info;

use crate::databases::table_upserts_background_worker::{
    TableUpsertActivityData, REDIS_CLIENT, REDIS_LOCK_TTL_SECONDS, REDIS_TABLE_UPSERT_HASH_NAME,
    REDIS_URI,
};
use crate::databases_store::gcs::GoogleCloudStorageDatabasesStore;
use crate::databases_store::gcs_background::GoogleCloudStorageBackgroundProcessingStore;
use crate::databases_store::store::{SAVE_TABLES_TO_GCS, SAVE_TABLES_TO_POSTGRES};
use crate::search_stores::search_store::NodeItem;
use crate::{
    data_sources::node::ProviderVisibility,
    databases::{csv::GoogleCloudStorageCSVContent, database::HasValue, table_schema::TableSchema},
    databases_store::store::DatabasesStore,
    project::Project,
    search_filter::{Filterable, SearchFilter},
    search_stores::search_store::SearchStore,
    sqlite_workers::client::HEARTBEAT_INTERVAL_MS,
    stores::store::Store,
    utils,
};

#[derive(Debug, Clone, Serialize, PartialEq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TableType {
    Local,
    Remote(String),
}

pub fn get_table_unique_id(project: &Project, data_source_id: &str, table_id: &str) -> String {
    format!("{}__{}__{}", project.project_id(), data_source_id, table_id)
}

// Ensures tables are compatible with each other. Tables must be either:
// - all local
// - all remote for the same remote database (i.e, same secret_id)
pub fn get_table_type_for_tables(tables: Vec<&Table>) -> Result<TableType> {
    let table_types = tables
        .iter()
        .map(|table| table.table_type())
        .collect::<Result<Vec<TableType>>>()?;
    let first_table_type = table_types.first().ok_or_else(|| anyhow!("No tables"))?;
    if table_types
        .iter()
        .all(|table_type| table_type == first_table_type)
    {
        Ok(first_table_type.clone())
    } else {
        Err(anyhow!("Incompatible tables"))
    }
}

#[derive(serde::Serialize)]
pub struct TableBlobPayload {
    pub table_id: String,
    pub name: String,
    pub description: String,
    pub timestamp: Option<u64>,
    pub tags: Vec<String>,
    pub parent_id: Option<String>,
    pub parents: Vec<String>,
    pub source_url: Option<String>,

    // Remote DB specifics
    pub remote_database_table_id: Option<String>,
    pub remote_database_secret_id: Option<String>,

    // Node meta:
    pub title: String,
    pub mime_type: String,
    pub provider_visibility: Option<ProviderVisibility>,

    // Rows
    pub rows: Vec<Row>,
}

#[derive(Debug, Serialize, Clone, Deserialize)]
pub struct Table {
    project: Project,
    data_source_id: String,
    data_source_internal_id: String,
    created: u64,

    table_id: String,
    name: String,
    description: String,
    timestamp: u64,
    tags: Vec<String>,
    title: String,
    mime_type: String,
    provider_visibility: Option<ProviderVisibility>,
    parent_id: Option<String>,
    parents: Vec<String>,
    source_url: Option<String>,

    schema: Option<TableSchema>,
    schema_stale_at: Option<u64>,

    migrated_to_csv: bool,

    remote_database_table_id: Option<String>,
    remote_database_secret_id: Option<String>,
}

impl Table {
    pub fn new(
        project: Project,
        data_source_id: String,
        data_source_internal_id: String,
        created: u64,
        table_id: String,
        name: String,
        description: String,
        timestamp: u64,
        title: String,
        mime_type: String,
        provider_visibility: Option<ProviderVisibility>,
        tags: Vec<String>,
        parent_id: Option<String>,
        parents: Vec<String>,
        source_url: Option<String>,
        schema: Option<TableSchema>,
        schema_stale_at: Option<u64>,
        migrated_to_csv: bool,
        remote_database_table_id: Option<String>,
        remote_database_secret_id: Option<String>,
    ) -> Self {
        Table {
            project,
            data_source_id,
            data_source_internal_id,
            created,
            table_id,
            name,
            description,
            timestamp,
            tags,
            title,
            mime_type,
            provider_visibility,
            parent_id,
            parents,
            source_url,
            schema,
            schema_stale_at,
            migrated_to_csv,
            remote_database_table_id,
            remote_database_secret_id,
        }
    }

    pub fn project(&self) -> &Project {
        &self.project
    }
    pub fn data_source_id(&self) -> &str {
        &self.data_source_id
    }
    pub fn data_source_internal_id(&self) -> &str {
        &self.data_source_internal_id
    }
    pub fn created(&self) -> u64 {
        self.created
    }
    pub fn table_id(&self) -> &str {
        &self.table_id
    }
    pub fn title(&self) -> &str {
        &self.title
    }
    pub fn mime_type(&self) -> &str {
        &self.mime_type
    }
    pub fn provider_visibility(&self) -> &Option<ProviderVisibility> {
        &self.provider_visibility
    }
    pub fn parent_id(&self) -> &Option<String> {
        &self.parent_id
    }
    pub fn parents(&self) -> &Vec<String> {
        &self.parents
    }
    pub fn source_url(&self) -> &Option<String> {
        &self.source_url
    }
    pub fn name(&self) -> &str {
        &self.name
    }
    pub fn description(&self) -> &str {
        &self.description
    }
    pub fn timestamp(&self) -> u64 {
        self.timestamp
    }
    pub fn schema_cached(&self) -> Option<&TableSchema> {
        self.schema.as_ref()
    }
    pub fn unique_id(&self) -> String {
        get_table_unique_id(&self.project, &self.data_source_id, &self.table_id)
    }
    pub fn migrated_to_csv(&self) -> bool {
        self.migrated_to_csv
    }
    pub fn remote_database_table_id(&self) -> Option<&str> {
        self.remote_database_table_id.as_deref()
    }
    pub fn remote_database_secret_id(&self) -> Option<&str> {
        self.remote_database_secret_id.as_deref()
    }
    pub fn table_id_for_dbml(&self) -> &str {
        match self.remote_database_table_id() {
            Some(id) if !id.is_empty() => id,
            _ => self.name(), // Note from seb: kept self.name() as it was the previous behavior, but shouldn't it be self.table_id()?
        }
    }
    pub fn table_type(&self) -> Result<TableType> {
        match (
            self.remote_database_table_id(),
            self.remote_database_secret_id(),
        ) {
            (Some(_), Some(secret_id)) => Ok(TableType::Remote(secret_id.to_string())),
            (Some(_), None) => Err(anyhow!("require_authentication")),
            (None, None) => Ok(TableType::Local),
            _ => Err(anyhow!(
                "Inconsistent state: table is neither local nor remote"
            )),
        }
    }
    pub fn set_schema(&mut self, schema: TableSchema) {
        self.schema = Some(schema);
    }
    pub fn set_remote_database_secret_id(&mut self, remote_database_secret_id: String) {
        self.remote_database_secret_id = Some(remote_database_secret_id);
    }
    pub fn get_background_processing_lock_name(&self) -> String {
        format!("upsert:{}", self.unique_id())
    }

    // if search_store is provided, delete the table node from the search index
    pub async fn delete(
        &self,
        store: Box<dyn Store + Sync + Send>,
        databases_store: Box<dyn DatabasesStore + Sync + Send>,
        search_store: Option<Box<dyn SearchStore + Sync + Send>>,
    ) -> Result<()> {
        if self.remote_database_table_id().is_none() {
            // Invalidate the databases that use the table.
            try_join_all(
                (store
                    .find_databases_using_table(
                        &self.project,
                        &self.data_source_id,
                        &self.table_id,
                        HEARTBEAT_INTERVAL_MS,
                    )
                    .await?)
                    .into_iter()
                    .map(|db| {
                        let store = store.clone();
                        async move {
                            db.invalidate(store).await?;
                            Ok::<_, anyhow::Error>(())
                        }
                    }),
            )
            .await?;

            // Delete the table data from the stores that are enabled

            if SAVE_TABLES_TO_POSTGRES {
                databases_store.delete_table_data(&self).await?;
            }

            if SAVE_TABLES_TO_GCS {
                // For now, we don't propagate failures since it's just a shadow operation
                let gcs_store = GoogleCloudStorageDatabasesStore::new();
                if let Err(e) = gcs_store.delete_table_data(&self).await {
                    tracing::error!("Failed to delete table data from GCS: {:?}", e);
                }
            }
        }

        store
            .delete_data_source_table(&self.project, &self.data_source_id, &self.table_id)
            .await?;

        // Delete the table node from the search index.
        if let Some(search_store) = search_store {
            search_store
                .delete_node(NodeItem::Table(self.clone()))
                .await?;
        }

        Ok(())
    }

    pub async fn update_parents(
        &self,
        store: Box<dyn Store + Sync + Send>,
        search_store: Box<dyn SearchStore + Sync + Send>,
        parents: Vec<String>,
    ) -> Result<()> {
        store
            .update_data_source_node_parents(
                &self.project,
                &self.data_source_id,
                &&self.table_id,
                &parents,
            )
            .await?;

        search_store
            .index_node(NodeItem::Table(self.clone()))
            .await?;
        Ok(())
    }

    pub async fn retrieve_api_blob(
        &self,
        databases_store: Box<dyn DatabasesStore + Sync + Send>,
    ) -> Result<TableBlobPayload> {
        let rows = match self.table_type()? {
            TableType::Local => {
                let local_table = LocalTable::from_table(self.clone())?;
                let (rows, _) = local_table.list_rows(databases_store, None).await?;
                rows
            }
            TableType::Remote(_) => {
                // For remote tables, we don't have direct access to rows
                // Return empty vec since rows will be fetched through DB connection
                vec![]
            }
        };

        Ok(TableBlobPayload {
            table_id: self.table_id().to_string(),
            name: self.name().to_string(),
            description: self.description().to_string(),
            timestamp: Some(self.timestamp()),
            tags: self.get_tags().clone(),
            parent_id: self.parent_id().clone(),
            parents: self.parents().clone(),
            source_url: self.source_url().clone(),
            remote_database_table_id: self.remote_database_table_id().map(|s| s.to_string()),
            remote_database_secret_id: self.remote_database_secret_id().map(|s| s.to_string()),
            title: self.title().to_string(),
            mime_type: self.mime_type().to_string(),
            provider_visibility: self.provider_visibility().clone(),
            rows,
        })
    }
}

#[derive(Debug, Clone)]
pub struct LocalTable {
    pub table: Table,
}

impl LocalTable {
    pub fn from_table(table: Table) -> Result<LocalTable> {
        match table.table_type() {
            Ok(TableType::Local) => Ok(LocalTable { table }),
            Ok(TableType::Remote(_)) => Err(anyhow!("Table is not local")),
            Err(e) => Err(e),
        }
    }

    pub fn render_dbml(&self, name: Option<&str>) -> String {
        let name = match name {
            Some(name) => name,
            None => self.table.name(),
        };

        match self.table.schema {
            None => format!("Table {} {{\n}}", name),
            Some(ref schema) => schema.render_dbml(name, self.table.description(), false),
        }
    }

    pub async fn upsert_rows(
        &self,
        store: Box<dyn Store + Sync + Send>,
        databases_store: Box<dyn DatabasesStore + Sync + Send>,
        rows: Vec<Row>,
        truncate: bool,
    ) -> Result<()> {
        let rows = Arc::new(rows);

        let now = utils::now();
        // Validate that all rows keys are lowercase. We run it in a spawn_blocking since it is CPU
        // bound (even if running fast for resaonably sized tables);
        {
            let rows = rows.clone();
            tokio::task::spawn_blocking(move || {
                for (row_index, row) in rows.iter().enumerate() {
                    match row.value().keys().find(|key| match key.chars().next() {
                        Some(c) => c.is_ascii_uppercase(),
                        None => false,
                    }) {
                        Some(key) => Err(anyhow!(
                            "Row {} has a key '{}' that contains uppercase characters",
                            row_index,
                            key
                        ))?,
                        None => (),
                    }
                }
                Ok::<_, anyhow::Error>(())
            })
            .await??;
        }
        info!(
            duration = utils::now() - now,
            table_id = self.table.table_id(),
            rows_count = rows.len(),
            "DSSTRUCTSTAT [upsert_rows] validation"
        );

        if SAVE_TABLES_TO_POSTGRES {
            self.upsert_rows_postgres(&store, &databases_store, rows.as_ref().clone(), truncate)
                .await?;
        }

        if SAVE_TABLES_TO_GCS {
            // For now, we don't propagate failures since it's just a shadow operation
            if let Err(e) = self
                .upsert_rows_to_gcs_or_queue_work(
                    &store,
                    &databases_store,
                    rows.as_ref().clone(),
                    truncate,
                )
                .await
            {
                tracing::error!("Failed to upsert rows to GCS or queue work: {:?}", e);
            }
        }

        Ok(())
    }

    pub async fn upsert_rows_postgres(
        &self,
        store: &Box<dyn Store + Sync + Send>,
        databases_store: &Box<dyn DatabasesStore + Sync + Send>,
        rows: Vec<Row>,
        truncate: bool,
    ) -> Result<()> {
        let rows = Arc::new(rows);

        let mut now = utils::now();
        let new_table_schema = match truncate {
            // If the new rows replace existing ones, we need to clear the schema cache.
            true => TableSchema::from_rows_async(rows.clone()).await?,
            false => match self.table.schema_cached() {
                // If there is no existing schema cache, simply use the new schema.
                None => TableSchema::from_rows_async(rows.clone()).await?,
                Some(existing_table_schema) => {
                    // If there is an existing schema cache, merge it with the new schema.
                    existing_table_schema
                        .merge(&TableSchema::from_rows_async(rows.clone()).await?)?
                }
            },
        };
        info!(
            duration = utils::now() - now,
            table_id = self.table.table_id(),
            rows_count = rows.len(),
            "DSSTRUCTSTAT [upsert_rows] table schema"
        );

        now = utils::now();
        store
            .update_data_source_table_schema(
                &self.table.project,
                &self.table.data_source_id,
                &self.table.table_id,
                &new_table_schema,
            )
            .await?;
        info!(
            duration = utils::now() - now,
            table_id = self.table.table_id(),
            "DSSTRUCTSTAT [upsert_rows] update table_schema"
        );

        now = utils::now();
        if !truncate {
            // When doing incremental updates to a table's rows, the schema may become too wide.
            // For example, if a column has only integers, it's an integer column. If a new row has
            // a string in that column, the column becomes a string column.
            // However, if that row is later updated to have an integer, the column should become
            // an integer column again, but we cannot know that without looking at all the rows.
            // This is why we invalidate the schema when doing incremental updates, and next time
            // the schema is requested, it will be recomputed from all the rows.
            store
                .invalidate_data_source_table_schema(
                    &self.table.project,
                    &self.table.data_source_id,
                    &self.table.table_id,
                )
                .await?;
        }
        info!(
            duration = utils::now() - now,
            table_id = self.table.table_id(),
            "DSSTRUCTSTAT [upsert_rows] invalidate table schema"
        );

        now = utils::now();
        // Upsert the rows in the table.
        // Note: if this fails, the Table will still contain the new schema, but the rows will not
        // be updated. This isn't too bad, because the merged schema is necessarily
        // backward-compatible with the previous one. The other way around would not be true -- old
        // schema doesn't necessarily work with the new rows. This is why we cannot `try_join_all`.

        databases_store
            .batch_upsert_table_rows(&self.table, &new_table_schema, &rows, truncate)
            .await?;

        info!(
            duration = utils::now() - now,
            table_id = self.table.table_id(),
            rows_count = rows.len(),
            "DSSTRUCTSTAT [upsert_rows] rows upsert"
        );

        now = utils::now();
        // Invalidate the databases that use the table.
        try_join_all(
            (store
                .find_databases_using_table(
                    &self.table.project,
                    &self.table.data_source_id,
                    &self.table.table_id,
                    HEARTBEAT_INTERVAL_MS,
                )
                .await?)
                .into_iter()
                .map(|db| {
                    let store = store.clone();
                    async move {
                        db.invalidate(store).await?;
                        Ok::<_, anyhow::Error>(())
                    }
                }),
        )
        .await?;
        info!(
            duration = utils::now() - now,
            table_id = self.table.table_id(),
            "DSSTRUCTSTAT [upsert_rows] invalidate dbs"
        );

        Ok(())
    }

    pub async fn upsert_rows_to_gcs_or_queue_work(
        &self,
        store: &Box<dyn Store + Sync + Send>,
        databases_store: &Box<dyn DatabasesStore + Sync + Send>,
        rows: Vec<Row>,
        truncate: bool,
    ) -> Result<()> {
        if truncate {
            let now = utils::now();
            let lock_manager = LockManager::new(vec![REDIS_URI.clone()]);

            // Take the table lock to make sure we don't conflict with processing
            // happening in the background worker.
            let lock = lock_manager
                .acquire_no_guard(
                    self.table.get_background_processing_lock_name().as_bytes(),
                    Duration::from_secs(REDIS_LOCK_TTL_SECONDS),
                )
                .await?;

            info!(
                lock_acquisition_duration = utils::now() - now,
                "Upsert lock acquired in upsert_rows"
            );

            // Since truncate replaces everything, we get rid of all non-truncate and row deletion
            // pending operations that got queued before we got called.
            // And those that arrive later cannot happen until we release the lock.
            GoogleCloudStorageBackgroundProcessingStore::delete_all_files_for_table(&self.table)
                .await?;

            self.upsert_rows_gcs(store, databases_store, rows, truncate)
                .await?;

            lock_manager.unlock(&lock).await;
            Ok(())
        } else {
            // For non-truncate, use the background worker
            self.schedule_background_upsert_or_delete(rows).await
        }
    }

    pub async fn upsert_rows_gcs(
        &self,
        store: &Box<dyn Store + Sync + Send>,
        // TODO: use this as databases_store once we fully migrate to GCS
        _: &Box<dyn DatabasesStore + Sync + Send>,
        rows: Vec<Row>,
        truncate: bool,
    ) -> Result<()> {
        let rows = Arc::new(rows);

        let mut now = utils::now();
        let new_table_schema = match truncate {
            // If the new rows replace existing ones, we need to clear the schema cache.
            true => TableSchema::from_rows_async(rows.clone()).await?,
            false => match self.table.schema_cached() {
                // If there is no existing schema cache, simply use the new schema.
                None => TableSchema::from_rows_async(rows.clone()).await?,
                Some(existing_table_schema) => {
                    // If there is an existing schema cache, merge it with the new schema.
                    existing_table_schema
                        .merge(&TableSchema::from_rows_async(rows.clone()).await?)?
                }
            },
        };
        info!(
            duration = utils::now() - now,
            table_id = self.table.table_id(),
            rows_count = rows.len(),
            "DSSTRUCTSTAT [upsert_rows] table schema"
        );

        now = utils::now();
        store
            .update_data_source_table_schema(
                &self.table.project,
                &self.table.data_source_id,
                &self.table.table_id,
                &new_table_schema,
            )
            .await?;
        info!(
            duration = utils::now() - now,
            table_id = self.table.table_id(),
            "DSSTRUCTSTAT [upsert_rows] update table_schema"
        );

        now = utils::now();
        if !truncate {
            // When doing incremental updates to a table's rows, the schema may become too wide.
            // For example, if a column has only integers, it's an integer column. If a new row has
            // a string in that column, the column becomes a string column.
            // However, if that row is later updated to have an integer, the column should become
            // an integer column again, but we cannot know that without looking at all the rows.
            // This is why we invalidate the schema when doing incremental updates, and next time
            // the schema is requested, it will be recomputed from all the rows.
            store
                .invalidate_data_source_table_schema(
                    &self.table.project,
                    &self.table.data_source_id,
                    &self.table.table_id,
                )
                .await?;
        }
        info!(
            duration = utils::now() - now,
            table_id = self.table.table_id(),
            "DSSTRUCTSTAT [upsert_rows] invalidate table schema"
        );

        now = utils::now();
        // Upsert the rows in the table.
        // Note: if this fails, the Table will still contain the new schema, but the rows will not
        // be updated. This isn't too bad, because the merged schema is necessarily
        // backward-compatible with the previous one. The other way around would not be true -- old
        // schema doesn't necessarily work with the new rows. This is why we cannot `try_join_all`.

        // Only do it if we are truncating or if the table is already migrated to CSV.
        if truncate || self.table.migrated_to_csv() {
            let gcs_store = GoogleCloudStorageDatabasesStore::new();
            gcs_store
                .batch_upsert_table_rows(&self.table, &new_table_schema, &rows, truncate)
                .await?;

            store
                .set_data_source_table_migrated_to_csv(
                    &self.table.project,
                    &self.table.data_source_id,
                    &self.table.table_id,
                    true,
                    None,
                )
                .await?;
        }

        info!(
            duration = utils::now() - now,
            table_id = self.table.table_id(),
            rows_count = rows.len(),
            "DSSTRUCTSTAT [upsert_rows] rows upsert"
        );

        now = utils::now();
        // Invalidate the databases that use the table.
        try_join_all(
            (store
                .find_databases_using_table(
                    &self.table.project,
                    &self.table.data_source_id,
                    &self.table.table_id,
                    HEARTBEAT_INTERVAL_MS,
                )
                .await?)
                .into_iter()
                .map(|db| {
                    let store = store.clone();
                    async move {
                        db.invalidate(store).await?;
                        Ok::<_, anyhow::Error>(())
                    }
                }),
        )
        .await?;
        info!(
            duration = utils::now() - now,
            table_id = self.table.table_id(),
            "DSSTRUCTSTAT [upsert_rows] invalidate dbs"
        );

        Ok(())
    }

    async fn schedule_background_upsert_or_delete(&self, rows: Vec<Row>) -> Result<()> {
        let mut redis_conn = REDIS_CLIENT.get_async_connection().await?;

        // Write the rows to GCS for the worker to process
        let rows_arc = Arc::new(rows);
        let schema = TableSchema::from_rows_async(rows_arc.clone()).await?;
        GoogleCloudStorageBackgroundProcessingStore::write_rows_to_csv(
            &self.table,
            &schema,
            &rows_arc,
        )
        .await?;

        // Tell the worker that there are things to process for this table.
        let upsert_call = TableUpsertActivityData {
            time: utils::now(),
            project_id: self.table.project().project_id(),
            data_source_id: self.table.data_source_id().to_string(),
            table_id: self.table.table_id().to_string(),
        };
        let _: () = redis_conn
            .hset(
                REDIS_TABLE_UPSERT_HASH_NAME,
                self.table.unique_id(),
                serde_json::to_string(&upsert_call)?,
            )
            .await?;

        Ok(())
    }

    pub async fn upsert_csv_content(
        &self,
        store: Box<dyn Store + Sync + Send>,
        databases_store: Box<dyn DatabasesStore + Sync + Send>,
        bucket: &str,
        bucket_csv_path: &str,
        truncate: bool,
    ) -> Result<()> {
        let now = utils::now();

        let rows = GoogleCloudStorageCSVContent {
            bucket: bucket.to_string(),
            bucket_csv_path: bucket_csv_path.to_string(),
        }
        .parse()
        .await?;

        let csv_parse_duration = utils::now() - now;

        let now = utils::now();
        self.upsert_rows(
            store.clone(),
            databases_store.clone(),
            rows.clone(),
            truncate,
        )
        .await?;
        let upsert_duration = utils::now() - now;

        info!(
            csv_parse_duration = csv_parse_duration,
            upsert_duration = upsert_duration,
            "CSV upsert"
        );

        Ok(())
    }

    pub async fn retrieve_row(
        &self,
        databases_store: Box<dyn DatabasesStore + Sync + Send>,
        row_id: &str,
    ) -> Result<Option<Row>> {
        databases_store.load_table_row(&self.table, row_id).await
    }

    pub async fn delete_row(
        &self,
        databases_store: Box<dyn DatabasesStore + Sync + Send>,
        row_id: &str,
    ) -> Result<()> {
        // Delete the table row.

        if SAVE_TABLES_TO_POSTGRES {
            databases_store
                .delete_table_row(&self.table, row_id)
                .await?
        }

        // Deletions are conveyed by special rows
        if SAVE_TABLES_TO_GCS {
            // For now, we don't propagate failures since it's just a shadow operation
            let rows = vec![Row::new_delete_marker_row(row_id.to_string())];
            if let Err(e) = self.schedule_background_upsert_or_delete(rows).await {
                tracing::error!("delete_row: failed to schedule background work: {:?}", e);
            }
            Ok(())
        } else {
            Ok(())
        }
    }

    pub async fn list_rows(
        &self,
        databases_store: Box<dyn DatabasesStore + Sync + Send>,
        limit_offset: Option<(usize, usize)>,
    ) -> Result<(Vec<Row>, usize)> {
        databases_store
            .list_table_rows(&self.table, limit_offset)
            .await
    }

    pub async fn schema(
        &mut self,
        store: Box<dyn Store + Sync + Send>,
        databases_store: Box<dyn DatabasesStore + Sync + Send>,
    ) -> Result<Option<TableSchema>> {
        match &self.table.schema_stale_at {
            Some(_) => {
                let schema = self.compute_schema(databases_store).await?;

                store
                    .update_data_source_table_schema(
                        &self.table.project,
                        &self.table.data_source_id,
                        &self.table.table_id,
                        &schema,
                    )
                    .await?;
                self.table.set_schema(schema.clone());

                Ok(Some(schema))
            }
            None => Ok(self.table.schema.clone()),
        }
    }

    async fn compute_schema(
        &self,
        databases_store: Box<dyn DatabasesStore + Sync + Send>,
    ) -> Result<TableSchema> {
        let mut schema: TableSchema = TableSchema::empty();
        let limit = 500;
        let mut offset = 0;
        loop {
            let (rows, total) = self
                .list_rows(databases_store.clone(), Some((limit, offset)))
                .await?;

            let rows = Arc::new(rows);
            if offset == 0 {
                schema = TableSchema::from_rows_async(rows.clone()).await?;
            } else {
                schema = schema.merge(&TableSchema::from_rows_async(rows.clone()).await?)?;
            }

            offset += limit;
            if offset >= total {
                break;
            }
        }

        Ok(schema)
    }

    pub async fn validate_csv_content(bucket: &str, bucket_csv_path: &str) -> Result<TableSchema> {
        let now = utils::now();
        let rows = Arc::new(
            GoogleCloudStorageCSVContent {
                bucket: bucket.to_string(),
                bucket_csv_path: bucket_csv_path.to_string(),
            }
            .parse()
            .await?,
        );
        let csv_parse_duration = utils::now() - now;

        let now = utils::now();
        let schema = TableSchema::from_rows_async(rows).await?;
        let schema_duration = utils::now() - now;

        info!(
            csv_parse_duration = csv_parse_duration,
            schema_duration = schema_duration,
            "CSV validation"
        );

        Ok(schema)
    }
}

impl Filterable for Table {
    fn match_filter(&self, filter: &Option<SearchFilter>) -> bool {
        match &filter {
            Some(filter) => filter.match_filter(self),
            None => true,
        }
    }

    fn get_timestamp(&self) -> u64 {
        self.timestamp
    }

    fn get_tags(&self) -> Vec<String> {
        self.tags.clone()
    }

    fn get_parents(&self) -> Vec<String> {
        self.parents.clone()
    }
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct Row {
    pub row_id: String,
    pub value: serde_json::Map<String, serde_json::Value>,
    // To keep track of pending delete actions, we use a special marker row.
    // This allows us to keep all the row data in the same format, which keeps the
    // implementation simpler.
    pub is_delete: bool,
}

impl Row {
    pub fn new(row_id: String, value: serde_json::Map<String, serde_json::Value>) -> Self {
        Row {
            row_id,
            value,
            is_delete: false,
        }
    }

    pub fn new_delete_marker_row(row_id: String) -> Self {
        Row {
            row_id,
            value: serde_json::Map::new(),
            is_delete: true,
        }
    }

    /// This method implements our interpretation of CSVs into Table rows.
    pub fn from_csv_record(
        headers: &Vec<String>,
        record: Vec<&str>,
        row_idx: usize,
    ) -> Result<Row> {
        let mut value_map = serde_json::Map::new();

        fn try_parse_float(s: &str) -> Result<serde_json::Number> {
            if let Ok(float) = s.parse::<f64>() {
                match serde_json::Number::from_f64(float) {
                    Some(num) => Ok(num),
                    None => Err(anyhow!("Invalid JSON float value")),
                }
            } else {
                Err(anyhow!("Invalid float value"))
            }
        }

        for (i, field) in record.iter().enumerate() {
            if i >= headers.len() {
                break;
            }

            let header = &headers[i];
            let trimmed = field.trim();

            if header == "__dust_id" {
                continue;
            }

            let parsed_value = if trimmed.is_empty() {
                Value::Null
            } else if let Ok(int) = trimmed.parse::<i64>() {
                Value::Number(int.into())
            } else if let Ok(float) = try_parse_float(trimmed) {
                // Numbers
                Value::Number(float)
            } else if let Ok(bool_val) = match trimmed.to_lowercase().as_str() {
                // Booleans
                "t" | "true" => Ok(true),
                "f" | "false" => Ok(false),
                _ => Err(anyhow!("Invalid boolean value")),
            } {
                Value::Bool(bool_val)
            } else {
                // Various datetime formats
                let mut dt: Option<DateTime<Utc>> = [
                    // RFC3339
                    DateTime::parse_from_rfc3339(trimmed).map(|dt| dt.into()),
                    // RFC2822
                    DateTime::parse_from_rfc2822(trimmed).map(|dt| dt.into()),
                    // SQL
                    DateTime::parse_from_str(trimmed, "%Y-%m-%d %H:%M:%S").map(|dt| dt.into()),
                    // HTTP date
                    DateTime::parse_from_str(trimmed, "%a, %d %b %Y %H:%M:%S GMT")
                        .map(|dt| dt.into()),
                    // Google Spreadsheet format
                    NaiveDate::parse_from_str(trimmed, "%d-%b-%Y").map(|d| {
                        let dt = d.and_hms_opt(0, 0, 0).unwrap();
                        dt.and_local_timezone(Utc).unwrap()
                    }),
                    // Date with full month, zero-padded number, full year
                    NaiveDate::parse_from_str(trimmed, "%B %d %Y").map(|d| {
                        let dt = d.and_hms_opt(0, 0, 0).unwrap();
                        dt.and_local_timezone(Utc).unwrap()
                    }),
                ]
                .iter()
                .find_map(|result| result.ok());

                // We fallback on dateparser for all other formats
                if dt.is_none() {
                    dt = match std::panic::catch_unwind(|| {
                        dateparser::parse_with(
                            trimmed,
                            &Utc,
                            NaiveTime::from_hms_opt(0, 0, 0).unwrap(),
                        )
                    }) {
                        Ok(result) => result.ok(),
                        Err(e) => {
                            tracing::warn!("Panic while parsing date '{}': {:?}", trimmed, e);
                            None
                        }
                    };
                }

                if let Some(datetime) = dt {
                    let mut dt_obj = serde_json::Map::new();
                    dt_obj.insert("type".to_string(), Value::String("datetime".to_string()));
                    dt_obj.insert(
                        "epoch".to_string(),
                        Value::Number(serde_json::Number::from(datetime.timestamp_millis())),
                    );
                    dt_obj.insert(
                        "string_value".to_string(),
                        Value::String(trimmed.to_string()),
                    );
                    Value::Object(dt_obj)
                } else {
                    Value::String(trimmed.to_string())
                }
            };

            value_map.insert(header.clone(), parsed_value);
        }

        let row_id = if let Some(pos) = headers.iter().position(|h| h == "__dust_id") {
            record.get(pos).map(|id| id.trim().to_string())
        } else {
            None
        }
        .unwrap_or_else(|| row_idx.to_string());

        Ok(Row::new(row_id, value_map))
    }

    pub fn to_csv_record(&self, headers: &Vec<String>) -> Result<Vec<String>> {
        let mut record = Vec::new();
        for header in headers {
            // We need to set the row_id in a __dust_id field
            if header == "__dust_id" {
                record.push(self.row_id().to_string());
                continue;
            }

            match self.value().get(header) {
                Some(Value::Bool(b)) => record.push(b.to_string()),
                Some(Value::Number(x)) => {
                    if x.is_i64() {
                        record.push(x.as_i64().unwrap().to_string())
                    } else if x.is_u64() {
                        record.push((x.as_u64().unwrap() as i64).to_string())
                    } else if x.is_f64() {
                        record.push(x.as_f64().unwrap().to_string());
                    } else {
                        return Err(anyhow!("Number is not an i64 or f64: {}", x));
                    }
                }
                Some(Value::String(s)) => record.push(s.clone()),
                Some(Value::Object(obj)) => match TableSchema::try_parse_date_object(obj) {
                    Some(date) => record.push(date),
                    None => return Err(anyhow!("Unknown object type")),
                },
                None | Some(Value::Null) => record.push("".to_string()),
                _ => {
                    return Err(anyhow!(
                        "Cannot convert value {:?} to SqlParam",
                        self.value()
                    ))
                }
            };
        }
        Ok(record)
    }

    pub fn row_id(&self) -> &str {
        &self.row_id
    }
    pub fn content(&self) -> &serde_json::Map<String, serde_json::Value> {
        &self.value
    }
}

impl HasValue for Row {
    fn value(&self) -> &serde_json::Map<String, serde_json::Value> {
        &self.value
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils;

    #[tokio::test]
    async fn test_local_table_to_dbml() -> anyhow::Result<()> {
        let row_1 = serde_json::Map::from_iter([
            ("user_id".to_string(), 1.into()),
            ("temperature".to_string(), 1.2.into()),
            ("label".to_string(), "foo".into()),
            ("ready".to_string(), true.into()),
        ]);

        let row_2 = serde_json::Map::from_iter([
            ("user_id".to_string(), 2.into()),
            ("temperature".to_string(), 2.4.into()),
            ("label".to_string(), "bar".into()),
            ("ready".to_string(), false.into()),
            (
                "description".to_string(),
                "not null anymore and prety long so that it's not shown in note".into(),
            ),
        ]);

        let rows = Arc::new(vec![
            Row::new("1".to_string(), row_1),
            Row::new("2".to_string(), row_2),
        ]);

        let schema = TableSchema::from_rows_async(rows).await?;
        let table = Table::new(
            Project::new_from_id(42),
            "data_source_id".to_string(),
            "data_source_internal_id".to_string(),
            utils::now(),
            "table_id".to_string(),
            "test_dbml".to_string(),
            "Test records for DBML rendering".to_string(),
            utils::now(),
            "test_dbml".to_string(),
            "text/plain".to_string(),
            None,
            vec![],
            None,
            vec![],
            None,
            Some(schema),
            None,
            false,
            None,
            None,
        );
        let local_table = LocalTable::from_table(table)?;

        let expected = r#"Table test_dbml {
  user_id integer [note: 'possible values: 1, 2']
  temperature real [note: 'possible values: 1.2, 2.4']
  label text [note: 'possible values: "foo", "bar"']
  ready boolean [note: 'possible values: TRUE, FALSE']
  description text

  Note: 'Test records for DBML rendering'
}"#
        .to_string();
        assert_eq!(local_table.render_dbml(None), expected);

        Ok(())
    }

    #[tokio::test]
    async fn test_row_from_csv_record() -> anyhow::Result<()> {
        let headers = vec!["test".to_string(), "date".to_string()];

        let record = vec!["1", "2021-01-01T00:00:00Z"];
        let row = Row::from_csv_record(&headers, record, 0)?;
        assert_eq!(row.row_id(), "0");
        assert_eq!(
            row.content(),
            &serde_json::Map::from_iter([
                ("test".to_string(), 1.into()),
                (
                    "date".to_string(),
                    serde_json::Map::from_iter([
                        ("type".to_string(), "datetime".into()),
                        ("epoch".to_string(), 1609459200000_i64.into()),
                        ("string_value".to_string(), "2021-01-01T00:00:00Z".into()),
                    ])
                    .into()
                )
            ])
        );

        let record = vec!["123a", "March 2, 2021"];
        let row = Row::from_csv_record(&headers, record, 0)?;
        assert_eq!(row.content()["test"], Value::String("123a".to_string()));
        assert_eq!(
            row.content()["date"]["type"],
            Value::String("datetime".to_string())
        );
        assert_eq!(
            row.content()["date"]["string_value"],
            Value::String("March 2, 2021".to_string())
        );

        let record = vec!["true", "02-Jan-2021"];
        let row = Row::from_csv_record(&headers, record, 0)?;
        assert_eq!(row.content()["test"], Value::Bool(true));
        assert_eq!(
            row.content()["date"]["string_value"],
            Value::String("02-Jan-2021".to_string())
        );
        assert_eq!(
            row.content()["date"]["epoch"],
            Value::Number(1609545600000_i64.into())
        );

        let record = vec!["false", "2024-02-19 15:30:45"];
        let row = Row::from_csv_record(&headers, record, 0)?;
        assert_eq!(row.content()["test"], Value::Bool(false));
        assert_eq!(
            row.content()["date"]["string_value"],
            Value::String("2024-02-19 15:30:45".to_string())
        );
        assert_eq!(
            row.content()["date"]["epoch"],
            Value::Number(1708356645000_i64.into())
        );

        let record = vec!["", "2-Jan-2021"];
        let row = Row::from_csv_record(&headers, record, 0)?;
        assert_eq!(
            row.content()["date"]["string_value"],
            Value::String("2-Jan-2021".to_string())
        );
        assert_eq!(
            row.content()["date"]["epoch"],
            Value::Number(1609545600000_i64.into())
        );

        let record = vec!["", "January 02, 2021"];
        let row = Row::from_csv_record(&headers, record, 0)?;
        assert_eq!(
            row.content()["date"]["string_value"],
            Value::String("January 02, 2021".to_string())
        );
        assert_eq!(
            row.content()["date"]["epoch"],
            Value::Number(1609545600000_i64.into())
        );

        let record = vec!["", "Fri, 14 Feb 2025 15:10:34 GMT"];
        let row = Row::from_csv_record(&headers, record, 0)?;
        assert_eq!(
            row.content()["date"]["string_value"],
            Value::String("Fri, 14 Feb 2025 15:10:34 GMT".to_string())
        );
        assert_eq!(
            row.content()["date"]["epoch"],
            Value::Number(1739545834000_i64.into())
        );

        let headers = vec!["a".to_string(), "b".to_string(), "c".to_string()];
        let record = vec!["2", "2.0", "0.1"];
        let row = Row::from_csv_record(&headers, record, 0)?;
        assert_eq!(row.content()["a"], Value::Number(2.into()));
        assert_eq!(
            row.content()["b"],
            Value::Number(serde_json::Number::from_f64(2.0).unwrap())
        );
        assert_eq!(
            row.content()["c"],
            Value::Number(serde_json::Number::from_f64(0.1).unwrap())
        );

        let headers = vec!["a".to_string(), "b".to_string()];
        let record = vec!["true", "false"];
        let row = Row::from_csv_record(&headers, record, 0)?;
        assert_eq!(row.content()["a"], Value::Bool(true));
        assert_eq!(row.content()["b"], Value::Bool(false));

        let headers = vec!["a".to_string(), "b".to_string()];
        let record = vec!["TRUE", "FALSE"];
        let row = Row::from_csv_record(&headers, record, 0)?;
        assert_eq!(row.content()["a"], Value::Bool(true));
        assert_eq!(row.content()["b"], Value::Bool(false));

        let headers = vec!["a".to_string(), "b".to_string()];
        let record = vec!["t", "f"];
        let row = Row::from_csv_record(&headers, record, 0)?;
        assert_eq!(row.content()["a"], Value::Bool(true));
        assert_eq!(row.content()["b"], Value::Bool(false));

        let headers = vec!["a".to_string(), "b".to_string()];
        let record = vec!["trUe", "fALse"];
        let row = Row::from_csv_record(&headers, record, 0)?;
        assert_eq!(row.content()["a"], Value::Bool(true));
        assert_eq!(row.content()["b"], Value::Bool(false));

        Ok(())
    }

    #[tokio::test]
    async fn test_csv_round_trip_bijective() -> anyhow::Result<()> {
        // Test case 1: Row with data types that should be perfectly bijective
        let simple_row_data = serde_json::Map::from_iter([
            ("integer_col".to_string(), 42.into()),
            ("float_col".to_string(), 3.14.into()),
            ("string_col".to_string(), "hello world".into()),
            ("bool_col".to_string(), true.into()),
            ("null_col".to_string(), Value::Null),
        ]);

        let simple_row = Row::new("test_row_id".to_string(), simple_row_data);

        // Extract headers and ensure consistent ordering
        let mut headers: Vec<String> = simple_row.value().keys().cloned().collect();
        headers.sort();

        // Convert row to CSV record and back
        let csv_record = simple_row.to_csv_record(&headers)?;
        let reconstructed_row =
            Row::from_csv_record(&headers, csv_record.iter().map(|s| s.as_str()).collect(), 0)?;

        // Content should be identical for simple data types
        assert_eq!(simple_row.content(), reconstructed_row.content());

        // Test case 2: Verify expected transformations for edge cases
        let edge_case_data = serde_json::Map::from_iter([
            ("empty_string".to_string(), "".into()),
            ("non_empty_string".to_string(), "not empty".into()),
        ]);

        let edge_case_row = Row::new("edge_case_id".to_string(), edge_case_data);
        let edge_headers: Vec<String> = edge_case_row.value().keys().cloned().collect();

        let edge_csv_record = edge_case_row.to_csv_record(&edge_headers)?;
        let edge_reconstructed_row = Row::from_csv_record(
            &edge_headers,
            edge_csv_record.iter().map(|s| s.as_str()).collect(),
            0,
        )?;

        // Empty strings become null when parsed from CSV - this is expected behavior
        assert_eq!(
            edge_reconstructed_row.content()["empty_string"],
            Value::Null
        );
        assert_eq!(
            edge_reconstructed_row.content()["non_empty_string"],
            Value::String("not empty".to_string())
        );

        // Test case 3: Test with __dust_id to verify row_id preservation
        let mut headers_with_id = headers.clone();
        headers_with_id.insert(0, "__dust_id".to_string());

        let mut csv_record_with_id = csv_record.clone();
        csv_record_with_id.insert(0, simple_row.row_id().to_string());

        let reconstructed_row_with_id = Row::from_csv_record(
            &headers_with_id,
            csv_record_with_id.iter().map(|s| s.as_str()).collect(),
            0,
        )?;

        // Row ID should be preserved and content should still match
        assert_eq!(simple_row.row_id(), "test_row_id");
        assert_eq!(simple_row.row_id(), reconstructed_row_with_id.row_id());
        assert_eq!(simple_row.content(), reconstructed_row_with_id.content());

        // Test case 4: Date round trip test (dates may have format changes but should preserve epoch)
        let date_data = serde_json::Map::from_iter([(
            "date_col".to_string(),
            serde_json::Map::from_iter([
                ("type".to_string(), "datetime".into()),
                ("epoch".to_string(), 1609459200000_i64.into()),
                ("string_value".to_string(), "2021-01-01T00:00:00Z".into()),
            ])
            .into(),
        )]);

        let date_row = Row::new("date_test_id".to_string(), date_data);
        let date_headers: Vec<String> = date_row.value().keys().cloned().collect();

        let date_csv_record = date_row.to_csv_record(&date_headers)?;
        let date_reconstructed_row = Row::from_csv_record(
            &date_headers,
            date_csv_record.iter().map(|s| s.as_str()).collect(),
            0,
        )?;

        // The epoch should be preserved even if string format changes
        assert_eq!(
            date_row.content()["date_col"]["type"],
            date_reconstructed_row.content()["date_col"]["type"]
        );
        assert_eq!(
            date_row.content()["date_col"]["epoch"],
            date_reconstructed_row.content()["date_col"]["epoch"]
        );
        // Note: string_value may change format during parsing, so we don't assert equality on it

        // Test case 5: Test that the __dust_id field is present in the CSV record at the position of the field in the headers
        let dust_id_row = Row::new(
            "dust_id_test_id".to_string(),
            serde_json::Map::from_iter([("property".to_string(), "value".into())]),
        );
        let headers = vec!["property".to_string(), "__dust_id".to_string()];
        let dust_id_csv_record = dust_id_row.to_csv_record(&headers)?;
        assert_eq!(
            dust_id_csv_record[dust_id_csv_record.len() - 1],
            dust_id_row.row_id()
        );

        Ok(())
    }
}
