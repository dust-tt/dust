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
    pub condition: LogicalOperator,

    /// The list of filters to apply.
    pub filters: Vec<Filter>,
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
        return Err(SoqlError::unsupported_feature(format!(
            "Dot-notation is not supported to traverse more than {} levels deep",
            allowed_depth
        )));
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
            Err(SoqlError::missing_required_field("object"))?;
        }
        // Check that either fields or aggregates are present
        if self.fields.is_empty() && self.aggregates.is_empty() {
            Err(SoqlError::invalid_query_structure(
                "Either fields or aggregates must be present",
            ))?;
        }
        // If multiple aggregates are present, check that group by is also present
        if self.aggregates.len() > 1 && self.group_by.is_none() {
            Err(SoqlError::invalid_query_structure(
                "Group by is required when multiple aggregates are present",
            ))?;
        }
        // If having is present, check that aggregates are also present
        if self.having.is_some() && self.aggregates.is_empty() {
            Err(SoqlError::invalid_query_structure(
                "Aggregates are required when having is present",
            ))?;
        }

        if let Some(where_clause) = &self.where_clause {
            where_clause.validate()?;
        }

        for relationship in &self.relationships {
            relationship.validate()?;
        }

        for parent in &self.parent_fields {
            parent.validate()?;
        }

        if let Some(group_by) = &self.group_by {
            group_by.validate()?;
        }

        if let Some(having) = &self.having {
            having.validate()?;
        }

        for aggregate in &self.aggregates {
            aggregate.validate()?;
        }

        Ok(())
    }
}

impl Validator for WhereClause {
    fn validate(&self) -> Result<(), SoqlError> {
        for filter in &self.filters {
            match filter {
                Filter::Condition { field, .. } => {
                    validate_max_depth(field, MAX_DOT_NOTATION_TRAVERSAL_DEPTH)?;
                    if field.contains("(SELECT") || field.contains("( SELECT") {
                        Err(SoqlError::unsupported_feature(
                            "Subqueries in WHERE clause are not supported",
                        ))?;
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
        validate_max_depth(&self.relationship_name, 0).map_err(|_| {
            SoqlError::unsupported_feature("Relationship name cannot contain dot notation")
        })?;
        for field in &self.fields {
            validate_max_depth(field, MAX_DOT_NOTATION_TRAVERSAL_DEPTH)?;
        }
        Ok(())
    }
}

impl Validator for ParentField {
    fn validate(&self) -> Result<(), SoqlError> {
        validate_max_depth(&self.relationship, 0).map_err(|_| {
            SoqlError::unsupported_feature("Relationship name cannot contain dot notation")
        })?;
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
                for field in fields {
                    validate_max_depth(field, 1)?;
                }
            }
            GroupBy::Advanced { fields, .. } => {
                for field in fields {
                    validate_max_depth(field, 1)?;
                }
            }
        }
        Ok(())
    }
}

impl Validator for HavingClause {
    fn validate(&self) -> Result<(), SoqlError> {
        for filter in &self.filters {
            validate_max_depth(&filter.field, 1)?;
        }
        Ok(())
    }
}

impl Validator for Aggregate {
    fn validate(&self) -> Result<(), SoqlError> {
        validate_max_depth(&self.field, 1)?;
        Ok(())
    }
}
