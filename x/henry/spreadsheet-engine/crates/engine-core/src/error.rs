use thiserror::Error;

/// Budget kind reported with `EngineError::BudgetExceeded`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum BudgetKind {
    Bytes,
    Cells,
    Memory,
}

/// Typed, stable error surface. Mirrors the TS `EngineError` union (see README · Errors and recovery):
/// the UI switches on `code()`, so codes must stay stable.
#[derive(Debug, Error)]
pub enum EngineError {
    #[error("unsupported format: {0}")]
    UnsupportedFormat(String),
    #[error("encrypted workbook")]
    Encrypted,
    #[error("corrupt file: {0}")]
    Corrupt(String),
    #[error("budget exceeded: {0:?}")]
    BudgetExceeded(BudgetKind),
    #[error("cancelled")]
    Cancelled,
    #[error("internal error: {0}")]
    Internal(String),
}

impl EngineError {
    /// Stable machine-readable code, crossing the WASM boundary verbatim.
    pub fn code(&self) -> &'static str {
        match self {
            EngineError::UnsupportedFormat(_) => "UNSUPPORTED_FORMAT",
            EngineError::Encrypted => "ENCRYPTED",
            EngineError::Corrupt(_) => "CORRUPT",
            EngineError::BudgetExceeded(_) => "BUDGET_EXCEEDED",
            EngineError::Cancelled => "CANCELLED",
            EngineError::Internal(_) => "INTERNAL",
        }
    }

    pub fn detail(&self) -> String {
        match self {
            EngineError::UnsupportedFormat(d)
            | EngineError::Corrupt(d)
            | EngineError::Internal(d) => d.clone(),
            EngineError::Encrypted => String::new(),
            EngineError::BudgetExceeded(kind) => match kind {
                BudgetKind::Bytes => "bytes".to_string(),
                BudgetKind::Cells => "cells".to_string(),
                BudgetKind::Memory => "memory".to_string(),
            },
            EngineError::Cancelled => String::new(),
        }
    }
}

pub type Result<T> = std::result::Result<T, EngineError>;
