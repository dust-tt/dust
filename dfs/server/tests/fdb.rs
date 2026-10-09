use std::time::{Duration, Instant};

use anyhow::Result;
use dfs_api::storage::fdb;

/// Same lookup as the server: dust-hive envs export their own cluster file through `env.sh`.
fn cluster_file() -> String {
    std::env::var("FDB_CLUSTER_FILE").unwrap_or_else(|_| "fdb.cluster".to_owned())
}

const PING_DEADLINE_HEADROOM_MS: i32 = 5_000;
const UNREACHABLE_PING_DEADLINE: Duration =
    Duration::from_millis((fdb::PING_TIMEOUT_MS + PING_DEADLINE_HEADROOM_MS) as u64);

#[tokio::test]
async fn fdb_answers_a_transaction() -> Result<()> {
    let database = fdb::open(&cluster_file())?;

    fdb::ping(&database).await?;
    Ok(())
}

#[tokio::test]
async fn ping_fails_instead_of_hanging_when_fdb_is_unreachable() -> Result<()> {
    let cluster_file =
        std::env::temp_dir().join(format!("dfs-unreachable-{}.cluster", std::process::id()));
    std::fs::write(&cluster_file, "test:test@127.0.0.1:1\n")?;
    let database = fdb::open(&cluster_file.to_string_lossy())?;
    let started = Instant::now();

    let result = fdb::ping(&database).await;

    std::fs::remove_file(&cluster_file)?;
    assert!(result.is_err());
    assert!(started.elapsed() < UNREACHABLE_PING_DEADLINE);
    Ok(())
}
