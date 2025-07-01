use dust::{
    databases::table::get_table_unique_id,
    project::Project,
    stores::{postgres::PostgresStore, store::Store},
};

/*
 * Backfills the column text_size of the Elasticsearch index behind the alias core_data_sources_nodes.
 *
 * Usage:
 * cargo run --bin backfill_elasticsearch_text_size -- --index-version <version> [--skip-confirmation] [--start-cursor <cursor>] [--batch-size <batch_size>]
 *
 */
#[tokio::main]
async fn main() {
    println!("hello");

    if let Err(e) = run().await {
        eprintln!("Error: {}", e);
        std::process::exit(1);
    }
}

async fn run() -> Result<(), Box<dyn std::error::Error>> {
    let db_uri = std::env::var("CORE_DATABASE_URI").expect("CORE_DATABASE_URI must be set");

    let store = PostgresStore::new(&db_uri).await?;
    let pool = store.raw_pool();
    let c = pool.get().await?;

    let id_cursor: i64 = 18;
    let batch_size: i64 = 2;

    let rows = c
        .query(
            "
            SELECT t.id, t.table_id, ds.project, ds.data_source_id
                FROM tables t
                INNER JOIN data_sources ds ON ds.id = t.data_source
                WHERE csv_bucket IS NULL AND remote_database_table_id IS NULL
                    AND t.id > $1
                ORDER BY t.id ASC
                LIMIT $2
            ",
            &[&id_cursor, &batch_size],
        )
        .await?;

    let tables = rows
        .iter()
        .map(|table| {
            let id: i64 = table.get(0);
            let table_id: String = table.get(1);
            let project: i64 = table.get(2);
            let data_source_id: String = table.get(3);

            (id, table_id, Project::new_from_id(project), data_source_id)
        })
        .collect::<Vec<_>>();

    for (id, table_id, project, data_source_id) in tables {
        println!("Processing table with id: {}, table_id: {}", id, table_id);

        let unique_id = get_table_unique_id(&project, &data_source_id, &table_id);

        println!("Unique table id: {}", unique_id);
    }

    Ok(())
}
