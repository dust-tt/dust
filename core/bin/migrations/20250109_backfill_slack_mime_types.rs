use anyhow::{anyhow, Result};
use clap::Parser;
use dust::stores::{postgres, store};

#[derive(Parser, Debug)]
struct Args {
    #[arg(long, default_value = "false")]
    execute: bool,

    #[arg(long, default_value = "512")]
    batch_size: i64,

    #[arg(long, default_value)]
    node_type: NodeType,
}

#[derive(Clone, Copy, Debug)]
enum NodeType {
    Thread,
    Messages,
}

async fn backfill_mime_types(
    pool: &bb8::Pool<bb8_postgres::PostgresConnectionManager<tokio_postgres::NoTls>>,
    batch_size: i64,
    execute: bool,
    sub_type: &str,
) -> Result<bool> {
    let c = pool.get().await?;

    let pattern = format!("^slack-[A-Z0-9]+-{}-[0-9.\\-]+$", sub_type);
    let mime_type = format!("application/vnd.dust.slack.{}", sub_type);

    // Get total count first
    let total_count: i64 = c
        .query_one(
            "SELECT COUNT(id) FROM data_sources_nodes WHERE node_id ~ $1",
            &[&pattern],
        )
        .await?
        .get(0);

    let mut processed = 0;
    let mut last_id = 0;

    while processed < total_count {
        if execute {
            let updated_ids = c
                .query(
                    "WITH to_update AS (
                        SELECT id
                        FROM data_sources_nodes
                        WHERE node_id ~ $1
                        AND id > $2
                        ORDER BY id
                        LIMIT $3
                    )
                    UPDATE data_sources_nodes n
                    SET mime_type = $4
                    FROM to_update u
                    WHERE n.id = u.id
                    RETURNING n.id",
                    &[&pattern, &last_id, &batch_size, &mime_type],
                )
                .await?;

            if updated_ids.is_empty() {
                break;
            }

            let rows_updated = updated_ids.len() as i64;
            last_id = updated_ids.last().unwrap().get(0);
            processed += rows_updated;
        } else {
            processed += batch_size;
        }

        println!("Processed {}/{} nodes", processed, total_count);
    }

    Ok(true)
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();
    let execute = args.execute;
    let batch_size = args.batch_size;
    let node_type = args.node_type;

    let store: Box<dyn store::Store + Sync + Send> = match std::env::var("CORE_DATABASE_URI") {
        Ok(db_uri) => {
            let store = postgres::PostgresStore::new(&db_uri).await?;
            store.init().await?;
            Box::new(store)
        }
        Err(_) => Err(anyhow!("CORE_DATABASE_URI is required (postgres)"))?,
    };

    let pool = store.raw_pool();

    match node_type {
        NodeType::Thread => {
            backfill_mime_types(pool, batch_size, execute, "thread").await?;
        }
        NodeType::Messages => {
            backfill_mime_types(pool, batch_size, execute, "messages").await?;
        }
    }

    Ok(())
}
