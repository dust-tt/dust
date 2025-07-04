use clap::Parser;
use dust::{
    databases::{table::Table, table_schema::TableSchema},
    databases_store::{
        gcs::GoogleCloudStorageDatabasesStore, postgres::PostgresDatabasesStore,
        store::DatabasesStore,
    },
    project::Project,
    stores::{postgres::PostgresStore, store::Store},
};
use futures::future::try_join_all;

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
    let gcs_store = GoogleCloudStorageDatabasesStore::new();

    // Loop on all tables in batches
    let mut next_cursor = start_cursor;

    // grab last id in data_sources_nodes
    let c = pool.get().await?;
    let last_id = c.query_one("SELECT MAX(id) FROM tables", &[]).await?;

    let last_id: i64 = last_id.get(0);
    println!("Last id in tables: {}", last_id);

    while next_cursor <= last_id {
        println!(
            "Processing up to {} tables, starting at id {}. ",
            batch_size, next_cursor
        );
        let next_id_cursor = process_tables_batch(
            &store,
            &db_store,
            &gcs_store,
            next_cursor,
            batch_size as i64,
        )
        .await?;

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
        println!("Processed up to id: {}", next_cursor);
    }

    Ok(())
}

async fn process_tables_batch(
    store: &PostgresStore,
    db_store: &PostgresDatabasesStore,
    gcs_store: &GoogleCloudStorageDatabasesStore,
    id_cursor: i64,
    batch_size: i64,
) -> Result<Option<i64>, Box<dyn std::error::Error>> {
    let c = store.raw_pool().get().await?;

    let rows = c
        .query(
            "
            SELECT t.id, t.table_id, t.schema, t.timestamp, ds.project, ds.data_source_id
                FROM tables t
                INNER JOIN data_sources ds ON ds.id = t.data_source
                WHERE NOT migrated_to_csv AND remote_database_table_id IS NULL
                    AND t.id > $1
                ORDER BY t.id ASC
                LIMIT $2
            ",
            &[&id_cursor, &batch_size],
        )
        .await?;

    let tables = rows
        .iter()
        .map(|table| -> (i64, Table) {
            let id: i64 = table.get("id");
            let table_id: String = table.get("table_id");
            let schema: Option<String> = table.get("schema");
            let timestamp: i64 = table.get("timestamp");
            let project: i64 = table.get("project");
            let data_source_id: String = table.get("data_source_id");

            let table_schema = schema.as_ref().and_then(|s| serde_json::from_str(s).ok());

            (
                id,
                // We need to Table instance, but only care about a few specific fields
                Table::new(
                    Project::new_from_id(project),
                    data_source_id,
                    "".to_owned(),
                    0,
                    table_id,
                    "".to_owned(),
                    "".to_owned(),
                    timestamp as u64,
                    "".to_owned(),
                    "".to_owned(),
                    None,
                    vec![],
                    None,
                    vec![],
                    None,
                    table_schema,
                    None,
                    false,
                    None,
                    None,
                ),
            )
        })
        .collect::<Vec<_>>();

    if tables.is_empty() {
        return Ok(None);
    }

    let futures = tables.into_iter().map(|(id, table)| {
        let db_store = db_store.clone();
        async move {
            match process_one_table(&store, &db_store, &gcs_store, table).await {
                Ok(_) => Ok(id),
                Err(e) => Err(e),
            }
        }
    });

    let results = try_join_all(futures).await?;

    // Return the id of the last processed table
    Ok(results.into_iter().last())
}

async fn process_one_table(
    store: &PostgresStore,
    db_store: &PostgresDatabasesStore,
    gcs_store: &GoogleCloudStorageDatabasesStore,
    table: Table,
) -> Result<(), Box<dyn std::error::Error>> {
    // let unique_table_id = get_table_unique_id(&project, &data_source_id, &table_id);

    println!("**** Process table: {}", table.unique_id());

    let (rows, _count) = db_store.list_table_rows(&table, None).await?;

    let mut table_schema: Option<TableSchema> = None;

    if rows.len() > 0 {
        // If there are rows, we can create a schema from them
        table_schema = Some(TableSchema::from_rows_async(std::sync::Arc::new(rows.clone())).await?);
    } else if !table.schema_cached().is_none() {
        // If there are no rows, but the DB has a cached schema, use that
        table_schema = Some(table.schema_cached().unwrap().clone());
    }

    if let Some(ref schema) = table_schema {
        gcs_store
            .batch_upsert_table_rows(&table, schema, &rows, true)
            .await?;
    }

    store
        .set_data_source_table_migrated_to_csv(
            &table.project(),
            &table.data_source_id(),
            &table.table_id(),
            true,
        )
        .await?;
    Ok(())
}
