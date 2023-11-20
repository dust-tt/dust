use std::str::FromStr;

use anyhow::{anyhow, Result};
use clap::{Parser, Subcommand};
use dust::{
    data_sources::qdrant::{QdrantClients, QdrantCluster, QdrantDataSourceConfig},
    project,
    run::Credentials,
    stores::postgres,
    stores::store,
    utils,
};
use qdrant_client::{
    prelude::Payload,
    qdrant::{self, PointId, ScrollPoints},
};

#[derive(Debug, Subcommand)]
enum Commands {
    #[command(arg_required_else_help = true)]
    #[command(about = "Show qdrant state for data source", long_about = None)]
    Show {
        project_id: i64,
        data_source_id: String,
    },
    #[command(arg_required_else_help = true)]
    #[command(about = "Set `shadow_write_cluster` \
                       (!!! creates collection on `shadow_write_cluster`)", long_about = None)]
    SetShadowWrite {
        project_id: i64,
        data_source_id: String,
        cluster: String,
    },
    #[command(arg_required_else_help = true)]
    #[command(about = "Clear `shadow_write_cluster` \
                       (!!! deletes collection from `shadow_write_cluster`)", long_about = None)]
    ClearShadowWrite {
        project_id: i64,
        data_source_id: String,
    },
    #[command(arg_required_else_help = true)]
    #[command(about = "Migrate `cluster` collection to `shadow_write_cluster`", long_about = None)]
    MigrateShadowWrite {
        project_id: i64,
        data_source_id: String,
    },
    #[command(arg_required_else_help = true)]
    #[command(about = "Switch `shadow_write_cluster` and `cluster` \
                       (!!! moves read traffic to `shadow_write_cluster`)", long_about = None)]
    CommitShadowWrite {
        project_id: i64,
        data_source_id: String,
    },
}

#[derive(Debug, Parser)]
#[command(name = "collection_migrator")]
#[command(about = "Tooling to migrate Qdrant collections", long_about = None)]
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
        let store: Box<dyn store::Store + Sync + Send> = match std::env::var("CORE_DATABASE_URI") {
            Ok(db_uri) => {
                let store = postgres::PostgresStore::new(&db_uri).await?;
                Box::new(store)
            }
            Err(_) => Err(anyhow!("CORE_DATABASE_URI is required (postgres)"))?,
        };

        let qdrant_clients = QdrantClients::build().await?;

        match args.command {
            Commands::Show {
                project_id,
                data_source_id,
            } => {
                let project = project::Project::new_from_id(project_id);
                let ds = match store.load_data_source(&project, &data_source_id).await? {
                    Some(ds) => ds,
                    None => Err(anyhow!("Data source not found"))?,
                };

                utils::info(&format!(
                    "Data source: collection={} cluster={} shadow_write_cluster={}",
                    ds.qdrant_collection(),
                    qdrant_clients
                        .main_cluster(&ds.config().qdrant_config)
                        .to_string(),
                    match qdrant_clients.shadow_write_cluster(&ds.config().qdrant_config) {
                        Some(cluster) => cluster.to_string(),
                        None => "none".to_string(),
                    }
                ));

                let qdrant_client = qdrant_clients.main_client(&ds.config().qdrant_config);
                match qdrant_client
                    .collection_info(ds.qdrant_collection())
                    .await?
                    .result
                {
                    Some(info) => {
                        utils::info(&format!(
                            "[MAIN] Qdrant collection: collection={} status={} \
                             points_count={} cluster={} ",
                            ds.qdrant_collection(),
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
                            .collection_info(ds.qdrant_collection())
                            .await?
                            .result
                        {
                            Some(info) => {
                                utils::info(&format!(
                                    "[SHADOW] Qdrant collection: collection={} status={} \
                             points_count={} cluster={}",
                                    ds.qdrant_collection(),
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

                Ok::<(), anyhow::Error>(())
            }
            Commands::SetShadowWrite {
                project_id,
                data_source_id,
                cluster,
            } => {
                let project = project::Project::new_from_id(project_id);
                let mut ds = match store.load_data_source(&project, &data_source_id).await? {
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
                        cluster: QdrantCluster::Main0,
                        shadow_write_cluster: Some(QdrantCluster::from_str(cluster.as_str())?),
                    }),
                };

                // Create collection on shadow_write_cluster.
                let shadow_write_qdrant_client =
                    match qdrant_clients.shadow_write_client(&config.qdrant_config) {
                        Some(client) => client,
                        None => unreachable!(),
                    };

                // We send a fake credentials here since this is not really used for OpenAI to get
                // the embeedding size (which is what happens here). May need to be revisited in
                // future.
                let mut credentials = Credentials::new();
                credentials.insert("OPENAI_API_KEY".to_string(), "foo".to_string());

                ds.create_qdrant_collection(credentials, shadow_write_qdrant_client.clone())
                    .await?;

                utils::done(&format!(
                    "Created qdrant shadow_write_cluster collection: \
                     collection={} shadow_write_cluster={}",
                    ds.qdrant_collection(),
                    match qdrant_clients.shadow_write_cluster(&config.qdrant_config) {
                        Some(cluster) => cluster.to_string(),
                        None => "none".to_string(),
                    }
                ));

                // Add shadow_write_cluster to config.
                ds.update_config(store, &config).await?;

                utils::done(&format!(
                    "Updated data source: collection={} cluster={} shadow_write_cluster={}",
                    ds.qdrant_collection(),
                    qdrant_clients
                        .main_cluster(&ds.config().qdrant_config)
                        .to_string(),
                    match qdrant_clients.shadow_write_cluster(&ds.config().qdrant_config) {
                        Some(cluster) => cluster.to_string(),
                        None => "none".to_string(),
                    }
                ));

                Ok::<(), anyhow::Error>(())
            }
            Commands::ClearShadowWrite {
                project_id,
                data_source_id,
            } => {
                // This is the most dangerous command of all as it is the only one to actually
                // delete data in an unrecoverable way.
                let project = project::Project::new_from_id(project_id);
                let mut ds = match store.load_data_source(&project, &data_source_id).await? {
                    Some(ds) => ds,
                    None => Err(anyhow!("Data source not found"))?,
                };

                let shadow_write_qdrant_client =
                    match qdrant_clients.shadow_write_client(&ds.config().qdrant_config) {
                        Some(client) => client,
                        None => Err(anyhow!("No shadow write cluster to clear"))?,
                    };

                match shadow_write_qdrant_client
                    .collection_info(ds.qdrant_collection())
                    .await?
                    .result
                {
                    Some(info) => {
                        // confirm
                        match utils::confirm(&format!(
                            "[DANGER] Are you sure you want to delete this qdrant \
                             shadow_write_cluster collection? \
                             (this is definitive) points_count={} shadow_write_cluster={}",
                            info.points_count,
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
                    None => Err(anyhow!("Qdrant collection not found"))?,
                };

                // Delete collection on shadow_write_cluster.
                shadow_write_qdrant_client
                    .delete_collection(ds.qdrant_collection())
                    .await?;

                utils::done(&format!(
                    "Deleted qdrant shadow_write_cluster collection: \
                     collection={} shadow_write_cluster={}",
                    ds.qdrant_collection(),
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
                        cluster: QdrantCluster::Main0,
                        shadow_write_cluster: None,
                    }),
                };

                ds.update_config(store, &config).await?;

                utils::done(&format!(
                    "Updated data source: collection={} cluster={} shadow_write_cluster={}",
                    ds.qdrant_collection(),
                    qdrant_clients
                        .main_cluster(&ds.config().qdrant_config)
                        .to_string(),
                    match qdrant_clients.shadow_write_cluster(&ds.config().qdrant_config) {
                        Some(cluster) => cluster.to_string(),
                        None => "none".to_string(),
                    }
                ));

                Ok::<(), anyhow::Error>(())
            }
            Commands::MigrateShadowWrite {
                project_id,
                data_source_id,
            } => {
                let project = project::Project::new_from_id(project_id);
                let ds = match store.load_data_source(&project, &data_source_id).await? {
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
                loop {
                    let now = utils::now();
                    let scroll_results = match qdrant_client
                        .scroll(&ScrollPoints {
                            collection_name: ds.qdrant_collection(),
                            with_vectors: Some(true.into()),
                            with_payload: Some(true.into()),
                            limit: Some(points_per_request as u32),
                            offset: page_offset.clone(),
                            ..Default::default()
                        })
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

                    match shadow_write_qdrant_client
                        .upsert_points(ds.qdrant_collection(), points, None)
                        .await
                    {
                        Ok(_) => (),
                        Err(e) => {
                            if retry < 3 {
                                retry += 1;
                                utils::error(&format!(
                                    "Error migrating points (write): retry={} error={:?}",
                                    retry, e
                                ));
                                continue;
                            } else {
                                Err(e)?
                            }
                        }
                    }

                    total += count;
                    utils::info(&format!(
                        "Migrated points: count={} total={} latency_ms={}",
                        count,
                        total,
                        utils::now() - now
                    ));

                    page_offset = scroll_results.next_page_offset;
                    if page_offset.is_none() {
                        break;
                    }
                    retry = 0;
                }

                utils::info(&format!("Done migrating: total={}", total));

                Ok::<(), anyhow::Error>(())
            }
            Commands::CommitShadowWrite {
                project_id,
                data_source_id,
            } => {
                let project = project::Project::new_from_id(project_id);
                let mut ds = match store.load_data_source(&project, &data_source_id).await? {
                    Some(ds) => ds,
                    None => Err(anyhow!("Data source not found"))?,
                };

                let mut config = ds.config().clone();

                config.qdrant_config = match config.qdrant_config {
                    Some(c) => match c.shadow_write_cluster {
                        Some(cluster) => Some(QdrantDataSourceConfig {
                            cluster: cluster,
                            shadow_write_cluster: Some(c.cluster),
                        }),
                        None => Err(anyhow!("No shadow write cluster to commit"))?,
                    },
                    None => Err(anyhow!("No shadow write cluster to commit"))?,
                };

                ds.update_config(store, &config).await?;

                utils::info(&format!(
                    "Updated data source: collection={} cluster={} shadow_write_cluster={}",
                    ds.qdrant_collection(),
                    qdrant_clients
                        .main_cluster(&ds.config().qdrant_config)
                        .to_string(),
                    match qdrant_clients.shadow_write_cluster(&ds.config().qdrant_config) {
                        Some(cluster) => cluster.to_string(),
                        None => "none".to_string(),
                    }
                ));

                Ok::<(), anyhow::Error>(())
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
