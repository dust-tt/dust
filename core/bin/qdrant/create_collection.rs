use std::sync::Arc;

use anyhow::{anyhow, Result};
use clap::Parser;
use dust::{
    data_sources::qdrant::{QdrantClients, QdrantCluster, SHARD_KEY_COUNT},
    providers::{
        embedder::{EmbedderProvidersModelMap, SupportedEmbedderModels},
        provider::{provider, ProviderID},
    },
    utils,
};
use qdrant_client::{
    qdrant::{
        self, quantization_config::Quantization, CreateCollectionBuilder,
        CreateFieldIndexCollectionBuilder, CreateShardKeyBuilder, CreateShardKeyRequestBuilder,
        HnswConfigDiffBuilder, OptimizersConfigDiffBuilder, VectorParamsBuilder,
    },
    Qdrant,
};
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

async fn create_indexes_for_collection(
    raw_client: &Arc<Qdrant>,
    cluster: &QdrantCluster,
    collection_name: &String,
) -> Result<()> {
    let _ = raw_client
        .create_field_index(CreateFieldIndexCollectionBuilder::new(
            collection_name,
            "document_id_hash",
            qdrant::FieldType::Keyword,
        ))
        .await?;

    let _ = raw_client
        .create_field_index(CreateFieldIndexCollectionBuilder::new(
            collection_name,
            "data_source_internal_id",
            qdrant::FieldType::Keyword,
        ))
        .await?;

    let _ = raw_client
        .create_field_index(CreateFieldIndexCollectionBuilder::new(
            collection_name,
            "tags",
            qdrant::FieldType::Keyword,
        ))
        .await?;

    let _ = raw_client
        .create_field_index(CreateFieldIndexCollectionBuilder::new(
            collection_name,
            "parents",
            qdrant::FieldType::Keyword,
        ))
        .await?;

    let _ = raw_client
        .create_field_index(CreateFieldIndexCollectionBuilder::new(
            collection_name,
            "timestamp",
            qdrant::FieldType::Integer,
        ))
        .await?;

    println!(
        "Done creating indexes for collection {} on cluster {}",
        collection_name, cluster
    );

    Ok(())
}

async fn create_qdrant_collection(
    cluster: QdrantCluster,
    provider_id: ProviderID,
    model_id: SupportedEmbedderModels,
) -> Result<()> {
    let qdrant_clients = QdrantClients::build().await?;
    let client = qdrant_clients.client(cluster);
    let raw_client = client.raw_client();

    let embedder = provider(provider_id).embedder(model_id.to_string());

    let collection_name = format!(
        "{}_{}_{}",
        client.collection_prefix(),
        provider_id,
        model_id
    );

    println!(
        "About to create collection {} on cluster {}",
        collection_name, cluster
    );

    match utils::confirm(&format!(
        "Are you sure you want to create collection {} on cluster {}?",
        collection_name, cluster
    ))? {
        true => (),
        false => Err(anyhow!("Aborted"))?,
    }

    // See https://www.notion.so/dust-tt/Design-Doc-Qdrant-re-arch-d0ebdd6ae8244ff593cdf10f08988c27.

    // First, we create the collection.
    let res = raw_client
        .create_collection(
            CreateCollectionBuilder::new(collection_name.clone())
                .vectors_config(
                    VectorParamsBuilder::new(
                        embedder.embedding_size() as u64,
                        qdrant::Distance::Cosine,
                    )
                    .distance(qdrant::Distance::Cosine)
                    .on_disk(true),
                )
                .hnsw_config(HnswConfigDiffBuilder::default().payload_m(16).m(0))
                .optimizers_config(OptimizersConfigDiffBuilder::default().memmap_threshold(16384))
                .quantization_config(Quantization::Scalar(qdrant::ScalarQuantization {
                    r#type: qdrant::QuantizationType::Int8.into(),
                    quantile: Some(0.99),
                    always_ram: Some(true),
                }))
                .on_disk_payload(true)
                .sharding_method(qdrant::ShardingMethod::Custom.into())
                .shard_number(2)
                .replication_factor(2)
                .write_consistency_factor(1),
        )
        .await?;

    match res.result {
        true => {
            println!(
                "Done creating collection {} on cluster {}",
                collection_name, cluster
            );

            Ok(())
        }
        false => Err(anyhow!("Collection not created!")),
    }?;

    // Then, we create the 24 shard_keys.
    for i in 0..SHARD_KEY_COUNT {
        let shard_key = format!("{}_{}", client.shard_key_prefix(), i);

        let operation_result = raw_client
            .create_shard_key(
                CreateShardKeyRequestBuilder::new(collection_name.clone()).request(
                    CreateShardKeyBuilder::default()
                        .shard_key(qdrant::shard_key::Key::Keyword(shard_key.clone())),
                ),
            )
            .await
            .map_err(|e| anyhow!("Error creating shard key: {}", e))?;

        match operation_result.result {
            true => {
                println!(
                    "Done creating shard key [{}] for collection {} on cluster {}",
                    shard_key, collection_name, cluster
                );

                Ok(())
            }
            false => Err(anyhow!("Collection not created!")),
        }?;
    }

    create_indexes_for_collection(&raw_client, &cluster, &collection_name)
        .await
        .map_err(|e| {
            anyhow!(
                "Error creating indexes for collection {}: {}",
                collection_name,
                e
            )
        })?;

    Ok(())
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

    create_qdrant_collection(args.cluster, args.provider, args.model)
        .await
        .map_err(|e| {
            eprintln!("Error creating collection: {}", e);
            e
        })?;

    Ok(())
}
