use std::sync::Arc;

use anyhow::{anyhow, Result};
use chrono::{DateTime, NaiveDate, NaiveTime, Utc};
use futures::future::try_join_all;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tracing::info;

use crate::search_stores::search_store::NodeItem;
use crate::{
    data_sources::node::ProviderVisibility,
    databases::{csv::UpsertQueueCSVContent, database::HasValue, table_schema::TableSchema},
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
    pub fn remote_database_table_id(&self) -> Option<&str> {
        self.remote_database_table_id.as_deref()
    }
    pub fn remote_database_secret_id(&self) -> Option<&str> {
        println!(
            "-----------remote_database_secret_id: {:?}",
            self.remote_database_secret_id
        );
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

    // if search_store is provided, delete the table node from the search index
    pub async fn delete(
        &self,
        store: Box<dyn Store + Sync + Send>,
        databases_store: Box<dyn DatabasesStore + Sync + Send>,
        search_store: Option<Box<dyn SearchStore + Sync + Send>>,
    ) -> Result<()> {
        if self.table_type()? == TableType::Local {
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

            // Delete the table rows.
            databases_store.delete_table_rows(&self.unique_id()).await?;
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
            Some(ref schema) => schema.render_dbml(name, self.table.description()),
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

        let mut now = utils::now();
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

        now = utils::now();
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
            .batch_upsert_table_rows(&self.table.unique_id(), &rows, truncate)
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

    pub async fn upsert_csv_content(
        &self,
        store: Box<dyn Store + Sync + Send>,
        databases_store: Box<dyn DatabasesStore + Sync + Send>,
        bucket: &str,
        bucket_csv_path: &str,
        truncate: bool,
    ) -> Result<()> {
        let now = utils::now();
        let rows = UpsertQueueCSVContent {
            bucket: bucket.to_string(),
            bucket_csv_path: bucket_csv_path.to_string(),
        }
        .parse()
        .await?;
        let csv_parse_duration = utils::now() - now;

        let now = utils::now();
        self.upsert_rows(store, databases_store, rows, truncate)
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
        databases_store
            .load_table_row(&self.table.unique_id(), row_id)
            .await
    }

    pub async fn delete_row(
        &self,
        databases_store: Box<dyn DatabasesStore + Sync + Send>,
        row_id: &str,
    ) -> Result<()> {
        databases_store
            .delete_table_row(&self.table.unique_id(), row_id)
            .await
    }

    pub async fn list_rows(
        &self,
        databases_store: Box<dyn DatabasesStore + Sync + Send>,
        limit_offset: Option<(usize, usize)>,
    ) -> Result<(Vec<Row>, usize)> {
        databases_store
            .list_table_rows(&self.table.unique_id(), limit_offset)
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
            UpsertQueueCSVContent {
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
}

impl Row {
    pub fn new(row_id: String, value: serde_json::Map<String, serde_json::Value>) -> Self {
        Row { row_id, value }
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
}
