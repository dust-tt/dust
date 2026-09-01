use std::collections::{HashMap, HashSet};

use anyhow::{anyhow, Result};
use clap::Parser;
use dust::stores::{postgres, store};

/*
 * Diagnostic for orphaned relational rows: `tables`, `data_sources_folders` and (latest)
 * `data_sources_documents` rows that have no matching `data_sources_nodes` row.
 *
 * Why this matters:
 *   - Tables / folders: `DataSource::delete` enumerates them through `data_sources_nodes`, so a
 *     node-less row is never deleted and the final `DELETE FROM data_sources` fails on
 *     `tables_data_source_fkey` / `data_sources_folders_data_source_fkey`. These orphans BLOCK
 *     deletion.
 *   - Documents: `delete_data_source` sweeps every `data_sources_documents` row by `data_source`
 *     at the end, so document orphans do NOT block deletion. A `status = 'latest'` document with
 *     no node is still an integrity/search-index inconsistency worth surfacing. Superseded and
 *     deleted document rows legitimately have no node and are excluded.
 *
 * Read-only. Scans in bounded id windows so no single statement touches more than `--batch-size`
 * rows; the node lookup uses the FK indices on `data_sources_nodes("table")` / `(folder)` /
 * `(document)`.
 *
 * Usage:
 *   cargo run --bin find_orphan_relational_rows -- [--batch-size 5000] [--data-source <row_id>]
 */

#[derive(Parser, Debug)]
struct Args {
    #[arg(long, default_value = "5000")]
    batch_size: i64,

    #[arg(long, help = "Restrict the scan to a single data_sources.id")]
    data_source: Option<i64>,
}

struct ScanConfig {
    /// Relational table to scan.
    table_name: &'static str,
    /// String identifier column on that table (for reporting).
    string_id_column: &'static str,
    /// Column on `data_sources_nodes` that references this table's primary key.
    node_column: &'static str,
    /// Extra window filter (e.g. only `status = 'latest'` documents are expected to have a node).
    row_filter: Option<&'static str>,
    /// Whether these orphans block full data source deletion (documents do not).
    blocks_deletion: bool,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();

    let store: Box<dyn store::Store + Sync + Send> = match std::env::var("CORE_DATABASE_URI") {
        Ok(db_uri) => {
            let store = postgres::PostgresStore::new(&db_uri).await?;
            store.init().await?;
            Box::new(store)
        }
        Err(_) => Err(anyhow!("CORE_DATABASE_URI is required (postgres)"))?,
    };

    let configs = [
        ScanConfig {
            table_name: "tables",
            string_id_column: "table_id",
            node_column: "\"table\"",
            row_filter: None,
            blocks_deletion: true,
        },
        ScanConfig {
            table_name: "data_sources_folders",
            string_id_column: "folder_id",
            node_column: "folder",
            row_filter: None,
            blocks_deletion: true,
        },
        ScanConfig {
            table_name: "data_sources_documents",
            string_id_column: "document_id",
            node_column: "document",
            row_filter: Some("status = 'latest'"),
            blocks_deletion: false,
        },
    ];

    // data_source row id -> per-table orphan counts, keyed by table_name.
    let mut per_data_source: HashMap<i64, HashMap<&'static str, u64>> = HashMap::new();
    let mut totals: HashMap<&'static str, u64> = HashMap::new();

    for config in &configs {
        println!(
            "Scanning {} for orphans (batch_size={}, data_source={:?})",
            config.table_name, args.batch_size, args.data_source
        );
        let orphans =
            scan_orphans(store.as_ref(), config, args.batch_size, args.data_source).await?;
        totals.insert(config.table_name, orphans.len() as u64);
        for (data_source_row_id, _string_id) in &orphans {
            *per_data_source
                .entry(*data_source_row_id)
                .or_default()
                .entry(config.table_name)
                .or_default() += 1;
        }
    }

    // Resolve affected data sources for a readable report.
    let affected_ids: Vec<i64> = per_data_source.keys().copied().collect();
    let ds_labels = resolve_data_sources(store.as_ref(), &affected_ids).await?;

    println!("\n==== ORPHAN RELATIONAL ROWS REPORT ====");
    for config in &configs {
        println!(
            "Orphan {:<22} {:>8}  ({})",
            config.table_name,
            totals.get(config.table_name).copied().unwrap_or(0),
            if config.blocks_deletion {
                "blocks deletion"
            } else {
                "does NOT block deletion"
            }
        );
    }
    println!("Affected data sources: {}", per_data_source.len());

    let mut rows: Vec<(i64, u64)> = per_data_source
        .iter()
        .map(|(id, counts)| (*id, counts.values().sum()))
        .collect();
    // Sort by total orphans desc, then by row id for stable output.
    rows.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));

    for (data_source_row_id, _total) in rows {
        let label = ds_labels
            .get(&data_source_row_id)
            .cloned()
            .unwrap_or_else(|| "<unknown data_source>".to_string());
        let counts = &per_data_source[&data_source_row_id];
        let detail: Vec<String> = configs
            .iter()
            .map(|config| {
                format!(
                    "{}={}",
                    config.table_name,
                    counts.get(config.table_name).copied().unwrap_or(0)
                )
            })
            .collect();
        println!(
            "  data_source_row_id={} {} -> {}",
            data_source_row_id,
            label,
            detail.join(" ")
        );
    }
    println!("=======================================");

    Ok(())
}

/// Keyset-scan a relational table by id in bounded windows; return (data_source row id, string id)
/// for every row (matching `config.row_filter`) whose primary key is not referenced by any
/// `data_sources_nodes.<node_column>`.
async fn scan_orphans(
    store: &(dyn store::Store + Sync + Send),
    config: &ScanConfig,
    batch_size: i64,
    data_source: Option<i64>,
) -> Result<Vec<(i64, String)>> {
    let mut orphans: Vec<(i64, String)> = Vec::new();
    let mut last_processed_id: i64 = 0;
    let mut scanned: u64 = 0;

    // Build the window WHERE clause once. Params are always ($1 = last id, $2 = batch size), plus
    // ($3 = data_source) when scoping to a single data source.
    let mut where_clauses = vec!["id > $1".to_string()];
    if data_source.is_some() {
        where_clauses.push("data_source = $3".to_string());
    }
    if let Some(filter) = config.row_filter {
        where_clauses.push(filter.to_string());
    }
    let window_sql = format!(
        "SELECT id, data_source, {string_id} FROM {table} \
           WHERE {where_clause} ORDER BY id ASC LIMIT $2",
        string_id = config.string_id_column,
        table = config.table_name,
        where_clause = where_clauses.join(" AND "),
    );

    let present_sql = format!(
        "SELECT DISTINCT {col} FROM data_sources_nodes WHERE {col} = ANY($1)",
        col = config.node_column,
    );

    loop {
        let pool = store.raw_pool();
        let c = pool.get().await?;

        let window_rows = match data_source {
            Some(ds) => {
                c.query(&window_sql, &[&last_processed_id, &batch_size, &ds])
                    .await?
            }
            None => {
                c.query(&window_sql, &[&last_processed_id, &batch_size])
                    .await?
            }
        };

        if window_rows.is_empty() {
            break;
        }

        // Advance the cursor past this whole window regardless of how many rows are orphans.
        last_processed_id = window_rows[window_rows.len() - 1].get(0);
        scanned += window_rows.len() as u64;

        let ids: Vec<i64> = window_rows.iter().map(|r| r.get(0)).collect();

        // Which of these primary keys are referenced by a node? Uses the FK index on
        // data_sources_nodes(<node_column>).
        let present_rows = c.query(&present_sql, &[&ids]).await?;
        let present: HashSet<i64> = present_rows.iter().map(|r| r.get(0)).collect();

        for row in &window_rows {
            let id: i64 = row.get(0);
            if !present.contains(&id) {
                let data_source_row_id: i64 = row.get(1);
                let string_id: String = row.get(2);
                orphans.push((data_source_row_id, string_id));
            }
        }

        println!(
            "  {}: scanned={} orphans_so_far={} (last_id={})",
            config.table_name,
            scanned,
            orphans.len(),
            last_processed_id
        );
    }

    Ok(orphans)
}

/// Resolve data_sources.id -> "project=<p> data_source_id=<sid>" for reporting.
async fn resolve_data_sources(
    store: &(dyn store::Store + Sync + Send),
    ids: &[i64],
) -> Result<HashMap<i64, String>> {
    if ids.is_empty() {
        return Ok(HashMap::new());
    }

    let pool = store.raw_pool();
    let c = pool.get().await?;
    let rows = c
        .query(
            "SELECT id, project, data_source_id FROM data_sources WHERE id = ANY($1)",
            &[&ids],
        )
        .await?;

    Ok(rows
        .into_iter()
        .map(|row| {
            let id: i64 = row.get(0);
            let project: i64 = row.get(1);
            let data_source_id: String = row.get(2);
            (
                id,
                format!("project={} data_source_id={}", project, data_source_id),
            )
        })
        .collect())
}
