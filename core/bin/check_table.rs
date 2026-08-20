use anyhow::{anyhow, Result};
use clap::Parser;
use dust::{
    databases::{database::SqlDialect, remote_databases::remote_database::get_remote_database},
    project::Project,
    stores::{postgres, store},
};
use tracing::debug;

#[derive(Parser)]
#[command(
    author,
    version,
    about = "Check remote database table connectivity and schema"
)]
struct Args {
    #[arg(long)]
    table_id: String,

    #[arg(long)]
    project_id: i64,

    #[arg(long)]
    data_source_id: String,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();

    let args = Args::parse();

    let project = Project::new_from_id(args.project_id);

    let store: Box<dyn store::Store + Sync + Send> = match std::env::var("CORE_DATABASE_URI") {
        Ok(db_uri) => {
            let store = postgres::PostgresStore::new(&db_uri).await?;
            Box::new(store)
        }
        Err(_) => {
            return Err(anyhow!("CORE_DATABASE_URI is required (postgres)"));
        }
    };

    println!("Loading table: {}", args.table_id);
    let table = store
        .load_data_source_table(&project, &args.data_source_id, &args.table_id)
        .await?;

    match table {
        None => {
            return Err(anyhow!(
                "Table not found: {} in data source {}",
                args.table_id,
                args.data_source_id
            ));
        }
        Some(table) => {
            println!("Table found: {}", table.name());

            let remote_database_secret_id = table
                .remote_database_secret_id()
                .ok_or_else(|| anyhow!("Table is not from a remote database"))?;

            let remote_database_table_id = table
                .remote_database_table_id()
                .ok_or_else(|| anyhow!("Table is missing remote database table ID"))?;

            println!("Remote database table ID: {}", remote_database_table_id);
            println!("Remote database secret ID: {}", remote_database_secret_id);

            println!("\nInstantiating remote database connection...");
            debug!(
                "About to call get_remote_database with secret_id: {}",
                remote_database_secret_id
            );
            let start_time = std::time::Instant::now();
            let remote_db = match get_remote_database(remote_database_secret_id).await {
                Ok(db) => {
                    debug!(
                        "Successfully created remote database connection in {:?}",
                        start_time.elapsed()
                    );
                    db
                }
                Err(e) => {
                    debug!(
                        "Failed to create remote database connection after {:?}: {:?}",
                        start_time.elapsed(),
                        e
                    );
                    return Err(e.into());
                }
            };

            let dialect_name = match remote_db.dialect() {
                SqlDialect::DustSqlite => "DustSqlite",
                SqlDialect::Snowflake => "Snowflake",
                SqlDialect::Bigquery => "BigQuery",
                SqlDialect::Databricks => "Databricks",
            };
            println!("SQL Dialect: {}", dialect_name);

            println!("\nGetting table schema...");
            let schemas = remote_db
                .get_tables_schema(&vec![remote_database_table_id])
                .await?;

            if let Some(Some(schema)) = schemas.first() {
                println!("Schema retrieved successfully:");
                println!("  Columns: {}", schema.columns().len());
                for column in schema.columns() {
                    println!("    - {} ({:?})", column.name, column.value_type);
                }
            } else {
                println!("Warning: Could not retrieve schema for table");
            }

            println!("\nExecuting test query (SELECT 1)...");
            match remote_db
                .authorize_and_execute_query(&vec![table], "SELECT 1")
                .await
            {
                Ok((results, _schema, _normalized_query)) => {
                    println!("✓ Query executed successfully!");
                    if let Some(first_result) = results.first() {
                        println!("  Result: {:?}", first_result.value);
                    }
                }
                Err(e) => {
                    println!("✗ Query failed: {:?}", e);
                    return Err(anyhow!("Failed to execute test query: {:?}", e));
                }
            }

            println!("\n✓ All checks passed!");
        }
    }

    Ok(())
}
