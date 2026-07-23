// Reshards a Qdrant collection at the shard-key level, driving the native resharding API
// (https://qdrant.tech/documentation/cloud/cluster-scaling/#resharding) until each shard key
// reaches its target number of shards:
//
//   # Dry run (default): prints the plan, the execution order, the candidate peers and the
//   # peer RAM capacity check.
//   qdrant_reshard --collection c_openai_text-embedding-3-large-1536 \
//     --target key_13=3 --target key_12=3
//
//   # Actually reshard.
//   qdrant_reshard --collection c_openai_text-embedding-3-large-1536 \
//     --target key_13=3 --target key_12=3 --execute
//
// The direction (up/down) is inferred per key from the current shard count. Each resharding
// operation moves a key by exactly one shard, so the bin loops (start + poll to completion)
// until the target is reached, processing keys sequentially (Qdrant allows a single resharding
// operation per collection at a time). The process is safe to interrupt and re-run: an in-flight
// resharding operation keeps running server-side and is re-adopted on restart.
//
// Shard-key resharding does not change how data sources map to shard keys (blake3 % 24); it only
// changes how points within a key spread over shards, so no data migration is involved.
//
// Who performs the migration depends on the deployment:
// - On Qdrant Cloud (managed), the cloud operator watches `start_resharding` operations and
//   drives every stage (point migration, hash ring commits, cleanup, finish). The default
//   start + poll behavior of this bin is the right mode there.
// - On OSS >= 1.18 (e.g. local dev), `start_resharding` only registers the operation: the
//   in-process driver has been retired (see qdrant commit history around
//   `Collection::start_resharding`, where `drive_resharding` is commented out) and nothing
//   makes progress. Pass --drive to have this bin orchestrate the stages itself:
//   `replicate_shard` with method `resharding_stream_records` from each source shard, then
//   `finish_migrating_points`, `commit_read_hash_ring`, `commit_write_hash_ring`, per-shard
//   `cleanup` (scale-up only) and `finish_resharding` — the sequence encoded in qdrant's
//   consensus tests (tests/consensus_tests/test_resharding.py). --drive is restricted to
//   single-replica shards: it exists for local/self-hosted testing, not for production.
//
// Requires QDRANT_CLUSTER_0_URL and QDRANT_CLUSTER_0_API_KEY. The cluster must run with
// `cluster.resharding_enabled: true` (checked before starting).

use anyhow::{anyhow, Result};
use clap::Parser;
use dust::data_sources::qdrant::{env_var_prefix_for_cluster, QdrantCluster};
use serde::Deserialize;
use std::collections::{BTreeMap, HashSet};
use std::time::Duration;

#[derive(Parser, Debug)]
#[command(version, about = "Reshard a Qdrant collection per shard key, up or down to a target shard count.", long_about = None)]
struct Args {
    /// Name of the collection.
    #[arg(long)]
    collection: String,

    /// Target shard count per shard key, e.g. `--target key_13=3` (repeatable).
    #[arg(long = "target", value_parser = parse_target)]
    targets: Vec<(String, usize)>,

    /// Seconds between two polls of an in-flight resharding operation.
    #[arg(long, default_value_t = 60)]
    poll_interval_seconds: u64,

    /// Force the peer to place new shards on when resharding up, bypassing the RAM-based
    /// selection (by default the least-loaded peer below 50% RAM used is picked, and the bin
    /// stops if there is none).
    #[arg(long)]
    peer_id: Option<u64>,

    /// Actually launch the resharding. Without this flag, the bin only prints the plan, the
    /// execution order and the candidate peers (dry run).
    #[arg(long)]
    execute: bool,

    /// Abort the in-flight resharding operation of the collection and exit.
    #[arg(long)]
    abort: bool,

    /// Drive the resharding stages from this bin (OSS clusters have no internal driver).
    /// Restricted to single-replica shards; meant for local/self-hosted testing.
    #[arg(long)]
    drive: bool,

    /// Peer REST URL override, e.g. `--peer-url 123=http://localhost:14343` (repeatable). Used
    /// for per-peer telemetry (target peer selection) and --drive cleanups. Peers without an
    /// override use the Qdrant Cloud node URL scheme when applicable, else their p2p URI with
    /// the port swapped to 6333.
    #[arg(long = "peer-url", value_parser = parse_peer_url)]
    peer_urls: Vec<(u64, String)>,
}

fn parse_target(s: &str) -> Result<(String, usize), String> {
    let (key, count) = s
        .split_once('=')
        .ok_or_else(|| format!("Invalid target `{}` (expected <shard_key>=<count>)", s))?;
    let count = count
        .parse::<usize>()
        .map_err(|_| format!("Invalid shard count in target `{}`", s))?;
    if count == 0 {
        return Err(format!("Invalid target `{}`: count must be >= 1", s));
    }
    Ok((key.to_string(), count))
}

fn parse_peer_url(s: &str) -> Result<(u64, String), String> {
    let (peer_id, url) = s
        .split_once('=')
        .ok_or_else(|| format!("Invalid peer url `{}` (expected <peer_id>=<url>)", s))?;
    let peer_id = peer_id
        .parse::<u64>()
        .map_err(|_| format!("Invalid peer id in `{}`", s))?;
    Ok((peer_id, url.trim_end_matches('/').to_string()))
}

// Generic wrapper for all Qdrant HTTP API responses.
#[derive(Deserialize)]
struct QdrantResponse<T> {
    result: T,
}

#[derive(Deserialize, Debug)]
struct PeerInfo {
    uri: String,
}

// Minimal structure for the /cluster JSON response (peer discovery for --drive).
#[derive(Deserialize, Debug)]
struct ClusterStatus {
    peers: std::collections::HashMap<String, PeerInfo>,
}

#[derive(Deserialize, Debug)]
struct LocalShardInfo {
    shard_id: u32,
    shard_key: Option<serde_json::Value>,
    points_count: u64,
    state: String,
}

#[derive(Deserialize, Debug)]
struct RemoteShardInfo {
    shard_id: u32,
    shard_key: Option<serde_json::Value>,
    peer_id: u64,
    state: String,
}

#[derive(Deserialize, Debug)]
struct ShardTransferInfo {
    shard_id: u32,
    comment: Option<String>,
}

#[derive(Deserialize, Debug)]
struct ReshardingInfo {
    shard_id: u32,
    peer_id: u64,
    shard_key: Option<serde_json::Value>,
    direction: String,
}

#[derive(Deserialize, Debug)]
struct ClusterInfoResult {
    peer_id: u64,
    local_shards: Vec<LocalShardInfo>,
    remote_shards: Vec<RemoteShardInfo>,
    shard_transfers: Vec<ShardTransferInfo>,
    resharding_operations: Option<Vec<ReshardingInfo>>,
}

#[derive(Deserialize, Debug)]
struct CollectionParams {
    replication_factor: Option<u64>,
}

#[derive(Deserialize, Debug)]
struct CollectionConfig {
    params: CollectionParams,
}

#[derive(Deserialize, Debug)]
struct CollectionInfoResult {
    config: CollectionConfig,
}

#[derive(Deserialize, Debug)]
struct ClusterTelemetry {
    #[serde(default)]
    resharding_enabled: bool,
}

#[derive(Deserialize, Debug)]
struct SystemTelemetry {
    // Total RAM of the node, in kilobytes.
    ram_size: Option<u64>,
}

#[derive(Deserialize, Debug)]
struct AppTelemetry {
    system: Option<SystemTelemetry>,
}

#[derive(Deserialize, Debug)]
struct MemoryTelemetry {
    resident_bytes: u64,
}

#[derive(Deserialize, Debug)]
struct TelemetryResult {
    cluster: ClusterTelemetry,
    app: Option<AppTelemetry>,
    // Absent when the node build has no jemalloc stats.
    memory: Option<MemoryTelemetry>,
}

// New shards are only placed on peers using less than half of their RAM: resharding adds a
// shard's worth of resident memory to the target peer, and peers above this line are the ones
// we're trying to relieve in the first place.
const MAX_TARGET_PEER_RAM_USED_FRACTION: f64 = 0.5;

const QDRANT_HTTP_PORT: &str = ":6333";
const QDRANT_GRPC_PORT: &str = ":6334";

struct QdrantHttp {
    client: reqwest::Client,
    base_url: String,
    api_key: String,
}

impl QdrantHttp {
    fn new(base_url: String, api_key: String) -> Result<Self> {
        Ok(Self {
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(30))
                .build()?,
            base_url,
            api_key,
        })
    }

    fn with_api_key(&self, req: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        if self.api_key.is_empty() {
            req
        } else {
            req.header("api-key", &self.api_key)
        }
    }

    async fn get<T: serde::de::DeserializeOwned>(&self, path: &str) -> Result<T> {
        let req = self.with_api_key(self.client.get(format!("{}{}", self.base_url, path)));
        let res = req.send().await?;
        let status = res.status();
        let body = res.text().await?;
        if !status.is_success() {
            return Err(anyhow!("GET {} failed ({}): {}", path, status, body));
        }
        let parsed: QdrantResponse<T> = serde_json::from_str(&body)
            .map_err(|e| anyhow!("GET {}: failed to parse response: {} ({})", path, e, body))?;
        Ok(parsed.result)
    }

    async fn post_cluster_operation(
        &self,
        collection: &str,
        operation: &serde_json::Value,
    ) -> Result<()> {
        let path = format!("/collections/{}/cluster", collection);
        let req = self
            .with_api_key(self.client.post(format!("{}{}", self.base_url, path)))
            .json(operation);
        let res = req.send().await?;
        let status = res.status();
        let body = res.text().await?;
        if !status.is_success() {
            return Err(anyhow!(
                "POST {} {} failed ({}): {}",
                path,
                operation,
                status,
                body
            ));
        }
        Ok(())
    }

    async fn cluster_info(&self, collection: &str) -> Result<ClusterInfoResult> {
        self.get(&format!("/collections/{}/cluster", collection))
            .await
    }

    // Posts a cluster operation, treating a 400 as "stage already passed" (returns false). Used
    // by --drive so an interrupted run can be re-run: stage transitions that were already applied
    // are rejected by qdrant with a 400 and simply skipped.
    async fn post_cluster_operation_tolerant(
        &self,
        collection: &str,
        operation: &serde_json::Value,
    ) -> Result<bool> {
        let path = format!("/collections/{}/cluster", collection);
        let req = self
            .with_api_key(self.client.post(format!("{}{}", self.base_url, path)))
            .json(operation);
        let res = req.send().await?;
        let status = res.status();
        let body = res.text().await?;
        if status == reqwest::StatusCode::BAD_REQUEST {
            println!("  skipped {} ({})", operation, body);
            return Ok(false);
        }
        if !status.is_success() {
            return Err(anyhow!(
                "POST {} {} failed ({}): {}",
                path,
                operation,
                status,
                body
            ));
        }
        Ok(true)
    }

    // Shard cleanup is a peer-local operation: it must be sent to the peer hosting the replica.
    async fn cleanup_shard(&self, peer_url: &str, collection: &str, shard_id: u32) -> Result<()> {
        let path = format!(
            "{}/collections/{}/shards/{}/cleanup?wait=true&timeout=300",
            peer_url, collection, shard_id
        );
        let res = self.with_api_key(self.client.post(&path)).send().await?;
        let status = res.status();
        let body = res.text().await?;
        if !status.is_success() {
            return Err(anyhow!("POST {} failed ({}): {}", path, status, body));
        }
        Ok(())
    }

    async fn peer_urls(&self, overrides: &[(u64, String)]) -> Result<BTreeMap<u64, String>> {
        let cluster: ClusterStatus = self.get("/cluster").await?;
        let mut urls = BTreeMap::new();
        for (peer_id, peer) in &cluster.peers {
            let peer_id = peer_id.parse::<u64>()?;
            let url = match cloud_node_url(&self.base_url, &peer.uri)? {
                Some(url) => url,
                // Fall back to the peer's p2p URI with the REST port (only resolvable from
                // inside the cluster network; use --peer-url otherwise).
                None => peer
                    .uri
                    .trim_end_matches('/')
                    .replace(":6335", QDRANT_HTTP_PORT),
            };
            urls.insert(peer_id, url);
        }
        for (peer_id, url) in overrides {
            urls.insert(*peer_id, url.clone());
        }
        Ok(urls)
    }

    async fn peer_telemetry(&self, peer_url: &str) -> Result<TelemetryResult> {
        let req = self.with_api_key(
            self.client
                .get(format!("{}/telemetry?details_level=1", peer_url)),
        );
        let res = req.send().await?;
        let status = res.status();
        let body = res.text().await?;
        if !status.is_success() {
            return Err(anyhow!(
                "GET {}/telemetry failed ({}): {}",
                peer_url,
                status,
                body
            ));
        }
        let parsed: QdrantResponse<TelemetryResult> = serde_json::from_str(&body)
            .map_err(|e| anyhow!("GET {}/telemetry: failed to parse: {}", peer_url, e))?;
        Ok(parsed.result)
    }
}

// On Qdrant Cloud, per-peer REST endpoints are `node-{n}-{cluster_id}.{region}.{provider}
// .cloud.qdrant.io` with the node number taken from the internal p2p URI
// (`qdrant-{cluster_id}-{n}.qdrant-headless`). Returns None when the base URL is not a Qdrant
// Cloud one (e.g. local or self-hosted).
fn cloud_node_url(base_url: &str, peer_p2p_uri: &str) -> Result<Option<String>> {
    let host = match url::Url::parse(base_url)?.host_str().map(String::from) {
        Some(host) => host,
        None => return Ok(None),
    };
    if !host.ends_with("cloud.qdrant.io") {
        return Ok(None);
    }
    let parts: Vec<&str> = host.split('.').collect();
    if parts.len() < 5 {
        return Ok(None);
    }
    let (cluster_id, region, provider) = (parts[0], parts[1], parts[2]);
    let re = regex::Regex::new(&format!(
        r"qdrant-{}-(\d+)\.qdrant-headless",
        regex::escape(cluster_id)
    ))?;
    match re.captures(peer_p2p_uri) {
        Some(captures) => Ok(Some(format!(
            "https://node-{}-{}.{}.{}.cloud.qdrant.io{}",
            &captures[1], cluster_id, region, provider, QDRANT_HTTP_PORT
        ))),
        None => Ok(None),
    }
}

#[derive(Debug, Clone)]
struct PeerRam {
    peer_id: u64,
    fraction: f64,
    resident_bytes: u64,
    ram_bytes: u64,
}

impl PeerRam {
    fn describe(&self) -> String {
        format!(
            "peer {} ({:.1}% RAM used, {:.1} / {:.1} GB)",
            self.peer_id,
            self.fraction * 100.0,
            self.resident_bytes as f64 / 1e9,
            self.ram_bytes as f64 / 1e9
        )
    }

    fn qualifies(&self) -> bool {
        self.fraction < MAX_TARGET_PEER_RAM_USED_FRACTION
    }
}

// Reads every peer's RAM usage from its /telemetry, least loaded first.
async fn gather_peer_ram(
    qdrant: &QdrantHttp,
    peer_url_overrides: &[(u64, String)],
) -> Result<Vec<PeerRam>> {
    let peer_urls = qdrant.peer_urls(peer_url_overrides).await?;
    let mut peers: Vec<PeerRam> = vec![];
    for (peer_id, peer_url) in &peer_urls {
        let telemetry = qdrant.peer_telemetry(peer_url).await.map_err(|e| {
            anyhow!(
                "Cannot read telemetry of peer {} ({}): {}. Provide a reachable URL with \
                 --peer-url {}=<url>, or bypass peer selection with --peer-id.",
                peer_id,
                peer_url,
                e,
                peer_id
            )
        })?;
        let resident_bytes = telemetry
            .memory
            .map(|m| m.resident_bytes)
            .ok_or_else(|| anyhow!("Peer {} reports no memory telemetry", peer_id))?;
        let ram_bytes = telemetry
            .app
            .and_then(|app| app.system)
            .and_then(|system| system.ram_size)
            .map(|ram_size_kb| ram_size_kb * 1024)
            .ok_or_else(|| anyhow!("Peer {} reports no ram_size telemetry", peer_id))?;
        let fraction = resident_bytes as f64 / ram_bytes as f64;
        peers.push(PeerRam {
            peer_id: *peer_id,
            fraction,
            resident_bytes,
            ram_bytes,
        });
    }
    peers.sort_by(|a, b| a.fraction.total_cmp(&b.fraction));
    Ok(peers)
}

// Picks the peer with the lowest RAM usage among those below MAX_TARGET_PEER_RAM_USED_FRACTION,
// to host the new shard of a scale-up. Peers that already received a new shard in this run are
// excluded: telemetry lags behind a fresh transfer, so a just-used peer cannot be trusted to
// still have headroom. Errors out when no peer qualifies.
async fn select_target_peer(
    qdrant: &QdrantHttp,
    peer_url_overrides: &[(u64, String)],
    used_peers: &HashSet<u64>,
) -> Result<u64> {
    let peers = gather_peer_ram(qdrant, peer_url_overrides).await?;
    for peer in &peers {
        println!(
            "  {}{}",
            peer.describe(),
            if used_peers.contains(&peer.peer_id) {
                " (already used in this run)"
            } else {
                ""
            }
        );
    }
    match peers
        .iter()
        .find(|peer| peer.qualifies() && !used_peers.contains(&peer.peer_id))
    {
        Some(peer) => {
            println!("  -> placing new shard on {}", peer.describe());
            Ok(peer.peer_id)
        }
        None => Err(anyhow!(
            "No unused peer is below {:.0}% RAM used: refusing to place a new shard. Free up \
             memory (or move shards) first, or force a target with --peer-id.",
            MAX_TARGET_PEER_RAM_USED_FRACTION * 100.0
        )),
    }
}

fn shard_key_label(shard_key: &Option<serde_json::Value>) -> Option<String> {
    match shard_key {
        Some(serde_json::Value::String(s)) => Some(s.clone()),
        Some(v) => Some(v.to_string()),
        None => None,
    }
}

// Shard ids and replica (peer, state, points if local) per shard, for a given shard key, from a
// single peer's view. The union of local and remote shards covers the whole collection, so a
// single (possibly load-balanced) node is enough to observe cluster-wide shard topology.
struct KeyTopology {
    // shard_id -> (peer_id, state, points_count when the replica is local to the queried peer).
    shards: BTreeMap<u32, Vec<(u64, String, Option<u64>)>>,
}

impl KeyTopology {
    fn from_cluster_info(info: &ClusterInfoResult, shard_key: &str) -> Self {
        let mut shards: BTreeMap<u32, Vec<(u64, String, Option<u64>)>> = BTreeMap::new();
        for s in &info.local_shards {
            if shard_key_label(&s.shard_key).as_deref() == Some(shard_key) {
                shards.entry(s.shard_id).or_default().push((
                    info.peer_id,
                    s.state.clone(),
                    Some(s.points_count),
                ));
            }
        }
        for s in &info.remote_shards {
            if shard_key_label(&s.shard_key).as_deref() == Some(shard_key) {
                shards
                    .entry(s.shard_id)
                    .or_default()
                    .push((s.peer_id, s.state.clone(), None));
            }
        }
        Self { shards }
    }

    // The single replica peer of every shard of the key. --drive only supports single-replica
    // shards: with several replicas the migration/cleanup choreography is the cloud operator's
    // job, not this bin's.
    fn single_replica_peers(&self) -> Result<BTreeMap<u32, u64>> {
        let mut peers = BTreeMap::new();
        for (shard_id, replicas) in &self.shards {
            if replicas.len() != 1 {
                return Err(anyhow!(
                    "--drive only supports single-replica shards (shard {} has {} replicas). It \
                     is meant for local/self-hosted test clusters; managed clusters are driven \
                     by the Qdrant Cloud operator.",
                    shard_id,
                    replicas.len()
                ));
            }
            peers.insert(*shard_id, replicas[0].0);
        }
        Ok(peers)
    }

    fn describe(&self) -> String {
        self.shards
            .iter()
            .map(|(shard_id, replicas)| {
                let replicas = replicas
                    .iter()
                    .map(|(peer_id, state, points)| match points {
                        Some(points) => format!("{}@{} {} pts", state, peer_id, points),
                        None => format!("{}@{}", state, peer_id),
                    })
                    .collect::<Vec<_>>()
                    .join(", ");
                format!("shard {} [{}]", shard_id, replicas)
            })
            .collect::<Vec<_>>()
            .join("; ")
    }
}

fn shard_counts_per_key(info: &ClusterInfoResult) -> BTreeMap<String, usize> {
    let mut shard_ids_per_key: BTreeMap<String, std::collections::BTreeSet<u32>> = BTreeMap::new();
    for (shard_key, shard_id) in info
        .local_shards
        .iter()
        .map(|s| (shard_key_label(&s.shard_key), s.shard_id))
        .chain(
            info.remote_shards
                .iter()
                .map(|s| (shard_key_label(&s.shard_key), s.shard_id)),
        )
    {
        if let Some(shard_key) = shard_key {
            shard_ids_per_key
                .entry(shard_key)
                .or_default()
                .insert(shard_id);
        }
    }
    shard_ids_per_key
        .into_iter()
        .map(|(k, ids)| (k, ids.len()))
        .collect()
}

fn describe_resharding_ops(ops: &[ReshardingInfo]) -> String {
    ops.iter()
        .map(|op| {
            format!(
                "{} shard {} on peer {} (shard_key {})",
                op.direction,
                op.shard_id,
                op.peer_id,
                shard_key_label(&op.shard_key).unwrap_or_else(|| "<none>".to_string())
            )
        })
        .collect::<Vec<_>>()
        .join(", ")
}

// Waits until the collection has no in-flight resharding operation, logging progress on every
// poll. Polling errors are logged and retried: a transient network blip must not kill a run that
// has a multi-hour resharding in flight.
async fn wait_for_no_resharding(
    qdrant: &QdrantHttp,
    collection: &str,
    shard_key: &str,
    poll_interval: Duration,
) -> Result<()> {
    let started = std::time::Instant::now();
    let mut last_transfer_seen = std::time::Instant::now();
    loop {
        match qdrant.cluster_info(collection).await {
            Ok(info) => {
                let ops = info.resharding_operations.as_deref().unwrap_or(&[]);
                if ops.is_empty() {
                    return Ok(());
                }
                if !info.shard_transfers.is_empty() {
                    last_transfer_seen = std::time::Instant::now();
                } else if last_transfer_seen.elapsed() > Duration::from_secs(600) {
                    // The operation exists but nothing has moved it in 10 minutes: whatever was
                    // supposed to drive it is not doing so. Stop instead of polling forever; the
                    // operation stays registered server-side.
                    return Err(anyhow!(
                        "[{}] resharding is registered but no shard transfer happened for 10 \
                         minutes: nothing is driving it. Re-run with --drive to drive it \
                         (self-hosted/OSS), re-run as-is to resume watching (managed cluster \
                         mid-cleanup), or cancel with --abort.",
                        shard_key
                    ));
                }
                let topology = KeyTopology::from_cluster_info(&info, shard_key);
                let transfers = info
                    .shard_transfers
                    .iter()
                    .filter_map(|t| {
                        t.comment
                            .as_ref()
                            .map(|c| format!("shard {}: {}", t.shard_id, c))
                    })
                    .collect::<Vec<_>>()
                    .join("; ");
                println!(
                    "[{}] [{}elapsed] resharding: {} | {}{}",
                    shard_key,
                    format_elapsed(started.elapsed()),
                    describe_resharding_ops(ops),
                    topology.describe(),
                    if transfers.is_empty() {
                        "".to_string()
                    } else {
                        format!(" | transfers: {}", transfers)
                    }
                );
            }
            Err(e) => {
                println!(
                    "[{}] poll error (retrying in {}s): {}",
                    shard_key,
                    poll_interval.as_secs(),
                    e
                );
            }
        }
        tokio::time::sleep(poll_interval).await;
    }
}

// Waits until the collection has no in-flight shard transfer (used between --drive stages).
async fn wait_for_no_transfers(
    qdrant: &QdrantHttp,
    collection: &str,
    poll_interval: Duration,
) -> Result<()> {
    loop {
        let info = qdrant.cluster_info(collection).await?;
        if info.shard_transfers.is_empty() {
            return Ok(());
        }
        let transfers = info
            .shard_transfers
            .iter()
            .map(|t| {
                format!(
                    "shard {}{}",
                    t.shard_id,
                    t.comment
                        .as_ref()
                        .map(|c| format!(" ({})", c))
                        .unwrap_or_default()
                )
            })
            .collect::<Vec<_>>()
            .join(", ");
        println!("  transfer in progress: {}", transfers);
        tokio::time::sleep(poll_interval).await;
    }
}

// Drives the in-flight resharding operation of `shard_key` to completion, mirroring the
// choreography of qdrant's consensus tests (see the header comment). Safe to re-run after an
// interruption: stage transitions already applied are rejected by qdrant and skipped, and
// re-running a migration transfer re-streams the same points idempotently.
async fn drive_resharding(
    qdrant: &QdrantHttp,
    collection: &str,
    shard_key: &str,
    peer_url_overrides: &[(u64, String)],
    poll_interval: Duration,
) -> Result<()> {
    let info = qdrant.cluster_info(collection).await?;
    let ops = info.resharding_operations.as_deref().unwrap_or(&[]);
    let op = match ops
        .iter()
        .find(|op| shard_key_label(&op.shard_key).as_deref() == Some(shard_key))
    {
        Some(op) => op,
        // Nothing to drive (e.g. the operation completed between two calls).
        None => return Ok(()),
    };
    let target_shard = op.shard_id;
    let target_peer = op.peer_id;
    let scale_up = op.direction == "up";

    let topology = KeyTopology::from_cluster_info(&info, shard_key);
    let replica_peers = topology.single_replica_peers()?;
    // For scale-up the target is the new shard and points stream out of every other shard; for
    // scale-down the target is the shard being removed and its points stream into the others.
    let others: Vec<(u32, u64)> = replica_peers
        .iter()
        .filter(|(shard_id, _)| **shard_id != target_shard)
        .map(|(shard_id, peer_id)| (*shard_id, *peer_id))
        .collect();

    for (shard_id, peer_id) in &others {
        let (from_peer, from_shard, to_peer, to_shard) = if scale_up {
            (*peer_id, *shard_id, target_peer, target_shard)
        } else {
            (target_peer, target_shard, *peer_id, *shard_id)
        };
        println!(
            "[{}] migrating points: shard {}@{} -> shard {}@{}",
            shard_key, from_shard, from_peer, to_shard, to_peer
        );
        let started = qdrant
            .post_cluster_operation_tolerant(
                collection,
                &serde_json::json!({
                    "replicate_shard": {
                        "from_peer_id": from_peer,
                        "to_peer_id": to_peer,
                        "shard_id": from_shard,
                        "to_shard_id": to_shard,
                        "method": "resharding_stream_records",
                    }
                }),
            )
            .await?;
        if started {
            wait_for_no_transfers(qdrant, collection, poll_interval).await?;
            let ops = qdrant.cluster_info(collection).await?.resharding_operations;
            if ops.as_deref().unwrap_or(&[]).is_empty() {
                return Err(anyhow!(
                    "[{}] resharding operation disappeared during migration (aborted externally?)",
                    shard_key
                ));
            }
        }
    }

    // Activate the replicas that received migrated points.
    let migrated: Vec<(u32, u64)> = if scale_up {
        vec![(target_shard, target_peer)]
    } else {
        others.clone()
    };
    for (shard_id, peer_id) in &migrated {
        qdrant
            .post_cluster_operation_tolerant(
                collection,
                &serde_json::json!({
                    "finish_migrating_points": { "peer_id": peer_id, "shard_id": shard_id }
                }),
            )
            .await?;
    }

    qdrant
        .post_cluster_operation_tolerant(
            collection,
            &serde_json::json!({"commit_read_hash_ring": {}}),
        )
        .await?;
    qdrant
        .post_cluster_operation_tolerant(
            collection,
            &serde_json::json!({"commit_write_hash_ring": {}}),
        )
        .await?;

    // Scale-up leaves migrated points behind in the source shards; cleanup removes the points
    // that now hash to the new shard. Scale-down needs none: the removed shard is dropped
    // wholesale by finish_resharding.
    if scale_up {
        let peer_urls = qdrant.peer_urls(peer_url_overrides).await?;
        for (shard_id, peer_id) in &others {
            let peer_url = peer_urls.get(peer_id).ok_or_else(|| {
                anyhow!(
                    "No REST URL for peer {} (use --peer-url {}=<url>)",
                    peer_id,
                    peer_id
                )
            })?;
            println!("[{}] cleaning up shard {}@{}", shard_key, shard_id, peer_id);
            qdrant
                .cleanup_shard(peer_url, collection, *shard_id)
                .await?;
        }
    }

    qdrant
        .post_cluster_operation_tolerant(collection, &serde_json::json!({"finish_resharding": {}}))
        .await?;

    Ok(())
}

fn format_elapsed(elapsed: Duration) -> String {
    let secs = elapsed.as_secs();
    format!(
        "{}h{:02}m{:02}s ",
        secs / 3600,
        (secs % 3600) / 60,
        secs % 60
    )
}

async fn check_replication(
    qdrant: &QdrantHttp,
    collection: &str,
    shard_key: &str,
    replication_factor: u64,
) -> Result<()> {
    let info = qdrant.cluster_info(collection).await?;
    let topology = KeyTopology::from_cluster_info(&info, shard_key);
    for (shard_id, replicas) in &topology.shards {
        if (replicas.len() as u64) < replication_factor {
            println!(
                "WARNING: [{}] shard {} has {} replica(s), expected {}. Replicate it with:\n  \
                 POST /collections/{}/cluster {{\"replicate_shard\": {{\"shard_id\": {}, \
                 \"from_peer_id\": {}, \"to_peer_id\": <target peer>}}}}",
                shard_key,
                shard_id,
                replicas.len(),
                replication_factor,
                collection,
                shard_id,
                replicas
                    .first()
                    .map(|(peer_id, _, _)| *peer_id)
                    .unwrap_or(0),
            );
        }
    }
    Ok(())
}

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
    let base_url = std::env::var(&url_var)
        .map_err(|_| anyhow!("{} is not set", url_var))?
        .replace(QDRANT_GRPC_PORT, QDRANT_HTTP_PORT)
        .trim_end_matches('/')
        .to_string();
    let api_key = std::env::var(&api_key_var).map_err(|_| anyhow!("{} is not set", api_key_var))?;

    let qdrant = QdrantHttp::new(base_url, api_key)?;
    let poll_interval = Duration::from_secs(args.poll_interval_seconds);

    let info = qdrant.cluster_info(&args.collection).await?;
    let ops = info.resharding_operations.as_deref().unwrap_or(&[]);

    if args.abort {
        if ops.is_empty() {
            return Err(anyhow!(
                "No in-flight resharding operation on {}",
                args.collection
            ));
        }
        println!(
            "In-flight resharding on {}: {}",
            args.collection,
            describe_resharding_ops(ops)
        );
        qdrant
            .post_cluster_operation(
                &args.collection,
                &serde_json::json!({"abort_resharding": {}}),
            )
            .await?;
        println!("Resharding aborted.");
        return Ok(());
    }

    if args.targets.is_empty() {
        return Err(anyhow!("No --target provided"));
    }

    // Preflight: resharding must be enabled on the cluster (default-off in OSS deployments).
    let telemetry: TelemetryResult = qdrant.get("/telemetry?details_level=1").await?;
    if !telemetry.cluster.resharding_enabled {
        return Err(anyhow!(
            "Resharding is not enabled on this cluster (cluster.resharding_enabled is false). Set \
             QDRANT__CLUSTER__RESHARDING_ENABLED=true on every node and restart them."
        ));
    }

    let collection_info: CollectionInfoResult = qdrant
        .get(&format!("/collections/{}", args.collection))
        .await?;
    let replication_factor = collection_info
        .config
        .params
        .replication_factor
        .unwrap_or(1);

    let counts = shard_counts_per_key(&info);
    if counts.is_empty() {
        return Err(anyhow!(
            "Collection {} has no custom shard keys; shard-key resharding does not apply",
            args.collection
        ));
    }

    // Build the plan: current -> target per key, with the inferred direction.
    let mut plan: Vec<(String, usize, usize)> = vec![];
    for (shard_key, target) in &args.targets {
        let current = *counts.get(shard_key).ok_or_else(|| {
            anyhow!(
                "Unknown shard key {} (available: {})",
                shard_key,
                counts.keys().cloned().collect::<Vec<_>>().join(", ")
            )
        })?;
        plan.push((shard_key.clone(), current, *target));
    }

    println!(
        "Collection {} on {} (replication_factor {}):",
        args.collection, qdrant.base_url, replication_factor
    );
    for (shard_key, current, target) in &plan {
        let direction = match current.cmp(target) {
            std::cmp::Ordering::Less => format!("up x{}", target - current),
            std::cmp::Ordering::Greater => format!("down x{}", current - target),
            std::cmp::Ordering::Equal => "nothing to do".to_string(),
        };
        println!(
            "  {}: {} -> {} shards ({})",
            shard_key, current, target, direction
        );
    }
    if !ops.is_empty() {
        println!(
            "NOTE: in-flight resharding operation: {}. It will be awaited before proceeding.",
            describe_resharding_ops(ops)
        );
        let in_flight_key = ops.first().and_then(|op| shard_key_label(&op.shard_key));
        if !plan
            .iter()
            .any(|(shard_key, _, _)| Some(shard_key) == in_flight_key.as_ref())
        {
            return Err(anyhow!(
                "The in-flight resharding targets shard key {:?} which is not part of the plan. \
                 Wait for it to complete or abort it with --abort.",
                in_flight_key
            ));
        }
    }

    // Ordered execution steps, with candidate peers for scale-up steps. Each up step is assumed
    // to consume its peer's headroom for the rest of the run (telemetry lags behind a fresh
    // transfer), so the plan needs as many qualifying peers as it has up steps.
    let up_steps_total: usize = plan
        .iter()
        .map(|(_, current, target)| target.saturating_sub(*current))
        .sum();
    let peers = if up_steps_total > 0 && args.peer_id.is_none() {
        let peers = gather_peer_ram(&qdrant, &args.peer_urls).await?;
        println!("Peers:");
        for peer in &peers {
            println!(
                "  {}{}",
                peer.describe(),
                if peer.qualifies() {
                    ""
                } else {
                    " — over limit"
                }
            );
        }
        peers
    } else {
        vec![]
    };
    let candidates: Vec<&PeerRam> = peers.iter().filter(|peer| peer.qualifies()).collect();

    println!("Execution order:");
    let mut step_no = 0;
    let mut candidate_idx = 0;
    let mut missing_peers = 0;
    for (shard_key, current, target) in &plan {
        for i in 0..target.saturating_sub(*current) {
            step_no += 1;
            let peer_desc = match args.peer_id {
                Some(peer_id) => format!("forced peer {}", peer_id),
                None => match candidates.get(candidate_idx) {
                    Some(peer) => {
                        candidate_idx += 1;
                        format!("candidate {}", peer.describe())
                    }
                    None => {
                        missing_peers += 1;
                        "NO QUALIFYING PEER".to_string()
                    }
                },
            };
            println!(
                "  {}. {}: up {} -> {} shards — {}",
                step_no,
                shard_key,
                current + i,
                current + i + 1,
                peer_desc
            );
        }
        for i in 0..current.saturating_sub(*target) {
            step_no += 1;
            println!(
                "  {}. {}: down {} -> {} shards",
                step_no,
                shard_key,
                current - i,
                current - i - 1
            );
        }
    }
    if step_no == 0 {
        println!("  (nothing to do)");
    }
    if up_steps_total > 0 && args.peer_id.is_none() {
        println!(
            "Candidate peers are indicative: the target peer is re-selected from live telemetry \
             before each step, excluding peers already used in this run."
        );
    }

    // Something must drive the resharding stages: the cloud operator on managed Qdrant Cloud
    // clusters, this bin (--drive) everywhere else — OSS has no internal driver and a started
    // operation just sits there.
    let managed_cloud = url::Url::parse(&qdrant.base_url)
        .ok()
        .and_then(|u| u.host_str().map(|h| h.ends_with("cloud.qdrant.io")))
        .unwrap_or(false);
    println!(
        "Driver: {}",
        if managed_cloud {
            "Qdrant Cloud operator (managed cluster)"
        } else if args.drive {
            "this bin (--drive)"
        } else {
            "NONE — not a managed Qdrant Cloud cluster; executing will require --drive"
        }
    );

    if args.peer_id.is_none() && missing_peers > 0 {
        return Err(anyhow!(
            "Not enough peers below {:.0}% RAM used: {} scale-up step(s) planned but only {} \
             qualifying peer(s). Free up memory (or move shards) first, reduce the targets, or \
             force a target with --peer-id.",
            MAX_TARGET_PEER_RAM_USED_FRACTION * 100.0,
            up_steps_total,
            up_steps_total - missing_peers
        ));
    }

    if !args.execute {
        println!("Dry run only — re-run with --execute to launch.");
        return Ok(());
    }
    if !managed_cloud && !args.drive {
        return Err(anyhow!(
            "Nothing would drive this resharding: {} is not a managed Qdrant Cloud cluster (no \
             cloud operator) and --drive was not passed. Re-run with --drive.",
            qdrant.base_url
        ));
    }
    if managed_cloud && args.drive {
        return Err(anyhow!(
            "--drive on a managed Qdrant Cloud cluster would race the cloud operator. Drop \
             --drive."
        ));
    }

    let mut used_peers: HashSet<u64> = HashSet::new();

    for (shard_key, current, target) in plan {
        let mut current = current;

        // Adopt a pre-existing resharding operation on this key before driving toward the target.
        let in_flight = qdrant
            .cluster_info(&args.collection)
            .await?
            .resharding_operations
            .and_then(|ops| {
                ops.into_iter().find(|op| {
                    shard_key_label(&op.shard_key).as_deref() == Some(shard_key.as_str())
                })
            });
        if let Some(op) = in_flight {
            println!("[{}] adopting in-flight resharding operation", shard_key);
            if op.direction == "up" {
                used_peers.insert(op.peer_id);
            }
            if args.drive {
                drive_resharding(
                    &qdrant,
                    &args.collection,
                    &shard_key,
                    &args.peer_urls,
                    poll_interval,
                )
                .await?;
            }
            wait_for_no_resharding(&qdrant, &args.collection, &shard_key, poll_interval).await?;
            current = *shard_counts_per_key(&qdrant.cluster_info(&args.collection).await?)
                .get(&shard_key)
                .ok_or_else(|| anyhow!("Shard key {} disappeared", shard_key))?;
        }

        while current != target {
            let direction = if current < target { "up" } else { "down" };
            let mut operation = serde_json::json!({
                "start_resharding": {
                    "direction": direction,
                    "shard_key": shard_key,
                }
            });
            // Scale-up places a new shard: pick the target peer by RAM usage (re-evaluated at
            // every step, since each landed shard changes the picture).
            if direction == "up" {
                let target_peer = match args.peer_id {
                    Some(peer_id) => {
                        println!(
                            "[{}] using forced target peer {} (--peer-id bypasses RAM checks)",
                            shard_key, peer_id
                        );
                        peer_id
                    }
                    None => {
                        let peer_id =
                            select_target_peer(&qdrant, &args.peer_urls, &used_peers).await?;
                        used_peers.insert(peer_id);
                        peer_id
                    }
                };
                operation["start_resharding"]["peer_id"] = serde_json::json!(target_peer);
            }

            println!(
                "[{}] starting resharding {} ({} -> {} shards)",
                shard_key,
                direction,
                current,
                if direction == "up" {
                    current + 1
                } else {
                    current - 1
                }
            );
            qdrant
                .post_cluster_operation(&args.collection, &operation)
                .await?;

            if args.drive {
                drive_resharding(
                    &qdrant,
                    &args.collection,
                    &shard_key,
                    &args.peer_urls,
                    poll_interval,
                )
                .await?;
            }
            wait_for_no_resharding(&qdrant, &args.collection, &shard_key, poll_interval).await?;

            let new_count = *shard_counts_per_key(&qdrant.cluster_info(&args.collection).await?)
                .get(&shard_key)
                .ok_or_else(|| anyhow!("Shard key {} disappeared", shard_key))?;
            let expected = if direction == "up" {
                current + 1
            } else {
                current - 1
            };
            if new_count != expected {
                return Err(anyhow!(
                    "[{}] resharding finished but shard count is {} (expected {}). It was likely \
                     aborted externally; re-run to resume.",
                    shard_key,
                    new_count,
                    expected
                ));
            }
            current = new_count;
            println!("[{}] resharding step done: {} shards", shard_key, current);
        }

        check_replication(&qdrant, &args.collection, &shard_key, replication_factor).await?;
        println!("[{}] done: {} shards", shard_key, current);
    }

    println!("All targets reached.");
    Ok(())
}
