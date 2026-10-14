use std::fmt;

use dfs_protocol::{
    ObjectId, READ_MAX_BYTES,
    rpc::{Attr, ObjectKind},
};
use foundationdb::{FdbBindingError, Transaction};
use futures::{StreamExt, TryStreamExt, future::try_join_all, stream};

use crate::storage::{
    self,
    resources::{
        keys::tenant_subspace,
        object::{self, ObjectResource},
        session::SessionResource,
    },
};

const FAMILY: &str = "block";
const CONCURRENT_FILE_READS: usize = 16;
pub const BLOCK_SIZE_BYTES: usize = 64 * 1024;

#[derive(Debug)]
pub enum Error {
    IsDirectory,
    UnsupportedKind,
    InvalidLength,
    InvalidBlock,
    Capacity,
    Object(object::Error),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::IsDirectory => f.write_str("object is a directory"),
            Self::UnsupportedKind => f.write_str("unsupported file kind"),
            Self::InvalidLength => f.write_str("invalid read length"),
            Self::InvalidBlock => f.write_str("stored file block exceeds the size limit"),
            Self::Capacity => f.write_str("file exceeds the read budget"),
            Self::Object(error) => error.fmt(f),
        }
    }
}

impl std::error::Error for Error {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Object(error) => Some(error),
            _ => None,
        }
    }
}

impl From<Error> for storage::Error<Error> {
    fn from(error: Error) -> Self {
        Self::Resource(error)
    }
}

impl From<storage::Error<object::Error>> for storage::Error<Error> {
    fn from(error: storage::Error<object::Error>) -> Self {
        match error {
            storage::Error::Open(error) => Self::Open(error),
            storage::Error::Transaction(error) => Self::Transaction(error),
            storage::Error::InvalidKeyHash(error) => Self::InvalidKeyHash(error),
            storage::Error::InvalidObjectId(error) => Self::InvalidObjectId(error),
            storage::Error::Resource(error) => Self::Resource(Error::Object(error)),
        }
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
     * @cc [owner:spolu,label:backend;security] file-fetch-for-session
     * Callers MUST fetch before staging writes and MUST NOT stage writes concurrently with it.
     * Fetch MUST evaluate modes in the caller's transaction and return the same fetched object,
     * with attributes from that transaction and no optional metadata. Missing objects MUST return
     * Object(NotFound); unreadable objects MUST return Object(NotAuthorized) before checking kind.
     * Readable directories MUST return IsDirectory. FDB failures MUST propagate unchanged.
     */
    pub async fn fetch_for_session(
        tx: &Transaction,
        session: &SessionResource,
        object_id: &ObjectId,
    ) -> Result<(Self, Attr), storage::Error<Error>> {
        Self::fetch_batch_for_session(tx, session, &[*object_id])
            .await?
            .into_iter()
            .next()
            .ok_or(Error::Object(object::Error::NotFound))?
            .map_err(Into::into)
    }

    /**
     * @cc [owner:spolu,label:backend;security] file-batch-fetch-for-session
     * Callers MUST fetch before staging writes and MUST NOT stage writes concurrently with it.
     * Fetch MUST evaluate all modes together in the caller's transaction and preserve input order
     * and duplicates. Missing and unreadable objects MUST return per-file Object(NotFound) and
     * Object(NotAuthorized), checking access before kind. Successful files and attributes MUST use
     * the objects fetched during authorization, with no optional metadata. Storage failures MUST
     * propagate through the outer result so FDB transaction failures remain retryable.
     */
    pub async fn fetch_batch_for_session(
        tx: &Transaction,
        session: &SessionResource,
        object_ids: &[ObjectId],
    ) -> Result<Vec<Result<(Self, Attr), Error>>, storage::Error<Error>> {
        let objects = ObjectResource::modes_for_session(tx, session, object_ids).await?;
        try_join_all(objects.into_iter().map(|entry| async move {
            let Some((object, mode)) = entry else {
                return Ok(Err(Error::Object(object::Error::NotFound)));
            };
            let attributes = match object.attr(tx, mode).await {
                Ok(attributes) => attributes,
                Err(storage::Error::Resource(error)) => return Ok(Err(Error::Object(error))),
                Err(error) => return Err(error.into()),
            };
            Ok(Self::try_from(object).map(|file| (file, attributes)))
        }))
        .await
    }

    /**
     * @cc [owner:spolu,label:backend;security] file-batch-read-snapshot
     * Callers MUST read before staging writes and MUST NOT stage writes concurrently with it.
     * Authorization, attributes, and contents MUST share the caller's transaction. Results MUST
     * preserve input order and duplicates, with whole-file data and attributes on success.
     * Missing, unreadable, non-file, capacity, and invalid-block failures MUST be per-file errors.
     * Invalid IDs MUST fail the batch; FDB transaction failures MUST propagate unchanged for retry.
     */
    /**
     * @cc [owner:spolu,label:backend;performance] file-batch-read-budget
     * max_bytes MUST limit the sum of file data bytes, excluding attributes and encoding overhead.
     * Readable files over 1 MiB or unable to fit in the remaining budget MUST return Capacity
     * before reading their blocks. Admission MUST follow input order, counting duplicates, and
     * continue after rejected files. Readable empty files MUST succeed with zero remaining data
     * budget. Content reads MUST have bounded concurrency. Failed reads MAY retain their budget.
     */
    pub async fn read_batch_for_session(
        tx: &Transaction,
        session: &SessionResource,
        object_ids: &[ObjectId],
        max_bytes: usize,
    ) -> Result<Vec<Result<(Attr, Vec<u8>), Error>>, storage::Error<Error>> {
        let files = Self::fetch_batch_for_session(tx, session, object_ids).await?;
        let mut remaining_bytes = max_bytes;
        stream::iter(files.into_iter().map(|result| {
            let result = result.and_then(|(file, object)| {
                if object.size > u64::from(READ_MAX_BYTES) || object.size > remaining_bytes as u64 {
                    return Err(Error::Capacity);
                }
                remaining_bytes -= object.size as usize;
                let length = object.size as u32;
                Ok((file, object, length))
            });
            async move {
                let (file, object, length) = match result {
                    Ok(file) => file,
                    Err(error) => return Ok(Err(error)),
                };
                match file.read(tx, 0, length).await {
                    Ok(data) => Ok(Ok((object, data))),
                    Err(storage::Error::Resource(error)) => Ok(Err(error)),
                    Err(error) => Err(error),
                }
            }
        }))
        .buffered(CONCURRENT_FILE_READS)
        .try_collect()
        .await
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
