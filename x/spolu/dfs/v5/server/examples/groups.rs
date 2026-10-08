//! Direct-gRPC topology diagnostic; each create+write group is one durable transaction.
use ::dfs_client::Client;
use anyhow::{Context, Result, ensure};
use clap::Parser;
use dfs_protocol::{credentials::read_key, rpc::*};
use futures::{StreamExt, TryStreamExt, stream};
use std::{collections::BTreeMap, path::PathBuf, time::Instant};

#[derive(Parser)]
struct Config {
    #[arg(long)]
    endpoint: String,
    #[arg(long)]
    key_file: PathBuf,
    #[arg(long)]
    parent: dfs_protocol::ObjectRef,
    #[arg(long, default_value_t = 2048)]
    files: usize,
    #[arg(long, default_value_t = 64)]
    directories: usize,
    #[arg(long, default_value_t = 4)]
    requests: usize,
}

/// @cc [owner:spolu,label:testing] durable-topology-diagnostic
/// Timing MUST include every independent group's durable response and exclude fixture creation and
/// content verification. Every file MUST be checked. This diagnostic MUST NOT be reported as untar.
#[tokio::main]
async fn main() -> Result<()> {
    let config = Config::parse();
    ensure!((1..=20000).contains(&config.files) && (1..=256).contains(&config.directories));
    ensure!((1..=16).contains(&config.requests));
    let client = Client::connect(&config.endpoint, &read_key(&config.key_file)?).await?;
    let mut parents = Vec::new();
    for index in 0..config.directories {
        let directory = client
            .create(CreateRequest {
                parent_id: config.parent,
                name: format!("group-{index}"),
                directory: true,
                mode: 0o755,
                ..Default::default()
            })
            .await?
            .object
            .context("directory")?;
        parents.push(directory.id);
    }
    let ids: Vec<_> = (0..config.files)
        .map(|_| dfs_protocol::ObjectRef::new_v4())
        .collect();
    let started = Instant::now();
    stream::iter((0..config.files).step_by(32))
        .map(|start| {
            let client = &client;
            let ids = &ids;
            let parents = &parents;
            async move {
                let mut expected = BTreeMap::new();
                let groups = (start..(start + 32).min(ids.len()))
                    .map(|index| {
                        expected.insert(index as u64 + 1, ids[index]);
                        MutationGroup {
                            id: index as u64 + 1,
                            edits: vec![
                                Edit {
                                    operation: Some(edit::Operation::Create(CreateRequest {
                                        parent_id: parents[index % parents.len()],
                                        name: format!("file-{index}"),
                                        object_id: ids[index],
                                        mode: 0o644,
                                        ..Default::default()
                                    })),
                                },
                                Edit {
                                    operation: Some(edit::Operation::Write(WriteRequest {
                                        object_id: ids[index],
                                        data: vec![index as u8; 16384],
                                        ..Default::default()
                                    })),
                                },
                            ],
                        }
                    })
                    .collect();
                let mut results = client.mutate_batch(MutateBatchRequest { groups }).await?;
                while let Some(result) = results.message().await? {
                    ensure!(result.error.is_none(), "group error: {:?}", result.error);
                    let id = expected
                        .remove(&result.id)
                        .context("unexpected group result")?;
                    let object = result
                        .mutation
                        .and_then(|m| m.object)
                        .context("committed object")?;
                    ensure!(object.id == id && object.size == 16384 && !object.revision.is_empty());
                }
                ensure!(expected.is_empty(), "missing durable responses");
                Ok::<_, anyhow::Error>(())
            }
        })
        .buffer_unordered(config.requests)
        .try_collect::<Vec<_>>()
        .await?;
    let elapsed_seconds = started.elapsed().as_secs_f64();
    stream::iter(ids.iter().enumerate())
        .map(|(index, id)| {
            let client = &client;
            async move {
                let result = client
                    .read(ReadRequest {
                        object_id: *id,
                        length: 16384,
                        ..Default::default()
                    })
                    .await?;
                ensure!(result.object.size == 16384 && result.data == vec![index as u8; 16384]);
                Ok::<_, anyhow::Error>(())
            }
        })
        .buffer_unordered(16)
        .try_collect::<Vec<_>>()
        .await?;
    println!(
        "{}",
        serde_json::json!({
            "files": config.files, "directories": config.directories, "requests": config.requests,
            "bytes_per_file": 16384, "elapsed_seconds": elapsed_seconds,
            "groups_per_second": config.files as f64 / elapsed_seconds, "verified": ids.len(),
        })
    );
    Ok(())
}
