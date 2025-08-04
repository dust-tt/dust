use anyhow::Result;
use clap::Parser;
use dust::databases::table_upserts_background_worker::{
    REDIS_CLIENT, REDIS_TABLE_UPSERT_HASH_NAME,
};
use redis::AsyncCommands;
use std::collections::HashMap;
use tikv_jemallocator::Jemalloc;

#[global_allocator]
static GLOBAL: Jemalloc = Jemalloc;

#[derive(Parser, Debug)]
struct Args {
    #[arg(long, help = "Dump the redis queue")]
    dump_queue: bool,

    #[arg(long, help = "Redis queue item to remove")]
    remove_queue_item: Option<String>,
}

/*
 * This used to have logic to backfill GCS files, but all that is no longer relevant.
 * It also had logic to manage the Redis queue, which is all that remains. It could still be useful,
 * so keeping it around for now. The functionality is a complete mismatch with the file name, but that's ok.
 *
 * Usage:
 * cargo run --bin backfill_tables_gcs_files -- [--dump-queue] [--remove-queue-item <key>]
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

    if args.dump_queue {
        dump_queue().await?;
        return Ok(());
    }

    if let Some(key) = args.remove_queue_item {
        remove_queue_item(&key).await?;
        println!("Removed queue item: {}", key);
    }
    return Ok(());
}

async fn dump_queue() -> Result<()> {
    let mut redis_conn = REDIS_CLIENT.get_async_connection().await?;
    let all_values: HashMap<String, String> =
        redis_conn.hgetall(REDIS_TABLE_UPSERT_HASH_NAME).await?;

    for (key, value) in all_values {
        println!("{}: {}", key, value);
    }
    Ok(())
}

async fn remove_queue_item(key: &str) -> Result<(), Box<dyn std::error::Error>> {
    let mut redis_conn = REDIS_CLIENT.get_async_connection().await?;
    let _: () = redis_conn.hdel(REDIS_TABLE_UPSERT_HASH_NAME, key).await?;
    Ok(())
}
