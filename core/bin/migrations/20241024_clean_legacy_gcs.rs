use anyhow::{anyhow, Context, Result};
use dust::{
    data_sources::{
        data_source::{make_document_id_hash, DataSource},
        file_storage_document::FileStorageDocument,
    },
    stores::{postgres, store},
};
use tokio_postgres::Row;

use bb8::Pool;
use bb8_postgres::PostgresConnectionManager;
use futures::{StreamExt, TryStreamExt};
use tokio_postgres::NoTls;
use tokio_stream::{self as stream};

async fn fetch_data_sources_batch(
    pool: &Pool<PostgresConnectionManager<NoTls>>,
    last_id: u64,
    limit: usize,
) -> Result<Vec<Row>, anyhow::Error> {
    let c = pool.get().await?;

    c.query(
        "SELECT id, internal_id FROM data_sources WHERE id > $1 ORDER BY id ASC LIMIT $2",
        &[&(last_id as i64), &(limit as i64)],
    )
    .await
    .context("Query execution failed")
}

async fn clean_stored_versions_for_document_id(
    pool: &Pool<PostgresConnectionManager<NoTls>>,
    data_source: &DataSource,
    data_source_id: i64,
    document_id: &str,
) -> Result<()> {
    let c = pool.get().await?;

    let document_versions = c.query("SELECT hash, created, status FROM data_sources_documents WHERE data_source = $1 AND document_id = $2", &[&data_source_id, &document_id]).await?;
    let document_id_hash = make_document_id_hash(document_id);

    println!(
        "Found {:} document versions for document {:} to clean-up.",
        document_versions.len(),
        document_id_hash
    );

    FileStorageDocument::delete_if_exists(&FileStorageDocument::get_legacy_document_id_path(
        &data_source,
        &document_id_hash,
    ))
    .await?;

    let tasks = document_versions.into_iter().map(|d| {
        let data_source = data_source.clone();
        let document_id_hash = document_id_hash.to_string();

        async move {
            let document_hash: String = d.get(0);
            FileStorageDocument::delete_if_exists(&FileStorageDocument::get_legacy_content_path(
                &data_source,
                &document_id_hash,
                document_hash.as_str(),
            ))
            .await?;
            Ok::<(), anyhow::Error>(())
        }
    });

    let mut stream = stream::iter(tasks).buffer_unordered(16); // Run up to 16 in parallel.

    while let Some(result) = stream.next().await {
        result?; // Check for errors.
    }

    Ok(())
}

async fn clean_all_documents_for_data_source_id(
    store: Box<dyn store::Store + Sync + Send>,
    pool: &Pool<PostgresConnectionManager<NoTls>>,
    data_source_internal_id: &str,
    data_source_id: i64,
) -> Result<()> {
    println!("ds: {:?}", data_source_internal_id);

    let data_source = match store
        .load_data_source_by_internal_id(&data_source_internal_id)
        .await?
    {
        Some(ds) => ds,
        None => Err(anyhow!("Data source not found"))?,
    };

    let c = store.raw_pool().get().await?;

    let document_ids = c
        .query(
            "SELECT DISTINCT document_id from data_sources_documents WHERE data_source = $1",
            &[&data_source_id],
        )
        .await?;

    println!("Found {:} document ids to update.", document_ids.len());

    stream::iter(document_ids.into_iter().map(|row| {
        let data_source = data_source.clone();

        async move {
            let document_id: String = row.get(0);

            clean_stored_versions_for_document_id(&pool, &data_source, data_source_id, &document_id)
                .await
        }
    }))
    .buffer_unordered(16)
    .try_collect::<Vec<_>>()
    .await?;

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

    let limit: usize = 50;
    let mut last_data_source_id = 0;

    loop {
        let rows = fetch_data_sources_batch(pool, last_data_source_id, limit).await?;

        stream::iter(rows.iter().map(|row| {
            let store = store.clone();

            async move {
                let data_source_id: i64 = row.get(0);
                let data_source_internal_id: String = row.get(1);

                clean_all_documents_for_data_source_id(
                    store,
                    pool,
                    &data_source_internal_id,
                    data_source_id,
                )
                .await
            }
        }))
        .buffer_unordered(16)
        .try_collect::<Vec<_>>()
        .await?;

        if rows.len() < limit {
            println!("Updated all data_sources");
            break;
        }

        last_data_source_id = match rows.last() {
            Some(r) => {
                let id: i64 = r.get(0);
                println!("LAST_DATA_SOURCE_ID_UDPATE: {}", id);

                id as u64
            }
            None => {
                println!("Updated all data_sources");
                break;
            }
        };
    }

    Ok(())
}
