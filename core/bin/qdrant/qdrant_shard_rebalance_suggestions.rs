use anyhow::{anyhow, ensure, Error, Result};
use clap::Parser;
use dust::data_sources::qdrant::{env_var_prefix_for_cluster, QdrantCluster};
use regex::Regex;
use serde::Deserialize;
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::time::{Duration, Instant};
use url::Url;

mod shard_rebalance_memory;
use shard_rebalance_memory::{MemoryArgs, PeerMemorySample};

#[derive(Debug, Deserialize)]
struct PeerInfo {
    uri: String,
}

// A minimal structure for the /cluster JSON response.
#[derive(Debug, Deserialize)]
struct ClusterStatus {
    peer_id: u64,
    peers: HashMap<String, PeerInfo>, // key is peer_id as string.
}

#[derive(Deserialize, Debug)]
struct CollectionsResult {
    collections: Vec<CollectionDescription>,
}

#[derive(Deserialize, Debug)]
struct CollectionDescription {
    name: String,
}

#[derive(Deserialize, Debug)]
struct LocalShardInfo {
    shard_id: u32,
    points_count: u64,
    state: String,
}

#[derive(Deserialize, Debug)]
struct RemoteShardInfo {
    shard_id: u32,
    peer_id: u64,
    state: String,
}

// Progress comments differ between peers, so compare only transfer identities.
#[derive(Deserialize, Debug, PartialEq, Eq, PartialOrd, Ord, Clone)]
struct ShardTransferInfo {
    shard_id: u32,
    to_shard_id: Option<u32>,
    from: u64,
    to: u64,
    sync: bool,
}

#[derive(Deserialize, Debug)]
struct ClusterInfoResult {
    peer_id: u64,
    local_shards: Vec<LocalShardInfo>,
    remote_shards: Vec<RemoteShardInfo>,
    shard_transfers: BTreeSet<ShardTransferInfo>,
    resharding_operations: Option<Vec<serde_json::Value>>,
}

// Minimal structures for the /telemetry JSON response.
#[derive(Deserialize, Debug)]
struct MemoryTelemetry {
    resident_bytes: u64,
}

#[derive(Deserialize, Debug)]
struct TelemetryResult {
    // Absent when the node build has no jemalloc stats.
    memory: Option<MemoryTelemetry>,
    cluster: Option<ClusterTelemetry>,
}

#[derive(Deserialize, Debug)]
struct ClusterTelemetry {
    status: Option<ClusterStatusTelemetry>,
}

#[derive(Deserialize, Debug)]
struct ClusterStatusTelemetry {
    peer_id: Option<u64>,
}

// Generic wrapper for all Qdrant HTTP API responses
#[derive(Deserialize)]
struct QdrantResponse<T> {
    status: String,
    result: T,
}

// GETs a Qdrant JSON endpoint, failing with the URL, HTTP status and (truncated) body. A bare
// `.json()` on a peer returning a non-JSON error page (e.g. an ingress 404/502) only yields an
// anonymous "error decoding response body" with no clue about which peer failed.
async fn get_json<T: serde::de::DeserializeOwned>(
    client: &reqwest::Client,
    url: &str,
    api_key: &str,
) -> Result<T> {
    let mut req = client.get(url);
    if !api_key.is_empty() {
        req = req.header("api-key", api_key);
    }
    let res = req
        .send()
        .await
        .map_err(|e| anyhow!("GET {} failed: {}", url, e))?;
    let status = res.status();
    let body = res.text().await.unwrap_or_default();
    let body_snippet: String = body.chars().take(500).collect();
    if !status.is_success() {
        return Err(anyhow!("GET {} failed ({}): {}", url, status, body_snippet));
    }
    serde_json::from_str(&body).map_err(|e| {
        anyhow!(
            "GET {}: failed to parse response: {} ({})",
            url,
            e,
            body_snippet
        )
    })
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct PeerLoad {
    peer_id: u64,
    shard_count: usize,
    point_count: u64,
}

#[derive(Debug, Clone)]
struct ShardInfo {
    collection: String,
    peer_id: u64,
    point_count: u64,
    shard_id: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ShardMove {
    collection: String,
    shard_id: u32,
    from_peer: u64,
    to_peer: u64,
    point_count: u64,
}

const QDRANT_HTTP_PORT: &str = ":6333";
const QDRANT_GRPC_PORT: &str = ":6334";

#[derive(Debug, Parser)]
#[command(about = "Suggest shard moves to balance points or relieve memory pressure")]
struct Args {
    /// Maximum number of suggested moves in point mode.
    #[arg(long, default_value_t = 10, conflicts_with = "memory_source")]
    max_moves: usize,

    /// Stop at this SD / mean ratio (0.10 means 10%; 0 seeks further improvements).
    #[arg(long, default_value_t = 0.0, value_parser = parse_ratio, conflicts_with = "memory_source")]
    target_relative_sd: f64,

    /// Minimum fractional reduction in variance per move (0.01 means 1%).
    #[arg(long, default_value_t = 0.0, value_parser = parse_ratio, conflicts_with = "memory_source")]
    min_relative_improvement: f64,

    #[command(flatten)]
    memory: MemoryArgs,
}

fn parse_ratio(value: &str) -> Result<f64, String> {
    let ratio: f64 = value.parse().map_err(|_| "Expected a number".to_string())?;
    if !ratio.is_finite() || !(0.0..=1.0).contains(&ratio) {
        return Err("Expected a finite ratio between 0 and 1".to_string());
    }
    Ok(ratio)
}

#[derive(Debug)]
struct ClusterSnapshot {
    peers: Vec<PeerLoad>,
    shards: Vec<ShardInfo>,
    excluded_peers: BTreeMap<u64, BTreeSet<String>>,
    excluded_shards: BTreeSet<(String, u32)>,
}

#[derive(Debug, PartialEq, Eq)]
enum StopReason {
    TargetReached,
    MoveLimitReached,
    NoImprovingMove,
}

#[derive(Debug)]
struct RebalancePlan {
    moves: Vec<ShardMove>,
    peers: Vec<PeerLoad>,
    stop_reason: StopReason,
    rejections: BTreeMap<&'static str, usize>,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();
    // 1. Start from a seed peer that we know.
    //    We'll call GET /cluster, parse the JSON, discover the other peers' URIs.
    let url_var = format!(
        "{}_URL",
        env_var_prefix_for_cluster(QdrantCluster::Cluster0)
    );
    let api_key_var = format!(
        "{}_API_KEY",
        env_var_prefix_for_cluster(QdrantCluster::Cluster0)
    );

    let seed_peer_uri = std::env::var(&url_var)
        .map_err(|_| anyhow!("{} is not set", url_var))?
        .replace(QDRANT_GRPC_PORT, QDRANT_HTTP_PORT);
    let api_key = std::env::var(&api_key_var).map_err(|_| anyhow!("{} is not set", api_key_var))?;

    // Step 0: Discover peers from the seed peer.
    let peer_uris = get_cluster_uris(&seed_peer_uri, &api_key).await?;

    println!("Discovered peers: {:?}", peer_uris.keys());

    let snapshot_started_at = Instant::now();
    let snapshot = gather_cluster_data(&peer_uris, &api_key).await?;
    let memory_by_peer = gather_peer_memory(&peer_uris, &api_key, args.memory.enabled()).await?;
    let (_, _, mean) = analyze_cluster_distribution(&snapshot.peers, &memory_by_peer);
    for (peer, reasons) in &snapshot.excluded_peers {
        println!(
            "Excluded peer {}: {}",
            peer,
            reasons.iter().cloned().collect::<Vec<_>>().join("; ")
        );
    }

    if args.memory.enabled() {
        shard_rebalance_memory::suggest_move(
            &snapshot,
            &memory_by_peer,
            &args.memory,
            snapshot_started_at,
        )?;
        return Ok(());
    }

    let plan = calculate_suggested_moves(&snapshot, &args);
    display_plan_summary(&snapshot.peers, &plan, mean, &args);
    display_move_suggestions(&plan.moves);
    display_expected_distribution(&plan.peers, mean);

    Ok(())
}

// Function to extract cluster information from the base URL
fn extract_cluster_info(base_url: &str) -> Result<(String, String, String), Error> {
    // Parse the URL to extract host.
    let parsed_url = Url::parse(base_url)?;
    let host = parsed_url
        .host_str()
        .ok_or_else(|| anyhow::anyhow!("No host in URL"))?;

    // Expected format: cluster-id.region.cloud-provider.cloud.qdrant.io.
    let parts: Vec<&str> = host.split('.').collect();
    if parts.len() < 5 {
        return Err(anyhow::anyhow!(
            "URL format doesn't match expected pattern: {}",
            host
        ));
    }

    // Extract the cluster ID, region, and cloud provider.
    let cluster_id = parts[0].to_string();
    let region = parts[1].to_string();
    let cloud_provider = parts[2].to_string();

    Ok((cluster_id, region, cloud_provider))
}

// Function to create a node-specific URL from the base URL and node number.
fn create_node_url(base_url: &str, node_number: &str) -> Result<String, Error> {
    let (cluster_id, region, cloud_provider) = extract_cluster_info(base_url)?;

    // Create the node-specific URL
    let node_url = format!(
        "https://node-{}-{}.{}.{}.cloud.qdrant.io{}",
        node_number, cluster_id, region, cloud_provider, QDRANT_HTTP_PORT
    );

    Ok(node_url)
}

// Get cluster info from REST API (not accessible via gRPC), then return a map of peer_id to peer_uri.
async fn get_cluster_uris(seed_uri: &str, api_key: &str) -> Result<HashMap<u64, String>> {
    let http_client = reqwest::Client::new();

    let cluster_resp: QdrantResponse<ClusterStatus> =
        get_json(&http_client, &format!("{}/cluster", seed_uri), api_key).await?;

    if cluster_resp.status != "ok" {
        return Err(anyhow!(
            "Unexpected cluster response status: {}",
            cluster_resp.status
        ));
    }

    // Extract cluster information from the seed peer's URL.
    let (cluster_id, _region, _cloud_provider) = extract_cluster_info(seed_uri)?;

    let cluster_info = cluster_resp.result;
    println!("Current peer is peer {}", cluster_info.peer_id);

    println!("Found {} peers", cluster_info.peers.len());

    cluster_info
        .peers
        .iter()
        .map(|(id, peer)| {
            let peer_id = id.parse::<u64>()?;

            // Extract node number from the internal URI.
            let re = Regex::new(&format!(r"qdrant-{}-(\d+)\.qdrant-headless", cluster_id))?;
            if let Some(captures) = re.captures(&peer.uri) {
                if let Some(node_number) = captures.get(1) {
                    // Create the public-facing node URL.
                    let node_url = create_node_url(seed_uri, node_number.as_str())?;

                    return Ok((peer_id, node_url));
                }
            }

            Err(anyhow::anyhow!("Failed to extract node number from URI"))
        })
        .collect::<Result<HashMap<_, _>>>()
}

// Every discovered peer must contribute a response, including peers with no local replicas.
async fn gather_cluster_data(
    peer_uris: &HashMap<u64, String>,
    api_key: &str,
) -> Result<ClusterSnapshot> {
    let client = reqwest::Client::new();
    let mut reports = BTreeMap::new();
    for (peer_id, peer_uri) in peer_uris {
        let base_uri = peer_uri.trim_end_matches('/');
        let response: QdrantResponse<CollectionsResult> =
            get_json(&client, &format!("{}/collections", base_uri), api_key).await?;
        ensure!(
            response.status == "ok",
            "Collection listing failed for peer {}",
            peer_id
        );
        let mut collections = BTreeMap::new();
        for collection in response.result.collections {
            let url = format!("{}/collections/{}/cluster", base_uri, collection.name);
            let response: QdrantResponse<ClusterInfoResult> =
                get_json(&client, &url, api_key).await?;
            ensure!(
                response.status == "ok",
                "Collection cluster request failed: {}",
                url
            );
            ensure!(
                collections
                    .insert(collection.name, response.result)
                    .is_none(),
                "Duplicate collection from peer {}",
                peer_id
            );
        }
        reports.insert(*peer_id, collections);
    }
    build_cluster_snapshot(&reports)
}

/**
 * @cc [owner:aubin-tchoi,label:backend] complete-placement-snapshot
 * Reject missing or inconsistent peer identities, collection inventories, replica placements,
 * states, or transfer identities before planning. Point counts may differ between replicas.
 */
/**
 * @cc [owner:aubin-tchoi,label:backend] exclude-unsettled-placement
 * Refuse planning during resharding. Exclude non-active replicas' peers, transfer endpoints, and
 * all copies of affected collection/shards from moves, even when an incoming copy has zero points.
 */
fn build_cluster_snapshot(
    reports: &BTreeMap<u64, BTreeMap<String, ClusterInfoResult>>,
) -> Result<ClusterSnapshot> {
    let first = reports
        .values()
        .next()
        .ok_or_else(|| anyhow!("No peers discovered"))?;
    let mut peers = Vec::new();
    let mut shards = Vec::new();
    let mut excluded_peers: BTreeMap<u64, BTreeSet<String>> = BTreeMap::new();
    let mut excluded_shards = BTreeSet::new();
    let mut placements = BTreeMap::new();
    let mut transfers = BTreeMap::new();

    for (&peer_id, collections) in reports {
        ensure!(
            collections.keys().eq(first.keys()),
            "Collection inventories differ on peer {}; refresh the snapshot",
            peer_id
        );
        let mut peer = PeerLoad {
            peer_id,
            shard_count: 0,
            point_count: 0,
        };
        for (collection, info) in collections {
            ensure!(
                info.peer_id == peer_id,
                "Expected peer {}, got {} for {}",
                peer_id,
                info.peer_id,
                collection
            );
            ensure!(
                info.resharding_operations
                    .as_ref()
                    .is_none_or(Vec::is_empty),
                "Resharding in progress for {}; wait and refresh the snapshot",
                collection
            );

            let mut placement = BTreeMap::new();
            for (shard_id, host, state) in info
                .local_shards
                .iter()
                .map(|s| (s.shard_id, peer_id, &s.state))
                .chain(
                    info.remote_shards
                        .iter()
                        .map(|s| (s.shard_id, s.peer_id, &s.state)),
                )
            {
                ensure!(
                    reports.contains_key(&host),
                    "Unknown peer {} hosting {}/{}",
                    host,
                    collection,
                    shard_id
                );
                ensure!(
                    placement.insert((shard_id, host), state.clone()).is_none(),
                    "Duplicate replica {}/{}/{}",
                    collection,
                    shard_id,
                    host
                );
                if state != "Active" {
                    excluded_peers
                        .entry(host)
                        .or_default()
                        .insert(format!("{}/{} is {}", collection, shard_id, state));
                    excluded_shards.insert((collection.clone(), shard_id));
                }
            }
            ensure!(
                info.remote_shards.iter().all(|s| s.peer_id != peer_id),
                "Peer {} reports a local replica as remote",
                peer_id
            );
            if let Some(previous) = placements.insert(collection.clone(), placement.clone()) {
                ensure!(
                    previous == placement,
                    "Replica placements or states differ for {}; refresh the snapshot",
                    collection
                );
            }
            if let Some(previous) =
                transfers.insert(collection.clone(), info.shard_transfers.clone())
            {
                ensure!(
                    previous == info.shard_transfers,
                    "Transfers differ for {}; refresh the snapshot",
                    collection
                );
            }
            for transfer in &info.shard_transfers {
                for host in [transfer.from, transfer.to] {
                    ensure!(
                        reports.contains_key(&host),
                        "Unknown transfer peer {} for {}",
                        host,
                        collection
                    );
                    excluded_peers.entry(host).or_default().insert(format!(
                        "{}/{} transfer {} -> {}",
                        collection, transfer.shard_id, transfer.from, transfer.to
                    ));
                }
                excluded_shards.insert((collection.clone(), transfer.shard_id));
                if let Some(shard_id) = transfer.to_shard_id {
                    excluded_shards.insert((collection.clone(), shard_id));
                }
            }
            for shard in &info.local_shards {
                peer.shard_count += 1;
                peer.point_count = peer
                    .point_count
                    .checked_add(shard.points_count)
                    .ok_or_else(|| anyhow!("Point count overflow on peer {}", peer_id))?;
                shards.push(ShardInfo {
                    collection: collection.clone(),
                    shard_id: shard.shard_id,
                    peer_id,
                    point_count: shard.points_count,
                });
            }
        }
        peers.push(peer);
    }
    // Bounding the total also makes all simulated destination additions safe.
    peers
        .iter()
        .try_fold(0_u64, |total, p| total.checked_add(p.point_count))
        .ok_or_else(|| anyhow!("Cluster point count overflow"))?;
    Ok(ClusterSnapshot {
        peers,
        shards,
        excluded_peers,
        excluded_shards,
    })
}

// Fetch each peer's jemalloc resident memory from /telemetry. This is the qdrant process's
// heap-resident memory, not the node's full working set (excludes OS page cache for mmapped
// segments), so it reads lower than the Qdrant Cloud console RAM graphs.
async fn gather_peer_memory(
    peer_uris: &HashMap<u64, String>,
    api_key: &str,
    require_complete: bool,
) -> Result<HashMap<u64, Option<PeerMemorySample>>> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()?;

    let mut memory_by_peer = HashMap::new();
    for (peer_id, peer_uri) in peer_uris {
        let telemetry_url = format!(
            "{}/telemetry?details_level=1",
            peer_uri.trim_end_matches('/')
        );
        // Point mode tolerates absent display-only memory. Memory mode requires every peer.
        let collected_at = Instant::now();
        let telemetry: Result<QdrantResponse<TelemetryResult>> =
            get_json(&client, &telemetry_url, api_key).await;
        let telemetry = telemetry.and_then(|response| {
            parse_peer_memory(response, *peer_id, require_complete, collected_at)
        });
        let sample = match telemetry {
            Ok(sample) => sample,
            Err(e) if require_complete => return Err(e),
            Err(e) => {
                println!("WARNING: no telemetry for peer {}: {}", peer_id, e);
                None
            }
        };

        memory_by_peer.insert(*peer_id, sample);
    }

    Ok(memory_by_peer)
}

/**
 * @cc [owner:aubin-tchoi,label:backend] identify-planning-telemetry
 * Memory mode must reject telemetry with a missing or unexpected peer identity, failed status,
 * or absent allocator statistics. Point mode may display missing telemetry as unavailable.
 */
fn parse_peer_memory(
    response: QdrantResponse<TelemetryResult>,
    expected_peer: u64,
    require_complete: bool,
    collected_at: Instant,
) -> Result<Option<PeerMemorySample>> {
    ensure!(
        response.status == "ok",
        "Telemetry failed for peer {}",
        expected_peer
    );
    let actual_peer = response
        .result
        .cluster
        .and_then(|c| c.status)
        .and_then(|s| s.peer_id);
    if require_complete || actual_peer.is_some() {
        ensure!(
            actual_peer == Some(expected_peer),
            "Telemetry identity mismatch for peer {}: {:?}",
            expected_peer,
            actual_peer
        );
    }
    let sample = response.result.memory.map(|m| PeerMemorySample {
        resident_bytes: m.resident_bytes,
        collected_at,
    });
    ensure!(
        !require_complete || sample.is_some(),
        "Peer {} has no allocator memory telemetry",
        expected_peer
    );
    Ok(sample)
}

fn analyze_cluster_distribution(
    peers: &[PeerLoad],
    memory_by_peer: &HashMap<u64, Option<PeerMemorySample>>,
) -> (u64, usize, f64) {
    let total_points: u64 = peers.iter().map(|n| n.point_count).sum();
    let peer_count = peers.len();
    let ideal_points_per_peer = total_points as f64 / peer_count.max(1) as f64;

    println!("Current cluster distribution (by points):");
    for peer in peers {
        let diff = (peer.point_count as f64) - ideal_points_per_peer;
        let diff_pct = if ideal_points_per_peer == 0.0 {
            0.0
        } else {
            diff / ideal_points_per_peer * 100.0
        };
        let ram_resident_gb = match memory_by_peer.get(&peer.peer_id).copied().flatten() {
            Some(sample) => format!("{:.1}", sample.resident_bytes as f64 / 1e9),
            None => "n/a".to_string(),
        };
        println!(
            "Peer {}: {} shards, {} points, diff_from_ideal={:+.1}%, ram_resident_gb={}",
            peer.peer_id, peer.shard_count, peer.point_count, diff_pct, ram_resident_gb
        );
    }

    (total_points, peer_count, ideal_points_per_peer)
}

fn calculate_standard_deviation(peers: &[PeerLoad], ideal_points_per_peer: f64) -> f64 {
    // If there are no peers or only one peer, SD is 0.
    if peers.len() <= 1 {
        return 0.0;
    }

    // Calculate squared differences from ideal.
    let sum_squared_diff: f64 = peers
        .iter()
        .map(|peer| {
            let diff = (peer.point_count as f64) - ideal_points_per_peer;
            diff * diff
        })
        .sum();

    // Calculate variance (mean of squared differences).
    let variance = sum_squared_diff / (peers.len() as f64);

    // Return standard deviation (square root of variance).
    variance.sqrt()
}

fn relative_sd(peers: &[PeerLoad], mean: f64) -> f64 {
    if mean == 0.0 {
        0.0
    } else {
        calculate_standard_deviation(peers, mean) / mean
    }
}

// Shared by both objectives so memory planning cannot bypass placement exclusions.
fn placement_rejection(
    snapshot: &ClusterSnapshot,
    shard: &ShardInfo,
    destination: u64,
    occupied: &HashSet<(&str, u32, u64)>,
) -> Option<&'static str> {
    if snapshot.excluded_peers.contains_key(&shard.peer_id)
        || snapshot.excluded_peers.contains_key(&destination)
    {
        Some("peer involved in recovery or transfer")
    } else if snapshot
        .excluded_shards
        .contains(&(shard.collection.clone(), shard.shard_id))
    {
        Some("shard involved in recovery or transfer")
    } else if occupied.contains(&(shard.collection.as_str(), shard.shard_id, destination)) {
        Some("destination already hosts replica")
    } else {
        None
    }
}

/**
 * @cc [owner:aubin-tchoi,label:backend] admissible-improving-moves
 * Each suggestion must preserve replica and point totals, avoid an existing destination replica,
 * respect snapshot exclusions, and strictly reduce point variance in the sequential simulation.
 * Replica identity includes collection, shard, and current peer.
 */
/**
 * @cc [owner:aubin-tchoi,label:backend] deterministic-greedy-search
 * At each step consider every admissible single-replica move and select the greatest variance
 * reduction meeting the configured minimum. Break ties by collection, shard, source, destination.
 * Stop only at the configured target or move limit, or when no qualifying single move remains.
 */
fn calculate_suggested_moves(snapshot: &ClusterSnapshot, args: &Args) -> RebalancePlan {
    let mut peers = snapshot.peers.clone();
    peers.sort_by_key(|p| p.peer_id);
    let peer_indices: HashMap<_, _> = peers
        .iter()
        .enumerate()
        .map(|(i, p)| (p.peer_id, i))
        .collect();
    let mut shards = snapshot.shards.clone();
    let mean = peers.iter().map(|p| p.point_count).sum::<u64>() as f64 / peers.len().max(1) as f64;
    let mut moves = Vec::new();
    let mut rejections = BTreeMap::new();

    let stop_reason = loop {
        if relative_sd(&peers, mean) <= args.target_relative_sd {
            break StopReason::TargetReached;
        }
        if moves.len() >= args.max_moves {
            break StopReason::MoveLimitReached;
        }
        shards.sort_by(|a, b| {
            (&a.collection, a.shard_id, a.peer_id).cmp(&(&b.collection, b.shard_id, b.peer_id))
        });
        let occupied: HashSet<_> = shards
            .iter()
            .map(|s| (s.collection.as_str(), s.shard_id, s.peer_id))
            .collect();
        let squared_deviations: f64 = peers
            .iter()
            .map(|p| (p.point_count as f64 - mean).powi(2))
            .sum();
        let mut best_move = None;
        let mut best_gain = 0_u128;

        // O(replicas * peers) per iteration, with O(1) placement checks and scoring.
        // About 140 * 38 = 5,320 candidates in the current cluster; no per-candidate cloning.
        for (shard_index, shard) in shards.iter().enumerate() {
            let source = &peers[peer_indices[&shard.peer_id]];
            for (destination_index, destination) in peers.iter().enumerate() {
                if source.peer_id == destination.peer_id {
                    continue;
                }
                let rejection =
                    placement_rejection(snapshot, shard, destination.peer_id, &occupied);
                if let Some(reason) = rejection {
                    *rejections.entry(reason).or_insert(0) += 1;
                    continue;
                }

                // Sum of squared loads decreases by 2*s*(A-B-s). Use exact integer arithmetic
                // to rank moves, and require 0 < s < A-B before subtracting unsigned counts.
                let difference = source.point_count.saturating_sub(destination.point_count);
                if shard.point_count == 0 || shard.point_count >= difference {
                    *rejections
                        .entry("no point-variance improvement")
                        .or_insert(0) += 1;
                    continue;
                }
                let gain =
                    u128::from(shard.point_count) * u128::from(difference - shard.point_count);
                if 2.0 * gain as f64 / squared_deviations < args.min_relative_improvement {
                    *rejections
                        .entry("below minimum variance improvement")
                        .or_insert(0) += 1;
                    continue;
                }
                if gain > best_gain {
                    best_gain = gain;
                    best_move = Some((shard_index, destination_index));
                }
            }
        }

        let Some((shard_index, destination_index)) = best_move else {
            break StopReason::NoImprovingMove;
        };
        let shard = &mut shards[shard_index];
        let source_index = peer_indices[&shard.peer_id];
        moves.push(ShardMove {
            collection: shard.collection.clone(),
            shard_id: shard.shard_id,
            from_peer: shard.peer_id,
            to_peer: peers[destination_index].peer_id,
            point_count: shard.point_count,
        });
        peers[source_index].point_count -= shard.point_count;
        peers[source_index].shard_count -= 1;
        peers[destination_index].point_count += shard.point_count;
        peers[destination_index].shard_count += 1;
        shard.peer_id = peers[destination_index].peer_id;
    };
    RebalancePlan {
        moves,
        peers,
        stop_reason,
        rejections,
    }
}

fn display_plan_summary(initial_peers: &[PeerLoad], plan: &RebalancePlan, mean: f64, args: &Args) {
    println!(
        "\nPoint-count SD / mean: {:.2}% -> {:.2}%",
        relative_sd(initial_peers, mean) * 100.0,
        relative_sd(&plan.peers, mean) * 100.0
    );
    match plan.stop_reason {
        StopReason::TargetReached => println!(
            "Stopped: target SD / mean reached ({:.2}%).",
            args.target_relative_sd * 100.0
        ),
        StopReason::MoveLimitReached => {
            println!("Stopped: move limit reached ({}).", args.max_moves)
        }
        StopReason::NoImprovingMove => println!(
            "Stopped: no admissible single move meets the minimum variance improvement ({:.2}%).",
            args.min_relative_improvement * 100.0
        ),
    }
    println!("Candidate rejection counts across all iterations (candidates can recur):");
    for (reason, count) in &plan.rejections {
        println!("  {}: {}", reason, count);
    }
    println!(
        "Suggestions only. Execute one move at a time, wait for completion, then refresh the plan."
    );
    println!("Point balance does not establish memory headroom. Check destination capacity before each move.");
}

fn display_move_suggestions(suggested_moves: &[ShardMove]) {
    if suggested_moves.is_empty() {
        println!("\nNo moves suggested.");
    } else {
        println!("\nSuggested sequential moves:");
        for (i, mv) in suggested_moves.iter().enumerate() {
            println!(
                "{}. Move shard {} from peer {} to peer {} (collection={}, points={})",
                i + 1,
                mv.shard_id,
                mv.from_peer,
                mv.to_peer,
                mv.collection,
                mv.point_count
            );

            println!("--------------------------------");
            println!("COMMAND TO RUN FROM QDRANT CLOUD:");
            println!("POST /collections/{}/cluster", mv.collection);
            println!("{{");
            println!("  \"move_shard\": {{");
            println!("    \"shard_id\": {},", mv.shard_id);
            println!("    \"from_peer_id\": {},", mv.from_peer);
            println!("    \"to_peer_id\": {}", mv.to_peer);
            println!("  }}");
            println!("}}");
            println!("--------------------------------");
        }
    }
}

fn display_expected_distribution(peers: &[PeerLoad], ideal_points_per_peer: f64) {
    println!("\nExpected distribution after these moves:");

    // Create a sorted copy to avoid modifying the original.
    let mut sorted_peers = peers.to_vec();
    sorted_peers.sort_by_key(|n| std::cmp::Reverse(n.point_count));

    for peer in &sorted_peers {
        let diff = (peer.point_count as f64) - ideal_points_per_peer;
        let diff_pct = if ideal_points_per_peer == 0.0 {
            0.0
        } else {
            diff / ideal_points_per_peer * 100.0
        };
        println!(
            "peer {}: {} shards, {} points, diff_from_ideal={:+.1}%",
            peer.peer_id, peer.shard_count, peer.point_count, diff_pct
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn options() -> Args {
        Args {
            max_moves: 10,
            target_relative_sd: 0.0,
            min_relative_improvement: 0.0,
            memory: MemoryArgs::default(),
        }
    }

    // Small fixtures include complete local/remote views, just like the HTTP collector.
    pub(super) fn reports(
        peer_ids: &[u64],
        replicas: &[(&str, u32, u64, u64)],
    ) -> BTreeMap<u64, BTreeMap<String, ClusterInfoResult>> {
        let collections: BTreeSet<_> = replicas.iter().map(|s| s.0).collect();
        peer_ids
            .iter()
            .map(|&peer_id| {
                let views = collections
                    .iter()
                    .map(|&collection| {
                        let local_shards = replicas
                            .iter()
                            .filter(|s| s.0 == collection && s.2 == peer_id)
                            .map(|s| LocalShardInfo {
                                shard_id: s.1,
                                points_count: s.3,
                                state: "Active".into(),
                            })
                            .collect();
                        let remote_shards = replicas
                            .iter()
                            .filter(|s| s.0 == collection && s.2 != peer_id)
                            .map(|s| RemoteShardInfo {
                                shard_id: s.1,
                                peer_id: s.2,
                                state: "Active".into(),
                            })
                            .collect();
                        (
                            collection.to_string(),
                            ClusterInfoResult {
                                peer_id,
                                local_shards,
                                remote_shards,
                                shard_transfers: BTreeSet::new(),
                                resharding_operations: None,
                            },
                        )
                    })
                    .collect();
                (peer_id, views)
            })
            .collect()
    }

    #[test]
    fn continues_below_ten_percent_unless_explicitly_requested() -> Result<()> {
        // Loads 114, 100, 86. The first move reaches 4.08%; a second reaches 0%.
        let snapshot = build_cluster_snapshot(&reports(
            &[1, 2, 3],
            &[
                ("a", 1, 1, 100),
                ("a", 2, 1, 9),
                ("a", 3, 1, 5),
                ("a", 4, 2, 100),
                ("a", 5, 3, 86),
            ],
        ))?;
        let plan = calculate_suggested_moves(&snapshot, &options());
        assert_eq!(plan.moves.len(), 2);
        assert_eq!(
            plan.peers.iter().map(|p| p.point_count).collect::<Vec<_>>(),
            vec![100, 100, 100]
        );
        assert_eq!(plan.stop_reason, StopReason::TargetReached);
        let plan = calculate_suggested_moves(
            &snapshot,
            &Args {
                target_relative_sd: 0.10,
                ..options()
            },
        );
        assert_eq!(plan.moves.len(), 1);
        assert_eq!(plan.stop_reason, StopReason::TargetReached);
        Ok(())
    }

    #[test]
    fn considers_sources_below_mean_plus_sd_and_destinations_above_mean() -> Result<()> {
        // Mean 100, SD ~71. No move from the largest, indivisible shard improves variance.
        // The useful 20-point move comes from peer 2, below mean + SD.
        let snapshot = build_cluster_snapshot(&reports(
            &[1, 2, 3, 4],
            &[
                ("a", 1, 1, 200),
                ("a", 2, 2, 100),
                ("a", 3, 2, 20),
                ("a", 4, 3, 80),
            ],
        ))?;
        let plan = calculate_suggested_moves(
            &snapshot,
            &Args {
                max_moves: 1,
                ..options()
            },
        );
        assert_eq!((plan.moves[0].from_peer, plan.moves[0].to_peer), (2, 4));
        assert_eq!(plan.stop_reason, StopReason::MoveLimitReached);

        // The only eligible destination is already above the mean, and crosses mean + SD.
        let mut snapshot = build_cluster_snapshot(&reports(
            &[1, 2, 3],
            &[("a", 1, 1, 59), ("a", 2, 1, 121), ("a", 3, 2, 120)],
        ))?;
        snapshot
            .excluded_peers
            .insert(3, BTreeSet::from(["recovery".into()]));
        let plan = calculate_suggested_moves(&snapshot, &options());
        assert_eq!(plan.moves.len(), 1);
        assert_eq!((plan.moves[0].from_peer, plan.moves[0].to_peer), (1, 2));
        Ok(())
    }

    #[test]
    fn never_places_two_copies_on_the_same_peer() -> Result<()> {
        let snapshot = build_cluster_snapshot(&reports(
            &[1, 2],
            &[("a", 1, 1, 40), ("a", 2, 1, 60), ("a", 1, 2, 40)],
        ))?;
        let plan = calculate_suggested_moves(&snapshot, &options());
        assert!(plan.moves.is_empty());
        assert_eq!(plan.stop_reason, StopReason::NoImprovingMove);
        assert!(plan.rejections["destination already hosts replica"] > 0);
        Ok(())
    }

    #[test]
    fn can_move_each_replica_of_a_shard() -> Result<()> {
        let snapshot = build_cluster_snapshot(&reports(
            &[1, 2, 3, 4],
            &[
                ("a", 1, 1, 40),
                ("a", 2, 1, 60),
                ("a", 1, 2, 40),
                ("a", 3, 2, 60),
            ],
        ))?;
        let plan = calculate_suggested_moves(&snapshot, &options());
        assert_eq!(plan.moves.len(), 2);
        assert!(plan.moves.iter().all(|m| m.shard_id == 1));
        assert_eq!((plan.moves[0].from_peer, plan.moves[0].to_peer), (1, 3));
        assert_eq!((plan.moves[1].from_peer, plan.moves[1].to_peer), (2, 4));
        Ok(())
    }

    #[test]
    fn keeps_shard_identity_collection_scoped_and_replays_conservatively() -> Result<()> {
        let snapshot = build_cluster_snapshot(&reports(
            &[1, 2, 3],
            &[
                ("a", 1, 1, 20),
                ("b", 1, 1, 60),
                ("c", 1, 1, 20),
                ("a", 1, 2, 20),
            ],
        ))?;
        let plan = calculate_suggested_moves(&snapshot, &options());
        assert_eq!(plan.moves[0].collection, "b");
        let mut replicas = snapshot.shards.clone();
        let mut peers = snapshot.peers.clone();
        let total_points: u64 = peers.iter().map(|p| p.point_count).sum();
        let mean = total_points as f64 / peers.len() as f64;
        for mv in &plan.moves {
            let before = calculate_standard_deviation(&peers, mean);
            assert!(!replicas.iter().any(|s| s.collection == mv.collection
                && s.shard_id == mv.shard_id
                && s.peer_id == mv.to_peer));
            let replica = replicas
                .iter_mut()
                .find(|s| {
                    s.collection == mv.collection
                        && s.shard_id == mv.shard_id
                        && s.peer_id == mv.from_peer
                })
                .expect("source replica exists");
            assert_eq!(replica.point_count, mv.point_count);
            replica.peer_id = mv.to_peer;
            for peer in &mut peers {
                if peer.peer_id == mv.from_peer {
                    peer.point_count -= mv.point_count;
                    peer.shard_count -= 1;
                }
                if peer.peer_id == mv.to_peer {
                    peer.point_count += mv.point_count;
                    peer.shard_count += 1;
                }
            }
            assert!(calculate_standard_deviation(&peers, mean) < before);
            assert_eq!(
                peers.iter().map(|p| p.point_count).sum::<u64>(),
                total_points
            );
            assert_eq!(
                peers.iter().map(|p| p.shard_count).sum::<usize>(),
                replicas.len()
            );
        }
        assert_eq!(peers, plan.peers);
        assert_eq!(
            replicas
                .iter()
                .find(|s| s.collection == "a" && s.peer_id == 1)
                .expect("unmoved a/1")
                .point_count,
            20
        );
        Ok(())
    }

    #[test]
    fn excludes_recovery_peers_and_other_copies_of_the_shard() -> Result<()> {
        let mut reports = reports(
            &[1, 2, 3, 4],
            &[
                ("a", 1, 1, 40),
                ("a", 2, 1, 60),
                ("a", 1, 2, 40),
                ("a", 1, 3, 0),
            ],
        );
        for collections in reports.values_mut() {
            let info = collections.get_mut("a").expect("collection a");
            if info.peer_id == 3 {
                info.local_shards[0].state = "Recovery".into();
            }
            for shard in &mut info.remote_shards {
                if shard.peer_id == 3 {
                    shard.state = "Recovery".into();
                }
            }
        }
        let snapshot = build_cluster_snapshot(&reports)?;
        let plan = calculate_suggested_moves(&snapshot, &options());
        assert!(!plan.moves.is_empty());
        assert!(plan
            .moves
            .iter()
            .all(|m| m.from_peer != 3 && m.to_peer != 3 && m.shard_id != 1));
        assert_eq!(plan.moves[0].to_peer, 4);
        Ok(())
    }

    #[test]
    fn excludes_transfer_endpoints_before_the_incoming_replica_exists() -> Result<()> {
        let mut reports = reports(
            &[1, 2, 3, 4],
            &[
                ("a", 1, 1, 40),
                ("a", 2, 1, 60),
                ("a", 1, 2, 40),
                ("a", 3, 2, 60),
                ("a", 4, 2, 20),
            ],
        );
        for collections in reports.values_mut() {
            collections
                .get_mut("a")
                .expect("collection a")
                .shard_transfers
                .insert(ShardTransferInfo {
                    shard_id: 1,
                    to_shard_id: None,
                    from: 1,
                    to: 3,
                    sync: false,
                });
        }
        let snapshot = build_cluster_snapshot(&reports)?;
        let plan = calculate_suggested_moves(&snapshot, &options());
        assert!(!plan.moves.is_empty());
        assert!(plan
            .moves
            .iter()
            .all(|m| m.from_peer == 2 && m.to_peer == 4 && m.shard_id != 1));
        Ok(())
    }

    #[test]
    fn refuses_resharding_and_inconsistent_snapshots() {
        let replicas = [("a", 1, 1, 40), ("a", 2, 1, 60)];
        for corruption in [
            "identity",
            "collections",
            "placement",
            "state",
            "transfer",
            "resharding",
            "duplicate",
            "unknown peer",
            "remote local",
        ] {
            let mut reports = reports(&[1, 2], &replicas);
            let collections = reports.get_mut(&2).expect("peer 2");
            let info = collections.get_mut("a").expect("collection a");
            match corruption {
                "identity" => info.peer_id = 1,
                "collections" => {
                    collections.clear();
                }
                "placement" => {
                    info.remote_shards.pop();
                }
                "state" => info.remote_shards[0].state = "Dead".into(),
                "transfer" => {
                    info.shard_transfers.insert(ShardTransferInfo {
                        shard_id: 1,
                        to_shard_id: None,
                        from: 1,
                        to: 2,
                        sync: false,
                    });
                }
                "resharding" => {
                    info.resharding_operations = Some(vec![serde_json::json!({"shard_id": 3})])
                }
                "duplicate" => info.remote_shards.push(RemoteShardInfo {
                    shard_id: 1,
                    peer_id: 1,
                    state: "Active".into(),
                }),
                "unknown peer" => info.remote_shards[0].peer_id = 99,
                "remote local" => info.remote_shards[0].peer_id = 2,
                _ => unreachable!(),
            }
            assert!(
                build_cluster_snapshot(&reports).is_err(),
                "accepted {corruption}"
            );
        }
        assert!(build_cluster_snapshot(&BTreeMap::new()).is_err());
    }

    #[test]
    fn rejects_missing_safety_fields_in_api_responses() {
        let response = serde_json::json!({"peer_id": 1, "local_shards": [], "remote_shards": []});
        assert!(serde_json::from_value::<ClusterInfoResult>(response).is_err());
        let response = serde_json::json!({
            "peer_id": 1, "local_shards": [{"shard_id": 1, "points_count": 1}],
            "remote_shards": [], "shard_transfers": []
        });
        assert!(serde_json::from_value::<ClusterInfoResult>(response).is_err());
    }

    #[test]
    fn handles_empty_single_peer_and_all_zero_clusters() -> Result<()> {
        for reports in [
            reports(&[1, 2], &[]),
            reports(&[1], &[("a", 1, 1, 100)]),
            reports(&[1, 2], &[("a", 1, 1, 0)]),
        ] {
            let snapshot = build_cluster_snapshot(&reports)?;
            let plan = calculate_suggested_moves(&snapshot, &options());
            assert!(plan.moves.is_empty());
            assert_eq!(plan.stop_reason, StopReason::TargetReached);
        }
        Ok(())
    }

    #[test]
    fn honors_minimum_improvement_and_validates_cli_ratios() -> Result<()> {
        let snapshot =
            build_cluster_snapshot(&reports(&[1, 2], &[("a", 1, 1, 99), ("a", 2, 1, 1)]))?;
        let plan = calculate_suggested_moves(
            &snapshot,
            &Args {
                min_relative_improvement: 0.05,
                ..options()
            },
        );
        assert!(plan.moves.is_empty());
        assert_eq!(plan.stop_reason, StopReason::NoImprovingMove);
        assert!(plan.rejections["below minimum variance improvement"] > 0);
        assert!(!calculate_suggested_moves(&snapshot, &options())
            .moves
            .is_empty());
        for value in ["NaN", "inf", "-0.1", "1.1"] {
            assert!(Args::try_parse_from(["rebalance", "--target-relative-sd", value]).is_err());
            assert!(
                Args::try_parse_from(["rebalance", "--min-relative-improvement", value]).is_err()
            );
        }
        Ok(())
    }

    #[test]
    fn tie_breaking_is_independent_of_input_order() -> Result<()> {
        let mut snapshot = build_cluster_snapshot(&reports(
            &[3, 2, 1],
            &[("b", 1, 1, 20), ("a", 1, 1, 20), ("c", 1, 1, 60)],
        ))?;
        let plan = calculate_suggested_moves(&snapshot, &options());
        snapshot.peers.reverse();
        snapshot.shards.reverse();
        let reversed = calculate_suggested_moves(&snapshot, &options());
        assert_eq!(plan.moves, reversed.moves);
        assert_eq!(plan.peers, reversed.peers);
        assert_eq!(
            (plan.moves[0].collection.as_str(), plan.moves[0].to_peer),
            ("c", 2)
        );
        Ok(())
    }
}
