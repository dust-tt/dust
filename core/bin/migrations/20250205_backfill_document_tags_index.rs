use bb8::Pool;
use bb8_postgres::PostgresConnectionManager;
use clap::Parser;
use dust::{
    search_stores::search_store::ElasticsearchSearchStore,
    stores::{postgres::PostgresStore, store::Store},
};
use elasticsearch::{http::request::JsonBody, indices::IndicesExistsParts, BulkParts};
use http::StatusCode;
use serde_json::json;
use tokio_postgres::NoTls;

#[derive(Clone, Copy, Debug, clap::ValueEnum)]
enum NodeType {
    Document,
    Table,
}

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

    #[arg(long, help = "The type of query to run", default_value = "document")]
    query_type: NodeType,
}

/*
 * Backfills tags for documents in Elasticsearch using the postgres table `data_sources_documents` and `tables`
 *
 * Usage:
 * cargo run --bin elasticsearch_backfill_document_tags_index -- --index-version <version> [--skip-confirmation] [--start-cursor <cursor>] [--batch-size <batch_size>]
 *
 */
#[tokio::main]
async fn main() {
    if let Err(e) = run().await {
        eprintln!("Error: {}", e);
        std::process::exit(1);
    }
}

async fn list_data_source_documents(
    pool: &Pool<PostgresConnectionManager<NoTls>>,
    id_cursor: i64,
    batch_size: i64,
    query_type: NodeType,
) -> Result<Vec<(i64, String, Vec<String>, String, String)>, Box<dyn std::error::Error>> {
    let c = pool.get().await?;

    let q = match query_type {
        NodeType::Document => {
            "SELECT dsd.id,dsd.document_id, dsd.tags_array, ds.data_source_id, ds.internal_id \
            FROM data_sources_documents dsd JOIN data_sources ds ON dsd.data_source = ds.id \
            WHERE dsd.id > $1 ORDER BY dsd.id ASC LIMIT $2"
        }
        NodeType::Table => {
            "SELECT t.id,t.table_id, t.tags_array, ds.data_source_id, ds.internal_id \
            FROM tables t JOIN data_sources ds ON t.data_source = ds.id \
            WHERE t.id > $1 ORDER BY t.id ASC LIMIT $2"
        }
    };

    let stmt = c.prepare(q).await?;
    let rows = c.query(&stmt, &[&id_cursor, &batch_size]).await?;

    let nodes: Vec<(i64, String, Vec<String>, String, String)> = rows
        .iter()
        .map(|row| {
            let id: i64 = row.get::<_, i64>(0);
            let document_id: String = row.get::<_, String>(1);
            let tags: Vec<String> = row.get::<_, Vec<String>>(2);
            let ds_id: String = row.get::<_, String>(3);
            let ds_internal_id: String = row.get::<_, String>(4);
            (id, document_id, tags, ds_id, ds_internal_id)
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
    let query_type = args.query_type;

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
        .query_one("SELECT MAX(id) FROM data_sources_documents", &[])
        .await?;
    let last_id: i64 = last_id.get(0);
    println!("Last id in data_sources_nodes: {}", last_id);
    while next_cursor <= last_id {
        println!(
            "Processing {} nodes, starting at id {}. ",
            batch_size, next_cursor
        );
        let (nodes, next_id_cursor) =
            get_node_batch(pool, next_cursor, batch_size, query_type).await?;

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

        let nodes_values: Vec<_> = nodes
            .into_iter()
            .filter(|node| node.2.len() > 0)
            .flat_map(|node| {
                [
                    json!({"update": {"_id": format!("{}__{}", node.4, node.1) }}),
                    json!({"doc": {"tags": node.2}}),
                ]
            })
            .collect();

        let nodes_body: Vec<JsonBody<_>> = nodes_values.into_iter().map(|v| v.into()).collect();

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
    query_type: NodeType,
) -> Result<
    (Vec<(i64, String, Vec<String>, String, String)>, Option<i64>),
    Box<dyn std::error::Error>,
> {
    let nodes = list_data_source_documents(
        &pool,
        next_cursor,
        batch_size.try_into().unwrap(),
        query_type,
    )
    .await?;
    let last_node = nodes.last().cloned();
    let nodes_length = nodes.len();
    match last_node {
        Some((last_row_id, _, _, _, _)) => Ok((
            nodes,
            match nodes_length == batch_size {
                true => Some(last_row_id),
                false => None,
            },
        )),
        None => Ok((vec![], None)),
    }
}
