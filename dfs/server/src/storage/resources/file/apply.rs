use dfs_protocol::rpc::{Mutation, WriteOperation};
use foundationdb::Transaction;

use super::{Error, FileResource};
use crate::storage::{self, resources::session::SessionResource};

impl FileResource {
    pub async fn apply_write(
        _tx: &Transaction,
        _session: &SessionResource,
        _operation: WriteOperation,
    ) -> Result<Mutation, storage::Error<Error>> {
        Err(Error::UnsupportedOperation.into())
    }
}
