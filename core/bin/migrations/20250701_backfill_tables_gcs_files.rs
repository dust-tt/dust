use clap::Parser;
use dust::{
    databases::table::get_table_unique_id,
    databases_store::store::{DatabasesStore, PostgresDatabasesStore},
    project::Project,
    stores::{postgres::PostgresStore, store::Store},
};

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
 * Backfills the creation of csv files in GCS for each entry in the Tables table
 *
 * Usage:
 * cargo run --bin backfill_tables_gcs_files -- [--skip-confirmation] [--start-cursor <cursor>] [--batch-size <batch_size>]
 *
 */
#[tokio::main]
async fn main() {
    if let Err(e) = run().await {
        eprintln!("Error: {}", e);
        std::process::exit(1);
    }
}

async fn run() -> Result<(), Box<dyn std::error::Error>> {
    // parse args and env vars
    let args = Args::parse();
    let start_cursor = args.start_cursor;
    let batch_size = args.batch_size;

    let db_uri = std::env::var("CORE_DATABASE_URI").expect("CORE_DATABASE_URI must be set");
    let db_store_uri = std::env::var("DATABASES_STORE_DATABASE_URI")
        .expect("DATABASES_STORE_DATABASE_URI must be set");

    if !args.skip_confirmation {
        println!("Are you sure you want to backfill the tables gcs bucket and columns? (y/N)",);
        let mut input = String::new();
        std::io::stdin().read_line(&mut input).unwrap();
        if input.trim() != "y" {
            return Err(anyhow::anyhow!("Aborted").into());
        }
    }

    let store = PostgresStore::new(&db_uri).await?;
    let pool = store.raw_pool();

    let db_store = PostgresDatabasesStore::new(&db_store_uri).await?;

    // Loop on all tables in batches
    let mut next_cursor = start_cursor;

    // grab last id in data_sources_nodes
    let c = pool.get().await?;
    let last_id = c.query_one("SELECT MAX(id) FROM tables", &[]).await?;

    let last_id: i64 = last_id.get(0);
    println!("Last id in tables: {}", last_id);

    while next_cursor <= last_id {
        println!(
            "Processing {} tables, starting at id {}. ",
            batch_size, next_cursor
        );
        let next_id_cursor =
            process_tables_batch(&store, &db_store, next_cursor, batch_size as i64).await?;

        next_cursor = match next_id_cursor {
            Some(cursor) => cursor,
            None => {
                println!(
                    "No more nodes to process (last id: {}). \nBackfill complete.",
                    last_id
                );
                break;
            }
        };
    }

    Ok(())
}

async fn process_tables_batch(
    store: &PostgresStore,
    db_store: &PostgresDatabasesStore,
    id_cursor: i64,
    batch_size: i64,
) -> Result<Option<i64>, Box<dyn std::error::Error>> {
    let c = store.raw_pool().get().await?;

    let rows = c
        .query(
            "
            SELECT t.id, t.table_id, t.schema, ds.project, ds.data_source_id
                FROM tables t
                INNER JOIN data_sources ds ON ds.id = t.data_source
                WHERE has_file IS NULL AND remote_database_table_id IS NULL
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
            let id: i64 = table.get("id");
            let table_id: String = table.get("table_id");
            let schema: Option<String> = table.get("schema");
            let project: i64 = table.get("project");
            let data_source_id: String = table.get("data_source_id");

            (
                id,
                table_id,
                schema,
                Project::new_from_id(project),
                data_source_id,
            )
        })
        .collect::<Vec<_>>();

    let mut last_table_id = -1;
    for (id, table_id, schema, project, data_source_id) in tables {
        println!("Processing table with id: {}, table_id: {}", id, table_id);

        process_one_table(
            &store,
            &db_store,
            id,
            &table_id,
            &schema,
            &project,
            &data_source_id,
        )
        .await?;

        last_table_id = id;
    }

    match last_table_id {
        id if id < 0 => Ok(None),
        id => Ok(Some(id)),
    }
}

async fn process_one_table(
    store: &PostgresStore,
    db_store: &PostgresDatabasesStore,
    id: i64,
    table_id: &str,
    schema: &Option<String>,
    project: &Project,
    data_source_id: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let unique_table_id = get_table_unique_id(&project, &data_source_id, &table_id);

    println!("**** Unique table id: {}", unique_table_id);

    let (rows, _count) = db_store.list_table_rows(&unique_table_id, None).await?;
    rows.into_iter().for_each(|row| {
        println!("Row: {:?}", row);
    });

    // store
    //     .upsert_data_source_table_csv(&project, &data_source_id, &table_id, &schema, &rows)
    //     .await?;

    // Set has_file = true to mark that this table has been processed
    store
        .raw_pool()
        .get()
        .await?
        .execute("UPDATE tables SET has_file = TRUE WHERE id = $1", &[&id])
        .await?;

    Ok(())
}
