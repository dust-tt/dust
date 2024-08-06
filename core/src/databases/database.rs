use std::collections::HashMap;

use super::table_schema::TableSchema;
use crate::{
    data_sources::data_source::SearchFilter,
    databases_store::store::DatabasesStore,
    project::Project,
    sqlite_workers::client::{SqliteWorker, SqliteWorkerError, HEARTBEAT_INTERVAL_MS},
    stores::store::Store,
    utils,
};
use anyhow::{anyhow, Result};
use futures::future::try_join_all;
use itertools::Itertools;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;
use tracing::info;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DatabaseType {
    LOCAL,
    REMOTE,
}

impl ToString for DatabaseType {
    fn to_string(&self) -> String {
        match self {
            DatabaseType::LOCAL => String::from("local"),
            DatabaseType::REMOTE => String::from("remote"),
        }
    }
}

#[derive(Debug, Error)]
pub enum QueryDatabaseError {
    #[error("{0}")]
    GenericError(#[from] anyhow::Error),
    #[error("Too many result rows")]
    TooManyResultRows,
    #[error("Query execution error: {0}")]
    ExecutionError(String),
}

impl From<SqliteWorkerError> for QueryDatabaseError {
    fn from(e: SqliteWorkerError) -> Self {
        match &e {
            SqliteWorkerError::TooManyResultRows => QueryDatabaseError::TooManyResultRows,
            SqliteWorkerError::QueryExecutionError(msg) => {
                QueryDatabaseError::ExecutionError(msg.clone())
            }
            _ => QueryDatabaseError::GenericError(e.into()),
        }
    }
}

pub async fn query_database(
    tables: &Vec<Table>,
    store: Box<dyn Store + Sync + Send>,
    query: &str,
) -> Result<(Vec<QueryResult>, TableSchema), QueryDatabaseError> {
    let table_ids_hash = tables.iter().map(|t| t.unique_id()).sorted().join("/");
    let database = store
        .upsert_database(&table_ids_hash, HEARTBEAT_INTERVAL_MS)
        .await?;

    let time_query_start = utils::now();

    let result_rows = match database.sqlite_worker() {
        Some(sqlite_worker) => {
            let result_rows = sqlite_worker
                .execute_query(&table_ids_hash, tables, query)
                .await?;
            result_rows
        }
        None => Err(anyhow!(
            "No live SQLite worker found for database {}",
            database.table_ids_hash
        ))?,
    };

    info!(
        duration = utils::now() - time_query_start,
        "DSSTRUCTSTAT Finished executing user query on worker"
    );

    let infer_result_schema_start = utils::now();
    let table_schema = TableSchema::from_rows(&result_rows)?;

    info!(
        duration = utils::now() - infer_result_schema_start,
        "DSSTRUCTSTAT Finished inferring schema"
    );
    info!(
        duration = utils::now() - time_query_start,
        "DSSTRUCTSTAT Finished query database"
    );

    Ok((result_rows, table_schema))
}

pub async fn invalidate_database(db: Database, store: Box<dyn Store + Sync + Send>) -> Result<()> {
    if let Some(worker) = db.sqlite_worker() {
        worker.invalidate_database(db.unique_id()).await?;
    } else {
        // If the worker is not alive, we delete the database row in case the worker becomes alive again.
        store.delete_database(&db.table_ids_hash).await?;
    }

    Ok(())
}

#[derive(Debug, Serialize, Clone)]
pub struct Database {
    created: u64,
    table_ids_hash: String,
    sqlite_worker: Option<SqliteWorker>,
}

impl Database {
    pub fn new(created: u64, table_ids_hash: &str, sqlite_worker: &Option<SqliteWorker>) -> Self {
        Database {
            created,
            table_ids_hash: table_ids_hash.to_string(),
            sqlite_worker: sqlite_worker.clone(),
        }
    }

    pub fn sqlite_worker(&self) -> &Option<SqliteWorker> {
        &self.sqlite_worker
    }

    pub fn unique_id(&self) -> &str {
        &self.table_ids_hash
    }
}

#[derive(Debug, Serialize, Clone, Deserialize)]
pub struct Table {
    project: Project,
    data_source_id: String,
    created: u64,

    table_id: String,
    name: String,
    description: String,
    timestamp: u64,
    tags: Vec<String>,
    parents: Vec<String>,

    schema: Option<TableSchema>,
    schema_stale_at: Option<u64>,
}

pub fn get_table_unique_id(project: &Project, data_source_id: &str, table_id: &str) -> String {
    format!("{}__{}__{}", project.project_id(), data_source_id, table_id)
}

impl Table {
    pub fn new(
        project: &Project,
        data_source_id: &str,
        created: u64,
        table_id: &str,
        name: &str,
        description: &str,
        timestamp: u64,
        tags: Vec<String>,
        parents: Vec<String>,
        schema: &Option<TableSchema>,
        schema_stale_at: Option<u64>,
    ) -> Self {
        Table {
            project: project.clone(),
            data_source_id: data_source_id.to_string(),
            created,
            table_id: table_id.to_string(),
            name: name.to_string(),
            description: description.to_string(),
            timestamp,
            tags,
            parents,
            schema: schema.clone(),
            schema_stale_at,
        }
    }

    pub fn project(&self) -> &Project {
        &self.project
    }
    pub fn data_source_id(&self) -> &str {
        &self.data_source_id
    }
    pub fn created(&self) -> u64 {
        self.created
    }
    pub fn table_id(&self) -> &str {
        &self.table_id
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

    pub fn match_filter(&self, filter: &Option<SearchFilter>) -> bool {
        match &filter {
            Some(filter) => {
                let mut m = true;
                match &filter.tags {
                    Some(tags) => {
                        m = m
                            && match &tags.is_in {
                                Some(is_in) => is_in.iter().any(|tag| self.tags.contains(tag)),
                                None => true,
                            };
                        m = m
                            && match &tags.is_not {
                                Some(is_not) => is_not.iter().all(|tag| !self.tags.contains(tag)),
                                None => true,
                            };
                    }
                    None => (),
                }
                match &filter.parents {
                    Some(parents) => {
                        m = m
                            && match &parents.is_in {
                                Some(is_in) => {
                                    is_in.iter().any(|parent| self.parents.contains(parent))
                                }
                                None => true,
                            };
                        m = m
                            && match &parents.is_not {
                                Some(is_not) => {
                                    is_not.iter().all(|parent| !self.parents.contains(parent))
                                }
                                None => true,
                            };
                    }
                    None => (),
                }
                match &filter.timestamp {
                    Some(timestamp) => {
                        m = m
                            && match timestamp.gt {
                                Some(gt) => self.timestamp as i64 >= gt,
                                None => true,
                            };
                        m = m
                            && match timestamp.lt {
                                Some(lt) => self.timestamp as i64 <= lt,
                                None => true,
                            };
                    }
                    None => (),
                }
                m
            }
            None => true,
        }
    }

    pub fn render_dbml(&self, name: Option<&str>) -> String {
        let name = match name {
            Some(name) => name,
            None => self.name(),
        };
        match self.schema {
            None => format!("Table {} {{\n}}", name),
            Some(ref schema) => format!(
                "Table {} {{\n{}\n\n  Note: '{}'\n}}",
                name,
                schema
                    .columns()
                    .iter()
                    .map(|c| format!("  {}", c.render_dbml()))
                    .join("\n"),
                self.description()
            ),
        }
    }

    pub async fn schema(
        &mut self,
        store: Box<dyn Store + Sync + Send>,
        databases_store: Box<dyn DatabasesStore + Sync + Send>,
    ) -> Result<Option<TableSchema>> {
        match &self.schema_stale_at {
            Some(_) => {
                let schema = self.compute_schema(databases_store).await?;
                store
                    .update_table_schema(
                        &self.project,
                        &self.data_source_id,
                        &self.table_id,
                        &schema,
                    )
                    .await?;
                self.schema = Some(schema.clone());
                Ok(Some(schema.clone()))
            }
            None => Ok(self.schema.clone()),
        }
    }

    pub async fn delete(
        &self,
        store: Box<dyn Store + Sync + Send>,
        databases_store: Box<dyn DatabasesStore + Sync + Send>,
    ) -> Result<()> {
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
                .map(|db| invalidate_database(db, store.clone())),
        )
        .await?;

        // Delete the table rows.
        databases_store.delete_table_rows(&self.unique_id()).await?;

        store
            .delete_table(&self.project, &self.data_source_id, &self.table_id)
            .await?;

        Ok(())
    }

    pub async fn upsert_rows(
        &self,
        store: Box<dyn Store + Sync + Send>,
        databases_store: Box<dyn DatabasesStore + Sync + Send>,
        rows: &Vec<Row>,
        truncate: bool,
    ) -> Result<()> {
        // Validate that all rows keys are lowercase.
        for (row_index, row) in rows.iter().enumerate() {
            let object = match row.value().as_object() {
                Some(object) => object,
                None => Err(anyhow!("Row {} is not an object", row_index,))?,
            };
            match object.keys().find(|key| match key.chars().next() {
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

        let new_table_schema = match truncate {
            // If the new rows replace existing ones, we need to clear the schema cache.
            true => TableSchema::from_rows(&rows)?,
            false => match self.schema_cached() {
                // If there is no existing schema cache, simply use the new schema.
                None => TableSchema::from_rows(&rows)?,
                Some(existing_table_schema) => {
                    // If there is an existing schema cache, merge it with the new schema.
                    existing_table_schema.merge(&TableSchema::from_rows(&rows)?)?
                }
            },
        };

        store
            .update_table_schema(
                &self.project,
                &self.data_source_id,
                &self.table_id,
                &new_table_schema,
            )
            .await?;

        if !truncate {
            // When doing incremental updates to a table's rows, the schema may become too wide.
            // For example, if a column has only integers, it's an integer column. If a new row has a string in that column, the column becomes a string column.
            // However, if that row is later updated to have an integer, the column should become an integer column again, but we cannot know that without looking at all the rows.
            // This is why we invalidate the schema when doing incremental updates, and next time the schema is requested, it will be recomputed from all the rows.
            store
                .invalidate_table_schema(&self.project, &self.data_source_id, &self.table_id)
                .await?;
        }

        // Upsert the rows in the table.
        // Note: if this fails, the Table will still contain the new schema, but the rows will not be updated.
        // This isn't too bad, because the merged schema is necessarily backward-compatible with the previous one.
        // The other way around would not be true -- old schema doesn't necessarily work with the new rows.
        // This is why we cannot `try_join_all`.
        databases_store
            .batch_upsert_table_rows(&self.unique_id(), rows, truncate)
            .await?;

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
                .map(|db| invalidate_database(db, store.clone())),
        )
        .await?;

        Ok(())
    }

    pub async fn retrieve_row(
        &self,
        databases_store: Box<dyn DatabasesStore + Sync + Send>,
        row_id: &str,
    ) -> Result<Option<Row>> {
        databases_store
            .load_table_row(&self.unique_id(), row_id)
            .await
    }

    pub async fn delete_row(
        &self,
        databases_store: Box<dyn DatabasesStore + Sync + Send>,
        row_id: &str,
    ) -> Result<()> {
        databases_store
            .delete_table_row(&self.unique_id(), row_id)
            .await
    }

    pub async fn list_rows(
        &self,
        databases_store: Box<dyn DatabasesStore + Sync + Send>,
        limit_offset: Option<(usize, usize)>,
    ) -> Result<(Vec<Row>, usize)> {
        databases_store
            .list_table_rows(&self.unique_id(), limit_offset)
            .await
    }

    pub async fn update_parents(
        &self,
        store: Box<dyn Store + Sync + Send>,
        parents: Vec<String>,
    ) -> Result<()> {
        store
            .update_table_parents(
                &self.project,
                &self.data_source_id,
                &&self.table_id,
                &parents,
            )
            .await?;
        Ok(())
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

            if offset == 0 {
                schema = TableSchema::from_rows(&rows)?;
            } else {
                schema = schema.merge(&TableSchema::from_rows(&rows)?)?;
            }

            offset += limit;
            if offset >= total {
                break;
            }
        }

        Ok(schema)
    }
}

pub trait HasValue {
    fn value(&self) -> &Value;
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct Row {
    row_id: String,
    value: Value,
}

impl Row {
    pub fn new(row_id: String, value: Value) -> Self {
        Row { row_id, value }
    }

    pub fn row_id(&self) -> &str {
        &self.row_id
    }
    pub fn content(&self) -> &Value {
        &self.value
    }
}

impl HasValue for Row {
    fn value(&self) -> &Value {
        &self.value
    }
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct QueryResult {
    pub value: Value,
}

impl HasValue for QueryResult {
    fn value(&self) -> &Value {
        &self.value
    }
}

pub fn get_unique_table_names_for_database(tables: &[Table]) -> HashMap<String, String> {
    let mut name_count: HashMap<&str, usize> = HashMap::new();

    tables
        .iter()
        .sorted_by_key(|table| table.unique_id())
        .map(|table| {
            let base_name = table.name();
            let count = name_count.entry(base_name).or_insert(0);
            *count += 1;

            (
                table.unique_id(),
                match *count {
                    1 => base_name.to_string(),
                    _ => format!("{}_{}", base_name, *count - 1),
                },
            )
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils;
    use serde_json::json;

    #[test]
    fn test_database_table_to_dbml() -> anyhow::Result<()> {
        let row_1 = json!({
            "user_id": 1,
            "temperature": 1.2,
            "label": "foo",
            "ready": true,
        });
        let row_2 = json!({
            "user_id": 2,
            "temperature": 2.4,
            "label": "bar",
            "ready": false,
            "description": "not null anymore and prety long so that it's not shown in note",
        });
        let rows = &vec![
            Row::new("1".to_string(), row_1),
            Row::new("2".to_string(), row_2),
        ];

        let schema = TableSchema::from_rows(rows)?;
        let table = Table::new(
            &Project::new_from_id(42),
            "data_source_id",
            utils::now(),
            "table_id",
            "test_dbml",
            "Test records for DBML rendering",
            utils::now(),
            vec![],
            vec![],
            &Some(schema),
            None,
        );

        let expected = r#"Table test_dbml {
  user_id integer [note: 'possible values: 1, 2']
  temperature real [note: 'possible values: 1.2, 2.4']
  label text [note: 'possible values: "foo", "bar"']
  ready boolean [note: 'possible values: TRUE, FALSE']
  description text

  Note: 'Test records for DBML rendering'
}"#
        .to_string();
        assert_eq!(table.render_dbml(None), expected);

        Ok(())
    }
}
