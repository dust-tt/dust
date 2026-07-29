// Prints a per-shard-key breakdown of a Qdrant cluster, including replication:
//
// === Collection c_openai_... — 24 shard keys, 48 shards, 96 replicas, 123,456 points
//
// shard key key_0 — points: 12,345, data sources: 42
//   shard 3 — points: 12,345, replicas: 2
//     peers:
//       * peer 111 (node-0) — Active — 12,345 points — ram_resident_gb 32.1 (12 shards on this peer)
//       * peer 222 (node-3) — Active — 12,340 points — ram_resident_gb 28.4 (11 shards on this peer)
//
// Requires QDRANT_CLUSTER_0_URL and QDRANT_CLUSTER_0_API_KEY. If CORE_DATABASE_URI is set, also
// counts data sources per shard key (from Postgres); data sources map to shard keys, not to
// individual shards, so the count is displayed at the shard key level.

use anyhow::{anyhow, Error, Result};
use clap::Parser;
use dust::data_sources::{
    data_source::DataSourceConfig,
    qdrant::{env_var_prefix_for_cluster, DustQdrantClient, QdrantClients, QdrantCluster},
};
use dust::stores::{postgres::PostgresStore, store::Store};
use regex::Regex;
use serde::Deserialize;
use std::collections::{BTreeMap, HashMap};
use url::Url;

#[derive(Parser, Debug)]
#[command(version, about = "Per-shard-key breakdown of points, replicas and peers.", long_about = None)]
struct Args {
    /// Only include this collection (defaults to all collections).
    #[arg(short, long)]
    collection: Option<String>,

    /// Skip the per-shard-key data source counts (no CORE_DATABASE_URI required).
    #[arg(long)]
    skip_data_source_counts: bool,
}

#[derive(Debug, Deserialize)]
struct PeerInfo {
    uri: String,
}

// A minimal structure for the /cluster JSON response.
#[derive(Debug, Deserialize)]
struct ClusterStatus {
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
    // Keyword or numeric shard key; absent when the collection has no custom sharding.
    shard_key: Option<serde_json::Value>,
    points_count: u64,
    state: String,
}

#[derive(Deserialize, Debug)]
struct ClusterInfoResult {
    peer_id: u64,
    local_shards: Vec<LocalShardInfo>,
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
}

// Generic wrapper for all Qdrant HTTP API responses.
#[derive(Deserialize)]
struct QdrantResponse<T> {
    status: String,
    result: T,
}

#[derive(Debug, Clone)]
struct PeerEndpoint {
    url: String,
    node_name: String,
}

#[derive(Debug, Clone)]
struct ReplicaInfo {
    peer_id: u64,
    points_count: u64,
    state: String,
}

// collection -> (shard key numeric suffix for ordering, shard key label) -> shard id -> replicas.
type Breakdown = BTreeMap<String, BTreeMap<(u64, String), BTreeMap<u32, Vec<ReplicaInfo>>>>;

const QDRANT_HTTP_PORT: &str = ":6333";
const QDRANT_GRPC_PORT: &str = ":6334";

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();

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

    // Discover peers from the seed peer.
    let peers = get_cluster_peers(&seed_peer_uri, &api_key).await?;
    println!("Discovered {} peers", peers.len());

    let memory_by_peer = gather_peer_memory(&peers, &api_key).await?;

    // List collections (from the seed peer, the list is cluster-wide).
    let all_collections = list_collections(&seed_peer_uri, &api_key).await?;
    let collections = match &args.collection {
        Some(collection) => {
            if !all_collections.contains(collection) {
                return Err(anyhow!(
                    "Unknown collection {} (available: {})",
                    collection,
                    all_collections.join(", ")
                ));
            }
            vec![collection.clone()]
        }
        None => all_collections,
    };

    // Gather every replica by querying each peer for its local shards.
    let (breakdown, replicas_by_peer) =
        gather_shard_replicas(&peers, &collections, &api_key).await?;

    // Optionally count data sources per (collection, shard key) from Postgres.
    let data_source_counts = if args.skip_data_source_counts {
        None
    } else {
        match std::env::var("CORE_DATABASE_URI") {
            Ok(database_uri) => {
                let (counts, skipped) = gather_data_source_counts(&database_uri).await?;
                if skipped > 0 {
                    println!(
                        "Skipped {} data sources with unparseable config or internal_id",
                        skipped
                    );
                }
                Some(counts)
            }
            Err(_) => {
                println!("CORE_DATABASE_URI is not set: skipping data source counts (use --skip-data-source-counts to silence this)");
                None
            }
        }
    };

    display_peer_overview(&peers, &memory_by_peer, &replicas_by_peer);
    display_breakdown(
        &breakdown,
        &peers,
        &memory_by_peer,
        &replicas_by_peer,
        data_source_counts.as_ref(),
    );

    Ok(())
}

// Function to extract cluster information from the base URL.
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

    let node_url = format!(
        "https://node-{}-{}.{}.{}.cloud.qdrant.io{}",
        node_number, cluster_id, region, cloud_provider, QDRANT_HTTP_PORT
    );

    Ok(node_url)
}

// Get cluster info from REST API (not accessible via gRPC), then return a map of peer_id to the
// peer's public node URL and short node name.
async fn get_cluster_peers(seed_uri: &str, api_key: &str) -> Result<HashMap<u64, PeerEndpoint>> {
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
    let (cluster_id, _region, _cloud_provider) = extract_cluster_info(seed_uri)?;
    let re = Regex::new(&format!(r"qdrant-{}-(\d+)\.qdrant-headless", cluster_id))?;

    cluster_resp
        .result
        .peers
        .iter()
        .map(|(id, peer)| {
            let peer_id = id.parse::<u64>()?;

            // Extract node number from the internal URI.
            let node_number = re
                .captures(&peer.uri)
                .and_then(|captures| captures.get(1))
                .ok_or_else(|| anyhow!("Failed to extract node number from URI {}", peer.uri))?
                .as_str();

            Ok((
                peer_id,
                PeerEndpoint {
                    url: create_node_url(seed_uri, node_number)?,
                    node_name: format!("node-{}", node_number),
                },
            ))
        })
        .collect()
}

async fn list_collections(seed_uri: &str, api_key: &str) -> Result<Vec<String>> {
    let client = reqwest::Client::new();

    let collections_resp: QdrantResponse<CollectionsResult> = client
        .get(format!("{}/collections", seed_uri.trim_end_matches('/')))
        .header("api-key", api_key)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    let mut collections: Vec<String> = collections_resp
        .result
        .collections
        .into_iter()
        .map(|c| c.name)
        .collect();
    collections.sort();

    Ok(collections)
}

fn shard_key_label(shard_key: &Option<serde_json::Value>) -> String {
    match shard_key {
        None => "(no shard key)".to_string(),
        Some(serde_json::Value::String(s)) => s.clone(),
        Some(v) => v.to_string(),
    }
}

// Order shard keys by their numeric suffix (key_2 before key_10); non-suffixed labels last.
fn shard_key_ord(label: &str) -> (u64, String) {
    let suffix = label
        .rsplit('_')
        .next()
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(u64::MAX);
    (suffix, label.to_string())
}

// Query each peer for its local shards of each collection. Points counts are only exposed for
// local shards, so visiting every peer yields every replica with its own points count.
async fn gather_shard_replicas(
    peers: &HashMap<u64, PeerEndpoint>,
    collections: &[String],
    api_key: &str,
) -> Result<(Breakdown, HashMap<u64, usize>)> {
    let client = reqwest::Client::new();

    let mut breakdown: Breakdown = BTreeMap::new();
    // Initialize with all peers so peers hosting no shard still show up with 0.
    let mut replicas_by_peer: HashMap<u64, usize> =
        peers.keys().map(|&peer_id| (peer_id, 0)).collect();

    for endpoint in peers.values() {
        let base_uri = endpoint.url.trim_end_matches('/');

        for collection in collections {
            let cluster_info: QdrantResponse<ClusterInfoResult> = client
                .get(format!("{}/collections/{}/cluster", base_uri, collection))
                .header("api-key", api_key)
                .send()
                .await?
                .error_for_status()?
                .json()
                .await?;

            let peer_id = cluster_info.result.peer_id;

            for shard in &cluster_info.result.local_shards {
                *replicas_by_peer.entry(peer_id).or_insert(0) += 1;

                let label = shard_key_label(&shard.shard_key);
                breakdown
                    .entry(collection.clone())
                    .or_default()
                    .entry(shard_key_ord(&label))
                    .or_default()
                    .entry(shard.shard_id)
                    .or_default()
                    .push(ReplicaInfo {
                        peer_id,
                        points_count: shard.points_count,
                        state: shard.state.clone(),
                    });
            }
        }
    }

    Ok((breakdown, replicas_by_peer))
}

// Fetch each peer's jemalloc resident memory from /telemetry. This is the qdrant process's
// heap-resident memory, not the node's full working set (excludes OS page cache for mmapped
// segments), so it reads lower than the Qdrant Cloud console RAM graphs.
async fn gather_peer_memory(
    peers: &HashMap<u64, PeerEndpoint>,
    api_key: &str,
) -> Result<HashMap<u64, Option<u64>>> {
    let client = reqwest::Client::new();

    let mut memory_by_peer = HashMap::new();
    for (peer_id, endpoint) in peers {
        let telemetry_url = format!(
            "{}/telemetry?details_level=1",
            endpoint.url.trim_end_matches('/')
        );
        let telemetry = client
            .get(&telemetry_url)
            .header("api-key", api_key)
            .send()
            .await?
            .json::<QdrantResponse<TelemetryResult>>()
            .await?;

        memory_by_peer.insert(*peer_id, telemetry.result.memory.map(|m| m.resident_bytes));
    }

    Ok(memory_by_peer)
}

// Count data sources per (collection, shard key) from the core Postgres database. Returns the
// counts and the number of rows skipped because their config could not be parsed.
async fn gather_data_source_counts(
    database_uri: &str,
) -> Result<(HashMap<(String, String), u64>, u64)> {
    let store = PostgresStore::new(database_uri).await?;
    let qdrant_clients = QdrantClients::build().await?;
    let qdrant_client = qdrant_clients.client(QdrantCluster::Cluster0);

    let pool = store.raw_pool();
    let conn = pool.get().await?;
    let rows = conn
        .query("SELECT internal_id, config_json FROM data_sources", &[])
        .await?;

    let mut counts: HashMap<(String, String), u64> = HashMap::new();
    let mut skipped: u64 = 0;

    for row in &rows {
        let internal_id: String = row.get(0);
        let config_json: String = row.get(1);

        let config: DataSourceConfig = match serde_json::from_str(&config_json) {
            Ok(config) => config,
            Err(_) => {
                skipped += 1;
                continue;
            }
        };

        let shard_key_id = match DustQdrantClient::shard_key_id_from_internal_id(&internal_id) {
            Ok(shard_key_id) => shard_key_id,
            Err(_) => {
                skipped += 1;
                continue;
            }
        };
        let shard_key = format!("{}_{}", qdrant_client.shard_key_prefix(), shard_key_id);

        let collection = qdrant_client.collection_name(&config.embedder_config.embedder);
        *counts.entry((collection, shard_key.clone())).or_insert(0) += 1;

        // A data source with a shadow embedder also has points in the shadow collection.
        if let Some(shadow_embedder) = &config.embedder_config.shadow_embedder {
            let shadow_collection = qdrant_client.collection_name(shadow_embedder);
            *counts.entry((shadow_collection, shard_key)).or_insert(0) += 1;
        }
    }

    Ok((counts, skipped))
}

// Replicas of a shard should hold the same points; take the max as the canonical count so
// totals do not double count replicas.
fn canonical_points(replicas: &[ReplicaInfo]) -> u64 {
    replicas
        .iter()
        .map(|replica| replica.points_count)
        .max()
        .unwrap_or(0)
}

fn format_count(count: u64) -> String {
    let digits = count.to_string();
    let mut formatted = String::new();
    for (i, c) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i) % 3 == 0 {
            formatted.push(',');
        }
        formatted.push(c);
    }
    formatted
}

fn format_ram_resident_gb(memory_by_peer: &HashMap<u64, Option<u64>>, peer_id: u64) -> String {
    match memory_by_peer.get(&peer_id).copied().flatten() {
        Some(resident_bytes) => format!("{:.1}", resident_bytes as f64 / 1e9),
        None => "n/a".to_string(),
    }
}

fn display_peer_overview(
    peers: &HashMap<u64, PeerEndpoint>,
    memory_by_peer: &HashMap<u64, Option<u64>>,
    replicas_by_peer: &HashMap<u64, usize>,
) {
    println!("\nPeer overview:");

    let mut peer_ids: Vec<u64> = peers.keys().copied().collect();
    peer_ids.sort();

    for peer_id in peer_ids {
        let node_name = peers
            .get(&peer_id)
            .map(|p| p.node_name.as_str())
            .unwrap_or("unknown-node");
        println!(
            "  peer {} ({}) — ram_resident_gb {} — {} shard replicas hosted",
            peer_id,
            node_name,
            format_ram_resident_gb(memory_by_peer, peer_id),
            replicas_by_peer.get(&peer_id).copied().unwrap_or(0)
        );
    }
}

fn display_breakdown(
    breakdown: &Breakdown,
    peers: &HashMap<u64, PeerEndpoint>,
    memory_by_peer: &HashMap<u64, Option<u64>>,
    replicas_by_peer: &HashMap<u64, usize>,
    data_source_counts: Option<&HashMap<(String, String), u64>>,
) {
    for (collection, shard_keys) in breakdown {
        let collection_points: u64 = shard_keys
            .values()
            .flat_map(|shards| shards.values())
            .map(|replicas| canonical_points(replicas))
            .sum();
        let shard_count: usize = shard_keys.values().map(|shards| shards.len()).sum();
        let replica_count: usize = shard_keys
            .values()
            .flat_map(|shards| shards.values())
            .map(|replicas| replicas.len())
            .sum();

        println!(
            "\n=== Collection {} — {} shard keys, {} shards, {} replicas, {} points",
            collection,
            shard_keys.len(),
            shard_count,
            replica_count,
            format_count(collection_points)
        );

        for ((_, shard_key), shards) in shard_keys {
            let key_points: u64 = shards
                .values()
                .map(|replicas| canonical_points(replicas))
                .sum();
            let data_sources = match data_source_counts {
                Some(counts) => format_count(
                    counts
                        .get(&(collection.clone(), shard_key.clone()))
                        .copied()
                        .unwrap_or(0),
                ),
                None => "n/a".to_string(),
            };

            println!(
                "\nshard key {} — points: {}, data sources: {}",
                shard_key,
                format_count(key_points),
                data_sources
            );

            for (shard_id, replicas) in shards {
                println!(
                    "  shard {} — points: {}, replicas: {}",
                    shard_id,
                    format_count(canonical_points(replicas)),
                    replicas.len()
                );
                println!("    peers:");

                let mut sorted_replicas = replicas.clone();
                sorted_replicas.sort_by_key(|replica| replica.peer_id);

                for replica in &sorted_replicas {
                    let node_name = peers
                        .get(&replica.peer_id)
                        .map(|p| p.node_name.as_str())
                        .unwrap_or("unknown-node");
                    println!(
                        "      * peer {} ({}) — {} — {} points — ram_resident_gb {} ({} shards on this peer)",
                        replica.peer_id,
                        node_name,
                        replica.state,
                        format_count(replica.points_count),
                        format_ram_resident_gb(memory_by_peer, replica.peer_id),
                        replicas_by_peer.get(&replica.peer_id).copied().unwrap_or(0)
                    );
                }
            }
        }
    }
}
