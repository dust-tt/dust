use anyhow::{anyhow, Result};
use qdrant_client::{
    prelude::{QdrantClient, QdrantClientConfig},
    qdrant::{self, PointsOperationResponse},
};
use std::env;

#[tokio::main]
async fn main() -> Result<()> {
    let qdrant_client = client().await?;
    let collections = get_collections_to_index(&qdrant_client).await?;
    println!("Collections to index: {:?}", collections.len());
    for collection in collections {
        match add_index_to_collection(&qdrant_client, collection.name).await {
            Ok(response) => println!("Indexing response: {:?}", response),
            Err(error) => println!("Indexing error: {:?}", error),
        }
    }
    Ok(())
}

async fn get_collections_to_index(
    client: &QdrantClient,
) -> Result<Vec<qdrant::CollectionDescription>> {
    if let Some(collection_name) = env::args().nth(1) {
        if collection_name == "--all" {
            Ok(client.list_collections().await?.collections)
        } else {
            Ok(vec![qdrant::CollectionDescription {
                name: collection_name,
                ..Default::default()
            }])
        }
    } else {
        return Err(anyhow!("No collection name provided"));
    }
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
    println!("Adding index to collection: {}", collection_name);
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
