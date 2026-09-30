use std::time::Duration;

use anyhow::ensure;
use futures::TryStreamExt;
use slatedb::{
    WriteBatch,
    bytes::Bytes,
    object_store::{
        ObjectStoreExt, PutMode, local::LocalFileSystem, memory::InMemory, prefix::PrefixStore,
    },
};

use super::*;
use crate::model::ObjectId;

#[test]
fn storage_prefixes_cannot_select_the_bucket_root_or_normalize_paths() -> Result<()> {
    for invalid in [
        "",
        "/",
        "/dev",
        "dev/",
        "dev//test",
        ".",
        "..",
        "dev/../test",
        "gs://bucket/dev",
        "dev/%2f",
    ] {
        ensure!(
            invalid.parse::<StoragePrefix>().is_err(),
            "accepted invalid prefix"
        );
    }
    let prefix: StoragePrefix = "dfs-dev/spolu.v1".parse()?;
    ensure!(prefix.metadata_path().as_ref() == "dfs-dev/spolu.v1/metadata");
    ensure!(prefix.blobs_path().as_ref() == "dfs-dev/spolu.v1/blobs");
    Ok(())
}

#[tokio::test]
async fn storage_configuration_requires_a_pair_without_fallback() -> Result<()> {
    let disabled = StorageConfig {
        gcs_bucket: None,
        gcs_prefix: None,
    };
    ensure!(disabled.open().await?.is_none());
    for config in [
        StorageConfig {
            gcs_bucket: Some("bucket".to_owned()),
            gcs_prefix: None,
        },
        StorageConfig {
            gcs_bucket: None,
            gcs_prefix: Some("dev".parse()?),
        },
        StorageConfig {
            gcs_bucket: Some("gs://bucket".to_owned()),
            gcs_prefix: Some("dev".parse()?),
        },
    ] {
        ensure!(config.open().await.is_err());
    }
    Ok(())
}

#[tokio::test]
async fn storage_open_propagates_backend_failure_without_retrying_forever() -> Result<()> {
    let directory = tempfile::tempdir()?;
    std::fs::create_dir(directory.path().join("blocked"))?;
    std::fs::write(
        directory.path().join("blocked/metadata"),
        b"not a directory",
    )?;
    let store = Arc::new(LocalFileSystem::new_with_prefix(directory.path())?);
    let result = tokio::time::timeout(
        Duration::from_secs(5),
        Storage::open(store, &"blocked".parse()?),
    )
    .await
    .context("storage open retried instead of returning the backend error")?;
    ensure!(result.is_err());
    Ok(())
}

#[tokio::test]
async fn local_storage_reopens_and_keeps_prefixes_separate() -> Result<()> {
    let directory = tempfile::tempdir()?;
    for store in [
        Arc::new(InMemory::new()) as Arc<dyn ObjectStore>,
        Arc::new(LocalFileSystem::new_with_prefix(directory.path())?),
    ] {
        let sibling = Path::from("fixture-other/keep");
        store
            .put(&sibling, Bytes::from_static(b"untouched").into())
            .await?;
        let prefix = "fixture".parse()?;
        tokio::time::timeout(
            Duration::from_secs(30),
            exercise_storage(store.clone(), &prefix),
        )
        .await??;
        cleanup_fixture(store.clone(), &prefix).await?;
        let remaining = store.list(None).try_collect::<Vec<_>>().await?;
        ensure!(remaining.len() == 1 && remaining[0].location == sibling);
        ensure!(store.get(&sibling).await?.bytes().await? == b"untouched"[..]);
    }
    Ok(())
}

/**
 * @cc [owner:spolu,label:testing] isolated-gcs-fixture
 * The real-GCS test MUST be opt-in and require an explicit test bucket and prefix. Each run MUST
 * use a fresh UUID subprefix. Cleanup MUST only delete objects within that run's prefix, after
 * closing SlateDB. Missing configuration or failed cloud access MUST fail, not skip the test.
 */
#[tokio::test]
#[ignore = "requires DFS_TEST_GCS_BUCKET, DFS_TEST_GCS_PREFIX, and Google credentials"]
async fn gcs_storage_round_trip() -> Result<()> {
    let bucket = std::env::var("DFS_TEST_GCS_BUCKET").context("set DFS_TEST_GCS_BUCKET")?;
    let base: StoragePrefix = std::env::var("DFS_TEST_GCS_PREFIX")
        .context("set DFS_TEST_GCS_PREFIX")?
        .parse()?;
    let prefix: StoragePrefix = format!("{}/tests/{}", base.0, ObjectId::generate()).parse()?;
    let store = gcs_store(&bucket)?;
    tokio::time::timeout(Duration::from_secs(120), async {
        exercise_storage(store.clone(), &prefix).await?;
        cleanup_fixture(store, &prefix).await
    })
    .await
    .context("GCS fixture timed out")
    .and_then(|result| result)
    .with_context(|| format!("GCS fixture failed; inspect gs://{bucket}/{}", prefix.0))
}

/// Exercise real SlateDB and object-store operations without requiring filesystem endpoints.
async fn exercise_storage(store: Arc<dyn ObjectStore>, prefix: &StoragePrefix) -> Result<()> {
    let blobs = PrefixStore::new(store.clone(), prefix.blobs_path());
    let blob_path = Path::from("fixture-content");
    let content = Bytes::from_static(b"file bytes stay outside SlateDB");
    let storage = Storage::open(store.clone(), prefix).await?;
    let write_result: Result<()> = async {
        blobs
            .put_opts(&blob_path, content.clone().into(), PutMode::Create.into())
            .await?;
        ensure!(matches!(
            blobs
                .put_opts(
                    &blob_path,
                    Bytes::from_static(b"replacement").into(),
                    PutMode::Create.into()
                )
                .await,
            Err(slatedb::object_store::Error::AlreadyExists { .. })
        ));
        let mut batch = WriteBatch::new();
        batch.put(b"fixture/content-reference", blob_path.as_ref().as_bytes());
        batch.put(
            b"fixture/content-size",
            content.len().to_string().as_bytes(),
        );
        storage.metadata.write(batch).await?.await_durable().await?;
        Ok(())
    }
    .await;
    let close_result = storage.close().await;
    write_result?;
    close_result?;

    let reopened = Storage::open(store.clone(), prefix).await?;
    let read_result: Result<()> = async {
        ensure!(
            reopened
                .metadata
                .get(b"fixture/content-reference")
                .await?
                .as_deref()
                == Some(blob_path.as_ref().as_bytes())
        );
        ensure!(
            reopened
                .metadata
                .get(b"fixture/content-size")
                .await?
                .as_deref()
                == Some(content.len().to_string().as_bytes())
        );
        ensure!(blobs.get(&blob_path).await?.bytes().await? == content);
        let metadata_files = store
            .list(Some(&prefix.metadata_path()))
            .try_collect::<Vec<_>>()
            .await?;
        ensure!(!metadata_files.is_empty());
        let blob_files = blobs.list(None).try_collect::<Vec<_>>().await?;
        ensure!(blob_files.len() == 1 && blob_files[0].location == blob_path);
        Ok(())
    }
    .await;
    let close_result = reopened.close().await;
    read_result?;
    close_result
}

async fn cleanup_fixture(store: Arc<dyn ObjectStore>, prefix: &StoragePrefix) -> Result<()> {
    let scoped = PrefixStore::new(store, prefix.0.clone());
    let paths = scoped.list(None).map_ok(|object| object.location);
    scoped
        .delete_stream(Box::pin(paths))
        .try_collect::<Vec<_>>()
        .await?;
    ensure!(scoped.list(None).try_next().await?.is_none());
    Ok(())
}
