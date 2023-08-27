use anyhow::{anyhow, Result};
use qdrant_client::{
    prelude::{QdrantClient, QdrantClientConfig},
    qdrant::{self, PointsOperationResponse},
};

#[tokio::main]
async fn main() -> Result<()>{
    let qdrant_client = client().await?;
    let collections = qdrant_client.list_collections().await?.collections;
    for collection in collections {
        add_index_to_collection(&qdrant_client, collection.name).await?;
    }
    Ok(())
}

async fn client() -> Result<QdrantClient> {
    match std::env::var("QDRANT_URL") {
        Ok(url) => {
            let mut config = QdrantClientConfig::from_url(&url);
            match std::env::var("QDRANT_API_KEY") {
                Ok(api_key) => {
                    config.set_api_key(&api_key);
                    QdrantClient::new(Some(config))
                }
                Err(_) => Err(anyhow!("QDRANT_API_KEY is not set"))?,
            }
        }
        Err(_) => Err(anyhow!("QDRANT_URL is not set"))?,
    }
}

async fn add_index_to_collection(
    client: &QdrantClient,
    collection_name: String,
) -> Result<PointsOperationResponse> {
    client
        .create_field_index(
            collection_name,
            "parents",
            qdrant::FieldType::Keyword,
            None,
            None,
        )
        .await
}
