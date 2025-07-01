use bb8::Pool;
use bb8_postgres::PostgresConnectionManager;
use clap::Parser;
use dust::{
    databases::table::get_table_unique_id,
    project::Project,
    stores::{postgres::PostgresStore, store::Store},
};
use tokio_postgres::NoTls;

#[derive(Parser, Debug)]
struct Args {
    #[arg(long, help = "Skip confirmation")]
    skip_confirmation: bool,

    #[arg(long, help = "The cursor to start from", default_value = "0")]
    start_cursor: i64,

    #[arg(long, help = "The batch size", default_value = "100")]
    batch_size: usize,
}

/*
 * Backfills the csv_bucket and csv_bucket_path columns in the Tables table, and create the matching GCS file based on tables_row data.
 *
 * Usage:
 * cargo run --bin backfill_tables_gcs_path -- [--skip-confirmation] [--start-cursor <cursor>] [--batch-size <batch_size>]
 *
 */
#[tokio::main]
async fn main() {
    if let Err(e) = run().await {
        eprintln!("Error: {}", e);
        std::process::exit(1);
    }
}

async fn process_tables(
    pool: &Pool<PostgresConnectionManager<NoTls>>,
    id_cursor: i64,
    batch_size: i64,
) -> Result<(), Box<dyn std::error::Error>> {
    let c = pool.get().await?;

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

async fn run() -> Result<(), Box<dyn std::error::Error>> {
    // parse args and env vars
    let args = Args::parse();
    let start_cursor = args.start_cursor;
    let batch_size = args.batch_size;

    let db_uri = std::env::var("CORE_DATABASE_URI").expect("CORE_DATABASE_URI must be set");

    let store = PostgresStore::new(&db_uri).await?;
    let pool = store.raw_pool();

    // grab last id in data_sources_nodes
    let c = pool.get().await?;
    let last_id = c.query_one("SELECT MAX(id) FROM tables", &[]).await?;

    let last_id: i64 = last_id.get(0);
    println!("Last id in tables: {}", last_id);

    process_tables(&pool, start_cursor, batch_size as i64).await?;

    Ok(())
}
