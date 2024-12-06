use std::collections::HashMap;

use elasticsearch::auth::Credentials;
use elasticsearch::http::transport::{SingleNodeConnectionPool, TransportBuilder};
use elasticsearch::indices::{IndicesCreateParts, IndicesExistsParts};
use elasticsearch::Elasticsearch;
use url::Url;

/*
 * Create an index in Elasticsearch
 *
 * Usage:
 * cargo run --bin create_index -- <index-name> <version>
 *
 * Will look for index settings and mappings in migrations/elasticsearch/indices/[index_name]_[version].settings.[region].json
 */
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // get args
    let args = std::env::args().collect::<Vec<String>>();
    let index_name = args[1].clone();
    let version = args[2].clone();
    let region = args[3].clone();

    let url = std::env::var("ELASTICSEARCH_URL").expect("ELASTICSEARCH_URL must be set");

    let username =
        std::env::var("ELASTICSEARCH_USERNAME").expect("ELASTICSEARCH_USERNAME must be set");
    let password =
        std::env::var("ELASTICSEARCH_PASSWORD").expect("ELASTICSEARCH_PASSWORD must be set");
    let region = std::env::var("DUST_REGION").expect("DUST_REGION must be set");

    let credentials = Credentials::Basic(username, password);

    let u = Url::parse(&url)?;
    let conn_pool = SingleNodeConnectionPool::new(u);
    let mut transport_builder = TransportBuilder::new(conn_pool);
    transport_builder = transport_builder.auth(credentials);
    let transport = transport_builder.build()?;

    let client = Elasticsearch::new(transport);

    // get index settings and mappings, parse them as json
    let settings_path = format!(
        "bin/migrations/elasticsearch/indices/{}_{}.settings.{}.json",
        index_name, version, region
    );
    let mappings_path = format!(
        "bin/migrations/elasticsearch/indices/{}_{}.mappings.json",
        index_name, version, region
    );

    let settings = std::fs::read_to_string(settings_path)?;
    let mappings = std::fs::read_to_string(mappings_path)?;

    let settings: HashMap<String, serde_json::Value> = serde_json::from_str(&settings)?;
    let mappings: HashMap<String, serde_json::Value> = serde_json::from_str(&mappings)?;

    let alias = format!("{}_{}", index_name, version);

    let body = serde_json::json!({
        "settings": settings,
        "mappings": mappings,
        "aliases": {
            alias: {}
        }
    });

    // check if index exists
    let response = client
        .indices()
        .exists(IndicesExistsParts::Index(&[index_name.as_str()]))
        .send()
        .await?;

    if response.status_code() == 200 {
        println!("Index already exists");
        return Ok(());
    }

    // create index with settings, mappings and alias
    let response = client
        .indices()
        .create(IndicesCreateParts::Index(index_name.as_str()))
        .body(body)
        .send()
        .await?;

    println!("{:?}", response);
    Ok(())
}
