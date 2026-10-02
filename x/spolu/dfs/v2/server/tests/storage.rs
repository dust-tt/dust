use anyhow::{Context, Result, ensure};
use dfs_server_v2::{
    network,
    storage::{Storage, StorageConfig, WriteBatch},
};

#[test]
fn local_fdb_transactions_and_recovery() -> Result<()> {
    network::run(async {
        let config = StorageConfig {
            fdb_cluster_file: std::env::var("DFS_FDB_CLUSTER_FILE")?,
            fdb_prefix: format!("dfs-v2-tests-{}", uuid::Uuid::new_v4().simple()),
        };
        let store = Storage::open(&config).await?;
        store
            .transact(|_| async {
                let mut batch = WriteBatch::new();
                for i in 0_u32..200 {
                    batch.put(i.to_be_bytes(), i.to_be_bytes());
                }
                batch.put(b"block", vec![19; 65_536]);
                Ok((batch, ()))
            })
            .await?;
        let snapshot = store.snapshot().await?;
        let mut scan = snapshot
            .scan(vec![0]..200_u32.to_be_bytes().to_vec())
            .await?;
        let mut count = 0_u32;
        while let Some(row) = scan.next().await? {
            ensure!(row.key.as_ref() == count.to_be_bytes());
            count += 1_u32;
        }
        ensure!(count == 200);
        drop(scan);
        drop(snapshot);

        // A rejected batch must not leave even its first valid write behind.
        let rejected = store
            .transact(|_| async {
                let mut batch = WriteBatch::new();
                batch.put(b"never", b"partial");
                batch.put(b"too-large", vec![0; 100_001]);
                Ok((batch, ()))
            })
            .await;
        ensure!(rejected.is_err());
        ensure!(store.get(b"never").await?.is_none());

        // One read version must remain coherent across a concurrent committed write.
        let view = store.snapshot().await?;
        assert!(view.get(b"snapshot-key").await?.is_none());
        store
            .transact(|_| async {
                let mut batch = WriteBatch::new();
                batch.put(b"snapshot-key", b"new");
                Ok((batch, ()))
            })
            .await?;
        assert!(view.get(b"snapshot-key").await?.is_none());
        assert_eq!(
            store
                .get(b"snapshot-key")
                .await?
                .context("new value")?
                .as_ref(),
            b"new"
        );
        drop(view);
        let oversized = store
            .transact(|_| async {
                let mut batch = WriteBatch::new();
                batch.put(b"oversized-first", b"absent");
                for i in 0_u32..150 {
                    batch.put(i.to_be_bytes(), vec![0; 65_536]);
                }
                Ok((batch, ()))
            })
            .await;
        assert!(oversized.is_err());
        assert!(store.get(b"oversized-first").await?.is_none());
        assert_eq!(
            store
                .get(0_u32.to_be_bytes())
                .await?
                .context("original value")?
                .len(),
            4
        );

        let expired = store.snapshot().await?;
        expired.get(b"block").await?;
        tokio::time::sleep(std::time::Duration::from_millis(4100)).await;
        assert!(expired.get(b"block").await.is_err());
        drop(expired);

        let increment = || {
            store.transact(|view| async move {
                let value = view.get(b"counter").await?;
                let value = value.as_ref().map_or(0, |v| v[0]);
                tokio::task::yield_now().await;
                let mut batch = WriteBatch::new();
                batch.put(b"counter", [value + 1]);
                Ok((batch, ()))
            })
        };
        let (a, b) = tokio::join!(increment(), increment());
        a?;
        b?;
        ensure!(store.get(b"counter").await?.context("counter")?[0] == 2);

        // A new client must recover committed data, while a neighboring subspace stays separate.
        let reopened = Storage::open(&config).await?;
        ensure!(reopened.get(b"block").await?.context("block")?.len() == 65_536);
        let other = Storage::open(&StorageConfig {
            fdb_prefix: format!("{}-neighbor", config.fdb_prefix),
            ..config.clone()
        })
        .await?;
        ensure!(other.get(b"block").await?.is_none());
        for storage in [&store, &other] {
            storage
                .transact(|_| async {
                    let mut batch = WriteBatch::new();
                    batch.clear(Vec::new(), vec![255]);
                    Ok((batch, ()))
                })
                .await?;
        }
        Ok(())
    })
}
