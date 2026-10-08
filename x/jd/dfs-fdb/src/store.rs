pub use crate::objects::IoStats;
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
    Backend(foundationdb::FdbError),
    #[error(transparent)]
    Encoding(#[from] bincode::Error),
}

pub type Result<T> = std::result::Result<T, Error>;

impl From<foundationdb::FdbError> for Error {
    fn from(error: foundationdb::FdbError) -> Self {
        match error.code() {
            1007 | 1031 => Self::Deadline,
            _ => Self::Backend(error),
        }
    }
}

#[derive(Clone)]
pub struct Config {
    pub cluster_file: String,
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
    pub fn new(cluster_file: String, namespace: String) -> Self {
        Self {
            cluster_file,
            namespace,
            cache_bytes: 64 << 20,
            max_key_bytes: 4096,
            max_value_bytes: 1 << 20,
            max_batch_bytes: 4 << 20,
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
            || self.cluster_file.is_empty()
            || self.cluster_file.len() > 4096
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
            || self.max_batch_bytes > 4 << 20
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

pub type Rows = Vec<(Vec<u8>, Vec<u8>)>;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub enum Commit {
    Published { revision: u64 },
    Conflict,
}

pub use crate::txn_store::{PublicationBatch, Snapshot, Store};
