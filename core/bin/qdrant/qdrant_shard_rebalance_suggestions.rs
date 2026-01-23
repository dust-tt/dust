use anyhow::{anyhow, Error, Result};
use dust::data_sources::qdrant::{env_var_prefix_for_cluster, QdrantCluster};
use regex::Regex;
use serde::Deserialize;
use std::collections::HashMap;
use std::io::Write;
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
}

#[derive(Deserialize, Debug)]
struct ClusterInfoResult {
    peer_id: u64,
    local_shards: Vec<LocalShardInfo>,
}

// Generic wrapper for all Qdrant HTTP API responses
#[derive(Deserialize)]
struct QdrantResponse<T> {
    status: String,
    result: T,
}

#[derive(Debug, Clone)]
pub struct PeerLoad {
    peer_id: u64,
    shard_count: usize,
    point_count: u64,
}

#[derive(Debug, Clone)]
pub struct ShardInfo {
    collection: String,
    peer_id: u64,
    point_count: u64,
    shard_id: u32,
}

#[derive(Debug, Clone)]
pub struct ShardMove {
    collection: String,
    shard_id: u32,
    from_peer: u64,
    to_peer: u64,
    point_count: u64,
}

const QDRANT_HTTP_PORT: &str = ":6333";
const QDRANT_GRPC_PORT: &str = ":6334";

const MAX_MOVES: usize = 10; // Only allow up to 10 suggestions.
const IMBALANCE_THRESHOLD: f64 = 0.10; // Allow up to 10% imbalance between peers.
const DEBUG_MODE: bool = false; // Set to true to enable detailed logging.

// Simple macro for debug logging
macro_rules! debug {
    ($($arg:tt)*) => {
        if DEBUG_MODE {
            println!($($arg)*);
        }
    }
}

#[tokio::main]
async fn main() -> Result<()> {
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
    let (peers, shards) = gather_cluster_data(&peer_uris, &api_key).await?;

    // Step 2: Analyze current distribution.
    let (_, _, ideal_points_per_peer) = analyze_cluster_distribution(&peers);

    // Step 3: Calculate suggested moves.
    let (suggested_moves, updated_peers) =
        calculate_suggested_moves(peers, &shards, ideal_points_per_peer);

    // Step 4: Display move suggestions.
    display_move_suggestions(&suggested_moves);

    // Step 5: Display expected distribution after moves.
    display_expected_distribution(&updated_peers, ideal_points_per_peer);

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

    let mut req = http_client.get(format!("{}/cluster", seed_uri));
    if !api_key.is_empty() {
        req = req.header("api-key", api_key);
    }

    let cluster_resp: QdrantResponse<ClusterStatus> =
        req.send().await?.error_for_status()?.json().await?;

    if cluster_resp.status != "ok" {
        return Err(anyhow!(
            "Unexpected cluster response status: {}",
            cluster_resp.status
        ));
    }

    // Extract cluster information from the seed peer's URL.
    let (cluster_id, _region, _cloud_provider) = extract_cluster_info(&seed_uri)?;

    let cluster_info = cluster_resp.result;
    println!("Current peer is peer {}", cluster_info.peer_id);

    println!("Found {} peers", cluster_info.peers.len());

    Ok(cluster_info
        .peers
        .iter()
        .map(|(id, peer)| {
            let peer_id = id.parse::<u64>().unwrap();

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
        .collect::<Result<HashMap<_, _>>>()?)
}

async fn gather_cluster_data(
    peer_uris: &HashMap<u64, String>,
    api_key: &str,
) -> Result<(Vec<PeerLoad>, Vec<ShardInfo>), Error> {
    let client = reqwest::Client::new();

    // Initialize peer_load with all peers, even those with no shards
    let mut peer_load: HashMap<u64, PeerLoad> = peer_uris
        .keys()
        .map(|&peer_id| {
            (
                peer_id,
                PeerLoad {
                    peer_id,
                    shard_count: 0,
                    point_count: 0,
                },
            )
        })
        .collect();

    let mut all_shards: Vec<ShardInfo> = Vec::new();

    for (_peer_id, peer_uri) in peer_uris {
        // Make sure the URI has the correct format.
        let base_uri = if peer_uri.ends_with('/') {
            peer_uri.to_string()
        } else {
            format!("{}/", peer_uri)
        };

        // Get list of collections for this peer.
        let collections_url = format!("{}collections", base_uri);
        let collections_response = client
            .get(&collections_url)
            .header("api-key", api_key)
            .send()
            .await?
            .json::<QdrantResponse<CollectionsResult>>()
            .await?;

        let collections = collections_response.result.collections;

        // Collect peer loads and shard data.
        for collection in collections {
            let cluster_info_url = format!("{}collections/{}/cluster", base_uri, collection.name);
            let cluster_info = client
                .get(&cluster_info_url)
                .header("api-key", api_key)
                .send()
                .await?
                .json::<QdrantResponse<ClusterInfoResult>>()
                .await?;

            let peer_id_from_response = cluster_info.result.peer_id;

            // Only local shards exposed points_count.
            for shard in cluster_info.result.local_shards.iter() {
                let points = shard.points_count;

                // Aggregate peer stats.
                peer_load
                    .entry(peer_id_from_response)
                    .and_modify(|n| {
                        n.shard_count += 1;
                        n.point_count += points;
                    })
                    .or_insert(PeerLoad {
                        peer_id: peer_id_from_response,
                        shard_count: 1,
                        point_count: points,
                    });

                // Keep track of shard-level data.
                all_shards.push(ShardInfo {
                    collection: collection.name.clone(),
                    shard_id: shard.shard_id,
                    peer_id: peer_id_from_response,
                    point_count: points,
                })
            }
        }
    }

    // Turn HashMap into a vector for sorting.
    let mut peers: Vec<PeerLoad> = peer_load.into_values().collect();
    // Sort descending by point_count.
    peers.sort_by_key(|n| std::cmp::Reverse(n.point_count));

    Ok((peers, all_shards))
}

fn analyze_cluster_distribution(peers: &[PeerLoad]) -> (u64, usize, f64) {
    let total_points: u64 = peers.iter().map(|n| n.point_count).sum();
    let peer_count = peers.len();
    let ideal_points_per_peer = total_points as f64 / peer_count as f64;

    println!("Current cluster distribution (by points):");
    for peer in peers {
        let diff = (peer.point_count as f64) - ideal_points_per_peer;
        let diff_pct = diff / ideal_points_per_peer * 100.0;
        println!(
            "Peer {}: {} shards, {} points, diff_from_ideal={:+.1}%",
            peer.peer_id, peer.shard_count, peer.point_count, diff_pct
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

fn calculate_suggested_moves(
    mut peers: Vec<PeerLoad>,
    all_shards: &[ShardInfo],
    ideal_points_per_peer: f64,
) -> (Vec<ShardMove>, Vec<PeerLoad>) {
    // Strategy using standard deviation:
    // 1. Only move shards from peers that are significantly overloaded (> 1 std dev from mean)
    // 2. Only move to peers that won't become overloaded after the move
    // 3. Verify each move improves the overall standard deviation.
    let mut suggested_moves = Vec::new();
    let mut moved_shards = std::collections::HashSet::new();

    // Create a mutable copy of all_shards for tracking.
    let mut updated_shards = all_shards.to_vec();

    // Calculate initial stats.
    let initial_sd = calculate_standard_deviation(&peers, ideal_points_per_peer);
    println!("Initial standard deviation: {:.4}", initial_sd);

    // Check for large single shards that make perfect balancing impossible.
    let mut has_large_single_shards = false;
    for peer in &peers {
        if peer.shard_count == 1 && (peer.point_count as f64) > ideal_points_per_peer * 1.2 {
            let oversize_pct =
                (peer.point_count as f64 - ideal_points_per_peer) / ideal_points_per_peer * 100.0;
            println!("\n\x1b[31;1mWARNING: Peer {} has a single shard with {} points, which is {:.1}% above ideal\x1b[0m",
                     peer.peer_id, peer.point_count, oversize_pct);
            has_large_single_shards = true;
        }
    }

    if has_large_single_shards {
        println!(
            "\x1b[31;1mPerfect balancing is impossible with the current shard distribution\x1b[0m"
        );
        println!("\x1b[31;1mRecommendations:\x1b[0m");
        println!("\x1b[31;1m  1. Vertically scale nodes hosting large shards (recommended)\x1b[0m");
        println!("\x1b[31;1m  2. Change routing strategy for future data to distribute load more evenly\x1b[0m");
        println!("\x1b[31;1m  3. As a last resort, reindex with a higher shard count\x1b[0m");
        println!("\x1b[31;1mWill proceed with best-effort balancing for remaining shards\x1b[0m\n");
    }

    // Main rebalancing loop.
    for iteration in 0..MAX_MOVES {
        // Re-sort peers by load each iteration.
        peers.sort_by_key(|n| std::cmp::Reverse(n.point_count));

        // Calculate current standard deviation.
        let current_sd = calculate_standard_deviation(&peers, ideal_points_per_peer);

        // If standard deviation is small enough, we're sufficiently balanced.
        if current_sd / ideal_points_per_peer < IMBALANCE_THRESHOLD {
            println!(
                "Balance within acceptable threshold (SD: {:.2}%)",
                (current_sd / ideal_points_per_peer) * 100.0
            );
            break;
        }

        if DEBUG_MODE {
            println!(
                "Iteration {}: Current standard deviation: {:.4}",
                iteration + 1,
                current_sd
            );
        } else {
            // In regular mode, just print a simple progress indicator
            print!(".");
            let _ = std::io::stdout().flush();
        }

        // Find significantly overloaded peers (> 1 std dev above mean).
        let overloaded_threshold = ideal_points_per_peer + current_sd;
        let underloaded_threshold = ideal_points_per_peer - current_sd;

        debug!(
            "Overloaded threshold: > {:.0} points, Underloaded threshold: < {:.0} points",
            overloaded_threshold, underloaded_threshold
        );

        // Find the most overloaded peer with movable shards.
        let mut found_beneficial_move = false;
        let mut best_move: Option<ShardMove> = None;
        let mut best_new_sd = current_sd;

        // Make a copy of the peers we can iterate through.
        let peers_snapshot = peers.clone();

        // Try each overloaded peer as a source.
        for source_peer in &peers_snapshot {
            // Skip peers that aren't significantly overloaded.
            if (source_peer.point_count as f64) <= overloaded_threshold {
                continue;
            }

            debug!(
                "Examining overloaded peer {}: {} points (threshold: {:.0})",
                source_peer.peer_id, source_peer.point_count, overloaded_threshold
            );

            // Find movable shards from this peer.
            let movable_shards: Vec<&ShardInfo> = updated_shards
                .iter()
                .filter(|s| {
                    s.peer_id == source_peer.peer_id
                        && !moved_shards.contains(&(s.collection.clone(), s.shard_id))
                })
                .collect();

            if movable_shards.is_empty() {
                debug!("No movable shards for peer {}", source_peer.peer_id);

                // Mark all shards on this peer as "tried" to avoid infinite loops.
                for shard in updated_shards
                    .iter()
                    .filter(|s| s.peer_id == source_peer.peer_id)
                {
                    moved_shards.insert((shard.collection.clone(), shard.shard_id));
                }
                continue;
            }

            // Try each underloaded peer as a destination.
            for dest_peer in &peers_snapshot {
                // Skip peers that aren't underloaded.
                if dest_peer.peer_id == source_peer.peer_id
                    || (dest_peer.point_count as f64) >= ideal_points_per_peer
                {
                    continue;
                }

                // Try each shard.
                for shard in &movable_shards {
                    // Don't move if it would make the destination overloaded.
                    if (dest_peer.point_count + shard.point_count) as f64 > overloaded_threshold {
                        continue;
                    }

                    // Simulate this move.
                    let mut simulated_peers = peers.clone();

                    // Update source peer in simulation.
                    if let Some(sim_source) = simulated_peers
                        .iter_mut()
                        .find(|p| p.peer_id == source_peer.peer_id)
                    {
                        sim_source.shard_count -= 1;
                        sim_source.point_count =
                            sim_source.point_count.saturating_sub(shard.point_count);
                    }

                    // Update destination peer in simulation.
                    if let Some(sim_dest) = simulated_peers
                        .iter_mut()
                        .find(|p| p.peer_id == dest_peer.peer_id)
                    {
                        sim_dest.shard_count += 1;
                        sim_dest.point_count += shard.point_count;
                    }

                    // Calculate new standard deviation.
                    let new_sd =
                        calculate_standard_deviation(&simulated_peers, ideal_points_per_peer);

                    // If this move improves the standard deviation, record it.
                    if new_sd < current_sd && new_sd < best_new_sd {
                        debug!(
                            "Found beneficial move: shard {} ({}p) from peer {} to peer {} (SD: {:.4} → {:.4})",
                            shard.shard_id, shard.point_count,
                            source_peer.peer_id, dest_peer.peer_id,
                            current_sd, new_sd
                        );

                        best_new_sd = new_sd;
                        best_move = Some(ShardMove {
                            collection: shard.collection.clone(),
                            shard_id: shard.shard_id,
                            from_peer: source_peer.peer_id,
                            to_peer: dest_peer.peer_id,
                            point_count: shard.point_count,
                        });
                        found_beneficial_move = true;
                    }
                }
            }
        }

        // If we found a beneficial move, apply it.
        if found_beneficial_move && best_move.is_some() {
            let move_suggestion = best_move.unwrap();

            // Apply the move to our tracking.
            let mut updated_peers = peers.clone(); // Create a copy for updating.

            // Update source peer.
            if let Some(from_peer) = updated_peers
                .iter_mut()
                .find(|p| p.peer_id == move_suggestion.from_peer)
            {
                from_peer.shard_count -= 1;
                from_peer.point_count = from_peer
                    .point_count
                    .saturating_sub(move_suggestion.point_count);
            }

            // Update destination peer.
            if let Some(to_peer) = updated_peers
                .iter_mut()
                .find(|p| p.peer_id == move_suggestion.to_peer)
            {
                to_peer.shard_count += 1;
                to_peer.point_count += move_suggestion.point_count;
            }

            // Replace the peers vector with the updated version.
            peers = updated_peers;

            // Update shard's peer assignment in updated_shards.
            let mut updated_shards_copy = updated_shards.clone();
            for shard in &mut updated_shards_copy {
                if shard.shard_id == move_suggestion.shard_id
                    && shard.peer_id == move_suggestion.from_peer
                {
                    shard.peer_id = move_suggestion.to_peer;
                    break;
                }
            }
            updated_shards = updated_shards_copy;

            // Mark this shard as moved.
            moved_shards.insert((move_suggestion.collection.clone(), move_suggestion.shard_id));
            suggested_moves.push(move_suggestion);

            debug!("Applied move! New standard deviation: {:.4}", best_new_sd);
        } else {
            // No beneficial moves found.
            debug!("No more beneficial moves found");
            break;
        }

        // Exit if we've reached our move limit.
        if suggested_moves.len() >= MAX_MOVES {
            debug!("Reached maximum number of moves: {}", MAX_MOVES);
            break;
        }
    }

    // Print newline after progress dots
    if !DEBUG_MODE && !suggested_moves.is_empty() {
        println!();
    }

    // Final safety check - verify moves actually improve the distribution.
    let final_sd = calculate_standard_deviation(&peers, ideal_points_per_peer);
    println!("Final standard deviation: {:.4}", final_sd);

    if final_sd > initial_sd {
        println!("\n\x1b[31;1m⚠️  WARNING: The suggested moves would make the distribution WORSE!\x1b[0m");
        println!(
            "\x1b[31;1m   Initial SD: {:.4} → Final SD: {:.4}\x1b[0m",
            initial_sd, final_sd
        );
        println!("\x1b[31;1m   Recommendation: DO NOT apply these moves. Keep the current distribution.\x1b[0m\n");

        // Clear the moves if they make things worse.
        suggested_moves.clear();
    } else if suggested_moves.is_empty() {
        println!("\nNo beneficial moves found. The current distribution is the best possible.");
    } else {
        println!("\nThe suggested moves should improve the cluster balance.");
        println!(
            "Standard deviation: {:.4} → {:.4} ({:.1}% reduction)",
            initial_sd,
            final_sd,
            (1.0 - final_sd / initial_sd) * 100.0
        );
    }

    (suggested_moves, peers)
}

fn display_move_suggestions(suggested_moves: &[ShardMove]) {
    if suggested_moves.is_empty() {
        println!("\nNo suggestions. The cluster is already in decent shape or no beneficial moves found.");
    } else {
        println!("\nSuggested partial set of moves (best effort approach):");
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
        let diff_pct = diff / ideal_points_per_peer * 100.0;
        println!(
            "peer {}: {} shards, {} points, diff_from_ideal={:+.1}%",
            peer.peer_id, peer.shard_count, peer.point_count, diff_pct
        );
    }
}
