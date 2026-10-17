use dfs_protocol::rpc::{Mutation, WriteOperation};
use foundationdb::{FdbBindingError, Transaction};

use super::{BLOCK_SIZE_BYTES, Error, FAMILY, FileResource};
use crate::storage::{
    self,
    resources::{keys::tenant_subspace, session::SessionResource},
};

impl FileResource {
    /**
     * @cc [owner:spolu,label:backend] file-resize-blocks
     * Callers MUST fetch and authorize the file in this transaction and persist its new size and
     * versions in the same transaction. Shrinking MUST trim the partial final block and clear all
     * later blocks, so extending later cannot reveal discarded data. Growing MUST allocate no
     * blocks. Partial blocks MUST be read with conflict tracking and validated before any writes.
     */
    pub(in crate::storage::resources) async fn resize_blocks(
        &self,
        tx: &Transaction,
        size: u64,
    ) -> Result<(), storage::Error<Error>> {
        if size >= self.object.size {
            return Ok(());
        }
        let index = size / BLOCK_SIZE_BYTES as u64;
        let retained_bytes = (size % BLOCK_SIZE_BYTES as u64) as usize;
        if retained_bytes > 0 {
            let key = self.block_key(index);
            if let Some(block) = tx.get(&key, false).await.map_err(FdbBindingError::from)? {
                if block.len() > BLOCK_SIZE_BYTES {
                    return Err(Error::InvalidBlock.into());
                }
                tx.set(&key, &block[..block.len().min(retained_bytes)]);
            }
        }
        let first_removed = if retained_bytes > 0 { index + 1 } else { index };
        let (_, end) = tenant_subspace(&self.object.tenant.tenant_id)
            .subspace(&(FAMILY, self.object.object_id.as_bytes().as_slice()))
            .range();
        tx.clear_range(&self.block_key(first_removed), &end);
        Ok(())
    }

    pub async fn apply_write(
        _tx: &Transaction,
        _session: &SessionResource,
        _operation: WriteOperation,
    ) -> Result<Mutation, storage::Error<Error>> {
        Err(Error::UnsupportedOperation.into())
    }
}
