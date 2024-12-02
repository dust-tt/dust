use anyhow::{anyhow, Context, Error, Result};
use dust::data_sources::data_source::{DataSource, DocumentVersion};
use dust::stores::{postgres, store};
use tokio_postgres::Row;

use bb8::Pool;
use bb8_postgres::PostgresConnectionManager;
use futures::prelude::*;
use futures::{StreamExt, TryStreamExt};
use std::time::Duration;
use tokio_postgres::NoTls;
use tokio_stream::{self as stream};

pub async fn with_retryable_back_off<F, O>(
    mut f: impl FnMut() -> F,
    log_retry: impl Fn(&Error, &Duration, usize) -> (),
    log_error: impl Fn(&Error) -> (),
) -> Result<O>
where
    F: Future<Output = Result<O, anyhow::Error>>,
{
    let factor = 2;
    let retries = 3;
    let mut sleep = Duration::from_millis(500);
    let mut attempts = 0_usize;
    let out = loop {
        match f().await {
            Err(err) => {
                log_error(&err);
                attempts += 1;
                log_retry(&err, &sleep, attempts);
                tokio::time::sleep(sleep).await;
                sleep *= factor;
                if attempts > retries {
                    break Err(anyhow!("Too many retries ({}): {}", retries, err));
                }
            }
            Ok(out) => break Ok(out),
        }
    };
    out
}

async fn fetch_data_sources_documents_batch(
    pool: &Pool<PostgresConnectionManager<NoTls>>,
    data_source_id: i64,
    last_id: u64,
    limit: usize,
) -> Result<Vec<Row>, anyhow::Error> {
    let c = pool.get().await?;

    c.query(
        "SELECT id, document_id FROM data_sources_documents WHERE data_source = $1 AND status='latest' AND id > $2 ORDER BY id ASC LIMIT $3",
        &[&data_source_id, &(last_id as i64), &(limit as i64)],
    )
    .await
    .context("fetch_data_sources_documents")
}

async fn scrub_wrapper(
    store: Box<dyn store::Store + Sync + Send>,
    data_source: &DataSource,
    document_id: &str,
) -> Result<Vec<DocumentVersion>> {
    data_source
        .scrub_document_superseded_versions(store, document_id)
        .await
}

async fn scrub_superseded_versions_for_data_source(
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

    loop {
        let rows = fetch_data_sources_documents_batch(
            pool,
            data_source_id,
            last_data_source_document_id,
            limit,
        )
        .await?;

        stream::iter(
            rows.iter()
                .map(|row| {
                    let document_id: String = row.get(1);
                    (store.clone(), document_id, data_source.clone())
                })
                .map(|(store, document_id, data_source)| async move {
                    let v = with_retryable_back_off(
                        || scrub_wrapper(store.clone(), &data_source, &document_id),
                        |err, sleep, attempts| {
                            println!(
                                "Retrying scrub: err_msg={}, sleep={:?}, attempts={}",
                                err, sleep, attempts
                            );
                        },
                        |err| {
                            println!(
                                "Error scrubbing: data_source_id={}, err_msg={}",
                                data_source_id, err
                            );
                        },
                    )
                    .await?;
                    if v.len() > 0 {
                        println!(
                            "Scrubbed document: data_source_id={} document_id={} scrubbed={}",
                            data_source_id,
                            document_id,
                            v.len()
                        );
                    }
                    Ok::<(), anyhow::Error>(())
                }),
        )
        .buffer_unordered(8)
        .try_collect::<Vec<_>>()
        .await?;

        if rows.len() < limit {
            println!("Scrub loop done: data_source_id={}", data_source_id);
            break;
        }

        last_data_source_document_id = match rows.last() {
            Some(r) => {
                let id: i64 = r.get(0);
                println!(
                    "Scrub loop: data_source_id={} iteration={}, last_data_source_document_id={}",
                    data_source_id, iteration, id
                );

                id as u64
            }
            None => {
                println!(
                    "Scrub loop done: data_source_id={} iteration={}",
                    data_source_id, iteration
                );
                break;
            }
        };

        iteration += 1;
    }

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

    let rows = c
        .query("SELECT id, internal_id FROM data_sources ORDER BY id", &[])
        .await
        .context("fetch_data_sources")?;

    stream::iter(rows.iter().map(|row| {
        let store = store.clone();

        async move {
            let data_source_id: i64 = row.get(0);
            let data_source_internal_id: String = row.get(1);

            scrub_superseded_versions_for_data_source(
                store,
                &data_source_internal_id,
                data_source_id,
            )
            .await
        }
    }))
    .buffer_unordered(8)
    .try_collect::<Vec<_>>()
    .await?;

    Ok(())
}
