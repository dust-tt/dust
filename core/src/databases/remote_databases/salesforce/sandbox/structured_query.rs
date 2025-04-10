use super::error::SoqlError;
use lazy_static::lazy_static;
use regex::Regex;
use serde::{Deserialize, Serialize};

const MAX_DOT_NOTATION_TRAVERSAL_DEPTH: usize = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StructuredQuery {
    /// The main Salesforce object to query (required).
    pub object: String,

    /// Fields to retrieve (optional if aggregates are present).
    #[serde(default)]
    pub fields: Vec<FieldExpression>,

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

/// Represents a strongly-typed value for use in SOQL queries
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum TypedValue {
    /// A datetime value
    DateTime {
        #[serde(rename = "type")]
        value_type: DateTimeType,
        value: String,
    },
    /// A function call
    Function {
        #[serde(rename = "type")]
        value_type: FunctionType,
        function: String,
        arguments: Vec<String>,
    },
    /// A regular JSON value
    Regular(serde_json::Value),
}

/// Represents the type of a datetime value
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DateTimeType {
    /// A datetime value
    DateTime,
}

/// Represents the type of a function
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FunctionType {
    /// A function call
    Function,
}

/// Represents a field reference or function call in a SOQL query.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum FieldExpression {
    /// A simple field reference.
    Field(String),

    /// A function call.
    Function {
        function: String,
        arguments: Vec<String>,
    },
}

/// Represents a filter in a where clause.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Filter {
    /// A simple field comparison.
    Condition {
        /// The field to filter on.
        field: FieldExpression,

        /// The comparison operator.
        operator: String,

        /// The value to compare against.
        value: TypedValue,
    },

    /// A nested condition with its own logical operator and filters.
    NestedCondition(WhereClause),
}

/// Represents an order by clause in a SOQL query.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderBy {
    /// The field to sort by.
    pub field: FieldExpression,

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
    #[serde(rename = "relationshipName")]
    pub relationship_name: String,

    /// The fields to retrieve from the related object.
    pub fields: Vec<FieldExpression>,

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
    pub fields: Vec<FieldExpression>,
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
    pub value: TypedValue,
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

fn is_valid_iso8601_datetime(value: &str) -> bool {
    lazy_static! {
        static ref ISO8601_REGEX: Regex =
            Regex::new(r"^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$")
                .unwrap();
    }

    ISO8601_REGEX.is_match(value)
}

fn is_valid_date_literal(value: &str) -> bool {
    // Check for simple literals
    if matches!(
        value,
        "TODAY"
            | "YESTERDAY"
            | "TOMORROW"
            | "THIS_WEEK"
            | "LAST_WEEK"
            | "NEXT_WEEK"
            | "THIS_MONTH"
            | "LAST_MONTH"
            | "NEXT_MONTH"
            | "THIS_QUARTER"
            | "LAST_QUARTER"
            | "NEXT_QUARTER"
            | "THIS_YEAR"
            | "LAST_YEAR"
            | "NEXT_YEAR"
            | "LAST_90_DAYS"
            | "NEXT_90_DAYS"
    ) {
        return true;
    }

    // Check for parameterized literals with regex
    lazy_static! {
        static ref N_PATTERN: Regex =
            Regex::new(r"^(LAST|NEXT)_N_(DAYS|WEEKS|MONTHS|QUARTERS|YEARS):\d+$").unwrap();
        static ref FISCAL_PATTERN: Regex =
            Regex::new(r"^(THIS|LAST|NEXT)_FISCAL_(QUARTER|YEAR)$").unwrap();
        static ref FISCAL_N_PATTERN: Regex =
            Regex::new(r"^(LAST|NEXT)_N_FISCAL_(QUARTERS|YEARS):\d+$").unwrap();
    }

    N_PATTERN.is_match(value) || FISCAL_PATTERN.is_match(value) || FISCAL_N_PATTERN.is_match(value)
}

fn is_valid_function_name(function: &str) -> bool {
    matches!(
        function,
        // Date functions
        "DAY_ONLY" | "CALENDAR_MONTH" | "CALENDAR_QUARTER" | "CALENDAR_YEAR" |
        "DAY_IN_MONTH" | "DAY_IN_WEEK" | "DAY_IN_YEAR" |
        "FISCAL_MONTH" | "FISCAL_QUARTER" | "FISCAL_YEAR" |
        "HOUR_IN_DAY" | "WEEK_IN_MONTH" | "WEEK_IN_YEAR" |
        // Formatting functions
        "FORMAT" | "CONVERT_TIMEZONE" |
        // Math functions
        "ABS" | "CEILING" | "FLOOR" | "ROUND" |
        // Geolocation functions
        "DISTANCE" | "GEOLOCATION" |
        // Logical functions
        "CASE" | "NULLVALUE" | "ISBLANK" |
        // Other supported functions
        "CONVERTCURRENCY" | "TOLABEL"
    )
}

impl FieldExpression {
    pub fn format(&self) -> String {
        match self {
            FieldExpression::Field(field) => field.clone(),
            FieldExpression::Function {
                function,
                arguments,
            } => {
                format!("{}({})", function, arguments.join(", "))
            }
        }
    }
}

impl Validator for FieldExpression {
    fn validate(&self) -> Result<(), SoqlError> {
        match self {
            FieldExpression::Field(field) => {
                // Check that field is not empty
                if field.is_empty() {
                    return Err(SoqlError::field_validation_error(
                        "<empty>",
                        "Field name cannot be empty",
                    ));
                }

                // Validate field dot notation depth
                validate_max_depth(field, MAX_DOT_NOTATION_TRAVERSAL_DEPTH)?;

                Ok(())
            }
            FieldExpression::Function {
                function,
                arguments,
            } => {
                // Validate function name
                if !is_valid_function_name(function) {
                    return Err(SoqlError::field_validation_error(
                        &format!("{}()", function),
                        format!("Unsupported function: {}. Must be one of the supported Salesforce functions.", function),
                    ));
                }

                // Validate that function has arguments
                if arguments.is_empty() {
                    return Err(SoqlError::field_validation_error(
                        &format!("{}()", function),
                        format!("Function {} requires at least one argument", function),
                    ));
                }

                // Validate each argument
                for (i, arg) in arguments.iter().enumerate() {
                    if arg.is_empty() {
                        return Err(SoqlError::field_validation_error(
                            &format!("{}(...)", function),
                            format!(
                                "Argument {} for function {} cannot be empty",
                                i + 1,
                                function
                            ),
                        ));
                    }

                    // Check for nested function calls (not allowed)
                    if arg.contains('(') && arg.contains(')') {
                        return Err(SoqlError::field_validation_error(
                            arg,
                            "Nested function calls are not supported in SOQL queries".to_string(),
                        ));
                    }

                    // Check for dot notation in arguments
                    if arg.contains('.') {
                        validate_max_depth(arg, MAX_DOT_NOTATION_TRAVERSAL_DEPTH)?;
                    }
                }

                // Check specific argument requirements for different functions
                match function.as_str() {
                    // Date functions generally require exactly one date/datetime field
                    "DAY_ONLY" | "CALENDAR_MONTH" | "CALENDAR_QUARTER" | "CALENDAR_YEAR"
                    | "DAY_IN_MONTH" | "DAY_IN_WEEK" | "DAY_IN_YEAR" | "FISCAL_MONTH"
                    | "FISCAL_QUARTER" | "FISCAL_YEAR" | "HOUR_IN_DAY" | "WEEK_IN_MONTH"
                    | "WEEK_IN_YEAR" => {
                        if arguments.len() != 1 {
                            return Err(SoqlError::field_validation_error(
                                &format!("{}({})", function, arguments.join(", ")),
                                format!(
                                    "{} function requires exactly one date/datetime field argument",
                                    function
                                ),
                            ));
                        }
                    }
                    // Other functions have varying requirements, add specific validations as needed
                    _ => {}
                }

                Ok(())
            }
        }
    }
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

        // Validate field expressions
        for field in &self.fields {
            field.validate()?;
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

impl Validator for TypedValue {
    fn validate(&self) -> Result<(), SoqlError> {
        match self {
            TypedValue::DateTime { value, .. } => {
                // Check if it's a date literal first
                if is_valid_date_literal(value) {
                    return Ok(());
                }

                // Otherwise, validate as ISO 8601 datetime
                if !is_valid_iso8601_datetime(value) {
                    return Err(SoqlError::value_error(
                        "datetime",
                        format!("Invalid datetime format: {} - must be either a valid ISO 8601 date (YYYY-MM-DD[THH:MM:SSZ]) or a Salesforce date literal (TODAY, YESTERDAY, LAST_N_DAYS:n, etc.)", value),
                    ));
                }
                Ok(())
            }
            TypedValue::Function {
                function,
                arguments,
                ..
            } => {
                // Validate function name
                if !is_valid_function_name(function) {
                    return Err(SoqlError::value_error(
                        "function",
                        format!("Unsupported function: {}. Must be one of the supported Salesforce functions.", function),
                    ));
                }

                // Validate that the function has at least one argument
                if arguments.is_empty() {
                    return Err(SoqlError::value_error(
                        "function",
                        format!("Function {} requires at least one argument", function),
                    ));
                }

                // Check for nested function calls (not allowed)
                for arg in arguments {
                    if arg.contains('(') && arg.contains(')') {
                        return Err(SoqlError::value_error(
                            "function",
                            "Nested function calls are not supported in SOQL queries".to_string(),
                        ));
                    }

                    // Check for dot notation depth
                    if arg.contains('.') {
                        validate_max_depth(arg, MAX_DOT_NOTATION_TRAVERSAL_DEPTH)?;
                    }
                }

                // Check specific argument requirements for different functions
                match function.as_str() {
                    // Date functions generally require exactly one date/datetime field
                    "DAY_ONLY" | "CALENDAR_MONTH" | "CALENDAR_QUARTER" | "CALENDAR_YEAR"
                    | "DAY_IN_MONTH" | "DAY_IN_WEEK" | "DAY_IN_YEAR" | "FISCAL_MONTH"
                    | "FISCAL_QUARTER" | "FISCAL_YEAR" | "HOUR_IN_DAY" | "WEEK_IN_MONTH"
                    | "WEEK_IN_YEAR" => {
                        if arguments.len() != 1 {
                            return Err(SoqlError::value_error(
                                "function",
                                format!(
                                    "{} function requires exactly one date/datetime field argument",
                                    function
                                ),
                            ));
                        }
                    }
                    // Other functions have varying requirements, add specific validations as needed
                    _ => {}
                }

                Ok(())
            }
            TypedValue::Regular(_) => Ok(()),
        }
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
                    field.validate()?;

                    // Check for subqueries in field name if it's a field (not a function)
                    if let FieldExpression::Field(field_str) = field {
                        if field_str.contains("(SELECT") || field_str.contains("( SELECT") {
                            return Err(SoqlError::unsupported_feature(
                                "Subqueries in WHERE clause are not supported. Use parent-child relationships instead."
                            ));
                        }
                    }

                    // Validate value
                    value.validate()?;

                    let field_name = field.format();

                    // Get the underlying value for operator validation
                    let json_value = match value {
                        TypedValue::DateTime { value, .. } => {
                            serde_json::Value::String(value.clone())
                        }
                        TypedValue::Function { .. } => {
                            // Functions should be valid as values for most operators
                            serde_json::Value::String("FUNCTION".to_string())
                        }
                        TypedValue::Regular(val) => val.clone(),
                    };

                    // Validate operator and value combinations
                    match operator.to_uppercase().as_str() {
                        "IN" | "NOT IN" => {
                            if !matches!(json_value, serde_json::Value::Array(_))
                                && !matches!(value, TypedValue::Function { .. })
                            {
                                return Err(SoqlError::operator_error(
                                    &field_name,
                                    operator,
                                    "The IN and NOT IN operators require an array value or a function"
                                        .to_string(),
                                ));
                            }
                        }
                        "LIKE" | "NOT LIKE" => {
                            if !matches!(json_value, serde_json::Value::String(_))
                                && !matches!(value, TypedValue::Function { .. })
                            {
                                return Err(SoqlError::operator_error(
                                    &field_name,
                                    operator,
                                    "The LIKE and NOT LIKE operators require a string value or a function"
                                        .to_string(),
                                ));
                            }
                        }
                        "=" | "!=" | ">" | "<" | ">=" | "<=" => {
                            // These operators are generally valid with most value types
                        }
                        _ => {
                            return Err(SoqlError::operator_error(
                                &field_name,
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

        // Validate field expressions
        for field in &self.fields {
            field.validate()?;
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

        // Validate field expressions
        for field in &self.fields {
            field.validate()?;
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

            // Validate the typed value
            filter.value.validate()?;
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
    fn test_date_literals_validation() {
        // Test simple date literals
        let date_literals = vec![
            "TODAY",
            "YESTERDAY",
            "TOMORROW",
            "THIS_WEEK",
            "LAST_WEEK",
            "NEXT_WEEK",
            "THIS_MONTH",
            "LAST_MONTH",
            "NEXT_MONTH",
            "THIS_QUARTER",
            "LAST_QUARTER",
            "NEXT_QUARTER",
            "THIS_YEAR",
            "LAST_YEAR",
            "NEXT_YEAR",
            "LAST_90_DAYS",
            "NEXT_90_DAYS",
        ];

        for literal in date_literals {
            let value = TypedValue::DateTime {
                value_type: DateTimeType::DateTime,
                value: literal.to_string(),
            };

            assert!(
                value.validate().is_ok(),
                "Failed to validate date literal: {}",
                literal
            );
        }

        // Test parameterized date literals
        let parameterized_literals = vec![
            "LAST_N_DAYS:7",
            "NEXT_N_DAYS:30",
            "LAST_N_WEEKS:4",
            "NEXT_N_WEEKS:2",
            "LAST_N_MONTHS:3",
            "NEXT_N_MONTHS:6",
            "LAST_N_QUARTERS:2",
            "NEXT_N_QUARTERS:1",
            "LAST_N_YEARS:1",
            "NEXT_N_YEARS:5",
            "THIS_FISCAL_QUARTER",
            "LAST_FISCAL_QUARTER",
            "NEXT_FISCAL_QUARTER",
            "THIS_FISCAL_YEAR",
            "LAST_FISCAL_YEAR",
            "NEXT_FISCAL_YEAR",
            "LAST_N_FISCAL_QUARTERS:2",
            "NEXT_N_FISCAL_QUARTERS:3",
            "LAST_N_FISCAL_YEARS:1",
            "NEXT_N_FISCAL_YEARS:2",
        ];

        for literal in parameterized_literals {
            let value = TypedValue::DateTime {
                value_type: DateTimeType::DateTime,
                value: literal.to_string(),
            };

            assert!(
                value.validate().is_ok(),
                "Failed to validate parameterized date literal: {}",
                literal
            );
        }

        // Test invalid date literals
        let invalid_literals = vec![
            "INVALID_LITERAL",
            "LAST_DAYS",
            "TOMORROW_PLUS_1",
            "LAST_N_DAYS",       // Missing number
            "LAST_DAYS:7",       // Missing N
            "LAST_N_INVALID:10", // Invalid period
        ];

        for literal in invalid_literals {
            let value = TypedValue::DateTime {
                value_type: DateTimeType::DateTime,
                value: literal.to_string(),
            };

            assert!(
                value.validate().is_err(),
                "Should have failed for invalid date literal: {}",
                literal
            );
        }
    }

    #[test]
    fn test_validate_basic_query_success() {
        let query = StructuredQuery {
            object: "Account".to_string(),
            fields: vec![
                FieldExpression::Field("Id".to_string()),
                FieldExpression::Field("Name".to_string()),
            ],
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
            fields: vec![
                FieldExpression::Field("Id".to_string()),
                FieldExpression::Field("Name".to_string()),
            ],
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
            fields: vec![
                FieldExpression::Field("Id".to_string()),
                FieldExpression::Field("Owner.Manager.Name".to_string()),
            ],
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
            fields: vec![
                FieldExpression::Field("Id".to_string()),
                FieldExpression::Field("Name".to_string()),
            ],
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
                    value: TypedValue::Regular(serde_json::json!(10)),
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
            fields: vec![
                FieldExpression::Field("Id".to_string()),
                FieldExpression::Field("Name".to_string()),
            ],
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
                field: FieldExpression::Field("Name".to_string()),
                operator: "CONTAINS".to_string(),
                value: TypedValue::Regular(serde_json::json!("Test")),
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
                field: FieldExpression::Field("Email".to_string()),
                operator: "LIKE".to_string(),
                value: TypedValue::Regular(serde_json::json!(123)),
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
            fields: vec![
                FieldExpression::Field("Id".to_string()),
                FieldExpression::Field("Name".to_string()),
            ],
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
            fields: vec![
                FieldExpression::Field("Id".to_string()),
                FieldExpression::Field("Name".to_string()),
            ],
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

    #[test]
    fn test_nested_function_validation() {
        // Valid field expression without nesting
        let valid_expr = FieldExpression::Function {
            function: "DAY_ONLY".to_string(),
            arguments: vec!["Contact.CreatedDate".to_string()],
        };
        assert!(
            valid_expr.validate().is_ok(),
            "Valid function with dot notation should pass"
        );

        // Nested functions are not allowed
        let nested_function = FieldExpression::Function {
            function: "CALENDAR_MONTH".to_string(),
            arguments: vec!["DAY_ONLY(Contact.CreatedDate)".to_string()],
        };

        assert!(
            nested_function.validate().is_err(),
            "Nested functions should not be allowed"
        );

        // Invalid field expression with deep dot notation
        let invalid_expr = FieldExpression::Function {
            function: "DAY_ONLY".to_string(),
            arguments: vec!["Contact.Owner.Manager.Department".to_string()],
        };
        assert!(
            invalid_expr.validate().is_err(),
            "Deep dot notation should fail validation"
        );

        // Nested function with invalid depth should fail (nested function rule takes precedence)
        let nested_with_invalid_depth = FieldExpression::Function {
            function: "CALENDAR_MONTH".to_string(),
            arguments: vec!["FORMAT(Contact.Owner.Manager.Department)".to_string()],
        };

        let result = nested_with_invalid_depth.validate();
        assert!(result.is_err(), "Nested functions should not be allowed");
        if let Err(SoqlError::FieldValidationError { reason, .. }) = result {
            assert!(
                reason.contains("Nested function calls are not supported"),
                "Error message should mention that nested functions are not supported"
            );
        } else {
            panic!("Expected a field validation error about nested functions not being supported");
        }
    }
}
