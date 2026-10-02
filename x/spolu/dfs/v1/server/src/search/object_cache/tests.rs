use super::*;
use anyhow::Result;
use object_store::{
    memory::InMemory,
    throttle::{ThrottleConfig, ThrottledStore},
};
use std::time::Duration;

async fn fixture(dir: &std::path::Path) -> Result<CachedStore> {
    Ok(CachedStore {
        inner: Arc::new(InMemory::new()),
        prefix: "bucket-a".into(),
        cache: ObjectCache::open(dir, 1024 * 1024, 64 * 1024 * 1024).await?,
    })
}

#[tokio::test]
async fn ranges_ram_disk_and_cold_restart() -> Result<()> {
    let dir = tempfile::tempdir()?;
    let path = Path::from("workspace/data.lance");
    let store = fixture(&dir.path().join("cache")).await?;
    let data: Vec<u8> = (0..700_000).map(|i| (i % 251) as u8).collect();
    store.put(&path, data.clone().into()).await?;
    let ranges = [0..1, 262140..262150, 699900..700000];
    for range in &ranges {
        assert_eq!(
            store.get_range(&path, range.clone()).await?.as_ref(),
            &data[range.start as usize..range.end as usize]
        );
    }
    let requests = store.cache.remote_requests.load(Ordering::Relaxed);
    for range in &ranges {
        store.get_range(&path, range.clone()).await?;
    }
    assert_eq!(
        store.cache.remote_requests.load(Ordering::Relaxed),
        requests
    );
    // Force eviction to disk, then verify that Arrow range reads still avoid the remote backend.
    store.cache.parts.flush_if(|_, _| true).await;
    store.cache.parts.storage().wait().await;
    for range in &ranges {
        assert_eq!(
            store.get_range(&path, range.clone()).await?.as_ref(),
            &data[range.start as usize..range.end as usize]
        );
    }
    assert_eq!(
        store.cache.remote_requests.load(Ordering::Relaxed),
        requests
    );
    let suffix = store
        .get_opts(
            &path,
            GetOptions {
                range: Some(GetRange::Suffix(20)),
                ..Default::default()
            },
        )
        .await?
        .bytes()
        .await?;
    assert_eq!(suffix.as_ref(), &data[data.len() - 20..]);
    assert!(store.get_range(&path, 900000..900001).await.is_err());
    assert_eq!(store.get(&path).await?.bytes().await?.as_ref(), data);
    store.cache.close().await?;
    tokio::fs::write(dir.path().join("cache/stale"), b"not reusable").await?;
    let restarted = CachedStore {
        cache: ObjectCache::open(&dir.path().join("cache"), 1024 * 1024, 0).await?,
        ..store
    };
    assert!(!dir.path().join("cache/stale").exists());
    assert_eq!(restarted.get_range(&path, 0..1).await?.as_ref(), &data[..1]);
    assert_eq!(restarted.cache.remote_requests.load(Ordering::Relaxed), 2);
    restarted.cache.close().await
}

#[tokio::test]
async fn mutations_versions_and_bucket_isolation() -> Result<()> {
    let dir = tempfile::tempdir()?;
    let store = fixture(dir.path()).await?;
    let path = Path::from("same-path");
    store.put(&path, Bytes::from_static(b"old").into()).await?;
    let old = store.get(&path).await?;
    let etag = old.meta.e_tag.clone();
    assert_eq!(old.bytes().await?, "old");
    store.put(&path, Bytes::from_static(b"new").into()).await?;
    assert_eq!(store.get(&path).await?.bytes().await?, "new");
    assert!(matches!(
        store
            .get_opts(
                &path,
                GetOptions {
                    if_match: etag,
                    ..Default::default()
                }
            )
            .await,
        Err(Error::Precondition { .. })
    ));
    let mut upload = store.put_multipart(&path).await?;
    upload
        .put_part(Bytes::from_static(b"multipart").into())
        .await?;
    assert_eq!(store.get(&path).await?.bytes().await?, "new");
    upload.complete().await?;
    assert_eq!(store.get(&path).await?.bytes().await?, "multipart");
    let other = CachedStore {
        inner: Arc::new(InMemory::new()),
        prefix: "bucket-b".into(),
        cache: store.cache.clone(),
    };
    other
        .put(&path, Bytes::from_static(b"other bucket").into())
        .await?;
    assert_eq!(other.get(&path).await?.bytes().await?, "other bucket");
    assert_eq!(store.get(&path).await?.bytes().await?, "multipart");
    let source = Path::from("source");
    store
        .put(&source, Bytes::from_static(b"copied").into())
        .await?;
    store.copy(&source, &path).await?;
    assert_eq!(store.get(&path).await?.bytes().await?, "copied");
    store.delete(&path).await?;
    assert!(matches!(
        store.get(&path).await,
        Err(Error::NotFound { .. })
    ));
    store.put(&path, Bytes::new().into()).await?;
    assert!(store.get(&path).await?.bytes().await?.is_empty());
    store.cache.close().await
}

#[tokio::test]
async fn racing_read_and_cancelled_write_cannot_repopulate_stale_heads() -> Result<()> {
    let dir = tempfile::tempdir()?;
    let mut store = fixture(dir.path()).await?;
    let remote = Arc::new(ThrottledStore::new(
        InMemory::new(),
        ThrottleConfig::default(),
    ));
    store.inner = remote.clone();
    let path = Path::from("object");
    store
        .put(&path, Bytes::from_static(b"before").into())
        .await?;
    // Capture a head without polling the data stream, then overwrite before the range fetch.
    let old = store.get(&path).await?;
    store
        .put(&path, Bytes::from_static(b"after").into())
        .await?;
    assert!(matches!(old.bytes().await, Err(Error::Precondition { .. })));
    assert_eq!(store.get(&path).await?.bytes().await?, "after");
    remote.config_mut(|c| c.wait_put_per_call = Duration::from_secs(1));
    assert!(
        tokio::time::timeout(
            Duration::from_millis(10),
            store.put(&path, Bytes::from_static(b"cancelled").into())
        )
        .await
        .is_err()
    );
    // An ambiguous write may complete late. Its stripe must remain uncached until restart.
    remote.config_mut(|c| c.wait_put_per_call = Duration::ZERO);
    remote
        .put(&path, Bytes::from_static(b"late completion").into())
        .await?;
    assert_eq!(store.get(&path).await?.bytes().await?, "late completion");
    remote
        .put(&path, Bytes::from_static(b"latest").into())
        .await?;
    assert_eq!(store.get(&path).await?.bytes().await?, "latest");
    store.cache.close().await
}
