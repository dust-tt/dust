//! Isolated synthetic topology measurements; no FDB, filesystem content or RPC timing.
use anyhow::{Context, Result, ensure};
use dfs_core::{
    tree::{Builder, GrantId, Image, Update},
    tree_log::Stamp,
};
use dfs_protocol::{ObjectId, ObjectRef};
use std::{hint::black_box, time::Instant};

fn id(index: usize) -> Result<ObjectId> {
    let mut bytes = [0; 16];
    let mixed = (index as u64).wrapping_mul(0x9e3779b97f4a7c15);
    bytes[..8].copy_from_slice(&mixed.to_be_bytes());
    bytes[8..].copy_from_slice(&(index as u64).to_be_bytes());
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    Ok(ObjectId::from_bytes(bytes)?)
}

fn memory() -> Result<serde_json::Value> {
    let status = std::fs::read_to_string("/proc/self/status")?;
    let value = |name: &str| -> Result<u64> {
        let line = status
            .lines()
            .find(|line| line.starts_with(name))
            .context("RSS field")?;
        Ok(line
            .split_whitespace()
            .nth(1)
            .context("RSS value")?
            .parse::<u64>()?
            * 1024)
    };
    Ok(serde_json::json!({"rss_bytes": value("VmRSS:")?, "peak_rss_bytes": value("VmHWM:")?}))
}

/// @cc [owner:spolu,label:testing;performance] synthetic-tree-measurements
/// Every published synthetic node MUST be retained by the real Builder/Tree implementation.
/// Reports MUST distinguish accounted bytes from process RSS, usable index capacity from object
/// count, and pure in-memory authorization throughput from FDB bootstrap or filesystem throughput.
/// Synthetic IDs MUST be unique valid v4-shaped values; they MUST NOT be used as production IDs.
fn main() -> Result<()> {
    let args: Vec<usize> = std::env::args()
        .skip(1)
        .map(|arg| arg.parse())
        .collect::<Result<_, _>>()?;
    ensure!(
        args.len() == 4,
        "usage: tree_scale NODES DEPTH GRANT_EVERY DISTINCT_SETS"
    );
    let [nodes, depth, grant_every, sets] = [args[0], args[1], args[2], args[3]];
    ensure!((1..=100_000_000).contains(&nodes) && (1..=4095).contains(&depth) && nodes > depth);
    ensure!(grant_every > 0 && (1..=1_000_000).contains(&sets));
    let mut stamp = [0; 10];
    stamp[..8].copy_from_slice(&1i64.to_be_bytes());
    let started = Instant::now();
    let mut builder = Builder::new(id(0)?, usize::MAX);
    let mut attached = 0;
    for index in 0..nodes {
        let grants = if index == 0 {
            vec![GrantId(1)]
        } else if index % grant_every == 0 {
            attached += 1;
            vec![GrantId(2 + ((index / grant_every) % sets) as u32)]
        } else {
            Vec::new()
        };
        builder.merge(
            Stamp(stamp),
            Update::Live(Image {
                id: id(index)?,
                parent: if index == 0 {
                    None
                } else {
                    Some(id((index - 1).min(depth - 1))?)
                },
                directory: index < depth,
                grants,
            }),
        )?;
    }
    let builder_bytes = builder.memory_bytes();
    let before_finish = memory()?;
    let built_seconds = started.elapsed().as_secs_f64();
    let finish = Instant::now();
    let tree = builder.finish()?;
    let finish_seconds = finish.elapsed().as_secs_f64();
    ensure!(tree.len() == nodes);
    let after_finish = memory()?;
    let mut samples = Vec::new();
    for allowed in [true, false] {
        let grants = [if allowed {
            GrantId(1)
        } else {
            GrantId(u32::MAX)
        }];
        let started = Instant::now();
        for query in 0..1_000_000u64 {
            let index = query.wrapping_mul(0x9e3779b97f4a7c15) as usize % nodes;
            ensure!(black_box(tree.allows(id(index)?, &grants)) == allowed);
        }
        let elapsed_seconds = started.elapsed().as_secs_f64();
        samples.push(serde_json::json!({"allowed":allowed,"queries":1_000_000,
            "elapsed_seconds":elapsed_seconds,"queries_per_second":1_000_000.0/elapsed_seconds}));
    }
    println!(
        "{}",
        serde_json::json!({
            "nodes":nodes,"directory_chain_nodes":depth,"grant_every":grant_every,
            "distinct_sets_limit":sets,"explicit_grant_nodes_excluding_root":attached,
            "object_id_bytes":size_of::<ObjectId>(),"object_ref_bytes":size_of::<ObjectRef>(),
            "index_usable_capacity":tree.index_capacity(),
            "index_usable_occupancy":nodes as f64/tree.index_capacity() as f64,
            "builder_accounted_bytes":builder_bytes,"tree_accounted_bytes":tree.memory_bytes(),
            "build_seconds":built_seconds,"finish_seconds":finish_seconds,
            "before_finish":before_finish,"after_finish":after_finish,"authorization":samples,
            "final_memory":memory()?,
        })
    );
    Ok(())
}
