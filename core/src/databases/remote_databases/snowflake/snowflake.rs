use std::{collections::HashSet, env};
use tracing::{debug, info};

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use futures::future::try_join_all;
use serde::Deserialize;

use crate::databases::{
    database::{QueryDatabaseError, QueryResult, SqlDialect},
    remote_databases::remote_database::RemoteDatabase,
    table::Table,
    table_schema::{TableSchema, TableSchemaColumn, TableSchemaFieldType},
};

use super::api::{
    client::{SnowflakeAuthMethod, SnowflakeClient, SnowflakeClientConfig},
    row::{SnowflakeDecode, SnowflakeRow},
    session::SnowflakeSession,
};

pub struct SnowflakeRemoteDatabase {
    client: SnowflakeClient,
    warehouse: String,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum SnowflakeConnectionDetails {
    KeyPair {
        #[serde(default, rename = "auth_type")]
        _auth_type: Option<String>,
        username: String,
        private_key: String,
        private_key_passphrase: Option<String>,
        account: String,
        role: String,
        warehouse: String,
    },
    Password {
        #[serde(default, rename = "auth_type")]
        _auth_type: Option<String>,
        username: String,
        password: String,
        account: String,
        role: String,
        warehouse: String,
    },
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
struct SnowflakeSchemaColumn {
    name: String,
    r#type: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
struct SnowflakeQueryPlanEntry {
    objects: Option<String>,
    operation: Option<String>,
}

pub const MAX_QUERY_RESULT_ROWS: usize = 25_000;

pub const FORBIDDEN_OPERATIONS: [&str; 3] = ["UPDATE", "DELETE", "INSERT"];

pub const GET_SESSION_MAX_TRIES: usize = 3;

impl TryFrom<SnowflakeSchemaColumn> for TableSchemaColumn {
    type Error = anyhow::Error;

    fn try_from(col: SnowflakeSchemaColumn) -> Result<Self> {
        // Extract base type name before any parentheses (e.g., "VARCHAR(255)" -> "VARCHAR").
        let base_type = col
            .r#type
            .split('(')
            .next()
            .unwrap_or(&col.r#type)
            .trim()
            .to_ascii_uppercase();

        let col_type = match base_type.as_str() {
            "NUMBER" | "INT" | "INTEGER" | "BIGINT" | "SMALLINT" | "TINYINT" | "BYTEINT" => {
                TableSchemaFieldType::Int
            }
            "FLOAT" | "DOUBLE" | "DECIMAL" | "NUMERIC" | "REAL" => TableSchemaFieldType::Float,
            "STRING" | "TEXT" | "VARCHAR" | "CHAR" | "CHARACTER" | "NCHAR" | "NVARCHAR" => {
                TableSchemaFieldType::Text
            }
            "BOOLEAN" | "BOOL" => TableSchemaFieldType::Bool,
            "TIMESTAMP" | "TIMESTAMP_NTZ" | "TIMESTAMP_LTZ" | "TIMESTAMP_TZ" | "DATE" | "TIME"
            | "DATETIME" => TableSchemaFieldType::DateTime,
            _ => TableSchemaFieldType::Text,
        };

        Ok(TableSchemaColumn {
            name: col.name,
            value_type: col_type,
            possible_values: None,
            non_filterable: None,
            description: None,
        })
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
            // Extract base type name before any parentheses for consistency.
            let snowflake_type = col
                .column_type()
                .snowflake_type()
                .split('(')
                .next()
                .unwrap_or(col.column_type().snowflake_type())
                .trim()
                .to_ascii_uppercase();

            let value = match snowflake_type.as_str() {
                "NUMBER" | "INT" | "INTEGER" | "BIGINT" | "SMALLINT" | "TINYINT" | "BYTEINT" => {
                    match decode_column::<i64>(&row, name)? {
                        Some(i) => serde_json::Value::Number(i.into()),
                        None => serde_json::Value::Null,
                    }
                }
                "FLOAT" | "DOUBLE" | "DECIMAL" | "NUMERIC" | "REAL" => {
                    match decode_column::<f64>(&row, name)? {
                        Some(f) => serde_json::Value::Number(
                            serde_json::Number::from_f64(f)
                                .ok_or_else(|| anyhow!("Cannot represent {} as JSON number", f))?,
                        ),
                        None => serde_json::Value::Null,
                    }
                }
                "STRING" | "TEXT" | "VARCHAR" | "CHAR" | "CHARACTER" | "NCHAR" | "NVARCHAR" => {
                    match decode_column::<String>(&row, name)? {
                        Some(s) => serde_json::Value::String(s.into()),
                        None => serde_json::Value::Null,
                    }
                }
                "BOOLEAN" | "BOOL" => match decode_column::<bool>(&row, name)? {
                    Some(b) => serde_json::Value::Bool(b),
                    None => serde_json::Value::Null,
                },
                "TIMESTAMP" | "TIMESTAMP_NTZ" | "TIMESTAMP_LTZ" | "TIMESTAMP_TZ" | "DATE"
                | "TIME" | "DATETIME" => match decode_column::<String>(&row, name)? {
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

        Ok(QueryResult { value: map })
    }
}

impl TryFrom<QueryResult> for SnowflakeQueryPlanEntry {
    type Error = anyhow::Error;

    fn try_from(result: QueryResult) -> Result<Self> {
        serde_json::from_value(serde_json::Value::Object(result.value))
            .map_err(|e| anyhow!("Error deserializing row: {}", e))
    }
}

impl SnowflakeRemoteDatabase {
    pub fn new(
        credentials: serde_json::Map<String, serde_json::Value>,
    ) -> Result<Self, QueryDatabaseError> {
        debug!("SnowflakeRemoteDatabase::new() called");
        debug!("Deserializing credentials...");
        let connection_details: SnowflakeConnectionDetails =
            serde_json::from_value(serde_json::Value::Object(credentials)).map_err(|e| {
                debug!("Failed to deserialize credentials: {}", e);
                QueryDatabaseError::GenericError(anyhow!("Error deserializing credentials: {}", e))
            })?;
        debug!("Successfully deserialized credentials");

        let (username, auth_method, account, role, warehouse) = match &connection_details {
            SnowflakeConnectionDetails::Password {
                _auth_type: _,
                username,
                password,
                account,
                role,
                warehouse,
            } => (
                username.clone(),
                SnowflakeAuthMethod::Password(password.clone()),
                account.clone(),
                role.clone(),
                warehouse.clone(),
            ),
            SnowflakeConnectionDetails::KeyPair {
                _auth_type,
                username,
                private_key,
                private_key_passphrase,
                account,
                role,
                warehouse,
            } => {
                let auth = SnowflakeAuthMethod::KeyPair {
                    pem: private_key.clone(),
                    password: private_key_passphrase
                        .as_ref()
                        .map(|p| p.as_bytes().to_vec()),
                };
                (
                    username.clone(),
                    auth,
                    account.clone(),
                    role.clone(),
                    warehouse.clone(),
                )
            }
        };

        debug!("Creating SnowflakeClient with:");
        debug!("  - username: {}", username);
        debug!("  - account: {}", account);
        debug!("  - role: {}", role);
        debug!("  - warehouse: {}", warehouse);

        let mut client = SnowflakeClient::new(
            &username,
            auth_method,
            SnowflakeClientConfig {
                warehouse: Some(warehouse.clone()),
                // Replace any `_` with `-` in the account name for nginx proxy.
                account: account.clone().replace('_', "-"),
                role: Some(role),
                database: None,
                schema: None,
                timeout: Some(std::time::Duration::from_secs(30)),
            },
        )
        .map_err(|e| {
            debug!("Failed to create SnowflakeClient: {}", e);
            QueryDatabaseError::GenericError(anyhow!("Error creating Snowflake client: {}", e))
        })?;

        debug!("SnowflakeClient created successfully");

        if let (Ok(proxy_host), Ok(proxy_port), Ok(proxy_user_name), Ok(proxy_user_password)) = (
            env::var("PROXY_HOST"),
            env::var("PROXY_PORT"),
            env::var("PROXY_USER_NAME"),
            env::var("PROXY_USER_PASSWORD"),
        ) {
            let proxy_port = proxy_port.parse::<u16>().map_err(|e| {
                QueryDatabaseError::GenericError(anyhow!("Error parsing proxy port: {}", e))
            })?;
            client = client
                .with_proxy(
                    &proxy_host,
                    proxy_port,
                    &proxy_user_name,
                    &proxy_user_password,
                )
                .map_err(|e| {
                    QueryDatabaseError::GenericError(anyhow!("Error setting proxy: {}", e))
                })?;
        }

        debug!("SnowflakeRemoteDatabase created successfully");
        Ok(Self { client, warehouse })
    }

    async fn try_get_session(&self) -> Result<SnowflakeSession, QueryDatabaseError> {
        let session = self.client.create_session().await.map_err(|e| {
            QueryDatabaseError::GenericError(anyhow!("Error creating session: {}", e))
        })?;

        let _ = session
            .execute(format!("USE WAREHOUSE {}", self.warehouse))
            .await
            .map_err(|e| {
                QueryDatabaseError::GenericError(anyhow!("Error setting warehouse: {}", e))
            })?;

        Ok(session)
    }

    async fn get_session(&self) -> Result<SnowflakeSession, QueryDatabaseError> {
        let mut tries = 0;
        let mut backoff = tokio::time::Duration::from_millis(100);

        loop {
            match self.try_get_session().await {
                Ok(session) => return Ok(session),
                Err(e) => {
                    tries += 1;
                    if tries >= GET_SESSION_MAX_TRIES {
                        return Err(e);
                    }
                    tokio::time::sleep(backoff).await;
                    backoff *= 2;
                }
            }
        }
    }

    async fn execute_query(
        &self,
        session: &SnowflakeSession,
        query: &str,
    ) -> Result<(Vec<QueryResult>, TableSchema, String), QueryDatabaseError> {
        let executor = match session.execute(query).await {
            Ok(executor) => Ok(executor),
            Err(super::api::error::Error::TimedOut) => Err(QueryDatabaseError::ExecutionError(
                "Query execution timed out".to_string(),
                Some(query.to_string()),
            )),
            Err(e) => Err(QueryDatabaseError::ExecutionError(
                format!("Error executing query: {}", e),
                Some(query.to_string()),
            )),
        }?;

        let mut query_result_rows: usize = 0;
        let mut all_rows: Vec<QueryResult> = Vec::new();

        // Fetch results chunk by chunk.
        // If the result size exceeds the limit, return an error.
        // Stop fetching when chunk is None.
        'fetch_rows: loop {
            match executor.fetch_next_chunk().await.map_err(|e| {
                QueryDatabaseError::GenericError(anyhow!("Error fetching rows: {}", e))
            })? {
                Some(snowflake_rows) => {
                    // Convert SnowflakeRow to QueryResult.
                    let rows = snowflake_rows
                        .into_iter()
                        .map(|row| row.try_into())
                        .collect::<Result<Vec<QueryResult>>>()?;

                    // Check that total result size so far does not exceed the limit.
                    query_result_rows += rows.len();
                    if query_result_rows >= MAX_QUERY_RESULT_ROWS {
                        return Err(QueryDatabaseError::ResultTooLarge(format!(
                            "Query result size exceeds limit of {} rows",
                            MAX_QUERY_RESULT_ROWS
                        )));
                    }

                    // Append the chunk to the result.
                    all_rows.extend(rows);

                    Ok::<_, QueryDatabaseError>(())
                }
                None => break 'fetch_rows,
            }?;
        }

        let schema = TableSchema::empty();

        Ok((all_rows, schema, query.to_string()))
    }

    async fn get_query_plan(
        &self,
        session: &SnowflakeSession,
        query: &str,
    ) -> Result<Vec<SnowflakeQueryPlanEntry>, QueryDatabaseError> {
        let plan_query = format!("EXPLAIN {}", query);
        let (res, _, _) = self.execute_query(session, &plan_query).await?;

        Ok(res
            .into_iter()
            .map(|r| r.try_into())
            .collect::<Result<Vec<_>>>()?)
    }

    async fn authorize_query(
        &self,
        session: &SnowflakeSession,
        tables: &Vec<Table>,
        query: &str,
    ) -> Result<(), QueryDatabaseError> {
        // Ensure that query only uses tables that are allowed.
        let plan = self.get_query_plan(&session, query).await?;
        let used_tables: HashSet<&str> = plan
            .iter()
            .filter_map(|entry| match &entry.objects {
                Some(objects) => Some(objects.as_str()),
                None => None,
            })
            .collect();
        let allowed_tables: HashSet<&str> = tables
            .iter()
            .filter_map(|table| table.remote_database_table_id())
            .collect();

        let used_forbidden_tables = used_tables
            .into_iter()
            .filter(|table| !allowed_tables.contains(*table))
            .collect::<Vec<_>>();

        if !used_forbidden_tables.is_empty() {
            info!(
                remote_database = "snowflake",
                used_forbidden_tables = used_forbidden_tables.join(", "),
                used_forbidden_tables_count = used_forbidden_tables.len(),
                allowed_tables_count = allowed_tables.len(),
                allowed_tables = allowed_tables.into_iter().collect::<Vec<_>>().join(", "),
                "Query uses tables that are not allowed",
            );
            Err(QueryDatabaseError::ExecutionError(
                format!(
                    "Query uses tables that are not allowed: {}",
                    used_forbidden_tables.join(", ")
                ),
                Some(query.to_string()),
            ))?
        }

        let used_forbidden_operations = plan
            .into_iter()
            .filter_map(|entry| match entry.operation {
                Some(op)
                    if FORBIDDEN_OPERATIONS
                        .iter()
                        .any(|forbidden_op| op.to_lowercase() == *forbidden_op) =>
                {
                    Some(op)
                }
                _ => None,
            })
            .collect::<Vec<_>>();

        if !used_forbidden_operations.is_empty() {
            Err(QueryDatabaseError::ExecutionError(
                format!(
                    "Query contains forbidden operations: {}",
                    used_forbidden_operations.join(", ")
                ),
                Some(query.to_string()),
            ))?
        }

        Ok(())
    }
}

#[async_trait]
impl RemoteDatabase for SnowflakeRemoteDatabase {
    fn dialect(&self) -> SqlDialect {
        SqlDialect::Snowflake
    }

    async fn authorize_and_execute_query(
        &self,
        tables: &Vec<Table>,
        query: &str,
    ) -> Result<(Vec<QueryResult>, TableSchema, String), QueryDatabaseError> {
        let session = self.get_session().await?;

        // Authorize the query based on allowed tables, query plan,
        // and forbidden operations.
        let _ = self.authorize_query(&session, tables, query).await?;

        self.execute_query(&session, query).await
    }

    async fn get_tables_schema(&self, opaque_ids: &Vec<&str>) -> Result<Vec<Option<TableSchema>>> {
        // Construct a "DESCRIBE TABLE" query for each opaque table ID.
        let queries: Vec<String> = opaque_ids
            .iter()
            .map(|opaque_id| format!("DESCRIBE TABLE {}", opaque_id))
            .collect();

        let session = self.get_session().await?;

        // Execute all queries concurrently.
        let results = try_join_all(
            queries
                .iter()
                .map(|query| self.execute_query(&session, query)),
        )
        .await?;

        // Parse the results and return a map of opaque_id -> TableSchema.
        results
            .into_iter()
            .zip(opaque_ids.into_iter())
            .map(|((rows, _, _), opaque_id)| {
                let raw_columns = match rows.len() {
                    0 => Err(anyhow!("No rows returned for table {}", opaque_id)),
                    _ => Ok(rows),
                }?;

                let columns = raw_columns
                    .into_iter()
                    .map(|row| {
                        serde_json::from_value::<SnowflakeSchemaColumn>(serde_json::Value::Object(
                            row.value,
                        ))
                        .map_err(|e| anyhow!("Error deserializing row: {}", e))?
                        .try_into()
                    })
                    .collect::<Result<Vec<TableSchemaColumn>>>()
                    .map_err(|e| {
                        anyhow!(
                            "Error converting SnowflakeSchemaColumn to TableSchemaColumn: {}",
                            e
                        )
                    })?;

                Ok(Some(TableSchema::from_columns(columns)))
            })
            .collect()
    }
}
