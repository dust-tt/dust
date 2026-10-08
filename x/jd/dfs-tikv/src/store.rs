pub use crate::objects::IoStats;
pub type Rows = Vec<(Vec<u8>, Vec<u8>)>;
use serde::Serialize;
use std::time::Duration;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("invalid {0}")]
    Invalid(&'static str),
    #[error("capacity exceeded: {0}")]
    Capacity(&'static str),
    #[error("corrupt storage: {0}")]
    Corrupt(&'static str),
    #[error("storage operation deadline")]
    Deadline,
    #[error("storage admission closed")]
    Closed,
    #[error("batch cannot commit after a failed edit")]
    FailedBatch,
    #[error("publication outcome is ambiguous: {0}")]
    Ambiguous(String),
    #[error(transparent)]
    Backend(Box<tikv_client::Error>),
    #[error(transparent)]
    Encoding(#[from] bincode::Error),
}

pub type Result<T> = std::result::Result<T, Error>;

impl From<tikv_client::Error> for Error {
    fn from(error: tikv_client::Error) -> Self {
        Self::Backend(Box::new(error))
    }
}

#[derive(Clone)]
pub struct Config {
    pub pd_endpoints: Vec<String>,
    pub namespace: String,
    pub cache_bytes: usize,
    pub max_key_bytes: usize,
    pub max_value_bytes: usize,
    pub max_batch_bytes: usize,
    pub max_mutations: usize,
    pub max_scan_items: usize,
    pub max_scan_bytes: usize,
    pub io_concurrency: usize,
    pub operation_timeout: Duration,
}

impl Config {
    pub fn new(pd_endpoints: Vec<String>, namespace: String) -> Self {
        Self {
            pd_endpoints,
            namespace,
            cache_bytes: 64 << 20,
            max_key_bytes: 4096,
            max_value_bytes: 1 << 20,
            max_batch_bytes: 32 << 20,
            max_mutations: 4096,
            max_scan_items: 4096,
            max_scan_bytes: 8 << 20,
            io_concurrency: 64,
            operation_timeout: Duration::from_secs(15),
        }
    }

    pub(crate) fn validate(&self) -> Result<()> {
        if self.namespace.is_empty()
            || self.namespace.len() > 128
            || !self
                .namespace
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
            || self.pd_endpoints.is_empty()
            || self.pd_endpoints.len() > 16
            || self
                .pd_endpoints
                .iter()
                .any(|endpoint| endpoint.is_empty() || endpoint.len() > 1024)
        {
            return Err(Error::Invalid("storage configuration"));
        }
        if self.io_concurrency == 0
            || self.io_concurrency > 4096
            || self.max_key_bytes == 0
            || self.max_key_bytes > 4096
            || self.max_value_bytes < self.max_key_bytes + 256
            || self.max_value_bytes > 1 << 20
            || self.max_mutations == 0
            || self.max_mutations > 4096
            || self.max_batch_bytes < self.max_value_bytes
            || self.max_batch_bytes > 64 << 20
            || self.max_scan_items == 0
            || self.max_scan_items > 4096
            || self.max_scan_bytes == 0
            || self.max_scan_bytes > 64 << 20
            || self.operation_timeout.is_zero()
            || self.operation_timeout > Duration::from_secs(60)
        {
            return Err(Error::Invalid("storage limits"));
        }
        Ok(())
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub enum Commit {
    Published { revision: u64 },
    Conflict,
}

pub use crate::txn_store::{PublicationBatch, Snapshot, Store};
