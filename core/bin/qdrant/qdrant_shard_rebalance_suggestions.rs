use anyhow::{anyhow, ensure, Error, Result};
use clap::Parser;
use dust::data_sources::qdrant::{env_var_prefix_for_cluster, QdrantCluster};
use regex::Regex;
use serde::Deserialize;
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::time::{Duration, Instant};
use url::Url;

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

#[derive(Deserialize, Debug)]
struct ClusterInfoResult {
    peer_id: u64,
    local_shards: Vec<LocalShardInfo>,
    remote_shards: Vec<RemoteShardInfo>,
    shard_transfers: Vec<serde_json::Value>,
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

#[derive(Debug, Clone)]
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

#[derive(Debug, Clone, PartialEq)]
struct ShardMove {
    collection: String,
    shard_id: u32,
    from_peer: u64,
    to_peer: u64,
    point_count: u64,
    estimated_memory_bytes: Option<f64>,
}

const QDRANT_HTTP_PORT: &str = ":6333";
const QDRANT_GRPC_PORT: &str = ":6334";

const MAX_MOVES: usize = 10;

#[derive(Parser)]
#[command(about = "Suggest Qdrant shard moves; never execute them")]
struct Args {
    /// Fit shared shard RAM to node totals and placement; suggest one move.
    #[arg(long)]
    estimate_memory: bool,
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

    // Step 1: Gather cluster data.
    let started_at = Instant::now();
    let (peers, shards) = gather_cluster_data(&peer_uris, &api_key).await?;
    let memory_by_peer = gather_peer_memory(&peer_uris, &api_key, args.estimate_memory).await?;
    if args.estimate_memory {
        ensure!(
            started_at.elapsed() <= Duration::from_secs(300),
            "Snapshot took over five minutes; refresh before estimating memory moves"
        );
        println!("ESTIMATE: shared shard RAM fitted to node totals, including process overhead and temporary allocations.");
        println!("This assumes replicas of the same shard have equal RAM; point counts guide ambiguous estimates.");
        println!("Physical capacity and transfer headroom are not checked. Recheck live capacity before moving a shard.");
    }

    // Step 2: Analyze current distribution.
    let (_, _, ideal_points_per_peer) = analyze_cluster_distribution(&peers, &memory_by_peer);

    // Step 3: Calculate suggested moves.
    let (suggested_moves, updated_peers) = calculate_suggested_moves(
        peers,
        &shards,
        args.estimate_memory.then_some(&memory_by_peer),
    )?;

    // Step 4: Display move suggestions.
    display_move_suggestions(&suggested_moves);

    // Step 5: Display expected distribution after moves.
    display_expected_distribution(&updated_peers, ideal_points_per_peer);

    println!("Execute moves one at a time, wait for completion, then rerun with fresh state.");
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

async fn gather_cluster_data(
    peer_uris: &HashMap<u64, String>,
    api_key: &str,
) -> Result<(Vec<PeerLoad>, Vec<ShardInfo>)> {
    ensure!(!peer_uris.is_empty(), "No peers discovered");
    let client = reqwest::Client::new();
    let mut peers = Vec::new();
    let mut shards = Vec::new();
    let mut expected_collections = None;
    let mut placements = HashMap::new();
    for (&peer_id, peer_uri) in peer_uris {
        let base_uri = peer_uri.trim_end_matches('/');
        let response: QdrantResponse<CollectionsResult> =
            get_json(&client, &format!("{}/collections", base_uri), api_key).await?;
        ensure!(
            response.status == "ok",
            "Cannot list collections on peer {}",
            peer_id
        );
        let collections: BTreeSet<_> = response
            .result
            .collections
            .into_iter()
            .map(|c| c.name)
            .collect();
        if let Some(expected) = &expected_collections {
            ensure!(
                *expected == collections,
                "Collection inventories differ; refresh the snapshot"
            );
        } else {
            expected_collections = Some(collections.clone());
        }
        let mut peer = PeerLoad {
            peer_id,
            shard_count: 0,
            point_count: 0,
        };
        for collection in collections {
            let response: QdrantResponse<ClusterInfoResult> = get_json(
                &client,
                &format!("{}/collections/{}/cluster", base_uri, collection),
                api_key,
            )
            .await?;
            ensure!(
                response.status == "ok",
                "Cannot read placement for {} on peer {}",
                collection,
                peer_id
            );
            let info = response.result;
            validate_cluster_info(peer_id, &collection, &info)?;
            let placement: BTreeSet<_> = info
                .local_shards
                .iter()
                .map(|s| (s.shard_id, peer_id))
                .chain(info.remote_shards.iter().map(|s| (s.shard_id, s.peer_id)))
                .collect();
            ensure!(
                placement.len() == info.local_shards.len() + info.remote_shards.len(),
                "Duplicate replica in {}",
                collection
            );
            ensure!(
                placement
                    .iter()
                    .all(|(_, peer)| peer_uris.contains_key(peer)),
                "Unknown peer in {} placement",
                collection
            );
            if let Some(previous) = placements.insert(collection.clone(), placement.clone()) {
                ensure!(
                    previous == placement,
                    "Replica inventories differ for {}; refresh the snapshot",
                    collection
                );
            }
            for shard in info.local_shards {
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
    peers
        .iter()
        .try_fold(0_u64, |sum, p| sum.checked_add(p.point_count))
        .ok_or_else(|| anyhow!("Cluster point count overflow"))?;
    peers.sort_by_key(|p| std::cmp::Reverse(p.point_count));
    Ok((peers, shards))
}

fn validate_cluster_info(
    expected_peer: u64,
    collection: &str,
    info: &ClusterInfoResult,
) -> Result<()> {
    ensure!(
        info.peer_id == expected_peer,
        "Expected peer {}, got {}",
        expected_peer,
        info.peer_id
    );
    let resharding_count = info.resharding_operations.as_ref().map_or(0, Vec::len);
    if !info.shard_transfers.is_empty() || resharding_count > 0 {
        eprintln!(
            "Warning: collection {} on peer {} has ongoing transfers ({}) or resharding operations ({}). Suggestions do not account for incoming load.",
            collection, expected_peer, info.shard_transfers.len(), resharding_count
        );
    }
    if info.local_shards.iter().any(|s| s.state != "Active")
        || info.remote_shards.iter().any(|s| s.state != "Active")
    {
        eprintln!(
            "Warning: collection {} on peer {} has non-active replicas. Suggestions may include these replicas and use incomplete point counts.",
            collection, expected_peer
        );
    }
    ensure!(
        info.remote_shards
            .iter()
            .all(|s| s.peer_id != expected_peer),
        "Peer {} lists a local replica as remote",
        expected_peer
    );
    Ok(())
}

// Fetch each peer's jemalloc resident memory from /telemetry. This is the qdrant process's
// heap-resident memory, not the node's full working set (excludes OS page cache for mmapped
// segments), so it reads lower than the Qdrant Cloud console RAM graphs.
async fn gather_peer_memory(
    peer_uris: &HashMap<u64, String>,
    api_key: &str,
    require_memory: bool,
) -> Result<HashMap<u64, Option<u64>>> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()?;

    let mut memory_by_peer = HashMap::new();
    for (peer_id, peer_uri) in peer_uris {
        let telemetry_url = format!(
            "{}/telemetry?details_level=1",
            peer_uri.trim_end_matches('/')
        );
        // Point mode tolerates missing display-only telemetry; memory mode requires every peer.
        let telemetry: Result<QdrantResponse<TelemetryResult>> =
            get_json(&client, &telemetry_url, api_key).await;
        let telemetry = telemetry.and_then(|response| {
            ensure!(
                response.status == "ok",
                "Telemetry failed for peer {}",
                peer_id
            );
            if require_memory {
                let actual_peer = response
                    .result
                    .cluster
                    .and_then(|c| c.status)
                    .and_then(|s| s.peer_id);
                ensure!(
                    actual_peer == Some(*peer_id),
                    "Missing or mismatched telemetry identity for peer {}",
                    peer_id
                );
            }
            Ok(response.result.memory.map(|m| m.resident_bytes))
        });
        let resident_bytes = match telemetry {
            Ok(memory) => memory,
            Err(e) if require_memory => return Err(e),
            Err(e) => {
                println!("WARNING: no telemetry for peer {}: {}", peer_id, e);
                None
            }
        };

        memory_by_peer.insert(*peer_id, resident_bytes);
    }

    Ok(memory_by_peer)
}

fn analyze_cluster_distribution(
    peers: &[PeerLoad],
    memory_by_peer: &HashMap<u64, Option<u64>>,
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
            Some(resident_bytes) => format!("{:.1}", resident_bytes as f64 / 1e9),
            None => "n/a".to_string(),
        };
        println!(
            "Peer {}: {} shards, {} points, diff_from_ideal={:+.1}%, ram_resident_gb={}",
            peer.peer_id, peer.shard_count, peer.point_count, diff_pct, ram_resident_gb
        );
    }

    (total_points, peer_count, ideal_points_per_peer)
}

fn estimate_shard_memory<'a>(
    peers: &[PeerLoad],
    shards: &'a [ShardInfo],
    measured_loads: &BTreeMap<u64, f64>,
) -> HashMap<(&'a str, u32), f64> {
    // Fit sum(hosted shard RAM) to each node's measured RAM. A weak penalty toward
    // proportional estimates stabilizes shards that placement cannot distinguish.
    const REGULARIZATION: f64 = 0.01;
    const MAX_SWEEPS: usize = 10_000;
    let points_by_peer: HashMap<_, _> = peers.iter().map(|p| (p.peer_id, p.point_count)).collect();
    let mut ordered_shards: Vec<_> = shards.iter().collect();
    ordered_shards.sort_by_key(|s| (s.collection.as_str(), s.shard_id, s.peer_id));
    let mut estimates: BTreeMap<_, (f64, Vec<u64>)> = BTreeMap::new();
    for shard in ordered_shards {
        let estimate = measured_loads[&shard.peer_id] * shard.point_count as f64
            / points_by_peer[&shard.peer_id] as f64;
        let entry = estimates
            .entry((shard.collection.as_str(), shard.shard_id))
            .or_default();
        entry.0 += estimate;
        entry.1.push(shard.peer_id);
    }
    for (prior, hosts) in estimates.values_mut() {
        *prior /= hosts.len() as f64;
    }
    let mut weights: HashMap<_, _> = estimates
        .iter()
        .map(|(&key, (prior, _))| (key, *prior))
        .collect();
    let mut residuals = measured_loads.clone();
    for (prior, hosts) in estimates.values() {
        for peer in hosts {
            residuals.entry(*peer).and_modify(|r| *r -= prior);
        }
    }
    let rms = |residuals: &BTreeMap<u64, f64>| {
        (residuals.values().map(|r| r * r).sum::<f64>() / residuals.len().max(1) as f64).sqrt()
    };
    let initial_error = rms(&residuals);
    let tolerance = measured_loads.values().copied().fold(1.0, f64::max) * 1e-8;
    // Coordinate descent touches only a shard's hosts, about 140 replicas per sweep.
    for sweep in 0..MAX_SWEEPS {
        let mut max_change: f64 = 0.0;
        for (key, (prior, hosts)) in &estimates {
            let weight = weights[key];
            let correction = (hosts.iter().map(|peer| residuals[peer]).sum::<f64>()
                - REGULARIZATION * (weight - prior))
                / (hosts.len() as f64 + REGULARIZATION);
            let updated = (weight + correction).max(0.0);
            let change = updated - weight;
            weights.insert(*key, updated);
            for peer in hosts {
                residuals.entry(*peer).and_modify(|r| *r -= change);
            }
            max_change = max_change.max(change.abs());
        }
        if max_change <= tolerance {
            break;
        }
        if sweep + 1 == MAX_SWEEPS {
            eprintln!(
                "Warning: shard RAM fit reached its iteration limit; using the current estimates."
            );
        }
    }
    println!(
        "Shard RAM fit: node RMS error {:.3} -> {:.3} GB.",
        initial_error / 1e9,
        rms(&residuals) / 1e9
    );
    weights
}

fn calculate_suggested_moves(
    mut peers: Vec<PeerLoad>,
    all_shards: &[ShardInfo],
    memory: Option<&HashMap<u64, Option<u64>>>,
) -> Result<(Vec<ShardMove>, Vec<PeerLoad>)> {
    peers.sort_by_key(|p| p.peer_id);
    let mut loads = BTreeMap::new();
    for peer in &peers {
        let load = match memory {
            Some(memory) => {
                let bytes = memory
                    .get(&peer.peer_id)
                    .copied()
                    .flatten()
                    .filter(|bytes| *bytes > 0)
                    .ok_or_else(|| anyhow!("Missing allocator memory for peer {}", peer.peer_id))?;
                ensure!(
                    peer.shard_count == 0 || peer.point_count > 0,
                    "Cannot estimate memory for zero-point replicas on peer {}",
                    peer.peer_id
                );
                bytes as f64
            }
            None => peer.point_count as f64,
        };
        loads.insert(peer.peer_id, load);
    }
    let measured_loads = loads.clone();
    let mut shard_weights = HashMap::new();
    if memory.is_some() {
        shard_weights = estimate_shard_memory(&peers, all_shards, &measured_loads);
        loads.values_mut().for_each(|load| *load = 0.0);
        for shard in all_shards {
            let weight = shard_weights[&(shard.collection.as_str(), shard.shard_id)];
            loads
                .entry(shard.peer_id)
                .and_modify(|load| *load += weight);
        }
        println!("Modeled loads can differ from measured RAM; memory on peers without replicas is not modeled.");
    }
    let initial_loads = loads.clone();
    // Fitted weights can make equal-load swaps appear improving through roundoff.
    let load_tolerance = if memory.is_some() {
        loads.values().copied().fold(1.0, f64::max) * 1e-9
    } else {
        0.0
    };
    let mut shards = all_shards.to_vec();
    let mut moves = Vec::new();
    let limit = if memory.is_some() { 1 } else { MAX_MOVES };
    for _ in 0..limit {
        shards.sort_by(|a, b| {
            (&a.collection, a.shard_id, a.peer_id).cmp(&(&b.collection, b.shard_id, b.peer_id))
        });
        let occupied: HashSet<_> = shards
            .iter()
            .map(|s| (s.collection.as_str(), s.shard_id, s.peer_id))
            .collect();
        let mut best = None;
        let mut best_score = (0.0, 0.0);
        // Roughly 140 replicas * 38 peers; score each candidate without cloning the placement.
        for (index, shard) in shards.iter().enumerate() {
            let source_load = loads[&shard.peer_id];
            let weight = match memory {
                Some(_) => shard_weights[&(shard.collection.as_str(), shard.shard_id)],
                None => shard.point_count as f64,
            };
            for (&destination, &destination_load) in &loads {
                if occupied.contains(&(shard.collection.as_str(), shard.shard_id, destination)) {
                    continue;
                }
                // The squared-load sum decreases by 2*s*(A-B-s), requiring 0 < s < A-B.
                let difference = source_load - destination_load;
                if weight <= load_tolerance || difference - weight <= load_tolerance {
                    continue;
                }
                let score = (
                    if memory.is_some() { source_load } else { 0.0 },
                    weight * (difference - weight),
                );
                if score > best_score {
                    best_score = score;
                    best = Some((index, destination, weight));
                }
            }
        }
        let Some((index, destination, weight)) = best else {
            println!("Stopped: no admissible single move improves the distribution.");
            break;
        };
        let shard = &mut shards[index];
        loads
            .entry(shard.peer_id)
            .and_modify(|load| *load -= weight);
        loads.entry(destination).and_modify(|load| *load += weight);
        for peer in &mut peers {
            if peer.peer_id == shard.peer_id {
                peer.point_count -= shard.point_count;
                peer.shard_count -= 1;
            }
            if peer.peer_id == destination {
                peer.point_count += shard.point_count;
                peer.shard_count += 1;
            }
        }
        moves.push(ShardMove {
            collection: shard.collection.clone(),
            shard_id: shard.shard_id,
            from_peer: shard.peer_id,
            to_peer: destination,
            point_count: shard.point_count,
            estimated_memory_bytes: memory.map(|_| weight),
        });
        if memory.is_some() {
            println!(
                "Estimated allocator RAM after the move: source {:.2} GB, destination {:.2} GB.",
                loads[&shard.peer_id] / 1e9,
                loads[&destination] / 1e9
            );
        }
        shard.peer_id = destination;
    }
    if moves.len() == limit {
        println!(
            "Stopped: suggestion limit reached ({}). Refresh state before planning more moves.",
            limit
        );
    }
    if memory.is_some() {
        for peer in &peers {
            println!(
                "Peer {}: measured {:.3} GB, modeled {:.3} -> {:.3} GB.",
                peer.peer_id,
                measured_loads[&peer.peer_id] / 1e9,
                initial_loads[&peer.peer_id] / 1e9,
                loads[&peer.peer_id] / 1e9
            );
        }
    }
    Ok((moves, peers))
}

fn display_move_suggestions(suggested_moves: &[ShardMove]) {
    if suggested_moves.is_empty() {
        println!("\nNo moves suggested.");
    } else {
        println!("\nSuggested moves:");
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

            if let Some(bytes) = mv.estimated_memory_bytes {
                println!(
                    "Estimated source relief / destination increase: {:.2} GB.",
                    bytes / 1e9
                );
            }
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
