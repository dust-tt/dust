use std::{collections::HashSet, time::Duration};

use anyhow::{anyhow, Context, Result};
use dust::{
    data_sources::{
        data_source::make_document_id_hash, file_storage_document::FileStorageDocument,
    },
    providers::provider::{with_retryable_back_off, ModelError, ModelErrorRetryOptions},
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
    .context("fetch_data_sources_batch")
}

async fn fetch_data_sources_documents_versions(
    pool: &Pool<PostgresConnectionManager<NoTls>>,
    data_source_id: i64,
    last_id: u64,
    limit: usize,
) -> Result<Vec<Row>, anyhow::Error> {
    let c = pool.get().await?;

    c.query(
        "SELECT id, document_id, hash, created, status FROM data_sources_documents WHERE data_source = $1 AND id > $2 ORDER BY id ASC LIMIT $3",
        &[&data_source_id, &(last_id as i64), &(limit as i64)],
    )
    .await
    .context("fetch_data_sources_documents_versions")
}

async fn delete_wrapper(path: &str) -> Result<bool> {
    match FileStorageDocument::delete_if_exists(path).await {
        Ok(b) => Ok(b),

        Err(e) => Err(ModelError {
            request_id: None,
            message: e.to_string(),
            retryable: Some(ModelErrorRetryOptions {
                sleep: Duration::from_millis(500),
                factor: 2,
                retries: 3,
            }),
        })?,
    }
}

async fn retryable_delete(path: &str) -> Result<bool> {
    with_retryable_back_off(
        || delete_wrapper(path),
        |err_msg, sleep, attempts| {
            println!(
                "Retrying delete: path={}, err_msg={}, sleep={:?}, attempts={}",
                path, err_msg, sleep, attempts
            );
        },
        |err| {
            println!("Error deleting: path={}, err_msg={}", path, err.message);
        },
    )
    .await
}

async fn clean_stored_versions_for_data_source(
    store: Box<dyn store::Store + Sync + Send>,
    data_source_internal_id: &str,
    data_source_id: i64,
) -> Result<()> {
    let data_source = match store
        .load_data_source_by_internal_id(&data_source_internal_id)
        .await?
    {
        Some(ds) => ds,
        None => Err(anyhow!("Data source not found"))?,
    };

    let pool = store.raw_pool();

    let limit: usize = 1024;
    let mut last_data_source_document_id = 0;
    let mut iteration = 0;
    let mut document_id_hashs = HashSet::new();

    loop {
        let rows = fetch_data_sources_documents_versions(
            pool,
            data_source_id,
            last_data_source_document_id,
            limit,
        )
        .await?;

        rows.iter().for_each(|row| {
            let document_id: String = row.get(1);
            document_id_hashs.insert(make_document_id_hash(&document_id));
        });

        stream::iter(
            rows.iter()
                .filter(|row| {
                    let version_created: i64 = row.get(3);

                    // 2024-07-26:00:00.000Z
                    // IF we are after this date we just skip version deletion as no legacy version was
                    // created after this date. https://github.com/dust-tt/dust/pull/6405
                    if version_created > 1721952000000 {
                        return false;
                    }
                    return true;
                })
                .map(|row| {
                    let document_id: String = row.get(1);
                    let version_hash: String = row.get(2);
                    let document_id_hash = make_document_id_hash(&document_id);

                    return FileStorageDocument::get_legacy_content_path(
                        &data_source,
                        &document_id_hash,
                        version_hash.as_str(),
                    );
                })
                .map(|p| async move {
                    retryable_delete(&p).await?;
                    Ok::<(), anyhow::Error>(())
                }),
        )
        .buffer_unordered(32)
        .try_collect::<Vec<_>>()
        .await?;

        if rows.len() < limit {
            println!("Version loop done: data_source_id={}", data_source_id);
            break;
        }

        last_data_source_document_id = match rows.last() {
            Some(r) => {
                let id: i64 = r.get(0);
                println!(
                    "Version loop: data_source_id={} iteration={}, last_data_source_document_id={}",
                    data_source_id, iteration, id
                );

                id as u64
            }
            None => {
                println!(
                    "Version loop done: data_source_id={} iteration={}",
                    data_source_id, iteration
                );
                break;
            }
        };

        iteration += 1;
    }

    println!(
        "Deleting legacy document ids for data_source_id={} count={}",
        data_source_id,
        document_id_hashs.len()
    );

    stream::iter(
        document_id_hashs
            .iter()
            .map(|document_id_hash| {
                FileStorageDocument::get_legacy_document_id_path(&data_source, document_id_hash)
            })
            .map(|p| async move {
                retryable_delete(&p).await?;
                Ok::<(), anyhow::Error>(())
            }),
    )
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

    let limit: usize = 16000;
    let mut last_data_source_id = 0;
    let mut iteration = 0;

    loop {
        let rows = fetch_data_sources_batch(pool, last_data_source_id, limit).await?;

        stream::iter(rows.iter().map(|row| {
            let store = store.clone();

            async move {
                let data_source_id: i64 = row.get(0);
                let data_source_internal_id: String = row.get(1);

                clean_stored_versions_for_data_source(
                    store,
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
            println!("DataSource loop done: iteration={}", iteration);
            break;
        }

        last_data_source_id = match rows.last() {
            Some(r) => {
                let id: i64 = r.get(0);
                println!(
                    "DataSource loop: iteration={} last_data_source_id={}",
                    iteration, id
                );

                id as u64
            }
            None => {
                println!("DataSource loop done: iteration={}", iteration);
                break;
            }
        };

        iteration += 1;
    }

    Ok(())
}
