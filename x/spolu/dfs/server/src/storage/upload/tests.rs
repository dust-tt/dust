use std::sync::atomic::{AtomicUsize, Ordering};

use anyhow::{Result, ensure};
use futures::{FutureExt, TryStreamExt, stream};
use slatedb::object_store::{local::LocalFileSystem, memory::InMemory};

use super::*;
use crate::model::{
    MetadataRevision, ObjectKind, ObjectMetadata, PosixAttributes, Timestamp, Xattrs,
};
use crate::storage::{MetadataBatch, MetadataMutation, Storage};

// Also called by the opt-in GCS fixture to exercise actual multipart/copy preconditions.
pub(in crate::storage) async fn exercise_streams(scoped: &WorkspaceStorage<'_>) -> Result<()> {
    let object = ObjectId::generate();
    for size in [0, 17 * 1024 * 1024 + 3] {
        let version = ContentVersionId::generate();
        let upload = scoped.upload_blob(object, version, generated(size)).await?;
        ensure!(upload.content().size_bytes == size as u64);
        let path = scoped.blob_path(object, version);
        ensure!(scoped.storage.blobs.head(&path).await?.size == size as u64);
        ensure!(
            scoped
                .upload_blob(object, version, generated(UPLOAD_PART_BYTES + 3))
                .await
                .is_err()
        );
        ensure!(scoped.storage.blobs.head(&path).await?.size == size as u64);
        if size > 0 {
            ensure!(
                scoped
                    .storage
                    .blobs
                    .get_range(&path, size as u64 - 3..size as u64)
                    .await?
                    == b"xxx"[..]
            );
        }
    }
    ensure!(
        scoped
            .storage
            .blobs
            .list(Some(&Path::from("staging")))
            .try_collect::<Vec<_>>()
            .await?
            .is_empty()
    );
    Ok(())
}

fn generated(size: usize) -> impl Stream<Item = Result<Bytes>> + Send {
    stream::unfold(size, |left| async move {
        if left == 0 {
            return None;
        }
        let take = left.min(MAX_INPUT_CHUNK_BYTES);
        Some((Ok(Bytes::from(vec![b'x'; take])), left - take))
    })
}

#[tokio::test]
async fn streams_exceed_budget_without_collecting_and_fail_without_publication() -> Result<()> {
    let directory = tempfile::tempdir()?;
    let mut storage = Storage::open(
        Arc::new(LocalFileSystem::new_with_prefix(directory.path())?),
        &"uploads".parse()?,
    )
    .await?;
    storage.transfers = UploadConfig {
        upload_memory_mib: 12,
        upload_concurrency: 4,
    }
    .budget()?;
    let workspace = WorkspaceId::new("w")?;
    let scoped = storage.workspace(&workspace)?;
    exercise_streams(&scoped).await?;
    let large = scoped
        .upload_blob(
            ObjectId::generate(),
            ContentVersionId::generate(),
            generated(80 * 1024 * 1024),
        )
        .await?;
    ensure!(large.content().size_bytes == 80 * 1024 * 1024);
    for input in [
        generated(UPLOAD_PART_BYTES + 1)
            .chain(stream::iter([Err(anyhow::anyhow!("disconnect"))]))
            .boxed(),
        stream::iter([Ok(Bytes::from(vec![0; MAX_INPUT_CHUNK_BYTES + 1]))]).boxed(),
    ] {
        let object = ObjectId::generate();
        let version = ContentVersionId::generate();
        ensure!(matches!(
            scoped.upload_blob(object, version, input).await,
            Err(UploadError::Input)
        ));
        ensure!(
            scoped
                .storage
                .blobs
                .head(&scoped.blob_path(object, version))
                .await
                .is_err()
        );
        ensure!(scoped.read_view().await?.object(object).await?.is_none());
    }
    ensure!(scoped.read_view().await?.changes(0, 10).await?.is_empty());
    ensure!(
        scoped
            .storage
            .blobs
            .list(Some(&Path::from("staging")))
            .try_collect::<Vec<_>>()
            .await?
            .is_empty()
    );
    storage.close().await
}

#[tokio::test]
async fn shared_budget_bounds_active_and_waiting_transfers_before_polling_bodies() -> Result<()> {
    let mut storage = Storage::open(Arc::new(InMemory::new()), &"limits".parse()?).await?;
    storage.transfers = UploadConfig {
        upload_memory_mib: 12,
        upload_concurrency: 4,
    }
    .budget()?;
    let workspace = WorkspaceId::new("w")?;
    let scoped = storage.workspace(&workspace)?;
    let polled = Arc::new(AtomicUsize::new(0));
    let mut uploads = Vec::new();
    for _ in 0..=MAX_WAITING_TRANSFERS {
        let counter = polled.clone();
        let body = stream::once(async move {
            counter.fetch_add(1, Ordering::SeqCst);
            futures::future::pending::<Result<Bytes>>().await
        });
        let mut upload =
            Box::pin(scoped.upload_blob(ObjectId::generate(), ContentVersionId::generate(), body));
        ensure!(upload.as_mut().now_or_never().is_none());
        uploads.push(upload);
    }
    ensure!(polled.load(Ordering::SeqCst) == 1);
    ensure!(matches!(
        scoped
            .upload_blob(
                ObjectId::generate(),
                ContentVersionId::generate(),
                generated(0)
            )
            .await,
        Err(UploadError::Capacity)
    ));
    // Cancellation releases an active reservation, allowing exactly one queued body to be polled.
    drop(uploads.remove(0));
    ensure!(uploads[0].as_mut().now_or_never().is_none());
    ensure!(polled.load(Ordering::SeqCst) == 2);
    drop(uploads);
    ensure!(storage.transfers.active.available_permits() == 1);
    ensure!(storage.transfers.admitted.available_permits() == 1 + MAX_WAITING_TRANSFERS);
    storage.close().await
}

#[tokio::test(start_paused = true)]
async fn idle_input_times_out_and_releases_budget() -> Result<()> {
    let storage = Storage::open(Arc::new(InMemory::new()), &"idle".parse()?).await?;
    let workspace = WorkspaceId::new("w")?;
    let scoped = storage.workspace(&workspace)?;
    let result = scoped
        .upload_blob(
            ObjectId::generate(),
            ContentVersionId::generate(),
            stream::pending(),
        )
        .await;
    ensure!(matches!(result, Err(UploadError::Input)));
    ensure!(storage.transfers.active.available_permits() == 4);
    storage.close().await
}

#[tokio::test]
async fn descriptors_cannot_cross_storage_workspace_object_version_or_size() -> Result<()> {
    let store = Arc::new(InMemory::new());
    let storage = Storage::open(store.clone(), &"one".parse()?).await?;
    let other = Storage::open(store, &"two".parse()?).await?;
    let workspace = WorkspaceId::new("w")?;
    let scoped = storage.workspace(&workspace)?;
    let blob = scoped
        .upload_blob(
            ObjectId::generate(),
            ContentVersionId::generate(),
            generated(3),
        )
        .await?;
    let file = ObjectMetadata {
        id: blob.object_id(),
        workspace_id: workspace.clone(),
        parent: None,
        kind: ObjectKind::File(blob.content().clone()),
        mime_type: "text/plain".parse()?,
        xattrs: Xattrs::new(),
        metadata_revision: MetadataRevision::INITIAL,
        posix: PosixAttributes::new(false, Timestamp::EPOCH),
    };
    let batch = MetadataBatch {
        mutations: vec![MetadataMutation::PutObject(file.clone().into())],
        uploads: vec![blob.clone()],
    };
    ensure!(
        other
            .workspace(&workspace)?
            .commit(batch.clone())
            .await
            .is_err()
    );
    ensure!(
        storage
            .workspace(&WorkspaceId::new("other")?)?
            .commit(batch.clone())
            .await
            .is_err()
    );
    for (id, version, size) in [
        (ObjectId::generate(), blob.content().version, 3),
        (file.id, ContentVersionId::generate(), 3),
        (file.id, blob.content().version, 4),
    ] {
        let record = ObjectMetadata {
            id,
            kind: ObjectKind::File(FileContent {
                version,
                size_bytes: size,
            }),
            ..file.clone()
        };
        ensure!(
            scoped
                .commit(MetadataBatch {
                    mutations: vec![MetadataMutation::PutObject(record.into())],
                    uploads: vec![blob.clone()]
                })
                .await
                .is_err()
        );
    }
    ensure!(scoped.read_view().await?.object(file.id).await?.is_none());
    scoped.commit(batch).await?;
    ensure!(scoped.read_view().await?.object(file.id).await? == Some(file));
    other.close().await?;
    storage.close().await
}
