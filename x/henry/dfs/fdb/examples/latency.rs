//! Measures serial FDB latencies on this machine: GRV, point read, commit with fresh and cached
//! read versions. Used to size the per-file round-trip budget in DESIGN.md.

use std::time::Instant;

use dfs_fdb::{FdbStore, run_with_network};
use dfs_store::{Store, Txn, TxnOptions};

fn main() -> anyhow::Result<()> {
    let cluster = std::env::var("FDB_CLUSTER_FILE")?;
    // DFS_FDB_CLIENT_KNOBS="name=value,..." matches Spolu's client knob overrides.
    let knobs: Vec<(String, String)> = std::env::var("DFS_FDB_CLIENT_KNOBS")
        .unwrap_or_default()
        .split(',')
        .filter_map(|pair| pair.split_once('=').map(|(k, v)| (k.to_string(), v.to_string())))
        .collect();
    let knobs: Vec<(&str, String)> = knobs.iter().map(|(k, v)| (k.as_str(), v.clone())).collect();
    run_with_network(&knobs, async move {
        let store = FdbStore::open(&cluster, b"latency-probe/")?;
        let n = 500;
        let mut grv = Vec::new();
        let mut fresh = Vec::new();
        let mut cached = Vec::new();
        let mut read = Vec::new();
        let mut version = None;
        for i in 0..n {
            let started = Instant::now();
            let mut txn = store.begin(TxnOptions::default()).await?;
            grv.push(started.elapsed());
            let started = Instant::now();
            txn.get(b"fence").await?;
            read.push(started.elapsed());
            txn.set(format!("k/{i}").as_bytes(), &[0u8; 17_000]);
            let started = Instant::now();
            version = Some(txn.commit().await?);
            fresh.push(started.elapsed());
        }
        for i in 0..n {
            let started = Instant::now();
            let mut txn = store.begin(TxnOptions { read_version: version }).await?;
            txn.get(b"fence").await?;
            txn.set(format!("c/{i}").as_bytes(), &[0u8; 17_000]);
            txn.commit().await?;
            cached.push(started.elapsed());
        }
        store.wipe().await?;
        for (name, mut samples) in [("grv", grv), ("read", read), ("commit", fresh), ("cached-rv txn", cached)] {
            samples.sort();
            let p = |q: f64| samples[((samples.len() - 1) as f64 * q) as usize].as_secs_f64() * 1e3;
            println!("{name:>14}: p50 {:.3} ms  p90 {:.3} ms  p99 {:.3} ms", p(0.5), p(0.9), p(0.99));
        }
        Ok(())
    })
}
