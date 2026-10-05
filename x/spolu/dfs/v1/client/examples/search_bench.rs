//! Operator-only population and timed gRPC searches; output never includes credentials.
use ::dfs_client::BlockingClient;
use anyhow::{Context, Result, ensure};
use clap::{Parser, Subcommand};
use dfs_protocol::{
    credentials::{read_key, write_private},
    rpc::*,
};
use serde_json::json;
use std::{collections::BTreeMap, io::Write, path::PathBuf, time::Instant};

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
        workspace_output: PathBuf,
    },
    Query {
        #[arg(long)]
        input: PathBuf,
        #[arg(long, default_value_t = 10)]
        warm_runs: usize,
    },
}
fn main() -> Result<()> {
    let config = Config::parse();
    let client = BlockingClient::connect(&config.endpoint, &read_key(&config.key_file)?)?;
    match config.command {
        Command::Populate {
            corpus,
            workspace_output,
        } => {
            let workspace = client.create_workspace(CreateWorkspaceRequest {
                workspace_id: "search-benchmark".into(),
                root_grants: vec!["owner".into()],
            })?;
            write_private(&workspace_output, &serde_json::to_vec(&workspace)?)?;
            let manager = BlockingClient::connect(&config.endpoint, &workspace.workspace_key)?;
            let session = manager.create_session(CreateSessionRequest {
                workspace_id: workspace.workspace_id.clone(),
                grants: vec!["owner".into()],
            })?;
            let files = BlockingClient::connect(&config.endpoint, &session.session_key)?;
            let manifest: serde_json::Value =
                serde_json::from_slice(&std::fs::read(corpus.join("manifest.json"))?)?;
            let paths = manifest["paths"].as_array().context("paths")?;
            let root = files.stat(ObjectRequest {
                object_id: workspace.root_id.clone(),
            })?;
            let mut directories = BTreeMap::from([(PathBuf::new(), root)]);
            let start = Instant::now();
            for (index, path) in paths.iter().enumerate() {
                let path = PathBuf::from(path.as_str().context("path")?);
                let mut prefix = PathBuf::new();
                for component in path.parent().context("parent")?.components() {
                    let parent = directories
                        .get(&prefix)
                        .context("parent directory")?
                        .clone();
                    let name = component.as_os_str().to_str().context("name")?.to_owned();
                    let next = prefix.join(&name);
                    if !directories.contains_key(&next) {
                        let result = files.create(CreateRequest {
                            parent_id: parent.id,
                            expected_parent_version: parent.version,
                            name,
                            directory: true,
                            mode: 0o755,
                            ..Default::default()
                        })?;
                        directories.insert(
                            prefix.clone(),
                            result.related.first().context("parent")?.clone(),
                        );
                        directories.insert(next.clone(), result.object.context("directory")?);
                    }
                    prefix = next;
                }
                let parent = directories.get(&prefix).context("parent")?;
                let mut xattrs =
                    BTreeMap::from([("group".into(), (index % 10).to_string().into_bytes())]);
                if index == 7 {
                    xattrs.insert("binary".into(), vec![0, 255]);
                }
                let result = files.create(CreateRequest {
                    parent_id: parent.id.clone(),
                    expected_parent_version: parent.version,
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
                })?;
                directories.insert(prefix, result.related.first().context("parent")?.clone());
                let file = result.object.context("file")?;
                let bytes = std::fs::read(corpus.join("docs").join(path))?;
                ensure!(
                    bytes.len() <= dfs_protocol::MAX_IO,
                    "unexpected corpus file size"
                );
                let file = files
                    .write(WriteRequest {
                        object_id: file.id,
                        expected_version: file.version,
                        data: bytes,
                        ..Default::default()
                    })?
                    .object
                    .context("written")?;
                if index == 7 {
                    manager.update_grants(UpdateGrantsRequest {
                        workspace_id: workspace.workspace_id.clone(),
                        object_id: file.id,
                        expected_version: file.version,
                        changes: vec![GrantChange {
                            grant: "reader".into(),
                            attached: true,
                        }],
                    })?;
                }
            }
            let population_seconds = start.elapsed().as_secs_f64();
            let drain = Instant::now();
            loop {
                let status = manager.get_index_status(IndexStatusRequest {
                    workspace_id: workspace.workspace_id.clone(),
                })?;
                if status.pending == 0 && !status.backfilling && status.last_commit.is_some() {
                    break;
                }
                ensure!(drain.elapsed().as_secs() < 1800, "index drain timed out");
                std::thread::sleep(std::time::Duration::from_millis(500));
            }
            writeln!(
                std::io::stdout(),
                "{}",
                json!({"files": paths.len(), "population_seconds": population_seconds, "remaining_index_drain_seconds": drain.elapsed().as_secs_f64()})
            )?;
        }
        Command::Query { input, warm_runs } => {
            let request: SearchFilesRequest = serde_json::from_slice(&std::fs::read(input)?)?;
            let mut runs = Vec::new();
            for _ in 0..=warm_runs {
                let start = Instant::now();
                let result = client.search_files(request.clone())?;
                let elapsed_ms = start.elapsed().as_secs_f64() * 1000.;
                runs.push(json!({"ms": elapsed_ms, "partial": result.partial, "names": result.hits.iter().map(|h| &h.name).collect::<Vec<_>>()}));
            }
            writeln!(std::io::stdout(), "{}", serde_json::to_string(&runs)?)?;
        }
    }
    Ok(())
}
