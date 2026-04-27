use anyhow::{anyhow, Result};
use chrono::{Duration, Utc};
use clap::Parser;
use csv::Writer;
use dust::{
    data_sources::{
        data_source::{DataSource, DataSourceConfig},
        qdrant::{DustQdrantClient, QdrantClients, SHARD_KEY_COUNT},
    },
    project::Project,
    stores::{postgres::PostgresStore, store::Store},
};
use std::env;

#[derive(Parser, Debug)]
#[command(version, about, long_about = None)]
struct Args {
    /// Shard key id to scan (0..SHARD_KEY_COUNT). If provided, only data sources that
    /// map to this shard key will be counted. If omitted, all data sources are counted.
    #[arg(short, long)]
    shard_key_id: Option<u64>,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();

    if let Some(shard_key_id) = args.shard_key_id {
        if shard_key_id >= SHARD_KEY_COUNT {
            return Err(anyhow!("shard_key_id must be in [0, {})", SHARD_KEY_COUNT));
        }
    }

    let store = PostgresStore::new(
        &env::var("CORE_DATABASE_URI").map_err(|_| anyhow!("CORE_DATABASE_URI is required"))?,
    )
    .await?;

    let qdrant_clients = QdrantClients::build().await?;

    let cutoff_secs = (Utc::now() - Duration::days(120)).timestamp();

    let pool = store.raw_pool();
    let conn = pool.get().await?;

    let rows = conn
        .query(
            "SELECT project, data_source_id, internal_id, config_json, name, created \
             FROM data_sources \
             WHERE created > $1 \
             ORDER BY created DESC",
            &[&cutoff_secs],
        )
        .await?;

    let filtered: Vec<_> = match args.shard_key_id {
        Some(shard_key_id) => rows
            .iter()
            .filter(|row| {
                let internal_id: String = row.get(2);
                match DustQdrantClient::shard_key_id_from_internal_id(&internal_id) {
                    Ok(key_id) => key_id == shard_key_id,
                    Err(_) => false,
                }
            })
            .collect(),
        None => rows.iter().collect(),
    };

    match args.shard_key_id {
        Some(shard_key_id) => println!(
            "Found {} data sources from the past 4 months on shard key {} (out of {} total)",
            filtered.len(),
            shard_key_id,
            rows.len()
        ),
        None => println!(
            "Found {} data sources from the past 4 months",
            filtered.len()
        ),
    }

    let output_path = match args.shard_key_id {
        Some(shard_key_id) => format!("data_sources_qdrant_counts_shard_{}.csv", shard_key_id),
        None => "data_sources_qdrant_counts.csv".to_string(),
    };
    let mut wtr = Writer::from_path(output_path.clone())?;
    wtr.write_record([
        "project_id",
        "data_source_id",
        "internal_id",
        "name",
        "created",
        "point_count",
        "error",
    ])?;

    for (i, row) in filtered.iter().enumerate() {
        let project_id: i64 = row.get(0);
        let data_source_id: String = row.get(1);
        let internal_id: String = row.get(2);
        let config_json: String = row.get(3);
        let name: String = row.get(4);
        let created: i64 = row.get(5);

        let config: DataSourceConfig = match serde_json::from_str(&config_json) {
            Ok(c) => c,
            Err(e) => {
                eprintln!(
                    "[{}/{}] failed to parse config for {}: {}",
                    i + 1,
                    filtered.len(),
                    internal_id,
                    e
                );
                wtr.write_record([
                    &project_id.to_string(),
                    &data_source_id,
                    &internal_id,
                    &name,
                    &created.to_string(),
                    "",
                    &e.to_string(),
                ])?;
                continue;
            }
        };

        let project = Project::new_from_id(project_id);
        let ds = DataSource::new_from_store(
            &project,
            created as u64,
            &data_source_id,
            &internal_id,
            &config,
            &name,
        );

        let qdrant_client = ds.main_qdrant_client(&qdrant_clients);

        let (point_count_str, error_str) = match qdrant_client
            .count_points(
                &ds.embedder_config(),
                &ds.internal_id().to_string(),
                None,
                false,
            )
            .await
        {
            Ok(response) => {
                let count = response.result.map(|r| r.count).unwrap_or(0);
                (count.to_string(), String::new())
            }
            Err(e) => {
                eprintln!(
                    "[{}/{}] qdrant error for {}: {}",
                    i + 1,
                    filtered.len(),
                    internal_id,
                    e
                );
                (String::new(), e.to_string())
            }
        };

        println!(
            "[{}/{}] {} (project={}) => {} points",
            i + 1,
            filtered.len(),
            internal_id,
            project_id,
            point_count_str
        );

        wtr.write_record([
            &project_id.to_string(),
            &data_source_id,
            &internal_id,
            &name,
            &created.to_string(),
            &point_count_str,
            &error_str,
        ])?;
    }

    wtr.flush()?;
    println!("Results saved to {}", output_path);

    Ok(())
}
