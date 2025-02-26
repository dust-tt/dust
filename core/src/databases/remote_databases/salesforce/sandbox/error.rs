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
}
