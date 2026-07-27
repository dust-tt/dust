// TEST ONLY — fills a Qdrant collection with garbage. Never run this against a production
// cluster: it refuses Qdrant Cloud URLs and prompts before writing anything.
//
// Fills a Qdrant collection with random points spread over fake data sources, for local testing
// of shard-key operations (e.g. qdrant_reshard). Data sources are assigned to shard keys the same
// way production does (blake3(internal_id) % SHARD_KEY_COUNT via DustQdrantClient), so points
// spread over all shard keys:
//
//   fill_random_points --provider openai --model text-embedding-3-large-1536 \
//     --cluster cluster-0 --data-sources 96 --points-per-data-source 1000
//
// Requires QDRANT_CLUSTER_0_URL and QDRANT_CLUSTER_0_API_KEY (and QDRANT_USE_SHARDING=true to
// route per shard key). Points carry the same payload fields as production upserts.

use anyhow::Result;
use clap::Parser;
use dust::{
    data_sources::{
        data_source::EmbedderConfig,
        qdrant::{env_var_prefix_for_cluster, QdrantClients, QdrantCluster},
        splitter::SplitterID,
    },
    providers::{
        embedder::{EmbedderProvidersModelMap, SupportedEmbedderModels},
        provider::{provider, ProviderID},
    },
    utils,
};
use qdrant_client::{qdrant, Payload};
use rand::Rng;
use uuid::Uuid;

#[derive(Parser, Debug)]
#[command(version, about = "Fill a Qdrant collection with random points for local testing.", long_about = None)]
struct Args {
    /// Name of the provider.
    #[arg(short, long)]
    provider: ProviderID,

    /// Name of the model.
    #[arg(short, long)]
    model: SupportedEmbedderModels,

    /// Name of the cluster.
    #[arg(short, long)]
    cluster: QdrantCluster,

    /// Number of fake data sources to create points for.
    #[arg(long, default_value_t = 96)]
    data_sources: usize,

    /// Number of points per data source.
    #[arg(long, default_value_t = 1000)]
    points_per_data_source: usize,

    /// Number of points per upsert request.
    #[arg(long, default_value_t = 128)]
    batch_size: usize,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();

    if !EmbedderProvidersModelMap::is_model_supported(&args.provider, &args.model) {
        return Err(anyhow::anyhow!(
            "Model {} is not available for provider {}",
            args.model,
            args.provider
        ));
    }

    let embedder = provider(args.provider).embedder(args.model.to_string());
    let embedding_size = embedder.embedding_size();

    let embedder_config = EmbedderConfig {
        provider_id: args.provider,
        model_id: args.model.to_string(),
        splitter_id: SplitterID::BaseV0,
        max_chunk_size: 512,
    };

    // This bin writes garbage: hard-refuse production (Qdrant Cloud) clusters.
    let url_var = format!("{}_URL", env_var_prefix_for_cluster(args.cluster));
    let cluster_url = std::env::var(&url_var).unwrap_or_default();
    if cluster_url.contains("cloud.qdrant.io") {
        return Err(anyhow::anyhow!(
            "{} points at a Qdrant Cloud cluster ({}). This bin fills a collection with random \
             test points and must never run against production.",
            url_var,
            cluster_url
        ));
    }

    let qdrant_clients = QdrantClients::build().await?;
    let client = qdrant_clients.client(args.cluster);

    if !utils::confirm(&format!(
        "About to write {} data sources x {} random points into collection {} on {} ({}). This \
         is test data. Proceed?",
        args.data_sources,
        args.points_per_data_source,
        client.collection_name(&embedder_config),
        args.cluster,
        cluster_url,
    ))? {
        return Err(anyhow::anyhow!("Aborted"));
    }

    println!(
        "Filling collection {} with {} data sources x {} points (embedding size {})",
        client.collection_name(&embedder_config),
        args.data_sources,
        args.points_per_data_source,
        embedding_size
    );

    let mut rng = rand::thread_rng();

    for d in 0..args.data_sources {
        // Deterministic fake internal_id, shaped like production ones (blake3 hex).
        let internal_id = blake3::hash(format!("fill_random_points-{}", d).as_bytes())
            .to_hex()
            .to_string();
        let shard_key = client.shard_key_name(&internal_id)?;

        let mut upserted = 0;
        while upserted < args.points_per_data_source {
            let batch_size = std::cmp::min(args.batch_size, args.points_per_data_source - upserted);
            let points = (0..batch_size)
                .map(|i| {
                    let mut payload = Payload::new();
                    payload.insert("tags", Vec::<String>::new());
                    payload.insert("parents", vec![format!("doc-{}", upserted + i)]);
                    payload.insert("timestamp", 0i64);
                    payload.insert("chunk_offset", (upserted + i) as i64);
                    payload.insert("chunk_hash", format!("hash-{}-{}", d, upserted + i));
                    payload.insert("data_source_internal_id", internal_id.clone());
                    payload.insert("document_id", format!("doc-{}", upserted + i));
                    payload.insert(
                        "document_id_hash",
                        format!("doc-hash-{}-{}", d, upserted + i),
                    );
                    payload.insert("text", "random fill point");

                    let vector = (0..embedding_size)
                        .map(|_| rng.gen_range(-1.0f32..1.0f32))
                        .collect::<Vec<f32>>();

                    qdrant::PointStruct::new(Uuid::new_v4().to_string(), vector, payload)
                })
                .collect::<Vec<_>>();

            client
                .upsert_points(&embedder_config, &internal_id, points)
                .await?;
            upserted += batch_size;
        }

        println!(
            "[{}/{}] data source {} ({}): {} points",
            d + 1,
            args.data_sources,
            internal_id,
            shard_key,
            args.points_per_data_source
        );
    }

    println!("Done.");
    Ok(())
}
