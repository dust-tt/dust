use ::qdrant_client::qdrant::{value, PointId};
use anyhow::{anyhow, Context, Result};
use cloud_storage::Object;
use dust::{
    data_sources::{
        data_source::{make_document_id_hash, DataSource, Section},
        file_storage_document::FileStorageDocument,
        qdrant::QdrantClients,
    },
    stores::{postgres, store},
    utils,
};
use qdrant_client::qdrant;
use tokio::time::{sleep, Duration};
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

// Return a "best-effort" section for the latest version of the document (based on Qdrant).
// For superseded versions, return an empty section.
async fn get_sections_from_document_version(
    qdrant_clients: &QdrantClients,
    ds: &DataSource,
    document_id_hash: &str,
    document_status: &str,
    full_text: &str,
) -> Result<Section> {
    if document_status != "latest" {
        return Ok(Section {
            prefix: None,
            content: Some(full_text.to_string()),
            sections: vec![],
        });
    }

    let qdrant_client = ds.main_qdrant_client(qdrant_clients);

    let f = qdrant::Filter {
        must: vec![
            qdrant::Condition::matches("document_id_hash", document_id_hash.to_string()),
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
        ],
        ..Default::default()
    };

    let mut retry = 0;
    let points_per_request = 256;
    let mut page_offset: Option<PointId> = None;
    let mut root_section = Section {
        prefix: None,
        content: None,
        sections: vec![],
    };

    loop {
        let scroll_results = match qdrant_client
            .scroll(
                &ds.embedder_config(),
                &ds.internal_id().to_string(),
                Some(f.clone()),
                Some(points_per_request as u32),
                page_offset.clone(),
                Some(false.into()),
            )
            .await
        {
            Ok(r) => r,
            Err(e) => {
                if retry < 3 {
                    retry += 1;
                    utils::error(&format!(
                        "Error migrating points (read): retry={} error={:?}",
                        retry, e
                    ));
                    tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                    continue;
                } else {
                    Err(e)?
                }
            }
        };

        let mut sorted_results = scroll_results.result.clone();

        // Sort results by chunk_offset. We don't have the proper index to sort by `chunk_offset`.
        sorted_results.sort_by_key(|r| {
            r.payload
                .get("chunk_offset")
                .and_then(|v| {
                    if let Some(value::Kind::IntegerValue(offset)) = &v.kind {
                        Some(*offset)
                    } else {
                        None
                    }
                })
                .unwrap_or(0) // Default to 0 if chunk_offset is missing or not an IntValue.
        });

        root_section
            .sections
            .extend(sorted_results.iter().filter_map(|r| {
                match &r.get("text").kind {
                    Some(value::Kind::StringValue(s)) => {
                        let section = Section {
                            prefix: None,
                            content: Some(s.clone()),
                            sections: vec![], // Initialize with empty vector or nested sections if needed
                        };

                        Some(section)
                    }
                    _ => None,
                }
            }));

        page_offset = scroll_results.next_page_offset;
        if page_offset.is_none() {
            break;
        }
    }

    Ok(root_section)
}

async fn update_stored_document_for_document_id(
    pool: &Pool<PostgresConnectionManager<NoTls>>,
    qdrant_clients: &QdrantClients,
    data_source: &DataSource,
    data_source_id: i64,
    document_id: &str,
) -> Result<()> {
    let c = pool.get().await?;

    let bucket = FileStorageDocument::get_bucket().await?;

    let document_versions = c.query("SELECT hash, created, status FROM data_sources_documents WHERE data_source = $1 AND document_id = $2", &[&data_source_id, &document_id]).await?;
    let document_id_hash = make_document_id_hash(document_id);

    println!(
        "Found {:} document versions for document {:} to update.",
        document_versions.len(),
        document_id_hash
    );

    let tasks = document_versions.into_iter().map(|d| {
        let data_source = data_source.clone();
        let document_id_hash = document_id_hash.to_string();
        let document_id = document_id.to_string();
        let bucket = bucket.clone();

        async move {
            let document_hash: String = d.get(0);
            let document_created: i64 = d.get(1);
            let document_status: String = d.get(2);

            // We need to loop over all the versions.
            let legacy_file_path = FileStorageDocument::get_legacy_file_path(
                &data_source,
                &document_id_hash,
                &document_hash,
            );

            let new_file_path = FileStorageDocument::get_document_file_path(
                &data_source,
                document_created as u64,
                &document_id_hash,
                &document_hash,
            );

            if FileStorageDocument::file_exists(&new_file_path).await? {
                // File already exist, return early.
                println!("File {:} already exist.", new_file_path);
                return Ok::<(), anyhow::Error>(());
            }

            if !FileStorageDocument::file_exists(&legacy_file_path).await? {
                // File already exist, return early.
                println!("Legacy file {:} not found -- skipping.", legacy_file_path);
                return Ok::<(), anyhow::Error>(());
            }

            let legacy_stored_document =
                FileStorageDocument::get_stored_document(&legacy_file_path).await?;

            let sections = get_sections_from_document_version(
                qdrant_clients,
                &data_source,
                &document_id_hash,
                &document_status,
                &legacy_stored_document,
            )
            .await?;

            let file_storage_document = FileStorageDocument {
                document_id: document_id.to_string(),
                full_text: legacy_stored_document.to_string(),
                sections,
            };
            let serialized_document = serde_json::to_vec(&file_storage_document)?;

            let mut attempts = 0;
            loop {
                match Object::create(
                    &bucket,
                    serialized_document.clone(),
                    &new_file_path,
                    "application/json",
                )
                .await
                {
                    Ok(_) => break,
                    Err(err) => {
                        attempts += 1;
                        if attempts >= 3 {
                            return Err(anyhow!(
                                "Failed to create object after 3 attempts: {}",
                                err
                            ));
                        }
                        sleep(Duration::from_secs(1)).await;
                    }
                }
            }

            Ok::<(), anyhow::Error>(())
        }
    });

    let mut stream = stream::iter(tasks).buffer_unordered(16); // Run up to 16 in parallel.

    while let Some(result) = stream.next().await {
        result?; // Check for errors.
    }

    Ok(())
}

async fn backfill_all_documents_for_data_source_id(
    store: Box<dyn store::Store + Sync + Send>,
    pool: &Pool<PostgresConnectionManager<NoTls>>,
    qdrant_clients: &QdrantClients,
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

            update_stored_document_for_document_id(
                &pool,
                qdrant_clients,
                &data_source,
                data_source_id,
                &document_id,
            )
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

    let qdrant_clients = QdrantClients::build().await?;

    let pool = store.raw_pool();

    let limit: usize = 50;
    let mut last_data_source_id = 0;

    loop {
        let rows = fetch_data_sources_batch(&pool, last_data_source_id, limit).await?;

        stream::iter(rows.iter().map(|row| {
            let store = store.clone();
            let qdrant_clients = qdrant_clients.clone();

            async move {
                let data_source_id: i64 = row.get(0);
                let data_source_internal_id: String = row.get(1);

                backfill_all_documents_for_data_source_id(
                    store,
                    &pool,
                    &qdrant_clients,
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
