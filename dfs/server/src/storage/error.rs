use std::fmt;

use foundationdb::FdbBindingError;

#[derive(Debug)]
pub enum Error {
    Open(anyhow::Error),
    Transaction(FdbBindingError),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Open(error) => write!(f, "opening database: {error}"),
            Self::Transaction(error) => write!(f, "transaction failed: {error}"),
        }
    }
}

impl std::error::Error for Error {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Open(error) => Some(error.as_ref()),
            Self::Transaction(error) => Some(error),
        }
    }
}
