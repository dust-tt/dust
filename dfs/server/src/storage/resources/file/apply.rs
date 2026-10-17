use dfs_protocol::rpc::{Mutation, WriteOperation};
use foundationdb::{FdbBindingError, Transaction};
use futures::future::try_join_all;

use super::{BLOCK_SIZE_BYTES, Error, FAMILY, FileResource};
use crate::{
    clock,
    storage::{
        self,
        resources::{
            keys::tenant_subspace,
            object::{self, ObjectResource},
            session::SessionResource,
        },
    },
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

    /**
     * @cc [owner:spolu,label:backend;security] file-apply-write-authorization
     * Write MUST evaluate modes in the caller's transaction and reuse the fetched object. Missing
     * objects MUST return Object(NotFound); missing read or write MUST return Object(Forbidden)
     * before inspecting kind or range. Authorized directories MUST return IsDirectory. Validation
     * and required block reads MUST finish before staging writes. FDB failures MUST remain retryable.
     */
    /**
     * @cc [owner:spolu,label:backend] file-apply-write-content
     * Append MUST ignore the supplied offset and use the current transactional EOF, including
     * earlier operations. An overflowing end offset MUST return InvalidRange. Writes MUST preserve
     * bytes outside their range and zero-fill sparse gaps. Preserved boundary bytes MUST be clipped
     * to the old logical EOF.
     * Reads needed to preserve boundary bytes MUST track conflicts and reject blocks over 64 KiB.
     * Fully overwritten blocks MUST NOT be read. Stored blocks MUST fit within 64 KiB.
     */
    /**
     * @cc [owner:spolu,label:backend] file-apply-write-attributes
     * Every successful Write, including empty or identical data, MUST advance attr_version and
     * content_version once and set mtime and ctime. Nonempty writes MUST extend size when needed;
     * empty writes MUST leave size unchanged. Atime, metadata, grants, and parent attributes MUST
     * remain unchanged. The result MUST contain immediate file attributes without metadata and no
     * related attributes. Content and attributes MUST change atomically.
     */
    pub async fn apply_write(
        tx: &Transaction,
        session: &SessionResource,
        operation: WriteOperation,
    ) -> Result<Mutation, storage::Error<Error>> {
        // Check permissions using the same object fetched during authorization.
        let (object, mode) = ObjectResource::modes_for_session(tx, session, &[operation.object_id])
            .await?
            .pop()
            .flatten()
            .ok_or(Error::Object(object::Error::NotFound))?;
        if !mode.can_read() || !mode.can_write() {
            return Err(Error::Object(object::Error::Forbidden).into());
        }
        let mut file = Self::try_from(object)?;
        let offset = if operation.append {
            file.object.size
        } else {
            operation.offset
        };
        let end = offset
            .checked_add(operation.data.len() as u64)
            .ok_or(Error::InvalidRange)?;

        // Prepare every block before writing: a malformed boundary block must leave no changes.
        let blocks = if operation.data.is_empty() {
            vec![]
        } else {
            let first = offset / BLOCK_SIZE_BYTES as u64;
            let last = (end - 1) / BLOCK_SIZE_BYTES as u64;
            try_join_all((first..=last).map(|index| {
                let file = &file;
                let data = &operation.data;
                async move {
                    let key = file.block_key(index);
                    let start = index * BLOCK_SIZE_BYTES as u64;
                    let block_offset = offset.saturating_sub(start) as usize;
                    let data_offset = start.saturating_sub(offset) as usize;
                    let copied = (BLOCK_SIZE_BYTES - block_offset).min(data.len() - data_offset);
                    let mut block = vec![];
                    // Only partial boundary blocks can contain bytes that need preserving.
                    if copied < BLOCK_SIZE_BYTES
                        && start < file.object.size
                        && let Some(stored) =
                            tx.get(&key, false).await.map_err(FdbBindingError::from)?
                    {
                        if stored.len() > BLOCK_SIZE_BYTES {
                            return Err(storage::Error::Resource(Error::InvalidBlock));
                        }
                        block = stored.to_vec();
                        block.truncate(
                            (file.object.size - start).min(BLOCK_SIZE_BYTES as u64) as usize
                        );
                    }
                    block.resize(block.len().max(block_offset + copied), 0);
                    block[block_offset..block_offset + copied]
                        .copy_from_slice(&data[data_offset..data_offset + copied]);
                    Ok((key, block))
                }
            }))
            .await?
        };
        let now_ms =
            clock::now_ms().map_err(|_| Error::Object(object::Error::TimestampGeneration))?;

        // Publish the prepared content and its attributes together.
        for (key, block) in blocks {
            tx.set(&key, &block);
        }
        if !operation.data.is_empty() {
            file.object.size = file.object.size.max(end);
        }
        file.object.record_content_change(tx, now_ms);
        Ok(Mutation {
            object: Some(file.object.attr(tx, mode).await?),
            related: vec![],
        })
    }
}
