use anyhow::{anyhow, Result};
use dust::data_sources::qdrant::QdrantClients;
use dust::project;
use dust::stores::postgres;
use dust::stores::store::Store;
use qdrant_client::qdrant::{self, CountPointsBuilder};
use std::env;
use tracing::info;

#[tokio::main]
async fn main() -> Result<()> {
    let project = project::Project::new_from_id(34579);
    let data_source_id = "66457fc9515affe9425114239a4e53a4b8046c23787334304f74a6d0d16c9223";

    let qdrant_clients = QdrantClients::build().await?;

    let store: Box<dyn Store + Sync + Send> = match env::var("CORE_DATABASE_URI") {
        Ok(db_uri) => {
            let store = postgres::PostgresStore::new(&db_uri).await?;
            Box::new(store)
        }
        Err(_) => Err(anyhow!("CORE_DATABASE_URI is required (postgres)"))?,
    };

    let mut filter = qdrant::Filter::default();
    match store.load_data_source(&project, &data_source_id).await {
        Err(e) => Err(anyhow!("Error getting the data source: {}", e)),
        Ok(ds) => match ds {
            None => Err(anyhow!("No data source retrieved.")),
            Some(ds) => {
                let qdrant_client = ds.main_qdrant_client(&qdrant_clients);
                filter.must.push(
                    qdrant::FieldCondition {
                        key: "data_source_internal_id".to_string(),
                        r#match: Some(qdrant::Match {
                            match_value: Some(qdrant::r#match::MatchValue::Keyword(
                                ds.internal_id().to_string(),
                            )),
                        }),
                        ..Default::default()
                    }
                    .into(),
                );

                let count = qdrant_client
                    .raw_client()
                    .count(
                        CountPointsBuilder::new(
                            qdrant_client.collection_name(ds.embedder_config()),
                        )
                        .filter(filter)
                        .exact(true),
                    )
                    .await
                    .map_err(|e| anyhow!("Error counting points: {}", e));

                info!("Count: {}", count?.result.unwrap().count);
                Ok(())
            }
        },
    }
}
