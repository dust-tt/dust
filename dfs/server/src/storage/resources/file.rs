use std::fmt;

use dfs_protocol::{
    ObjectId, READ_MAX_BYTES,
    rpc::{Attr, ObjectKind},
};
use foundationdb::{FdbBindingError, Transaction};
use futures::future::try_join_all;

use crate::storage::{
    self,
    resources::{
        keys::tenant_subspace,
        object::{self, ObjectResource},
        session::SessionResource,
    },
};

const FAMILY: &str = "block";
pub const BLOCK_SIZE_BYTES: usize = 64 * 1024;

#[derive(Debug)]
pub enum Error {
    IsDirectory,
    UnsupportedKind,
    InvalidLength,
    InvalidBlock,
    Object(object::Error),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::IsDirectory => f.write_str("object is a directory"),
            Self::UnsupportedKind => f.write_str("unsupported file kind"),
            Self::InvalidLength => f.write_str("invalid read length"),
            Self::InvalidBlock => f.write_str("stored file block exceeds the size limit"),
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
        Self::fetch_many_for_session(tx, session, &[*object_id])
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
    pub async fn fetch_many_for_session(
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
