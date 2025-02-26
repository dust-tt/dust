use std::{collections::HashSet, env};

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use futures::future::try_join_all;
use lazy_static::lazy_static;
use regex::Regex;
use reqwest::Proxy;
use serde::Deserialize;
use serde_json::{Map, Value};
use thiserror::Error;

use crate::{
    databases::{
        database::{QueryDatabaseError, QueryResult, SqlDialect},
        remote_databases::remote_database::RemoteDatabase,
        table::Table,
        table_schema::{TableSchema, TableSchemaColumn, TableSchemaFieldType},
    },
    oauth::{
        app::ConnectionAccessTokenResponse, providers::salesforce::SalesforceConnectionProvider,
    },
};

lazy_static! {
    static ref SUBSELECT_PATTERN: Regex = Regex::new(r"\(\s*SELECT").unwrap();
}

pub const MAX_QUERY_RESULT_ROWS: usize = 25_000;
pub const GET_SESSION_MAX_TRIES: usize = 3;

pub struct SalesforceRemoteDatabase {
    client: reqwest::Client,
    instance_url: String,
    access_token: String,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SalesforceQueryPlan {
    cardinality: usize,
    fields: Vec<String>,
    leading_operation_type: String,
    notes: Vec<SalesforceQueryPlanNote>,
    relative_cost: f64,
    sobject_cardinality: usize,
    sobject_type: String,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SalesforceQueryPlanNote {
    description: String,
    fields: Vec<String>,
    table_enum_or_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SalesforceQueryPlansResponse {
    plans: Vec<SalesforceQueryPlan>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SalesforceQueryResponse {
    done: bool,
    #[serde(default)]
    records: Vec<Map<String, Value>>,
    #[serde(default)]
    next_records_url: Option<String>,
    total_size: i32,
}

#[derive(Debug, Error, PartialEq)]
pub enum SoqlValidationError {
    #[error("Query must start with SELECT")]
    NotSelectQuery,
    #[error("Query contains subselects which is not supported")]
    ContainsSubselect,
    #[error("Query contains multiple tables in FROM clause which is not supported")]
    MultipleFromTables,
    #[error("Query contains nested fields which is not supported")]
    NestedFields,
}

impl SalesforceRemoteDatabase {
    pub fn new(response: &ConnectionAccessTokenResponse) -> Result<Self, QueryDatabaseError> {
        let client = match (
            env::var("PROXY_HOST"),
            env::var("PROXY_PORT"),
            env::var("PROXY_USER_NAME"),
            env::var("PROXY_USER_PASSWORD"),
        ) {
            (Ok(host), Ok(port), Ok(_user), Ok(_pass)) => {
                let port = port.parse::<u16>().map_err(|e| {
                    QueryDatabaseError::GenericError(anyhow!("Error parsing proxy port: {}", e))
                })?;

                reqwest::Client::builder()
                    .proxy(Proxy::http(format!("{}:{}", host, port)).map_err(|e| {
                        QueryDatabaseError::GenericError(anyhow!("Error creating proxy: {}", e))
                    })?)
                    .build()
                    .map_err(|e| {
                        QueryDatabaseError::GenericError(anyhow!("Error building client: {}", e))
                    })?
            }
            _ => reqwest::Client::new(),
        };

        let instance_url =
            match SalesforceConnectionProvider::get_instance_url(&response.connection.metadata) {
                Ok(instance_url) => instance_url,
                Err(e) => Err(QueryDatabaseError::GenericError(anyhow!(
                    "Error getting instance url: {}",
                    e
                )))?,
            };

        Ok(Self {
            client,
            instance_url,
            access_token: response.access_token.clone(),
        })
    }

    /// Validates if a SOQL query string meets certain criteria.
    /// Returns an error if the query:
    /// - Does not start with SELECT
    /// - Contains a subselect (e.g., "(SELECT Id FROM Contacts)")
    /// - Has multiple FROM clauses
    /// - Contains nested fields (e.g., Owner.Name)
    ///
    /// # Arguments
    ///
    /// * `query` - The SOQL query string to validate
    ///
    /// # Returns
    ///
    /// Returns `Ok(())` if the query is valid according to the criteria, `Err(SoqlValidationError)` otherwise.
    pub fn is_valid_soql_query(query: &str) -> Result<(), SoqlValidationError> {
        let query = query.trim();
        let query_upper = query.to_uppercase();

        // Basic validation - query must start with SELECT
        if !query_upper.starts_with("SELECT") {
            return Err(SoqlValidationError::NotSelectQuery);
        }

        // Check for subselects using regex pattern
        // Matches: '(' followed by zero or more whitespace followed by 'SELECT'
        if SUBSELECT_PATTERN.is_match(&query_upper) {
            return Err(SoqlValidationError::ContainsSubselect);
        }

        // Check for multiple tables (comma in the FROM clause)
        let from_parts: Vec<&str> = query_upper.split("FROM").collect();
        if let Some(from_part) = from_parts.get(1) {
            let table_part = from_part.split_whitespace().next().unwrap_or("");
            if table_part.contains(',') {
                return Err(SoqlValidationError::MultipleFromTables);
            }
        }

        // Extract fields between SELECT and FROM
        if let Some(select_part) = query_upper.split("FROM").next() {
            let fields_part = select_part.replace("SELECT", "");
            let fields_part = fields_part.trim();
            let fields: Vec<&str> = fields_part.split(',').map(|s| s.trim()).collect();

            // Check for nested fields
            for field in fields {
                if field.contains('.') {
                    return Err(SoqlValidationError::NestedFields);
                }
            }
        }

        Ok(())
    }

    /// Gets the query plans for a SOQL query from Salesforce.
    ///
    /// This method sends a request to Salesforce's query endpoint to get the execution plans
    /// for a given SOQL query. The plans contain information about which tables/objects
    /// will be accessed by the query. Since Salesforce may generate multiple possible execution
    /// plans and the documentation does not specify which one will ultimately be chosen,
    /// this method returns all potential plans.
    ///
    /// # Arguments
    ///
    /// * `query` - The SOQL query string to get plans for
    ///
    /// # Returns
    ///
    /// Returns a `Result` containing a `SalesforceQueryPlansResponse` with all possible query plans
    /// if successful, or a `QueryDatabaseError` if the request fails.
    ///
    /// # Errors
    ///
    /// Will return `QueryDatabaseError::GenericError` if:
    /// - The HTTP request to Salesforce fails
    /// - The response cannot be parsed into a `SalesforceQueryPlansResponse`
    async fn get_query_plans(
        &self,
        query: &str,
    ) -> Result<Vec<SalesforceQueryPlan>, QueryDatabaseError> {
        let url = format!(
            "{}/services/data/v63.0/query/?explain={}",
            self.instance_url,
            urlencoding::encode(query)
        );

        let response = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.access_token))
            .header("Content-Type", "application/json")
            .send()
            .await
            .map_err(|e| {
                QueryDatabaseError::GenericError(anyhow!("Error getting query plan: {}", e))
            })?;

        let response_text = response.text().await.map_err(|e| {
            QueryDatabaseError::GenericError(anyhow!("Error getting response text: {}", e))
        })?;

        let query_plans: SalesforceQueryPlansResponse = serde_json::from_str(&response_text)
            .map_err(|e| {
                QueryDatabaseError::GenericError(anyhow!(
                    "Error parsing response of query plan: {} => {} with response {}",
                    e,
                    query,
                    response_text
                ))
            })?;

        Ok(query_plans.plans)
    }

    async fn execute_query(
        &self,
        query: &str,
    ) -> Result<(Vec<QueryResult>, TableSchema), QueryDatabaseError> {
        let mut all_records = Vec::new();
        let mut next_url = None;
        let mut query_result_rows = 0;

        // Initial query
        let url = format!(
            "{}/services/data/v63.0/query/{}",
            self.instance_url,
            if query.to_lowercase().starts_with("select") {
                "?q=".to_string() + &urlencoding::encode(query)
            } else {
                query.to_string()
            }
        );

        loop {
            let request = self
                .client
                .get(next_url.unwrap_or(url.clone()))
                .header("Authorization", format!("Bearer {}", self.access_token))
                .header("Content-Type", "application/json");

            let response = request.send().await.map_err(|e| {
                QueryDatabaseError::GenericError(anyhow!("Error executing query: {}", e))
            })?;

            if !response.status().is_success() {
                let error_text = response.text().await.map_err(|e| {
                    QueryDatabaseError::GenericError(anyhow!("Error getting response text: {}", e))
                })?;

                return Err(QueryDatabaseError::ExecutionError(format!(
                    "Query failed: {}",
                    error_text
                )));
            }

            let response_text = response.text().await.map_err(|e| {
                QueryDatabaseError::GenericError(anyhow!("Error getting response text: {}", e))
            })?;

            let query_response: SalesforceQueryResponse = serde_json::from_str(&response_text)
                .map_err(|e| {
                    QueryDatabaseError::GenericError(anyhow!(
                        "Error parsing response of query: {} => {} with response {}",
                        query,
                        e,
                        response_text
                    ))
                })?;

            query_result_rows += query_response.records.len();
            if query_result_rows > MAX_QUERY_RESULT_ROWS {
                return Err(QueryDatabaseError::ResultTooLarge(format!(
                    "Query result size exceeds limit of {} rows",
                    MAX_QUERY_RESULT_ROWS
                )));
            }

            // Convert records to QueryResults
            let results: Vec<QueryResult> = query_response
                .records
                .into_iter()
                .map(|record| QueryResult { value: record })
                .collect();

            all_records.extend(results);

            if query_response.done || query_response.next_records_url.is_none() {
                break;
            }

            next_url = Some(
                query_response
                    .next_records_url
                    .ok_or_else(|| {
                        QueryDatabaseError::GenericError(anyhow!("No next records url found"))
                    })
                    .map(|url| format!("{}{}", self.instance_url, url))?,
            );
        }

        // For now, return an empty schema since Salesforce's schema is dynamic
        let schema = TableSchema::empty();

        Ok((all_records, schema))
    }

    async fn describe_sobject(&self, sobject: &str) -> Result<TableSchema, QueryDatabaseError> {
        let url = format!(
            "{}/services/data/v63.0/sobjects/{}/describe",
            self.instance_url, sobject
        );

        let response = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.access_token))
            .header("Content-Type", "application/json")
            .send()
            .await
            .map_err(|e| {
                QueryDatabaseError::GenericError(anyhow!("Error describing object: {}", e))
            })?;

        if !response.status().is_success() {
            let error_text = response.text().await.map_err(|e| {
                QueryDatabaseError::GenericError(anyhow!("Error getting response text: {}", e))
            })?;

            return Err(QueryDatabaseError::ExecutionError(format!(
                "Failed to describe object {}: {}",
                sobject, error_text
            )));
        }

        let response_text = response.text().await.map_err(|e| {
            QueryDatabaseError::GenericError(anyhow!("Error getting response text: {}", e))
        })?;

        let describe_result: Value = serde_json::from_str(&response_text).map_err(|e| {
            QueryDatabaseError::GenericError(anyhow!("Error parsing response: {}", e))
        })?;

        let fields = describe_result["fields"].as_array().ok_or_else(|| {
            QueryDatabaseError::GenericError(anyhow!("No fields found in schema"))
        })?;

        fn is_compound_field(field: &Value, sobject: &str) -> bool {
            field["compoundFieldName"].is_string()
            // "Name" as a compoundFieldName of itself is legacy behavior from the Salesforce API,
            // it is actually a compound field only if the sobject is Contact or Lead
            && (field["name"] != "Name"
                    || ["Contact", "Lead"].contains(&sobject))
        }

        // Compound fields are fields that contain other fields, they cannot be used in GROUP or WHERE
        // so we want to build a list of them to exclude them from the schema
        // We will do that by collecting their names when referenced by another field
        let compound_fields_names = fields
            .iter()
            .filter(|field| is_compound_field(field, sobject))
            .map(|field| {
                let compound_field_name = field["compoundFieldName"].as_str().ok_or_else(|| {
                    QueryDatabaseError::GenericError(anyhow!("`compoundFieldName` not found"))
                })?;

                Ok(compound_field_name.to_string())
            })
            .collect::<Result<HashSet<String>>>()?;

        let columns = fields
            .iter()
            .filter(|field| match field["name"].as_str() {
                Some(name) => !compound_fields_names.contains(name),
                None => false,
            })
            .map(|field| {
                let name = field["name"]
                    .as_str()
                    .ok_or_else(|| {
                        QueryDatabaseError::GenericError(anyhow!("Field `name` not found"))
                    })?
                    .to_string();

                let soap_type = field["soapType"].as_str().ok_or_else(|| {
                    QueryDatabaseError::GenericError(anyhow!("Field `soapType` not found"))
                })?;

                let value_type = match soap_type.to_lowercase().as_str() {
                    "tns:id" => TableSchemaFieldType::Text,
                    "xsd:string" => TableSchemaFieldType::Text,
                    "xsd:boolean" => TableSchemaFieldType::Bool,
                    "xsd:integer" | "xsd:int" => TableSchemaFieldType::Int,
                    "xsd:double" | "xsd:float" => TableSchemaFieldType::Float,
                    "xsd:date" | "xsd:datetime" | "xsd:time" => TableSchemaFieldType::DateTime,
                    _ => TableSchemaFieldType::Text,
                };

                let possible_values = field["picklistValues"]
                    .as_array()
                    .map(|values| {
                        values
                            .iter()
                            .map(|v| {
                                let obj = v.as_object().ok_or_else(|| {
                                    QueryDatabaseError::GenericError(anyhow!(
                                        "Expected picklist value to be an object"
                                    ))
                                })?;
                                let value = obj.get("value").ok_or_else(|| {
                                    QueryDatabaseError::GenericError(anyhow!(
                                        "Missing 'value' field in picklist value"
                                    ))
                                })?;
                                let str_value = value.as_str().ok_or_else(|| {
                                    QueryDatabaseError::GenericError(anyhow!(
                                        "Expected picklist value to be a string"
                                    ))
                                })?;
                                Ok(str_value.to_string())
                            })
                            .collect::<Result<Vec<String>>>()
                    })
                    .transpose()?;

                Ok(TableSchemaColumn {
                    name,
                    value_type,
                    possible_values: possible_values,
                })
            })
            .collect::<Result<Vec<_>>>()?;

        Ok(TableSchema::from_columns(columns))
    }
}

#[async_trait]
impl RemoteDatabase for SalesforceRemoteDatabase {
    fn dialect(&self) -> SqlDialect {
        SqlDialect::SalesforceSoql
    }

    async fn authorize_and_execute_query(
        &self,
        tables: &Vec<Table>,
        query: &str,
    ) -> Result<(Vec<QueryResult>, TableSchema), QueryDatabaseError> {
        let plans = self.get_query_plans(query).await?;

        let used_tables: HashSet<&str> = plans
            .iter()
            .map(|plan| plan.sobject_type.as_str())
            .collect();

        let allowed_tables: HashSet<String> = tables
            .iter()
            .map(|table| {
                let table_id = table.remote_database_table_id().ok_or_else(|| {
                    QueryDatabaseError::GenericError(anyhow!(
                        "Table has no remote database table id"
                    ))
                })?;
                Ok(table_id.to_lowercase())
            })
            .collect::<Result<HashSet<_>>>()?;

        let used_forbidden_tables = used_tables
            .into_iter()
            .filter(|table| !allowed_tables.contains(table.to_lowercase().as_str()))
            .collect::<Vec<_>>();

        if !used_forbidden_tables.is_empty() {
            Err(QueryDatabaseError::ExecutionError(format!(
                "Query uses tables that are not allowed: {}",
                used_forbidden_tables.join(", ")
            )))?
        }

        if let Err(e) = SalesforceRemoteDatabase::is_valid_soql_query(query) {
            return Err(QueryDatabaseError::ExecutionError(format!(
                "Invalid SOQL query: {}",
                e
            )));
        }

        self.execute_query(query).await
    }

    async fn get_tables_schema(&self, opaque_ids: &Vec<&str>) -> Result<Vec<TableSchema>> {
        let schemas = try_join_all(opaque_ids.iter().map(|opaque_id| async move {
            match self.describe_sobject(opaque_id).await {
                Ok(schema) => Ok(schema),
                Err(e) => Err(QueryDatabaseError::GenericError(anyhow!(
                    "Error describing object: {}",
                    e
                ))),
            }
        }))
        .await?;

        Ok(schemas)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_valid_soql_query() {
        // Valid queries
        assert!(
            SalesforceRemoteDatabase::is_valid_soql_query("SELECT Id, Name FROM Account").is_ok()
        );
        assert!(SalesforceRemoteDatabase::is_valid_soql_query(
            "SELECT Id, Name, Type FROM Account WHERE Name LIKE '%Test%'"
        )
        .is_ok());
        assert!(SalesforceRemoteDatabase::is_valid_soql_query(
            "SELECT Id FROM Contact ORDER BY LastName DESC LIMIT 100"
        )
        .is_ok());
        // Valid query with parentheses in WHERE clause
        assert!(SalesforceRemoteDatabase::is_valid_soql_query(
            "SELECT Id FROM Account WHERE (Name LIKE '%Test%' OR Type = 'Customer')"
        )
        .is_ok());
        // Valid query with 'SELECT' in string literal
        assert!(SalesforceRemoteDatabase::is_valid_soql_query(
            "SELECT Id FROM Account WHERE Description LIKE '%SELECT%'"
        )
        .is_ok());
        // Valid query with 'FROM' in string literal
        assert!(SalesforceRemoteDatabase::is_valid_soql_query(
            "SELECT Id FROM Account WHERE Description LIKE '%FROM%'"
        )
        .is_ok());

        // Test specific error types
        assert_eq!(
            SalesforceRemoteDatabase::is_valid_soql_query("UPDATE Account SET Name = 'Test'"),
            Err(SoqlValidationError::NotSelectQuery)
        );

        assert_eq!(
            SalesforceRemoteDatabase::is_valid_soql_query(
                "SELECT Id, Name, (SELECT Id FROM Contacts) FROM Account"
            ),
            Err(SoqlValidationError::ContainsSubselect)
        );

        assert_eq!(
            SalesforceRemoteDatabase::is_valid_soql_query("SELECT Id FROM Account, Contact"),
            Err(SoqlValidationError::MultipleFromTables)
        );

        assert_eq!(
            SalesforceRemoteDatabase::is_valid_soql_query("SELECT Id, Owner.Name FROM Account"),
            Err(SoqlValidationError::NestedFields)
        );
    }
}
