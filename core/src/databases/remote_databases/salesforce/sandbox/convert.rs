use super::error::SoqlError;
use super::structured_query::{
    AggregateFunction, Filter, GroupBy, GroupType, LogicalOperator, NullsPosition, OrderBy,
    OrderDirection, StructuredQuery, Validator, WhereClause,
};

pub fn convert_to_soql(query: &StructuredQuery) -> Result<String, SoqlError> {
    // Validate the query structure
    query.validate()?;

    // Build the SELECT clause
    let mut soql = String::from("SELECT ");

    // Add fields and/or aggregates
    let mut select_parts: Vec<String> = Vec::new();

    // For aggregate queries with GROUP BY, add the GROUP BY fields first
    // if !query.aggregates.is_empty() && query.group_by.is_some() {
    //     if let Some(GroupBy::Simple(fields)) = &query.group_by {
    //         select_parts.push(fields.join(", "));
    //     } else if let Some(GroupBy::Advanced { fields, .. }) = &query.group_by {
    //         select_parts.push(fields.join(", "));
    //     }
    // }

    // Special case for advanced grouping - always include the GROUP BY fields in the SELECT clause

    // Add regular fields
    if !query.fields.is_empty() {
        select_parts.push(query.fields.join(", "));
    }

    // Add parent fields if present
    if !query.parent_fields.is_empty() {
        let parent_fields: Vec<String> = query
            .parent_fields
            .iter()
            .flat_map(|parent| {
                parent
                    .fields
                    .iter()
                    .map(move |field| format!("{}.{}", parent.relationship, field))
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
                let function_str = format!("{}({})", agg.function.to_string(), agg.field);
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
            if !query.fields.contains(field)
                && !query
                    .aggregates
                    .iter()
                    .any(|agg| agg.field.as_str() == field)
            {
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
                let mut subquery = format!(
                    "(SELECT {} FROM {})",
                    rel.fields.join(", "),
                    rel.relationship_name
                );

                // Add WHERE clause if present
                if let Some(where_clause) = &rel.where_clause {
                    let where_str = build_where_clause(where_clause)?;
                    subquery.push_str(&format!(" {}", where_str));
                }

                // Add ORDER BY if present
                if !rel.order_by.is_empty() {
                    let order_by_str = build_order_by(&rel.order_by);
                    subquery.push_str(&format!(" {}", order_by_str));
                }

                // Add LIMIT if present
                if let Some(limit) = rel.limit {
                    subquery.push_str(&format!(" LIMIT {}", limit));
                }

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
                format!("GROUP BY {}({})", group_type.to_string(), fields.join(", "))
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
                    filter.function.to_string(),
                    filter.field,
                    filter.operator,
                    format_value(&filter.value)
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
            } => Ok(format!("{} {} {}", field, operator, format_value(value))),
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
            } => Ok(format!("{} {} {}", field, operator, format_value(value))),
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
            let mut order_str = order.field.clone();

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
fn format_value(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::Null => String::from("null"),
        serde_json::Value::Bool(b) => b.to_string(),
        serde_json::Value::Number(n) => n.to_string(),
        serde_json::Value::String(s) => format!("'{}'", s.replace('\'', "\\'")),
        serde_json::Value::Array(arr) => {
            let values: Vec<String> = arr.iter().map(format_value).collect();
            format!("({})", values.join(", "))
        }
        serde_json::Value::Object(_) => {
            // Objects are not supported in SOQL values
            String::from("null")
        }
    }
}

/// Trait for converting enum variants to strings.
trait ToString {
    fn to_string(&self) -> String;
}

impl ToString for AggregateFunction {
    fn to_string(&self) -> String {
        match self {
            AggregateFunction::Count => String::from("COUNT"),
            AggregateFunction::Sum => String::from("SUM"),
            AggregateFunction::Avg => String::from("AVG"),
            AggregateFunction::Min => String::from("MIN"),
            AggregateFunction::Max => String::from("MAX"),
        }
    }
}

impl ToString for GroupType {
    fn to_string(&self) -> String {
        match self {
            GroupType::Rollup => String::from("ROLLUP"),
            GroupType::Cube => String::from("CUBE"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
