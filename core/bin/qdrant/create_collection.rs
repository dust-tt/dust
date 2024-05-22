use anyhow::{anyhow, Result};
use clap::Parser;
use dust::{
    data_sources::qdrant::{QdrantClients, QdrantCluster},
    providers::{
        embedder::{Embedder, EmbedderProvidersModelMap, SupportedEmbedderModels},
        provider::{provider, ProviderID},
    },
    utils,
};
use qdrant_client::qdrant;
use tokio;

#[derive(Parser, Debug)]
#[command(version, about, long_about = None)]
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
}

async fn create_qdrant_collection(
    cluster: QdrantCluster,
    collection_name: String,
    embedder: Box<dyn Embedder + Sync + Send>,
) -> Result<()> {
    let qdrant_clients = QdrantClients::build().await?;

    let client = qdrant_clients.client(cluster);

    // See https://www.notion.so/dust-tt/Design-Doc-Qdrant-re-arch-d0ebdd6ae8244ff593cdf10f08988c27.
    let res = client
        .create_collection(&qdrant::CreateCollection {
            collection_name,
            vectors_config: Some(qdrant::VectorsConfig {
                config: Some(qdrant::vectors_config::Config::Params(
                    qdrant::VectorParams {
                        size: embedder.embedding_size() as u64,
                        distance: qdrant::Distance::Cosine.into(),
                        on_disk: Some(true),
                        ..Default::default()
                    },
                )),
            }),
            hnsw_config: Some(qdrant::HnswConfigDiff {
                payload_m: Some(16),
                m: Some(0),
                ..Default::default()
            }),
            optimizers_config: Some(qdrant::OptimizersConfigDiff {
                memmap_threshold: Some(16384),
                ..Default::default()
            }),
            quantization_config: Some(qdrant::QuantizationConfig {
                quantization: Some(qdrant::quantization_config::Quantization::Scalar(
                    qdrant::ScalarQuantization {
                        r#type: qdrant::QuantizationType::Int8.into(),
                        quantile: Some(0.99),
                        always_ram: Some(true),
                    },
                )),
            }),
            on_disk_payload: Some(true),
            sharding_method: Some(qdrant::ShardingMethod::Custom.into()),
            shard_number: Some(2),
            replication_factor: Some(2),
            write_consistency_factor: Some(1),
            ..Default::default()
        })
        .await?;

    match res.result {
        true => Ok(()),
        false => Err(anyhow!("Collection not created!")),
    }
}

#[tokio::main]
async fn main() -> Result<(), anyhow::Error> {
    let args = Args::parse();

    // Validate the model for the given provider
    if !EmbedderProvidersModelMap::is_model_supported(&args.provider, &args.model) {
        eprintln!(
            "Error: Model {} is not available for provider {}.",
            args.model, args.provider
        );
        std::process::exit(1);
    }

    let collection_name = format!("c_{}_{}", args.provider, args.model);

    println!(
        "About to create collection {} on cluster {}",
        collection_name, args.cluster
    );

    match utils::confirm(&format!(
        "Are you sure you want to create collection {} on cluster {}?",
        collection_name, args.cluster
    ))? {
        true => (),
        false => Err(anyhow!("Aborted"))?,
    }

    let embedder = provider(args.provider).embedder(args.model.to_string());

    create_qdrant_collection(args.cluster, collection_name.clone(), embedder).await?;

    println!(
        "Done creating collection {} on cluster {}",
        collection_name, args.cluster
    );

    Ok(())
}
