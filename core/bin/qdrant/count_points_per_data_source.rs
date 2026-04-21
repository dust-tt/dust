use anyhow::{anyhow, Result};
use chrono::{Duration, Utc};
use csv::Writer;
use dust::{
    data_sources::{
        data_source::{DataSource, DataSourceConfig},
        qdrant::QdrantClients,
    },
    project::Project,
    stores::{postgres::PostgresStore, store::Store},
};
use std::env;

#[tokio::main]
async fn main() -> Result<()> {
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

    println!("Found {} data sources from the past 4 months", rows.len());

    let output_path = "data_sources_qdrant_counts.csv";
    let mut wtr = Writer::from_path(output_path)?;
    wtr.write_record([
        "project_id",
        "data_source_id",
        "internal_id",
        "name",
        "created",
        "point_count",
        "error",
    ])?;

    for (i, row) in rows.iter().enumerate() {
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
                    rows.len(),
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
                    rows.len(),
                    internal_id,
                    e
                );
                (String::new(), e.to_string())
            }
        };

        println!(
            "[{}/{}] {} (project={}) => {} points",
            i + 1,
            rows.len(),
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
