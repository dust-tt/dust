use std::collections::{HashMap, HashSet};
use tracing::info;

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

use crate::{
    databases::{
        database::{QueryDatabaseError, QueryResult, SqlDialect},
        table::Table,
        table_schema::{TableSchema, TableSchemaColumn, TableSchemaFieldType},
    },
    search_filter::Filterable,
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

pub struct DatasetCheckDetails {
    allowed_table_names: HashSet<String>, // table_id
}

impl Default for DatasetCheckDetails {
    fn default() -> Self {
        Self {
            allowed_table_names: HashSet::new(),
        }
    }
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
                        non_filterable: None,
                        description: f.description.clone(),
                    })
                    .collect(),
            )),
            None => Err(anyhow!("No fields found in schema"))?,
        }
    }
}

pub const MAX_QUERY_RESULT_ROWS: usize = 25_000;
pub const PAGE_SIZE: i32 = 500;

// Must be kept in sync with the tag in connectors.
pub const USE_METADATA_FOR_DBML_TAG: &str = "bigquery:useMetadataForDBML";

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
                } => QueryDatabaseError::ExecutionError(
                    format!(
                        "Error getting query plan for original query, plan query={}, message={} (code={})",
                        query, message, code
                    ),
                    Some(query.to_string()),
                ),
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
        .map(|t| format!("{}.{}.{}", t.project_id, t.dataset_id, t.table_id))
        .collect();

        Ok(BigQueryQueryPlan {
            is_select_query,
            affected_tables,
        })
    }

    pub async fn check_if_all_forbidden_tables_are_part_of_allowed_views(
        &self,
        allowed_tables: &HashSet<String>,
        forbidden_tables: &Vec<String>,
    ) -> Result<(), QueryDatabaseError> {
        // Check if all forbidden tables are accessible through allowed views (including view chains).
        // This leverages BigQuery's native query planning to authoritatively determine
        // which underlying tables each view can access, handling transitive dependencies correctly.

        let mut dataset_details = HashMap::<String, DatasetCheckDetails>::new();

        // Group allowed tables by dataset, there might be views in the "allowed_tables".
        for table in allowed_tables {
            // Split on the last dot, everyting before is the dataset_key, everything after is the table_name.
            // There might be more than 3 parts as in some legacy bigquery project id, a dot was allowed.
            let parts: Vec<&str> = table.split('.').collect();
            if parts.len() < 3 {
                Err(anyhow!("Invalid table name: {}", table))?
            }
            let table_name = parts[parts.len() - 1].to_string();
            let dataset_key = parts[..parts.len() - 1].join(".");

            dataset_details
                .entry(dataset_key)
                .or_insert_with(|| DatasetCheckDetails {
                    ..Default::default()
                })
                .allowed_table_names
                .insert(table_name);
        }

        let mut remaining_forbidden_tables = forbidden_tables
            .iter()
            .map(|t| t.clone())
            .collect::<HashSet<_>>();

        for (dataset_key, dataset) in dataset_details.iter() {
            // Skip if there are no longer any forbidden tables remaining.
            if remaining_forbidden_tables.is_empty() {
                break;
            }

            // Check all allowed views with dry-run queries to resolve transitive dependencies.
            // This approach leverages BigQuery's native dependency resolution instead of error-prone text matching.
            for view_name in &dataset.allowed_table_names {
                // Do a simple SELECT to check the query plan of the view and get the affected tables.
                // Do not use the view definition as if the view is an authorized view, it might use tables unauthorized directly for the service account.
                let query = format!("SELECT * FROM `{dataset_key}`.`{view_name}`");

                // Use dry-run to get the query plan - this will work for both tables and views
                if let Ok(plan) = self.get_query_plan(query.as_str()).await {
                    // Remove all affected tables from the remaining forbidden tables.
                    remaining_forbidden_tables.retain(|table| {
                        !plan
                            .affected_tables
                            .iter()
                            .any(|affected_table| affected_table == table)
                    });

                    if remaining_forbidden_tables.is_empty() {
                        // Skip the rest of the views as there are no remaining forbidden tables.
                        break;
                    }
                }
            }
        }

        if !remaining_forbidden_tables.is_empty() {
            info!(
                remote_database = "bigquery",
                used_forbidden_tables = remaining_forbidden_tables
                    .iter()
                    .map(|t| t.to_string())
                    .collect::<Vec<_>>()
                    .join(", "),
                used_forbidden_tables_count = remaining_forbidden_tables.len(),
                allowed_tables_count = allowed_tables.len(),
                allowed_tables = allowed_tables
                    .iter()
                    .map(|t| t.to_string())
                    .collect::<Vec<_>>()
                    .join(", "),
                "Query uses tables that are not allowed",
            );

            Err(QueryDatabaseError::ExecutionError(
                format!(
                    "Query is using tables that are not part of allowed tables: {:?}",
                    remaining_forbidden_tables
                ),
                None,
            ))?
        }
        Ok(())
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
        // Ensure that query is a SELECT query and only uses tables that are allowed directly or indirectly in an allowed view.
        let plan = self.get_query_plan(query).await?;
        if !plan.is_select_query {
            Err(QueryDatabaseError::ExecutionError(
                format!("Query is not a SELECT query"),
                Some(query.to_string()),
            ))?
        }

        let allowed_tables: HashSet<String> = tables
            .iter()
            .map(|table| table.name().replace("__DUST_DOT__", "."))
            .collect();

        let used_forbidden_tables: Vec<String> = plan
            .affected_tables
            .clone()
            .into_iter()
            .filter(|table| !allowed_tables.contains(table))
            .collect();

        if !used_forbidden_tables.is_empty() {
            // Tables selected in the datasource modal might actually be views.
            // In this case, we need to check if any of the allowed tables is a view.
            // If so, we need to check the view definitions and see if they are using forbidden tables.
            // If they are, we let it go. If they are not, we return an error.
            self.check_if_all_forbidden_tables_are_part_of_allowed_views(
                &allowed_tables,
                &used_forbidden_tables,
            )
            .await?;
        }

        self.execute_query(query).await
    }

    async fn get_tables_schema(&self, opaque_ids: &Vec<&str>) -> Result<Vec<Option<TableSchema>>> {
        let bq_tables: Vec<gcp_bigquery_client::model::table::Table> =
            try_join_all(opaque_ids.iter().map(|opaque_id| async move {
                let parts: Vec<&str> = opaque_id.split('.').collect();
                if parts.len() != 3 {
                    Err(anyhow!("Invalid opaque ID: {}", opaque_id))?
                }
                let (dataset_id, table_id) = (
                    parts[1].replace("__DUST_DOT__", "."),
                    parts[2].replace("__DUST_DOT__", "."),
                );

                self.client
                    .table()
                    .get(&self.project_id, &dataset_id, &table_id, None)
                    .await
                    .map_err(|e| anyhow!("Error getting table metadata: {}", e))
            }))
            .await?;

        let schemas: Vec<Option<TableSchema>> = bq_tables
            .into_iter()
            .map(|table| TableSchema::try_from(&table.schema).map(Some))
            .collect::<Result<Vec<_>>>()?;

        Ok(schemas)
    }

    fn should_use_column_description(&self, table: &Table) -> bool {
        table
            .get_tags()
            .contains(&USE_METADATA_FOR_DBML_TAG.to_string())
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
