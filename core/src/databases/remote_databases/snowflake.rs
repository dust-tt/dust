use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde::Deserialize;
use snowflake_connector_rs::{
    SnowflakeAuthMethod, SnowflakeClient, SnowflakeClientConfig, SnowflakeDecode, SnowflakeRow,
};

use crate::databases::{
    database::{QueryDatabaseError, QueryResult},
    remote_databases::remote_database::RemoteDatabase,
    table_schema::TableSchema,
};

pub struct SnowflakeRemoteDatabase {
    client: SnowflakeClient,
}

#[derive(Deserialize)]
struct SnowflakeConnectionDetails {
    username: String,
    password: String,
    account: String,
    role: String,
    warehouse: String,
}

impl SnowflakeRemoteDatabase {
    pub fn new(secret: &str) -> Result<Self> {
        let connection_details: SnowflakeConnectionDetails = serde_json::from_str(secret)?;

        let client = SnowflakeClient::new(
            &connection_details.username,
            SnowflakeAuthMethod::Password(connection_details.password),
            SnowflakeClientConfig {
                warehouse: Some(connection_details.warehouse),
                account: connection_details.account,
                role: Some(connection_details.role),
                database: None,
                schema: None,
                timeout: Some(std::time::Duration::from_secs(30)),
            },
        )?;

        Ok(Self { client })
    }
}

impl TryFrom<SnowflakeRow> for QueryResult {
    type Error = anyhow::Error;

    fn try_from(row: SnowflakeRow) -> Result<Self> {
        fn decode_column<T: SnowflakeDecode>(row: &SnowflakeRow, name: &str) -> Result<Option<T>> {
            match row.get::<Option<T>>(name) {
                Ok(value) => Ok(value),
                Err(e) => Err(anyhow!(
                    "Error decoding column {} (err: {})",
                    name,
                    e.to_string()
                )),
            }
        }

        let mut map = serde_json::Map::new();
        for col in row.column_types() {
            let name = col.name();
            let snowflake_type = col.column_type().snowflake_type().to_ascii_uppercase();
            let value = match snowflake_type.as_str() {
                "NUMBER" | "INT" | "INTEGER" | "BIGINT" | "SMALLINT" | "TINYINT" | "BYTEINT" => {
                    match decode_column::<i64>(&row, name)? {
                        Some(i) => serde_json::Value::Number(i.into()),
                        None => serde_json::Value::Null,
                    }
                }
                "STRING" | "TEXT" | "VARCHAR" | "CHAR" => {
                    match decode_column::<String>(&row, name)? {
                        Some(s) => serde_json::Value::String(s.into()),
                        None => serde_json::Value::Null,
                    }
                }
                "BOOLEAN" => match decode_column::<bool>(&row, name)? {
                    Some(b) => serde_json::Value::Bool(b),
                    None => serde_json::Value::Null,
                },
                "TIMESTAMP" => match decode_column::<String>(&row, name)? {
                    Some(s) => serde_json::Value::String(s.into()),
                    None => serde_json::Value::Null,
                },
                _ => match decode_column::<String>(&row, name)? {
                    Some(s) => serde_json::Value::String(s.into()),
                    None => serde_json::Value::Null,
                },
            };
            map.insert(name.to_string(), value);
        }

        Ok(QueryResult {
            value: serde_json::Value::Object(map),
        })
    }
}

#[async_trait]
impl RemoteDatabase for SnowflakeRemoteDatabase {
    async fn get_tables_used_by_query(&self, query: &str) -> Result<Vec<String>> {
        let session = self.client.create_session().await?;

        let explain_query = format!("EXPLAIN {}", query);
        let used_tables = session
            .query(explain_query.clone())
            .await?
            .iter()
            .filter_map(|row| match row.get::<String>("objects") {
                Ok(objects) => Some(objects),
                _ => None,
            })
            .collect();

        Ok(used_tables)
    }

    async fn execute_query(
        &self,
        query: &str,
    ) -> Result<(Vec<QueryResult>, TableSchema), QueryDatabaseError> {
        let session = self.client.create_session().await.map_err(|e| {
            QueryDatabaseError::ExecutionError(anyhow!("Error creating session: {}", e).to_string())
        })?;

        let snowflake_rows = session.query(query).await.map_err(|e| {
            QueryDatabaseError::ExecutionError(anyhow!("Error executing query: {}", e).to_string())
        })?;

        let rows = snowflake_rows
            .into_iter()
            .map(|row| row.try_into())
            .collect::<Result<Vec<QueryResult>>>()?;

        // TODO(@fontanierh): decide if we want to infer query result schema for remote DBs.
        let schema = TableSchema::empty();

        Ok((rows, schema))
    }
}
