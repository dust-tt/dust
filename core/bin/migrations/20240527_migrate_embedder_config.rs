use anyhow::{anyhow, Result};
use dust::{
    data_sources::data_source::{EmbedderConfig, EmbedderDataSourceConfig},
    stores::{postgres, store},
};
use futures::{StreamExt, TryStreamExt};
use tokio_postgres::Row;
use tokio_stream::{self as stream};

async fn update_config_for_data_source(
    store: Box<dyn store::Store + Sync + Send>,
    data_source_internal_id: &String,
) -> Result<()> {
    let mut ds = match store
        .load_data_source_by_internal_id(&data_source_internal_id)
        .await?
    {
        Some(ds) => ds,
        None => Err(anyhow!("Data source not found"))?,
    };

    let mut config = ds.config().clone();

    config.embedder_config = Some(EmbedderDataSourceConfig {
        embedder: EmbedderConfig {
            provider_id: config.provider_id.clone(),
            model_id: config.model_id.clone(),
            splitter_id: config.splitter_id.clone(),
        },
        shadow_embedder: None,
    });

    ds.update_config(store, &config).await?;

    Ok(())
}

#[tokio::main]
async fn main() -> Result<(), anyhow::Error> {
    let store: Box<dyn store::Store + Sync + Send> = match std::env::var("CORE_DATABASE_URI") {
        Ok(db_uri) => {
            let store = postgres::PostgresStore::new(&db_uri).await?;
            store.init().await?;
            Box::new(store)
        }
        Err(_) => Err(anyhow!("CORE_DATABASE_URI is required (postgres)"))?,
    };

    let pool = store.raw_pool();
    let c = pool.get().await?;
    let rows: Vec<Row> = c.query("SELECT internal_id FROM data_sources", &[]).await?;

    println!("Found {:} data sources to update", rows.len());

    stream::iter(rows.into_iter().map(|row| {
        let store = store.clone();

        async move {
            let data_source_internal_id: String = row.get(0);
            update_config_for_data_source(store, &data_source_internal_id.clone()).await
        }
    }))
    .buffer_unordered(1)
    .try_collect::<Vec<_>>()
    .await?;

    println!("Updated all data_sources");

    Ok(())
}
