use anyhow::{anyhow, Result};
use clap::{Parser, Subcommand};
use dust::project::Project;
use dust::{
    data_sources::qdrant::QdrantClients,
    stores::{postgres, store::Store},
    utils,
};

use dust::data_sources::data_source::make_document_id_hash;
use futures::StreamExt;
use futures::TryStreamExt;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{self, BufRead, BufReader};
use tokio_stream::{self as stream};

#[derive(Debug, Subcommand)]
enum Commands {
    #[command(arg_required_else_help = true)]
    #[command(about = "Update a Confluence data source to double its parents", long_about = None)]
    Migrate {
        project_id: i64,
        data_source_id: String,
    },
    #[command(arg_required_else_help = true)]
    #[command(about = "Update a set of Confluence data sources to double their parents", long_about = None)]
    MigrateFile { json_path: String },
}

fn get_new_parent_ids(parents: Vec<String>) -> Vec<String> {
    parents
        .into_iter()
        .map(|parent| {
            if parent.starts_with("cspace_") {
                parent.replacen("cspace_", "confluence-space-", 1)
            } else if parent.starts_with("cpage_") {
                parent.replacen("cpage_", "confluence-page-", 1)
            } else {
                parent
            }
        })
        .collect()
}

async fn migrate_data_source(
    store: Box<dyn Store + Sync + Send>,
    qdrant_clients: QdrantClients,
    project_id: i64,
    data_source_id: String,
) -> Result<()> {
    let project = Project::new_from_id(project_id);
    let ds = match store
        .as_ref()
        .load_data_source(&project, &data_source_id)
        .await?
    {
        Some(ds) => ds,
        None => Err(anyhow!("Data source not found"))?,
    };
    utils::info(&format!(
        "Updating parents for data source: data_source_internal_id={} data_source_id={}",
        ds.internal_id(),
        ds.data_source_id(),
    ));

    let batch_size = 1000;
    let mut last_processed_id = 0;

    loop {
        utils::info(&format!(
            "Processing batch starting from id {}",
            last_processed_id
        ));

        let docs = store
            .list_data_source_documents(
                &project,
                &data_source_id,
                &None,
                &None,
                Some((batch_size, last_processed_id)),
                true,
            )
            .await?;

        if docs.0.len() == 0 {
            break;
        }

        last_processed_id = docs.0.last().unwrap().created as usize;

        for doc in docs.0 {
            let mut new_parents = doc.parents.clone();
            let mut converted_parents = get_new_parent_ids(doc.parents.clone());
            new_parents.append(&mut converted_parents);

            let document_id_hash = make_document_id_hash(&doc.document_id);
            ds.update_parents(store, qdrant_clients.clone(), document_id_hash, new_parents)
                .await?;
        }
    }

    utils::done(&format!(
        "Parents updated for data source: \
           data_source_internal_id={} data_source_id={}",
        ds.data_source_id(),
        ds.internal_id(),
    ));

    Ok(())
}

#[derive(Serialize, Deserialize)]
struct DataSourceEntry {
    #[serde(rename = "dustAPIProjectId")]
    project_id: i64,
    #[serde(rename = "dustAPIDataSourceId")]
    data_source_id: String,
}

async fn migrate_file(
    store: Box<dyn Store + Sync + Send>,
    qdrant_clients: QdrantClients,
    json_path: String,
) -> Result<()> {
    let file = File::open(json_path)?;
    let reader = BufReader::new(file);
    let entries = reader
        .lines()
        .map(|line| {
            let line = line?;
            serde_json::from_str(&line).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))
        })
        .collect::<std::result::Result<Vec<DataSourceEntry>, io::Error>>()?;

    stream::iter(entries.into_iter().map(|entry| {
        let store = store.clone();
        let qdrant_clients = qdrant_clients.clone();
        async move {
            migrate_data_source(
                store,
                qdrant_clients,
                entry.project_id,
                entry.data_source_id,
            )
            .await
        }
    }))
    .buffer_unordered(1)
    .try_collect::<Vec<_>>()
    .await?;

    Ok(())
}

#[derive(Debug, Parser)]
#[command(name = "align_confluence_ids")]
#[command(about = "Tooling to align document IDs for Confluence data sources", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

fn main() -> Result<()> {
    let args = Cli::parse();

    let rt = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(32)
        .enable_all()
        .build()?;

    let r = rt.block_on(async {
        tracing_subscriber::fmt()
            .with_target(false)
            .compact()
            .with_ansi(false)
            .init();
        let store: Box<dyn Store + Sync + Send> = match std::env::var("CORE_DATABASE_URI") {
            Ok(db_uri) => {
                let store = postgres::PostgresStore::new(&db_uri).await?;
                Box::new(store)
            }
            Err(_) => Err(anyhow!("CORE_DATABASE_URI is required (postgres)"))?,
        };

        let qdrant_clients = QdrantClients::build().await?;

        match args.command {
            Commands::Migrate {
                project_id,
                data_source_id,
            } => migrate_data_source(store, qdrant_clients, project_id, data_source_id).await,
            Commands::MigrateFile { json_path } => {
                migrate_file(store, qdrant_clients, json_path).await
            }
        }
    });

    match r {
        Ok(_) => (),
        Err(e) => {
            utils::error(&format!("Error: {:?}", e));
            std::process::exit(1);
        }
    }

    Ok(())
}
