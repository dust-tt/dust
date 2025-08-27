use anyhow::Result;
use clap::Parser;
use dust::search_stores::search_store::ElasticsearchSearchStore;
use elasticsearch::{ClearScrollParts, ScrollParts, SearchParts};
use serde_json::{json, Value};
use std::fs::File;
use std::io::{BufWriter, Write};

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    #[arg(long, help = "Data source ID to filter by")]
    data_source_id: Option<String>,

    #[arg(
        long,
        help = "Fields to export (comma-separated, e.g. 'node_id,title,timestamp')"
    )]
    fields: String,

    #[arg(
        long,
        help = "Filter by parent IDs (comma-separated list). Nodes must have at least one of these in their parents array"
    )]
    parent_filter: Option<String>,

    #[arg(long, help = "Output file path", default_value = "export.txt")]
    output: String,

    #[arg(long, help = "Batch size for scrolling", default_value = "1000")]
    batch_size: u64,

    #[arg(long, help = "Index version to query", default_value = "4")]
    index_version: u32,

    #[arg(
        long,
        help = "Output format: 'json' for full objects, 'values' for just field values",
        default_value = "values"
    )]
    format: String,

    #[arg(long, help = "Delimiter for values format", default_value = "\t")]
    delimiter: String,
}

/*
 * Flexible export script for Elasticsearch nodes
 *
 * Usage:
 * cargo run --bin elasticsearch_export_nodes -- \
 *   --data-source-id "my_data_source" \
 *   --fields "node_id,title" \
 *   --output "nodes.txt"
 *
 * Or with parent filter:
 * cargo run --bin elasticsearch_export_nodes -- \
 *   --data-source-id "my_data_source" \
 *   --fields "node_id,title,timestamp" \
 *   --parent-filter "parent1,parent2" \
 *   --format json \
 *   --output "filtered_nodes.json"
 */
#[tokio::main]
async fn main() {
    if let Err(e) = run().await {
        eprintln!("Error: {}", e);
        std::process::exit(1);
    }
}

async fn run() -> Result<()> {
    let args = Args::parse();

    // Parse fields
    let fields: Vec<String> = args
        .fields
        .split(',')
        .map(|s| s.trim().to_string())
        .collect();

    // Parse parent filter if provided
    let parent_ids: Option<Vec<String>> = args
        .parent_filter
        .as_ref()
        .map(|p| p.split(',').map(|s| s.trim().to_string()).collect());

    // Get Elasticsearch credentials from environment
    let url = std::env::var("ELASTICSEARCH_URL").expect("ELASTICSEARCH_URL must be set");
    let username =
        std::env::var("ELASTICSEARCH_USERNAME").expect("ELASTICSEARCH_USERNAME must be set");
    let password =
        std::env::var("ELASTICSEARCH_PASSWORD").expect("ELASTICSEARCH_PASSWORD must be set");

    // Create ES client
    let search_store = ElasticsearchSearchStore::new(&url, &username, &password).await?;

    let index_name = format!("core.data_sources_nodes_{}", args.index_version);
    println!("Querying index: {}", index_name);

    // Build the query
    let mut must_clauses = vec![];

    // Add data_source_id filter if provided
    if let Some(ref data_source_id) = args.data_source_id {
        must_clauses.push(json!({
            "term": { "data_source_id": data_source_id }
        }));
        println!("Filtering by data_source_id: {}", data_source_id);
    }

    // Add parent filter if provided
    if let Some(ref parent_ids) = parent_ids {
        must_clauses.push(json!({
            "terms": { "parents": parent_ids }
        }));
        println!("Filtering by parent IDs: {:?}", parent_ids);
    }

    // Build the final query
    let query = if must_clauses.is_empty() {
        json!({ "match_all": {} })
    } else if must_clauses.len() == 1 {
        must_clauses
            .into_iter()
            .next()
            .ok_or_else(|| anyhow::anyhow!("Expected at least one clause"))?
    } else {
        json!({
            "bool": {
                "must": must_clauses
            }
        })
    };

    println!("Fields to export: {:?}", fields);
    println!("Output file: {}", args.output);
    println!("Output format: {}", args.format);

    // Create output file
    let file = File::create(&args.output)?;
    let mut writer = BufWriter::new(file);

    // If format is values and we're outputting multiple fields, write header
    if args.format == "values" && fields.len() > 1 {
        writeln!(&mut writer, "{}", fields.join(&args.delimiter))?;
    }

    // Initial search with scroll
    let response = search_store
        .client
        .search(SearchParts::Index(&[&index_name]))
        .scroll("2m")
        .body(json!({
            "size": args.batch_size,
            "query": query.clone(),
            "_source": fields.clone()
        }))
        .send()
        .await?;

    let response_body = response.json::<Value>().await?;
    let total = response_body["hits"]["total"]["value"]
        .as_u64()
        .unwrap_or(0);
    println!("Total documents to export: {}", total);

    let mut processed = 0u64;

    // Process first batch
    if let Some(hits) = response_body["hits"]["hits"].as_array() {
        processed += process_hits(&mut writer, hits, &fields, &args)?;
        if processed % 100 == 0 || processed == total {
            println!("Processed {}/{} documents", processed, total);
        }
    }

    // Get scroll ID
    let scroll_id = response_body["_scroll_id"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("No scroll ID in response"))?;

    // Continue scrolling
    let mut current_scroll_id = scroll_id.to_string();

    while processed < total {
        let scroll_response = search_store
            .client
            .scroll(ScrollParts::None)
            .body(json!({
                "scroll": "2m",
                "scroll_id": current_scroll_id
            }))
            .send()
            .await?;

        let scroll_body = scroll_response.json::<Value>().await?;

        if let Some(hits) = scroll_body["hits"]["hits"].as_array() {
            if hits.is_empty() {
                break;
            }
            processed += process_hits(&mut writer, hits, &fields, &args)?;
            println!("Processed {}/{} documents", processed, total);
        }

        // Update scroll ID if it changed
        if let Some(new_scroll_id) = scroll_body["_scroll_id"].as_str() {
            current_scroll_id = new_scroll_id.to_string();
        }
    }

    // Clear scroll context
    let _ = search_store
        .client
        .clear_scroll(ClearScrollParts::None)
        .body(json!({
            "scroll_id": current_scroll_id
        }))
        .send()
        .await;

    writer.flush()?;
    println!(
        "Export complete! {} documents written to {}",
        processed, args.output
    );

    Ok(())
}

fn process_hits(
    writer: &mut BufWriter<File>,
    hits: &[Value],
    fields: &[String],
    args: &Args,
) -> Result<u64> {
    let mut count = 0u64;

    for hit in hits {
        if let Some(source) = hit.get("_source") {
            if args.format == "json" {
                // Output full JSON object
                writeln!(writer, "{}", serde_json::to_string(source)?)?;
            } else {
                // Output values only
                let mut values = vec![];
                for field in fields {
                    // Handle nested fields (e.g., "title.keyword")
                    let field_parts: Vec<&str> = field.split('.').collect();
                    let mut current = source;
                    let mut found = true;

                    for part in field_parts {
                        if let Some(next) = current.get(part) {
                            current = next;
                        } else {
                            found = false;
                            break;
                        }
                    }

                    if found {
                        let value = match current {
                            Value::String(s) => s.clone(),
                            Value::Number(n) => n.to_string(),
                            Value::Bool(b) => b.to_string(),
                            Value::Array(arr) => {
                                // For arrays, join with commas
                                arr.iter()
                                    .filter_map(|v| match v {
                                        Value::String(s) => Some(s.clone()),
                                        Value::Number(n) => Some(n.to_string()),
                                        _ => None,
                                    })
                                    .collect::<Vec<_>>()
                                    .join(",")
                            }
                            _ => "null".to_string(),
                        };
                        values.push(value);
                    } else {
                        values.push("null".to_string());
                    }
                }

                if fields.len() == 1 {
                    // Single field: output one value per line
                    writeln!(writer, "{}", values[0])?;
                } else {
                    // Multiple fields: use delimiter
                    writeln!(writer, "{}", values.join(&args.delimiter))?;
                }
            }
            count += 1;
        }
    }

    Ok(count)
}
