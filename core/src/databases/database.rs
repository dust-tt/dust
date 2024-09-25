use super::table_schema::TableSchema;
use crate::{
    databases_store::store::DatabasesStore,
    project::Project,
    search_filter::{Filterable, SearchFilter},
    sqlite_workers::client::HEARTBEAT_INTERVAL_MS,
    stores::store::Store,
};
use anyhow::{anyhow, Result};
use futures::future::try_join_all;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TableType {
    LOCAL,
    REMOTE,
}

impl ToString for TableType {
    fn to_string(&self) -> String {
        match self {
            TableType::LOCAL => String::from("local"),
            TableType::REMOTE => String::from("remote"),
        }
    }
}

#[derive(Debug, Error)]
pub enum QueryDatabaseError {
    #[error("{0}")]
    GenericError(#[from] anyhow::Error),
    #[error("Too many result rows")]
    TooManyResultRows,
    #[error("Result is too large: {0}")]
    ResultTooLarge(String),
    #[error("Query execution error: {0}")]
    ExecutionError(String),
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

    remote_database_table_id: Option<String>,
    remote_database_secret_id: Option<String>,
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
        remote_database_table_id: Option<String>,
        remote_database_secret_id: Option<String>,
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
    pub fn remote_database_table_id(&self) -> Option<&str> {
        self.remote_database_table_id.as_deref()
    }
    pub fn remote_database_secret_id(&self) -> Option<&str> {
        self.remote_database_secret_id.as_deref()
    }
    pub fn table_type(&self) -> Result<TableType> {
        match (
            self.remote_database_table_id(),
            self.remote_database_secret_id(),
        ) {
            (Some(_), Some(_)) => Ok(TableType::REMOTE),
            (None, None) => Ok(TableType::LOCAL),
            _ => Err(anyhow!(
                "Inconsistent state: table is neither local nor remote"
            )),
        }
    }
    pub fn set_schema(&mut self, schema: TableSchema) {
        self.schema = Some(schema);
    }

    pub async fn delete(
        &self,
        store: Box<dyn Store + Sync + Send>,
        databases_store: Box<dyn DatabasesStore + Sync + Send>,
    ) -> Result<()> {
        if self.table_type()? == TableType::LOCAL {
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
            .delete_table(&self.project, &self.data_source_id, &self.table_id)
            .await?;

        Ok(())
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
}

pub struct LocalTable {
    pub table: Table,
}

impl LocalTable {
    pub fn from_table(table: Table) -> Result<LocalTable> {
        match table.table_type() {
            Ok(TableType::LOCAL) => Ok(LocalTable { table }),
            Ok(TableType::REMOTE) => Err(anyhow!("Table is not local")),
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
            false => match self.table.schema_cached() {
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
                &self.table.project,
                &self.table.data_source_id,
                &self.table.table_id,
                &new_table_schema,
            )
            .await?;

        if !truncate {
            // When doing incremental updates to a table's rows, the schema may become too wide.
            // For example, if a column has only integers, it's an integer column. If a new row has a string in that column, the column becomes a string column.
            // However, if that row is later updated to have an integer, the column should become an integer column again, but we cannot know that without looking at all the rows.
            // This is why we invalidate the schema when doing incremental updates, and next time the schema is requested, it will be recomputed from all the rows.
            store
                .invalidate_table_schema(
                    &self.table.project,
                    &self.table.data_source_id,
                    &self.table.table_id,
                )
                .await?;
        }

        // Upsert the rows in the table.
        // Note: if this fails, the Table will still contain the new schema, but the rows will not be updated.
        // This isn't too bad, because the merged schema is necessarily backward-compatible with the previous one.
        // The other way around would not be true -- old schema doesn't necessarily work with the new rows.
        // This is why we cannot `try_join_all`.
        databases_store
            .batch_upsert_table_rows(&self.table.unique_id(), rows, truncate)
            .await?;

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
                    .update_table_schema(
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils;
    use serde_json::json;

    #[test]
    fn test_local_table_to_dbml() -> anyhow::Result<()> {
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
}
