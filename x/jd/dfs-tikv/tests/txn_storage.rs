use dfs_tikv::{Commit, Config, Store};

async fn stores() -> anyhow::Result<(Store, Store)> {
    let pd = std::env::var("DFS_TIKV_TEST_PD")?;
    let config = Config::new(
        pd.split(',').map(str::to_owned).collect(),
        format!("txn-test-{}", uuid::Uuid::new_v4().simple()),
    );
    Ok((
        Store::connect(config.clone()).await?,
        Store::connect(config).await?,
    ))
}

#[tokio::test]
#[ignore = "requires isolated TxnKV cluster in dust-dev"]
async fn independent_records_commit_without_tenant_root_conflict() -> anyhow::Result<()> {
    let (a, b) = stores().await?;
    let mut first = a.snapshot("tenant").await?.batch();
    let mut second = b.snapshot("tenant").await?.batch();
    first.put(b"a", b"one").await?;
    second.put(b"b", b"two").await?;
    assert!(matches!(first.commit().await?, Commit::Published { .. }));
    assert!(matches!(second.commit().await?, Commit::Published { .. }));
    let view = a.snapshot("tenant").await?;
    assert_eq!(view.get(b"a").await?, Some(b"one".to_vec()));
    assert_eq!(view.get(b"b").await?, Some(b"two".to_vec()));
    assert_eq!(a.stats().root_cas, 0);
    Ok(())
}

#[tokio::test]
#[ignore = "requires isolated TxnKV cluster in dust-dev"]
async fn read_dependencies_prevent_write_skew_and_preserve_snapshot() -> anyhow::Result<()> {
    let (a, b) = stores().await?;
    let mut seed = a.snapshot("tenant").await?.batch();
    seed.put(b"a", b"1").await?;
    seed.put(b"b", b"1").await?;
    seed.commit().await?;
    let old = a.snapshot("tenant").await?;
    let mut first = old.clone().batch();
    let mut second = b.snapshot("tenant").await?.batch();
    assert_eq!(first.get(b"b").await?, Some(b"1".to_vec()));
    assert_eq!(second.get(b"a").await?, Some(b"1".to_vec()));
    first.put(b"a", b"0").await?;
    second.put(b"b", b"0").await?;
    first.commit().await?;
    assert_eq!(second.commit().await?, Commit::Conflict);
    assert_eq!(old.get(b"a").await?, Some(b"1".to_vec()));
    assert_eq!(
        a.snapshot("tenant").await?.get(b"b").await?,
        Some(b"1".to_vec())
    );
    assert!(old.batch().put(b"reuse", b"no").await.is_err());
    Ok(())
}

#[tokio::test]
#[ignore = "requires isolated TxnKV cluster in dust-dev"]
async fn guarded_empty_range_conflicts_with_concurrent_insert() -> anyhow::Result<()> {
    let (a, b) = stores().await?;
    let mut first = a.snapshot("tenant").await?.batch();
    let mut second = b.snapshot("tenant").await?.batch();
    first.guard(b"directory-guard").await?;
    second.guard(b"directory-guard").await?;
    assert!(first.scan(b"entries/", None, 10).await?.is_empty());
    second.put(b"entries/child", b"present").await?;
    first.put(b"directory-deleted", b"true").await?;
    second.commit().await?;
    assert_eq!(first.commit().await?, Commit::Conflict);
    assert_eq!(
        a.snapshot("tenant")
            .await?
            .get(b"directory-deleted")
            .await?,
        None
    );
    Ok(())
}

#[tokio::test]
#[ignore = "requires isolated TxnKV cluster in dust-dev"]
async fn ordered_scan_bounds_and_immutable_cache_obey_snapshot_timestamp() -> anyhow::Result<()> {
    let (a, b) = stores().await?;
    let old = a.snapshot("tenant").await?;
    let mut seed = b.snapshot("tenant").await?.batch();
    for n in 0..30 {
        seed.put(format!("items/{n:02}").as_bytes(), b"value")
            .await?;
    }
    seed.put(b"chunk\0\0test", b"immutable").await?;
    seed.commit().await?;
    let cache = a.snapshot("tenant").await?.batch();
    assert_eq!(
        cache.get(b"chunk\0\0test").await?,
        Some(b"immutable".to_vec())
    );
    assert_eq!(old.batch().get(b"chunk\0\0test").await?, None);
    let view = a.snapshot("tenant").await?;
    let page = view.scan(b"items/", Some(b"items/09"), 10).await?;
    assert_eq!(page.len(), 10);
    assert_eq!(page[0].0, b"items/10");
    assert_eq!(page[9].0, b"items/19");
    let mut replacement = view.batch();
    assert!(
        replacement
            .put(b"chunk\0\0test", b"different")
            .await
            .is_err()
    );
    assert!(replacement.commit().await.is_err());
    assert_eq!(a.snapshot("other").await?.get(b"items/10").await?, None);
    Ok(())
}

#[tokio::test]
#[ignore = "requires isolated TxnKV cluster in dust-dev"]
async fn prefetched_immutable_checks_preserve_conflicts_and_staged_values() -> anyhow::Result<()> {
    let (a, b) = stores().await?;
    let key = b"chunk\0\0prefetched".to_vec();
    let mut first = a.snapshot("tenant").await?.batch();
    first.prefetch(std::slice::from_ref(&key)).await?;
    let reads = a.stats().object_reads;
    first.put(&key, b"first").await?;
    assert_eq!(a.stats().object_reads, reads);
    assert_eq!(first.get(&key).await?, Some(b"first".to_vec()));
    assert!(matches!(first.commit().await?, Commit::Published { .. }));
    let mut same = a.snapshot("tenant").await?.batch();
    same.prefetch(std::slice::from_ref(&key)).await?;
    let reads = a.stats().object_reads;
    same.put(&key, b"first").await?;
    assert_eq!(a.stats().object_reads, reads);
    assert!(same.put(&key, b"changed").await.is_err());
    assert!(same.commit().await.is_err());
    let contested = b"manifest\0\0contested".to_vec();
    let mut before = a.snapshot("tenant").await?.batch();
    before.prefetch(std::slice::from_ref(&contested)).await?;
    let mut winner = b.snapshot("tenant").await?.batch();
    winner.put(&contested, b"winner").await?;
    assert!(matches!(winner.commit().await?, Commit::Published { .. }));
    before.put(&contested, b"loser").await?;
    assert_eq!(before.commit().await?, Commit::Conflict);
    assert_eq!(
        a.snapshot("tenant").await?.get(&contested).await?,
        Some(b"winner".to_vec())
    );
    Ok(())
}
