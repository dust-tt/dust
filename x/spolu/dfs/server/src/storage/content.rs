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
    pub(crate) async fn edit_staged(
        &self,
        object: ObjectId,
        base: &FileContent,
        offset: u64,
        length: u64,
        size: u64,
        input: BoxStream<'static, Result<Bytes>>,
    ) -> Result<(super::UploadedBlob, [u8; 32]), UploadError> {
        let cache = self.storage.cache.as_ref().context("cache disabled")?;
        let key = self.blob_path(object, base.version);
        let local = match cache.staging.get(&key)? {
            Some(local) => local,
            None => {
                let bytes = self
                    .read_blob_stream(object, base, 0, base.size_bytes)
                    .await?;
                let local = cache.staging.stage(bytes.stream).await?;
                cache.staging.register(key, local.clone())?;
                cache.staging.retain_clean(local.clone())?;
                local
            }
        };
        let _lease = self.storage.transfers.acquire().await?;
        let (version, hash) = cache
            .staging
            .edit(&local, offset, length, size, input)
            .await?;
        Ok((
            self.staged_descriptor(object, crate::model::ContentVersionId::generate(), version)?,
            hash,
        ))
    }

    /**
     * @cc [owner:spolu,label:performance;backend] bounded-version-reads
     * Read exactly the selected immutable version and clamp ranges to EOF. Hold a shared transfer
     * reservation until the consumer drains or drops the stream. Never collect the complete file;
     * poll the backend only as the consumer asks for bytes. Check blob size and response range
     * before
     * returning headers. Callers MUST authorize the object and selected version before opening and
     * retain that read view (or a completed-upload descriptor) until this method returns.
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
        if let Some(cache) = &self.storage.cache
            && let Some(local) = cache
                .staging
                .get(&self.blob_path(object, content.version))?
        {
            if local.size != content.size_bytes {
                return Err(anyhow::anyhow!("staged size mismatch").into());
            }
            let source = local.stream(offset, length);
            let stream = stream::unfold((source, lease), |(mut source, lease)| async move {
                source.next().await.map(|chunk| (chunk, (source, lease)))
            })
            .boxed();
            return Ok(BlobRead { length, stream });
        }
        let end = offset + length;
        if let Some(cache) = &self.storage.cache {
            let cache = cache.clone();
            let store = self.storage.blobs.clone();
            let path = self.blob_path(object, content.version);
            let size = content.size_bytes;
            let mut source = stream::try_unfold(offset, move |position| {
                let (cache, store, path) = (cache.clone(), store.clone(), path.clone());
                async move {
                    if position >= end {
                        return Ok(None);
                    }
                    let block = tokio::time::timeout(
                        Duration::from_secs(30),
                        cache
                            .staging
                            .read_block(&store, &path, size, position / 1_048_576),
                    )
                    .await
                    .context("content read timed out")??;
                    let start = (position % 1_048_576) as usize;
                    let count = (end - position).min((block.len() - start) as u64) as usize;
                    Ok(Some((
                        block.slice(start..start + count),
                        position + count as u64,
                    )))
                }
            })
            .boxed();
            let first = source
                .next()
                .await
                .context("missing first content block")??;
            let source = stream::once(async { Ok(first) }).chain(source).boxed();
            let stream = stream::unfold((source, lease), |(mut source, lease)| async move {
                source.next().await.map(|chunk| (chunk, (source, lease)))
            })
            .boxed();
            return Ok(BlobRead { length, stream });
        }
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
        .budget()?
        .into();
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
