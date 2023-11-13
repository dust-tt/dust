use anyhow::{anyhow, Result};

use crate::{project::Project, stores::store::Store};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use serde_json::{Number, Value};
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

                Ok(DatabaseSchema(
                    rows.into_par_iter()
                        .map(|(table, rows)| {
                            Ok((
                                table.table_id().to_string(),
                                DatabaseSchemaTable::new(table, TableSchema::from_rows(&rows)?),
                            ))
                        })
                        .collect::<Result<HashMap<_, _>>>()?,
                ))
            }
        }
    }

    pub async fn query(
        &self,
        project: &Project,
        store: Box<dyn Store + Sync + Send>,
        query: &str,
    ) -> Result<(Vec<Value>, TableSchema)> {
        match self.db_type {
            DatabaseType::REMOTE => Err(anyhow!("Remote DB not implemented.")),
            DatabaseType::LOCAL => {
                // Retrieve the DB schema and construct a SQL string.
                let (schema, rows_by_table) = self.get_schema(project, store.clone(), true).await?;
                let mut create_tables_sql = "".to_string();
                // TODO: maybe we can // ?
                let mut table_schemas = HashMap::new();
                for (table_name, table) in schema.into_iter() {
                    if table.schema.is_empty() {
                        continue;
                    }
                    table_schemas.insert(table_name.clone(), table.schema.clone());
                    create_tables_sql += &table
                        .schema
                        .get_create_table_sql_string(table_name.as_str());
                    create_tables_sql += "\n";
                }

                // Build the in-memory SQLite DB with the schema.
                let conn = rusqlite::Connection::open_in_memory()?;
                conn.execute_batch(&create_tables_sql)?;

                let mut stmt = conn.prepare(query)?;

                let column_names = stmt
                    .column_names()
                    .into_iter()
                    .map(|x| x.to_string())
                    .collect::<Vec<String>>();
                let column_count = stmt.column_count();

                // insert the rows in the DB
                for (table_name, rows) in rows_by_table.expect("No rows found") {
                    if rows.is_empty() {
                        continue;
                    }

                    let table_schema = table_schemas
                        .get(&table_name)
                        .expect("No schema found for table");

                    let mut insert_sql = "".to_string();
                    for row in rows {
                        let insert_row_sql =
                            table_schema.get_insert_row_sql_string(&table_name, row.content())?;
                        insert_sql += &insert_row_sql;
                    }
                    conn.execute_batch(&insert_sql)?;
                }

                let rows = stmt.query_map([], |row| {
                    let mut map = serde_json::Map::new();
                    for i in 0..column_count {
                        let column_name = column_names.get(i).expect("Invalid column name");
                        let value = match row.get(i).expect("Invalid value") {
                            rusqlite::types::Value::Integer(i) => Value::Number(i.into()),
                            rusqlite::types::Value::Real(f) => {
                                Value::Number(Number::from_f64(f).expect("invalid float value"))
                            }
                            rusqlite::types::Value::Text(t) => Value::String(t),
                            // convert blob into string
                            rusqlite::types::Value::Blob(b) => {
                                Value::String(String::from_utf8(b).expect("Invalid UTF-8 sequence"))
                            }

                            rusqlite::types::Value::Null => Value::Null,
                        };
                        map.insert(column_name.to_string(), value);
                    }
                    Ok(Value::Object(map))
                })?;

                let results = rows.collect::<Result<Vec<Value>, rusqlite::Error>>()?;
                let results_refs = results.iter().collect::<Vec<&Value>>();
                let table_schema = TableSchema::from_rows(&results_refs)?;

                Ok((results, table_schema))
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

    pub fn table(&self) -> &DatabaseTable {
        &self.table
    }

    pub fn is_empty(&self) -> bool {
        self.schema.is_empty()
    }
}

#[derive(Debug, Serialize)]
pub struct DatabaseSchema(HashMap<String, DatabaseSchemaTable>);

impl IntoIterator for DatabaseSchema {
    type Item = (String, DatabaseSchemaTable);
    type IntoIter = std::collections::hash_map::IntoIter<String, DatabaseSchemaTable>;

    fn into_iter(self) -> Self::IntoIter {
        self.0.into_iter()
    }
}
