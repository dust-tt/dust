use std::collections::HashSet;

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use futures::future::try_join_all;
use gcp_bigquery_client::{
    error::{BQError, NestedResponseError, ResponseError},
    model::{
        field_type::FieldType, get_query_results_parameters::GetQueryResultsParameters, job::Job,
        job_configuration::JobConfiguration, job_configuration_query::JobConfigurationQuery,
        job_reference::JobReference, table_row::TableRow,
    },
    yup_oauth2::ServiceAccountKey,
    Client,
};
use serde_json::Value;

use crate::databases::{
    database::{QueryDatabaseError, QueryResult, SqlDialect},
    table::Table,
    table_schema::{TableSchema, TableSchemaColumn, TableSchemaFieldType},
};

use super::remote_database::RemoteDatabase;

#[derive(Debug)]
pub struct BigQueryQueryPlan {
    is_select_query: bool,
    affected_tables: Vec<String>,
}

pub struct BigQueryRemoteDatabase {
    project_id: String,
    location: String,
    client: Client,
}

impl TryFrom<&gcp_bigquery_client::model::table_schema::TableSchema> for TableSchema {
    type Error = anyhow::Error;

    fn try_from(
        schema: &gcp_bigquery_client::model::table_schema::TableSchema,
    ) -> Result<Self, Self::Error> {
        match &schema.fields {
            Some(fields) => Ok(TableSchema::from_columns(
                fields
                    .iter()
                    .map(|f| TableSchemaColumn {
                        name: f.name.clone(),
                        value_type: match f.r#type {
                            FieldType::String => TableSchemaFieldType::Text,
                            FieldType::Integer | FieldType::Int64 => TableSchemaFieldType::Int,
                            FieldType::Float
                            | FieldType::Float64
                            | FieldType::Numeric
                            | FieldType::Bignumeric => TableSchemaFieldType::Float,
                            FieldType::Boolean | FieldType::Bool => TableSchemaFieldType::Bool,
                            FieldType::Timestamp
                            | FieldType::Datetime
                            | FieldType::Date
                            | FieldType::Time => TableSchemaFieldType::DateTime,
                            FieldType::Bytes
                            | FieldType::Geography
                            | FieldType::Json
                            | FieldType::Record
                            | FieldType::Struct
                            | FieldType::Interval => TableSchemaFieldType::Text,
                        },
                        possible_values: None,
                    })
                    .collect(),
            )),
            None => Err(anyhow!("No fields found in schema"))?,
        }
    }
}

pub const MAX_QUERY_RESULT_ROWS: usize = 25_000;
pub const PAGE_SIZE: i32 = 500;

impl BigQueryRemoteDatabase {
    pub fn new(
        project_id: String,
        location: String,
        client: Client,
    ) -> Result<Self, QueryDatabaseError> {
        Ok(Self {
            project_id,
            location,
            client,
        })
    }

    pub async fn execute_query(
        &self,
        query: &str,
    ) -> Result<(Vec<QueryResult>, TableSchema, String), QueryDatabaseError> {
        let job = Job {
            configuration: Some(JobConfiguration {
                query: Some(JobConfigurationQuery {
                    query: query.to_string(),
                    use_legacy_sql: Some(false),
                    ..Default::default()
                }),
                ..Default::default()
            }),
            ..Default::default()
        };

        let inserted_job = self
            .client
            .job()
            .insert(&self.project_id, job)
            .await
            .map_err(|e| QueryDatabaseError::GenericError(anyhow!("Error inserting job: {}", e)))?;

        let job_id = match inserted_job.job_reference {
            Some(job_reference) => match job_reference.job_id {
                Some(job_id) => job_id,
                None => Err(QueryDatabaseError::GenericError(anyhow!(
                    "Job reference not found"
                )))?,
            },
            None => Err(QueryDatabaseError::GenericError(anyhow!(
                "Job reference not found"
            )))?,
        };

        let mut query_result_rows: usize = 0;
        let mut all_rows: Vec<TableRow> = Vec::new();
        let mut page_token: Option<String> = None;
        let mut schema: Option<gcp_bigquery_client::model::table_schema::TableSchema> = None;

        'fetch_rows: loop {
            let res = self
                .client
                .job()
                .get_query_results(
                    &self.project_id,
                    &job_id,
                    GetQueryResultsParameters {
                        location: Some(self.location.clone()),
                        page_token: page_token.clone(),
                        max_results: Some(PAGE_SIZE),
                        ..Default::default()
                    },
                )
                .await
                .map_err(|e| {
                    QueryDatabaseError::GenericError(anyhow!("Error getting query results: {}", e))
                })?;

            if !res.job_complete.unwrap_or(false) {
                Err(QueryDatabaseError::GenericError(anyhow!(
                    "Query job not complete"
                )))?
            }

            let rows = res.rows.unwrap_or_default();

            query_result_rows += rows.len();

            if query_result_rows >= MAX_QUERY_RESULT_ROWS {
                return Err(QueryDatabaseError::ResultTooLarge(format!(
                    "Query result size exceeds limit of {} rows",
                    MAX_QUERY_RESULT_ROWS
                )));
            }

            page_token = res.page_token;
            all_rows.extend(rows);

            if let (None, Some(s)) = (&mut schema, res.schema) {
                schema = Some(s);
            }

            if page_token.is_none() {
                break 'fetch_rows;
            }
        }

        let fields = match &schema {
            Some(s) => match &s.fields {
                Some(f) => f,
                None => Err(QueryDatabaseError::GenericError(anyhow!(
                    "Schema not found"
                )))?,
            },
            None => Err(QueryDatabaseError::GenericError(anyhow!(
                "Schema not found"
            )))?,
        };

        let schema = match &schema {
            Some(s) => TableSchema::try_from(s)?,
            None => Err(QueryDatabaseError::GenericError(anyhow!(
                "Schema not found"
            )))?,
        };

        let parsed_rows = all_rows
            .into_iter()
            .map(|row| {
                let cols = row.columns.unwrap_or_default();
                let mut map = serde_json::Map::new();
                for (c, f) in cols.into_iter().zip(fields) {
                    map.insert(
                        f.name.clone(),
                        match c.value {
                            Some(v) => match f.r#type {
                                FieldType::Struct
                                | FieldType::Record
                                | FieldType::Json
                                | FieldType::Geography => match &v {
                                    Value::String(_) => v,
                                    _ => Value::String(v.to_string()),
                                },
                                _ => v,
                            },
                            None => serde_json::Value::Null,
                        },
                    );
                }

                Ok(QueryResult { value: map })
            })
            .collect::<Result<Vec<QueryResult>>>()?;

        Ok((parsed_rows, schema, query.to_string()))
    }

    pub async fn get_query_plan(
        &self,
        query: &str,
    ) -> Result<BigQueryQueryPlan, QueryDatabaseError> {
        let job = Job {
            configuration: Some(JobConfiguration {
                query: Some(JobConfigurationQuery {
                    query: query.to_string(),
                    use_legacy_sql: Some(false),
                    ..Default::default()
                }),
                dry_run: Some(true),
                ..Default::default()
            }),
            job_reference: Some(JobReference {
                location: Some(self.location.clone()),
                ..Default::default()
            }),
            ..Default::default()
        };

        let job_result = self
            .client
            .job()
            .insert(&self.project_id, job)
            .await
            .map_err(|e| match e {
                BQError::ResponseError {
                    error:
                        ResponseError {
                            error: NestedResponseError { message, code, .. },
                        },
                } => QueryDatabaseError::ExecutionError(format!("{} (code={})", message, code)),
                _ => QueryDatabaseError::GenericError(anyhow!("Error inserting job: {}", e)),
            })?;

        let query_stats = match job_result.statistics {
            Some(stats) => match stats.query {
                Some(stats) => stats,
                None => Err(QueryDatabaseError::GenericError(anyhow!(
                    "No statistics found"
                )))?,
            },
            None => Err(QueryDatabaseError::GenericError(anyhow!(
                "No statistics found"
            )))?,
        };

        let is_select_query = match query_stats.statement_type {
            Some(stmt_type) => stmt_type.to_ascii_uppercase() == "SELECT",
            None => false,
        };

        let affected_tables = match query_stats.referenced_tables {
            Some(tables) => tables,
            None => Vec::new(),
        }
        .iter()
        .map(|t| format!("{}.{}.{}", self.project_id, t.dataset_id, t.table_id))
        .collect();

        Ok(BigQueryQueryPlan {
            is_select_query,
            affected_tables,
        })
    }
}

#[async_trait]
impl RemoteDatabase for BigQueryRemoteDatabase {
    fn dialect(&self) -> SqlDialect {
        SqlDialect::Bigquery
    }

    async fn authorize_and_execute_query(
        &self,
        tables: &Vec<Table>,
        query: &str,
    ) -> Result<(Vec<QueryResult>, TableSchema, String), QueryDatabaseError> {
        // Ensure that query is a SELECT query and only uses tables that are allowed.
        let plan = self.get_query_plan(query).await?;

        if !plan.is_select_query {
            Err(QueryDatabaseError::ExecutionError(format!(
                "Query is not a SELECT query"
            )))?
        }

        let used_tables: HashSet<&str> = plan
            .affected_tables
            .iter()
            .map(|table| table.as_str())
            .collect();

        let allowed_tables: HashSet<&str> = tables.iter().map(|table| table.name()).collect();

        let used_forbidden_tables = used_tables
            .into_iter()
            .filter(|table| !allowed_tables.contains(*table))
            .collect::<Vec<_>>();

        if !used_forbidden_tables.is_empty() {
            Err(QueryDatabaseError::ExecutionError(format!(
                "Query uses tables that are not allowed: {}",
                used_forbidden_tables.join(", ")
            )))?
        }

        self.execute_query(query).await
    }

    async fn get_tables_schema(&self, opaque_ids: &Vec<&str>) -> Result<Vec<TableSchema>> {
        let bq_tables: Vec<gcp_bigquery_client::model::table::Table> =
            try_join_all(opaque_ids.iter().map(|opaque_id| async move {
                let parts: Vec<&str> = opaque_id.split('.').collect();
                if parts.len() != 3 {
                    Err(anyhow!("Invalid opaque ID: {}", opaque_id))?
                }
                let (dataset_id, table_id) = (parts[1], parts[2]);

                self.client
                    .table()
                    .get(&self.project_id, dataset_id, table_id, None)
                    .await
                    .map_err(|e| anyhow!("Error getting table metadata: {}", e))
            }))
            .await?;

        let schemas: Vec<TableSchema> = bq_tables
            .into_iter()
            .map(|table| TableSchema::try_from(&table.schema))
            .collect::<Result<Vec<TableSchema>>>()?;

        Ok(schemas)
    }
}

pub async fn get_bigquery_remote_database(
    credentials: serde_json::Map<String, serde_json::Value>,
) -> Result<Box<dyn RemoteDatabase + Sync + Send>> {
    let location = match credentials.get("location") {
        Some(serde_json::Value::String(v)) => v.to_string(),
        _ => Err(anyhow!("Invalid credentials: location not found"))?,
    };
    let project_id = match credentials.get("project_id") {
        Some(serde_json::Value::String(v)) => v.to_string(),
        _ => Err(anyhow!("Invalid credentials: project_id not found"))?,
    };

    let sa_key: ServiceAccountKey = serde_json::from_value(serde_json::Value::Object(credentials))
        .map_err(|e| {
            QueryDatabaseError::GenericError(anyhow!("Error deserializing credentials: {}", e))
        })?;

    let client = Client::from_service_account_key(sa_key, false)
        .await
        .map_err(|e| {
            QueryDatabaseError::GenericError(anyhow!("Error creating BigQuery client: {}", e))
        })?;

    Ok(Box::new(BigQueryRemoteDatabase {
        project_id,
        location,
        client,
    }))
}
