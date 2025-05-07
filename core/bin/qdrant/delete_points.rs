use anyhow::{anyhow, Result};
use dust::data_sources::data_source::{make_document_id_hash, DataSource};
use dust::data_sources::qdrant::{DustQdrantClient, QdrantClients};
use dust::project;
use dust::stores::postgres;
use dust::stores::store::Store;
use qdrant_client::qdrant::{self, CountPointsBuilder};
use std::env;
use tracing::info;

async fn delete_orphaned_points_for_document_id(
    store: &Box<dyn Store + Sync + Send>,
    ds: &DataSource,
    qdrant_client: &DustQdrantClient,
    document_id: &str,
) -> Result<()> {
    match ds
        .retrieve(store.clone(), &document_id, &None, true, &None)
        .await
    {
        Err(e) => Err(e),
        Ok(None) => Ok(()),
        Ok(Some(_)) => Err(anyhow!("Document still exists. Won't delete.")),
    }?;

    let document_id_hash = make_document_id_hash(document_id);

    let filter = qdrant::Filter {
        must: vec![qdrant::FieldCondition {
            key: "document_id_hash".to_string(),
            r#match: Some(qdrant::Match {
                match_value: Some(qdrant::r#match::MatchValue::Keyword(
                    document_id_hash.to_string(),
                )),
            }),
            ..Default::default()
        }
        .into()],
        ..Default::default()
    };

    qdrant_client
        .delete_points(&ds.embedder_config(), &ds.internal_id().to_string(), filter)
        .await?;

    println!(
        "deleted point for document_id_hash: {} in data_source_internal_id: {}",
        document_id_hash,
        ds.internal_id()
    );

    Ok(())
}

async fn delete_orphaned_points_for_data_source(
    store: &Box<dyn Store + Sync + Send>,
    qdrant_clients: &QdrantClients,
    data_source_internal_id: &str,
    document_ids: &[String],
) -> Result<()> {
    println!(
        "processing data_source_internal_id: {}",
        data_source_internal_id
    );

    let ds = store
        .load_data_source_by_internal_id(data_source_internal_id)
        .await?;

    match ds {
        Some(ds) => {
            let qdrant_client = ds.main_qdrant_client(qdrant_clients);

            for document_id in document_ids {
                if let Err(e) =
                    delete_orphaned_points_for_document_id(store, &ds, &qdrant_client, document_id)
                        .await
                {
                    eprintln!(
                        "error deleting point for document_id: {} in data_source_internal_id: {}: {}",
                        document_id, data_source_internal_id, e
                    );
                }
            }

            println!(
                "finished processing data_source_internal_id: {}",
                data_source_internal_id
            );
            Ok(())
        }
        None => {
            eprintln!(
                "data source not found for data_source_internal_id: {}",
                data_source_internal_id
            );
            Ok(())
        }
    }
}

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
        Err(e) => Ok(()),
        Ok(ds) => match ds {
            None => Ok(()),
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
                    .count_points(
                        ds.embedder_config(),
                        &ds.internal_id().to_string(),
                        Some(filter.clone()),
                        true,
                    )
                    .await?;

                info!("Count: {}", count.result.unwrap().count);
                Ok(())
            }
        },
    }
}
