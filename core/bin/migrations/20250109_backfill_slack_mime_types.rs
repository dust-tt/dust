use anyhow::{anyhow, Result};
use clap::Parser;
use dust::stores::{postgres, store};

#[derive(Parser, Debug)]
struct Args {
    #[arg(long, default_value = "512")]
    batch_size: i64,

    #[arg(long)]
    node_type: NodeType,
}

#[derive(Clone, Copy, Debug)]
enum NodeType {
    Thread,
    Messages,
}

impl std::str::FromStr for NodeType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "thread" => Ok(NodeType::Thread),
            "messages" => Ok(NodeType::Messages),
            _ => Err(format!("Unknown node type: {}", s)),
        }
    }
}

async fn backfill_mime_types(
    pool: &bb8::Pool<bb8_postgres::PostgresConnectionManager<tokio_postgres::NoTls>>,
    batch_size: i64,
    sub_type: &str,
) -> Result<bool> {
    let c = pool.get().await?;

    let pattern = format!("^slack-[A-Z0-9]+-{}-[0-9.\\-]+$", sub_type);
    let mime_type = format!("application/vnd.dust.slack.{}", sub_type);

    let mut processed = 0;
    let mut last_id = 0;

    loop {
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

        println!("Processed {} nodes", processed);
    }

    Ok(true)
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();
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
            backfill_mime_types(pool, batch_size, "thread").await?;
        }
        NodeType::Messages => {
            backfill_mime_types(pool, batch_size, "messages").await?;
        }
    }

    Ok(())
}
