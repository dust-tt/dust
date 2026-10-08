//! Operator-only real-gRPC search population, validation and timing without an index-status RPC.
use ::dfs_client::Client;
use anyhow::{Context, Result, ensure};
use clap::{Parser, Subcommand};
use dfs_protocol::{
    ObjectRef,
    credentials::{read_key, write_private},
    rpc::*,
};
use futures::{StreamExt, TryStreamExt, stream};
use serde_json::json;
use std::{
    collections::BTreeMap,
    path::PathBuf,
    time::{Duration, Instant},
};

#[derive(Parser)]
struct Config {
    #[arg(long)]
    endpoint: String,
    #[arg(long)]
    key_file: PathBuf,
    #[command(subcommand)]
    command: Command,
}
#[derive(Subcommand)]
enum Command {
    Populate {
        #[arg(long)]
        corpus: PathBuf,
        #[arg(long)]
        tenant_output: PathBuf,
    },
    Query {
        #[arg(long)]
        input: PathBuf,
        #[arg(long, default_value_t = 20)]
        warm_runs: usize,
    },
    WaitIndex {
        #[command(flatten)]
        storage: dfs_server_v5::storage::StorageConfig,
        #[arg(long)]
        tenant: String,
        #[arg(long)]
        expected_objects: u64,
        #[arg(long, env = "DFS_ES_URL")]
        es_url: String,
        #[arg(long, env = "DFS_ES_INDEX")]
        es_index: String,
    },
}
fn main() -> Result<()> {
    dfs_server_v5::network::run(run())
}

async fn run() -> Result<()> {
    let config = Config::parse();
    let client = Client::connect(&config.endpoint, &read_key(&config.key_file)?).await?;
    match config.command {
        Command::Populate {
            corpus,
            tenant_output,
        } => {
            let tenant = client
                .create_tenant(CreateTenantRequest {
                    tenant_id: "search-benchmark".into(),
                    root_grants: vec!["owner".into()],
                })
                .await?;
            write_private(&tenant_output, &serde_json::to_vec(&tenant)?)?;
            let manager = Client::connect(&config.endpoint, &tenant.tenant_key).await?;
            let session = manager
                .create_session(CreateSessionRequest {
                    tenant_id: tenant.tenant_id.clone(),
                    grants: vec!["owner".into()],
                })
                .await?;
            let files = Client::connect(&config.endpoint, &session.session_key).await?;
            let manifest: serde_json::Value =
                serde_json::from_slice(&std::fs::read(corpus.join("manifest.json"))?)?;
            let paths: Vec<PathBuf> = manifest["paths"]
                .as_array()
                .context("paths")?
                .iter()
                .map(|p| Ok(PathBuf::from(p.as_str().context("path")?)))
                .collect::<Result<_>>()?;
            let mut directories = BTreeMap::from([(PathBuf::new(), tenant.root_id)]);
            let started = Instant::now();
            for path in &paths {
                let mut prefix = PathBuf::new();
                for component in path.parent().context("parent")?.components() {
                    let parent = *directories.get(&prefix).context("parent")?;
                    let name = component.as_os_str().to_str().context("name")?.to_owned();
                    let next = prefix.join(&name);
                    if !directories.contains_key(&next) {
                        let object = files
                            .create(CreateRequest {
                                parent_id: parent,
                                name,
                                directory: true,
                                mode: 0o755,
                                ..Default::default()
                            })
                            .await?
                            .object
                            .context("directory")?;
                        directories.insert(next.clone(), object.id);
                    }
                    prefix = next;
                }
            }
            let ids: Vec<_> = paths.iter().map(|_| ObjectRef::new_v4()).collect();
            stream::iter((0..paths.len()).step_by(32))
                .map(|start| {
                    let paths = &paths;
                    let directories = &directories;
                    let ids = &ids;
                    let files = &files;
                    let corpus = &corpus;
                    async move {
                        let mut groups = Vec::new();
                        for i in start..(start + 32).min(paths.len()) {
                            let path = &paths[i];
                            let mut xattrs = BTreeMap::from([(
                                "group".into(),
                                (i % 10).to_string().into_bytes(),
                            )]);
                            if i == 7 {
                                xattrs.insert("binary".into(), vec![0, 255]);
                            }
                            groups.push(MutationGroup {
                                id: i as u64 + 1,
                                edits: vec![
                                    Edit {
                                        operation: Some(edit::Operation::Create(CreateRequest {
                                            object_id: ids[i],
                                            parent_id: *directories
                                                .get(path.parent().context("parent")?)
                                                .context("directory")?,
                                            name: path
                                                .file_name()
                                                .context("name")?
                                                .to_str()
                                                .context("name")?
                                                .into(),
                                            mime_type: Some("text/plain".into()),
                                            mode: 0o644,
                                            xattrs,
                                            ..Default::default()
                                        })),
                                    },
                                    Edit {
                                        operation: Some(edit::Operation::Write(WriteRequest {
                                            object_id: ids[i],
                                            data: std::fs::read(corpus.join("docs").join(path))?,
                                            ..Default::default()
                                        })),
                                    },
                                ],
                            });
                        }
                        let expected = groups.len();
                        let mut count = 0;
                        let mut results = files.mutate_batch(MutateBatchRequest { groups }).await?;
                        while let Some(result) = results.message().await? {
                            ensure!(
                                result.error.is_none() && result.mutation.is_some(),
                                "mutation failed: {:?}",
                                result.error
                            );
                            count += 1;
                        }
                        ensure!(count == expected, "missing mutation results");
                        Ok::<_, anyhow::Error>(())
                    }
                })
                .buffer_unordered(4)
                .try_collect::<Vec<_>>()
                .await?;
            manager
                .update_grants(UpdateGrantsRequest {
                    tenant_id: tenant.tenant_id,
                    object_id: ids[7],
                    changes: vec![GrantChange {
                        grant: "reader".into(),
                        attached: true,
                    }],
                })
                .await?;
            println!(
                "{}",
                json!({"files": paths.len(), "directories": directories.len()-1,
                "population_seconds": started.elapsed().as_secs_f64(), "directory_ids": directories.iter().map(|(p,id)| (p.to_string_lossy().into_owned(), *id)).collect::<BTreeMap<_,_>>() })
            );
        }
        Command::Query { input, warm_runs } => {
            let query: SearchRequest = serde_json::from_slice(&std::fs::read(input)?)?;
            let mut samples = Vec::new();
            for _ in 0..=warm_runs {
                let started = Instant::now();
                let response = client.search(query.clone()).await?;
                samples.push(
                    json!({"ms": started.elapsed().as_secs_f64()*1000., "partial": response.partial,
                    "names": response.hits.iter().map(|h| &h.name).collect::<Vec<_>>(),
                    "directories": response.hits.iter().filter(|h| h.object.directory).count()}),
                );
            }
            println!("{}", json!(samples));
        }
        Command::WaitIndex {
            storage,
            tenant,
            expected_objects,
            es_url,
            es_index,
        } => {
            let storage = dfs_server_v5::storage::Storage::open(&storage).await?;
            let keys = dfs_core::keys::Keys::new(&tenant)?;
            let started = Instant::now();
            let http = reqwest::Client::builder()
                .timeout(Duration::from_secs(10))
                .build()?;
            loop {
                let pending = storage
                    .snapshot()
                    .await?
                    .range(
                        &keys.search_pending(),
                        &dfs_core::keys::prefix_end(&keys.search_pending()),
                        1,
                    )
                    .await?
                    .0
                    .len();
                let response: serde_json::Value = http.post(format!("{}/{}/_count", es_url.trim_end_matches('/'), es_index))
                    .json(&json!({"query": {"bool": {"filter": [{"term": {"workspace": tenant}}, {"term": {"deleted": false}}]}}}))
                    .send().await?.json().await?;
                if pending == 0 && response["count"].as_u64() == Some(expected_objects) {
                    break;
                }
                ensure!(started.elapsed().as_secs() < 1800, "index drain timed out");
                tokio::time::sleep(Duration::from_millis(500)).await;
            }
            println!(
                "{}",
                json!({"remaining_index_drain_seconds": started.elapsed().as_secs_f64(), "indexed_objects": expected_objects})
            );
        }
    }
    Ok(())
}
