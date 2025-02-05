use std::collections::HashMap;

use clap::Parser;
use dust::search_stores::search_store::ElasticsearchSearchStore;
use elasticsearch::indices::{IndicesCreateParts, IndicesExistsParts};
use http::StatusCode;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    #[arg(long, help = "The index name (without the version)")]
    index_name: String,

    #[arg(long, help = "The version of the index")]
    index_version: u32,

    #[arg(long, help = "Skip confirmation")]
    skip_confirmation: bool,

    #[arg(long, help = "Remove previous alias")]
    remove_previous_alias: bool,
}

/*
 * Create an index in Elasticsearch for core
 *
 * Usage:
 * cargo run --bin create_index -- --index-name <index_name> --index-version <version> [--skip-confirmation] [--remove-previous-alias]
 *
 * Look for index settings and mappings in src/search_stores/indices/[index_name]_[version].settings.[region].json
 * Create the index with the given settings and mappings at [index_name]_[version], and set the alias to [index_name]
 */
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // parse args and env vars
    let args = Args::parse();
    let index_name = args.index_name;
    let index_version = args.index_version;
    let remove_previous_alias = args.remove_previous_alias;

    if remove_previous_alias && index_version == 1 {
        return Err(anyhow::anyhow!("Cannot remove previous alias for version 1").into());
    }
    let index_fullname = format!("core.{}_{}", index_name, index_version);
    let index_alias = format!("core.{}", index_name);
    let index_previous_fullname = format!("core.{}_{}", index_name, index_version - 1);

    let url = std::env::var("ELASTICSEARCH_URL").expect("ELASTICSEARCH_URL must be set");
    let username =
        std::env::var("ELASTICSEARCH_USERNAME").expect("ELASTICSEARCH_USERNAME must be set");
    let password =
        std::env::var("ELASTICSEARCH_PASSWORD").expect("ELASTICSEARCH_PASSWORD must be set");

    let region = match std::env::var("NODE_ENV").unwrap_or_default().as_str() {
        "development" => "local".to_string(),
        _ => std::env::var("DUST_REGION").expect("DUST_REGION must be set"),
    };

    // create ES client
    let search_store = ElasticsearchSearchStore::new(&url, &username, &password).await?;

    // do not create index if it already exists
    let response = search_store
        .client
        .indices()
        .exists(IndicesExistsParts::Index(&[index_fullname.as_str()]))
        .send()
        .await?;

    if response.status_code() == StatusCode::OK {
        return Err(anyhow::anyhow!("Index already exists").into());
    }

    // get index settings and mappings, parse them as json
    let settings_path = format!(
        "src/search_stores/indices/{}_{}.settings.{}.json",
        index_name,
        index_version,
        region.to_string().to_lowercase()
    );
    let mappings_path = format!(
        "src/search_stores/indices/{}_{}.mappings.json",
        index_name, index_version
    );

    // catch errors, provide the error message
    let settings_raw = std::fs::read_to_string(&settings_path).expect(&format!(
        "Failed to read settings file at {}: {:?}",
        settings_path,
        std::io::Error::last_os_error()
    ));
    let mappings_raw = std::fs::read_to_string(&mappings_path).expect(&format!(
        "Failed to read mappings file at {}: {:?}",
        mappings_path,
        std::io::Error::last_os_error()
    ));
    let settings: HashMap<String, serde_json::Value> =
        serde_json::from_str(&settings_raw).expect(&format!(
            "Failed to parse settings file at {settings_path}: {:?}",
            std::io::Error::last_os_error()
        ));
    let mappings: HashMap<String, serde_json::Value> =
        serde_json::from_str(&mappings_raw).expect(&format!(
            "Failed to parse mappings file at {mappings_path}: {:?}",
            std::io::Error::last_os_error()
        ));

    let body = serde_json::json!({
        "settings": settings,
        "mappings": mappings,
    });

    // confirm creation
    if !args.skip_confirmation {
        println!(
            "CHECK: Create index '{}' with alias '{}' in region '{}' (remove previous alias: {})? (y to confirm)",
            index_fullname, index_alias, region, remove_previous_alias
        );
        let mut input = String::new();
        std::io::stdin().read_line(&mut input).unwrap();
        if input.trim() != "y" {
            return Err(anyhow::anyhow!("Aborted").into());
        }
    }

    // create index with settings and mappings
    let response = search_store
        .client
        .indices()
        .create(IndicesCreateParts::Index(index_fullname.as_str()))
        .body(body)
        .send()
        .await?;

    match response.status_code() {
        StatusCode::OK => println!("Index created: {}", index_fullname),
        _ => {
            let body = response.json::<serde_json::Value>().await?;
            eprintln!("{:?}", body);
            return Err(anyhow::anyhow!("Failed to create index").into());
        }
    }

    // create alias, and remove previous alias if needed
    let body = match remove_previous_alias {
        true => serde_json::json!({
            "actions": [
                { "add": { "index": index_fullname, "alias": index_alias, "is_write_index": true } },
                { "remove": { "index": index_previous_fullname, "alias": index_alias } }
            ]
        }),
        false => serde_json::json!({
            "actions": [
                { "add": { "index": index_fullname, "alias": index_alias, "is_write_index": true } },
                { "add": { "index": index_previous_fullname, "alias": index_alias, "is_write_index": false } }
            ]
        }),
    };

    search_store
        .client
        .indices()
        .update_aliases()
        .body(body)
        .send()
        .await?;

    match response.status_code() {
        StatusCode::OK => Ok(()),
        _ => {
            let body = response.json::<serde_json::Value>().await?;
            eprintln!("{:?}", body);
            Err(anyhow::anyhow!("Failed to create alias").into())
        }
    }
}
