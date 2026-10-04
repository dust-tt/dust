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
    /// Estimate replica RAM from its share of source-peer points; suggest one move.
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
        println!("ESTIMATE: replica RAM = source allocator resident bytes * replica points / source points.");
        println!("This apportions shared process overhead and assumes equal bytes per point within each peer.");
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

/// @cc [owner:aubin-tchoi,label:backend] settled-complete-placement
/// Collect every discovered peer, including empty peers. Reject mismatched peer identities or
/// collection/replica inventories, duplicate replicas, non-active replicas, transfers, and resharding.
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
            validate_cluster_info(peer_id, &info)?;
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

fn validate_cluster_info(expected_peer: u64, info: &ClusterInfoResult) -> Result<()> {
    ensure!(
        info.peer_id == expected_peer,
        "Expected peer {}, got {}",
        expected_peer,
        info.peer_id
    );
    ensure!(
        info.shard_transfers.is_empty()
            && info
                .resharding_operations
                .as_ref()
                .is_none_or(Vec::is_empty),
        "Transfers or resharding in progress; wait for completion and rerun"
    );
    ensure!(
        info.local_shards.iter().all(|s| s.state == "Active")
            && info.remote_shards.iter().all(|s| s.state == "Active"),
        "Non-active replica found; wait for recovery and rerun"
    );
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

/**
 * @cc [owner:aubin-tchoi,label:backend] admissible-greedy-moves
 * In point mode, select the largest variance improvement among all single-replica moves. Both modes
 * exclude existing destination replicas and break ties by collection, shard, source, destination.
 * Preserve point and replica totals. Stop after ten point moves or when no improving move remains.
 */
/**
 * @cc [owner:aubin-tchoi,label:backend] explicit-memory-estimate
 * With memory enabled, require nonzero allocator telemetry for every peer. Estimate each replica
 * from its fraction of source points, prefer the most loaded eligible source, and suggest only one
 * move before requiring fresh state. These estimates do not establish physical capacity or headroom.
 */
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
                Some(_) => {
                    let source_points = peers
                        .iter()
                        .find(|p| p.peer_id == shard.peer_id)
                        .ok_or_else(|| anyhow!("Unknown source peer {}", shard.peer_id))?
                        .point_count;
                    source_load * (shard.point_count as f64 / source_points as f64)
                }
                None => shard.point_count as f64,
            };
            for (&destination, &destination_load) in &loads {
                if occupied.contains(&(shard.collection.as_str(), shard.shard_id, destination)) {
                    continue;
                }
                // The squared-load sum decreases by 2*s*(A-B-s), requiring 0 < s < A-B.
                let difference = source_load - destination_load;
                if weight <= 0.0 || weight >= difference {
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

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(
        peer_ids: &[u64],
        replicas: &[(&str, u32, u64, u64)],
    ) -> (Vec<PeerLoad>, Vec<ShardInfo>) {
        let mut peers: Vec<_> = peer_ids
            .iter()
            .map(|&peer_id| PeerLoad {
                peer_id,
                shard_count: 0,
                point_count: 0,
            })
            .collect();
        let shards = replicas
            .iter()
            .map(|&(collection, shard_id, peer_id, point_count)| {
                let peer = peers
                    .iter_mut()
                    .find(|p| p.peer_id == peer_id)
                    .expect("fixture peer");
                peer.point_count += point_count;
                peer.shard_count += 1;
                ShardInfo {
                    collection: collection.into(),
                    shard_id,
                    peer_id,
                    point_count,
                }
            })
            .collect();
        (peers, shards)
    }

    #[test]
    fn continues_past_ten_percent_and_balances_empty_peers() -> Result<()> {
        for replicas in [
            vec![
                ("a", 1, 1, 100),
                ("a", 2, 1, 9),
                ("a", 3, 1, 5),
                ("a", 4, 2, 100),
                ("a", 5, 3, 86),
            ],
            vec![("a", 1, 1, 100), ("a", 2, 1, 100), ("a", 3, 1, 100)],
        ] {
            let (peers, shards) = fixture(&[1, 2, 3], &replicas);
            let (moves, peers) = calculate_suggested_moves(peers, &shards, None)?;
            assert_eq!(moves.len(), 2);
            assert!(peers.iter().all(|p| p.point_count == 100));
        }
        Ok(())
    }

    #[test]
    fn considers_moves_excluded_by_the_old_source_and_destination_thresholds() -> Result<()> {
        let (peers, shards) = fixture(
            &[1, 2, 3, 4],
            &[
                ("a", 1, 1, 200),
                ("a", 2, 2, 100),
                ("a", 3, 2, 20),
                ("a", 4, 3, 80),
            ],
        );
        let (moves, _) = calculate_suggested_moves(peers, &shards, None)?;
        assert_eq!((moves[0].from_peer, moves[0].to_peer), (2, 4));

        let (peers, shards) = fixture(
            &[1, 2, 3],
            &[
                ("a", 1, 1, 59),
                ("a", 2, 1, 121),
                ("a", 3, 2, 120),
                ("a", 1, 3, 0),
                ("a", 2, 3, 0),
            ],
        );
        let (moves, _) = calculate_suggested_moves(peers, &shards, None)?;
        assert_eq!((moves[0].from_peer, moves[0].to_peer), (1, 2));
        Ok(())
    }

    #[test]
    fn preserves_replica_placement_and_collection_identity() -> Result<()> {
        for replicas in [
            vec![
                ("a", 1, 1, 40),
                ("a", 2, 1, 60),
                ("a", 1, 2, 40),
                ("a", 3, 2, 60),
            ],
            vec![
                ("a", 1, 1, 20),
                ("b", 1, 1, 60),
                ("c", 1, 1, 20),
                ("a", 1, 2, 20),
            ],
        ] {
            let (peers, mut shards) = fixture(&[1, 2, 3, 4], &replicas);
            let total: u64 = peers.iter().map(|p| p.point_count).sum();
            let (moves, peers) = calculate_suggested_moves(peers, &shards, None)?;
            assert_eq!(moves.len(), 2);
            for mv in moves {
                assert!(!shards.iter().any(|s| s.collection == mv.collection
                    && s.shard_id == mv.shard_id
                    && s.peer_id == mv.to_peer));
                let shard = shards
                    .iter_mut()
                    .find(|s| {
                        s.collection == mv.collection
                            && s.shard_id == mv.shard_id
                            && s.peer_id == mv.from_peer
                    })
                    .expect("source replica exists");
                assert_eq!(shard.point_count, mv.point_count);
                shard.peer_id = mv.to_peer;
            }
            assert_eq!(peers.iter().map(|p| p.point_count).sum::<u64>(), total);
            assert_eq!(
                peers.iter().map(|p| p.shard_count).sum::<usize>(),
                shards.len()
            );
            for peer in peers {
                assert_eq!(
                    peer.point_count,
                    shards
                        .iter()
                        .filter(|s| s.peer_id == peer.peer_id)
                        .map(|s| s.point_count)
                        .sum::<u64>()
                );
            }
        }
        Ok(())
    }

    #[test]
    fn handles_zero_loads_and_resolves_ties_deterministically() -> Result<()> {
        let (peers, shards) = fixture(&[1, 2], &[("a", 1, 1, 0)]);
        assert!(calculate_suggested_moves(peers, &shards, None)?
            .0
            .is_empty());
        let (mut peers, mut shards) = fixture(
            &[1, 2, 3],
            &[("a", 1, 1, 20), ("b", 1, 1, 20), ("c", 1, 1, 60)],
        );
        let first = calculate_suggested_moves(peers.clone(), &shards, None)?.0;
        peers.reverse();
        shards.reverse();
        assert_eq!(first, calculate_suggested_moves(peers, &shards, None)?.0);
        Ok(())
    }

    #[test]
    fn estimates_memory_when_points_are_balanced_and_suggests_only_one_move() -> Result<()> {
        let (peers, shards) = fixture(
            &[1, 2, 3],
            &[
                ("a", 1, 1, 40),
                ("a", 2, 1, 60),
                ("a", 3, 2, 100),
                ("a", 4, 3, 100),
            ],
        );
        assert!(calculate_suggested_moves(peers.clone(), &shards, None)?
            .0
            .is_empty());
        let memory = HashMap::from([(1, Some(900)), (2, Some(400)), (3, Some(300))]);
        let (moves, _) = calculate_suggested_moves(peers, &shards, Some(&memory))?;
        assert_eq!(moves.len(), 1);
        assert_eq!(
            (moves[0].from_peer, moves[0].to_peer, moves[0].shard_id),
            (1, 3, 1)
        );
        assert_eq!(moves[0].estimated_memory_bytes, Some(360.0));
        Ok(())
    }

    #[test]
    fn refuses_memory_estimates_without_usable_telemetry_or_points() {
        let (peers, shards) = fixture(&[1, 2], &[("a", 1, 1, 40), ("a", 2, 1, 60)]);
        for memory in [
            HashMap::new(),
            HashMap::from([(1, Some(900)), (2, None)]),
            HashMap::from([(1, Some(0)), (2, Some(300))]),
        ] {
            assert!(calculate_suggested_moves(peers.clone(), &shards, Some(&memory)).is_err());
        }
        let (peers, shards) = fixture(&[1, 2], &[("a", 1, 1, 0)]);
        let memory = HashMap::from([(1, Some(900)), (2, Some(300))]);
        assert!(calculate_suggested_moves(peers, &shards, Some(&memory)).is_err());
    }

    #[test]
    fn refuses_unsettled_placement_and_wrong_peer_identity() -> Result<()> {
        let settled = serde_json::json!({
            "peer_id": 1,
            "local_shards": [{"shard_id": 1, "points_count": 100, "state": "Active"}],
            "remote_shards": [{"shard_id": 1, "peer_id": 2, "state": "Active"}],
            "shard_transfers": [], "resharding_operations": []
        });
        validate_cluster_info(1, &serde_json::from_value(settled.clone())?)?;
        for field in ["identity", "local", "remote", "transfer", "resharding"] {
            let mut info = settled.clone();
            match field {
                "identity" => info["peer_id"] = 2.into(),
                "local" => info["local_shards"][0]["state"] = "Recovery".into(),
                "remote" => info["remote_shards"][0]["state"] = "Dead".into(),
                "transfer" => info["shard_transfers"] = serde_json::json!([{}]),
                "resharding" => info["resharding_operations"] = serde_json::json!([{}]),
                _ => unreachable!(),
            }
            assert!(
                validate_cluster_info(1, &serde_json::from_value(info)?).is_err(),
                "accepted {field}"
            );
        }
        Ok(())
    }
}
