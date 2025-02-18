use bb8::Pool;
use bb8_postgres::PostgresConnectionManager;
use clap::Parser;
use dust::{
    data_sources::node::{Node, NodeType, ProviderVisibility},
    search_stores::search_store::ElasticsearchSearchStore,
    stores::{postgres::PostgresStore, store::Store},
};
use elasticsearch::{http::request::JsonBody, indices::IndicesExistsParts, BulkParts};
use http::StatusCode;
use serde_json::json;
use tokio_postgres::NoTls;

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
    batch_size: usize,
}

/*
 * Backfills nodes index in Elasticsearch for core using the postgres table `data_sources_nodes`
 *
 * Usage:
 * cargo run --bin elasticsearch_backfill_index -- --index-version <version> [--skip-confirmation] [--start-cursor <cursor>] [--batch-size <batch_size>]
 *
 */
#[tokio::main]
async fn main() {
    if let Err(e) = run().await {
        eprintln!("Error: {}", e);
        std::process::exit(1);
    }
}

async fn list_data_source_nodes(
    pool: &Pool<PostgresConnectionManager<NoTls>>,
    id_cursor: i64,
    batch_size: i64,
) -> Result<Vec<(Node, i64, i64)>, Box<dyn std::error::Error>> {
    let c = pool.get().await?;

    let stmt = c
        .prepare(
            "SELECT dsn.timestamp, dsn.title, dsn.mime_type, dsn.provider_visibility, dsn.parents, dsn.node_id, dsn.document, dsn.\"table\", dsn.folder, dns.tags_array, ds.data_source_id, ds.internal_id, dsn.source_url, dsn.id \
               FROM data_sources_nodes dsn JOIN data_sources ds ON dsn.data_source = ds.id \
               WHERE dsn.id > $1 AND folder IS NOT NULL ORDER BY dsn.id ASC LIMIT $2",
        )
        .await?;
    let rows = c.query(&stmt, &[&id_cursor, &batch_size]).await?;

    let nodes: Vec<(Node, i64, i64)> = rows
        .iter()
        .map(|row| {
            let timestamp: i64 = row.get::<_, i64>(0);
            let title: String = row.get::<_, String>(1);
            let mime_type: String = row.get::<_, String>(2);
            let provider_visibility: Option<ProviderVisibility> =
                row.get::<_, Option<ProviderVisibility>>(3);
            let parents: Vec<String> = row.get::<_, Vec<String>>(4);
            let node_id: String = row.get::<_, String>(5);
            let document_row_id = row.get::<_, Option<i64>>(6);
            let table_row_id = row.get::<_, Option<i64>>(7);
            let folder_row_id = row.get::<_, Option<i64>>(8);
            let tags_array: Vec<String> = row.get::<_, Vec<String>>(9);
            let data_source_id: String = row.get::<_, String>(10);
            let data_source_internal_id: String = row.get::<_, String>(11);
            let (node_type, element_row_id) = match (document_row_id, table_row_id, folder_row_id) {
                (Some(id), None, None) => (NodeType::Document, id),
                (None, Some(id), None) => (NodeType::Table, id),
                (None, None, Some(id)) => (NodeType::Folder, id),
                _ => unreachable!(),
            };
            let source_url: Option<String> = row.get::<_, Option<String>>(11);
            let row_id = row.get::<_, i64>(12);
            (
                Node::new(
                    &data_source_id,
                    &data_source_internal_id,
                    &node_id,
                    node_type,
                    timestamp as u64,
                    &title,
                    &mime_type,
                    provider_visibility,
                    parents.get(1).cloned(),
                    parents,
                    source_url,
                    Some(tags_array),
                ),
                row_id,
                element_row_id,
            )
        })
        .collect::<Vec<_>>();
    Ok(nodes)
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
    // loop on all nodes in postgres using id as cursor, stopping when id is
    // greated than the last id in data_sources_nodes at start of backfill
    let mut next_cursor = start_cursor;

    // grab last id in data_sources_nodes
    let pool = store.raw_pool();
    let c = pool.get().await?;
    let last_id = c
        .query_one("SELECT MAX(id) FROM data_sources_nodes", &[])
        .await?;
    let last_id: i64 = last_id.get(0);
    println!("Last id in data_sources_nodes: {}", last_id);
    while next_cursor <= last_id {
        print!(
            "Processing {} nodes, starting at id {}. ",
            batch_size, next_cursor
        );
        let (nodes, next_id_cursor) = get_node_batch(pool, next_cursor, batch_size).await?;

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
        //
        let nodes_body: Vec<JsonBody<_>> = nodes
            .into_iter()
            .filter(|node| node.source_url.is_some())
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
    pool: &Pool<PostgresConnectionManager<NoTls>>,
    next_cursor: i64,
    batch_size: usize,
) -> Result<(Vec<Node>, Option<i64>), Box<dyn std::error::Error>> {
    let nodes = list_data_source_nodes(&pool, next_cursor, batch_size.try_into().unwrap()).await?;
    let last_node = nodes.last().cloned();
    let nodes_length = nodes.len();
    match last_node {
        Some((_, last_row_id, _)) => Ok((
            nodes.into_iter().map(|(node, _, _)| node).collect(),
            match nodes_length == batch_size {
                true => Some(last_row_id),
                false => None,
            },
        )),
        None => Ok((vec![], None)),
    }
}
