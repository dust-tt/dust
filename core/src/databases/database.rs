use super::table_schema::TableSchema;
use crate::{
    project::Project,
    sqlite_workers::client::{SqliteWorker, HEARTBEAT_INTERVAL_MS},
    stores::store::Store,
    utils,
};
use anyhow::{anyhow, Result};
use futures::future::try_join_all;
use itertools::Itertools;
use serde::{Deserialize, Serialize};
use serde_json::Value;

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

#[derive(Debug, Serialize)]
pub struct Database {
    project: Project,
    created: u64,
    data_source_id: String,
    database_id: String,
    name: String,
    db_type: DatabaseType,
}

impl Database {
    pub fn new(
        project: &Project,
        created: u64,
        data_source_id: &str,
        database_id: &str,
        name: &str,
    ) -> Self {
        Database {
            project: project.clone(),
            created: created,
            data_source_id: data_source_id.to_string(),
            database_id: database_id.to_string(),
            name: name.to_string(),
            db_type: DatabaseType::LOCAL,
        }
    }

    pub async fn get_tables(
        &self,
        store: Box<dyn Store + Sync + Send>,
    ) -> Result<Vec<DatabaseTable>> {
        match self.db_type {
            DatabaseType::REMOTE => Err(anyhow!("Remote DB not implemented.")),
            DatabaseType::LOCAL => {
                let (tables, _) = store
                    .list_databases_tables(
                        &self.project,
                        &self.data_source_id,
                        &self.database_id,
                        None,
                    )
                    .await?;

                Ok(tables
                    .into_iter()
                    // Ignore empty tables.
                    .filter_map(|t| match t.schema() {
                        None => None,
                        Some(_) => Some(t),
                    })
                    .collect::<Vec<_>>())
            }
        }
    }

    pub async fn batch_upsert_rows(
        &self,
        store: Box<dyn Store + Sync + Send>,
        table_id: &str,
        rows: Vec<DatabaseRow>,
        truncate: bool,
    ) -> Result<()> {
        let table = match store
            .load_database_table(
                &self.project,
                &self.data_source_id,
                &self.database_id,
                table_id,
            )
            .await?
        {
            Some(t) => t,
            None => Err(anyhow!(
                "Table {} not found in database {}",
                table_id,
                self.database_id
            ))?,
        };

        let new_rows_table_schema = TableSchema::from_rows(&rows)?;
        let table_schema = match table.schema() {
            // If there is no existing schema cache, simply use the new schema.
            None => new_rows_table_schema,
            Some(existing_table_schema) => {
                // If there is an existing schema cache, merge it with the new schema.
                existing_table_schema.merge(&new_rows_table_schema)?
            }
        };

        store
            .update_database_table_schema(
                &self.project,
                &self.data_source_id,
                &self.database_id,
                table_id,
                &table_schema,
            )
            .await?;

        // Call the SqliteWorker to update the rows contents.
        // Note: if this fails, the DB will still contain the new schema, but the rows will not be updated.
        // This isn't too bad, because the merged schema is necessarily backward-compatible with the previous one.
        // The other way around would not be true -- old schema doesn't necessarily work with the new rows.
        // This is why we cannot `try_join_all`.
        let sqlite_worker = self.sqlite_worker(store.clone()).await?;
        sqlite_worker
            .upsert_rows(&self.unique_id(), table_id, rows, truncate)
            .await
    }

    pub async fn delete(&self, store: Box<dyn Store + Sync + Send>) -> Result<()> {
        match self.db_type {
            DatabaseType::REMOTE => Err(anyhow!("Remote DB not implemented.")),
            DatabaseType::LOCAL => {
                store
                    .delete_database(&self.project, &self.data_source_id, &self.database_id)
                    .await?;

                Ok(())
            }
        }
    }

    pub async fn query(
        &self,
        store: Box<dyn Store + Sync + Send>,
        query: &str,
    ) -> Result<(Vec<DatabaseResult>, TableSchema)> {
        match self.db_type {
            DatabaseType::REMOTE => Err(anyhow!("Remote DB not implemented.")),
            DatabaseType::LOCAL => {
                let tables = self.get_tables(store.clone()).await?;
                let sqlite_worker = self.sqlite_worker(store.clone()).await?;

                let time_query_start = utils::now();
                let result_rows = sqlite_worker
                    .execute_query(&self.unique_id(), tables, query)
                    .await?;

                utils::done(&format!(
                    "DSSTRUCTSTAT Finished executing user query on worker: duration={}ms",
                    utils::now() - time_query_start
                ));

                let infer_result_schema_start = utils::now();
                let table_schema = TableSchema::from_rows(&result_rows)?;
                utils::done(&format!(
                    "DSSTRUCTSTAT Finished inferring schema: duration={}ms",
                    utils::now() - infer_result_schema_start
                ));

                utils::done(&format!(
                    "DSSTRUCTSTAT Finished query database: duration={}ms",
                    utils::now() - time_query_start
                ));

                Ok((result_rows, table_schema))
            }
        }
    }

    pub async fn get_rows(
        &self,
        store: Box<dyn Store + Sync + Send>,
    ) -> Result<Vec<(DatabaseTable, Vec<DatabaseRow>)>> {
        let (tables, _) = store
            .list_databases_tables(&self.project, &self.data_source_id, &self.database_id, None)
            .await?;

        // Get the SQLite worker for this database.
        let sqlite_worker = &self.sqlite_worker(store.clone()).await?;

        Ok(try_join_all(tables.into_iter().map(|table| {
            let database_id = self.unique_id();
            let table_id = table.table_id().to_string();

            async move {
                let (rows, _) = sqlite_worker
                    .get_rows(&database_id, &table_id, None)
                    .await?;
                Ok::<_, anyhow::Error>((table, rows))
            }
        }))
        .await?)
    }

    // Getters
    pub fn created(&self) -> u64 {
        self.created
    }
    pub fn data_source_id(&self) -> &str {
        &self.data_source_id
    }
    pub fn database_id(&self) -> &str {
        &self.database_id
    }
    pub fn name(&self) -> &str {
        &self.name
    }
    pub fn unique_id(&self) -> String {
        format!(
            "{}__{}__{}",
            self.project.project_id(),
            self.data_source_id,
            self.database_id
        )
    }

    pub async fn sqlite_worker(&self, store: Box<dyn Store + Sync + Send>) -> Result<SqliteWorker> {
        let worker = store
            .assign_live_sqlite_worker_to_database(
                &self.project,
                &self.data_source_id,
                &self.database_id,
                HEARTBEAT_INTERVAL_MS,
            )
            .await?;

        match worker.is_alive() {
            true => Ok(worker),
            false => Err(anyhow!(
                "No live SQLite worker found for database {}",
                self.database_id
            )),
        }
    }
}

#[derive(Debug, Serialize, Clone, Deserialize)]
pub struct DatabaseTable {
    created: u64,
    database_id: String,
    table_id: String,
    name: String,
    description: String,
    schema: Option<TableSchema>,
}

impl DatabaseTable {
    pub fn new(
        created: u64,
        database_id: &str,
        table_id: &str,
        name: &str,
        description: &str,
        schema: &Option<TableSchema>,
    ) -> Self {
        DatabaseTable {
            created: created,
            database_id: database_id.to_string(),
            table_id: table_id.to_string(),
            name: name.to_string(),
            description: description.to_string(),
            schema: schema.clone(),
        }
    }

    pub fn created(&self) -> u64 {
        self.created
    }
    pub fn database_id(&self) -> &str {
        &self.database_id
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
    pub fn schema(&self) -> Option<&TableSchema> {
        self.schema.as_ref()
    }

    pub fn render_dbml(&self) -> String {
        match self.schema {
            None => format!("Table {} {{\n}}", self.name()),
            Some(ref schema) => format!(
                "Table {} {{\n{}\n\n  Note: '{}'\n}}",
                self.name(),
                schema
                    .columns()
                    .iter()
                    .map(|c| format!("  {}", c.render_dbml()))
                    .join("\n"),
                self.description()
            ),
        }
    }
}

pub trait HasValue {
    fn value(&self) -> &Value;
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct DatabaseRow {
    row_id: String,
    value: Value,
}

impl DatabaseRow {
    pub fn new(row_id: String, value: Value) -> Self {
        DatabaseRow { row_id, value }
    }

    pub fn row_id(&self) -> &str {
        &self.row_id
    }
    pub fn content(&self) -> &Value {
        &self.value
    }
}

impl HasValue for DatabaseRow {
    fn value(&self) -> &Value {
        &self.value
    }
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct DatabaseResult {
    pub value: Value,
}

impl HasValue for DatabaseResult {
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
    fn test_database_table_to_dbml() -> Result<()> {
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
            DatabaseRow::new("1".to_string(), row_1),
            DatabaseRow::new("2".to_string(), row_2),
        ];

        let schema = TableSchema::from_rows(rows)?;
        let table = DatabaseTable::new(
            utils::now(),
            "database_id",
            "table_id",
            "test_dbml",
            "Test records for DBML rendering",
            &Some(schema),
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
        assert_eq!(table.render_dbml(), expected);

        Ok(())
    }
}
