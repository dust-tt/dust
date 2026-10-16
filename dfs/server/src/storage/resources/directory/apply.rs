use dfs_protocol::rpc::{CreateOperation, MoveOperation, Mutation, RemoveOperation};
use foundationdb::Transaction;

use super::{DirectoryResource, Error};
use crate::storage::{self, resources::session::SessionResource};

impl DirectoryResource {
    pub async fn apply_create(
        _tx: &Transaction,
        _session: &SessionResource,
        _operation: CreateOperation,
    ) -> Result<Mutation, storage::Error<Error>> {
        Err(Error::UnsupportedOperation.into())
    }

    pub async fn apply_move(
        _tx: &Transaction,
        _session: &SessionResource,
        _operation: MoveOperation,
    ) -> Result<Mutation, storage::Error<Error>> {
        Err(Error::UnsupportedOperation.into())
    }

    pub async fn apply_remove(
        _tx: &Transaction,
        _session: &SessionResource,
        _operation: RemoveOperation,
    ) -> Result<Mutation, storage::Error<Error>> {
        Err(Error::UnsupportedOperation.into())
    }
}
