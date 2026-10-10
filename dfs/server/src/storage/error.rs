use std::fmt;

use foundationdb::FdbBindingError;

/**
 * @cc [owner:spolu,label:architecture;error-handling] storage-resource-independence
 * Storage errors MUST carry resource failures generically without depending on concrete resource
 * error types.
 */
#[derive(Debug)]
pub enum Error<E> {
    Open(anyhow::Error),
    Transaction(FdbBindingError),
    Resource(E),
}

impl<E: fmt::Display> fmt::Display for Error<E> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Open(error) => write!(f, "opening database: {error}"),
            Self::Transaction(error) => write!(f, "transaction failed: {error}"),
            Self::Resource(error) => error.fmt(f),
        }
    }
}

impl<E: std::error::Error + 'static> std::error::Error for Error<E> {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Open(error) => Some(error.as_ref()),
            Self::Transaction(error) => Some(error),
            Self::Resource(error) => Some(error),
        }
    }
}

impl<E: std::error::Error + Send + Sync + 'static> From<Error<E>> for FdbBindingError {
    fn from(error: Error<E>) -> Self {
        match error {
            // The runner must see the original FDB error to decide whether to retry it.
            Error::Transaction(error) => error,
            // CustomError aborts the attempt without committing. Boxing preserves our concrete
            // error type so the caller can recover it after the runner returns.
            error => Self::CustomError(Box::new(error)),
        }
    }
}

impl<E: std::error::Error + Send + Sync + 'static> From<FdbBindingError> for Error<E> {
    fn from(error: FdbBindingError) -> Self {
        match error {
            FdbBindingError::CustomError(error) => match error.downcast::<Self>() {
                Ok(error) => *error,
                // Custom errors from the FDB binding or other callers remain storage failures.
                Err(error) => Self::Transaction(FdbBindingError::CustomError(error)),
            },
            error => Self::Transaction(error),
        }
    }
}
