use std::time::Duration;

use anyhow::{Context, Result, ensure};
use futures::{
    StreamExt,
    stream::{self, BoxStream},
};
use slatedb::{
    bytes::Bytes,
    object_store::{GetOptions, GetRange},
};

use super::{UploadError, WorkspaceStorage, upload::MAX_INPUT_CHUNK_BYTES};
use crate::model::{FileContent, ObjectId};

pub struct BlobRead {
    pub length: u64,
    pub stream: BoxStream<'static, Result<Bytes>>,
}

impl WorkspaceStorage<'_> {
    /**
     * @cc [owner:spolu,label:performance;backend] bounded-version-reads
     * Read exactly the selected immutable version and clamp ranges to EOF. Hold a shared transfer
     * reservation until the consumer drains or drops the stream. Never collect the complete file;
     * poll the backend only as the consumer asks for bytes. Check blob size and response range before
     * returning headers. Callers MUST authorize the object and selected version before opening.
     */
    pub async fn read_blob_stream(
        &self,
        object: ObjectId,
        content: &FileContent,
        offset: u64,
        length: u64,
    ) -> Result<BlobRead, UploadError> {
        let length = length.min(content.size_bytes.saturating_sub(offset));
        if length == 0 {
            return Ok(BlobRead {
                length,
                stream: stream::empty().boxed(),
            });
        }
        let lease = self.storage.transfers.acquire().await?;
        let end = offset + length;
        let result = self
            .storage
            .blobs
            .get_opts(
                &self.blob_path(object, content.version),
                GetOptions {
                    range: Some(GetRange::Bounded(offset..end)),
                    ..Default::default()
                },
            )
            .await
            .context("open content range")?;
        if result.meta.size != content.size_bytes || result.range != (offset..end) {
            return Err(anyhow::anyhow!("unexpected content range").into());
        }
        let source = result.into_stream();
        let stream = stream::try_unfold(
            (source, lease, length),
            |(mut source, lease, remaining)| async move {
                let next = tokio::time::timeout(Duration::from_secs(30), source.next())
                    .await
                    .context("content read timed out")?;
                match next {
                    Some(chunk) => {
                        let chunk = chunk.context("read content stream")?;
                        ensure!(
                            chunk.len() <= MAX_INPUT_CHUNK_BYTES && chunk.len() as u64 <= remaining,
                            "invalid backend chunk"
                        );
                        let remaining = remaining - chunk.len() as u64;
                        Ok(Some((chunk, (source, lease, remaining))))
                    }
                    None => {
                        ensure!(remaining == 0, "truncated content stream");
                        Ok(None)
                    }
                }
            },
        )
        .boxed();
        Ok(BlobRead { length, stream })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        model::{ContentVersionId, WorkspaceId},
        storage::{Storage, UploadConfig},
    };
    use futures::{FutureExt, stream};
    use slatedb::object_store::local::LocalFileSystem;
    use std::sync::Arc;

    #[tokio::test]
    async fn slow_consumers_hold_the_shared_budget_and_dropping_a_read_releases_it() -> Result<()> {
        let directory = tempfile::tempdir()?;
        let mut storage = Storage::open(
            Arc::new(LocalFileSystem::new_with_prefix(directory.path())?),
            &"reads".parse()?,
        )
        .await?;
        storage.transfers = UploadConfig {
            upload_memory_mib: 12,
            upload_concurrency: 4,
        }
        .budget()?;
        let workspace = WorkspaceId::new("w")?;
        let scoped = storage.workspace(&workspace)?;
        let object = ObjectId::generate();
        let blob = scoped
            .upload_blob(
                object,
                ContentVersionId::generate(),
                stream::iter([Ok(Bytes::from_static(b"0123456789"))]),
            )
            .await?;
        let mut slow = scoped
            .read_blob_stream(object, blob.content(), 3, 100)
            .await?;
        assert_eq!(slow.length, 7);
        let mut waiting = Box::pin(scoped.upload_blob(
            ObjectId::generate(),
            ContentVersionId::generate(),
            stream::empty(),
        ));
        assert!(waiting.as_mut().now_or_never().is_none());
        assert_eq!(
            slow.stream.next().await.transpose()?.context("chunk")?,
            b"3456789"[..]
        );
        // Do not request EOF: this models a stalled consumer retaining the response stream.
        assert!(waiting.as_mut().now_or_never().is_none());
        drop(slow);
        waiting.await?;
        let mut wrong = blob.content().clone();
        wrong.size_bytes += 1;
        assert!(scoped.read_blob_stream(object, &wrong, 0, 5).await.is_err());
        storage.close().await
    }
}
