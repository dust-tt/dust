use anyhow::{anyhow, Result};
use base64::prelude::BASE64_STANDARD_NO_PAD;
use base64::Engine;
use clap::Parser;
use dust::stores::{postgres, store};
use dust::utils;
use futures::future::try_join_all;
use lazy_static::lazy_static;
use regex::Regex;

#[derive(Parser, Debug)]
struct Args {
    #[arg(long, default_value = "false")]
    execute: bool,

    #[arg(long, default_value = "1000")]
    batch_size: i64,

    #[arg(long)]
    data_source: Option<i64>,
}

#[derive(Clone, Copy, Debug)]
enum NodeType {
    Document,
    Table,
}

lazy_static! {
    static ref DOC_MIME_TYPES_MATCH: Vec<(fn(&str) -> bool, &'static str)> = vec![
        // Confluence
        ((|s: &str| s.starts_with("confluence-page-")), "application/vnd.dust.confluence.page"),
        // Github
        ((|s: &str| s.starts_with("github-issue-")), "application/vnd.dust.github.issue"),
        ((|s: &str| s.starts_with("github-discussion-")), "application/vnd.dust.github.discussion"),
        ((|s: &str| s.starts_with("github-code-")), "application/vnd.dust.github.code.file"),
        // Intercom
        ((|s: &str| s.starts_with("intercom-conversation-")), "application/vnd.dust.intercom.conversation"),
        ((|s: &str| s.starts_with("intercom-article-")), "application/vnd.dust.intercom.article"),
        // Notion
        ((|s: &str| s.starts_with("notion-database-")), "application/vnd.dust.notion.database"),
        ((|s: &str| s.starts_with("notion-")), "application/vnd.dust.notion.page"),
        // Slack
        ((|s: &str| Regex::new(r"^slack-[A-Z0-9]+-thread-[0-9.-]+$").unwrap().is_match(s)), "text/vnd.dust.slack.thread"),
        ((|s: &str| Regex::new(r"^slack-[A-Z0-9]+-messages-[0-9.-]+$").unwrap().is_match(s)), "text/vnd.dust.slack.thread"),
        // Webcrawler
        ((|s: &str| Regex::new(r"[a-f0-9]{64}").unwrap().is_match(s)), "text/html"),
        // Zendesk
        ((|s: &str| s.starts_with("zendesk-article-")), "application/vnd.dust.zendesk.article"),
        ((|s: &str| s.starts_with("zendesk-ticket-")), "application/vnd.dust.zendesk.ticket"),
        // Folders
        ((|s: &str| s.to_lowercase().ends_with(".pdf")), "application/pdf"),
        ((|s: &str| s.to_lowercase().ends_with(".doc") || s.ends_with(".docx")), "application/msword"),
        ((|s: &str| s.to_lowercase().ends_with(".csv")), "text/csv"),
        ((|s: &str| s.to_lowercase().ends_with(".tsv")), "text/tsv"),
        ((|s: &str| s.to_lowercase().ends_with(".txt")), "text/plain"),
        ((|s: &str| s.to_lowercase().ends_with(".md") || s.ends_with(".markdown")), "text/markdown"),
        ((|s: &str| s.to_lowercase().ends_with(".jpg") || s.ends_with(".jpeg")), "image/jpeg"),
        ((|s: &str| s.to_lowercase().ends_with(".png")), "image/png"),
    ];

    static ref TABLE_MIME_TYPES_MATCH: Vec<(fn(&str) -> bool, &'static str)> = vec!(
        // Google Drive
        ((|s: &str| s.starts_with("google-spreadsheet-")), "application/vnd.google-apps.spreadsheet"),
        ((|s: &str| s.starts_with("gdrive-")), "text/csv"),
        // Microsoft
        ((|s: &str| match Regex::new(r"^microsoft-(.+)$").unwrap().captures(s) {
            Some(caps) => {
                String::from_utf8(BASE64_STANDARD_NO_PAD.decode(caps.get(1).unwrap().as_str()).unwrap()).unwrap().starts_with("worksheet")
            }
            None => false,
        }), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        ((|s: &str| match Regex::new(r"^microsoft-(.+)$").unwrap().captures(s) {
            Some(caps) => {
                !String::from_utf8(BASE64_STANDARD_NO_PAD.decode(caps.get(1).unwrap().as_str()).unwrap()).unwrap().starts_with("worksheet")
            }
            None => false,
        }), "text/csv"),
        // Notion
        ((|s: &str| s.starts_with("notion-")), "application/vnd.dust.notion.database"),
        // Snowflake
        ((|s: &str| Regex::new(r"^[A-Z0-9_]+\.[A-Z0-9_]+\.[A-Z0-9_]+$").unwrap().is_match(s)), "application/vnd.snowflake.table"),
    );
}

fn extract_tag(tags: &Vec<String>, key: &str) -> Option<String> {
    tags.iter()
        .find(|tag| tag.starts_with(key))
        .map(|tag| tag.split(":").nth(1).unwrap().to_string())
}

fn guess_mime_type(node_string_id: &str, node_type: NodeType) -> String {
    match node_type {
        NodeType::Document => DOC_MIME_TYPES_MATCH
            .iter()
            .find(|(test, _)| test(node_string_id))
            .map(|(_, mime_type)| mime_type)
            .unwrap_or(&"application/octet-stream")
            .to_string(),
        NodeType::Table => TABLE_MIME_TYPES_MATCH
            .iter()
            .find(|(test, _)| test(node_string_id))
            .map(|(_, mime_type)| mime_type)
            .unwrap_or(&"text/csv")
            .to_string(),
    }
}

async fn create_nodes(
    pool: &bb8::Pool<bb8_postgres::PostgresConnectionManager<tokio_postgres::NoTls>>,
    created: i64,
    data_source: i64,
    timestamp: i64,
    node_string_id: String,
    title: String,
    mime_type: String,
    parents: Vec<String>,
    node_id: i64,
    node_type: NodeType,
) -> Result<()> {
    let c = pool.get().await?;

    let insert_stmt = c
        .prepare(
            "INSERT INTO data_sources_nodes \
       (id, created, data_source, timestamp, node_id, title, mime_type, parents, document, \"table\") \
       VALUES (DEFAULT, $1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT DO NOTHING",
        )
        .await?;

    let (document_id, table_id) = match node_type {
        NodeType::Document => (Some(node_id), None),
        NodeType::Table => (None, Some(node_id)),
    };

    c.execute(
        &insert_stmt,
        &[
            &created,
            &data_source,
            &timestamp,
            &node_string_id,
            &title,
            &mime_type,
            &parents,
            &document_id,
            &table_id,
        ],
    )
    .await?;

    Ok(())
}

async fn process_batch(
    data: Vec<(i64, i64, String, i64, String, String, Vec<String>)>,
    execute: bool,
    pool: &bb8::Pool<bb8_postgres::PostgresConnectionManager<tokio_postgres::NoTls>>,
    node_type: NodeType,
) -> Result<bool> {
    println!("Creating {} nodes", data.len());

    if !execute {
        data.into_iter().for_each(
            |(id, data_source, node_id, timestamp, title, mime_type, _parents)| {
                println!(
                    "INSERT {:?} \n ds={} \n ts={} \n id={} \n title={} \n mimeType={} \n id={}",
                    node_type, &data_source, &timestamp, &node_id, title, mime_type, id
                );
            },
        );
        return Ok(false);
    }

    let created = utils::now() as i64;

    try_join_all(data.into_iter().map(
        |(id, data_source, node_id, timestamp, title, mime_type, parents)| async move {
            create_nodes(
                &pool,
                created,
                data_source,
                timestamp,
                node_id,
                title,
                mime_type,
                parents,
                id,
                node_type,
            )
            .await
        },
    ))
    .await?;

    Ok(true)
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();
    let execute = args.execute;
    let batch_size = args.batch_size;
    let data_source = args.data_source;

    let store: Box<dyn store::Store + Sync + Send> = match std::env::var("CORE_DATABASE_URI") {
        Ok(db_uri) => {
            let store = postgres::PostgresStore::new(&db_uri).await?;
            store.init().await?;
            Box::new(store)
        }
        Err(_) => Err(anyhow!("CORE_DATABASE_URI is required (postgres)"))?,
    };

    loop {
        println!("Getting data_sources_documents batch");

        let pool: &bb8::Pool<bb8_postgres::PostgresConnectionManager<tokio_postgres::NoTls>> =
            store.raw_pool();

        let c = pool.get().await?;

        let dsdocs_rows = match data_source {
            Some(data_source) =>
                c.query(
                    "SELECT dsd.id,dsd.data_source,dsd.document_id,dsd.timestamp,dsd.tags_array,dsd.parents \
                    FROM data_sources_documents dsd LEFT OUTER JOIN data_sources_nodes dsn on dsn.document=dsd.id \
                    WHERE dsn.id IS NULL AND dsd.data_source=$1 AND dsd.status='latest' LIMIT $2",
                    &[&data_source,&batch_size],
                )
                .await?,
            None =>
                c.query(
                    "SELECT dsd.id,dsd.data_source,dsd.document_id,dsd.timestamp,dsd.tags_array,dsd.parents \
                    FROM data_sources_documents dsd LEFT OUTER JOIN data_sources_nodes dsn on dsn.document=dsd.id \
                    WHERE dsn.id IS NULL AND dsd.status='latest' LIMIT $1",
                    &[&batch_size],
                )
                .await?
        };

        if dsdocs_rows.len() == 0 {
            break;
        }

        let data = dsdocs_rows
            .into_iter()
            .map(|row| {
                let id = row.get::<_, i64>(0);
                let data_source = row.get::<_, i64>(1);
                let node_id = row.get::<_, String>(2);
                let timestamp = row.get::<_, i64>(3);
                let tags = row.get::<_, Vec<String>>(4);
                let title = extract_tag(&tags, "title").unwrap_or(node_id.clone());
                let mime_type = extract_tag(&tags, "mimeType")
                    .unwrap_or(guess_mime_type(&node_id, NodeType::Document));
                let parents = row.get::<_, Vec<String>>(5);
                (
                    id,
                    data_source,
                    node_id,
                    timestamp,
                    title,
                    mime_type,
                    parents,
                )
            })
            .collect();

        if !process_batch(data, execute, &pool, NodeType::Document).await? {
            break;
        }
    }

    loop {
        println!("Getting tables batch");

        let pool: &bb8::Pool<bb8_postgres::PostgresConnectionManager<tokio_postgres::NoTls>> =
            store.raw_pool();

        let c = pool.get().await?;

        let table_rows = match data_source {
            Some(data_source) => {
                c.query(
                    "SELECT t.id,t.data_source,t.table_id,t.timestamp,t.name,t.parents \
                    FROM tables t LEFT OUTER JOIN data_sources_nodes dsn on dsn.\"table\"=t.id \
                    WHERE dsn.id IS NULL AND t.data_source=$1 LIMIT $2",
                    &[&data_source, &batch_size],
                )
                .await?
            }
            None => {
                c.query(
                    "SELECT t.id,t.data_source,t.table_id,t.timestamp,t.name,t.parents \
                    FROM tables t LEFT OUTER JOIN data_sources_nodes dsn on dsn.\"table\"=t.id \
                    WHERE dsn.id IS NULL LIMIT $1",
                    &[&batch_size],
                )
                .await?
            }
        };

        if table_rows.len() == 0 {
            break;
        }

        let data = table_rows
            .into_iter()
            .map(|row| {
                let id = row.get::<_, i64>(0);
                let data_source = row.get::<_, i64>(1);
                let node_id = row.get::<_, String>(2);
                let timestamp = row.get::<_, i64>(3);
                let title = row.get::<_, String>(4);
                let mime_type = guess_mime_type(&node_id, NodeType::Table);
                let parents = row.get::<_, Vec<String>>(5);
                (
                    id,
                    data_source,
                    node_id,
                    timestamp,
                    title,
                    mime_type,
                    parents,
                )
            })
            .collect();

        if !process_batch(data, execute, &pool, NodeType::Table).await? {
            break;
        }
    }

    Ok(())
}
