use dfs_fdb::{Commit, Config, Error, Store};
use std::collections::BTreeMap;
use std::sync::Arc;
use tokio::sync::Barrier;

fn config(namespace: &str, cache_bytes: usize) -> Config {
    let endpoints =
        std::env::var("DFS_FDB_TEST_CLUSTER_FILE").expect("real FoundationDB endpoints required");
    let mut config = Config::new(endpoints, namespace.to_owned());
    config.cache_bytes = cache_bytes;
    config
}

fn namespace() -> String {
    format!("test-{}", uuid::Uuid::new_v4().simple())
}

async fn independent_clients_publish_without_lost_updates() -> anyhow::Result<()> {
    let namespace = namespace();
    let workers = 4usize;
    let iterations = 12usize;
    let barrier = Arc::new(Barrier::new(workers));
    let mut tasks = Vec::new();
    for worker in 0..workers {
        let config = config(&namespace, 128 << 10);
        let barrier = barrier.clone();
        tasks.push(tokio::spawn(async move {
            let store = Store::connect(config).await?;
            barrier.wait().await;
            let mut conflicts = 0;
            for iteration in 0..iterations {
                let key = format!("worker/{worker}/{iteration:04}");
                let mut published = false;
                for attempt in 0..256 {
                    let mut batch = store.snapshot("same-tenant").await?.batch();
                    if iteration == 0 && attempt == 0 {
                        barrier.wait().await;
                    }
                    let count = batch
                        .get(b"count")
                        .await?
                        .map(|bytes| bincode::deserialize::<u64>(&bytes))
                        .transpose()?
                        .unwrap_or(0);
                    batch
                        .put(b"count", &bincode::serialize(&(count + 1))?)
                        .await?;
                    batch.put(key.as_bytes(), b"present").await?;
                    match batch.commit().await? {
                        Commit::Published { .. } => {
                            published = true;
                            break;
                        }
                        Commit::Conflict => {
                            conflicts += 1;
                            tokio::task::yield_now().await;
                        }
                    }
                }
                anyhow::ensure!(published, "publication retries exhausted");
            }
            Ok::<_, anyhow::Error>((conflicts, store.stats()))
        }));
    }
    let mut conflicts = 0;
    for task in tasks {
        let (count, stats) = task.await??;
        conflicts += count;
        assert!(stats.cache.resident_bytes <= stats.cache.capacity_bytes);
    }
    assert!(conflicts > 0, "test must exercise overlapping publications");
    let cold = Store::connect(config(&namespace, 0)).await?;
    assert_eq!(cold.stats().object_reads, 0);
    let snapshot = cold.snapshot("same-tenant").await?;
    assert_eq!(
        cold.stats().object_reads,
        0,
        "snapshot must not replay or materialize tenant"
    );
    let count: u64 = bincode::deserialize(&snapshot.get(b"count").await?.unwrap())?;
    assert_eq!(count, (workers * iterations) as u64);
    let rows = snapshot.scan(b"worker/", None, 256).await?;
    assert_eq!(rows.len(), workers * iterations);
    assert!(snapshot.revision() > 0);
    assert_eq!(cold.stats().cache.resident_bytes, 0);
    Ok(())
}

async fn atomic_conflicts_and_stable_snapshots() -> anyhow::Result<()> {
    let namespace = namespace();
    let first = Store::connect(config(&namespace, 1 << 20)).await?;
    let second = Store::connect(config(&namespace, 1 << 20)).await?;
    let mut seed = first.snapshot("tenant").await?.batch();
    seed.put(b"source", b"old").await?;
    assert!(matches!(seed.commit().await?, Commit::Published { .. }));
    let old = first.snapshot("tenant").await?;
    let mut rename = old.clone().batch();
    let mut competitor = second.snapshot("tenant").await?.batch();
    rename.delete(b"source").await?;
    rename.put(b"destination", b"old").await?;
    competitor.put(b"source", b"replacement").await?;
    competitor.put(b"partial-must-not-appear", b"no").await?;
    assert!(matches!(rename.commit().await?, Commit::Published { .. }));
    assert_eq!(competitor.commit().await?, Commit::Conflict);
    let latest = second.snapshot("tenant").await?;
    assert_eq!(old.get(b"source").await?, Some(b"old".to_vec()));
    assert_eq!(old.get(b"destination").await?, None);
    assert_eq!(latest.get(b"source").await?, None);
    assert_eq!(latest.get(b"destination").await?, Some(b"old".to_vec()));
    assert_eq!(latest.get(b"partial-must-not-appear").await?, None);
    assert_eq!(
        first
            .snapshot("other-tenant")
            .await?
            .get(b"destination")
            .await?,
        None
    );
    Ok(())
}

async fn ordered_scans_survive_edits_eviction_and_empty_cache_restart() -> anyhow::Result<()> {
    let namespace = namespace();
    let store = Store::connect(config(&namespace, 8 << 10)).await?;
    let mut expected = BTreeMap::new();
    let mut batch = store.snapshot("tenant").await?.batch();
    for n in 0..240 {
        let key = format!("files/{:04}", (n * 137) % 241).into_bytes();
        let value = vec![(n % 251) as u8; 192];
        batch.put(&key, &value).await?;
        expected.insert(key, value);
    }
    batch
        .put(b"filestoo/", b"must not leak into prefix")
        .await?;
    assert!(matches!(batch.commit().await?, Commit::Published { .. }));
    let original = store.snapshot("tenant").await?;
    let mut batch = original.clone().batch();
    for n in 0..80 {
        let key = format!("files/{:04}", n * 3).into_bytes();
        batch.delete(&key).await?;
        expected.remove(&key);
    }
    for n in 0..30 {
        let key = format!("files/{:04}", n * 7).into_bytes();
        batch.put(&key, b"changed").await?;
        expected.insert(key, b"changed".to_vec());
    }
    assert!(matches!(batch.commit().await?, Commit::Published { .. }));
    drop(store);
    let restarted = Store::connect(config(&namespace, 8 << 10)).await?;
    assert_eq!(restarted.stats().object_reads, 0);
    let snapshot = restarted.snapshot("tenant").await?;
    assert_eq!(restarted.stats().object_reads, 0);
    let mut actual = BTreeMap::new();
    let mut after = None;
    loop {
        let page = snapshot.scan(b"files/", after.as_deref(), 17).await?;
        if page.is_empty() {
            break;
        }
        after = page.last().map(|(key, _)| key.clone());
        for (key, value) in page {
            assert!(actual.insert(key, value).is_none());
        }
    }
    assert_eq!(actual, expected);
    assert_eq!(original.scan(b"files/", None, 256).await?.len(), 240);
    for (key, value) in expected.iter().step_by(11) {
        assert_eq!(snapshot.get(key).await?.as_ref(), Some(value));
    }
    assert!(restarted.stats().cache.resident_bytes <= 8 << 10);
    let mut batch = snapshot.batch();
    for key in expected.keys() {
        batch.delete(key).await?;
    }
    batch.delete(b"filestoo/").await?;
    assert!(matches!(batch.commit().await?, Commit::Published { .. }));
    assert!(
        restarted
            .snapshot("tenant")
            .await?
            .scan(b"", None, 17)
            .await?
            .is_empty()
    );
    Ok(())
}

async fn rejected_growth_cannot_publish_partial_batch() -> anyhow::Result<()> {
    let namespace = namespace();
    let mut config = config(&namespace, 0);
    config.max_mutations = 2;
    let store = Store::connect(config).await?;
    let mut batch = store.snapshot("tenant").await?.batch();
    batch.put(b"one", b"1").await?;
    batch.put(b"two", b"2").await?;
    assert!(matches!(
        batch.put(b"three", b"3").await,
        Err(Error::Capacity(_))
    ));
    assert!(matches!(batch.commit().await, Err(Error::FailedBatch)));
    let snapshot = store.snapshot("tenant").await?;
    assert!(snapshot.revision() > 0);
    assert!(snapshot.scan(b"", None, 10).await?.is_empty());
    Ok(())
}

async fn chunk_boundaries_and_expiring_snapshots() -> anyhow::Result<()> {
    let namespace = namespace();
    let store = Store::connect(config(&namespace, 0)).await?;
    let mut batch = store.snapshot("tenant").await?.batch();
    let sizes: [usize; 7] = [0, 1, 65_535, 65_536, 65_537, 100_001, 1 << 20];
    for size in sizes {
        batch.put(&size.to_be_bytes(), &vec![42; size]).await?;
    }
    assert!(matches!(batch.commit().await?, Commit::Published { .. }));
    let old = store.snapshot("tenant").await?;
    let mut replacement = old.clone().batch();
    replacement
        .put(&(1usize << 20).to_be_bytes(), b"new")
        .await?;
    assert!(matches!(
        replacement.commit().await?,
        Commit::Published { .. }
    ));
    for size in sizes {
        assert_eq!(old.get(&size.to_be_bytes()).await?, Some(vec![42; size]));
    }
    tokio::time::sleep(std::time::Duration::from_secs(4)).await;
    assert!(matches!(old.get(b"expired").await, Err(Error::Deadline)));
    let cold = Store::connect(config(&namespace, 0)).await?;
    assert_eq!(
        cold.snapshot("tenant")
            .await?
            .get(&(1usize << 20).to_be_bytes())
            .await?,
        Some(b"new".to_vec())
    );
    Ok(())
}

async fn large_publication_and_corrupt_chunks() -> anyhow::Result<()> {
    use sha2::{Digest, Sha256};
    let namespace = namespace();
    let config = config(&namespace, 0);
    let store = Store::connect(config.clone()).await?;
    let mut batch = store.snapshot("tenant").await?.batch();
    for index in 0u8..3 {
        batch.put(&[index], &vec![index; 1 << 20]).await?;
    }
    assert!(matches!(
        batch.put(&[3], &vec![3; 1 << 20]).await,
        Err(Error::Capacity(_))
    ));
    assert!(matches!(batch.commit().await, Err(Error::FailedBatch)));
    assert!(
        store
            .snapshot("tenant")
            .await?
            .scan(b"", None, 16)
            .await?
            .is_empty()
    );
    let mut batch = store.snapshot("tenant").await?.batch();
    batch.put(&[7], &vec![7; 1 << 20]).await?;
    assert!(matches!(batch.commit().await?, Commit::Published { .. }));
    let snapshot = store.snapshot("tenant").await?;
    assert_eq!(snapshot.get(&[7]).await?, Some(vec![7; 1 << 20]));
    let database = foundationdb::Database::new(Some(&config.cluster_file))?;
    let tenant = format!("{:x}", Sha256::digest(b"tenant"));
    let mut key = format!("dfs-fdb-v2/{namespace}/tenant/{tenant}/").into_bytes();
    key.push(1);
    key.extend_from_slice(&Sha256::digest(vec![7; 1 << 20]));
    key.extend_from_slice(&3u32.to_be_bytes());
    let transaction = database.create_trx()?;
    transaction.clear(&key);
    transaction.commit().await?;
    assert!(matches!(
        store.snapshot("tenant").await?.get(&[7]).await,
        Err(Error::Corrupt(_))
    ));
    let transaction = database.create_trx()?;
    transaction.set(&key, &vec![9; 64 << 10]);
    transaction.commit().await?;
    assert!(matches!(
        store.snapshot("tenant").await?.get(&[7]).await,
        Err(Error::Corrupt(_))
    ));
    Ok(())
}

async fn independent_records_and_snapshot_dependencies() -> anyhow::Result<()> {
    let namespace = namespace();
    let first = Store::connect(config(&namespace, 0)).await?;
    let second = Store::connect(config(&namespace, 0)).await?;
    let snapshot = first.snapshot("tenant").await?;
    let mut a = snapshot.clone().batch();
    let mut b = snapshot.clone().batch();
    a.put(b"a", b"1").await?;
    b.put(b"b", b"2").await?;
    assert!(matches!(a.commit().await?, Commit::Published { .. }));
    assert!(matches!(b.commit().await?, Commit::Published { .. }));
    assert_eq!(snapshot.get(b"a").await?, None);
    let observed = first.snapshot("tenant").await?;
    assert!(observed.scan(b"dir/", None, 10).await?.is_empty());
    assert_eq!(observed.get(b"a").await?, Some(b"1".to_vec()));
    let mut concurrent = second.snapshot("tenant").await?.batch();
    concurrent.put(b"dir/new", b"entry").await?;
    assert!(matches!(
        concurrent.commit().await?,
        Commit::Published { .. }
    ));
    let mut stale = observed.batch();
    stale
        .put(b"must-not-appear", b"stale directory observation")
        .await?;
    assert_eq!(stale.commit().await?, Commit::Conflict);
    assert_eq!(
        first
            .snapshot("tenant")
            .await?
            .get(b"must-not-appear")
            .await?,
        None
    );
    let observed = first.snapshot("tenant").await?;
    assert_eq!(observed.get(b"a").await?, Some(b"1".to_vec()));
    let mut concurrent = second.snapshot("tenant").await?.batch();
    concurrent.put(b"a", b"changed").await?;
    assert!(matches!(
        concurrent.commit().await?,
        Commit::Published { .. }
    ));
    let mut stale = observed.batch();
    stale
        .put(b"must-not-appear", b"stale point observation")
        .await?;
    assert_eq!(stale.commit().await?, Commit::Conflict);
    Ok(())
}

mod support;

fn main() {
    support::main(vec![
        libtest_mimic::Trial::test("independent_records_and_snapshot_dependencies", || {
            support::run(independent_records_and_snapshot_dependencies())
        })
        .with_ignored_flag(true),
        libtest_mimic::Trial::test("independent_clients_publish_without_lost_updates", || {
            support::run(independent_clients_publish_without_lost_updates())
        })
        .with_ignored_flag(true),
        libtest_mimic::Trial::test("atomic_conflicts_and_stable_snapshots", || {
            support::run(atomic_conflicts_and_stable_snapshots())
        })
        .with_ignored_flag(true),
        libtest_mimic::Trial::test(
            "ordered_scans_survive_edits_eviction_and_empty_cache_restart",
            || support::run(ordered_scans_survive_edits_eviction_and_empty_cache_restart()),
        )
        .with_ignored_flag(true),
        libtest_mimic::Trial::test("rejected_growth_cannot_publish_partial_batch", || {
            support::run(rejected_growth_cannot_publish_partial_batch())
        })
        .with_ignored_flag(true),
        libtest_mimic::Trial::test("chunk_boundaries_and_expiring_snapshots", || {
            support::run(chunk_boundaries_and_expiring_snapshots())
        })
        .with_ignored_flag(true),
        libtest_mimic::Trial::test("large_publication_and_corrupt_chunks", || {
            support::run(large_publication_and_corrupt_chunks())
        })
        .with_ignored_flag(true),
    ]);
}
