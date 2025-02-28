use super::error::SoqlError;
use serde::{Deserialize, Serialize};

const MAX_DOT_NOTATION_TRAVERSAL_DEPTH: usize = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StructuredQuery {
    /// The main Salesforce object to query (required).
    pub object: String,

    /// Fields to retrieve (optional if aggregates are present).
    #[serde(default)]
    pub fields: Vec<String>,

    /// Aggregate functions (optional if fields are present).
    #[serde(default)]
    pub aggregates: Vec<Aggregate>,

    /// Filter conditions (optional).
    #[serde(rename = "where")]
    pub where_clause: Option<WhereClause>,

    /// Sorting criteria (optional).
    #[serde(default, rename = "orderBy")]
    pub order_by: Vec<OrderBy>,

    /// Result limit (optional).
    pub limit: Option<u32>,

    /// Result offset (optional).
    pub offset: Option<u32>,

    /// Parent-to-child relationships (optional).
    #[serde(default)]
    pub relationships: Vec<Relationship>,

    /// Child-to-parent relationships (optional).
    #[serde(default, rename = "parentFields")]
    pub parent_fields: Vec<ParentField>,

    /// Group by fields or structure (optional).
    #[serde(rename = "groupBy")]
    pub group_by: Option<GroupBy>,

    /// Having clause for filtering aggregates (optional).
    pub having: Option<HavingClause>,
}

/// Represents a where clause in a SOQL query.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhereClause {
    /// The logical condition for combining filters ("AND" or "OR").
    #[serde(default = "default_logical_operator")]
    pub condition: LogicalOperator,

    /// The list of filters to apply.
    pub filters: Vec<Filter>,
}

/// Default function for logical operator.
fn default_logical_operator() -> LogicalOperator {
    LogicalOperator::And
}

/// Represents a logical operator for combining filters.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum LogicalOperator {
    /// Logical AND operator.
    And,

    /// Logical OR operator.
    Or,
}

/// Represents a filter in a where clause.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Filter {
    /// A simple field comparison.
    Condition {
        /// The field to filter on.
        field: String,

        /// The comparison operator.
        operator: String,

        /// The value to compare against.
        value: serde_json::Value,
    },

    /// A nested condition with its own logical operator and filters.
    NestedCondition(WhereClause),
}

/// Represents an order by clause in a SOQL query.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderBy {
    /// The field to sort by.
    pub field: String,

    /// The sort direction (optional, defaults to "ASC").
    #[serde(default = "default_order_direction")]
    pub direction: OrderDirection,

    /// Whether to put nulls first or last (optional).
    pub nulls: Option<NullsPosition>,
}

/// Represents the sort direction in an order by clause.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum OrderDirection {
    /// Ascending order.
    Asc,

    /// Descending order.
    Desc,
}

/// Represents the position of nulls in an order by clause.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum NullsPosition {
    /// Nulls first.
    First,

    /// Nulls last.
    Last,
}

/// Represents a parent-to-child relationship in a SOQL query.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Relationship {
    /// The name of the relationship.
    pub relationship_name: String,

    /// The fields to retrieve from the related object.
    pub fields: Vec<String>,

    /// Filter conditions for the related object (optional).
    #[serde(rename = "where")]
    pub where_clause: Option<WhereClause>,

    /// Sorting criteria for the related object (optional).
    #[serde(default, rename = "orderBy")]
    pub order_by: Vec<OrderBy>,

    /// Result limit for the related object (optional).
    pub limit: Option<u32>,
}

/// Represents a child-to-parent relationship in a SOQL query.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParentField {
    /// The name of the relationship.
    pub relationship: String,

    /// The fields to retrieve from the parent object.
    pub fields: Vec<String>,
}

/// Represents an aggregate function in a SOQL query.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Aggregate {
    /// The aggregate function to apply.
    pub function: AggregateFunction,

    /// The field to aggregate.
    pub field: String,

    /// The alias for the aggregate result (optional).
    pub alias: String,
}

/// Represents an aggregate function.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum AggregateFunction {
    /// Count function.
    Count,

    /// Sum function.
    Sum,

    /// Average function.
    Avg,

    /// Minimum function.
    Min,

    /// Maximum function.
    Max,
}

/// Represents a group by clause in a SOQL query.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum GroupBy {
    /// A simple list of fields to group by.
    Simple(Vec<String>),

    /// An advanced grouping structure (ROLLUP or CUBE).
    Advanced {
        /// The type of advanced grouping.
        #[serde(rename = "type")]
        group_type: GroupType,

        /// The fields to group by.
        fields: Vec<String>,
    },
}

/// Represents the type of advanced grouping.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum GroupType {
    /// ROLLUP grouping.
    Rollup,

    /// CUBE grouping.
    Cube,
}

/// Represents a having clause in a SOQL query.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HavingClause {
    /// The logical condition for combining filters ("AND" or "OR").
    #[serde(default = "default_logical_operator")]
    pub condition: LogicalOperator,

    /// The list of aggregate filters to apply.
    pub filters: Vec<AggregateFilter>,
}

/// Represents a filter in a having clause.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AggregateFilter {
    /// The aggregate function to filter on.
    pub function: AggregateFunction,

    /// The field to aggregate.
    pub field: String,

    /// The comparison operator.
    pub operator: String,

    /// The value to compare against.
    pub value: serde_json::Value,
}

/// Default function for order direction.
fn default_order_direction() -> OrderDirection {
    OrderDirection::Asc
}

// Checks that a path (dot notation) does not traverse more than `MAX_DOT_NOTATION_TRAVERSAL_DEPTH` level deep.
fn validate_max_depth(path: &str, allowed_depth: usize) -> Result<(), SoqlError> {
    let dot_count = path.chars().filter(|c| *c == '.').count();
    if dot_count > allowed_depth {
        return Err(SoqlError::field_validation_error(
            path,
            format!(
                "Exceeds maximum dot notation depth of {} level(s)",
                allowed_depth
            ),
        ));
    }
    Ok(())
}

pub trait Validator {
    fn validate(&self) -> Result<(), SoqlError>;
}

impl Validator for StructuredQuery {
    fn validate(&self) -> Result<(), SoqlError> {
        // Non-empty primary object is required
        if self.object.is_empty() {
            return Err(SoqlError::missing_required_field("object"));
        }

        // Check that either fields or aggregates are present
        if self.fields.is_empty() && self.aggregates.is_empty() {
            return Err(SoqlError::invalid_query_structure(
                "Either fields or aggregates must be present. Add at least one field or aggregate function to your query."
            ));
        }

        // Validate field dot notation depth
        for field in &self.fields {
            if field.chars().filter(|c| *c == '.').count() > MAX_DOT_NOTATION_TRAVERSAL_DEPTH {
                return Err(SoqlError::field_validation_error(
                    field,
                    format!(
                        "Exceeds maximum dot notation depth of {} level(s)",
                        MAX_DOT_NOTATION_TRAVERSAL_DEPTH
                    ),
                ));
            }
        }

        // If multiple aggregates are present, check that group by is also present
        if self.aggregates.len() > 1 && self.group_by.is_none() {
            return Err(SoqlError::aggregation_error(
                "When using multiple aggregate functions (COUNT, SUM, etc.), a GROUP BY clause must be specified."
            ));
        }

        // If having is present, check that aggregates are also present
        if self.having.is_some() && self.aggregates.is_empty() {
            return Err(SoqlError::aggregation_error(
                "HAVING clause requires at least one aggregate function (COUNT, SUM, AVG, MIN, MAX) to be specified."
            ));
        }

        // If limit exceeds allowed values
        if let Some(limit) = self.limit {
            if limit > 2000 {
                return Err(SoqlError::limit_error(format!(
                    "LIMIT value {} exceeds the maximum allowed value of 2000",
                    limit
                )));
            }
        }

        // Validate where clause if present
        if let Some(where_clause) = &self.where_clause {
            where_clause.validate()?;
        }

        // Validate relationships
        for relationship in &self.relationships {
            relationship.validate()?;
        }

        // Validate parent fields
        for parent in &self.parent_fields {
            parent.validate()?;
        }

        // Validate group by if present
        if let Some(group_by) = &self.group_by {
            group_by.validate()?;
        }

        // Validate having clause if present
        if let Some(having) = &self.having {
            having.validate()?;
        }

        // Validate individual aggregates
        for aggregate in &self.aggregates {
            aggregate.validate()?;
        }

        Ok(())
    }
}

impl Validator for WhereClause {
    fn validate(&self) -> Result<(), SoqlError> {
        if self.filters.is_empty() {
            return Err(SoqlError::invalid_query_structure(
                "WHERE clause must contain at least one filter condition",
            ));
        }

        for filter in &self.filters {
            match filter {
                Filter::Condition {
                    field,
                    operator,
                    value,
                } => {
                    // Validate field path depth
                    validate_max_depth(field, MAX_DOT_NOTATION_TRAVERSAL_DEPTH)?;

                    // Check for subqueries in field name
                    if field.contains("(SELECT") || field.contains("( SELECT") {
                        return Err(SoqlError::unsupported_feature(
                            "Subqueries in WHERE clause are not supported. Use parent-child relationships instead."
                        ));
                    }

                    // Validate operator and value combinations
                    match operator.to_uppercase().as_str() {
                        "IN" | "NOT IN" => {
                            if !matches!(value, serde_json::Value::Array(_)) {
                                return Err(SoqlError::operator_error(
                                    field,
                                    operator,
                                    "The IN and NOT IN operators require an array value"
                                        .to_string(),
                                ));
                            }
                        }
                        "LIKE" | "NOT LIKE" => {
                            if !matches!(value, serde_json::Value::String(_)) {
                                return Err(SoqlError::operator_error(
                                    field,
                                    operator,
                                    "The LIKE and NOT LIKE operators require a string value"
                                        .to_string(),
                                ));
                            }
                        }
                        "=" | "!=" | ">" | "<" | ">=" | "<=" => {
                            // These operators are generally valid with most value types
                        }
                        _ => {
                            return Err(SoqlError::operator_error(
                                field,
                                operator,
                                format!("Unsupported operator '{}'", operator),
                            ));
                        }
                    }
                }
                Filter::NestedCondition(nested) => nested.validate()?,
            }
        }
        Ok(())
    }
}

impl Validator for Relationship {
    fn validate(&self) -> Result<(), SoqlError> {
        // Validate relationship name doesn't contain dots
        if self.relationship_name.contains('.') {
            return Err(SoqlError::relationship_error(
                &self.relationship_name,
                "Relationship name cannot contain dot notation - use a simple name".to_string(),
            ));
        }

        // Empty relationship name is invalid
        if self.relationship_name.is_empty() {
            return Err(SoqlError::relationship_error(
                "<empty>",
                "Relationship name cannot be empty".to_string(),
            ));
        }

        // Validate relationship fields
        if self.fields.is_empty() {
            return Err(SoqlError::relationship_error(
                &self.relationship_name,
                "At least one field must be specified in a relationship query".to_string(),
            ));
        }

        // Validate field dot notation depth
        for field in &self.fields {
            validate_max_depth(field, MAX_DOT_NOTATION_TRAVERSAL_DEPTH)?;
        }

        // Validate where clause if present
        if let Some(where_clause) = &self.where_clause {
            where_clause.validate()?;
        }

        Ok(())
    }
}

impl Validator for ParentField {
    fn validate(&self) -> Result<(), SoqlError> {
        // Validate relationship name doesn't contain dots
        if self.relationship.contains('.') {
            return Err(SoqlError::relationship_error(
                &self.relationship,
                "Parent relationship name cannot contain dot notation - use a simple name"
                    .to_string(),
            ));
        }

        // Empty relationship name is invalid
        if self.relationship.is_empty() {
            return Err(SoqlError::relationship_error(
                "<empty>",
                "Parent relationship name cannot be empty".to_string(),
            ));
        }

        // Validate parent fields
        if self.fields.is_empty() {
            return Err(SoqlError::relationship_error(
                &self.relationship,
                "At least one field must be specified in a parent field query".to_string(),
            ));
        }

        // Validate field dot notation depth
        for field in &self.fields {
            validate_max_depth(field, MAX_DOT_NOTATION_TRAVERSAL_DEPTH)?;
        }

        Ok(())
    }
}

impl Validator for GroupBy {
    fn validate(&self) -> Result<(), SoqlError> {
        match self {
            GroupBy::Simple(fields) => {
                if fields.is_empty() {
                    return Err(SoqlError::aggregation_error(
                        "GROUP BY clause must contain at least one field",
                    ));
                }

                for field in fields {
                    if field.is_empty() {
                        return Err(SoqlError::field_validation_error(
                            "<empty>",
                            "GROUP BY field cannot be empty",
                        ));
                    }

                    validate_max_depth(field, 1).map_err(|_| {
                        SoqlError::field_validation_error(
                            field,
                            "GROUP BY fields can only include one level of dot notation (e.g. 'Account.Name' is allowed, but 'Account.Owner.Name' is not)"
                        )
                    })?;
                }
            }
            GroupBy::Advanced { group_type, fields } => {
                if fields.is_empty() {
                    return Err(SoqlError::aggregation_error(format!(
                        "{} grouping requires at least one field",
                        group_type.as_str()
                    )));
                }

                for field in fields {
                    if field.is_empty() {
                        return Err(SoqlError::field_validation_error(
                            "<empty>",
                            format!("{} grouping field cannot be empty", group_type.as_str()),
                        ));
                    }

                    validate_max_depth(field, 1).map_err(|_| {
                        SoqlError::field_validation_error(
                            field,
                            format!(
                                "{} grouping fields can only include one level of dot notation",
                                group_type.as_str()
                            ),
                        )
                    })?;
                }
            }
        }
        Ok(())
    }
}

impl Validator for HavingClause {
    fn validate(&self) -> Result<(), SoqlError> {
        if self.filters.is_empty() {
            return Err(SoqlError::aggregation_error(
                "HAVING clause must contain at least one filter condition",
            ));
        }

        for filter in &self.filters {
            if filter.field.is_empty() {
                return Err(SoqlError::field_validation_error(
                    "<empty>",
                    "HAVING filter field cannot be empty",
                ));
            }

            validate_max_depth(&filter.field, 1).map_err(|_| {
                SoqlError::field_validation_error(
                    &filter.field,
                    "HAVING aggregate fields can only include one level of dot notation",
                )
            })?;
        }
        Ok(())
    }
}

impl Validator for Aggregate {
    fn validate(&self) -> Result<(), SoqlError> {
        if self.field.is_empty() {
            return Err(SoqlError::field_validation_error(
                "<empty>",
                format!(
                    "Field for {} aggregate function cannot be empty",
                    self.function.as_str()
                ),
            ));
        }

        if self.alias.is_empty() {
            return Err(SoqlError::field_validation_error(
                format!("{}({})", self.function.as_str(), self.field),
                "Aggregate function must have a non-empty alias",
            ));
        }

        validate_max_depth(&self.field, 1).map_err(|_| {
            SoqlError::field_validation_error(
                &self.field,
                format!(
                    "Fields in {} aggregate function can only include one level of dot notation",
                    self.function.as_str()
                ),
            )
        })?;

        Ok(())
    }
}

// Helper method to get string representation of AggregateFunction
impl AggregateFunction {
    pub fn as_str(&self) -> &'static str {
        match self {
            AggregateFunction::Count => "COUNT",
            AggregateFunction::Sum => "SUM",
            AggregateFunction::Avg => "AVG",
            AggregateFunction::Min => "MIN",
            AggregateFunction::Max => "MAX",
        }
    }
}

// Helper method to get string representation of GroupType
impl GroupType {
    pub fn as_str(&self) -> &'static str {
        match self {
            GroupType::Rollup => "ROLLUP",
            GroupType::Cube => "CUBE",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_basic_query_success() {
        let query = StructuredQuery {
            object: "Account".to_string(),
            fields: vec!["Id".to_string(), "Name".to_string()],
            aggregates: vec![],
            where_clause: None,
            order_by: vec![],
            limit: None,
            offset: None,
            relationships: vec![],
            parent_fields: vec![],
            group_by: None,
            having: None,
        };

        assert!(query.validate().is_ok());
    }

    #[test]
    fn test_validate_empty_object_fails() {
        let query = StructuredQuery {
            object: "".to_string(),
            fields: vec!["Id".to_string(), "Name".to_string()],
            aggregates: vec![],
            where_clause: None,
            order_by: vec![],
            limit: None,
            offset: None,
            relationships: vec![],
            parent_fields: vec![],
            group_by: None,
            having: None,
        };

        let result = query.validate();
        assert!(result.is_err());
        let error = result.unwrap_err();
        match error {
            SoqlError::MissingRequiredField(field) => {
                assert_eq!(field, "object");
            }
            _ => panic!("Expected MissingRequiredField error, got {:?}", error),
        }
    }

    #[test]
    fn test_validate_empty_fields_and_aggregates_fails() {
        let query = StructuredQuery {
            object: "Account".to_string(),
            fields: vec![],
            aggregates: vec![],
            where_clause: None,
            order_by: vec![],
            limit: None,
            offset: None,
            relationships: vec![],
            parent_fields: vec![],
            group_by: None,
            having: None,
        };

        let result = query.validate();
        assert!(result.is_err());
        let error = result.unwrap_err();
        match error {
            SoqlError::InvalidQueryStructure(_) => {
                // Success - error is of correct type
            }
            _ => panic!("Expected InvalidQueryStructure error, got {:?}", error),
        }
    }

    #[test]
    fn test_validate_excessive_dot_notation_depth_fails() {
        let query = StructuredQuery {
            object: "Account".to_string(),
            fields: vec!["Id".to_string(), "Owner.Manager.Name".to_string()],
            aggregates: vec![],
            where_clause: None,
            order_by: vec![],
            limit: None,
            offset: None,
            relationships: vec![],
            parent_fields: vec![],
            group_by: None,
            having: None,
        };

        let result = query.validate();
        assert!(result.is_err());
        let error = result.unwrap_err();
        match error {
            SoqlError::FieldValidationError { field, reason } => {
                assert_eq!(field, "Owner.Manager.Name");
                assert!(reason.contains("Exceeds maximum dot notation depth"));
            }
            _ => panic!("Expected FieldValidationError error, got {:?}", error),
        }
    }

    #[test]
    fn test_validate_multiple_aggregates_without_group_by_fails() {
        let query = StructuredQuery {
            object: "Opportunity".to_string(),
            fields: vec![],
            aggregates: vec![
                Aggregate {
                    function: AggregateFunction::Count,
                    field: "Id".to_string(),
                    alias: "CountId".to_string(),
                },
                Aggregate {
                    function: AggregateFunction::Sum,
                    field: "Amount".to_string(),
                    alias: "TotalAmount".to_string(),
                },
            ],
            where_clause: None,
            order_by: vec![],
            limit: None,
            offset: None,
            relationships: vec![],
            parent_fields: vec![],
            group_by: None,
            having: None,
        };

        let result = query.validate();
        assert!(result.is_err());
        let error = result.unwrap_err();
        match error {
            SoqlError::AggregationError(msg) => {
                assert!(msg.contains("GROUP BY clause must be specified"));
            }
            _ => panic!("Expected AggregationError error, got {:?}", error),
        }
    }

    #[test]
    fn test_validate_having_without_aggregates_fails() {
        let query = StructuredQuery {
            object: "Account".to_string(),
            fields: vec!["Id".to_string(), "Name".to_string()],
            aggregates: vec![],
            where_clause: None,
            order_by: vec![],
            limit: None,
            offset: None,
            relationships: vec![],
            parent_fields: vec![],
            group_by: None,
            having: Some(HavingClause {
                condition: LogicalOperator::And,
                filters: vec![AggregateFilter {
                    function: AggregateFunction::Count,
                    field: "Id".to_string(),
                    operator: ">".to_string(),
                    value: serde_json::json!(10),
                }],
            }),
        };

        let result = query.validate();
        assert!(result.is_err());
        let error = result.unwrap_err();
        match error {
            SoqlError::AggregationError(msg) => {
                assert!(msg.contains("HAVING clause requires at least one aggregate function"));
            }
            _ => panic!("Expected AggregationError error, got {:?}", error),
        }
    }

    #[test]
    fn test_validate_excessive_limit_fails() {
        let query = StructuredQuery {
            object: "Account".to_string(),
            fields: vec!["Id".to_string(), "Name".to_string()],
            aggregates: vec![],
            where_clause: None,
            order_by: vec![],
            limit: Some(3000),
            offset: None,
            relationships: vec![],
            parent_fields: vec![],
            group_by: None,
            having: None,
        };

        let result = query.validate();
        assert!(result.is_err());
        let error = result.unwrap_err();
        match error {
            SoqlError::LimitError(msg) => {
                assert!(msg.contains("exceeds the maximum allowed value of 2000"));
            }
            _ => panic!("Expected LimitError error, got {:?}", error),
        }
    }

    #[test]
    fn test_where_clause_validation_empty_filters_fails() {
        let where_clause = WhereClause {
            condition: LogicalOperator::And,
            filters: vec![],
        };

        let result = where_clause.validate();
        assert!(result.is_err());
        let error = result.unwrap_err();
        match error {
            SoqlError::InvalidQueryStructure(msg) => {
                assert!(msg.contains("WHERE clause must contain at least one filter"));
            }
            _ => panic!("Expected InvalidQueryStructure error, got {:?}", error),
        }
    }

    #[test]
    fn test_where_clause_validation_unsupported_operator_fails() {
        let where_clause = WhereClause {
            condition: LogicalOperator::And,
            filters: vec![Filter::Condition {
                field: "Name".to_string(),
                operator: "CONTAINS".to_string(),
                value: serde_json::json!("Test"),
            }],
        };

        let result = where_clause.validate();
        assert!(result.is_err());
        let error = result.unwrap_err();
        match error {
            SoqlError::OperatorError {
                field,
                operator,
                reason,
            } => {
                assert_eq!(field, "Name");
                assert_eq!(operator, "CONTAINS");
                assert!(reason.contains("Unsupported operator"));
            }
            _ => panic!("Expected OperatorError error, got {:?}", error),
        }
    }

    #[test]
    fn test_where_clause_validation_invalid_value_type_fails() {
        let where_clause = WhereClause {
            condition: LogicalOperator::And,
            filters: vec![Filter::Condition {
                field: "Email".to_string(),
                operator: "LIKE".to_string(),
                value: serde_json::json!(123),
            }],
        };

        let result = where_clause.validate();
        assert!(result.is_err());
        let error = result.unwrap_err();
        match error {
            SoqlError::OperatorError {
                field,
                operator,
                reason,
            } => {
                assert_eq!(field, "Email");
                assert_eq!(operator, "LIKE");
                assert!(reason.contains("require a string value"));
            }
            _ => panic!("Expected OperatorError error, got {:?}", error),
        }
    }

    #[test]
    fn test_relationship_validation_empty_name_fails() {
        let relationship = Relationship {
            relationship_name: "".to_string(),
            fields: vec!["Id".to_string(), "Name".to_string()],
            where_clause: None,
            order_by: vec![],
            limit: None,
        };

        let result = relationship.validate();
        assert!(result.is_err());
        let error = result.unwrap_err();
        match error {
            SoqlError::RelationshipError {
                relationship,
                reason,
            } => {
                assert_eq!(relationship, "<empty>");
                assert!(reason.contains("cannot be empty"));
            }
            _ => panic!("Expected RelationshipError error, got {:?}", error),
        }
    }

    #[test]
    fn test_parent_field_validation_dotted_relationship_fails() {
        let parent_field = ParentField {
            relationship: "Account.Owner".to_string(),
            fields: vec!["Id".to_string(), "Name".to_string()],
        };

        let result = parent_field.validate();
        assert!(result.is_err());
        let error = result.unwrap_err();
        match error {
            SoqlError::RelationshipError {
                relationship,
                reason,
            } => {
                assert_eq!(relationship, "Account.Owner");
                assert!(reason.contains("cannot contain dot notation"));
            }
            _ => panic!("Expected RelationshipError error, got {:?}", error),
        }
    }

    #[test]
    fn test_group_by_validation_empty_fields_fails() {
        let group_by = GroupBy::Simple(vec![]);

        let result = group_by.validate();
        assert!(result.is_err());
        let error = result.unwrap_err();
        match error {
            SoqlError::AggregationError(msg) => {
                assert!(msg.contains("GROUP BY clause must contain at least one field"));
            }
            _ => panic!("Expected AggregationError error, got {:?}", error),
        }
    }

    #[test]
    fn test_having_validation_empty_filters_fails() {
        let having = HavingClause {
            condition: LogicalOperator::And,
            filters: vec![],
        };

        let result = having.validate();
        assert!(result.is_err());
        let error = result.unwrap_err();
        match error {
            SoqlError::AggregationError(msg) => {
                assert!(msg.contains("HAVING clause must contain at least one filter"));
            }
            _ => panic!("Expected AggregationError error, got {:?}", error),
        }
    }

    #[test]
    fn test_aggregate_validation_empty_alias_fails() {
        let aggregate = Aggregate {
            function: AggregateFunction::Count,
            field: "Id".to_string(),
            alias: "".to_string(),
        };

        let result = aggregate.validate();
        assert!(result.is_err());
        let error = result.unwrap_err();
        match error {
            SoqlError::FieldValidationError { field, reason } => {
                assert!(field.contains("COUNT(Id)"));
                assert!(reason.contains("must have a non-empty alias"));
            }
            _ => panic!("Expected FieldValidationError error, got {:?}", error),
        }
    }
}
