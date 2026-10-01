use super::*;
use anyhow::Context;
use futures::TryStreamExt;
use slatedb::object_store::{ObjectStore, ObjectStoreExt, memory::InMemory};

#[tokio::test]
async fn ten_thousand_small_files_stay_warm_without_remote_reads() -> Result<()> {
    let cache = Staging::new(&CacheConfig::default())?;
    let store: Arc<dyn ObjectStore> = Arc::new(InMemory::new());
    for number in 0..10_000 {
        let path = Path::from(format!("v1/workspace/object-{number}/version"));
        let bytes = Bytes::from(vec![(number % 256) as u8; 1024]);
        store.put(&path, bytes.clone().into()).await?;
        assert_eq!(cache.read_block(&store, &path, 1024, 0).await?, bytes);
        store.delete(&path).await?;
    }
    for number in 0..10_000 {
        let path = Path::from(format!("v1/workspace/object-{number}/version"));
        assert_eq!(
            cache.read_block(&store, &path, 1024, 0).await?,
            Bytes::from(vec![(number % 256) as u8; 1024])
        );
    }
    assert_eq!(cache.usage(), (10_240_000, 0));
    assert_eq!(cache.read_hits.load(Ordering::Relaxed), 10_000);
    assert_eq!(cache.read_misses.load(Ordering::Relaxed), 10_000);
    Ok(())
}

#[tokio::test]
async fn entry_pressure_admits_new_blocks_preserves_hot_entries_and_scopes_keys() -> Result<()> {
    let cache = Staging::new(&CacheConfig {
        cache_entries: 2,
        ..Default::default()
    })?;
    let store: Arc<dyn ObjectStore> = Arc::new(InMemory::new());
    let paths: Vec<_> = ["v1/a/object/old", "v1/b/object/old", "v1/a/object/new"]
        .into_iter()
        .map(Path::from)
        .collect();
    for (number, path) in paths.iter().enumerate() {
        store
            .put(path, Bytes::from(vec![number as u8]).into())
            .await?;
    }
    for path in &paths[..2] {
        cache.read_block(&store, path, 1, 0).await?;
    }
    assert_eq!(cache.read_block(&store, &paths[0], 1, 0).await?, [0][..]);
    assert_eq!(cache.read_block(&store, &paths[2], 1, 0).await?, [2][..]);
    for path in &paths {
        store.delete(path).await?;
    }
    assert_eq!(cache.read_block(&store, &paths[0], 1, 0).await?, [0][..]);
    assert_eq!(cache.read_block(&store, &paths[2], 1, 0).await?, [2][..]);
    assert!(cache.read_block(&store, &paths[1], 1, 0).await.is_err());
    assert_eq!(cache.usage(), (2, 0));
    Ok(())
}

#[tokio::test]
async fn payload_pressure_evicts_clean_blocks_without_evicting_dirty_pins() -> Result<()> {
    let cache = Staging::new(&CacheConfig {
        cache_memory_bytes: 8,
        cache_disk_bytes: 0,
        cache_entries: 10,
        ..Default::default()
    })?;
    let dirty = cache
        .stage(stream::iter([Ok(Bytes::from_static(b"dirty!"))]))
        .await?;
    let key = Path::from("v1/a/dirty/version");
    cache.register(key.clone(), dirty.clone())?;
    let store: Arc<dyn ObjectStore> = Arc::new(InMemory::new());
    for number in 0..10 {
        let path = Path::from(format!("v1/a/object-{number}/version"));
        store.put(&path, Bytes::from_static(b"ok").into()).await?;
        assert_eq!(cache.read_block(&store, &path, 2, 0).await?, b"ok"[..]);
        assert_eq!(cache.usage(), (8, 0));
    }
    let pinned = cache.get(&key)?.context("dirty pin survived eviction")?;
    let bytes = pinned.stream(0, 6).try_collect::<Vec<_>>().await?;
    assert_eq!(bytes.concat(), b"dirty!");
    assert!(
        cache
            .stage(stream::iter([Ok(Bytes::from_static(b"too big"))]))
            .await
            .is_err()
    );
    assert_eq!(cache.usage(), (6, 0));
    Ok(())
}
