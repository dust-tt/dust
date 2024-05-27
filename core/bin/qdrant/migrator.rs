use anyhow::{anyhow, Result};
use clap::{Parser, Subcommand};
use dust::{
    data_sources::qdrant::{QdrantClients, QdrantCluster, QdrantDataSourceConfig},
    stores::{postgres, store::Store},
    utils,
};
use futures::StreamExt;
use futures::TryStreamExt;
use qdrant_client::{
    prelude::Payload,
    qdrant::{self, PointId},
};
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{self, BufRead, BufReader};
use std::str::FromStr;
use tokio_stream::{self as stream};

#[derive(Debug, Subcommand)]
enum Commands {
    #[command(arg_required_else_help = true)]
    #[command(about = "Show qdrant state for data source", long_about = None)]
    Show { data_source_internal_id: String },
    #[command(arg_required_else_help = true)]
    #[command(about = "Set `shadow_write_cluster` \
                       (!!! creates collection on `shadow_write_cluster`)", long_about = None)]
    SetShadowWrite {
        data_source_internal_id: String,
        cluster: String,
    },
    #[command(arg_required_else_help = true)]
    #[command(about = "Clear `shadow_write_cluster` \
                       (!!! deletes collection from `shadow_write_cluster`)", long_about = None)]
    ClearShadowWrite { data_source_internal_id: String },
    #[command(arg_required_else_help = true)]
    #[command(about = "Migrate `cluster` collection to `shadow_write_cluster`", long_about = None)]
    MigrateShadowWrite { data_source_internal_id: String },
    #[command(arg_required_else_help = true)]
    #[command(about = "Switch `shadow_write_cluster` and `cluster` \
                       (!!! moves read traffic to `shadow_write_cluster`)", long_about = None)]
    CommitShadowWrite { data_source_internal_id: String },
    #[command(arg_required_else_help = true)]
    #[command(about = "Automatically migrate a collection to a new cluster \
                       (!!! creates, shadow writes, migrates, \
                        and deletes collection from original cluster)", long_about = None)]
    Migrate {
        data_source_internal_id: String,
        cluster: String,
    },
    #[command(arg_required_else_help = true)]
    #[command(about = "Migrate a set of collections from a JSONL file to a new cluster \
                       (!!! creates, shadow writes, migrates, \
                        and deletes collection from original cluster)", long_about = None)]
    MigrateFile { json_path: String, cluster: String },
}

async fn show(
    store: Box<dyn Store + Sync + Send>,
    qdrant_clients: QdrantClients,
    data_source_internal_id: String,
) -> Result<()> {
    let ds = match store
        .load_data_source_by_internal_id(&data_source_internal_id)
        .await?
    {
        Some(ds) => ds,
        None => Err(anyhow!("Data source not found"))?,
    };

    utils::info(&format!(
        "Data source: \
            data_source_internal_id={}  data_source_id={} cluster={} shadow_write_cluster={}",
        ds.internal_id(),
        ds.data_source_id(),
        qdrant_clients
            .main_cluster(&ds.config().qdrant_config)
            .to_string(),
        match qdrant_clients.shadow_write_cluster(&ds.config().qdrant_config) {
            Some(cluster) => cluster.to_string(),
            None => "none".to_string(),
        }
    ));

    let qdrant_client = qdrant_clients.main_client(&ds.config().qdrant_config);
    match qdrant_client.collection_info(&ds).await?.result {
        Some(info) => {
            utils::info(&format!(
                "[MAIN] Qdrant collection: collection={} status={} points_count={:?} cluster={}",
                qdrant_client.collection_name(&ds),
                info.status.to_string(),
                info.points_count,
                qdrant_clients
                    .main_cluster(&ds.config().qdrant_config)
                    .to_string(),
            ));
        }
        None => Err(anyhow!("Qdrant collection not found"))?,
    }

    match qdrant_clients.shadow_write_cluster(&ds.config().qdrant_config) {
        Some(shadow_write_cluster) => {
            let shadow_write_qdrant_client = qdrant_clients
                .shadow_write_client(&ds.config().qdrant_config)
                .unwrap();
            match shadow_write_qdrant_client
                .collection_info(&ds)
                .await?
                .result
            {
                Some(info) => {
                    utils::info(&format!(
                        "[SHADOW] Qdrant collection: collection={} status={} \
                            points_count={:?} cluster={}",
                        shadow_write_qdrant_client.collection_name(&ds),
                        info.status.to_string(),
                        info.points_count,
                        shadow_write_cluster.to_string(),
                    ));
                }
                None => Err(anyhow!("Qdrant collection not found"))?,
            }
        }
        None => (),
    };

    Ok(())
}

async fn set_shadow_write(
    store: Box<dyn Store + Sync + Send>,
    qdrant_clients: QdrantClients,
    data_source_internal_id: String,
    cluster: String,
) -> Result<()> {
    let mut ds = match store
        .load_data_source_by_internal_id(&data_source_internal_id)
        .await?
    {
        Some(ds) => ds,
        None => Err(anyhow!("Data source not found"))?,
    };

    let mut config = ds.config().clone();

    config.qdrant_config = match config.qdrant_config {
        Some(c) => Some(QdrantDataSourceConfig {
            cluster: c.cluster,
            shadow_write_cluster: Some(QdrantCluster::from_str(cluster.as_str())?),
        }),
        None => Some(QdrantDataSourceConfig {
            cluster: QdrantCluster::Cluster0,
            shadow_write_cluster: Some(QdrantCluster::from_str(cluster.as_str())?),
        }),
    };

    // Create collection on shadow_write_cluster.
    let shadow_write_qdrant_client = match qdrant_clients.shadow_write_client(&config.qdrant_config)
    {
        Some(client) => client,
        None => unreachable!(),
    };

    utils::done(&format!(
        "Created data source on shadow_write_cluster: \
            collection={} shadow_write_cluster={}",
        shadow_write_qdrant_client.collection_name(&ds),
        match qdrant_clients.shadow_write_cluster(&config.qdrant_config) {
            Some(cluster) => cluster.to_string(),
            None => "none".to_string(),
        }
    ));

    // Add shadow_write_cluster to config.
    ds.update_config(store, &config).await?;

    utils::done(&format!(
        "Updated data source: \
            data_source_internal_id={} data_source_id={} cluster={} shadow_write_cluster={}",
        ds.internal_id(),
        ds.data_source_id(),
        qdrant_clients
            .main_cluster(&ds.config().qdrant_config)
            .to_string(),
        match qdrant_clients.shadow_write_cluster(&ds.config().qdrant_config) {
            Some(cluster) => cluster.to_string(),
            None => "none".to_string(),
        }
    ));

    Ok(())
}

async fn clear_shadow_write(
    store: Box<dyn Store + Sync + Send>,
    qdrant_clients: QdrantClients,
    data_source_internal_id: String,
    ask_confirmation: bool,
) -> Result<()> {
    let mut ds = match store
        .load_data_source_by_internal_id(&data_source_internal_id)
        .await?
    {
        Some(ds) => ds,
        None => Err(anyhow!("Data source not found"))?,
    };

    let shadow_write_qdrant_client =
        match qdrant_clients.shadow_write_client(&ds.config().qdrant_config) {
            Some(client) => client,
            None => Err(anyhow!("No shadow write cluster to clear"))?,
        };

    if ask_confirmation {
        // confirm
        match utils::confirm(&format!(
            "[DANGER] Are you sure you want to delete this qdrant \
                shadow_write_cluster data source? \
                (this is definitive) collection={} shadow_write_cluster={}",
            shadow_write_qdrant_client.collection_name(&ds),
            match qdrant_clients.shadow_write_cluster(&ds.config().qdrant_config) {
                Some(cluster) => cluster.to_string(),
                None => "none".to_string(),
            }
            .to_string(),
        ))? {
            true => (),
            false => Err(anyhow!("Aborted"))?,
        }
    }

    // Delete collection on shadow_write_cluster.
    shadow_write_qdrant_client.delete_data_source(&ds).await?;

    utils::done(&format!(
        "Deleted qdrant shadow_write_cluster data source: \
            collection={} shadow_write_cluster={}",
        shadow_write_qdrant_client.collection_name(&ds),
        match qdrant_clients.shadow_write_cluster(&ds.config().qdrant_config) {
            Some(cluster) => cluster.to_string(),
            None => "none".to_string(),
        }
    ));

    // Remove shadow_write_cluster from config.
    let mut config = ds.config().clone();

    config.qdrant_config = match config.qdrant_config {
        Some(c) => Some(QdrantDataSourceConfig {
            cluster: c.cluster,
            shadow_write_cluster: None,
        }),
        None => Some(QdrantDataSourceConfig {
            cluster: QdrantCluster::Cluster0,
            shadow_write_cluster: None,
        }),
    };

    ds.update_config(store, &config).await?;

    utils::done(&format!(
        "Updated data source: \
            data_source_internal_id={} data_source_id={} cluster={} shadow_write_cluster={}",
        ds.internal_id(),
        ds.data_source_id(),
        qdrant_clients
            .main_cluster(&ds.config().qdrant_config)
            .to_string(),
        match qdrant_clients.shadow_write_cluster(&ds.config().qdrant_config) {
            Some(cluster) => cluster.to_string(),
            None => "none".to_string(),
        }
    ));

    Ok(())
}

async fn migrate_shadow_write(
    store: Box<dyn Store + Sync + Send>,
    qdrant_clients: QdrantClients,
    data_source_internal_id: String,
) -> Result<()> {
    let ds = match store
        .load_data_source_by_internal_id(&data_source_internal_id)
        .await?
    {
        Some(ds) => ds,
        None => Err(anyhow!("Data source not found"))?,
    };

    let points_per_request = match std::env::var("POINTS_PER_REQUEST") {
        Ok(v) => v.parse::<usize>()?,
        Err(_) => 256,
    };

    let qdrant_client = qdrant_clients.main_client(&ds.config().qdrant_config);

    // Delete collection on shadow_write_cluster.
    let shadow_write_qdrant_client =
        match qdrant_clients.shadow_write_client(&ds.config().qdrant_config) {
            Some(client) => client,
            None => Err(anyhow!("No shadow write cluster to migrate to"))?,
        };

    utils::info(&format!(
        "Migrating points: points_per_request={}",
        points_per_request
    ));

    let mut page_offset: Option<PointId> = None;
    let mut total: usize = 0;
    let mut retry: usize = 0;
    let mut iterations: usize = 0;
    loop {
        let now = utils::now();
        let scroll_results = match qdrant_client
            .scroll(
                &ds,
                None, // the v1 data_source.internal_id is injected by the client.
                Some(points_per_request as u32),
                page_offset.clone(),
                Some(true.into()),
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

        let count = scroll_results.result.len();

        let points = scroll_results
            .result
            .into_iter()
            .map(|r| {
                qdrant::PointStruct::new(
                    r.id.unwrap(),
                    r.vectors.unwrap(),
                    Payload::new_from_hashmap(r.payload),
                )
            })
            .collect::<Vec<_>>();

        // Empty upserts trigger errors.
        if count > 0 {
            match shadow_write_qdrant_client.upsert_points(&ds, points).await {
                Ok(_) => (),
                Err(e) => {
                    if retry < 3 {
                        retry += 1;
                        utils::error(&format!(
                            "Error migrating points (write): retry={} error={:?}",
                            retry, e
                        ));
                        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                        continue;
                    } else {
                        Err(e)?
                    }
                }
            }
        }

        total += count;

        if iterations % 8 == 0 {
            utils::info(&format!(
                "Migrated points: count={} total={} latency_ms={}",
                count,
                total,
                utils::now() - now
            ));
        }

        page_offset = scroll_results.next_page_offset;
        if page_offset.is_none() {
            break;
        }
        retry = 0;
        iterations += 1;
    }

    utils::info(&format!("Done migrating: total={}", total));
    Ok(())
}

async fn commit_shadow_write(
    store: Box<dyn Store + Sync + Send>,
    qdrant_clients: QdrantClients,
    data_source_internal_id: String,
) -> Result<()> {
    let mut ds = match store
        .load_data_source_by_internal_id(&data_source_internal_id)
        .await?
    {
        Some(ds) => ds,
        None => Err(anyhow!("Data source not found"))?,
    };

    let mut config = ds.config().clone();

    config.qdrant_config = match config.qdrant_config {
        Some(c) => match c.shadow_write_cluster {
            Some(cluster) => Some(QdrantDataSourceConfig {
                cluster,
                shadow_write_cluster: Some(c.cluster),
            }),
            None => Err(anyhow!("No shadow write cluster to commit"))?,
        },
        None => Err(anyhow!("No shadow write cluster to commit"))?,
    };

    ds.update_config(store, &config).await?;

    utils::info(&format!(
        "Updated data source: \
            data_source_internal_id={}  data_source_id={} cluster={} shadow_write_cluster={}",
        ds.internal_id(),
        ds.data_source_id(),
        qdrant_clients
            .main_cluster(&ds.config().qdrant_config)
            .to_string(),
        match qdrant_clients.shadow_write_cluster(&ds.config().qdrant_config) {
            Some(cluster) => cluster.to_string(),
            None => "none".to_string(),
        }
    ));
    Ok(())
}

async fn migrate(
    store: Box<dyn Store + Sync + Send>,
    qdrant_clients: QdrantClients,
    data_source_internal_id: String,
    target_cluster: String,
    ask_confirmation: bool,
) -> Result<()> {
    let ds = match store
        .load_data_source_by_internal_id(&data_source_internal_id)
        .await?
    {
        Some(ds) => ds,
        None => Err(anyhow!("Data source not found"))?,
    };
    utils::info(&format!(
        "Migrating data source: data_source_internal_id={} data_source_id={} target_cluster={}",
        ds.internal_id(),
        ds.data_source_id(),
        target_cluster
    ));

    let from_cluster = qdrant_clients
        .main_cluster(&ds.config().qdrant_config)
        .to_string();

    // First show the current state.
    show(
        store.clone(),
        qdrant_clients.clone(),
        data_source_internal_id.clone(),
    )
    .await?;

    if ask_confirmation {
        // Confirm this is the migration we want.
        match utils::confirm(&format!(
            "Do you confirm `set_shadow_write` + `migrate_shadow_write`: \
                data_source_internal_id={} data_source_id={} from_cluster={} target_cluster={}?",
            ds.internal_id(),
            ds.data_source_id(),
            from_cluster,
            target_cluster,
        ))? {
            true => (),
            false => Err(anyhow!("Aborted"))?,
        }
    }

    set_shadow_write(
        store.clone(),
        qdrant_clients.clone(),
        data_source_internal_id.clone(),
        target_cluster.clone(),
    )
    .await?;

    migrate_shadow_write(
        store.clone(),
        qdrant_clients.clone(),
        data_source_internal_id.clone(),
    )
    .await?;

    if ask_confirmation {
        // Confirm we're ready to commit.
        match utils::confirm(&format!(
            "Do you confirm `commit_shadow_write` + `clear_shadow_write`: \
               data_source_internal_id={} data_source_id={} from_cluster={} target_cluster={}?",
            ds.internal_id(),
            ds.data_source_id(),
            from_cluster,
            target_cluster,
        ))? {
            true => (),
            false => Err(anyhow!("Aborted"))?,
        }
    }

    commit_shadow_write(
        store.clone(),
        qdrant_clients.clone(),
        data_source_internal_id.clone(),
    )
    .await?;

    clear_shadow_write(
        store.clone(),
        qdrant_clients.clone(),
        data_source_internal_id.clone(),
        ask_confirmation,
    )
    .await?;

    utils::done(&format!(
        "Data source migrated: \
           data_source_internal_id={} data_source_id={} from_cluster={} target_cluster={}?",
        ds.data_source_id(),
        ds.internal_id(),
        from_cluster,
        target_cluster,
    ));

    show(
        store.clone(),
        qdrant_clients.clone(),
        data_source_internal_id.clone(),
    )
    .await?;

    Ok(())
}

#[derive(Serialize, Deserialize, Debug)]
struct MigrationRecord {
    data_source_id: String,
    internal_id: String,
}

async fn migrate_file(
    store: Box<dyn Store + Sync + Send>,
    qdrant_clients: QdrantClients,
    json_path: String,
    target_cluster: String,
) -> Result<()> {
    let file = File::open(json_path)?;
    let reader = BufReader::new(file);
    let records = reader
        .lines()
        .map(|line| {
            // Each line is a JSON
            let line = line?;
            serde_json::from_str(&line).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))
        })
        .collect::<Result<Vec<MigrationRecord>, std::io::Error>>()?;

    match utils::confirm(&format!(
        "Do you confirm you want to migrate {} collections: \
            target_cluster={}?",
        records.len(),
        target_cluster,
    ))? {
        true => (),
        false => Err(anyhow!("Aborted"))?,
    }

    stream::iter(records.into_iter().map(|record| {
        let store = store.clone();
        let target_cluster = target_cluster.clone();
        let qdrant_clients = qdrant_clients.clone();
        async move {
            migrate(
                store,
                qdrant_clients,
                record.internal_id,
                target_cluster,
                false,
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
#[command(name = "collection_migrator")]
#[command(about = "Tooling to migrate Data sources on Qdrant", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

fn main() -> Result<()> {
    let args = Cli::parse();

    let rt = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(32)
        .enable_all()
        .build()
        .unwrap();

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
            Commands::Show {
                data_source_internal_id,
            } => show(store, qdrant_clients, data_source_internal_id).await,
            Commands::SetShadowWrite {
                data_source_internal_id,
                cluster,
            } => set_shadow_write(store, qdrant_clients, data_source_internal_id, cluster).await,
            Commands::ClearShadowWrite {
                data_source_internal_id,
            } => {
                // This is the most dangerous command of all as it is the only one to actually
                // delete data in an unrecoverable way.
                clear_shadow_write(store, qdrant_clients, data_source_internal_id, true).await
            }
            Commands::MigrateShadowWrite {
                data_source_internal_id,
            } => migrate_shadow_write(store, qdrant_clients, data_source_internal_id).await,
            Commands::CommitShadowWrite {
                data_source_internal_id,
            } => commit_shadow_write(store, qdrant_clients, data_source_internal_id).await,
            Commands::Migrate {
                data_source_internal_id,
                cluster,
            } => {
                migrate(
                    store,
                    qdrant_clients,
                    data_source_internal_id,
                    cluster,
                    true,
                )
                .await
            }
            Commands::MigrateFile { json_path, cluster } => {
                migrate_file(store, qdrant_clients, json_path, cluster).await
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
