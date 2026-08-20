use std::time::Duration;

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use reqwest::{Client, Url};
use serde_json::{json, Map, Value};
use tokio::time::sleep;

use crate::databases::database::{QueryDatabaseError, QueryResult, SqlDialect};
use crate::databases::remote_databases::remote_database::RemoteDatabase;
use crate::databases::table::Table;
use crate::databases::table_schema::{TableSchema, TableSchemaColumn, TableSchemaFieldType};

const MAX_QUERY_RESULT_ROWS: usize = 25_000;
const STATEMENT_ENDPOINT: &str = "api/2.0/sql/statements";
const STATEMENT_POLL_INTERVAL: Duration = Duration::from_millis(500);
const STATEMENT_MAX_POLLS: usize = 120; // ~60 seconds

pub struct DatabricksRemoteDatabase {
    client: Client,
    base_url: Url,
    http_path: String,
    warehouse_id: String,
    access_token: String,
}

struct DatabricksColumn {
    name: String,
    type_text: String,
}

#[derive(Clone)]
struct DatabricksTableName {
    catalog: String,
    schema: Option<String>,
    table: String,
}

impl DatabricksTableName {
    fn from_internal_id(internal_id: &str) -> Result<Self, QueryDatabaseError> {
        let parts = internal_id
            .split('.')
            .map(|part| part.replace("__DUST_DOT__", "."))
            .collect::<Vec<_>>();

        match parts.as_slice() {
            [catalog, schema, table] => Ok(Self {
                catalog: catalog.clone(),
                schema: Some(schema.clone()),
                table: table.clone(),
            }),
            [catalog, table] => Ok(Self {
                catalog: catalog.clone(),
                schema: None,
                table: table.clone(),
            }),
            _ => Err(QueryDatabaseError::GenericError(anyhow!(
                "Invalid Databricks table identifier: {}",
                internal_id
            ))),
        }
    }

    fn fully_qualified(&self) -> String {
        match &self.schema {
            Some(schema) => format!(
                "{}.{}.{}",
                quote_identifier(&self.catalog),
                quote_identifier(schema),
                quote_identifier(&self.table)
            ),
            None => format!(
                "{}.{}",
                quote_identifier(&self.catalog),
                quote_identifier(&self.table)
            ),
        }
    }
}

fn quote_identifier(identifier: &str) -> String {
    format!("`{}`", identifier.replace('`', "``"))
}

impl DatabricksRemoteDatabase {
    pub fn new(credentials: Map<String, Value>) -> Result<Self, QueryDatabaseError> {
        let host = credentials
            .get("host")
            .and_then(Value::as_str)
            .ok_or_else(|| {
                QueryDatabaseError::GenericError(anyhow!("Missing Databricks host credential"))
            })?
            .trim()
            .to_string();

        let http_path = credentials
            .get("http_path")
            .and_then(Value::as_str)
            .ok_or_else(|| {
                QueryDatabaseError::GenericError(anyhow!("Missing Databricks http_path credential"))
            })?
            .trim()
            .trim_end_matches('/')
            .to_string();

        let access_token = credentials
            .get("access_token")
            .and_then(Value::as_str)
            .ok_or_else(|| {
                QueryDatabaseError::GenericError(anyhow!(
                    "Missing Databricks access_token credential"
                ))
            })?
            .trim()
            .to_string();

        if host.is_empty() || http_path.is_empty() || access_token.is_empty() {
            return Err(QueryDatabaseError::GenericError(anyhow!(
                "Databricks credentials must include host, http_path, and access_token"
            )));
        }

        let warehouse_id = http_path
            .split('/')
            .filter(|segment| !segment.is_empty())
            .last()
            .ok_or_else(|| {
                QueryDatabaseError::GenericError(anyhow!(
                    "Unable to extract warehouse ID from Databricks http_path"
                ))
            })?
            .to_string();

        let normalized_host = if host.starts_with("http://") || host.starts_with("https://") {
            host.clone()
        } else {
            format!("https://{}", host)
        };

        let mut base_url = Url::parse(&normalized_host).map_err(|e| {
            QueryDatabaseError::GenericError(anyhow!("Invalid Databricks host `{}`: {}", host, e))
        })?;
        base_url.set_path("");

        let client = Client::builder()
            .build()
            .map_err(|e| QueryDatabaseError::GenericError(anyhow!(e)))?;

        Ok(Self {
            client,
            base_url,
            http_path,
            warehouse_id,
            access_token,
        })
    }

    fn apply_headers(&self, builder: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        builder
            .bearer_auth(&self.access_token)
            .header("X-Databricks-SQL-Http-Path", &self.http_path)
    }

    async fn run_statement(
        &self,
        query: &str,
    ) -> Result<(Vec<DatabricksColumn>, Vec<Vec<Value>>), QueryDatabaseError> {
        let mut response = self
            .apply_headers(
                self.client
                    .post(self.base_url.join(STATEMENT_ENDPOINT).map_err(|e| {
                        QueryDatabaseError::GenericError(anyhow!(
                            "Unable to build Databricks statements URL: {}",
                            e
                        ))
                    })?),
            )
            .json(&json!({
                "statement": query,
                "warehouse_id": self.warehouse_id,
                "disposition": "INLINE",
                "wait_timeout": "30s",
                "row_limit": MAX_QUERY_RESULT_ROWS,
            }))
            .send()
            .await
            .map_err(|e| QueryDatabaseError::GenericError(anyhow!(e)))?
            .error_for_status()
            .map_err(|e| {
                QueryDatabaseError::ExecutionError(
                    format!("Databricks query failed to start: {}", e),
                    Some(query.to_string()),
                )
            })?
            .json::<Value>()
            .await
            .map_err(|e| QueryDatabaseError::GenericError(anyhow!(e)))?;

        let statement_id = response
            .get("statement_id")
            .and_then(Value::as_str)
            .ok_or_else(|| {
                QueryDatabaseError::ExecutionError(
                    "Databricks response missing statement_id".to_string(),
                    Some(query.to_string()),
                )
            })?
            .to_string();

        let mut state = response
            .pointer("/status/state")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();

        if state != "SUCCEEDED" {
            response = self.wait_for_statement(&statement_id, query).await?;
            state = response
                .pointer("/status/state")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
        }

        if state != "SUCCEEDED" {
            return Err(QueryDatabaseError::ExecutionError(
                format!("Databricks statement did not succeed (state: {})", state),
                Some(query.to_string()),
            ));
        }

        let (columns, mut rows) = self.extract_result_data(&response, query)?;

        if rows.len() > MAX_QUERY_RESULT_ROWS {
            return Err(QueryDatabaseError::ResultTooLarge(format!(
                "Query result size exceeds the limit of {} rows",
                MAX_QUERY_RESULT_ROWS
            )));
        }

        if let Some(next_link) = response
            .pointer("/result/next_chunk_internal_link")
            .and_then(Value::as_str)
        {
            self.fetch_additional_chunks(next_link, query, &mut rows)
                .await?;
        }

        // Best-effort cleanup, ignore errors.
        let _ = self.cleanup_statement(&statement_id).await;

        Ok((columns, rows))
    }

    async fn wait_for_statement(
        &self,
        statement_id: &str,
        query: &str,
    ) -> Result<Value, QueryDatabaseError> {
        for _ in 0..STATEMENT_MAX_POLLS {
            let status = self.fetch_statement(statement_id).await?;
            if let Some(state) = status.pointer("/status/state").and_then(Value::as_str) {
                match state {
                    "SUCCEEDED" => return Ok(status),
                    "FAILED" => {
                        let message = status
                            .pointer("/error/message")
                            .and_then(Value::as_str)
                            .unwrap_or("Databricks statement failed");
                        return Err(QueryDatabaseError::ExecutionError(
                            message.to_string(),
                            Some(query.to_string()),
                        ));
                    }
                    "CANCELED" => {
                        return Err(QueryDatabaseError::ExecutionError(
                            "Databricks statement was canceled".to_string(),
                            Some(query.to_string()),
                        ))
                    }
                    _ => {
                        sleep(STATEMENT_POLL_INTERVAL).await;
                    }
                }
            } else {
                sleep(STATEMENT_POLL_INTERVAL).await;
            }
        }

        Err(QueryDatabaseError::GenericError(anyhow!(
            "Timed out waiting for Databricks query to complete"
        )))
    }

    async fn fetch_statement(&self, statement_id: &str) -> Result<Value, QueryDatabaseError> {
        let url = self
            .base_url
            .join(&format!("{}/{}", STATEMENT_ENDPOINT, statement_id))
            .map_err(|e| QueryDatabaseError::GenericError(anyhow!(e)))?;

        self.apply_headers(self.client.get(url))
            .send()
            .await
            .map_err(|e| QueryDatabaseError::GenericError(anyhow!(e)))?
            .error_for_status()
            .map_err(|e| QueryDatabaseError::GenericError(anyhow!(e)))?
            .json::<Value>()
            .await
            .map_err(|e| QueryDatabaseError::GenericError(anyhow!(e)))
    }

    async fn fetch_additional_chunks(
        &self,
        next_link: &str,
        _query: &str,
        rows: &mut Vec<Vec<Value>>,
    ) -> Result<(), QueryDatabaseError> {
        let mut current_link = next_link.to_string();

        loop {
            let chunk_value = self.fetch_chunk(&current_link).await?;

            let next_internal = chunk_value
                .get("next_chunk_internal_link")
                .and_then(Value::as_str)
                .map(|s| s.to_string());

            let chunk_rows = chunk_value
                .get("data_array")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();

            rows.extend(chunk_rows.into_iter().map(|r| match r {
                Value::Array(values) => values,
                other => vec![other],
            }));

            if rows.len() > MAX_QUERY_RESULT_ROWS {
                return Err(QueryDatabaseError::ResultTooLarge(format!(
                    "Query result size exceeds the limit of {} rows",
                    MAX_QUERY_RESULT_ROWS
                )));
            }

            if let Some(link) = next_internal {
                current_link = link;
            } else {
                break;
            }
        }

        Ok(())
    }

    async fn fetch_chunk(&self, link: &str) -> Result<Value, QueryDatabaseError> {
        let url = if link.starts_with("http://") || link.starts_with("https://") {
            Url::parse(link).map_err(|e| QueryDatabaseError::GenericError(anyhow!(e)))?
        } else {
            self.base_url
                .join(link.trim_start_matches('/'))
                .map_err(|e| QueryDatabaseError::GenericError(anyhow!(e)))?
        };

        self.apply_headers(self.client.get(url))
            .send()
            .await
            .map_err(|e| QueryDatabaseError::GenericError(anyhow!(e)))?
            .error_for_status()
            .map_err(|e| QueryDatabaseError::GenericError(anyhow!(e)))?
            .json::<Value>()
            .await
            .map_err(|e| QueryDatabaseError::GenericError(anyhow!(e)))
    }

    async fn cleanup_statement(&self, statement_id: &str) -> Result<(), QueryDatabaseError> {
        let url = self
            .base_url
            .join(&format!("{}/{}", STATEMENT_ENDPOINT, statement_id))
            .map_err(|e| QueryDatabaseError::GenericError(anyhow!(e)))?;

        let _ = self.apply_headers(self.client.delete(url)).send().await;

        Ok(())
    }

    fn extract_result_data(
        &self,
        response: &Value,
        query: &str,
    ) -> Result<(Vec<DatabricksColumn>, Vec<Vec<Value>>), QueryDatabaseError> {
        let schema_value = response
            .pointer("/result/manifest/schema")
            .or_else(|| response.pointer("/manifest/schema"))
            .ok_or_else(|| {
                QueryDatabaseError::ExecutionError(
                    "Databricks response missing schema information".to_string(),
                    Some(query.to_string()),
                )
            })?;

        let columns_value = schema_value
            .get("columns")
            .and_then(Value::as_array)
            .ok_or_else(|| {
                QueryDatabaseError::ExecutionError(
                    "Databricks schema missing columns array".to_string(),
                    Some(query.to_string()),
                )
            })?;

        let columns = columns_value
            .iter()
            .map(|col| {
                let name = col
                    .get("name")
                    .and_then(Value::as_str)
                    .ok_or_else(|| {
                        QueryDatabaseError::ExecutionError(
                            "Databricks column missing name".to_string(),
                            Some(query.to_string()),
                        )
                    })?
                    .to_string();

                let type_text = col
                    .get("type_text")
                    .or_else(|| col.get("type_name"))
                    .and_then(Value::as_str)
                    .unwrap_or("STRING")
                    .to_string();

                Ok(DatabricksColumn { name, type_text })
            })
            .collect::<Result<Vec<_>, QueryDatabaseError>>()?;

        let mut rows = Vec::new();

        if let Some(result_value) = response.get("result") {
            if let Some(data_array) = result_value.get("data_array").and_then(Value::as_array) {
                rows.extend(data_array.iter().cloned().map(|row| match row {
                    Value::Array(values) => values,
                    other => vec![other],
                }));
            }

            if let Some(row_count) = result_value.get("row_count").and_then(Value::as_u64) {
                if (row_count as usize) > MAX_QUERY_RESULT_ROWS {
                    return Err(QueryDatabaseError::ResultTooLarge(format!(
                        "Query result size exceeds the limit of {} rows",
                        MAX_QUERY_RESULT_ROWS
                    )));
                }
            }

            if let Some(true) = result_value.get("data_truncated").and_then(Value::as_bool) {
                return Err(QueryDatabaseError::ResultTooLarge(
                    "Databricks truncated the result set".to_string(),
                ));
            }
        }

        Ok((columns, rows))
    }

    fn columns_to_schema(&self, columns: &[DatabricksColumn]) -> TableSchema {
        TableSchema::from_columns(
            columns
                .iter()
                .map(|col| TableSchemaColumn {
                    name: col.name.clone(),
                    value_type: map_databricks_type(&col.type_text),
                    possible_values: None,
                    non_filterable: None,
                    description: None,
                })
                .collect(),
        )
    }

    fn convert_rows(
        &self,
        columns: &[DatabricksColumn],
        rows: Vec<Vec<Value>>,
    ) -> Vec<QueryResult> {
        rows.into_iter()
            .map(|row| {
                let mut map = Map::new();
                for (idx, column) in columns.iter().enumerate() {
                    let value = row.get(idx).cloned().unwrap_or(Value::Null);
                    map.insert(column.name.clone(), value);
                }
                QueryResult { value: map }
            })
            .collect()
    }
}

fn map_databricks_type(type_text: &str) -> TableSchemaFieldType {
    let upper = type_text.trim().to_ascii_uppercase();
    match upper.as_str() {
        "TINYINT" | "SMALLINT" | "INT" | "INTEGER" | "BIGINT" | "BYTEINT" | "SHORT" => {
            TableSchemaFieldType::Int
        }
        "FLOAT" | "DOUBLE" | "DOUBLE PRECISION" | "REAL" | "DECIMAL" | "NUMERIC" | "NUMBER" => {
            TableSchemaFieldType::Float
        }
        "BOOLEAN" | "BOOL" => TableSchemaFieldType::Bool,
        "DATE" | "TIME" | "TIMESTAMP" | "TIMESTAMP_NTZ" | "TIMESTAMP_LTZ" | "TIMESTAMP_TZ"
        | "DATETIME" => TableSchemaFieldType::DateTime,
        _ => TableSchemaFieldType::Text,
    }
}

#[async_trait]
impl RemoteDatabase for DatabricksRemoteDatabase {
    fn dialect(&self) -> SqlDialect {
        SqlDialect::Databricks
    }

    async fn authorize_and_execute_query(
        &self,
        _tables: &Vec<Table>,
        query: &str,
    ) -> Result<(Vec<QueryResult>, TableSchema, String), QueryDatabaseError> {
        let (columns, rows) = self.run_statement(query).await?;
        let schema = self.columns_to_schema(&columns);
        let query_results = self.convert_rows(&columns, rows);

        Ok((query_results, schema, query.to_string()))
    }

    async fn get_tables_schema(&self, opaque_ids: &Vec<&str>) -> Result<Vec<Option<TableSchema>>> {
        let mut schemas = Vec::with_capacity(opaque_ids.len());

        for opaque in opaque_ids {
            let table_name =
                DatabricksTableName::from_internal_id(opaque).map_err(|e| anyhow!("{e}"))?;
            let query = format!("SELECT * FROM {} LIMIT 0", table_name.fully_qualified());
            let (columns, _rows) = self
                .run_statement(&query)
                .await
                .map_err(|e| anyhow!("{e}"))?;

            let columns = columns
                .into_iter()
                .map(|col| TableSchemaColumn {
                    name: col.name,
                    value_type: map_databricks_type(&col.type_text),
                    possible_values: None,
                    non_filterable: None,
                    description: None,
                })
                .collect();
            let schema = TableSchema::from_columns(columns);

            schemas.push(Some(schema));
        }

        Ok(schemas)
    }
}
