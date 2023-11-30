use super::table_schema::TableSchema;
use crate::{project::Project, stores::store::Store, utils};
use anyhow::{anyhow, Result};
use futures::future::try_join_all;
use itertools::Itertools;
use rayon::prelude::*;
use rusqlite::{params_from_iter, Connection};
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

        try_join_all(vec![
            store.update_database_table_schema(
                &self.project,
                &self.data_source_id,
                &self.database_id,
                table_id,
                &table_schema,
            ),
            store.batch_upsert_database_rows(
                &self.project,
                &self.data_source_id,
                &self.database_id,
                table_id,
                &rows,
                truncate,
            ),
        ])
        .await?;

        Ok(())
    }

    pub async fn create_in_memory_sqlite_conn(
        &self,
        store: Box<dyn Store + Sync + Send>,
    ) -> Result<Connection> {
        match self.db_type {
            DatabaseType::REMOTE => Err(anyhow!(
                "Cannot build an in-memory SQLite DB for a remote database."
            )),
            DatabaseType::LOCAL => {
                let time_build_db_start = utils::now();

                let tables = self.get_tables(store.clone()).await?;
                utils::done(&format!(
                    "DSSTRUCTSTAT Finished retrieving schema: duration={}ms",
                    utils::now() - time_build_db_start
                ));

                let time_get_rows_start = utils::now();
                let rows = self.get_rows(store.clone()).await?;
                utils::done(&format!(
                    "DSSTRUCTSTAT Finished retrieving rows: duration={}ms",
                    utils::now() - time_get_rows_start
                ));

                let generate_create_table_sql_start = utils::now();
                let create_tables_sql: String = tables
                    .into_iter()
                    .filter_map(|t| match t.schema() {
                        Some(s) => {
                            if s.is_empty() {
                                None
                            } else {
                                Some(s.get_create_table_sql_string(t.name()))
                            }
                        }
                        None => None,
                    })
                    .collect::<Vec<_>>()
                    .join("\n");
                utils::done(&format!(
                    "DSSTRUCTSTAT Finished generating create table SQL: duration={}ms",
                    utils::now() - generate_create_table_sql_start
                ));

                let conn = rusqlite::Connection::open_in_memory()?;

                let create_tables_execute_start = utils::now();
                conn.execute_batch(&create_tables_sql)?;
                utils::done(&format!(
                    "DSSTRUCTSTAT Finished creating tables: duration={}ms",
                    utils::now() - create_tables_execute_start
                ));

                let insert_execute_start = utils::now();
                rows.iter()
                    .filter(|(_, rows)| !rows.is_empty())
                    .map(|(table, rows)| {
                        if table.schema().is_none() {
                            Err(anyhow!("No schema found for table {}", table.name()))?;
                        }
                        let table_schema = table.schema().unwrap();
                        let (sql, field_names) = table_schema.get_insert_sql(table.name());
                        let mut stmt = conn.prepare(&sql)?;

                        rows.par_iter()
                            .map(|r| match table_schema.get_insert_params(&field_names, r) {
                                Ok(params) => Ok(params_from_iter(params)),
                                Err(e) => Err(anyhow!(
                                    "Error getting insert params for row {}: {}",
                                    r.row_id(),
                                    e
                                )),
                            })
                            .collect::<Result<Vec<_>>>()?
                            .into_iter()
                            .map(|params| match stmt.execute(params) {
                                Ok(_) => Ok(()),
                                Err(e) => Err(anyhow!("Error inserting row: {}", e)),
                            })
                            .collect::<Result<Vec<_>>>()
                    })
                    .collect::<Result<Vec<_>>>()?;
                utils::done(&format!(
                    "DSSTRUCTSTAT Finished inserting rows: duration={}ms",
                    utils::now() - insert_execute_start
                ));

                Ok(conn)
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
                let conn = self.create_in_memory_sqlite_conn(store.clone()).await?;

                let time_query_start = utils::now();

                let mut stmt = conn.prepare(query)?;

                // copy the column names into a vector of strings
                let column_names = stmt
                    .column_names()
                    .into_iter()
                    .map(|x| x.to_string())
                    .collect::<Vec<String>>();

                // Execute the query and collect the results in a vector of serde_json::Value objects.
                let result_rows = stmt
                    .query_and_then([], |row| {
                        column_names
                            .iter()
                            .enumerate()
                            .map(|(i, column_name)| {
                                Ok((
                                    column_name.clone(),
                                    match row.get(i) {
                                        Err(e) => Err(anyhow!(
                                            "Failed to retrieve value for column {}: {}",
                                            column_name,
                                            e
                                        )),
                                        Ok(v) => match v {
                                            rusqlite::types::Value::Integer(i) => {
                                                Ok(serde_json::Value::Number(i.into()))
                                            }
                                            rusqlite::types::Value::Real(f) => {
                                                match serde_json::Number::from_f64(f) {
                                                    Some(n) => Ok(serde_json::Value::Number(n)),
                                                    None => Err(anyhow!(
                                                        "Invalid float value for column {}",
                                                        column_name
                                                    )),
                                                }
                                            }
                                            rusqlite::types::Value::Text(t) => {
                                                Ok(serde_json::Value::String(t.clone()))
                                            }
                                            rusqlite::types::Value::Blob(b) => {
                                                match String::from_utf8(b.clone()) {
                                                    Err(_) => Err(anyhow!(
                                                        "Invalid UTF-8 sequence for column {}",
                                                        column_name
                                                    )),
                                                    Ok(s) => Ok(serde_json::Value::String(s)),
                                                }
                                            }
                                            rusqlite::types::Value::Null => {
                                                Ok(serde_json::Value::Null)
                                            }
                                        },
                                    }?,
                                ))
                            })
                            .collect::<Result<serde_json::Value>>()
                    })?
                    .collect::<Result<Vec<_>>>()?
                    .into_par_iter()
                    .map(|value| DatabaseResult { value })
                    .collect::<Vec<_>>();
                utils::done(&format!(
                    "DSSTRUCTSTAT Finished executing user query: duration={}ms",
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

        // Concurrently retrieve table rows.
        Ok(futures::future::try_join_all(
            tables
                .into_iter()
                .map(|table| {
                    let store = store.clone();

                    async move {
                        let (rows, _) = store
                            .list_database_rows(
                                &self.project,
                                self.data_source_id.as_str(),
                                self.database_id.as_str(),
                                table.table_id(),
                                None,
                            )
                            .await?;

                        Ok::<_, anyhow::Error>((table, rows))
                    }
                })
                .collect::<Vec<_>>(),
        )
        .await?
        .into_iter()
        .collect::<Vec<_>>())
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
}

#[derive(Debug, Serialize, Clone)]
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
    value: Value,
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
