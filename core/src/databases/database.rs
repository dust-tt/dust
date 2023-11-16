use crate::{project::Project, stores::store::Store, utils};
use anyhow::{anyhow, Result};

use rayon::prelude::*;
use rusqlite::{params_from_iter, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

use super::table_schema::TableSchema;

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
    created: u64,
    data_source_id: String,
    database_id: String,
    name: String,
    db_type: DatabaseType,
}

impl Database {
    pub fn new(created: u64, data_source_id: &str, database_id: &str, name: &str) -> Self {
        Database {
            created: created,
            data_source_id: data_source_id.to_string(),
            database_id: database_id.to_string(),
            name: name.to_string(),
            db_type: DatabaseType::LOCAL,
        }
    }

    pub async fn get_schema(
        &self,
        project: &Project,
        store: Box<dyn Store + Sync + Send>,
    ) -> Result<DatabaseSchema> {
        match self.db_type {
            DatabaseType::REMOTE => Err(anyhow!("Remote DB not implemented.")),
            DatabaseType::LOCAL => {
                let rows = self.get_rows(project, store).await?;

                let schema = rows
                    .par_iter()
                    .map(|(table, r)| {
                        Ok((
                            table.table_id().to_string(),
                            DatabaseSchemaTable::new(table.clone(), TableSchema::from_rows(&r)?),
                        ))
                    })
                    .collect::<Result<HashMap<_, _>>>()?;

                Ok(DatabaseSchema(schema))
            }
        }
    }

    pub async fn create_in_memory_sqlite_conn(
        &self,
        project: &Project,
        store: Box<dyn Store + Sync + Send>,
    ) -> Result<Connection> {
        match self.db_type {
            DatabaseType::REMOTE => Err(anyhow!(
                "Cannot build an in-memory SQLite DB for a remote database."
            )),
            DatabaseType::LOCAL => {
                let time_build_db_start = utils::now();

                let schema = self.get_schema(project, store.clone()).await?;
                utils::done(&format!(
                    "DSSTRUCTSTAT Finished retrieving schema: duration={}ms",
                    utils::now() - time_build_db_start
                ));

                let time_get_rows_start = utils::now();
                let rows_by_table = match self.get_rows(project, store.clone()).await {
                    Ok(rows) => Ok(rows
                        .into_iter()
                        .map(|(table, rows)| (table.table_id().to_string(), rows))
                        .collect::<HashMap<_, _>>()),
                    _ => Err(anyhow!("Error retrieving rows from database.")),
                }?;
                utils::done(&format!(
                    "DSSTRUCTSTAT Finished retrieving rows: duration={}ms",
                    utils::now() - time_get_rows_start
                ));

                let generate_create_table_sql_start = utils::now();
                let create_tables_sql: String = schema
                    .iter()
                    .filter(|(_, table)| !table.schema.is_empty())
                    .map(|(table_name, table)| {
                        table
                            .schema
                            .get_create_table_sql_string(table_name.as_str())
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
                rows_by_table
                    .iter()
                    .filter(|(_, rows)| !rows.is_empty())
                    .map(|(table_name, rows)| {
                        let table_schema = match schema.get(table_name) {
                            Some(s) => Ok(s),
                            None => Err(anyhow!("No schema found for table {}", table_name)),
                        }?;

                        let (sql, field_names) = table_schema.schema.get_insert_sql(table_name);
                        let mut stmt = conn.prepare(&sql)?;

                        rows.par_iter()
                            .map(
                                |r| match table_schema.schema.get_insert_params(&field_names, r) {
                                    Ok(params) => Ok(params_from_iter(params)),
                                    Err(e) => Err(anyhow!(
                                        "Error getting insert params for row {}: {}",
                                        r.row_id().unwrap_or_else(|| String::from("")),
                                        e
                                    )),
                                },
                            )
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
        project: &Project,
        store: Box<dyn Store + Sync + Send>,
        query: &str,
    ) -> Result<(Vec<DatabaseRow>, TableSchema)> {
        match self.db_type {
            DatabaseType::REMOTE => Err(anyhow!("Remote DB not implemented.")),
            DatabaseType::LOCAL => {
                let conn = self
                    .create_in_memory_sqlite_conn(project, store.clone())
                    .await?;

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
                    .map(|v| DatabaseRow::new(utils::now(), None, &v))
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
        project: &Project,
        store: Box<dyn Store + Sync + Send>,
    ) -> Result<Vec<(DatabaseTable, Vec<DatabaseRow>)>> {
        let (tables, _) = store
            .list_databases_tables(&project, &self.data_source_id, &self.database_id, None)
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
                                project,
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
}

impl DatabaseTable {
    pub fn new(
        created: u64,
        database_id: &str,
        table_id: &str,
        name: &str,
        description: &str,
    ) -> Self {
        DatabaseTable {
            created: created,
            database_id: database_id.to_string(),
            table_id: table_id.to_string(),
            name: name.to_string(),
            description: description.to_string(),
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
}
#[derive(Debug, Serialize, Clone)]
pub struct DatabaseRow {
    created: u64,
    row_id: Option<String>,
    content: Value,
}

impl DatabaseRow {
    pub fn new(created: u64, row_id: Option<String>, content: &Value) -> Self {
        DatabaseRow {
            created: created,
            row_id: row_id,
            content: content.clone(),
        }
    }

    pub fn created(&self) -> u64 {
        self.created
    }
    pub fn row_id(&self) -> Option<String> {
        self.row_id.clone()
    }
    pub fn content(&self) -> &Value {
        &self.content
    }
}

#[derive(Debug, Serialize)]
pub struct DatabaseSchemaTable {
    table: DatabaseTable,
    schema: TableSchema,
}

impl DatabaseSchemaTable {
    pub fn new(table: DatabaseTable, schema: TableSchema) -> Self {
        DatabaseSchemaTable { table, schema }
    }

    pub fn is_empty(&self) -> bool {
        self.schema.is_empty()
    }
}

#[derive(Debug, Serialize)]
pub struct DatabaseSchema(HashMap<String, DatabaseSchemaTable>);

impl DatabaseSchema {
    pub fn iter(&self) -> std::collections::hash_map::Iter<String, DatabaseSchemaTable> {
        self.0.iter()
    }
    pub fn get(&self, table_name: &str) -> Option<&DatabaseSchemaTable> {
        self.0.get(table_name)
    }
}
