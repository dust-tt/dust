use anyhow::{anyhow, Result};
use rusqlite::ToSql;

use crate::{project::Project, stores::store::Store, utils};
use rayon::prelude::*;
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
        return_rows: bool,
    ) -> Result<(DatabaseSchema, Option<HashMap<String, Vec<DatabaseRow>>>)> {
        match self.db_type {
            DatabaseType::REMOTE => Err(anyhow!("Remote DB not implemented.")),
            DatabaseType::LOCAL => {
                let (tables, _) = store
                    .list_databases_tables(&project, &self.data_source_id, &self.database_id, None)
                    .await?;

                // Concurrently retrieve table rows.
                let rows = futures::future::try_join_all(
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
                .collect::<Vec<_>>();

                let returned_rows = match return_rows {
                    true => Some(
                        rows.clone()
                            .into_iter()
                            .map(|(table, rows)| (table.table_id().to_string(), rows))
                            .collect::<HashMap<_, _>>(),
                    ),
                    false => None,
                };

                Ok((
                    DatabaseSchema(
                        rows.into_par_iter()
                            .map(|(table, r)| {
                                Ok((
                                    table.table_id().to_string(),
                                    DatabaseSchemaTable::new(table, TableSchema::from_rows(&r)?),
                                ))
                            })
                            .collect::<Result<HashMap<_, _>>>()?,
                    ),
                    returned_rows,
                ))
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
                let time_query_start = utils::now();
                // Retrieve the DB schema and construct a SQL string.
                let (schema, rows_by_table) = self.get_schema(project, store.clone(), true).await?;
                let rows_by_table = match rows_by_table {
                    Some(rows) => rows,
                    None => return Err(anyhow!("No rows found")),
                };
                utils::done(&format!(
                    "DSSTRUCTSTAT Finished retrieving schema: duration={}ms",
                    utils::now() - time_query_start
                ));

                let table_schemas: HashMap<String, TableSchema> = schema
                    .iter()
                    .filter(|(_, table)| !table.schema.is_empty())
                    .map(|(table_name, table)| (table_name.clone(), table.schema.clone()))
                    .collect();

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

                // Build the in-memory SQLite DB with the schema.
                let conn = rusqlite::Connection::open_in_memory()?;

                let create_tables_execute_start = utils::now();
                conn.execute_batch(&create_tables_sql)?;
                utils::done(&format!(
                    "DSSTRUCTSTAT Finished creating tables: duration={}ms",
                    utils::now() - create_tables_execute_start
                ));

                let mut stmt = conn.prepare(query)?;

                let column_names = stmt
                    .column_names()
                    .into_iter()
                    .map(|x| x.to_string())
                    .collect::<Vec<String>>();
                let column_count = stmt.column_count();

                // insert the rows in the DB
                let insert_execute_start = utils::now();
                for (table_name, rows) in rows_by_table {
                    if rows.is_empty() {
                        continue;
                    }

                    let table_schema = table_schemas
                        .get(&table_name)
                        .ok_or_else(|| anyhow!("No schema found for table {}", table_name))?;

                    for row in rows {
                        let (query, boxed_params) =
                            table_schema.get_insert_row_sql_string(&table_name, row.content())?;

                        let params_refs: Vec<&dyn ToSql> = boxed_params
                            .iter()
                            .map(|param| &**param as &dyn ToSql)
                            .collect();

                        conn.execute(&query, params_refs.as_slice())?;
                    }
                }
                utils::done(&format!(
                    "DSSTRUCTSTAT Finished inserting rows: duration={}ms",
                    utils::now() - insert_execute_start
                ));

                let user_query_execute_start = utils::now();
                // Execute the query and get an iterator over the mapped rows.
                let mapped_rows = stmt.query_map([], |row| {
                    (0..column_count)
                        .map(|i| row.get::<usize, rusqlite::types::Value>(i))
                        .collect::<Result<Vec<rusqlite::types::Value>, rusqlite::Error>>()
                })?;

                let results = mapped_rows.map(|row_result| {
                        row_result
                            .map_err(|e| anyhow!("Failed to retrieve a row: {}", e))
                            .and_then(|row| {
                                column_names.iter().enumerate().try_fold(
                                    serde_json::Map::new(),
                                    |mut acc, (i, column_name)| {
                                        row.get(i)
                                            .ok_or_else(|| {
                                                anyhow!("Missing value at index {} for column {}", i, column_name)
                                            })
                                            .and_then(|sql_value| {
                                                let json_value = match sql_value {
                                                    rusqlite::types::Value::Integer(i) => serde_json::Value::Number((*i).into()),
                                                    rusqlite::types::Value::Real(f) => serde_json::Number::from_f64(*f)
                                                        .ok_or_else(|| {
                                                            anyhow!("Invalid float value for column {}", column_name)
                                                        })
                                                        .map(serde_json::Value::Number)?,
                                                    rusqlite::types::Value::Text(t) => serde_json::Value::String(t.clone()),
                                                    rusqlite::types::Value::Blob(b) => String::from_utf8(b.clone())
                                                        .map_err(|_| {
                                                            anyhow!("Invalid UTF-8 sequence for column {}", column_name)
                                                        })
                                                        .map(serde_json::Value::String)?,
                                                    rusqlite::types::Value::Null => serde_json::Value::Null,
                                                };
                                                acc.insert(column_name.clone(), json_value);
                                                Ok(acc)
                                            })
                                    },
                                )
                                .map(serde_json::Value::Object)
                            })
                    })
                    .collect::<Result<Vec<serde_json::Value>, anyhow::Error>>()?;
                utils::done(&format!(
                    "DSSTRUCTSTAT Finished executing user query: duration={}ms",
                    utils::now() - user_query_execute_start
                ));

                let infer_result_schema_start = utils::now();
                let result_rows = results
                    .into_par_iter()
                    .map(|v| DatabaseRow::new(utils::now(), None, &v))
                    .collect::<Vec<_>>();
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
}
