//! Error types for the SOQL converter.

use std::fmt;
use thiserror::Error;

/// Errors that can occur during SOQL conversion.
#[derive(Error, Debug)]
pub enum SoqlError {
    #[error("Failed to parse JSON: {0}")]
    JsonParseError(#[from] serde_json::Error),

    #[error("Invalid query structure: {0}")]
    InvalidQueryStructure(String),

    #[error("Missing required field: {0}")]
    MissingRequiredField(String),

    #[error("Unsupported feature: {0}")]
    UnsupportedFeature(String),

    #[error("Query validation error: {0}")]
    ValidationError(String),

    #[error("Field validation error: {field} - {reason}")]
    FieldValidationError { field: String, reason: String },

    #[error("Relationship error: {relationship} - {reason}")]
    RelationshipError {
        relationship: String,
        reason: String,
    },

    #[error("Aggregation error: {0}")]
    AggregationError(String),

    #[error("Operator error: field '{field}' with operator '{operator}' - {reason}")]
    OperatorError {
        field: String,
        operator: String,
        reason: String,
    },

    #[error("Value error: {field} - {reason}")]
    ValueError { field: String, reason: String },

    #[error("Limit error: {0}")]
    LimitError(String),
}

impl SoqlError {
    pub fn invalid_query_structure(msg: impl fmt::Display) -> Self {
        Self::InvalidQueryStructure(msg.to_string())
    }

    pub fn missing_required_field(field: impl fmt::Display) -> Self {
        Self::MissingRequiredField(field.to_string())
    }

    pub fn unsupported_feature(feature: impl fmt::Display) -> Self {
        Self::UnsupportedFeature(feature.to_string())
    }

    pub fn validation_error(msg: impl fmt::Display) -> Self {
        Self::ValidationError(msg.to_string())
    }

    pub fn field_validation_error(field: impl fmt::Display, reason: impl fmt::Display) -> Self {
        Self::FieldValidationError {
            field: field.to_string(),
            reason: reason.to_string(),
        }
    }

    pub fn relationship_error(relationship: impl fmt::Display, reason: impl fmt::Display) -> Self {
        Self::RelationshipError {
            relationship: relationship.to_string(),
            reason: reason.to_string(),
        }
    }

    pub fn aggregation_error(msg: impl fmt::Display) -> Self {
        Self::AggregationError(msg.to_string())
    }

    pub fn operator_error(
        field: impl fmt::Display,
        operator: impl fmt::Display,
        reason: impl fmt::Display,
    ) -> Self {
        Self::OperatorError {
            field: field.to_string(),
            operator: operator.to_string(),
            reason: reason.to_string(),
        }
    }

    pub fn value_error(field: impl fmt::Display, reason: impl fmt::Display) -> Self {
        Self::ValueError {
            field: field.to_string(),
            reason: reason.to_string(),
        }
    }

    pub fn limit_error(msg: impl fmt::Display) -> Self {
        Self::LimitError(msg.to_string())
    }

    /// Returns user-friendly suggestions for fixing the error
    pub fn suggestions(&self) -> Vec<String> {
        match self {
            Self::JsonParseError(err) => {
                let mut suggestions = vec![
                    "Check your JSON syntax for missing commas, brackets, or quotes".to_string(),
                ];

                let line = err.line();
                suggestions.push(format!("Error occurs around line {}", line));

                suggestions
            }
            Self::MissingRequiredField(field) => {
                vec![
                    format!("Add the required '{}' field to your query", field),
                    "Required fields depend on context - refer to the documentation".to_string(),
                ]
            }
            Self::InvalidQueryStructure(msg) => {
                if msg.contains("Group by") && msg.contains("aggregates") {
                    vec![
                        "When using multiple aggregate functions, you need a GROUP BY clause"
                            .to_string(),
                        "Example: Add \"groupBy\": [\"AccountId\"] to your query".to_string(),
                    ]
                } else if msg.contains("fields") && msg.contains("aggregates") {
                    vec![
                        "Either fields or aggregates must be specified in the query".to_string(),
                        "Example: Add \"fields\": [\"Id\", \"Name\"] to your query".to_string(),
                    ]
                } else {
                    vec![format!("Fix the structure issue: {}", msg)]
                }
            }
            Self::UnsupportedFeature(feature) => {
                if feature.contains("dot-notation") {
                    vec![
                        "Dot notation for field traversal is limited to 1 level deep".to_string(),
                        "Example: 'Owner.Name' is allowed, but 'Owner.Manager.Name' is not"
                            .to_string(),
                        "Consider using separate queries or parent/child relationships instead"
                            .to_string(),
                    ]
                } else if feature.contains("subqueries") {
                    vec![
                        "Subqueries in WHERE clauses are not supported".to_string(),
                        "Use parent/child relationships or separate queries instead".to_string(),
                    ]
                } else {
                    vec![format!("This feature is not supported: {}", feature)]
                }
            }
            Self::FieldValidationError { field, reason } => {
                vec![
                    format!("Field '{}' validation failed: {}", field, reason),
                    "Check field spelling and ensure it exists in the Salesforce object"
                        .to_string(),
                ]
            }
            Self::RelationshipError {
                relationship,
                reason,
            } => {
                vec![
                    format!("Relationship '{}' error: {}", relationship, reason),
                    "Verify the relationship name is correct and available on the object"
                        .to_string(),
                    "Check for proper parent-child or child-parent relationship definition"
                        .to_string(),
                ]
            }
            Self::AggregationError(msg) => {
                vec![
                    format!("Aggregation error: {}", msg),
                    "Ensure your aggregate functions (COUNT, SUM, etc.) are properly defined"
                        .to_string(),
                    "When using aggregates, you may need to include a GROUP BY clause".to_string(),
                ]
            }
            Self::OperatorError {
                field,
                operator,
                reason,
            } => {
                vec![
                    format!(
                        "Operator '{}' is invalid for field '{}': {}",
                        operator, field, reason
                    ),
                    "Check that the operator is appropriate for the field type".to_string(),
                    "For example, LIKE is only valid for text fields, IN requires an array value"
                        .to_string(),
                ]
            }
            Self::ValueError { field, reason } => {
                vec![
                    format!("Value for field '{}' is invalid: {}", field, reason),
                    "Ensure the value type matches what is expected for this field".to_string(),
                ]
            }
            Self::LimitError(msg) => {
                vec![
                    format!("Limit error: {}", msg),
                    "Adjust your query limits to be within allowed values".to_string(),
                ]
            }
            Self::ValidationError(msg) => {
                vec![format!("Validation error: {}", msg)]
            }
        }
    }

    /// Get a user-friendly error message with suggestions
    pub fn user_friendly_message(&self) -> String {
        let mut message = format!("Error in SOQL query: {}", self);

        let suggestions = self.suggestions();
        if !suggestions.is_empty() {
            message.push_str("\n\nSuggestions:\n");
            for (i, suggestion) in suggestions.iter().enumerate() {
                message.push_str(&format!("{}. {}\n", i + 1, suggestion));
            }
        }

        message
    }
}
