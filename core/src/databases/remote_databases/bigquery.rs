use std::collections::{HashMap, HashSet};
use tracing::info;

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use futures::future::{join_all, try_join_all};
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

use super::remote_database::{RemoteDatabase, QUERY_TIMEOUT};

const SERVICE_ACCOUNT_REQUIRED_FIELDS: [&str; 3] = ["private_key", "client_email", "token_uri"];

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
            None => {
                info!("No fields found in schema for table");
                Ok(TableSchema::empty())
            }
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
                job_timeout_ms: Some(QUERY_TIMEOUT.as_millis().to_string()),
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

        let query_start = std::time::Instant::now();

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
                if query_start.elapsed() >= QUERY_TIMEOUT {
                    Err(QueryDatabaseError::ExecutionError(
                        "Query execution timed out after 2 minutes".to_string(),
                        Some(query.to_string()),
                    ))?
                }
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                continue 'fetch_rows;
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

    // Fetch the metadata of a table from its fully qualified `project.dataset.table` name.
    async fn get_table_metadata(
        &self,
        table_name: &str,
    ) -> Result<gcp_bigquery_client::model::table::Table> {
        let (dataset_key, table_id) = table_name
            .rsplit_once('.')
            .ok_or(anyhow!("Invalid table name: {}", table_name))?;
        let (project_id, dataset_id) = dataset_key
            .rsplit_once('.')
            .ok_or(anyhow!("Invalid table name: {}", table_name))?;

        self.client
            .table()
            .get(project_id, dataset_id, table_id, None)
            .await
            .map_err(|e| anyhow!("Error getting table metadata of {}: {}", table_name, e))
    }

    // Columns a query must filter on to be planned at all: BigQuery refuses to plan a query
    // reading from a table declared with `require_partition_filter` unless it has a predicate
    // referencing only the partitioning column, and that requirement propagates to the views
    // reading from that table.
    fn required_partition_filter_columns(
        table: &gcp_bigquery_client::model::table::Table,
    ) -> Vec<String> {
        if !table.require_partition_filter.unwrap_or(false) {
            return vec![];
        }

        let mut columns = vec![];

        if let Some(time_partitioning) = &table.time_partitioning {
            // Without a field, the table is partitioned on the `_PARTITIONTIME` pseudo-column.
            columns.push(
                time_partitioning
                    .field
                    .clone()
                    .unwrap_or("_PARTITIONTIME".to_string()),
            );
        }

        if let Some(field) = table
            .range_partitioning
            .as_ref()
            .and_then(|range_partitioning| range_partitioning.field.as_ref())
        {
            columns.push(field.clone());
        }

        columns
    }

    // Get the query plan of a plain SELECT on an allowed table or view, to resolve the tables it
    // actually reads. Filter on the partitioning columns the tables involved require, otherwise
    // BigQuery would not plan the query at all. `IS NULL` is used as it references the partitioning
    // column only, which is what makes a filter eligible for partition elimination, and it is valid
    // whatever the column type is (including the `_PARTITIONTIME` pseudo-column).
    async fn get_allowed_table_query_plan(
        &self,
        dataset_key: &str,
        table_name: &str,
        required_partition_columns: &HashSet<String>,
    ) -> Result<BigQueryQueryPlan, QueryDatabaseError> {
        let select = format!("SELECT * FROM `{dataset_key}`.`{table_name}`");
        let full_name = format!("{dataset_key}.{table_name}");

        // The metadata is only needed to filter on partitioning columns, so fall back to a plain
        // SELECT when it cannot be read: that is all a table requiring no partition filter needs.
        let metadata = match self.get_table_metadata(&full_name).await {
            Ok(metadata) => metadata,
            Err(e) => {
                info!(
                    remote_database = "bigquery",
                    table = full_name.as_str(),
                    error = e.to_string(),
                    "Failed to get allowed table metadata",
                );

                return self.get_query_plan(select.as_str()).await;
            }
        };

        // The allowed table may be partitioned itself, and only exposes the partitioning columns of
        // the tables it reads from if it selects them when it is a view. Filtering on a column it
        // does not expose would make the query invalid, hence the intersection with its own
        // columns. Its own partitioning columns are always valid, including the `_PARTITIONTIME`
        // pseudo-column, which is not part of its schema.
        let mut filter_columns: HashSet<String> = metadata
            .schema
            .fields
            .iter()
            .flatten()
            .map(|field| field.name.clone())
            .filter(|name| required_partition_columns.contains(name))
            .collect();
        filter_columns.extend(Self::required_partition_filter_columns(&metadata));

        let mut filter_columns = filter_columns.into_iter().collect::<Vec<_>>();
        filter_columns.sort();

        let query = match filter_columns.is_empty() {
            true => select,
            false => format!(
                "{} WHERE {}",
                select,
                filter_columns
                    .iter()
                    .map(|c| format!("`{c}` IS NULL"))
                    .collect::<Vec<_>>()
                    .join(" AND ")
            ),
        };

        self.get_query_plan(query.as_str()).await
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

        // The forbidden tables are the physical tables the allowed views read from, so the ones
        // requiring a partition filter to be queried, directly or through a view. Their
        // partitioning columns are needed to build plannable queries below.
        let mut required_partition_columns = HashSet::<String>::new();
        for (table, metadata) in forbidden_tables.iter().zip(
            join_all(
                forbidden_tables
                    .iter()
                    .map(|table| self.get_table_metadata(table)),
            )
            .await,
        ) {
            match metadata {
                Ok(metadata) => required_partition_columns
                    .extend(Self::required_partition_filter_columns(&metadata)),
                // The service account may not be allowed to read the metadata of a table it only
                // has access to through an authorized view. If that table requires a partition
                // filter, the plan queries below will fail and be reported as unresolved.
                Err(e) => info!(
                    remote_database = "bigquery",
                    table = table,
                    error = e.to_string(),
                    "Failed to get forbidden table metadata",
                ),
            }
        }

        // Allowed tables whose query plan could not be retrieved: if the query ends up rejected,
        // these are the most likely cause, so they are reported instead of being silently dropped.
        let mut unresolved_allowed_tables: Vec<String> = vec![];

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
                // Use dry-run to get the query plan - this will work for both tables and views
                match self
                    .get_allowed_table_query_plan(
                        dataset_key,
                        view_name,
                        &required_partition_columns,
                    )
                    .await
                {
                    Ok(plan) => {
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
                    Err(e) => {
                        // Keep checking the other allowed tables, the forbidden tables may be
                        // reachable from one of them.
                        unresolved_allowed_tables
                            .push(format!("`{dataset_key}`.`{view_name}` ({e})"));
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
                unresolved_allowed_tables = unresolved_allowed_tables.join(" | "),
                "Query uses tables that are not allowed",
            );

            let unresolved_details = match unresolved_allowed_tables.is_empty() {
                true => String::new(),
                false => format!(
                    ". Could not resolve the tables read by: {}",
                    unresolved_allowed_tables.join(" | ")
                ),
            };

            Err(QueryDatabaseError::ExecutionError(
                format!(
                    "Query is using tables that are not part of allowed tables: {:?}{}",
                    remaining_forbidden_tables, unresolved_details
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
                let (project_id, dataset_id, table_id) = (
                    parts[0].replace("__DUST_DOT__", "."),
                    parts[1].replace("__DUST_DOT__", "."),
                    parts[2].replace("__DUST_DOT__", "."),
                );

                self.client
                    .table()
                    .get(&project_id, &dataset_id, &table_id, None)
                    .await
                    .map_err(|e| anyhow!("Error getting table metadata of {}: {}", opaque_id, e))
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

    let client = create_bigquery_client(&credentials).await?;

    Ok(Box::new(BigQueryRemoteDatabase {
        project_id,
        location,
        client,
    }))
}

async fn create_bigquery_client(
    credentials: &serde_json::Map<String, serde_json::Value>,
) -> Result<Client, QueryDatabaseError> {
    let has_service_account_field = SERVICE_ACCOUNT_REQUIRED_FIELDS
        .iter()
        .any(|field| credentials.contains_key(*field));
    let missing_service_account_fields: Vec<&str> = SERVICE_ACCOUNT_REQUIRED_FIELDS
        .iter()
        .copied()
        .filter(|field| !credentials.contains_key(*field))
        .collect();

    if has_service_account_field {
        if !missing_service_account_fields.is_empty() {
            return Err(QueryDatabaseError::GenericError(anyhow!(
                "Invalid BigQuery credentials: missing service account fields: {}",
                missing_service_account_fields.join(", ")
            )));
        }

        let sa_key: ServiceAccountKey = serde_json::from_value(serde_json::Value::Object(
            credentials.clone(),
        ))
        .map_err(|e| {
            QueryDatabaseError::GenericError(anyhow!(
                "Error deserializing BigQuery service account credentials: {}",
                e
            ))
        })?;

        return Client::from_service_account_key(sa_key, false)
            .await
            .map_err(|e| {
                QueryDatabaseError::GenericError(anyhow!(
                    "Error creating BigQuery client from service account credentials: {}",
                    e
                ))
            });
    }

    Client::from_application_default_credentials()
        .await
        .map_err(|e| {
            QueryDatabaseError::GenericError(anyhow!(
                "Error creating BigQuery client from application default credentials: {}",
                e
            ))
        })
}
