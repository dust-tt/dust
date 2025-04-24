use serde::{Deserialize, Serialize};

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
        arguments: Vec<FunctionArgument>,
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

/// Represents a function argument in a SOQL query.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum FunctionArgument {
    /// A field expression (field reference or function call)
    Expression(FieldExpression),

    /// A literal value
    Literal(serde_json::Value),
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
        arguments: Vec<FunctionArgument>,
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

/// Default function for order direction.
fn default_order_direction() -> OrderDirection {
    OrderDirection::Asc
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
    pub field: FieldExpression,

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
    Simple(Vec<FieldExpression>),

    /// An advanced grouping structure (ROLLUP or CUBE).
    Advanced {
        /// The type of advanced grouping.
        #[serde(rename = "type")]
        group_type: GroupType,

        /// The fields to group by.
        fields: Vec<FieldExpression>,
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
