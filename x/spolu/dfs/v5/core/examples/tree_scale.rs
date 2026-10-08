//! Isolated synthetic topology measurements; no FDB, filesystem content or RPC timing.
use anyhow::{Context, Result, ensure};
use dfs_core::{
    tree::{Access, Builder, GrantId, Image, Proof, TenantTree, Tree, Update},
    tree_log::Stamp,
};
use dfs_protocol::{ObjectId, ObjectRef};
use std::{
    hint::black_box,
    time::{Duration, Instant},
};

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

fn parent(index: usize, depth: usize, paths: usize) -> Option<usize> {
    let directories = 1 + (depth - 1) * paths;
    if index == 0 {
        None
    } else if index < directories {
        Some(if (index - 1).is_multiple_of(depth - 1) {
            0
        } else {
            index - 1
        })
    } else {
        Some((1 + (index - directories) % paths) * (depth - 1))
    }
}

/// @cc [owner:spolu,label:testing;performance] measured-permission-access
/// Timings MUST call the production evaluator and verify every result. Query construction MUST
/// occur outside access timings. Reports MUST distinguish aggregate mean time from individually
/// clocked percentiles, include a timer-floor measurement, and exclude query storage from tree bytes.
fn measure(
    name: &str,
    queries: &[(ObjectId, Option<ObjectId>)],
    mut check: impl FnMut(&(ObjectId, Option<ObjectId>)) -> Result<bool>,
) -> Result<serde_json::Value> {
    for query in queries.iter().take(4096) {
        ensure!(black_box(check(black_box(query))?));
    }
    let mut mean_ns = Vec::new();
    for _ in 0..3 {
        let started = Instant::now();
        for query in queries {
            ensure!(black_box(check(black_box(query))?));
        }
        mean_ns.push(started.elapsed().as_secs_f64() * 1e9 / queries.len() as f64);
    }
    mean_ns.sort_by(f64::total_cmp);
    let mut latency_ns = Vec::with_capacity(100_000);
    for index in 0..100_000 {
        let query = black_box(&queries[(index * 7919) % queries.len()]);
        let started = Instant::now();
        let valid = black_box(check(query)?);
        latency_ns.push(started.elapsed().as_nanos() as u64);
        ensure!(valid);
    }
    latency_ns.sort_unstable();
    Ok(
        serde_json::json!({"operation":name,"queries_per_repeat":queries.len(),"repeats":3,
        "median_mean_ns":mean_ns[1],"repeat_mean_ns":mean_ns,
        "queries_per_second":1e9/mean_ns[1],"latency_samples":latency_ns.len(),
        "p50_ns":latency_ns[50_000],"p95_ns":latency_ns[95_000],
        "p99_ns":latency_ns[99_000],"max_ns":latency_ns[99_999]}),
    )
}

fn access(tree: Tree, nodes: usize, depth: usize, paths: usize) -> Result<serde_json::Value> {
    let queries = (0..1_000_000u64)
        .map(|query| {
            let index = query.wrapping_mul(0x9e3779b97f4a7c15) as usize % nodes;
            Ok((id(index)?, parent(index, depth, paths).map(id).transpose()?))
        })
        .collect::<Result<Vec<_>>>()?;
    let mut floor_ns = (0..100_000)
        .map(|_| {
            let started = black_box(Instant::now());
            started.elapsed().as_nanos() as u64
        })
        .collect::<Vec<_>>();
    floor_ns.sort_unstable();
    let mut measurements = vec![
        measure("uuid_lookup", &queries, |(id, _)| Ok(tree.contains(*id)))?,
        measure("allows", &queries, |(id, _)| {
            Ok(tree.allows(*id, &[GrantId(1)]))
        })?,
        measure("denies", &queries, |(id, _)| {
            Ok(!tree.allows(*id, &[GrantId(u32::MAX)]))
        })?,
    ];
    let proof = Proof {
        incarnation: id(nodes + 1)?,
        generation: 1,
        read_version: 1,
        poll_started: Instant::now(),
    };
    let tenant = TenantTree::new(tree, proof, Duration::from_secs(30))?;
    measurements.push(measure(
        "authorize_object_allow",
        &queries,
        |(id, parent)| {
            Ok(tenant
                .authorize_object(*id, *parent, &[GrantId(1)], Instant::now())?
                .1
                == Access::Allowed)
        },
    )?);
    measurements.push(measure(
        "authorize_object_deny",
        &queries,
        |(id, parent)| {
            Ok(tenant
                .authorize_object(*id, *parent, &[GrantId(u32::MAX)], Instant::now())?
                .1
                == Access::Denied)
        },
    )?);
    let mut batch = Vec::new();
    for allowed in [true, false] {
        let grants = [if allowed {
            GrantId(1)
        } else {
            GrantId(u32::MAX)
        }];
        let ids = queries.iter().map(|(id, _)| *id).collect::<Vec<_>>();
        let started = Instant::now();
        for chunk in ids.chunks(256) {
            let (_, decisions) = tenant.authorize(black_box(chunk), &grants, Instant::now())?;
            ensure!(decisions.len() == chunk.len() && decisions.iter().all(|v| *v == allowed));
            black_box(decisions);
        }
        batch.push(
            serde_json::json!({"allowed":allowed,"batch_size":256,"candidates":ids.len(),
            "mean_ns_per_candidate":started.elapsed().as_secs_f64()*1e9/ids.len() as f64}),
        );
    }
    Ok(
        serde_json::json!({"measurements":measurements,"filter_batches":batch,
        "timer_floor_p50_ns":floor_ns[50_000],"timer_floor_p99_ns":floor_ns[99_000],
        "query_storage_bytes":queries.capacity()*size_of::<(ObjectId,Option<ObjectId>)>(),
        "rss_including_benchmark_queries":memory()?}),
    )
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
        (4..=5).contains(&args.len()),
        "usage: tree_scale NODES DEPTH GRANT_EVERY DISTINCT_SETS [PATHS]"
    );
    let [nodes, depth, grant_every, sets] = [args[0], args[1], args[2], args[3]];
    ensure!((1..=100_000_000).contains(&nodes) && (1..=4095).contains(&depth) && nodes > depth);
    ensure!(grant_every > 0 && (1..=1_000_000).contains(&sets));
    let paths = args.get(4).copied().unwrap_or(1);
    ensure!(depth >= 2 && paths > 0 && paths <= (nodes - 2) / (depth - 1));
    let directories = 1 + (depth - 1) * paths;
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
                parent: parent(index, depth, paths).map(id).transpose()?,
                directory: index < directories,
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
    let tree_bytes = tree.memory_bytes();
    let index_capacity = tree.index_capacity();
    let before_access = memory()?;
    let access = access(tree, nodes, depth, paths)?;
    println!(
        "{}",
        serde_json::json!({
            "nodes":nodes,"directory_chain_nodes":depth,"directory_paths":paths,
            "directory_nodes":directories,"grant_every":grant_every,
            "distinct_sets_limit":sets,"explicit_grant_nodes_excluding_root":attached,
            "object_id_bytes":size_of::<ObjectId>(),"object_ref_bytes":size_of::<ObjectRef>(),
            "index_usable_capacity":index_capacity,
            "index_usable_occupancy":nodes as f64/index_capacity as f64,
            "builder_accounted_bytes":builder_bytes,"tree_accounted_bytes":tree_bytes,
            "build_seconds":built_seconds,"finish_seconds":finish_seconds,
            "before_finish":before_finish,"after_finish":after_finish,"authorization":samples,
            "final_memory":before_access,"access":access,
        })
    );
    Ok(())
}
