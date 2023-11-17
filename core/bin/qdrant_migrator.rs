use std::str::FromStr;

use anyhow::{anyhow, Result};
use clap::{Parser, Subcommand};
use dust::{
    data_sources::qdrant::{QdrantClients, QdrantCluster, QdrantDataSourceConfig},
    project,
    stores::postgres,
    stores::store,
    utils,
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
    #[command(about = "Set `shadow_write_cluster` (!!! creates collection on `shadow_write_cluster`)", long_about = None)]
    SetShadowWrite {
        project_id: i64,
        data_source_id: String,
        cluster: String,
    },
    #[command(arg_required_else_help = true)]
    #[command(about = "Clear `shadow_write_cluster` (!!! deletes collection from `shadow_write_cluster`)", long_about = None)]
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
    #[command(about = "Switch `shadow_write_cluster` and `cluster` (!!! moves read traffic to `shadow_write_cluster`)", long_about = None)]
    CommitShadowWrite {
        project_id: i64,
        data_source_id: String,
    },
}

/// A fictional versioning CLI
#[derive(Debug, Parser)] // requires `derive` feature
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

                // TODO(spolu): Create collection on shadow_write_cluster

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
            Commands::ClearShadowWrite {
                project_id,
                data_source_id,
            } => {
                let project = project::Project::new_from_id(project_id);
                let mut ds = match store.load_data_source(&project, &data_source_id).await? {
                    Some(ds) => ds,
                    None => Err(anyhow!("Data source not found"))?,
                };

                let mut config = ds.config().clone();

                // TODO(spolu): delete collection from shadow_write_cluster

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
            Commands::MigrateShadowWrite {
                project_id,
                data_source_id,
            } => Ok::<(), anyhow::Error>(()),
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
                            shadow_write_cluster: None,
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
