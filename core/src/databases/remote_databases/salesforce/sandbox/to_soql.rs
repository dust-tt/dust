use crate::databases::remote_databases::salesforce::sandbox::models::{
    NullsPosition, OrderDirection,
};

use super::models::{
    Aggregate, AggregateFunction, FieldExpression, Filter, FunctionArgument, GroupBy, GroupType,
    HavingClause, LogicalOperator, OrderBy, StructuredQuery, TypedValue, WhereClause,
};

pub trait ToSoql {
    fn to_soql(&self) -> String;
}

impl ToSoql for StructuredQuery {
    fn to_soql(&self) -> String {
        // Build the SELECT clause
        let mut soql = String::from("SELECT ");

        // Add fields and/or aggregates
        let mut select_parts: Vec<String> = Vec::new();

        // Add regular fields and function calls
        if !self.fields.is_empty() {
            select_parts.extend(self.fields.iter().map(|f| f.to_soql()));
        }

        // Add parent fields if present
        if !self.parent_fields.is_empty() {
            // Then, process the fields (which we know are now all FieldExpression::Field variants)
            let parent_fields: Vec<String> = self
                .parent_fields
                .iter()
                .flat_map(|parent| {
                    parent
                        .fields
                        .iter()
                        // Assuming that query is vaildated, so the field is not a function call.
                        .map(move |field| format!("{}.{}", parent.relationship, field.to_soql()))
                })
                .collect::<Vec<String>>();

            select_parts.push(parent_fields.join(", "));
        }

        // Add aggregate functions if present
        if !self.aggregates.is_empty() {
            let aggregate_strings: Vec<String> =
                self.aggregates.iter().map(|agg| agg.to_soql()).collect();

            select_parts.push(aggregate_strings.join(", "));
        }

        // Add GROUP BY fields if not referenced in the fields or aggregates
        let group_by_fields = match &self.group_by {
            Some(GroupBy::Simple(fields)) => Some(fields),
            Some(GroupBy::Advanced { fields, .. }) => Some(fields),
            None => None,
        };
        if let Some(fields) = group_by_fields {
            for field in fields {
                // If the field is not in the fields or in the aggregates, add it to the select parts
                let field_str = field.to_soql();
                if !select_parts.contains(&field_str) {
                    select_parts.push(field_str);
                }
            }
        }

        // Join all select parts
        if !select_parts.is_empty() {
            soql.push_str(&select_parts.join(", "));
        }

        if !self.relationships.is_empty() {
            if !self.fields.is_empty() || !self.aggregates.is_empty() {
                soql.push_str(", ");
            }

            let relationship_queries: Vec<String> = self
                .relationships
                .iter()
                .map(|rel| {
                    // Start the subquery but don't close the parenthesis yet
                    let formatted_fields = rel
                        .fields
                        .iter()
                        .map(|f| f.to_soql())
                        .collect::<Vec<_>>()
                        .join(", ");
                    let mut subquery = format!(
                        "(SELECT {} FROM {}",
                        formatted_fields, rel.relationship_name
                    );

                    // Add WHERE clause if present - inside the parentheses
                    if let Some(where_clause) = &rel.where_clause {
                        // let where_str = build_where_clause(where_clause)?;
                        subquery.push_str(&format!(" {}", where_clause.to_soql()));
                    }

                    // Add ORDER BY if present - inside the parentheses
                    if !rel.order_by.is_empty() {
                        subquery.push_str(&format!(" {}", rel.order_by.as_slice().to_soql()));
                    }

                    // Add LIMIT if present - inside the parentheses
                    if let Some(limit) = rel.limit {
                        subquery.push_str(&format!(" LIMIT {}", limit));
                    }

                    // Close the parenthesis after all clauses are added
                    subquery.push_str(")");

                    subquery
                })
                .collect::<Vec<String>>();

            soql.push_str(&relationship_queries.join(", "));
        }

        // Add FROM clause
        soql.push_str(&format!(" FROM {}", self.object));

        // Add WHERE clause if present
        if let Some(where_clause) = &self.where_clause {
            soql.push_str(&format!(" {}", where_clause.to_soql()));
        }

        // Add GROUP BY if present
        if let Some(group_by) = &self.group_by {
            let group_by_str = match group_by {
                GroupBy::Simple(fields) => {
                    format!(
                        "GROUP BY {}",
                        fields
                            .iter()
                            .map(|f| f.to_soql())
                            .collect::<Vec<_>>()
                            .join(", ")
                    )
                }
                GroupBy::Advanced { group_type, fields } => {
                    format!(
                        "GROUP BY {}({})",
                        group_type.to_soql(),
                        fields
                            .iter()
                            .map(|f| f.to_soql())
                            .collect::<Vec<_>>()
                            .join(", ")
                    )
                }
            };
            soql.push_str(&format!(" {}", group_by_str));
        }

        // Add HAVING if present
        if let Some(having) = &self.having {
            soql.push_str(&format!(" {}", having.to_soql()));
        }

        // Add ORDER BY if present
        if !self.order_by.is_empty() {
            soql.push_str(&format!(" {}", self.order_by.as_slice().to_soql()));
        }

        // Add LIMIT if present
        if let Some(limit) = self.limit {
            soql.push_str(&format!(" LIMIT {}", limit));
        }

        // Add OFFSET if present
        if let Some(offset) = self.offset {
            soql.push_str(&format!(" OFFSET {}", offset));
        }

        soql
    }
}

impl ToSoql for TypedValue {
    fn to_soql(&self) -> String {
        match self {
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
                let args_str = arguments
                    .iter()
                    .map(|arg| arg.to_soql())
                    .collect::<Vec<_>>()
                    .join(", ");

                format!("{}({})", function, args_str)
            }
            TypedValue::Regular(json_value) => format_json_value(json_value),
        }
    }
}

impl ToSoql for FunctionArgument {
    fn to_soql(&self) -> String {
        match self {
            FunctionArgument::Expression(expr) => expr.to_soql(),
            FunctionArgument::Literal(value) => format_json_value(value),
        }
    }
}

impl ToSoql for FieldExpression {
    fn to_soql(&self) -> String {
        match self {
            FieldExpression::Field(field) => field.clone(),
            FieldExpression::Function {
                function,
                arguments,
            } => {
                let args_str = arguments
                    .iter()
                    .map(|arg| arg.to_soql())
                    .collect::<Vec<_>>()
                    .join(", ");

                format!("{}({})", function, args_str)
            }
        }
    }
}

impl ToSoql for AggregateFunction {
    fn to_soql(&self) -> String {
        match self {
            AggregateFunction::Count => "COUNT".to_string(),
            AggregateFunction::Sum => "SUM".to_string(),
            AggregateFunction::Avg => "AVG".to_string(),
            AggregateFunction::Min => "MIN".to_string(),
            AggregateFunction::Max => "MAX".to_string(),
        }
    }
}

impl ToSoql for GroupType {
    fn to_soql(&self) -> String {
        match self {
            GroupType::Rollup => "ROLLUP".to_string(),
            GroupType::Cube => "CUBE".to_string(),
        }
    }
}

impl ToSoql for Aggregate {
    fn to_soql(&self) -> String {
        let function_str = format!("{}({})", self.function.to_soql(), self.field.to_soql());
        format!("{} {}", function_str, self.alias)
    }
}

impl ToSoql for LogicalOperator {
    fn to_soql(&self) -> String {
        match self {
            LogicalOperator::And => " AND ".to_string(),
            LogicalOperator::Or => " OR ".to_string(),
        }
    }
}
impl ToSoql for WhereClause {
    fn to_soql(&self) -> String {
        fn format_clause(filters: &[Filter], operator: String) -> String {
            let filter_strings = filters
                .iter()
                .map(|filter| match filter {
                    Filter::Condition {
                        field,
                        operator,
                        value,
                    } => format!("{} {} {}", field.to_soql(), operator, value.to_soql()),
                    Filter::NestedCondition(nested) => {
                        format!(
                            "({})",
                            format_clause(&nested.filters, nested.condition.to_soql())
                        )
                    }
                })
                .collect::<Vec<String>>();

            filter_strings.join(operator.as_str())
        }

        format!(
            "WHERE {}",
            format_clause(&self.filters, self.condition.to_soql())
        )
    }
}

impl ToSoql for &[OrderBy] {
    fn to_soql(&self) -> String {
        let order_strings: Vec<String> = self
            .iter()
            .map(|order| {
                let mut order_str = order.field.to_soql();

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
}

impl ToSoql for HavingClause {
    fn to_soql(&self) -> String {
        let having_filters: Vec<String> = self
            .filters
            .iter()
            .map(|filter| {
                format!(
                    "{}({}) {} {}",
                    filter.function.to_soql(),
                    filter.field,
                    filter.operator,
                    filter.value.to_soql()
                )
            })
            .collect();

        format!(
            "HAVING {}",
            having_filters
                .join(self.condition.to_soql().as_str())
                .to_string()
        )
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
            let escaped = s.replace('\'', "''");
            format!("'{}'", escaped)
        }
        serde_json::Value::Array(arr) => {
            let values: Vec<String> = arr.iter().map(|v| format_json_value(v)).collect();
            format!("({})", values.join(", "))
        }
        serde_json::Value::Object(_) => {
            // Objects are not supported in SOQL values
            String::from("NULL")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
        use crate::databases::remote_databases::salesforce::sandbox::models::{
            DateTimeType, TypedValue,
        };

        // Test datetime value (unquoted)
        let datetime_value = TypedValue::DateTime {
            value_type: DateTimeType::DateTime,
            value: "2023-01-01T00:00:00Z".to_string(),
        };
        assert_eq!(datetime_value.to_soql(), "2023-01-01T00:00:00Z");

        // Test regular string value (quoted)
        let string_value = TypedValue::Regular(serde_json::json!("hello"));
        assert_eq!(string_value.to_soql(), "'hello'");

        // Test regular number value
        let number_value = TypedValue::Regular(serde_json::json!(42));
        assert_eq!(number_value.to_soql(), "42");
    }
}
