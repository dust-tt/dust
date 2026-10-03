use super::{
    display_move_suggestions, parse_ratio, placement_rejection, ClusterSnapshot, ShardMove,
};
use anyhow::{anyhow, ensure, Context, Result};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

#[derive(Debug, clap::Args)]
pub(super) struct MemoryArgs {
    /// Recommend one memory move using resident bytes apportioned by source-peer points.
    #[arg(long, group = "memory_source")]
    estimate_memory: bool,

    /// Recommend one memory move using a JSON array of per-replica component RAM reports.
    #[arg(long, group = "memory_source")]
    replica_memory_reports: Option<PathBuf>,

    /// JSON array of current cgroup usage and verified limits for every peer.
    #[arg(long, requires = "memory_source")]
    cgroup_memory: Option<PathBuf>,

    /// Maximum age of placement, telemetry, and imported measurements, in seconds.
    #[arg(long, default_value_t = 300, requires = "memory_source", value_parser = clap::value_parser!(u64).range(1..))]
    memory_max_age_seconds: u64,

    /// Fraction of the destination cgroup limit to keep free, including transfer overhead.
    #[arg(long, default_value_t = 0.15, requires = "cgroup_memory", value_parser = parse_ratio)]
    memory_headroom_ratio: f64,

    /// Extra fraction of replica RAM reserved on BOTH peers during transfer (an estimate).
    #[arg(long, default_value_t = 0.25, requires = "memory_source", value_parser = parse_ratio)]
    transfer_overhead_ratio: f64,
}

impl Default for MemoryArgs {
    fn default() -> Self {
        Self {
            estimate_memory: false,
            replica_memory_reports: None,
            cgroup_memory: None,
            memory_max_age_seconds: 300,
            memory_headroom_ratio: 0.15,
            transfer_overhead_ratio: 0.25,
        }
    }
}

impl MemoryArgs {
    pub(super) fn enabled(&self) -> bool {
        self.estimate_memory || self.replica_memory_reports.is_some()
    }
}

#[derive(Debug, Clone, Copy)]
pub(super) struct PeerMemorySample {
    pub(super) resident_bytes: u64,
    pub(super) collected_at: Instant,
}

// These files use bytes throughout. Cgroup usage includes the allocator AND file-page cache;
// component RAM excludes file-page cache. They must never be substituted for each other.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ReplicaMemoryReport {
    collection: String,
    shard_id: u32,
    peer_id: u64,
    observed_at: String,
    ram_bytes: u64,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct CgroupMemory {
    peer_id: u64,
    observed_at: String,
    used_bytes: u64,
    limit_bytes: u64,
}

type ReplicaId = (String, u32, u64);

struct MemoryInputs {
    resident_bytes: BTreeMap<u64, f64>,
    replica_bytes: BTreeMap<ReplicaId, f64>,
    cgroups: Option<BTreeMap<u64, CgroupMemory>>,
}

struct MemorySuggestion {
    movement: ShardMove,
    replica_bytes: f64,
    source_pressure: f64,
    pair_pressure_reduction: f64,
    source_after_bytes: f64,
    destination_after_bytes: f64,
    source_peak_bytes: f64,
    destination_peak_bytes: f64,
}

struct MemoryPlan {
    suggestion: Option<MemorySuggestion>,
    rejections: BTreeMap<&'static str, usize>,
}

fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T> {
    let bytes = std::fs::read(path).with_context(|| format!("Cannot read {}", path.display()))?;
    serde_json::from_slice(&bytes)
        .with_context(|| format!("Invalid memory input: {}", path.display()))
}

fn check_timestamp(observed_at: &str, now: DateTime<Utc>, max_age_seconds: u64) -> Result<()> {
    let observed_at = DateTime::parse_from_rfc3339(observed_at)?;
    let age = now
        .signed_duration_since(observed_at)
        .to_std()
        .context("Memory measurement is dated in the future")?;
    ensure!(
        age <= Duration::from_secs(max_age_seconds),
        "Memory measurement is stale: {}",
        observed_at
    );
    Ok(())
}

/**
 * @cc [owner:aubin-tchoi,label:backend] complete-comparable-memory-inputs
 * Memory planning requires fresh nonzero allocator telemetry for every snapshot peer. Imported
 * reports must cover every current replica exactly once; cgroup measurements, when supplied, must
 * cover every peer exactly once. Reject stale, future, duplicate, unknown, or inconsistent records.
 */
fn prepare_memory_inputs(
    snapshot: &ClusterSnapshot,
    samples: &HashMap<u64, Option<PeerMemorySample>>,
    reports: Option<Vec<ReplicaMemoryReport>>,
    cgroups: Option<Vec<CgroupMemory>>,
    args: &MemoryArgs,
    now: DateTime<Utc>,
) -> Result<MemoryInputs> {
    let mut resident_bytes = BTreeMap::new();
    for peer in &snapshot.peers {
        let sample = samples
            .get(&peer.peer_id)
            .and_then(|s| s.as_ref())
            .ok_or_else(|| anyhow!("Missing allocator telemetry for peer {}", peer.peer_id))?;
        ensure!(
            sample.collected_at.elapsed() <= Duration::from_secs(args.memory_max_age_seconds),
            "Stale telemetry for peer {}",
            peer.peer_id
        );
        ensure!(
            sample.resident_bytes > 0,
            "Zero allocator memory for peer {}",
            peer.peer_id
        );
        resident_bytes.insert(peer.peer_id, sample.resident_bytes as f64);
    }

    let replica_bytes = if args.estimate_memory {
        ensure!(
            reports.is_none(),
            "Choose component reports or proportional estimation"
        );
        let points_by_peer: HashMap<_, _> = snapshot
            .peers
            .iter()
            .map(|p| (p.peer_id, p.point_count))
            .collect();
        snapshot.shards.iter().map(|shard| {
            let points = points_by_peer[&shard.peer_id];
            ensure!(points > 0, "Cannot estimate replica RAM on peer {} with zero total points; use component reports", shard.peer_id);
            let bytes = resident_bytes[&shard.peer_id] * (shard.point_count as f64 / points as f64);
            Ok(((shard.collection.clone(), shard.shard_id, shard.peer_id), bytes))
        }).collect::<Result<BTreeMap<_, _>>>()?
    } else {
        let reports = reports
            .ok_or_else(|| anyhow!("Memory mode requires replica reports or --estimate-memory"))?;
        let expected: HashSet<_> = snapshot
            .shards
            .iter()
            .map(|s| (s.collection.clone(), s.shard_id, s.peer_id))
            .collect();
        let mut replica_bytes = BTreeMap::new();
        let mut totals = BTreeMap::<u64, u128>::new();
        for report in reports {
            check_timestamp(&report.observed_at, now, args.memory_max_age_seconds)?;
            let id = (report.collection, report.shard_id, report.peer_id);
            ensure!(
                expected.contains(&id),
                "Memory report is not for a current replica: {:?}",
                id
            );
            ensure!(
                !replica_bytes.contains_key(&id),
                "Duplicate replica memory report: {:?}",
                id
            );
            *totals.entry(report.peer_id).or_default() += u128::from(report.ram_bytes);
            replica_bytes.insert(id, report.ram_bytes as f64);
        }
        ensure!(
            replica_bytes.len() == expected.len(),
            "Missing replica memory reports: expected {}, got {}",
            expected.len(),
            replica_bytes.len()
        );
        for (peer_id, total) in totals {
            ensure!(total as f64 <= resident_bytes[&peer_id], "Component RAM exceeds allocator resident memory on peer {}; measurements are not comparable", peer_id);
        }
        replica_bytes
    };

    let cgroups = cgroups.map(|records| -> Result<BTreeMap<u64, CgroupMemory>> {
        let mut by_peer = BTreeMap::new();
        for record in records {
            check_timestamp(&record.observed_at, now, args.memory_max_age_seconds)?;
            let resident = resident_bytes.get(&record.peer_id)
                .ok_or_else(|| anyhow!("Unknown peer {} in cgroup measurements", record.peer_id))?;
            ensure!(record.limit_bytes > 0 && record.used_bytes <= record.limit_bytes, "Invalid cgroup usage/limit for peer {}", record.peer_id);
            ensure!(record.used_bytes as f64 >= *resident, "Cgroup usage is below allocator resident memory on peer {}; measurements are not comparable", record.peer_id);
            let peer_id = record.peer_id;
            ensure!(by_peer.insert(peer_id, record).is_none(), "Duplicate cgroup measurement for peer {}", peer_id);
        }
        ensure!(by_peer.len() == resident_bytes.len(), "Cgroup measurements must cover every peer");
        Ok(by_peer)
    }).transpose()?;

    Ok(MemoryInputs {
        resident_bytes,
        replica_bytes,
        cgroups,
    })
}

impl MemoryInputs {
    fn usage_and_limit(&self, peer_id: u64) -> (f64, f64) {
        match &self.cgroups {
            Some(cgroups) => (
                cgroups[&peer_id].used_bytes as f64,
                cgroups[&peer_id].limit_bytes as f64,
            ),
            // Without physical usage and limits, rank by allocator bytes, with no headroom claim.
            None => (self.resident_bytes[&peer_id], 1.0),
        }
    }
}

/**
 * @cc [owner:aubin-tchoi,label:backend] one-memory-move-per-snapshot
 * Recommend at most one admissible replica move. Prefer the highest-pressure source with a move
 * that lowers the pair's maximum memory pressure, then the largest reduction. Ties resolve by
 * collection, shard, source, destination. Point variance need not improve.
 */
/**
 * @cc [owner:aubin-tchoi,label:backend] transfer-memory-before-source-relief
 * With cgroup data, the source must fit its existing usage plus transfer overhead within its limit.
 * The destination must fit existing usage plus the full replica and overhead while preserving the
 * configured free fraction. Never credit source relief until the transfer has completed.
 */
fn calculate_memory_move(
    snapshot: &ClusterSnapshot,
    inputs: &MemoryInputs,
    args: &MemoryArgs,
) -> MemoryPlan {
    let occupied: HashSet<_> = snapshot
        .shards
        .iter()
        .map(|s| (s.collection.as_str(), s.shard_id, s.peer_id))
        .collect();
    let mut shards: Vec<_> = snapshot.shards.iter().collect();
    shards.sort_by_key(|s| (&s.collection, s.shard_id, s.peer_id));
    let mut peers: Vec<_> = snapshot.peers.iter().collect();
    peers.sort_by_key(|p| p.peer_id);
    let mut suggestion: Option<MemorySuggestion> = None;
    let mut rejections = BTreeMap::new();

    // Same ~5,320 candidate placements as point mode; each score is constant-time arithmetic.
    for shard in shards {
        let bytes =
            inputs.replica_bytes[&(shard.collection.clone(), shard.shard_id, shard.peer_id)];
        let (source_used, source_limit) = inputs.usage_and_limit(shard.peer_id);
        for peer in &peers {
            if peer.peer_id == shard.peer_id {
                continue;
            }
            if let Some(reason) = placement_rejection(snapshot, shard, peer.peer_id, &occupied) {
                *rejections.entry(reason).or_default() += 1;
                continue;
            }
            let (destination_used, destination_limit) = inputs.usage_and_limit(peer.peer_id);
            let source_pressure = source_used / source_limit;
            let source_after_bytes = source_used - bytes;
            let destination_after_bytes = destination_used + bytes;
            let source_peak_bytes = source_used + bytes * args.transfer_overhead_ratio;
            let destination_peak_bytes =
                destination_used + bytes * (1.0 + args.transfer_overhead_ratio);
            let pair_pressure_after = (source_after_bytes / source_limit)
                .max(destination_after_bytes / destination_limit);
            let rejection = if bytes <= 0.0 || pair_pressure_after >= source_pressure {
                Some("no reduction in pair's maximum memory pressure")
            } else if inputs.cgroups.is_some() && source_peak_bytes > source_limit {
                Some("source transfer overhead exceeds cgroup limit")
            } else if inputs.cgroups.is_some()
                && destination_peak_bytes > destination_limit * (1.0 - args.memory_headroom_ratio)
            {
                Some("destination lacks transfer headroom")
            } else {
                None
            };
            if let Some(reason) = rejection {
                *rejections.entry(reason).or_default() += 1;
                continue;
            }
            let reduction = source_pressure - pair_pressure_after;
            if suggestion.as_ref().is_some_and(|best| {
                source_pressure < best.source_pressure
                    || (source_pressure == best.source_pressure
                        && reduction <= best.pair_pressure_reduction)
            }) {
                continue;
            }
            suggestion = Some(MemorySuggestion {
                movement: ShardMove {
                    collection: shard.collection.clone(),
                    shard_id: shard.shard_id,
                    from_peer: shard.peer_id,
                    to_peer: peer.peer_id,
                    point_count: shard.point_count,
                },
                replica_bytes: bytes,
                source_pressure,
                pair_pressure_reduction: reduction,
                source_after_bytes,
                destination_after_bytes,
                source_peak_bytes,
                destination_peak_bytes,
            });
        }
    }
    MemoryPlan {
        suggestion,
        rejections,
    }
}

pub(super) fn suggest_move(
    snapshot: &ClusterSnapshot,
    samples: &HashMap<u64, Option<PeerMemorySample>>,
    args: &MemoryArgs,
    snapshot_started_at: Instant,
) -> Result<()> {
    let reports = args
        .replica_memory_reports
        .as_deref()
        .map(read_json)
        .transpose()?;
    let cgroups = args.cgroup_memory.as_deref().map(read_json).transpose()?;
    let inputs = prepare_memory_inputs(snapshot, samples, reports, cgroups, args, Utc::now())?;
    ensure!(
        snapshot_started_at.elapsed() <= Duration::from_secs(args.memory_max_age_seconds),
        "Placement snapshot is stale; refresh before memory planning"
    );
    let plan = calculate_memory_move(snapshot, &inputs, args);
    display_memory_plan(&inputs, &plan, args);
    Ok(())
}

fn display_memory_plan(inputs: &MemoryInputs, plan: &MemoryPlan, args: &MemoryArgs) {
    if args.estimate_memory {
        println!("\nMemory source: ESTIMATED replica RAM = source allocator resident bytes * replica points / source points.");
        println!("This assumes equal bytes per point within each peer and assigns shared process overhead to replicas.");
    } else {
        println!("\nMemory source: reported non-evictable component RAM. Source relief and destination growth are estimates.");
    }
    println!("Transfer allowance: {:.0}% of replica RAM on each peer; source keeps its copy until completion.", args.transfer_overhead_ratio * 100.0);
    match &inputs.cgroups {
        Some(_) => println!("Ranking by measured cgroup usage / supplied limit; reserving {:.0}% destination headroom.", args.memory_headroom_ratio * 100.0),
        None => println!("ADVISORY: ranking allocator-resident bytes. Physical usage and capacity are unknown; headroom cannot be checked."),
    }
    for (&peer_id, &resident) in &inputs.resident_bytes {
        if let Some(cgroups) = &inputs.cgroups {
            let cgroup = &cgroups[&peer_id];
            println!(
                "Peer {}: allocator {:.2} GB, cgroup {:.2} / {:.2} GB ({:.1}%)",
                peer_id,
                resident / 1e9,
                cgroup.used_bytes as f64 / 1e9,
                cgroup.limit_bytes as f64 / 1e9,
                cgroup.used_bytes as f64 / cgroup.limit_bytes as f64 * 100.0
            );
        }
    }
    if let Some(suggestion) = &plan.suggestion {
        println!(
            "Estimated source relief / destination increase after completion: {:.2} GB.",
            suggestion.replica_bytes / 1e9
        );
        let unit = if inputs.cgroups.is_some() {
            "cgroup"
        } else {
            "allocator"
        };
        println!(
            "Projected {} usage after completion: source {:.2} GB, destination {:.2} GB.",
            unit,
            suggestion.source_after_bytes / 1e9,
            suggestion.destination_after_bytes / 1e9
        );
        println!(
            "Estimated {} usage during transfer: source {:.2} GB, destination {:.2} GB.",
            unit,
            suggestion.source_peak_bytes / 1e9,
            suggestion.destination_peak_bytes / 1e9
        );
        if let Some(cgroups) = &inputs.cgroups {
            let limit = cgroups[&suggestion.movement.to_peer].limit_bytes as f64;
            println!("Estimated destination headroom during transfer: {:.2} GB; {:.2} GB above the configured reserve.", (limit - suggestion.destination_peak_bytes) / 1e9, (limit * (1.0 - args.memory_headroom_ratio) - suggestion.destination_peak_bytes) / 1e9);
        }
        display_move_suggestions(std::slice::from_ref(&suggestion.movement));
        println!("Stopped after one suggestion. Wait for completion and refresh telemetry before planning another move.");
    } else {
        println!("No admissible move reduces memory pressure within the supplied constraints.");
    }
    for (reason, count) in &plan.rejections {
        println!("Rejected {} candidates: {}", count, reason);
    }
    println!("Move effects, transfer overhead, and headroom are advisory estimates. Allocator relief may be delayed and page-cache growth is not predicted. Recheck live capacity before executing.");
}

#[cfg(test)]
mod tests {
    use super::super::{
        build_cluster_snapshot, calculate_suggested_moves, parse_peer_memory, tests::reports, Args,
        QdrantResponse, TelemetryResult,
    };
    use super::*;
    use clap::Parser;

    fn snapshot() -> Result<ClusterSnapshot> {
        build_cluster_snapshot(&reports(
            &[1, 2, 3],
            &[
                ("a", 1, 1, 40),
                ("a", 2, 1, 60),
                ("a", 3, 2, 40),
                ("a", 4, 2, 60),
                ("a", 5, 3, 100),
            ],
        ))
    }

    fn samples() -> HashMap<u64, Option<PeerMemorySample>> {
        [(1, 900), (2, 400), (3, 300)]
            .into_iter()
            .map(|(peer, resident_bytes)| {
                (
                    peer,
                    Some(PeerMemorySample {
                        resident_bytes,
                        collected_at: Instant::now(),
                    }),
                )
            })
            .collect()
    }

    fn estimate_args() -> MemoryArgs {
        MemoryArgs {
            estimate_memory: true,
            ..MemoryArgs::default()
        }
    }

    fn component_reports(
        snapshot: &ClusterSnapshot,
        now: DateTime<Utc>,
    ) -> Vec<ReplicaMemoryReport> {
        snapshot
            .shards
            .iter()
            .map(|s| ReplicaMemoryReport {
                collection: s.collection.clone(),
                shard_id: s.shard_id,
                peer_id: s.peer_id,
                observed_at: now.to_rfc3339(),
                ram_bytes: if s.shard_id == 2 { 450 } else { 100 },
            })
            .collect()
    }

    fn cgroups(now: DateTime<Utc>) -> Vec<CgroupMemory> {
        [(1, 950, 1200), (2, 500, 1200), (3, 400, 1200)]
            .into_iter()
            .map(|(peer_id, used_bytes, limit_bytes)| CgroupMemory {
                peer_id,
                used_bytes,
                limit_bytes,
                observed_at: now.to_rfc3339(),
            })
            .collect()
    }

    #[test]
    fn memory_mode_is_explicit_and_rejects_point_options() -> Result<()> {
        assert!(!Args::try_parse_from(["rebalance"])?.memory.enabled());
        for mode in [
            vec!["--estimate-memory"],
            vec!["--replica-memory-reports", "replicas.json"],
        ] {
            let mut argv = vec!["rebalance"];
            argv.extend(mode);
            assert!(Args::try_parse_from(&argv)?.memory.enabled());
            for point_option in [
                "--max-moves",
                "--target-relative-sd",
                "--min-relative-improvement",
            ] {
                let mut conflicting = argv.clone();
                conflicting.extend([point_option, "1"]);
                assert!(Args::try_parse_from(conflicting).is_err());
            }
        }
        assert!(Args::try_parse_from([
            "rebalance",
            "--estimate-memory",
            "--replica-memory-reports",
            "replicas.json"
        ])
        .is_err());
        assert!(Args::try_parse_from(["rebalance", "--cgroup-memory", "cgroups.json"]).is_err());
        assert!(Args::try_parse_from([
            "rebalance",
            "--estimate-memory",
            "--memory-max-age-seconds",
            "0"
        ])
        .is_err());
        assert!(Args::try_parse_from([
            "rebalance",
            "--estimate-memory",
            "--transfer-overhead-ratio",
            "NaN"
        ])
        .is_err());
        Ok(())
    }

    #[test]
    fn moves_memory_even_when_point_counts_are_identical() -> Result<()> {
        let snapshot = snapshot()?;
        let args = estimate_args();
        assert!(
            calculate_suggested_moves(&snapshot, &Args::try_parse_from(["rebalance"])?)
                .moves
                .is_empty()
        );
        let inputs = prepare_memory_inputs(&snapshot, &samples(), None, None, &args, Utc::now())?;
        let plan = calculate_memory_move(&snapshot, &inputs, &args);
        let suggestion = plan.suggestion.expect("memory improvement");
        assert_eq!(
            (suggestion.movement.from_peer, suggestion.movement.to_peer),
            (1, 3)
        );
        assert_eq!(suggestion.movement.shard_id, 1);
        assert_eq!(suggestion.replica_bytes, 360.0);
        assert_eq!(suggestion.source_after_bytes, 540.0);
        assert_eq!(suggestion.destination_after_bytes, 660.0);
        assert_eq!(suggestion.source_peak_bytes, 990.0);
        assert_eq!(suggestion.destination_peak_bytes, 750.0);
        Ok(())
    }

    #[test]
    fn component_reports_drive_selection_and_leave_unattributed_heap_on_source() -> Result<()> {
        let snapshot = snapshot()?;
        let now = Utc::now();
        let args = MemoryArgs::default();
        let inputs = prepare_memory_inputs(
            &snapshot,
            &samples(),
            Some(component_reports(&snapshot, now)),
            None,
            &args,
            now,
        )?;
        let suggestion = calculate_memory_move(&snapshot, &inputs, &args)
            .suggestion
            .expect("memory improvement");
        assert_eq!(suggestion.movement.shard_id, 2);
        assert_eq!(suggestion.replica_bytes, 450.0);
        assert_eq!(suggestion.source_after_bytes, 450.0);
        assert_eq!(suggestion.destination_after_bytes, 750.0);
        Ok(())
    }

    #[test]
    fn uses_capacity_pressure_instead_of_raw_bytes_when_available() -> Result<()> {
        let snapshot = snapshot()?;
        let now = Utc::now();
        let mut cgroups = cgroups(now);
        cgroups[0].limit_bytes = 2400;
        cgroups[1].limit_bytes = 600;
        let args = estimate_args();
        let inputs = prepare_memory_inputs(&snapshot, &samples(), None, Some(cgroups), &args, now)?;
        let suggestion = calculate_memory_move(&snapshot, &inputs, &args)
            .suggestion
            .expect("relieve smaller peer");
        assert_eq!(suggestion.movement.from_peer, 2);
        assert_eq!(suggestion.movement.to_peer, 1);
        assert!(suggestion.source_pressure > 0.8);
        Ok(())
    }

    #[test]
    fn transfer_reserves_can_reject_a_move_that_fits_after_completion() -> Result<()> {
        let mut snapshot = snapshot()?;
        // Restrict the case to peer 1 -> 3 so the test cannot choose another donor instead.
        snapshot.excluded_peers.insert(2, Default::default());
        let now = Utc::now();
        let args = estimate_args();
        let mut limits = cgroups(now);
        limits[0].used_bytes = 1100;
        limits[0].limit_bytes = 1300;
        limits[2].limit_bytes = 920;
        // Peer 3 after the best move: 400 + 360 = 760 < 920 * .85 = 782.
        // During transfer: 400 + 360 * 1.25 = 850 > 782.
        let inputs = prepare_memory_inputs(&snapshot, &samples(), None, Some(limits), &args, now)?;
        let plan = calculate_memory_move(&snapshot, &inputs, &args);
        assert!(plan.suggestion.is_none());
        assert!(plan.rejections["destination lacks transfer headroom"] > 0);
        let no_overhead = MemoryArgs {
            transfer_overhead_ratio: 0.0,
            ..estimate_args()
        };
        assert!(calculate_memory_move(&snapshot, &inputs, &no_overhead)
            .suggestion
            .is_some());
        Ok(())
    }

    #[test]
    fn source_keeps_its_copy_until_transfer_finishes() -> Result<()> {
        let mut snapshot = snapshot()?;
        snapshot.excluded_peers.insert(2, Default::default());
        let now = Utc::now();
        let mut limits = cgroups(now);
        limits[0].limit_bytes = 1000;
        let args = estimate_args();
        let inputs = prepare_memory_inputs(&snapshot, &samples(), None, Some(limits), &args, now)?;
        let plan = calculate_memory_move(&snapshot, &inputs, &args);
        assert!(plan.suggestion.is_none());
        assert!(plan.rejections["source transfer overhead exceeds cgroup limit"] > 0);
        Ok(())
    }

    #[test]
    fn prioritizes_highest_pressure_and_is_deterministic() -> Result<()> {
        let mut snapshot = snapshot()?;
        let args = estimate_args();
        let samples: HashMap<_, _> = [(1, 1000), (2, 900), (3, 100)]
            .into_iter()
            .map(|(peer, resident_bytes)| {
                (
                    peer,
                    Some(PeerMemorySample {
                        resident_bytes,
                        collected_at: Instant::now(),
                    }),
                )
            })
            .collect();
        let now = Utc::now();
        let mut reports = component_reports(&snapshot, now);
        for report in &mut reports {
            report.ram_bytes = match report.peer_id {
                1 => 10,
                2 => 300,
                _ => 100,
            };
        }
        let inputs = prepare_memory_inputs(
            &snapshot,
            &samples,
            Some(reports),
            None,
            &MemoryArgs::default(),
            now,
        )?;
        let first = calculate_memory_move(&snapshot, &inputs, &args)
            .suggestion
            .expect("move");
        // Peer 2 could shed more bytes, but peer 1 is more pressured.
        assert_eq!(
            (
                first.movement.from_peer,
                first.movement.shard_id,
                first.movement.to_peer
            ),
            (1, 1, 2)
        );
        snapshot.shards.reverse();
        snapshot.peers.reverse();
        let reordered = calculate_memory_move(&snapshot, &inputs, &args)
            .suggestion
            .expect("move");
        assert_eq!(first.movement, reordered.movement);
        Ok(())
    }

    #[test]
    fn preserves_placement_exclusions_and_replica_anti_affinity() -> Result<()> {
        let mut snapshot = build_cluster_snapshot(&reports(
            &[1, 2, 3],
            &[("a", 1, 1, 40), ("a", 2, 1, 60), ("a", 1, 3, 40)],
        ))?;
        snapshot.excluded_peers.insert(2, Default::default());
        snapshot.excluded_shards.insert(("a".into(), 2));
        let args = estimate_args();
        let inputs = prepare_memory_inputs(&snapshot, &samples(), None, None, &args, Utc::now())?;
        let plan = calculate_memory_move(&snapshot, &inputs, &args);
        assert!(plan.suggestion.is_none());
        assert!(plan.rejections["destination already hosts replica"] > 0);
        assert!(plan.rejections["shard involved in recovery or transfer"] > 0);
        assert!(plan.rejections["peer involved in recovery or transfer"] > 0);
        Ok(())
    }

    #[test]
    fn rejects_missing_zero_or_stale_allocator_telemetry() -> Result<()> {
        let snapshot = snapshot()?;
        for bad_sample in [
            None,
            Some(PeerMemorySample {
                resident_bytes: 0,
                collected_at: Instant::now(),
            }),
            Some(PeerMemorySample {
                resident_bytes: 900,
                collected_at: Instant::now() - Duration::from_secs(301),
            }),
        ] {
            let mut samples = samples();
            samples.insert(1, bad_sample);
            assert!(prepare_memory_inputs(
                &snapshot,
                &samples,
                None,
                None,
                &estimate_args(),
                Utc::now()
            )
            .is_err());
        }
        Ok(())
    }

    #[test]
    fn rejects_incomplete_stale_or_incomparable_component_reports() -> Result<()> {
        let snapshot = snapshot()?;
        let now = Utc::now();
        for corruption in [
            "missing",
            "duplicate",
            "unknown",
            "wrong collection",
            "too large",
            "stale",
            "future",
        ] {
            let mut reports = component_reports(&snapshot, now);
            match corruption {
                "missing" => {
                    reports.pop();
                }
                "duplicate" => reports.push(ReplicaMemoryReport {
                    collection: "a".into(),
                    shard_id: 1,
                    peer_id: 1,
                    observed_at: now.to_rfc3339(),
                    ram_bytes: 1,
                }),
                "unknown" => reports[0].peer_id = 99,
                "wrong collection" => reports[0].collection = "other".into(),
                "too large" => reports[0].ram_bytes = 901,
                "stale" => {
                    reports[0].observed_at = (now - chrono::Duration::seconds(301)).to_rfc3339()
                }
                "future" => {
                    reports[0].observed_at = (now + chrono::Duration::seconds(1)).to_rfc3339()
                }
                _ => unreachable!(),
            }
            assert!(
                prepare_memory_inputs(
                    &snapshot,
                    &samples(),
                    Some(reports),
                    None,
                    &MemoryArgs::default(),
                    now
                )
                .is_err(),
                "accepted {corruption}"
            );
        }
        Ok(())
    }

    #[test]
    fn rejects_partial_or_incomparable_cgroup_measurements() -> Result<()> {
        let snapshot = snapshot()?;
        let now = Utc::now();
        for corruption in [
            "missing",
            "duplicate",
            "unknown",
            "zero capacity",
            "over capacity",
            "below allocator",
            "stale",
            "future",
        ] {
            let mut cgroups = cgroups(now);
            match corruption {
                "missing" => {
                    cgroups.pop();
                }
                "duplicate" => cgroups[1].peer_id = 1,
                "unknown" => cgroups[1].peer_id = 99,
                "zero capacity" => cgroups[0].limit_bytes = 0,
                "over capacity" => cgroups[0].used_bytes = 1201,
                "below allocator" => cgroups[0].used_bytes = 899,
                "stale" => {
                    cgroups[0].observed_at = (now - chrono::Duration::seconds(301)).to_rfc3339()
                }
                "future" => {
                    cgroups[0].observed_at = (now + chrono::Duration::seconds(1)).to_rfc3339()
                }
                _ => unreachable!(),
            }
            assert!(
                prepare_memory_inputs(
                    &snapshot,
                    &samples(),
                    None,
                    Some(cgroups),
                    &estimate_args(),
                    now
                )
                .is_err(),
                "accepted {corruption}"
            );
        }
        Ok(())
    }

    #[test]
    fn empty_peer_is_eligible_but_zero_point_replicas_require_reports() -> Result<()> {
        let mut snapshot =
            build_cluster_snapshot(&reports(&[1, 2, 3], &[("a", 1, 1, 40), ("a", 2, 1, 60)]))?;
        let args = estimate_args();
        let inputs = prepare_memory_inputs(&snapshot, &samples(), None, None, &args, Utc::now())?;
        assert!(calculate_memory_move(&snapshot, &inputs, &args)
            .suggestion
            .is_some());
        snapshot.peers[0].point_count = 0;
        for shard in &mut snapshot.shards {
            shard.point_count = 0;
        }
        assert!(
            prepare_memory_inputs(&snapshot, &samples(), None, None, &args, Utc::now()).is_err()
        );
        Ok(())
    }

    #[test]
    fn telemetry_must_identify_the_expected_peer_in_memory_mode() -> Result<()> {
        for peer in [
            serde_json::json!(1),
            serde_json::json!(2),
            serde_json::Value::Null,
        ] {
            let response: QdrantResponse<TelemetryResult> = serde_json::from_value(
                serde_json::json!({
                    "status": "ok", "result": {"memory": {"resident_bytes": 900}, "cluster": {"status": {"peer_id": peer}}}
                }),
            )?;
            assert_eq!(
                parse_peer_memory(response, 1, true, Instant::now()).is_ok(),
                peer == 1
            );
        }
        let missing: QdrantResponse<TelemetryResult> =
            serde_json::from_value(serde_json::json!({"status": "ok", "result": {}}))?;
        assert!(parse_peer_memory(missing, 1, false, Instant::now())?.is_none());
        Ok(())
    }
}
