use super::error::SoqlError;
use super::structured_query::{
    FieldExpression, Filter, GroupBy, LogicalOperator, NullsPosition, OrderBy, OrderDirection,
    StructuredQuery, TypedValue, Validator, WhereClause,
};

/// Convert a JSON query to a SOQL string with detailed error handling and suggestions
pub fn convert_json_to_soql(json_str: &str) -> Result<String, String> {
    // Parse the JSON into a structured query
    let parsed_query = serde_json::from_str::<StructuredQuery>(json_str).map_err(|e| {
        let err = SoqlError::JsonParseError(e);
        err.user_friendly_message()
    })?;

    // Convert the query to SOQL, providing detailed error messages if validation fails
    convert_to_soql(&parsed_query).map_err(|e| e.user_friendly_message())
}

/// Convert a structured query to a SOQL string (internal implementation)
pub fn convert_to_soql(query: &StructuredQuery) -> Result<String, SoqlError> {
    // Validate the query structure
    query.validate()?;

    // Build the SELECT clause
    let mut soql = String::from("SELECT ");

    // Add fields and/or aggregates
    let mut select_parts: Vec<String> = Vec::new();

    // Add regular fields and function calls
    if !query.fields.is_empty() {
        select_parts.extend(query.fields.iter().map(|f| f.format()));
    }

    // Add parent fields if present
    if !query.parent_fields.is_empty() {
        let parent_fields: Vec<String> = query
            .parent_fields
            .iter()
            .flat_map(|parent| {
                parent.fields.iter().map(move |field| {
                    // For simple fields, prefix with parent relationship
                    // For functions, include the relationship in the first argument
                    match field {
                        FieldExpression::Field(field_str) => {
                            format!("{}.{}", parent.relationship, field_str)
                        }
                        FieldExpression::Function {
                            function,
                            arguments,
                        } => {
                            // For functions on parent fields, we need to prefix the first argument
                            // with the parent relationship if it doesn't already have a relationship
                            let mut args = arguments.clone();
                            if let Some(first_arg) = args.first_mut() {
                                if !first_arg.contains('.') {
                                    *first_arg = format!("{}.{}", parent.relationship, first_arg);
                                }
                            }
                            format!("{}({})", function, args.join(", "))
                        }
                    }
                })
            })
            .collect();

        select_parts.push(parent_fields.join(", "));
    }

    // Add aggregate functions if present
    if !query.aggregates.is_empty() {
        let aggregate_strings: Vec<String> = query
            .aggregates
            .iter()
            .map(|agg| {
                let function_str = format!("{}({})", agg.function.as_str(), agg.field);
                format!("{} {}", function_str, agg.alias)
            })
            .collect();

        select_parts.push(aggregate_strings.join(", "));
    }

    // Add GROUP BY fields if not referenced in the fields or aggregates
    let group_by_fields = match &query.group_by {
        Some(GroupBy::Simple(fields)) => Some(fields),
        Some(GroupBy::Advanced { fields, .. }) => Some(fields),
        None => None,
    };
    if let Some(fields) = group_by_fields {
        for field in fields {
            // If the field is not in the fields or in the aggregates, add it to the select parts
            if !select_parts.contains(field) {
                select_parts.push(field.clone());
            }
        }
    }

    // Join all select parts
    if !select_parts.is_empty() {
        soql.push_str(&select_parts.join(", "));
    }

    // Add relationship subqueries if present
    // TODO(fontanierh): TBD if we actually want to keep this.
    if !query.relationships.is_empty() {
        if !query.fields.is_empty() || !query.aggregates.is_empty() {
            soql.push_str(", ");
        }

        let relationship_queries: Vec<String> = query
            .relationships
            .iter()
            .map(|rel| {
                // Start the subquery but don't close the parenthesis yet
                let formatted_fields = rel
                    .fields
                    .iter()
                    .map(|f| f.format())
                    .collect::<Vec<_>>()
                    .join(", ");
                let mut subquery = format!(
                    "(SELECT {} FROM {}",
                    formatted_fields, rel.relationship_name
                );

                // Add WHERE clause if present - inside the parentheses
                if let Some(where_clause) = &rel.where_clause {
                    let where_str = build_where_clause(where_clause)?;
                    subquery.push_str(&format!(" {}", where_str));
                }

                // Add ORDER BY if present - inside the parentheses
                if !rel.order_by.is_empty() {
                    let order_by_str = build_order_by(&rel.order_by);
                    subquery.push_str(&format!(" {}", order_by_str));
                }

                // Add LIMIT if present - inside the parentheses
                if let Some(limit) = rel.limit {
                    subquery.push_str(&format!(" LIMIT {}", limit));
                }

                // Close the parenthesis after all clauses are added
                subquery.push_str(")");

                Ok(subquery)
            })
            .collect::<Result<Vec<String>, SoqlError>>()?;

        soql.push_str(&relationship_queries.join(", "));
    }

    // Add FROM clause
    soql.push_str(&format!(" FROM {}", query.object));

    // Add WHERE clause if present
    if let Some(where_clause) = &query.where_clause {
        let where_str = build_where_clause(where_clause)?;
        soql.push_str(&format!(" {}", where_str));
    }

    // Add GROUP BY if present
    if let Some(group_by) = &query.group_by {
        let group_by_str = match group_by {
            GroupBy::Simple(fields) => {
                format!("GROUP BY {}", fields.join(", "))
            }
            GroupBy::Advanced { group_type, fields } => {
                format!("GROUP BY {}({})", group_type.as_str(), fields.join(", "))
            }
        };
        soql.push_str(&format!(" {}", group_by_str));
    }

    // Add HAVING if present
    if let Some(having) = &query.having {
        let having_filters: Vec<String> = having
            .filters
            .iter()
            .map(|filter| {
                format!(
                    "{}({}) {} {}",
                    filter.function.as_str(),
                    filter.field,
                    filter.operator,
                    format_typed_value(&filter.value)
                )
            })
            .collect();

        let having_str = match having.condition {
            LogicalOperator::And => having_filters.join(" AND "),
            LogicalOperator::Or => having_filters.join(" OR "),
        };

        soql.push_str(&format!(" HAVING {}", having_str));
    }

    // Add ORDER BY if present
    if !query.order_by.is_empty() {
        let order_by_str = build_order_by(&query.order_by);
        soql.push_str(&format!(" {}", order_by_str));
    }

    // Add LIMIT if present
    if let Some(limit) = query.limit {
        soql.push_str(&format!(" LIMIT {}", limit));
    }

    // Add OFFSET if present
    if let Some(offset) = query.offset {
        soql.push_str(&format!(" OFFSET {}", offset));
    }

    Ok(soql)
}

/// Builds a WHERE clause from a WhereClause struct.
fn build_where_clause(where_clause: &WhereClause) -> Result<String, SoqlError> {
    let mut where_str = String::from("WHERE ");

    let filter_strings: Vec<String> = where_clause
        .filters
        .iter()
        .map(|filter| match filter {
            Filter::Condition {
                field,
                operator,
                value,
            } => Ok(format!(
                "{} {} {}",
                field.format(),
                operator,
                format_typed_value(value)
            )),
            Filter::NestedCondition(nested) => {
                let nested_str = build_nested_condition(nested)?;
                Ok(format!("({})", nested_str))
            }
        })
        .collect::<Result<Vec<String>, SoqlError>>()?;

    if filter_strings.is_empty() {
        return Err(SoqlError::invalid_query_structure(
            "WHERE clause must have at least one filter",
        ));
    }

    match where_clause.condition {
        LogicalOperator::And => where_str.push_str(&filter_strings.join(" AND ")),
        LogicalOperator::Or => where_str.push_str(&filter_strings.join(" OR ")),
    }

    Ok(where_str)
}

/// Builds a nested condition for a WHERE clause.
fn build_nested_condition(where_clause: &WhereClause) -> Result<String, SoqlError> {
    let filter_strings: Vec<String> = where_clause
        .filters
        .iter()
        .map(|filter| match filter {
            Filter::Condition {
                field,
                operator,
                value,
            } => Ok(format!(
                "{} {} {}",
                field.format(),
                operator,
                format_typed_value(value)
            )),
            Filter::NestedCondition(nested) => {
                let nested_str = build_nested_condition(nested)?;
                Ok(format!("({})", nested_str))
            }
        })
        .collect::<Result<Vec<String>, SoqlError>>()?;

    if filter_strings.is_empty() {
        return Err(SoqlError::invalid_query_structure(
            "Nested condition must have at least one filter",
        ));
    }

    let condition_str = match where_clause.condition {
        LogicalOperator::And => filter_strings.join(" AND "),
        LogicalOperator::Or => filter_strings.join(" OR "),
    };

    Ok(condition_str)
}

/// Builds an ORDER BY clause from a vector of OrderBy structs.
fn build_order_by(order_by: &[OrderBy]) -> String {
    let order_strings: Vec<String> = order_by
        .iter()
        .map(|order| {
            let mut order_str = order.field.format();

            // Add direction
            match order.direction {
                OrderDirection::Asc => order_str.push_str(" ASC"),
                OrderDirection::Desc => order_str.push_str(" DESC"),
            }

            // Add NULLS position if present
            if let Some(nulls) = &order.nulls {
                match nulls {
                    NullsPosition::First => order_str.push_str(" NULLS FIRST"),
                    NullsPosition::Last => order_str.push_str(" NULLS LAST"),
                }
            }

            order_str
        })
        .collect();

    format!("ORDER BY {}", order_strings.join(", "))
}

/// Formats a value for use in a SOQL query.
fn format_typed_value(value: &TypedValue) -> String {
    match value {
        TypedValue::DateTime { value, .. } => {
            // For datetime objects, just return the value without quotes
            value.clone()
        }
        TypedValue::Function {
            function,
            arguments,
            ..
        } => {
            // Format function call: FUNCTION(arg1, arg2, ...)
            format!("{}({})", function, arguments.join(", "))
        }
        TypedValue::Regular(json_value) => format_json_value(json_value),
    }
}

/// Formats a JSON value for use in a SOQL query.
fn format_json_value(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::Null => String::from("NULL"),
        serde_json::Value::Bool(b) => b.to_string(),
        serde_json::Value::Number(n) => n.to_string(),
        serde_json::Value::String(s) => {
            // Escape special characters in string values
            // The main requirement is to escape single quotes by doubling them
            // per Salesforce documentation
            let escaped = s.replace('\'', "''");
            format!("'{}'", escaped)
        }
        serde_json::Value::Array(arr) => {
            let values: Vec<String> = arr.iter().map(format_json_value).collect();
            format!("({})", values.join(", "))
        }
        serde_json::Value::Object(_) => {
            // Objects are not supported in SOQL values
            // This could be improved to serialize simple objects or provide better errors
            String::from("NULL")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Test for function support in SOQL queries
    #[test]
    fn test_json_to_soql_with_functions() {
        let json = r#"{
            "object": "Account",
            "fields": [
                "Id", 
                "Name", 
                {"function": "DAY_ONLY", "arguments": ["CreatedDate"]},
                {"function": "CALENDAR_MONTH", "arguments": ["LastModifiedDate"]}
            ],
            "where": {
                "condition": "AND",
                "filters": [
                    {
                        "field": {"function": "DAY_ONLY", "arguments": ["CreatedDate"]},
                        "operator": "=",
                        "value": {"type": "datetime", "value": "2023-01-01"}
                    },
                    {
                        "field": "LastModifiedDate",
                        "operator": "=",
                        "value": {
                            "type": "function",
                            "function": "DAY_ONLY",
                            "arguments": ["CreatedDate"]
                        }
                    }
                ]
            }
        }"#;

        let query = serde_json::from_str::<StructuredQuery>(json).unwrap();
        let soql = convert_to_soql(&query).unwrap();
        assert_eq!(
            soql,
            "SELECT Id, Name, DAY_ONLY(CreatedDate), CALENDAR_MONTH(LastModifiedDate) FROM Account WHERE DAY_ONLY(CreatedDate) = 2023-01-01 AND LastModifiedDate = DAY_ONLY(CreatedDate)"
        );
    }

    // Test for the format_json_value function
    #[test]
    fn test_format_json_value_escaping() {
        // Test null value
        assert_eq!(format_json_value(&serde_json::Value::Null), "NULL");

        // Test boolean value
        assert_eq!(format_json_value(&serde_json::json!(true)), "true");
        assert_eq!(format_json_value(&serde_json::json!(false)), "false");

        // Test number value
        assert_eq!(format_json_value(&serde_json::json!(42)), "42");
        assert_eq!(format_json_value(&serde_json::json!(3.14)), "3.14");

        // Test string value with special characters
        assert_eq!(format_json_value(&serde_json::json!("hello")), "'hello'");
        assert_eq!(
            format_json_value(&serde_json::json!("O'Reilly")),
            "'O''Reilly'"
        ); // Single quotes are doubled
        assert_eq!(
            format_json_value(&serde_json::json!("Line1\nLine2")),
            "'Line1\nLine2'"
        ); // Newlines preserved

        // Test array value
        assert_eq!(
            format_json_value(&serde_json::json!(["a", "b", "c"])),
            "('a', 'b', 'c')"
        );

        // Test mixed array
        assert_eq!(
            format_json_value(&serde_json::json!(["a", 1, true, null])),
            "('a', 1, true, NULL)"
        );

        // Test object (not supported)
        assert_eq!(
            format_json_value(&serde_json::json!({"key": "value"})),
            "NULL"
        );
    }

    #[test]
    fn test_format_typed_value() {
        use crate::databases::remote_databases::salesforce::sandbox::structured_query::{
            DateTimeType, TypedValue,
        };

        // Test datetime value (unquoted)
        let datetime_value = TypedValue::DateTime {
            value_type: DateTimeType::DateTime,
            value: "2023-01-01T00:00:00Z".to_string(),
        };
        assert_eq!(format_typed_value(&datetime_value), "2023-01-01T00:00:00Z");

        // Test regular string value (quoted)
        let string_value = TypedValue::Regular(serde_json::json!("hello"));
        assert_eq!(format_typed_value(&string_value), "'hello'");

        // Test regular number value
        let number_value = TypedValue::Regular(serde_json::json!(42));
        assert_eq!(format_typed_value(&number_value), "42");
    }

    #[test]
    fn test_json_to_soql_basic_query() {
        let json = r#"{
            "object": "Account",
            "fields": ["Id", "Name", "Industry"],
            "where": {
                "condition": "AND",
                "filters": [
                    { "field": "Industry", "operator": "=", "value": "Technology" }
                ]
            },
            "limit": 10
        }"#;

        let query = serde_json::from_str::<StructuredQuery>(json).unwrap();
        let soql = convert_to_soql(&query).unwrap();
        assert_eq!(
            soql,
            "SELECT Id, Name, Industry FROM Account WHERE Industry = 'Technology' LIMIT 10"
        );
    }

    #[test]
    fn test_json_to_soql_all_aggregate_functions() {
        let json = r#"{
        "object": "Opportunity",
        "aggregates": [
                {
                    "function": "COUNT",
                    "field": "Id",
                    "alias": "CountId"
                },
                {
                    "function": "SUM",
                    "field": "Amount",
                    "alias": "TotalAmount"
                },
                {
                    "function": "AVG",
                    "field": "Amount",
                    "alias": "AvgAmount"
                },
                {
                    "function": "MIN",
                    "field": "Amount",
                    "alias": "MinAmount"
                },
                {
                    "function": "MAX",
                    "field": "Amount",
                    "alias": "MaxAmount"
                }
            ],
            "groupBy": ["StageName"]
        }"#;

        let query = serde_json::from_str::<StructuredQuery>(json).unwrap();
        let soql = convert_to_soql(&query).unwrap();
        assert_eq!(
            soql,
            "SELECT COUNT(Id) CountId, SUM(Amount) TotalAmount, AVG(Amount) AvgAmount, MIN(Amount) MinAmount, MAX(Amount) MaxAmount, StageName FROM Opportunity GROUP BY StageName"
        );
    }

    #[test]
    fn test_json_to_soql_group_by() {
        let json = r#"{
        "object": "Opportunity",
        "fields": ["StageName"],
        "aggregates": [
            {
                "function": "COUNT",
                "field": "Id",
                "alias": "CountId"
            }
        ],
        "groupBy": ["StageName"]
        }"#;

        let query = serde_json::from_str::<StructuredQuery>(json).unwrap();
        let soql = convert_to_soql(&query).unwrap();
        assert_eq!(
            soql,
            "SELECT StageName, COUNT(Id) CountId FROM Opportunity GROUP BY StageName"
        );
    }

    #[test]
    fn test_json_to_soql_dot_notation() {
        let json = r#"{
        "object": "Account",
        "fields": ["Id", "Name", "Owner.Department"]
        }"#;

        let query = serde_json::from_str::<StructuredQuery>(json).unwrap();
        let soql = convert_to_soql(&query).unwrap();
        assert_eq!(soql, "SELECT Id, Name, Owner.Department FROM Account");
    }

    #[test]
    fn test_json_to_soql_complex_where_clause() {
        let json = r#"{
            "object": "Contact",
            "fields": ["Id", "FirstName", "LastName", "Email"],
            "where": {
                "condition": "AND",
                "filters": [
                    { "field": "LastName", "operator": "!=", "value": null },
                    { 
                        "condition": "OR",
                        "filters": [
                            { "field": "Email", "operator": "LIKE", "value": "%@example.com" },
                            { "field": "Email", "operator": "LIKE", "value": "%@salesforce.com" }
                        ]
                    }
                ]
            }
        }"#;

        let query = serde_json::from_str::<StructuredQuery>(json).unwrap();
        let soql = convert_to_soql(&query).unwrap();
        assert_eq!(
            soql,
            "SELECT Id, FirstName, LastName, Email FROM Contact WHERE LastName != NULL AND (Email LIKE '%@example.com' OR Email LIKE '%@salesforce.com')"
        );
    }

    #[test]
    fn test_json_to_soql_order_by_complex() {
        let json = r#"{
            "object": "Opportunity",
            "fields": ["Id", "Name", "Amount", "CloseDate"],
            "orderBy": [
                { 
                    "field": "CloseDate", 
                    "direction": "DESC",
                    "nulls": "LAST"
                },
                { 
                    "field": "Amount", 
                    "direction": "DESC" 
                }
            ]
        }"#;

        let query = serde_json::from_str::<StructuredQuery>(json).unwrap();
        let soql = convert_to_soql(&query).unwrap();
        assert_eq!(
            soql,
            "SELECT Id, Name, Amount, CloseDate FROM Opportunity ORDER BY CloseDate DESC NULLS LAST, Amount DESC"
        );
    }

    #[test]
    fn test_json_to_soql_parent_fields() {
        let json = r#"{
            "object": "Contact",
            "fields": ["Id", "FirstName", "LastName"],
            "parentFields": [
                {
                    "relationship": "Account",
                    "fields": ["Name", "Industry", "AnnualRevenue"]
                }
            ]
        }"#;

        let query = serde_json::from_str::<StructuredQuery>(json).unwrap();
        let soql = convert_to_soql(&query).unwrap();
        assert_eq!(
            soql,
            "SELECT Id, FirstName, LastName, Account.Name, Account.Industry, Account.AnnualRevenue FROM Contact"
        );
    }

    #[test]
    fn test_json_to_soql_relationships() {
        let json = r#"{
            "object": "Account",
            "fields": ["Id", "Name"],
            "relationships": [
                {
                    "relationshipName": "Contacts",
                    "fields": ["Id", "FirstName", "LastName", "Email"],
                    "where": {
                        "condition": "AND",
                        "filters": [
                            { "field": "IsActive", "operator": "=", "value": true }
                        ]
                    },
                    "orderBy": [{ "field": "LastName", "direction": "ASC" }],
                    "limit": 5
                }
            ]
        }"#;

        let query = serde_json::from_str::<StructuredQuery>(json).unwrap();
        let soql = convert_to_soql(&query).unwrap();
        assert_eq!(
            soql,
            "SELECT Id, Name, (SELECT Id, FirstName, LastName, Email FROM Contacts WHERE IsActive = true ORDER BY LastName ASC LIMIT 5) FROM Account"
        );
    }

    #[test]
    fn test_json_to_soql_limit_offset() {
        let json = r#"{
            "object": "Lead",
            "fields": ["Id", "Name", "Company", "Status"],
            "where": {
                "condition": "AND",
                "filters": [
                    { "field": "Status", "operator": "=", "value": "Open" }
                ]
            },
            "limit": 100,
            "offset": 200
        }"#;

        let query = serde_json::from_str::<StructuredQuery>(json).unwrap();
        let soql = convert_to_soql(&query).unwrap();
        assert_eq!(
            soql,
            "SELECT Id, Name, Company, Status FROM Lead WHERE Status = 'Open' LIMIT 100 OFFSET 200"
        );
    }

    #[test]
    fn test_json_to_soql_having_clause() {
        let json = r#"{
            "object": "Opportunity",
            "fields": ["AccountId"],
            "aggregates": [
                {
                    "function": "SUM",
                    "field": "Amount",
                    "alias": "TotalAmount"
                }
            ],
            "groupBy": ["AccountId"],
            "having": {
                "condition": "AND",
                "filters": [
                    {
                        "function": "SUM",
                        "field": "Amount",
                        "operator": ">",
                        "value": 100000
                    }
                ]
            }
        }"#;

        let query = serde_json::from_str::<StructuredQuery>(json).unwrap();
        let soql = convert_to_soql(&query).unwrap();
        assert_eq!(
            soql,
            "SELECT AccountId, SUM(Amount) TotalAmount FROM Opportunity GROUP BY AccountId HAVING SUM(Amount) > 100000"
        );
    }

    #[test]
    fn test_json_to_soql_advanced_group_by() {
        let json = r#"{
            "object": "Opportunity",
            "fields": ["AccountId", "StageName"],
            "aggregates": [
                {
                    "function": "SUM",
                    "field": "Amount",
                    "alias": "TotalAmount"
                }
            ],
            "groupBy": {
                "type": "CUBE",
                "fields": ["AccountId", "StageName"]
            }
        }"#;

        let query = serde_json::from_str::<StructuredQuery>(json).unwrap();
        let soql = convert_to_soql(&query).unwrap();
        assert_eq!(
            soql,
            "SELECT AccountId, StageName, SUM(Amount) TotalAmount FROM Opportunity GROUP BY CUBE(AccountId, StageName)"
        );
    }

    #[test]
    fn test_json_to_soql_array_value_in_where() {
        let json = r#"{
            "object": "Contact",
            "fields": ["Id", "Name", "Email"],
            "where": {
                "condition": "AND",
                "filters": [
                    { "field": "AccountId", "operator": "IN", "value": [
                        "001xx000003DGT1AAO", "001xx000003DGT2AAO", "001xx000003DGT3AAO"
                    ]}
                ]
            }
        }"#;

        let query = serde_json::from_str::<StructuredQuery>(json).unwrap();
        let soql = convert_to_soql(&query).unwrap();
        assert_eq!(
            soql,
            "SELECT Id, Name, Email FROM Contact WHERE AccountId IN ('001xx000003DGT1AAO', '001xx000003DGT2AAO', '001xx000003DGT3AAO')"
        );
    }

    #[test]
    fn test_json_to_soql_not_in_operator() {
        let json = r#"{
            "object": "Lead",
            "fields": ["Id", "Name", "Status"],
            "where": {
                "condition": "AND",
                "filters": [
                    { "field": "Status", "operator": "NOT IN", "value": ["Closed", "Converted"] }
                ]
            }
        }"#;

        let query = serde_json::from_str::<StructuredQuery>(json).unwrap();
        let soql = convert_to_soql(&query).unwrap();
        assert_eq!(
            soql,
            "SELECT Id, Name, Status FROM Lead WHERE Status NOT IN ('Closed', 'Converted')"
        );
    }

    #[test]
    fn test_json_to_soql_like_operators() {
        let json = r#"{
            "object": "Contact",
            "fields": ["Id", "FirstName", "LastName", "Email", "Phone"],
            "where": {
                "condition": "AND",
                "filters": [
                    { "field": "Email", "operator": "LIKE", "value": "%@example.com" },
                    { "field": "FirstName", "operator": "LIKE", "value": "J%" },
                    { "field": "LastName", "operator": "LIKE", "value": "%son" },
                    { "field": "Phone", "operator": "LIKE", "value": "415-%" }
                ]
            }
        }"#;

        let query = serde_json::from_str::<StructuredQuery>(json).unwrap();
        let soql = convert_to_soql(&query).unwrap();
        assert_eq!(
            soql,
            "SELECT Id, FirstName, LastName, Email, Phone FROM Contact WHERE Email LIKE '%@example.com' AND FirstName LIKE 'J%' AND LastName LIKE '%son' AND Phone LIKE '415-%'"
        );
    }

    #[test]
    fn test_json_to_soql_not_like_operator() {
        let json = r#"{
            "object": "Lead",
            "fields": ["Id", "FirstName", "LastName", "Email"],
            "where": {
                "condition": "AND",
                "filters": [
                    { "field": "Email", "operator": "NOT LIKE", "value": "%@competitor.com" }
                ]
            }
        }"#;

        let query = serde_json::from_str::<StructuredQuery>(json).unwrap();
        let soql = convert_to_soql(&query).unwrap();
        assert_eq!(
            soql,
            "SELECT Id, FirstName, LastName, Email FROM Lead WHERE Email NOT LIKE '%@competitor.com'"
        );
    }

    #[test]
    fn test_json_to_soql_date_functions() {
        let json = r#"{
            "object": "Account",
            "fields": [
                "Id", 
                "Name", 
                {"function": "DAY_ONLY", "arguments": ["CreatedDate"]},
                {"function": "CALENDAR_MONTH", "arguments": ["LastModifiedDate"]}
            ],
            "where": {
                "condition": "AND",
                "filters": [
                    {
                        "field": {"function": "DAY_ONLY", "arguments": ["CreatedDate"]},
                        "operator": "=",
                        "value": "2023-01-01"
                    }
                ]
            }
        }"#;

        let query = serde_json::from_str::<StructuredQuery>(json).unwrap();
        let soql = convert_to_soql(&query).unwrap();
        assert_eq!(
            soql,
            "SELECT Id, Name, DAY_ONLY(CreatedDate), CALENDAR_MONTH(LastModifiedDate) FROM Account WHERE DAY_ONLY(CreatedDate) = '2023-01-01'"
        );
    }

    #[test]
    fn test_json_to_soql_function_as_value() {
        let json = r#"{
            "object": "Account",
            "fields": ["Id", "Name"],
            "where": {
                "condition": "AND", 
                "filters": [
                    {
                        "field": "LastModifiedDate",
                        "operator": ">",
                        "value": {
                            "type": "function",
                            "function": "DAY_ONLY",
                            "arguments": ["CreatedDate"]
                        }
                    }
                ]
            }
        }"#;

        let query = serde_json::from_str::<StructuredQuery>(json).unwrap();
        let soql = convert_to_soql(&query).unwrap();
        assert_eq!(
            soql,
            "SELECT Id, Name FROM Account WHERE LastModifiedDate > DAY_ONLY(CreatedDate)"
        );
    }

    #[test]
    fn test_json_to_soql_multiple_complex_features() {
        let json = r#"{
            "object": "Opportunity",
            "fields": ["AccountId", "StageName"],
            "aggregates": [
                { "function": "COUNT", "field": "Id", "alias": "OpportunityCount" },
                { "function": "SUM", "field": "Amount", "alias": "TotalAmount" }
            ],
            "where": {
                "condition": "AND",
                "filters": [
                    { "field": "CloseDate", "operator": ">", "value": "2023-01-01" },
                    { "field": "Amount", "operator": ">", "value": 0 }
                ]
            },
            "groupBy": ["AccountId", "StageName"],
            "having": {
                "condition": "AND",
                "filters": [
                    { "function": "SUM", "field": "Amount", "operator": ">", "value": 50000 }
                ]
            },
            "orderBy": [
                { "field": "SUM(Amount)", "direction": "DESC" }
            ],
            "limit": 50
        }"#;

        let query = serde_json::from_str::<StructuredQuery>(json).unwrap();
        let soql = convert_to_soql(&query).unwrap();
        assert_eq!(
            soql,
            "SELECT AccountId, StageName, COUNT(Id) OpportunityCount, SUM(Amount) TotalAmount FROM Opportunity WHERE CloseDate > '2023-01-01' AND Amount > 0 GROUP BY AccountId, StageName HAVING SUM(Amount) > 50000 ORDER BY SUM(Amount) DESC LIMIT 50"
        );
    }

    // Test only the JSON parsing error in convert.rs since this is specific to the conversion function
    #[test]
    fn test_error_handling_json_parse_error() {
        let invalid_json = r#"{
            "object": "Account",
            "fields": ["Id", "Name"
            "where": {
                "condition": "AND",
                "filters": []
            }
        }"#;

        let result = convert_json_to_soql(invalid_json);
        assert!(result.is_err());
        let error_message = result.unwrap_err();
        assert!(error_message.contains("Check your JSON syntax"));
    }

    #[test]
    fn test_json_to_soql_where_clause_without_condition() {
        let json = r#"{
            "object": "Contact",
            "fields": ["Id", "Name", "Title", "Phone", "Email", "Department", "MailingCity", "MailingState"],
            "where": {
                "filters": [
                    {"field": "AccountId", "operator": "=", "value": "001Qy00000ccRXcIAM"}
                ]
            }
        }"#;

        let query = serde_json::from_str::<StructuredQuery>(json).unwrap();
        let soql = convert_to_soql(&query).unwrap();
        assert_eq!(
            soql,
            "SELECT Id, Name, Title, Phone, Email, Department, MailingCity, MailingState FROM Contact WHERE AccountId = '001Qy00000ccRXcIAM'"
        );
    }

    #[test]
    fn test_json_to_soql_special_character_escaping() {
        let json = r#"{
            "object": "Contact", 
            "fields": ["Id", "Name"],
            "where": {
                "condition": "AND",
                "filters": [
                    {"field": "Description", "operator": "=", "value": "Value with 'single quotes'"},
                    {"field": "LastName", "operator": "=", "value": "O'Reilly"}
                ]
            }
        }"#;

        let query = serde_json::from_str::<StructuredQuery>(json).unwrap();
        let soql = convert_to_soql(&query).unwrap();
        assert_eq!(
            soql,
            "SELECT Id, Name FROM Contact WHERE Description = 'Value with ''single quotes''' AND LastName = 'O''Reilly'"
        );
    }

    #[test]
    fn test_json_to_soql_deeply_nested_logic() {
        let json = r#"{
            "object": "Account",
            "fields": ["Id", "Name"],
            "where": {
                "condition": "AND",
                "filters": [
                    {"field": "Type", "operator": "=", "value": "Customer"},
                    {
                        "condition": "OR",
                        "filters": [
                            {"field": "Industry", "operator": "=", "value": "Technology"},
                            {
                                "condition": "AND",
                                "filters": [
                                    {"field": "AnnualRevenue", "operator": ">", "value": 1000000},
                                    {"field": "NumberOfEmployees", "operator": ">", "value": 50}
                                ]
                            }
                        ]
                    }
                ]
            }
        }"#;

        let query = serde_json::from_str::<StructuredQuery>(json).unwrap();
        let soql = convert_to_soql(&query).unwrap();
        assert_eq!(
            soql,
            "SELECT Id, Name FROM Account WHERE Type = 'Customer' AND (Industry = 'Technology' OR (AnnualRevenue > 1000000 AND NumberOfEmployees > 50))"
        );
    }

    #[test]
    fn test_json_to_soql_date_time_handling() {
        let json = r#"{
            "object": "Opportunity",
            "fields": ["Id", "Name", "CloseDate"],
            "where": {
                "condition": "AND",
                "filters": [
                    {
                        "field": "CreatedDate", 
                        "operator": ">", 
                        "value": {
                            "type": "datetime",
                            "value": "2023-01-01T00:00:00Z"
                        }
                    },
                    {
                        "field": "CloseDate", 
                        "operator": "<", 
                        "value": {
                            "type": "datetime",
                            "value": "2023-12-31"
                        }
                    }
                ]
            }
        }"#;

        let query = serde_json::from_str::<StructuredQuery>(json).unwrap();
        let soql = convert_to_soql(&query).unwrap();
        assert_eq!(
            soql,
            "SELECT Id, Name, CloseDate FROM Opportunity WHERE CreatedDate > 2023-01-01T00:00:00Z AND CloseDate < 2023-12-31"
        );
    }

    #[test]
    fn test_invalid_datetime_format() {
        let json = r#"{
            "object": "Opportunity",
            "fields": ["Id", "Name"],
            "where": {
                "condition": "AND",
                "filters": [
                    {
                        "field": "CreatedDate", 
                        "operator": ">", 
                        "value": {
                            "type": "datetime",
                            "value": "01/01/2023"
                        }
                    }
                ]
            }
        }"#;

        let query = serde_json::from_str::<StructuredQuery>(json).unwrap();
        let result = convert_to_soql(&query);
        assert!(result.is_err());
    }

    #[test]
    fn test_json_to_soql_multiple_relationship_queries() {
        let json = r#"{
            "object": "Account",
            "fields": ["Id", "Name"],
            "relationships": [
                {
                    "relationshipName": "Contacts",
                    "fields": ["Id", "Name"],
                    "limit": 5
                },
                {
                    "relationshipName": "Opportunities",
                    "fields": ["Id", "Name", "Amount"],
                    "where": {
                        "condition": "AND",
                        "filters": [
                            {"field": "StageName", "operator": "!=", "value": "Closed Lost"}
                        ]
                    },
                    "limit": 3
                }
            ]
        }"#;

        let query = serde_json::from_str::<StructuredQuery>(json).unwrap();
        let soql = convert_to_soql(&query).unwrap();
        assert_eq!(
            soql,
            "SELECT Id, Name, (SELECT Id, Name FROM Contacts LIMIT 5), (SELECT Id, Name, Amount FROM Opportunities WHERE StageName != 'Closed Lost' LIMIT 3) FROM Account"
        );
    }
}
