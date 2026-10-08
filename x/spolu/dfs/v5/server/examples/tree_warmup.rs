//! Measure a complete permission replica loaded from durable FDB into an empty process.
use anyhow::{Context, Result, ensure};
use clap::Parser;
use dfs_core::{
    grants,
    keys::{Keys, prefix_end},
    model::TenantRecord,
    storage::decode,
    tree::GrantId,
};
use dfs_protocol::ObjectId;
use dfs_server_v5::{
    storage::{Storage, StorageConfig},
    tree_feed::{Config as FeedConfig, Replica},
};
use serde_json::json;
use std::{collections::BTreeSet, time::Instant};

#[derive(Parser)]
struct Config {
    #[command(flatten)]
    storage: StorageConfig,
    #[arg(long)]
    tenant: String,
    #[arg(long)]
    expected_nodes: usize,
    #[arg(long, default_value_t = 24 * 1024 * 1024 * 1024)]
    peak_bytes: usize,
    #[arg(long, default_value_t = 4096)]
    page_nodes: usize,
}

fn memory() -> Result<serde_json::Value> {
    let status = std::fs::read_to_string("/proc/self/status")?;
    let value = |name: &str| -> Result<u64> {
        Ok(status
            .lines()
            .find_map(|line| line.strip_prefix(name))
            .context("process memory counter")?
            .split_whitespace()
            .next()
            .context("memory value")?
            .parse::<u64>()?
            * 1024)
    };
    Ok(json!({"rss_bytes": value("VmRSS:")?, "peak_rss_bytes": value("VmHWM:")?}))
}

/// @cc [owner:spolu,label:testing;performance] durable-bootstrap-measurement
/// The timed interval MUST call the production FDB bootstrap with a new process and no prebuilt
/// tree. Report backend caches as retained. Verify the exact node count and sampled authorization;
/// synthetic construction MUST NOT be reported as this measurement.
fn main() -> Result<()> {
    dfs_server_v5::network::run(async {
        let config = Config::parse();
        let storage = Storage::open(&config.storage).await?;
        let keys = Keys::new(&config.tenant)?;
        let initial = storage.snapshot().await?;
        let tenant: TenantRecord = decode(&initial.get(keys.tenant()).await?.context("tenant")?)?;
        let owner: Vec<GrantId> =
            grants::resolve(&initial, &keys, &BTreeSet::from(["owner".into()])).await?;
        ensure!(!owner.is_empty(), "fixture must have an owner grant");
        drop(initial);
        let before = memory()?;
        let started = Instant::now();
        let mut feed = FeedConfig::default();
        feed.tenant_peak_bytes = config.peak_bytes;
        feed.base_page_nodes = config.page_nodes;
        let replica =
            Replica::bootstrap(storage.clone(), &config.tenant, tenant.root.real()?, feed).await?;
        let elapsed = started.elapsed().as_secs_f64();
        let after = memory()?;
        ensure!(
            replica.tree.len() == config.expected_nodes,
            "unexpected node count: {}",
            replica.tree.len()
        );
        let rows = storage
            .snapshot()
            .await?
            .range(&keys.tree_nodes(), &prefix_end(&keys.tree_nodes()), 4096)
            .await?
            .0;
        let ids = rows
            .keys()
            .map(|key| ObjectId::try_from(&key[keys.tree_nodes().len()..]))
            .collect::<Result<Vec<_>, _>>()?;
        let now = Instant::now();
        let (_, allowed) = replica.tree.authorize(&ids, &owner, now)?;
        ensure!(
            allowed.iter().all(|allowed| *allowed),
            "owner authorization mismatch"
        );
        let (_, denied) = replica.tree.authorize(&ids, &[], now)?;
        ensure!(
            denied.iter().all(|allowed| !allowed),
            "empty grants unexpectedly authorize"
        );
        println!(
            "{}",
            json!({"tenant": config.tenant, "nodes": replica.tree.len(),
            "bootstrap_seconds": elapsed, "tree_accounted_bytes": replica.tree.memory_bytes(),
            "before": before, "after": after, "verified_candidates": ids.len(),
            "base_page_nodes": config.page_nodes, "tenant_peak_budget_bytes": config.peak_bytes,
            "read_version": replica.tree.proof().read_version,
            "cold_scope": "new process and empty permission RAM; FDB and OS caches retained"})
        );
        Ok(())
    })
}
