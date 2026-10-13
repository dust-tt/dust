use std::fmt;

use dfs_protocol::rpc::ObjectKind;
use foundationdb::{FdbBindingError, Transaction};
use futures::future::try_join_all;

use crate::storage::{
    self,
    resources::{keys::tenant_subspace, object::ObjectResource},
};

const FAMILY: &str = "block";
pub const BLOCK_SIZE_BYTES: usize = 64 * 1024;
pub const READ_MAX_BYTES: u32 = 1024 * 1024;

#[derive(Debug)]
pub enum Error {
    IsDirectory,
    UnsupportedKind,
    InvalidLength,
    InvalidBlock,
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::IsDirectory => f.write_str("object is a directory"),
            Self::UnsupportedKind => f.write_str("unsupported file kind"),
            Self::InvalidLength => f.write_str("invalid read length"),
            Self::InvalidBlock => f.write_str("stored file block exceeds the size limit"),
        }
    }
}

impl std::error::Error for Error {}

impl From<Error> for storage::Error<Error> {
    fn from(error: Error) -> Self {
        Self::Resource(error)
    }
}

pub struct FileResource {
    object: ObjectResource,
}

impl FileResource {
    pub fn object(&self) -> &ObjectResource {
        &self.object
    }

    /**
     * @cc [owner:spolu,label:backend] file-read-snapshot
     * Callers MUST fetch or create the contained object in the same transaction. Reads MUST use
     * the object's tenant and ID, read blocks with conflict tracking, and leave stored state,
     * including timestamps and versions, unchanged. FDB failures MUST propagate unchanged.
     */
    /**
     * @cc [owner:spolu,label:backend;performance] file-read-range
     * Requested length MUST NOT exceed 1 MiB; larger requests MUST fail before reading blocks or
     * allocating the result. Reads MUST return exactly the requested range clipped to logical EOF,
     * with zeroes for missing blocks and short block tails. Zero length or an offset at or beyond
     * EOF MUST return empty data without reading blocks. Stored blocks over 64 KiB MUST fail.
     * Offset arithmetic MUST NOT overflow, including near the maximum uint64 offset.
     */
    pub async fn read(
        &self,
        tx: &Transaction,
        offset: u64,
        length: u32,
    ) -> Result<Vec<u8>, storage::Error<Error>> {
        if length > READ_MAX_BYTES {
            return Err(Error::InvalidLength.into());
        }
        let length = u64::from(length).min(self.object.size.saturating_sub(offset)) as usize;
        let mut data = vec![0; length];
        if data.is_empty() {
            return Ok(data);
        }
        let end = offset + length as u64;
        let first = offset / BLOCK_SIZE_BYTES as u64;
        let last = (end - 1) / BLOCK_SIZE_BYTES as u64;
        // The request limit bounds the number of blocks fetched concurrently.
        let blocks = try_join_all((first..=last).map(|index| async move {
            let block = tx
                .get(&self.block_key(index), false)
                .await
                .map_err(FdbBindingError::from)?;
            if block
                .as_ref()
                .is_some_and(|block| block.len() > BLOCK_SIZE_BYTES)
            {
                return Err(storage::Error::Resource(Error::InvalidBlock));
            }
            Ok((index, block))
        }))
        .await?;
        for (index, block) in blocks {
            let Some(block) = block else { continue };
            let start = index * BLOCK_SIZE_BYTES as u64;
            let block_offset = offset.saturating_sub(start) as usize;
            let data_offset = start.saturating_sub(offset) as usize;
            let copied = block
                .len()
                .saturating_sub(block_offset)
                .min(data.len() - data_offset);
            if copied > 0 {
                data[data_offset..data_offset + copied]
                    .copy_from_slice(&block[block_offset..block_offset + copied]);
            }
        }
        Ok(data)
    }

    fn block_key(&self, index: u64) -> Vec<u8> {
        tenant_subspace(&self.object.tenant.tenant_id).pack(&(
            FAMILY,
            self.object.object_id.as_bytes().as_slice(),
            index,
        ))
    }
}

impl TryFrom<ObjectResource> for FileResource {
    type Error = Error;

    fn try_from(object: ObjectResource) -> Result<Self, Self::Error> {
        match object.kind {
            ObjectKind::File => Ok(Self { object }),
            ObjectKind::Directory => Err(Error::IsDirectory),
            ObjectKind::Symlink => Err(Error::UnsupportedKind),
        }
    }
}
