use chrono::Timelike;
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
use std::collections::HashMap;

#[derive(Parser, Debug)]
struct Args {
    #[arg(long, help = "Skip confirmation")]
    skip_confirmation: bool,

    #[arg(long, help = "The cursor to start from", default_value = "0")]
    start_cursor: i64,

    #[arg(long, help = "The batch size", default_value = "100")]
    batch_size: usize,

    #[arg(long, help = "The projects to filter by (comma-separated, optional)")]
    projects: Option<String>,

    #[arg(long, help = "Verify migrated tables instead of migrating data")]
    verify: bool,
}

/*
 * Backfills the creation of csv files in GCS for each entry in the Tables table
 *
 * Usage:
 * cargo run --bin backfill_tables_gcs_files -- [--skip-confirmation] [--start-cursor <cursor>] [--batch-size <batch_size>] [--projects <project_ids>]
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

    let store = PostgresStore::new(&db_uri).await?;
    let pool = store.raw_pool();

    let db_store = PostgresDatabasesStore::new(&db_store_uri).await?;
    let gcs_store = GoogleCloudStorageDatabasesStore::new();

    let project_filter = args.projects.map(|p| {
        p.split(',')
            .filter_map(|s| s.trim().parse::<i64>().ok())
            .collect::<Vec<_>>()
    });

    if args.verify {
        println!("Verifying migrated tables...");
        verify_all_tables(
            &store,
            &db_store,
            start_cursor,
            project_filter.clone(),
            batch_size,
        )
        .await?;
        return Ok(());
    }

    if !args.skip_confirmation {
        println!("Are you sure you want to backfill the tables gcs bucket and columns? (y/N)",);
        let mut input = String::new();
        std::io::stdin().read_line(&mut input).unwrap();
        if input.trim() != "y" {
            return Err(anyhow::anyhow!("Aborted").into());
        }
    }

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
            project_filter.clone(),
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
    project_filter: Option<Vec<i64>>,
) -> Result<Option<i64>, Box<dyn std::error::Error>> {
    let c = store.raw_pool().get().await?;

    let query = "
        SELECT t.id, t.table_id, t.schema, t.timestamp, ds.project, ds.data_source_id
            FROM tables t
            INNER JOIN data_sources ds ON ds.id = t.data_source
            WHERE NOT migrated_to_csv AND remote_database_table_id IS NULL
                AND t.id > $1
                ";

    let query = if let Some(_) = project_filter {
        format!(
            "{} AND ds.project = ANY($3) ORDER BY t.id ASC LIMIT $2",
            query
        )
    } else {
        format!("{} ORDER BY t.id ASC LIMIT $2", query)
    };

    let rows = if let Some(projects) = project_filter {
        c.query(&query, &[&id_cursor, &batch_size, &projects])
            .await?
    } else {
        c.query(&query, &[&id_cursor, &batch_size]).await?
    };

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
                // We need a Table instance, but only care about a few specific fields
                create_table(
                    project,
                    data_source_id,
                    table_id,
                    timestamp as u64,
                    table_schema,
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
    } else if let Some(cached_schema) = table.schema_cached() {
        // If there are no rows, but the DB has a cached schema, use that
        table_schema = Some(cached_schema.clone());
    }

    // If we got neither rows nor schema, we don't create any CSV (but we still set the migrated flag)
    if let Some(ref schema) = table_schema {
        gcs_store
            .batch_upsert_table_rows(&table, schema, &rows, true)
            .await?;
    }

    // Set the migrated flag. We pass in the current timestamp, to make sure the bit is only
    // set if the time has not changed. If it changed, we still would have saved the data, but
    // since the bit is not updated, we'll do it again next time (i.e. the csv is a dead file).
    store
        .set_data_source_table_migrated_to_csv(
            &table.project(),
            &table.data_source_id(),
            &table.table_id(),
            true,
            Some(table.timestamp() as i64),
        )
        .await?;
    Ok(())
}

async fn verify_all_tables(
    store: &PostgresStore,
    db_store: &PostgresDatabasesStore,
    start_cursor: i64,
    project_filter: Option<Vec<i64>>,
    batch_size: usize,
) -> Result<(), Box<dyn std::error::Error>> {
    let c = store.raw_pool().get().await?;
    let base_query = "
        SELECT t.id, t.table_id, t.schema, t.timestamp, ds.project, ds.data_source_id
        FROM tables t
        INNER JOIN data_sources ds ON ds.id = t.data_source
        WHERE migrated_to_csv = TRUE AND t.id > $1
    ";
    let mut next_cursor = start_cursor;
    loop {
        let query = if let Some(_) = &project_filter {
            format!(
                "{} AND ds.project = ANY($3) ORDER BY t.id ASC LIMIT $2",
                base_query
            )
        } else {
            format!("{} ORDER BY t.id ASC LIMIT $2", base_query)
        };
        let rows = if let Some(projects) = &project_filter {
            c.query(&query, &[&next_cursor, &(batch_size as i64), projects])
                .await?
        } else {
            c.query(&query, &[&next_cursor, &(batch_size as i64)])
                .await?
        };
        if rows.is_empty() {
            break;
        }
        let mut futures = vec![];
        let mut last_id = next_cursor;
        for row in &rows {
            let table_id: String = row.get("table_id");
            let schema: Option<String> = row.get("schema");
            let project: i64 = row.get("project");
            let data_source_id: String = row.get("data_source_id");
            let id: i64 = row.get("id");
            let table_schema = schema.as_ref().and_then(|s| serde_json::from_str(s).ok());
            let table = create_table(
                project,
                data_source_id.clone(),
                table_id.clone(),
                0,
                table_schema,
            );
            // Move all values into the async block to avoid borrow checker issues
            let db_store = db_store.clone();
            futures.push(async move { verify_table(&table, &db_store).await });
            if id > last_id {
                last_id = id;
            }
        }
        let results = futures::future::join_all(futures).await;
        for (i, result) in results.into_iter().enumerate() {
            let row = &rows[i];
            let table_id: String = row.get("table_id");
            let id: i64 = row.get("id");
            let project: i64 = row.get("project");
            let data_source_id: String = row.get("data_source_id");
            match result {
                Ok(_) => {
                    // println!(
                    //     "{}: {},{},{}: PASSED",
                    //     id, project, data_source_id, table_id
                    // );
                }
                Err(e) => {
                    println!(
                        "{}: {},{},{}: ERROR: {}",
                        id, project, data_source_id, table_id, e
                    );
                }
            }
        }
        next_cursor = last_id;
        println!("Processed up to id: {}. ", next_cursor);
    }
    Ok(())
}

fn normalize_field(s: &str) -> String {
    if let Ok(datetime) = chrono::NaiveDateTime::parse_from_str(s.trim(), "%Y-%m-%d %H:%M:%S") {
        // If the time is exactly zero, return only the date part
        if datetime.time().num_seconds_from_midnight() == 0 {
            return datetime.date().format("%Y-%m-%d").to_string();
        }
    }
    return s.to_string();
}

async fn verify_table(table: &Table, db_store: &PostgresDatabasesStore) -> Result<(), String> {
    let field_names = match table.schema_cached() {
        Some(schema) => schema
            .columns()
            .iter()
            .map(|c| c.name.clone())
            .collect::<Vec<_>>(),
        None => Vec::new(),
    };
    let (pg_rows, _) = db_store
        .list_table_rows(table, None)
        .await
        .map_err(|e| format!("Error listing Postgres rows: {}", e))?;
    let gcs_rows = GoogleCloudStorageDatabasesStore::get_rows_from_csv(table)
        .await
        .map_err(|e| format!("Error listing GCS rows: {}", e))?;

    if pg_rows.len() != gcs_rows.len() {
        return Err(format!(
            "Row count: Postgres has {}, GCS has {}",
            pg_rows.len(),
            gcs_rows.len()
        ));
    }

    let pg_map: HashMap<_, _> = pg_rows.iter().map(|r| (r.row_id(), r)).collect();
    let gcs_map: HashMap<_, _> = gcs_rows.iter().map(|r| (r.row_id(), r)).collect();

    for (row_id, pg_row) in &pg_map {
        match gcs_map.get(row_id) {
            Some(gcs_row) => {
                let pg_fields = pg_row.to_csv_record(&field_names).unwrap();
                let gcs_fields = gcs_row.to_csv_record(&field_names).unwrap();
                for (i, field_name) in field_names.iter().enumerate() {
                    let pg_value = pg_fields.get(i).unwrap();
                    let gcs_value = gcs_fields.get(i).unwrap();
                    if normalize_field(pg_value) != normalize_field(gcs_value) {
                        return Err(format!(
                            "Row_id {} field '{}' mismatch: Postgres: '{}', GCS: '{}'",
                            row_id, field_name, pg_value, gcs_value
                        ));
                    }
                }
            }
            None => {
                return Err(format!(
                    "Row_id {} present in Postgres but missing in GCS",
                    row_id
                ));
            }
        }
    }

    for row_id in gcs_map.keys() {
        if !pg_map.contains_key(row_id) {
            return Err(format!(
                "Row_id {} present in GCS but missing in Postgres",
                row_id
            ));
        }
    }

    Ok(())
}

fn create_table(
    project_id: i64,
    data_source_id: String,
    table_id: String,
    timestamp: u64,
    schema: Option<TableSchema>,
) -> Table {
    Table::new(
        Project::new_from_id(project_id),
        data_source_id,
        "".to_owned(),
        0,
        table_id,
        "".to_owned(),
        "".to_owned(),
        timestamp,
        "".to_owned(),
        "".to_owned(),
        None,
        vec![],
        None,
        vec![],
        None,
        schema,
        None,
        false,
        None,
        None,
    )
}
