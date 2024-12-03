use std::collections::HashMap;

use anyhow::{anyhow, Result};
use clap::Parser;
use cloud_storage::{ListRequest, Object};
use dust::data_sources::data_source::make_document_id_hash;
use dust::data_sources::file_storage_document::FileStorageDocument;
use dust::stores::{postgres, store};
use futures::{pin_mut, StreamExt};

#[derive(Parser, Debug)]
struct Args {
    #[arg(long, default_value = "false")]
    execute: bool,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();
    let execute = args.execute;

    let created_start = 1733164800000 as i64; // 2024-12-02 18:40 UTC
    let created_end = 1733214300000 as i64; // 2024-12-03 08:25 UTC

    let batch_size = 1000 as i64;
    let mut last_processed_id = 0 as i64;

    let store: Box<dyn store::Store + Sync + Send> = match std::env::var("CORE_DATABASE_URI") {
        Ok(db_uri) => {
            let store = postgres::PostgresStore::new(&db_uri).await?;
            store.init().await?;
            Box::new(store)
        }
        Err(_) => Err(anyhow!("CORE_DATABASE_URI is required (postgres)"))?,
    };

    println!(
        "Fixing created for data_sources_documents from {} to {} (execute={})",
        created_start, created_end, execute
    );

    loop {
        println!("Getting data_sources_documents batch {}", last_processed_id);

        let pool = store.raw_pool();

        let c = pool.get().await?;

        let dsdocs_rows = c
            .query(
                "SELECT id, document_id, created, hash, data_source \
             FROM data_sources_documents \
             WHERE created >= $1 AND created <= $2 AND id > $3 ORDER BY id ASC LIMIT $4",
                &[
                    &created_start,
                    &created_end,
                    &last_processed_id,
                    &batch_size,
                ],
            )
            .await?;

        if dsdocs_rows.len() == 0 {
            break;
        }

        last_processed_id = dsdocs_rows[dsdocs_rows.len() - 1].get(0);

        println!("Getting data_sources");

        let data_source_row_ids: Vec<i64> = dsdocs_rows.iter().map(|row| row.get(4)).collect();
        let ds_rows = c
            .query(
                "SELECT id, data_source_id, project, internal_id FROM data_sources WHERE id = ANY($1)",
                &[&data_source_row_ids],
            )
            .await?;

        println!("Processing data_sources_documents");

        #[derive(Debug, Clone)]
        struct DsData {
            data_source_id: String,
            project: i64,
            internal_id: String,
        }

        let ds_data: HashMap<i64, DsData> = ds_rows
            .iter()
            .map(|row| {
                (
                    row.get(0),
                    DsData {
                        data_source_id: row.get(1),
                        project: row.get(2),
                        internal_id: row.get(3),
                    },
                )
            })
            .collect();

        struct DocData {
            document_id: String,
            created: i64,
            hash: String,
        }

        // Tuples with (data_source_row_id, Document)
        let docs: Vec<(DsData, i64, DocData)> = dsdocs_rows
            .iter()
            .map(|row| {
                let id: i64 = row.get(0);
                let document_id: String = row.get(1);
                let created: i64 = row.get(2);
                let hash: String = row.get(3);

                let data_source_row_id: i64 = row.get(4);

                let ds_data = ds_data
                    .get(&data_source_row_id)
                    .expect(&format!(
                        "Unreachable: unknown data_source_row_id: {}",
                        data_source_row_id
                    ))
                    .clone();

                (
                    ds_data,
                    id,
                    DocData {
                        document_id,
                        created,
                        hash,
                    },
                )
            })
            .collect();

        println!("Found {} rows", dsdocs_rows.len());

        for (ds_data, id, doc) in docs {
            println!(
                "Processing data_source_id={} document_id={}",
                ds_data.data_source_id, doc.document_id
            );

            let ds_bucket = format!("{}/{}", ds_data.project, ds_data.internal_id);

            let doc_id_hash = make_document_id_hash(&doc.document_id);
            let doc_prefix = format!("{}/{}/", ds_bucket, doc_id_hash);

            let wrong_file_name = format!("{}_{}", doc.created, doc.hash);
            let matching_gcs_paths = list_files_with_prefix(&doc_prefix).await?;

            let paths: Vec<String> = match matching_gcs_paths.len() {
                0 => panic!("No matching files found"),
                _ => {
                    // Find the path that has a filename that matches `*_<hash>.json`
                    matching_gcs_paths
                        .into_iter()
                        .filter(|path| path.ends_with(&format!("{}.json", doc.hash)))
                        .collect()
                }
            };

            if paths.len() == 0 {
                panic!("No matching files found for {}", wrong_file_name);
            }

            let createds: Vec<i64> = paths
                .iter()
                .map(|path| {
                    path.split('/')
                        .last()
                        .unwrap()
                        .split('_')
                        .next()
                        .unwrap()
                        .parse::<i64>()
                        .unwrap()
                })
                .collect();

            let new_created = createds.iter().max().unwrap();

            if doc.created == *new_created {
                println!(
                    "Skipping data_sources_document id={} because created is already correct",
                    id
                );
                continue;
            }

            if execute {
                // Update database
                println!(
                    "Updating created to {} (was {}) for data_sources_document id={}",
                    new_created, doc.created, id
                );
                c.execute(
                    "UPDATE data_sources_documents SET created = $1 WHERE id = $2",
                    &[new_created, &id],
                )
                .await?;
            } else {
                println!(
                    "Would update created to {} (was {}) for data_sources_document id={}",
                    new_created, doc.created, id
                );
            }
        }
    }

    Ok(())
}

async fn list_files_with_prefix(prefix: &str) -> Result<Vec<String>> {
    let bucket = FileStorageDocument::get_bucket().await?;

    let mut paths = Vec::new();

    let stream = Object::list(
        &bucket,
        ListRequest {
            prefix: Some(prefix.to_string()),
            ..Default::default()
        },
    )
    .await?;

    pin_mut!(stream);

    while let Some(item) = stream.next().await {
        if let Ok(list) = item {
            paths.extend(list.items.into_iter().map(|obj| obj.name));
        }
    }

    Ok(paths)
}
