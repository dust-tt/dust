use anyhow::{anyhow, Result};

use crate::{project::Project, stores::store::Store};
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
    ) -> Result<DatabaseSchema> {
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
struct DatabaseSchemaTable {
    table: DatabaseTable,
    schema: TableSchema,
}

impl DatabaseSchemaTable {
    pub fn new(table: DatabaseTable, schema: TableSchema) -> Self {
        DatabaseSchemaTable { table, schema }
    }
}

#[derive(Debug, Serialize)]
pub struct DatabaseSchema(HashMap<String, DatabaseSchemaTable>);
