use clap::Parser;
use dust::{
    data_sources::node::Node,
    search_stores::search_store::ElasticsearchSearchStore,
    stores::{postgres::PostgresStore, store::Store},
    utils::{self},
};
use elasticsearch::{http::request::JsonBody, indices::IndicesExistsParts, BulkParts};
use http::StatusCode;
use serde_json::json;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    #[arg(long, help = "The version of the index")]
    index_version: u32,

    #[arg(long, help = "Skip confirmation")]
    skip_confirmation: bool,

    #[arg(long, help = "The cursor to start from", default_value = "0")]
    start_cursor: i64,

    #[arg(long, help = "The batch size", default_value = "100")]
    batch_size: i64,
}

/*
 * Backfills nodes index in Elasticsearch for core using the postgres table `data_sources_nodes`
 *
 * Usage:
 * cargo run --bin elasticsearch_backfill_nodes_index -- --index-version <version> [--skip-confirmation] [--start-cursor <cursor>] [--batch-size <batch_size>]
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
    let index_name = "data_sources_nodes";
    let index_version = args.index_version;
    let batch_size = args.batch_size;
    let start_cursor = args.start_cursor;

    let url = std::env::var("ELASTICSEARCH_URL").expect("ELASTICSEARCH_URL must be set");
    let username =
        std::env::var("ELASTICSEARCH_USERNAME").expect("ELASTICSEARCH_USERNAME must be set");
    let password =
        std::env::var("ELASTICSEARCH_PASSWORD").expect("ELASTICSEARCH_PASSWORD must be set");

    let region = std::env::var("DUST_REGION").expect("DUST_REGION must be set");

    // create ES client
    let search_store = ElasticsearchSearchStore::new(&url, &username, &password).await?;

    let index_fullname = format!("core.{}_{}", index_name, index_version);

    // err if index does not exist
    let response = search_store
        .client
        .indices()
        .exists(IndicesExistsParts::Index(&[index_fullname.as_str()]))
        .send()
        .await?;

    if response.status_code() != StatusCode::OK {
        return Err(anyhow::anyhow!("Index does not exist").into());
    }

    if !args.skip_confirmation {
        println!(
            "Are you sure you want to backfill the index {} in region {}? (y/N)",
            index_fullname, region
        );
        let mut input = String::new();
        std::io::stdin().read_line(&mut input).unwrap();
        if input.trim() != "y" {
            return Err(anyhow::anyhow!("Aborted").into());
        }
    }

    let db_uri = std::env::var("CORE_DATABASE_READ_REPLICA_URI")
        .expect("CORE_DATABASE_READ_REPLICA_URI must be set");
    let store = PostgresStore::new(&db_uri).await?;
    // loop on all nodes in postgres using id as cursor, stopping when timestamp
    // is greater than now
    let mut next_cursor = start_cursor;
    let now = utils::now();
    loop {
        print!(
            "Processing {} nodes, starting at id {}. ",
            batch_size, next_cursor
        );
        let (nodes, cursor) =
            get_node_batch(next_cursor, batch_size, Box::new(store.clone())).await?;
        if nodes.is_empty() || nodes.first().unwrap().timestamp > now {
            println!("No nodes left. \nBackfill complete.");
            break;
        }
        next_cursor = cursor;

        //
        let nodes_body: Vec<JsonBody<_>> = nodes
            .into_iter()
            .flat_map(|node| {
                [
                    json!({"index": {"_id": node.unique_id()}}).into(),
                    json!(node).into(),
                ]
            })
            .collect();
        search_store
            .client
            .bulk(BulkParts::Index(index_fullname.as_str()))
            .body(nodes_body)
            .send()
            .await?;
        match response.status_code() {
            StatusCode::OK => println!("Succeeded."),
            _ => {
                let body = response.json::<serde_json::Value>().await?;
                eprintln!("\n{:?}", body);
                return Err(anyhow::anyhow!("Failed to insert nodes").into());
            }
        }
    }

    Ok(())
}

async fn get_node_batch(
    next_cursor: i64,
    batch_size: i64,
    store: Box<dyn Store + Sync + Send>,
) -> Result<(Vec<Node>, i64), Box<dyn std::error::Error>> {
    let nodes = store
        .list_data_source_nodes(next_cursor, batch_size)
        .await?;
    let last_node = nodes.last().cloned();
    match last_node {
        Some((_, last_row_id, _)) => Ok((
            nodes.into_iter().map(|(node, _, _)| node).collect(),
            last_row_id,
        )),
        None => Ok((vec![], 0)),
    }
}
