use std::{
    collections::{HashMap, HashSet},
    env,
};

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use futures::future::try_join_all;
use reqwest::Proxy;
use serde::Deserialize;
use serde_json::{Map, Value};
use tracing::error;

use crate::cache;

use crate::databases::remote_databases::salesforce::sandbox::{
    convert::convert_to_soql, extract::extract_objects,
};

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

use super::sandbox::structured_query::{StructuredQuery, Validator};

pub const MAX_QUERY_RESULT_ROWS: usize = 25_000;
pub const GET_SESSION_MAX_TRIES: usize = 3;
pub const REDIS_CACHE_TTL_SECONDS: u64 = 60 * 60; // 1 hour

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

impl SalesforceRemoteDatabase {
    /// Flatten a Salesforce record to convert nested objects like "Owner": {"Name": "value"}
    /// into flattened fields like "Owner.Name": "value"
    ///
    /// This function recursively processes nested objects to ensure that deeply nested
    /// structures (e.g., Account.Parent.Owner.Name) are properly flattened as well.
    fn flatten_record_with_prefix(&self, record: &mut Map<String, Value>, prefix: &str) {
        // Collect fields to modify to avoid borrowing issues
        let mut modifications = Vec::new();

        // Identify nested objects to flatten
        for (key, value) in record.iter() {
            // Skip the special attributes field from Salesforce
            if key == "attributes" {
                continue;
            }

            if let Some(obj) = value.as_object() {
                // This is a nested object that needs flattening
                modifications.push((key.clone(), obj.clone()));
            }
        }

        // Process the identified modifications
        for (key, obj) in modifications {
            // Remove the original nested object
            record.remove(&key);

            // Process each field in the nested object
            for (subkey, subvalue) in obj {
                if subkey == "attributes" {
                    continue;
                }

                // Create the flattened key name with proper prefix handling
                let flat_key = if prefix.is_empty() {
                    format!("{}.{}", key, subkey)
                } else {
                    format!("{}.{}.{}", prefix, key, subkey)
                };

                // Handle nested objects recursively
                if let Some(nested_obj) = subvalue.as_object() {
                    if nested_obj.keys().any(|k| k != "attributes") {
                        // Prepare nested object for recursion
                        let mut nested_map = nested_obj.clone();

                        // Create new prefix for recursion
                        let new_prefix = if prefix.is_empty() {
                            key.clone()
                        } else {
                            format!("{}.{}", prefix, key)
                        };

                        // Recursively flatten
                        self.flatten_record_with_prefix(&mut nested_map, &new_prefix);

                        // Add resulting flattened fields
                        for (nested_key, nested_value) in nested_map {
                            if nested_key != "attributes" {
                                record.insert(nested_key, nested_value);
                            }
                        }
                    }
                } else {
                    // Add the flattened field directly
                    record.insert(flat_key, subvalue);
                }
            }
        }
    }

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
                .map(|mut record| {
                    // Flatten nested objects
                    self.flatten_record_with_prefix(&mut record, "");
                    // Remove top-level attributes
                    record.remove("attributes");
                    QueryResult { value: record }
                })
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

    /// Describes a Salesforce object and returns its schema
    /// Fetches a Salesforce object's describe information
    /// Returns the raw JSON response which can be used for multiple purposes
    /// Uses Redis for caching if available, otherwise makes direct API calls
    async fn fetch_object_describe(&self, sobject: &str) -> Result<Value, QueryDatabaseError> {
        // Extract instance identifier from the instance URL
        // This helps namespace the cache keys by Salesforce instance
        let instance_id = self
            .instance_url
            .trim_start_matches("https://")
            .trim_start_matches("http://")
            .split('.')
            .next()
            .ok_or_else(|| {
                QueryDatabaseError::GenericError(anyhow!(
                    "Failed to extract instance ID from Salesforce instance URL: {}",
                    self.instance_url
                ))
            })?;

        // Create a cache key based on instance identifier and sobject name
        let cache_key = format!("salesforce:{}:object_describe:{}", instance_id, sobject);

        // Try to get the object description from the cache
        if let Ok(Some(cached_value)) = cache::get::<Value>(&cache_key).await {
            return Ok(cached_value);
        }

        // Cache miss or Redis unavailable; make the API call
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

        // Store the result in Redis
        if let Err(e) = cache::set(&cache_key, &describe_result, REDIS_CACHE_TTL_SECONDS).await {
            error!("Failed to cache object description in Redis: {}", e);
        }

        Ok(describe_result)
    }

    async fn describe_sobject(&self, sobject: &str) -> Result<TableSchema, QueryDatabaseError> {
        let describe_result = self.fetch_object_describe(sobject).await?;

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

    /// Fetches the relationships for a Salesforce object
    /// Returns a map of relationship names to target object types
    async fn get_object_relationships(
        &self,
        sobject: &str,
    ) -> Result<HashMap<String, String>, QueryDatabaseError> {
        let describe_result = self.fetch_object_describe(sobject).await?;

        // Extract child relationships (parent-to-child)
        let child_relationships = describe_result["childRelationships"]
            .as_array()
            .ok_or_else(|| {
                QueryDatabaseError::GenericError(anyhow!("No child relationships found in schema"))
            })?;

        let mut relationships = HashMap::new();

        // Add child relationship names and their corresponding object types
        for rel in child_relationships {
            if let (Some(rel_name), Some(child_obj)) = (
                rel["relationshipName"].as_str(),
                rel["childSObject"].as_str(),
            ) {
                // Only include relationships with names (some relationships are internal and have no name)
                if !rel_name.is_empty() {
                    relationships.insert(rel_name.to_string(), child_obj.to_string());
                }
            }
        }

        // Extract fields to find parent relationships (child-to-parent)
        let fields = describe_result["fields"].as_array().ok_or_else(|| {
            QueryDatabaseError::GenericError(anyhow!("No fields found in schema"))
        })?;

        for field in fields {
            // Look for reference fields
            if let Some(reference_to) = field["referenceTo"].as_array() {
                if !reference_to.is_empty() {
                    if let (Some(rel_name), Some(field_name)) =
                        (field["relationshipName"].as_str(), field["name"].as_str())
                    {
                        // For each reference target, add the relationship
                        for ref_obj in reference_to {
                            if let Some(ref_name) = ref_obj.as_str() {
                                if !rel_name.is_empty() {
                                    relationships
                                        .insert(rel_name.to_string(), ref_name.to_string());
                                }

                                // If this is a standard ID field (ends with 'Id'), also add the field name without 'Id'
                                if field_name.ends_with("Id") {
                                    let field_base = &field_name[..field_name.len() - 2]; // Remove 'Id'
                                    relationships
                                        .insert(field_base.to_string(), ref_name.to_string());
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(relationships)
    }

    /// Validates referenced objects against allowed tables, using Salesforce relationship info
    async fn validate_referenced_objects(
        &self,
        referenced_objects: &[String],
        allowed_tables: &HashSet<String>,
        primary_object: &str,
    ) -> Result<(), QueryDatabaseError> {
        // First, check if the objects are directly in the allowed tables list
        let mut allowed_objects = allowed_tables.clone();

        // RecordType should always be allowed
        allowed_objects.insert("RecordType".to_lowercase());

        // The primary object is always allowed
        allowed_objects.insert(primary_object.to_lowercase());

        // Check for objects that aren't directly allowed
        let mut unknown_objects: Vec<&String> = referenced_objects
            .iter()
            .filter(|obj| !allowed_objects.contains(&obj.to_lowercase()))
            .collect();

        if unknown_objects.is_empty() {
            return Ok(());
        }

        // For remaining unknown objects, check if they're relationships of allowed objects
        // Fetch relationships for all the allowed tables
        let mut all_relationships = HashMap::new();

        // Create a collection of tables we need to fetch
        let mut tables_to_fetch = Vec::new();

        // Add allowed tables
        for table in allowed_tables {
            tables_to_fetch.push(table.clone());
        }

        // Add primary object if not already in allowed tables
        if !allowed_tables.contains(&primary_object.to_lowercase()) {
            tables_to_fetch.push(primary_object.to_lowercase());
        }

        // Fetch relationships for all tables concurrently
        let relationship_results =
            futures::future::join_all(tables_to_fetch.iter().map(|table| async {
                let result = self.get_object_relationships(table).await;
                (table.clone(), result)
            }))
            .await;

        // Process results
        for (table, result) in relationship_results {
            match result {
                Ok(rel) => {
                    for (rel_name, target_obj) in rel {
                        all_relationships.insert(rel_name, target_obj);
                    }
                }
                Err(e) => {
                    // If we can't get relationships for a table, log but continue
                    error!("Failed to get relationships for {}: {}", table, e);
                }
            }
        }

        // Now filter unknown_objects again, removing those that are valid relationships
        unknown_objects = unknown_objects
            .into_iter()
            .filter(|obj| {
                // Check if it's a direct relationship name
                if all_relationships.contains_key(*obj) {
                    let target_obj = &all_relationships[*obj];
                    // The relationship is allowed if its target is an allowed table
                    return !allowed_tables.contains(&target_obj.to_lowercase());
                }

                // It's not a known relationship
                true
            })
            .collect();

        // If we still have unknown objects, they're not allowed
        if !unknown_objects.is_empty() {
            return Err(QueryDatabaseError::ExecutionError(format!(
                "Query uses tables/relationships that are not allowed: {}",
                unknown_objects
                    .iter()
                    .map(|s| s.as_str())
                    .collect::<Vec<_>>()
                    .join(", ")
            )));
        }

        Ok(())
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
        // Parse the JSON query
        let parsed_query = serde_json::from_str::<StructuredQuery>(query).map_err(|e| {
            QueryDatabaseError::ExecutionError(format!("Failed to parse JSON query: {}", e))
        })?;

        // Validate the structured query
        if let Err(e) = parsed_query.validate() {
            return Err(QueryDatabaseError::ExecutionError(format!(
                "Invalid structured query: {}",
                e
            )));
        }

        // Extract all objects referenced in the query
        let referenced_objects = extract_objects(&parsed_query);

        // Get the tables allowed in the query
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

        // Validate referenced objects against allowed tables using Salesforce metadata API
        // This will handle polymorphic relationships, plural forms, etc.
        if let Err(e) = self
            .validate_referenced_objects(&referenced_objects, &allowed_tables, &parsed_query.object)
            .await
        {
            return Err(e);
        }

        // Convert the structured query to SOQL
        let soql_query = convert_to_soql(&parsed_query).map_err(|e| {
            QueryDatabaseError::ExecutionError(format!(
                "Error converting JSON query to SOQL: {}",
                e
            ))
        })?;

        // Execute the SOQL query
        self.execute_query(&soql_query).await
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
