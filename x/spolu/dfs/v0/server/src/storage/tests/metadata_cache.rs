use super::*;
use slatedb::config::{FlushOptions, FlushType};

fn configuration(directory: &std::path::Path) -> StorageConfig {
    StorageConfig {
        gcs_bucket: None,
        gcs_prefix: None,
        uploads: UploadConfig::default(),
        cache: CacheConfig {
            write_mode: WriteMode::Cached,
            cache_dir: directory.to_owned(),
            ..Default::default()
        },
    }
}

#[test]
fn startup_clears_its_metadata_cache_without_touching_other_scopes() -> Result<()> {
    let directory = tempfile::tempdir()?;
    let mut config = configuration(directory.path());
    let first = config.metadata_cache_options("bucket-a", &"p".parse()?)?;
    let other_bucket = config.metadata_cache_options("bucket-b", &"p".parse()?)?;
    let other_prefix = config.metadata_cache_options("bucket-a", &"q".parse()?)?;
    ensure!(first.root_folder != other_bucket.root_folder);
    ensure!(first.root_folder != other_prefix.root_folder);
    ensure!(first.cache_on_flush && first.cache_on_compaction);
    for options in [&first, &other_bucket, &other_prefix] {
        std::fs::write(
            options
                .root_folder
                .as_ref()
                .context("cache root")?
                .join("stale"),
            b"old cache",
        )?;
    }
    let fresh = config.metadata_cache_options("bucket-a", &"p".parse()?)?;
    ensure!(
        std::fs::read_dir(fresh.root_folder.as_ref().context("cache root")?)?
            .next()
            .is_none()
    );
    for options in [&other_bucket, &other_prefix] {
        ensure!(
            options
                .root_folder
                .as_ref()
                .context("cache root")?
                .join("stale")
                .exists()
        );
    }
    config.cache.metadata_cache_disk_bytes = 0;
    ensure!(
        config
            .metadata_cache_options("bucket-a", &"p".parse()?)?
            .root_folder
            .is_none()
    );
    Ok(())
}

#[tokio::test]
async fn cold_restarts_recover_metadata_and_grants_from_the_remote_store() -> Result<()> {
    let directory = tempfile::tempdir()?;
    let config = configuration(directory.path());
    let prefix = "fixture".parse()?;
    let options = config.metadata_cache_options("bucket", &prefix)?;
    let store: Arc<dyn ObjectStore> = Arc::new(InMemory::new());
    let workspace = WorkspaceId::new("w")?;
    let (_, file, batch) = fixture(&workspace)?;
    let storage = Storage::open_with_object_cache(store.clone(), &prefix, options.clone()).await?;
    let scoped = storage.workspace(&workspace)?;
    scoped
        .commit(upload_fixture(&scoped, &file, batch).await?)
        .await?;
    storage
        .metadata
        .flush_with_options(FlushOptions {
            flush_type: FlushType::MemTable,
        })
        .await?;
    storage.close().await?;

    let options = config.metadata_cache_options("bucket", &prefix)?;
    ensure!(
        std::fs::read_dir(options.root_folder.as_ref().context("cache root")?)?
            .next()
            .is_none()
    );
    let reopened = Storage::open_with_object_cache(store.clone(), &prefix, options).await?;
    verify_fixture(&reopened.workspace(&workspace)?, file.id).await?;

    let updated = ObjectMetadata {
        metadata_revision: file.metadata_revision.next()?,
        ..file.clone()
    };
    reopened
        .workspace(&workspace)?
        .commit(MetadataBatch {
            mutations: vec![
                MetadataMutation::PutObject(updated.into()),
                MetadataMutation::SetGrant {
                    object_id: file.id,
                    grant: FIXTURE_GRANT.into(),
                    attached: false,
                },
            ],
            uploads: vec![],
        })
        .await?;
    reopened.close().await?;

    let options = config.metadata_cache_options("bucket", &prefix)?;
    let current = Storage::open_with_object_cache(store, &prefix, options).await?;
    let view = current.workspace(&workspace)?.read_view().await?;
    ensure!(view.grants(file.id, None, 10).await?.is_empty());
    ensure!(
        view.object(file.id)
            .await?
            .context("current object")?
            .metadata_revision
            == file.metadata_revision.next()?
    );
    drop(view);
    current.close().await?;
    Ok(())
}

#[tokio::test]
async fn content_cache_excludes_pending_writes_and_is_empty_after_restart() -> Result<()> {
    let directory = tempfile::tempdir()?;
    let config = configuration(directory.path());
    let prefix = "clean".parse()?;
    let root = config.fresh_cache_directory("dfs-content", "bucket", &prefix)?;
    let disk = Arc::new(cache::clean::CleanCache::open(&root, 64 * 1024 * 1024).await?);
    let store: Arc<dyn ObjectStore> = Arc::new(InMemory::new());
    let workspace = WorkspaceId::new("w")?;
    let (_, file, batch) = fixture(&workspace)?;
    let mut storage = Storage::open(store.clone(), &prefix).await?;
    storage.enable_cache_with_disk(config.cache.clone(), Some(disk.clone()))?;
    storage.pause_persistence(true);
    let scoped = storage.workspace(&workspace)?;
    let key = scoped.blob_path(file.id, content(&file)?.version);
    scoped
        .commit(upload_fixture(&scoped, &file, batch).await?)
        .await?;
    ensure!(disk.get(&key, 0, FIXTURE_BYTES.len()).await.is_none());
    storage.pause_persistence(false);
    storage.drain_persistence().await?;
    disk.wait().await;
    ensure!(
        disk.get(&key, 0, FIXTURE_BYTES.len()).await == Some(Bytes::from_static(FIXTURE_BYTES))
    );
    storage.close().await?;
    drop(storage);
    drop(disk);

    let root = config.fresh_cache_directory("dfs-content", "bucket", &prefix)?;
    ensure!(std::fs::read_dir(&root)?.next().is_none());
    let disk = Arc::new(cache::clean::CleanCache::open(&root, 64 * 1024 * 1024).await?);
    ensure!(disk.get(&key, 0, FIXTURE_BYTES.len()).await.is_none());
    let mut storage = Storage::open(store.clone(), &prefix).await?;
    storage.enable_cache_with_disk(config.cache, Some(disk))?;
    // A cold server cannot serve content that is absent remotely using the previous disk cache.
    let remote = Path::from(format!("{}/{key}", prefix.blobs_path()));
    store.delete(&remote).await?;
    let scoped = storage.workspace(&workspace)?;
    let missing: Result<Vec<Bytes>> = async {
        scoped
            .read_blob_stream(file.id, content(&file)?, 0, FIXTURE_BYTES.len() as u64)
            .await?
            .stream
            .try_collect()
            .await
    }
    .await;
    ensure!(missing.is_err());
    store
        .put(&remote, Bytes::from_static(FIXTURE_BYTES).into())
        .await?;
    let read = scoped
        .read_blob_stream(file.id, content(&file)?, 0, FIXTURE_BYTES.len() as u64)
        .await?;
    ensure!(read.stream.try_collect::<Vec<_>>().await?.concat() == FIXTURE_BYTES);
    storage.close().await?;
    Ok(())
}

#[tokio::test]
async fn publication_burst_prefills_content_larger_than_admission_buffers() -> Result<()> {
    let directory = tempfile::tempdir()?;
    let config = configuration(directory.path());
    let prefix = "burst".parse()?;
    let root = config.fresh_cache_directory("dfs-content", "bucket", &prefix)?;
    let disk = Arc::new(cache::clean::CleanCache::open(&root, 128 * 1024 * 1024).await?);
    let store: Arc<dyn ObjectStore> = Arc::new(InMemory::new());
    let workspace = WorkspaceId::new("w")?;
    let mut storage = Storage::open(store, &prefix).await?;
    storage.enable_cache_with_disk(config.cache, Some(disk.clone()))?;
    storage.pause_persistence(true);
    let scoped = storage.workspace(&workspace)?;
    let mut expected = Vec::new();
    for value in 0..128_u8 {
        let bytes = Bytes::from(vec![value; 256 * 1024]);
        let (parent, mut file, _) = fixture(&workspace)?;
        file.kind = ObjectKind::File(FileContent {
            version: content(&file)?.version,
            size_bytes: bytes.len() as u64,
        });
        let upload = scoped
            .upload_blob(
                file.id,
                content(&file)?.version,
                futures::stream::iter([Ok(bytes.clone())]),
            )
            .await?;
        scoped
            .commit(MetadataBatch {
                mutations: vec![
                    MetadataMutation::PutObject(parent.into()),
                    MetadataMutation::PutObject(file.clone().into()),
                    MetadataMutation::PutChild(file.directory_entry().context("file entry")?),
                ],
                uploads: vec![upload],
            })
            .await?;
        expected.push((scoped.blob_path(file.id, content(&file)?.version), bytes));
    }
    storage.pause_persistence(false);
    storage.drain_persistence().await?;
    disk.wait().await;
    for (key, bytes) in expected {
        ensure!(disk.get(&key, 0, bytes.len()).await == Some(bytes));
    }
    storage.close().await?;
    Ok(())
}
